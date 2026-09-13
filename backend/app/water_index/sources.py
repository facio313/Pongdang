"""Reviewed source mappings and authority attestations for offline ingestion.

There is no public import endpoint. A trusted operator supplies signed-off records
using ``python -m app.water_index.producer --evidence FILE`` after schema migration.
"""

import hashlib
import json
from typing import Literal
from urllib.parse import urlsplit

from psycopg.types.json import Jsonb
from pydantic import AwareDatetime, Field, field_validator, model_validator

from app.schema import connect
from app.water_index.models import Activity, Record, SafetyEvidence, SupportEvidence


class StationMapping(Record):
    mapping_id: str = Field(min_length=1, max_length=200)
    spot_id: int = Field(gt=0)
    station_id: int = Field(gt=0)
    relation: Literal["representative_station"] = "representative_station"
    spatial_scope: str = Field(min_length=1, max_length=500)
    mapping_version: str = Field(min_length=1, max_length=200)
    evidence_ref: str = Field(min_length=1, max_length=200)
    source_url: str = Field(min_length=1, max_length=1000)
    authority: str = Field(min_length=1, max_length=200)
    reviewed_by: str = Field(min_length=1, max_length=200)
    activities: tuple[Activity, ...] = Field(min_length=1, max_length=6)
    valid_from: AwareDatetime
    valid_until: AwareDatetime
    supersedes_id: str | None = Field(default=None, max_length=200)

    @field_validator("source_url")
    @classmethod
    def official_public_url(cls, value):
        u = urlsplit(value)
        if (
            u.scheme != "https"
            or not u.hostname
            or u.username
            or u.password
            or u.query
            or u.fragment
            or u.port not in {None, 443}
            or not (u.hostname.endswith(".go.kr") or u.hostname.endswith(".or.kr"))
        ):
            raise ValueError(
                "A public official HTTPS evidence page without credentials is required"
            )
        return value

    @model_validator(mode="after")
    def interval(self):
        if self.valid_until <= self.valid_from or len(set(self.activities)) != len(
            self.activities
        ):
            raise ValueError(
                "A positive validity interval and distinct activities are required"
            )
        return self


class AuthorityRecord(Record):
    evidence_id: str = Field(min_length=1, max_length=200)
    source_url: str = Field(min_length=1, max_length=1000)
    reviewed_by: str = Field(min_length=1, max_length=200)
    evidence: SupportEvidence | SafetyEvidence
    supersedes_id: str | None = Field(default=None, max_length=200)

    _official_url = field_validator("source_url")(
        StationMapping.official_public_url.__func__
    )

    @model_validator(mode="after")
    def explicit_window(self):
        if self.evidence.valid_from is None or not self.evidence.authoritative:
            raise ValueError("An authoritative record requires explicit applicability")
        if self.evidence.input_refs:
            raise ValueError(
                "Standalone authority registration cannot refer to unbound inputs"
            )
        return self


class EvidenceBundle(Record):
    mappings: list[StationMapping] = Field(default_factory=list, max_length=100)
    authorities: list[AuthorityRecord] = Field(default_factory=list, max_length=100)


def migrate_assessment_sources(c):
    c.execute(
        "CREATE TABLE IF NOT EXISTS pongdang_data.water_index_station_mapping ("
        "mapping_id text PRIMARY KEY, spot_id bigint NOT NULL REFERENCES "
        "pongdang_data.spots_waterspot(id), station_id bigint NOT NULL REFERENCES "
        "pongdang_data.collection_station(id), valid_from timestamptz NOT NULL, "
        "valid_until timestamptz NOT NULL, available_at timestamptz NOT NULL "
        "DEFAULT clock_timestamp(), supersedes_id text UNIQUE REFERENCES "
        "pongdang_data.water_index_station_mapping(mapping_id), payload jsonb NOT "
        "NULL, "
        "CHECK(valid_until>valid_from))"
    )
    c.execute(
        "CREATE TABLE IF NOT EXISTS pongdang_data.water_index_authority_evidence ("
        "evidence_id text PRIMARY KEY, spot_id bigint NOT NULL REFERENCES "
        "pongdang_data.spots_waterspot(id), activity text NOT NULL, kind text NOT NULL "
        "CHECK(kind IN ('support','safety')), valid_from timestamptz NOT NULL, "
        "valid_until timestamptz NOT NULL, available_at timestamptz NOT NULL "
        "DEFAULT clock_timestamp(), supersedes_id text UNIQUE REFERENCES "
        "pongdang_data.water_index_authority_evidence(evidence_id), payload jsonb "
        "NOT NULL, "
        "CHECK(valid_until>valid_from))"
    )
    for table in ("water_index_station_mapping", "water_index_authority_evidence"):
        c.execute(
            f"CREATE OR REPLACE TRIGGER {table}_immutable BEFORE UPDATE OR DELETE "
            f"ON pongdang_data.{table} FOR EACH ROW EXECUTE FUNCTION "
            "pongdang_data.water_index_immutable()"
        )


def register_evidence(settings, bundle: EvidenceBundle):
    """Append reviewed evidence atomically; conflicts cannot silently replace it."""
    bundle = EvidenceBundle.model_validate(bundle.model_dump())
    inserted = 0
    with connect(settings) as c:
        c.execute(
            "SELECT pg_advisory_xact_lock(hashtext('pongdang-authority-evidence'))"
        )
        for item in [*bundle.mappings, *bundle.authorities]:
            is_mapping = isinstance(item, StationMapping)
            table = (
                "water_index_station_mapping"
                if is_mapping
                else "water_index_authority_evidence"
            )
            key = "mapping_id" if is_mapping else "evidence_id"
            identity = getattr(item, key)
            payload = item.model_dump(mode="json")
            old = c.execute(
                f"SELECT payload FROM pongdang_data.{table} WHERE {key}=%s", [identity]
            ).fetchone()
            if old:
                if old[0] != payload:
                    raise ValueError("Immutable evidence identity conflict")
                continue
            evidence = item if is_mapping else item.evidence
            if (
                not is_mapping
                and evidence.fetched_at
                > c.execute("SELECT clock_timestamp()").fetchone()[0]
            ):
                raise ValueError("Authority evidence cannot be fetched in the future")
            if item.supersedes_id:
                prior = c.execute(
                    f"SELECT spot_id,payload FROM pongdang_data.{table} WHERE {key}=%s",
                    [item.supersedes_id],
                ).fetchone()
                if not prior or prior[0] != evidence.spot_id:
                    raise ValueError("Correction must reference the same place")
                if is_mapping and prior[1]["station_id"] != item.station_id:
                    raise ValueError(
                        "Station correction cannot change its station identity"
                    )
                if (
                    not is_mapping
                    and prior[1]["evidence"]["activity"] != evidence.activity
                ):
                    raise ValueError("Authority correction cannot change activity")
                if not is_mapping and (
                    prior[1]["evidence"]["provider"] != evidence.provider
                    or ("check_id" in prior[1]["evidence"])
                    != isinstance(evidence, SafetyEvidence)
                ):
                    raise ValueError(
                        "Authority correction cannot change provider or evidence kind"
                    )
            if is_mapping:
                duplicate = c.execute(
                    "SELECT 1 FROM pongdang_data.water_index_station_mapping m "
                    "WHERE spot_id=%s AND station_id=%s AND valid_from<%s "
                    "AND valid_until>%s AND payload->'activities' ?| %s "
                    "AND mapping_id<>COALESCE(%s,'') AND NOT EXISTS "
                    "(SELECT 1 FROM pongdang_data.water_index_station_mapping n "
                    "WHERE n.supersedes_id=m.mapping_id) LIMIT 1",
                    [
                        item.spot_id,
                        item.station_id,
                        item.valid_until,
                        item.valid_from,
                        list(item.activities),
                        item.supersedes_id,
                    ],
                ).fetchone()
                if duplicate:
                    raise ValueError(
                        "Overlapping station mappings require an explicit correction"
                    )
                station = c.execute(
                    "SELECT spot_id FROM pongdang_data.collection_station WHERE id=%s",
                    [item.station_id],
                ).fetchone()
                if station and station[0] == item.spot_id:
                    raise ValueError(
                        "The station's own place uses its direct source relationship"
                    )
                c.execute(
                    "INSERT INTO pongdang_data.water_index_station_mapping "
                    "(mapping_id,spot_id,station_id,valid_from,valid_until,"
                    "supersedes_id,payload) "
                    "VALUES(%s,%s,%s,%s,%s,%s,%s)",
                    [
                        identity,
                        item.spot_id,
                        item.station_id,
                        item.valid_from,
                        item.valid_until,
                        item.supersedes_id,
                        Jsonb(payload),
                    ],
                )
            else:
                c.execute(
                    "INSERT INTO pongdang_data.water_index_authority_evidence "
                    "(evidence_id,spot_id,activity,kind,valid_from,valid_until,"
                    "supersedes_id,payload) "
                    "VALUES(%s,%s,%s,%s,%s,%s,%s,%s)",
                    [
                        identity,
                        evidence.spot_id,
                        evidence.activity,
                        "support"
                        if isinstance(evidence, SupportEvidence)
                        else "safety",
                        evidence.valid_from,
                        evidence.valid_until,
                        item.supersedes_id,
                        Jsonb(payload),
                    ],
                )
            inserted += 1
    return inserted


def stable_id(prefix, payload):
    value = json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str)
    return prefix + hashlib.sha256(value.encode()).hexdigest()
