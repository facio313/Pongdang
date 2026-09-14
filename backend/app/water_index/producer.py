"""Collection -> trusted evaluation -> immutable publication, run outside HTTP."""

import argparse
from collections import defaultdict
from datetime import UTC, datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

from psycopg.rows import dict_row

from app.config import Settings
from app.forecast.storage import (
    forecast_from_normalized,
    project_forecasts,
    read_normalized,
)
from app.schema import connect
from app.water_index.adapters import input_from_records
from app.water_index.engine import diagnostic_assessment, evaluate
from app.water_index.models import EvaluationRequest, SupportEvidence, Target
from app.water_index.registry import CONTEXT_PROFILES, PROFILES, provenance_manifest
from app.water_index.service import prepare_evaluation
from app.water_index.sources import (
    AuthorityRecord,
    EvidenceBundle,
    StationMapping,
    register_evidence,
    stable_id,
)
from app.water_index.storage import (
    InputManifest,
    ReadManifest,
    StorageBundle,
    TargetRecord,
    store_bundle_on_connection,
)


def migrate_assessment_producer(c):
    c.execute(
        "CREATE TABLE IF NOT EXISTS pongdang_data.water_index_production_run ("
        "run_id bigserial PRIMARY KEY, spot_id bigint NOT NULL REFERENCES "
        "pongdang_data.spots_waterspot(id), activity text NOT NULL, mode text NOT "
        "NULL, "
        "digest text NOT NULL, produced_at timestamptz NOT NULL DEFAULT "
        "clock_timestamp(), "
        "read_manifest_id text NOT NULL REFERENCES "
        "pongdang_data.water_index_read_manifest(manifest_id))"
    )
    c.execute(
        "CREATE INDEX IF NOT EXISTS water_index_production_lookup_idx ON "
        "pongdang_data.water_index_production_run(spot_id,activity,mode,run_id DESC)"
    )
    c.execute(
        "CREATE OR REPLACE TRIGGER water_index_production_run_immutable BEFORE "
        "UPDATE OR DELETE "
        "ON pongdang_data.water_index_production_run FOR EACH ROW EXECUTE FUNCTION "
        "pongdang_data.water_index_immutable()"
    )


def build_request(
    source, *, spot_id, activity, mode, now, mapping=None, authorities=()
):
    snapshot = source["snapshot"]
    start = datetime.fromisoformat(snapshot["observed_at"])
    end = datetime.fromisoformat(snapshot["valid_until"])
    target = Target(kind="interval", start_at=start, end_at=end, timezone="Asia/Seoul")
    inputs = tuple(
        input_from_records(
            snapshot,
            metric,
            input_id=f"metric:{metric['id']}",
            mapping_version=mapping.mapping_version
            if mapping
            else "station-observation-point.v1",
        )
        for metric in source["metrics"]
        if metric["mode"] == mode
    )
    if mapping:
        if (
            mapping.spot_id != spot_id
            or mapping.station_id != snapshot["station_id"]
            or activity not in mapping.activities
            or mapping.valid_from > start
            or mapping.valid_until < end
        ):
            raise ValueError(
                "Mapping does not cover the place, station, activity and target"
            )
        inputs = tuple(
            i.model_copy(update={"mapping_evidence_ref": mapping.mapping_id})
            for i in inputs
        )
    elif snapshot["spot_id"] != spot_id:
        raise ValueError("A different place requires a reviewed station mapping")
    target_id = stable_id(
        "collected-target:",
        [
            spot_id,
            activity,
            mode,
            snapshot["provider"],
            snapshot["source_record_id"],
            target.model_dump(mode="json"),
        ],
    )
    support = tuple(
        a.evidence for a in authorities if isinstance(a.evidence, SupportEvidence)
    )
    safety = tuple(
        a.evidence for a in authorities if not isinstance(a.evidence, SupportEvidence)
    )
    return prepare_evaluation(
        EvaluationRequest(
            target_id=target_id,
            spot_id=spot_id,
            activity=activity,
            target=target,
            as_of=now,
            evaluated_at=now,
            context=CONTEXT_PROFILES["general"],
            requested_mode=mode,
            inputs=inputs,
            support_evidence=support,
            safety_evidence=safety,
            forecast_coverage=(target,) if mode == "forecast" else None,
        )
    )


def _merge_windows(windows):
    result = []
    for start, end in sorted(set(windows)):
        if result and start <= result[-1][1]:
            result[-1] = (result[-1][0], max(end, result[-1][1]))
        else:
            result.append((start, end))
    if len(result) > 100:
        raise ValueError("PRODUCER_COVERAGE_SCOPE_TOO_LARGE")
    return [{"start_at": s.isoformat(), "end_at": e.isoformat()} for s, e in result]


def produce_assessments(settings, *, now=None):
    inserted = 0
    with connect(settings) as c:
        c.execute("SELECT pg_advisory_xact_lock(hashtext('pongdang-water-index'))")
        c.execute("SELECT pg_advisory_xact_lock(hashtext('pongdang-ingestion'))")
        now = now or c.execute("SELECT clock_timestamp()").fetchone()[0]
        if now > datetime.now(UTC):
            raise ValueError("Producer cannot use future knowledge")
        sources = read_normalized(c, now, current_only=True)
        with c.cursor(row_factory=dict_row) as cursor:
            mapping_rows = cursor.execute(
                "SELECT payload FROM pongdang_data.water_index_station_mapping m "
                "WHERE available_at<=%s "
                "AND valid_until>%s AND NOT EXISTS (SELECT 1 FROM "
                "pongdang_data.water_index_station_mapping n "
                "WHERE n.supersedes_id=m.mapping_id AND n.available_at<=%s)",
                [now, now, now],
            ).fetchall()
            authority_rows = cursor.execute(
                "SELECT payload FROM pongdang_data.water_index_authority_evidence "
                "a WHERE available_at<=%s "
                "AND valid_until>%s AND NOT EXISTS (SELECT 1 FROM "
                "pongdang_data.water_index_authority_evidence n "
                "WHERE n.supersedes_id=a.evidence_id AND n.available_at<=%s)",
                [now, now, now],
            ).fetchall()
        mappings = [StationMapping.model_validate(r["payload"]) for r in mapping_rows]
        authorities = [
            AuthorityRecord.model_validate(r["payload"]) for r in authority_rows
        ]
        # Collapse corrected tide time slots using the same natural identity as A2.
        selected = {}
        for source in sources:
            s = source["snapshot"]
            if datetime.fromisoformat(s["valid_until"]) <= now:
                continue
            forecast = forecast_from_normalized(source)
            key = forecast.source_key if forecast else f"snapshot:{s['id']}"
            previous = selected.get(key)
            if previous is None or (s["fetched_at"], s["id"]) > (
                previous["snapshot"]["fetched_at"],
                previous["snapshot"]["id"],
            ):
                selected[key] = source
        groups = defaultdict(list)
        for source in selected.values():
            s = source["snapshot"]
            relations = [(s["spot_id"], None)]
            relations.extend(
                (m.spot_id, m)
                for m in mappings
                if m.station_id == s["station_id"]
                and m.valid_from <= datetime.fromisoformat(s["observed_at"])
                and m.valid_until >= datetime.fromisoformat(s["valid_until"])
            )
            for spot_id, mapping in relations:
                for mode in {m["mode"] for m in source["metrics"]}:
                    for activity in mapping.activities if mapping else PROFILES:
                        # Activity-specific products retain their original activity.
                        product = {
                            "khoa_beach": {"swim", "relax"},
                            "khoa_surfing": {"surf"},
                            "khoa_mudflat": {"mudflat"},
                        }
                        if (
                            s["provider"] in product
                            and activity not in product[s["provider"]]
                        ):
                            continue
                        groups[(spot_id, activity, mode)].append((source, mapping))
        for (spot_id, activity, mode), items in groups.items():
            authority = tuple(
                a
                for a in authorities
                if a.evidence.spot_id == spot_id and a.evidence.activity == activity
            )
            fingerprint = stable_id(
                "",
                {
                    "sources": [s for s, _ in items],
                    "mappings": [
                        m.model_dump(mode="json") if m else None for _, m in items
                    ],
                    "authorities": [a.model_dump(mode="json") for a in authority],
                    "model": provenance_manifest(),
                },
            )
            previous = c.execute(
                "SELECT digest FROM pongdang_data.water_index_production_run "
                "WHERE spot_id=%s AND activity=%s AND mode=%s ORDER BY run_id DESC "
                "LIMIT 1",
                [spot_id, activity, mode],
            ).fetchone()
            if previous and previous[0] == fingerprint:
                continue
            requests = [
                build_request(
                    source,
                    spot_id=spot_id,
                    activity=activity,
                    mode=mode,
                    now=now,
                    mapping=mapping,
                    authorities=authority,
                )
                for source, mapping in items
            ]
            results = [evaluate(request) for request in requests]
            # Metadata publication covers a fixed local calendar range; only the
            # real provider intervals below count as supported forecast windows.
            start = now.astimezone(ZoneInfo("Asia/Seoul")).replace(
                hour=0, minute=0, second=0, microsecond=0
            )
            if mode == "observation":
                start -= timedelta(days=1)
            end = start + timedelta(days=31)
            expiry = min(
                datetime.fromisoformat(s["snapshot"]["valid_until"]) for s, _ in items
            )
            for result in results:
                if result.valid_until:
                    expiry = min(expiry, result.valid_until)
            if expiry <= now:
                continue
            mid = stable_id(
                "collected-read:",
                [spot_id, activity, mode, fingerprint, now.isoformat()],
            )
            supports = {}
            for result in results:
                if result.support.status == "unknown":
                    continue
                support_id = stable_id(
                    "support-target:", result.support.model_dump(mode="json")
                )
                supports[support_id] = {
                    "target_id": support_id,
                    "spot_id": spot_id,
                    "activity": activity,
                    "target": Target(
                        kind="interval",
                        start_at=result.support.valid_from,
                        end_at=result.support.valid_until,
                        timezone="Asia/Seoul",
                    ).model_dump(mode="json"),
                    "support": result.support.model_dump(mode="json"),
                }
            if len(supports) > 100:
                raise ValueError("PRODUCER_SUPPORT_SCOPE_TOO_LARGE")
            bundle = StorageBundle(
                targets=[
                    TargetRecord(
                        diagnostic_assessment(
                            target_id=r.target_id,
                            spot_id=r.spot_id,
                            activity=r.activity,
                            target=r.target,
                            context=r.context,
                        ),
                        mode,
                    )
                    for r in requests
                ],
                input_manifests=[
                    InputManifest(
                        manifest_id=r.input_manifest_id,
                        inputs=[i.model_dump(mode="json") for i in a.inputs],
                        evaluation_request=r.model_dump(mode="json"),
                        provenance=provenance_manifest(),
                    )
                    for r, a in zip(requests, results, strict=True)
                ],
                assessments=results,
                read_manifests=[
                    ReadManifest(
                        manifest_id=mid,
                        spot_id=spot_id,
                        activity=activity,
                        profile_id="general",
                        mode=mode,
                        scope_start_at=start,
                        scope_end_at=end,
                        read_valid_until=expiry,
                        selections={
                            r.target_id: a.assessment_id
                            for r, a in zip(requests, results, strict=True)
                        },
                        supported_windows=_merge_windows(
                            (r.target.start_at, r.target.end_at) for r in requests
                        )
                        if mode == "forecast"
                        else [],
                        support_rows=list(supports.values()),
                    )
                ],
            )
            inserted += store_bundle_on_connection(c, bundle, now)
            c.execute(
                "INSERT INTO pongdang_data.water_index_production_run "
                "(spot_id,activity,mode,digest,read_manifest_id) "
                "VALUES(%s,%s,%s,%s,%s)",
                [spot_id, activity, mode, fingerprint, mid],
            )
    return inserted


def main():
    parser = argparse.ArgumentParser(
        description="Project real Pongdang records and reviewed authority evidence"
    )
    parser.add_argument(
        "--evidence",
        type=Path,
        help="Reviewed mapping/authority JSON; never fetched by HTTP",
    )
    args = parser.parse_args()
    settings = Settings()
    if args.evidence:
        print(
            register_evidence(
                settings, EvidenceBundle.model_validate_json(args.evidence.read_text())
            )
        )
    else:
        print(
            {
                "forecast_records": project_forecasts(settings),
                "assessment_artifacts": produce_assessments(settings),
            }
        )


if __name__ == "__main__":
    main()
