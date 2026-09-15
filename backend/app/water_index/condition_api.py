"""Bounded read-only collection evidence and explicit condition calculations."""

import json
import math
from collections import defaultdict
from datetime import UTC, datetime, timedelta
from typing import Annotated, Literal

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import (
    AwareDatetime,
    BaseModel,
    ConfigDict,
    Field,
    ValidationError,
    field_validator,
    model_validator,
)

from app.data_reader import DataReader
from app.twin.api import station_links
from app.water_index.api import WaterIndexRoute, error_response
from app.water_index.conditions import (
    ACTIVITIES,
    METRICS,
    ActivityCatalog,
    ConditionMetric,
    ConditionsEnvelope,
    Criterion,
    ScoreEnvelope,
    SourceValue,
    calculate_conditions,
    validate_criteria,
)
from app.water_index.models import Activity, SafetyEvidence, SupportEvidence
from app.water_index.sources import AuthorityRecord


class ConditionQuery(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    spot_id: int = Field(gt=0)
    activity: Activity
    mode: Literal["observation", "forecast"]
    at: AwareDatetime | None = None
    as_of: AwareDatetime | None = None

    @field_validator("spot_id", mode="before")
    @classmethod
    def integer_id(cls, value):
        if isinstance(value, str) and (not value.isascii() or not value.isdecimal()):
            raise ValueError("An unsigned decimal ID is required")
        if isinstance(value, (float, bool)):
            raise ValueError("An integer ID is required")
        return value

    @field_validator("at", "as_of", mode="before")
    @classmethod
    def offset_iso_time(cls, value):
        if value is not None and not isinstance(value, datetime):
            if not isinstance(value, str) or "T" not in value:
                raise ValueError("An offset ISO8601 time is required")
        return value

    def times(self, now: datetime):
        as_of = self.as_of or now
        at = self.at or as_of
        if as_of > now or abs(at - as_of) > timedelta(days=31):
            raise ValueError("Target must be within 31 days of a nonfuture cutoff")
        if self.mode == "observation" and at > as_of:
            raise ValueError("Observations cannot evaluate a future target")
        return at, as_of


class ScoreRequest(ConditionQuery):
    criteria: tuple[Criterion, ...] = Field(min_length=1, max_length=8)

    @model_validator(mode="after")
    def valid_selection(self):
        validate_criteria(self.activity, self.criteria)
        return self


ALIASES = {"sea_water_temperature": "water_temperature"}
UNITS = {
    "water_temperature": {"°C", "degC"},
    "bath_water_temperature": {"°C", "degC"},
    "air_temperature": {"°C", "degC"},
    "relative_humidity": {"%"},
    "wind_speed": {"m/s"},
    "wave_height": {"m"},
    "wave_period": {"s"},
    "precipitation": {"mm/1h"},
    "river_level": {"m"},
    "river_flow": {"m³/s", "m3/s"},
}
PRODUCT_ACTIVITIES = {
    "khoa_beach": {"swim", "relax"},
    "khoa_surfing": {"surf"},
    "khoa_mudflat": {"mudflat"},
}


def group_metric(rows, link, q, at, as_of):
    """Select the latest target, retaining tied evidence instead of picking a win."""
    name = ALIASES.get(rows[0]["name"], rows[0]["name"])
    definition = METRICS[name]
    latest = max(r["observed_at"] for r in rows)
    rows = [r for r in rows if r["observed_at"] == latest]
    reasons = []
    status = "available"
    value = None
    # No averaging, revision fallback, grade conversion, or hidden unit guessing.
    if any(r["revision_ambiguous"] for r in rows):
        status, reasons = "unknown", ["revision_reactivation_history_unavailable"]
    elif len(rows) != 1:
        status, reasons = "conflict", ["conflicting_measurement_evidence"]
    else:
        row = rows[0]
        allowed_product = PRODUCT_ACTIVITIES.get(row["provider"])
        if allowed_product and q.activity not in allowed_product:
            status, reasons = "not_applicable", ["provider_activity_mismatch"]
        elif (
            q.activity == "rafting"
            and name in {"water_temperature", "river_level", "river_flow"}
            and link["kind"] not in {"river_level", "river_water_quality"}
        ):
            status, reasons = "not_applicable", ["river_station_scope_unconfirmed"]
        elif name == "bath_water_temperature" and link["kind"] != "bath_water":
            status, reasons = "not_applicable", ["bath_station_scope_unconfirmed"]
        elif row["is_missing"] or row["numeric_value"] is None:
            status, reasons = "missing", ["numeric_measurement_missing"]
        elif not math.isfinite(row["numeric_value"]):
            status, reasons = "missing", ["nonfinite_measurement"]
        elif row["unit"] not in UNITS[name]:
            status, reasons = "unit_mismatch", ["measurement_unit_unconfirmed"]
        elif not row["spatial_scope"]:
            status, reasons = "unknown", ["spatial_scope_unconfirmed"]
        elif row["valid_until"] is None:
            status, reasons = "unknown", ["measurement_validity_unknown"]
        elif row["valid_until"] <= at:
            status, reasons = "stale", ["measurement_expired"]
        elif (
            row["fetched_at"] > as_of
            or row["observed_at"] > at
            or (row["issued_at"] is not None and row["issued_at"] > as_of)
            or row["mode"] != q.mode
        ):
            status, reasons = "unknown", ["measurement_time_or_mode_mismatch"]
        elif q.mode == "forecast" and row["issued_at"] is None:
            status, reasons = "unknown", ["provider_issue_time_unknown"]
        if status == "available":
            value = float(row["numeric_value"])
    sources = []
    for row in rows:
        fields = {name: row[name] for name in SourceValue.model_fields}
        if fields["numeric_value"] is not None and not math.isfinite(
            fields["numeric_value"]
        ):
            fields["numeric_value"] = None
        sources.append(SourceValue(**fields))
    return ConditionMetric(
        name=name,
        label=definition.label,
        unit=definition.unit,
        value=value,
        station_id=link["station_id"],
        station_name=link["name"],
        relation=link["relation"],
        mapping_id=link["mapping"]["mapping_id"] if link["mapping"] else None,
        spatial_scope=link["mapping"]["spatial_scope"]
        if link["mapping"]
        else rows[0]["spatial_scope"],
        status=status,
        reason_codes=tuple(reasons),
        evidence=tuple(sources),
    )


async def read_authority(c, q, at, as_of):
    rows = await (
        await c.execute(
            "SELECT payload FROM pongdang_data.water_index_authority_evidence a "
            "WHERE spot_id=%s AND activity=%s AND available_at<=%s "
            "AND valid_from<=%s AND valid_until>%s AND NOT EXISTS (SELECT 1 FROM "
            "pongdang_data.water_index_authority_evidence n WHERE "
            "n.supersedes_id=a.evidence_id AND n.available_at<=%s) "
            "ORDER BY evidence_id LIMIT 101",
            [q.spot_id, q.activity, as_of, at, at, as_of],
        )
    ).fetchall()
    if len(rows) > 100:
        raise HTTPException(422, "response_scope_too_large")
    support, restrictions, warnings = set(), [], []
    for row in rows:
        record = AuthorityRecord.model_validate(row["payload"])
        e = record.evidence
        if (
            e.spot_id != q.spot_id
            or e.activity != q.activity
            or not e.authoritative
            or e.source_status != "active"
            or e.state != "current"
            or e.fetched_at > as_of
            or (e.issued_at is not None and e.issued_at > as_of)
            or not e.valid_from <= at < e.valid_until
        ):
            continue
        if isinstance(e, SupportEvidence):
            support.add(e.status)
        elif isinstance(e, SafetyEvidence):
            if e.effect == "restricted":
                restrictions.append(e.evidence_ref)
            elif e.effect == "caution":
                warnings.append(e.evidence_ref)
    # Known prohibitions do not become averages or an implicit clearance.
    support_status = (
        "unsupported"
        if "unsupported" in support
        else "supported"
        if support == {"supported"}
        else "unknown"
    )
    reasons = ["environment_model_not_validated", "safety_requirements_not_validated"]
    if support_status == "unknown":
        reasons.append("activity_support_unknown")
    if len(support) > 1:
        reasons.append("conflicting_support_evidence")
    if warnings:
        reasons.append("official_caution_present")
    return (
        support_status,
        "restricted" if restrictions else "unknown",
        restrictions,
        reasons,
    )


async def read_conditions(reader, q: ConditionQuery, *, now=None, metric_names=None):
    at, as_of = q.times(now or datetime.now(UTC))
    allowed = {m.name for m in ACTIVITIES[q.activity].metrics}
    if metric_names is not None:
        # Internal travel reader only; public activity calculation still uses
        # its original activity allowlist and explicit scoring contract.
        if not set(metric_names) <= METRICS.keys() or len(metric_names) > 8:
            raise ValueError("invalid_internal_metric_selection")
        allowed = set(metric_names)
    source_names = sorted(
        allowed | {alias for alias, name in ALIASES.items() if name in allowed}
    )
    async with reader.connection() as c:
        place = await (
            await c.execute(
                "SELECT id,name,catalog_verified_at "
                "FROM pongdang_data.spots_waterspot WHERE id=%s",
                [q.spot_id],
            )
        ).fetchone()
        if not place:
            raise HTTPException(404, "place_not_found")
        links = await station_links(c, [q.spot_id], q, at, as_of)
        if len({link["station_id"] for link in links}) != len(links):
            raise HTTPException(422, "ambiguous_station_mapping")
        # Revision selection precedes missing/stale filtering. All tied latest
        # observations survive so conflicting records cannot silently overwrite.
        rows = await (
            await c.execute(
                "WITH known AS (SELECT * FROM "
                "pongdang_data.conditions_observationsnapshot WHERE station_id=ANY(%s) "
                "AND fetched_at<=%s AND (issued_at IS NULL OR issued_at<=%s)), "
                "revisions AS (SELECT DISTINCT ON (station_id,provider,"
                "COALESCE(source_record_id,provider_record_id)) * FROM known "
                "ORDER BY station_id,provider,"
                "COALESCE(source_record_id,provider_record_id),"
                "fetched_at DESC,id DESC), "
                "slots AS (SELECT DISTINCT s.station_id,s.provider,"
                "COALESCE(s.source_record_id,s.provider_record_id) AS source_key,"
                "m.name,m.mode FROM known s JOIN "
                "pongdang_data.conditions_observationmetric m ON m.snapshot_id=s.id "
                "WHERE m.name=ANY(%s) AND m.mode=%s), candidates AS (SELECT "
                "s.id AS snapshot_id,s.station_id,s.provider,s.provider_record_id,"
                "s.source_record_id,s.spatial_scope,s.issued_at,"
                "s.state AS source_state,"
                "m.id AS metric_id,m.state AS metric_state,k.name,m.numeric_value,"
                "m.text_value,m.unit,k.mode,COALESCE(m.is_missing,true) AS is_missing,"
                "COALESCE(m.observed_at,s.observed_at) AS observed_at,"
                "COALESCE(m.observed_at,s.observed_at) AS valid_from,"
                "COALESCE(m.fetched_at,s.fetched_at) AS fetched_at,"
                "m.valid_until,EXISTS (SELECT 1 FROM known active WHERE "
                "active.station_id=s.station_id AND active.provider=s.provider "
                "AND COALESCE(active.source_record_id,active.provider_record_id)="
                "COALESCE(s.source_record_id,s.provider_record_id) "
                "AND active.state<>'superseded' AND active.fetched_at<s.fetched_at) "
                "AS revision_ambiguous,dense_rank() OVER (PARTITION BY "
                "s.station_id,k.name ORDER BY COALESCE(m.observed_at,s.observed_at) "
                "DESC) AS target_rank FROM revisions s JOIN slots k ON "
                "k.station_id=s.station_id AND k.provider=s.provider AND "
                "k.source_key=COALESCE(s.source_record_id,s.provider_record_id) "
                "LEFT JOIN pongdang_data.conditions_observationmetric m "
                "ON m.snapshot_id=s.id AND m.name=k.name AND m.mode=k.mode "
                "WHERE COALESCE(m.observed_at,s.observed_at)<=%s "
                "AND COALESCE(m.fetched_at,s.fetched_at)<=%s) "
                "SELECT * FROM candidates WHERE target_rank=1 "
                "ORDER BY station_id,name,snapshot_id,metric_id LIMIT 101",
                [
                    [link["station_id"] for link in links],
                    as_of,
                    as_of,
                    source_names,
                    q.mode,
                    at,
                    as_of,
                ],
            )
        ).fetchall()
        if len(rows) > 100:
            raise HTTPException(422, "response_scope_too_large")
        support, safety, restrictions, reasons = await read_authority(c, q, at, as_of)
    groups = defaultdict(list)
    for row in rows:
        groups[(row["station_id"], ALIASES.get(row["name"], row["name"]))].append(row)
    link_by_id = {link["station_id"]: link for link in links}
    metrics = tuple(
        group_metric(values, link_by_id[station], q, at, as_of)
        for (station, _), values in sorted(groups.items())
    )
    present = {m.name for m in metrics}
    name = place["name"]
    if q.as_of is not None and (
        place["catalog_verified_at"] is None or place["catalog_verified_at"] > as_of
    ):
        name = None
        reasons.append("historical_metadata_unavailable")
    if not metrics:
        reasons.append("no_mapped_measurements")
    return ConditionsEnvelope(
        spot_id=q.spot_id,
        place_name=name,
        activity=q.activity,
        mode=q.mode,
        at=at,
        as_of=as_of,
        support_status=support,
        safety_status=safety,
        restriction_refs=tuple(restrictions),
        metrics=metrics,
        missing_metrics=tuple(name for name in sorted(allowed) if name not in present),
        required_evidence=ACTIVITIES[q.activity].required_evidence,
        reason_codes=tuple(reasons),
    )


def _unique_object(pairs):
    result = {}
    for name, value in pairs:
        if name in result:
            raise ValueError("Duplicate JSON property")
        result[name] = value
    return result


async def _bounded_body(request):
    if (
        request.headers.get("content-type", "").split(";")[0].strip()
        != "application/json"
    ):
        raise HTTPException(415, "application_json_required")
    data = bytearray()
    async for chunk in request.stream():
        data.extend(chunk)
        if len(data) > 16384:
            raise HTTPException(413, "request_too_large")
    return ScoreRequest.model_validate(
        json.loads(data, object_pairs_hook=_unique_object)
    )


def score_request_schema():
    """Inline local Pydantic definitions for a valid OpenAPI request schema."""
    schema = ScoreRequest.model_json_schema()
    definitions = schema.pop("$defs", {})

    def expand(value):
        if isinstance(value, list):
            return [expand(item) for item in value]
        if isinstance(value, dict):
            if "$ref" in value:
                return expand(definitions[value["$ref"].rsplit("/", 1)[-1]])
            return {key: expand(item) for key, item in value.items()}
        return value

    return expand(schema)


def create_condition_router(settings):
    router = APIRouter(
        prefix="/api/data/water-index",
        tags=["water-index-conditions"],
        route_class=WaterIndexRoute,
    )
    reader = DataReader(settings)

    @router.get("/activities", response_model=ActivityCatalog)
    async def activities(request: Request):
        if request.query_params:
            return error_response(
                422, "invalid_request", "지원하지 않는 조회 조건입니다."
            )
        return ActivityCatalog()

    @router.get("/conditions", response_model=ConditionsEnvelope)
    async def conditions(request: Request, q: Annotated[ConditionQuery, Query()]):
        if len(request.query_params) != len(request.query_params.multi_items()):
            return error_response(
                422, "invalid_request", "중복 조회 조건은 허용하지 않습니다."
            )
        try:
            q.times(datetime.now(UTC))
        except ValueError:
            return error_response(
                422, "invalid_request", "조회 시각이 올바르지 않습니다."
            )
        try:
            return await read_conditions(reader, q)
        except ValueError, KeyError:
            return error_response(
                503, "condition_data_unavailable", "조건 자료를 제공할 수 없습니다."
            )

    @router.post(
        "/condition-score",
        response_model=ScoreEnvelope,
        openapi_extra={
            "requestBody": {
                "required": True,
                "content": {"application/json": {"schema": score_request_schema()}},
            }
        },
        description=(
            "Read-only calculation of explicit user ranges over collection evidence. "
            "No writes, ingestion, external calls, default criteria, "
            "or scientific safety score."
        ),
    )
    async def condition_score(request: Request):
        if request.query_params:
            return error_response(
                422, "invalid_request", "계산 조건은 JSON 본문으로 전달해 주세요."
            )
        try:
            query = await _bounded_body(request)
            query.times(datetime.now(UTC))
        except ValidationError, ValueError, UnicodeError:
            return error_response(
                422, "invalid_request", "목표 범위·중요도·조회 조건을 확인해 주세요."
            )
        try:
            evidence = await read_conditions(reader, query)
            return calculate_conditions(evidence, query.criteria)
        except ValueError, KeyError:
            return error_response(
                503, "condition_data_unavailable", "조건 점수를 계산할 수 없습니다."
            )

    return router
