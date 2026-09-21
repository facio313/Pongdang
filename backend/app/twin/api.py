"""A3/A4 spatial views. No request performs external I/O or writes."""

from datetime import UTC, datetime, timedelta
from typing import Annotated, Literal

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, model_validator

from app.data_reader import DataReader
from app.forecast.models import ForecastView
from app.forecast.storage import select_forecasts
from app.water_index.api import QueryParams, WaterIndexRoute, _public_rows
from app.water_index.models import Activity
from app.water_index.storage import read_projection


class SpatialQuery(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    spot_id: int | None = Field(default=None, gt=0)
    activity: Activity = "swim"
    at: AwareDatetime | None = None
    as_of: AwareDatetime | None = None
    west: float | None = Field(default=None, ge=-180, le=180)
    east: float | None = Field(default=None, ge=-180, le=180)
    south: float | None = Field(default=None, ge=-90, le=90)
    north: float | None = Field(default=None, ge=-90, le=90)
    kind: str | None = Field(default=None, max_length=80)
    mode: Literal["observation", "forecast"] = "observation"
    page: int = Field(default=1, ge=1, le=1000)
    page_size: int = Field(default=25, ge=1, le=100)

    @model_validator(mode="after")
    def validate_scope(self):
        coords = (self.west, self.east, self.south, self.north)
        if any(v is not None for v in coords):
            if any(v is None for v in coords):
                raise ValueError("All four bbox coordinates are required")
            if not (0 < self.east - self.west <= 20):
                raise ValueError("Longitude span must be in (0,20] degrees")
            if not (0 < self.north - self.south <= 20):
                raise ValueError("Latitude span must be in (0,20] degrees")
        now = datetime.now(UTC)
        if self.as_of and self.as_of > now:
            raise ValueError("as_of cannot be in the future")
        if (
            self.at
            and abs((self.at - (self.as_of or now)).total_seconds()) > 31 * 86400
        ):
            raise ValueError("Target must be within 31 days of the knowledge cutoff")
        return self


class PublicRecord(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)


class MappingView(PublicRecord):
    mapping_id: str
    spatial_scope: str
    mapping_version: str
    evidence_ref: str
    source_url: str
    authority: str
    valid_from: AwareDatetime
    valid_until: AwareDatetime


class StationLink(PublicRecord):
    station_id: int
    spot_id: int
    provider: str
    source_id: str
    name: str | None
    kind: str | None
    latitude: float | None
    longitude: float | None
    relation: Literal["station_observation_point", "representative_station"]
    mapping: MappingView | None
    mapping_id: str | None = None
    metadata_fetched_at: AwareDatetime | None
    metadata_state: Literal["current_metadata", "historical_metadata_unavailable"]


class MetricLayer(PublicRecord):
    snapshot_id: int
    station_id: int
    provider: str
    provider_record_id: str
    source_record_id: str | None
    ingestion_version: str
    spatial_scope: str | None
    issued_at: AwareDatetime | None
    metric_id: int
    name: str
    numeric_value: float | None
    text_value: str | None
    unit: str | None
    mode: Literal["observation", "forecast"]
    is_missing: bool
    observed_at: AwareDatetime
    fetched_at: AwareDatetime
    valid_until: AwareDatetime | None
    status: Literal["missing", "unknown", "stale", "forecast", "observation"]
    reason_codes: list[str] = Field(max_length=100)
    time_role: Literal["forecast_target_start", "observation_time"]
    interpolation: None = None


class AssessmentSummary(PublicRecord):
    assessment_id: str | None
    target_id: str
    input_manifest_id: str | None
    score: float | None
    safety_status: str
    support_status: str
    environment_status: str
    evaluated_at: AwareDatetime | None
    valid_until: AwareDatetime | None
    reason_codes: list[str] = Field(max_length=100)
    input_ids: list[str] = Field(max_length=100)


class AssessmentLayer(PublicRecord):
    status: str
    reason_codes: list[str] = Field(max_length=100)
    rows: list[AssessmentSummary] = Field(max_length=100)


class ForecastLayer(PublicRecord):
    status: str
    horizon_start_at: AwareDatetime | None
    horizon_end_at: AwareDatetime | None
    rows: list[ForecastView] = Field(max_length=100)


class SpatialPlace(PublicRecord):
    spot_id: int
    name: str | None
    type: str | None
    lat: float | None
    lng: float | None
    region: str | None
    catalog_source: str | None
    catalog_verified_at: AwareDatetime | None
    metadata_state: Literal["current_metadata", "historical_metadata_unavailable"]
    stations: list[StationLink] = Field(max_length=100)
    layers: list[MetricLayer] = Field(max_length=100)
    assessment: AssessmentLayer
    forecast: ForecastLayer
    status: Literal["available", "no_data"]
    reason_codes: list[str] = Field(max_length=100)
    safety_status: str
    score: float | None
    assessment_path: str
    forecast_path: str
    timezone: Literal["Asia/Seoul"]


class SpatialEnvelope(PublicRecord):
    contract_version: Literal["water-spatial.v1"] = "water-spatial.v1"
    query: SpatialQuery
    as_of: AwareDatetime
    at: AwareDatetime
    status: Literal["available", "no_data"]
    rows: list[SpatialPlace] = Field(max_length=100)
    has_more: bool
    reason_codes: list[str]


def metric_status(row, at):
    if row["is_missing"] or (
        row["numeric_value"] is None and row["text_value"] is None
    ):
        return "missing"
    if row["valid_until"] is None:
        return "unknown"
    if row["valid_until"] <= at:
        return "stale"
    return "forecast" if row["mode"] == "forecast" else "observation"


async def station_links(c, spot_ids, q, at, as_of):
    direct = await (
        await c.execute(
            "SELECT id AS station_id,spot_id,provider,source_id,name,kind,latitude,"
            "longitude,fetched_at AS metadata_fetched_at "
            "FROM pongdang_data.collection_station st WHERE spot_id=ANY(%s) "
            "AND (fetched_at<=%s OR EXISTS (SELECT 1 FROM "
            "pongdang_data.conditions_observationsnapshot snap "
            "WHERE snap.station_id=st.id AND snap.fetched_at<=%s)) "
            "ORDER BY id LIMIT 101",
            [spot_ids, as_of, as_of],
        )
    ).fetchall()
    mapped = await (
        await c.execute(
            "SELECT m.spot_id,m.mapping_id,m.payload,s.id AS station_id,s.provider,"
            "s.source_id,s.name,s.kind,s.latitude,s.longitude,"
            "s.fetched_at AS metadata_fetched_at "
            "FROM pongdang_data.water_index_station_mapping m "
            "JOIN pongdang_data.collection_station s ON s.id=m.station_id "
            "WHERE m.spot_id=ANY(%s) AND m.available_at<=%s "
            "AND m.valid_from<=%s AND m.valid_until>%s "
            "AND m.payload->'activities' ? %s AND NOT EXISTS (SELECT 1 FROM "
            "pongdang_data.water_index_station_mapping n WHERE n.supersedes_id="
            "m.mapping_id AND n.available_at<=%s) ORDER BY m.mapping_id LIMIT 101",
            [spot_ids, as_of, at, at, q.activity, as_of],
        )
    ).fetchall()
    if len(direct) + len(mapped) > 100:
        raise HTTPException(422, "response_scope_too_large: narrow the place page")
    for row in direct:
        row.update(relation="station_observation_point", mapping=None)
    for row in mapped:
        payload = row.pop("payload")
        row.update(
            relation="representative_station",
            mapping={
                k: payload[k]
                for k in (
                    "mapping_id",
                    "spatial_scope",
                    "mapping_version",
                    "evidence_ref",
                    "source_url",
                    "authority",
                    "valid_from",
                    "valid_until",
                )
            },
        )
    for row in direct + mapped:
        known = (
            row["metadata_fetched_at"] is not None
            and row["metadata_fetched_at"] <= as_of
        )
        row["metadata_state"] = (
            "current_metadata" if known else "historical_metadata_unavailable"
        )
        if not known:
            for key in ("name", "kind", "latitude", "longitude", "metadata_fetched_at"):
                row[key] = None
    return direct + mapped


async def evidence(c, station_ids, q, at, as_of, temperature_only):
    # Latest revision *known at cutoff* wins, including explicit missing values.
    # Missing corrections never fall back to older successful measurements.
    rows = await (
        await c.execute(
            "WITH revisions AS (SELECT DISTINCT ON (station_id,provider,"
            "COALESCE(source_record_id,provider_record_id)) * FROM "
            "pongdang_data.conditions_observationsnapshot WHERE station_id=ANY(%s) "
            "AND fetched_at<=%s AND (issued_at IS NULL OR issued_at<=%s) "
            "ORDER BY station_id,provider,"
            "COALESCE(source_record_id,provider_record_id),"
            "fetched_at DESC,id DESC) SELECT DISTINCT ON (s.station_id,m.name) "
            "s.id AS snapshot_id,s.station_id,s.provider,s.provider_record_id,"
            "s.source_record_id,s.ingestion_version,s.spatial_scope,s.issued_at,"
            "m.id AS metric_id,m.name,m.numeric_value,m.text_value,m.unit,m.mode,"
            "m.is_missing,m.observed_at,m.fetched_at,m.valid_until "
            "FROM revisions s JOIN pongdang_data.conditions_observationmetric m "
            "ON m.snapshot_id=s.id WHERE m.mode=%s AND m.observed_at<=%s "
            "AND (%s=false OR m.name IN ('water_temperature','sea_water_temperature')) "
            "ORDER BY s.station_id,m.name,m.observed_at DESC,s.id DESC LIMIT 101",
            [station_ids, as_of, as_of, q.mode, at, temperature_only],
        )
    ).fetchall()
    if len(rows) > 100:
        raise HTTPException(422, "response_scope_too_large: narrow the place page")
    for row in rows:
        row["status"] = metric_status(row, at)
        row["reason_codes"] = (
            ["provider_issue_time_unknown"]
            if row["mode"] == "forecast" and not row["issued_at"]
            else []
        )
        row["time_role"] = (
            "forecast_target_start" if row["mode"] == "forecast" else "observation_time"
        )
        row["interpolation"] = None
    return rows


async def domain_layers(c, spot_id, q, at, as_of):
    """Reuse the domain selectors on this one repeatable-read transaction.

    The map point is an instant; a one-microsecond half-open interval selects
    exactly the provider/assessment targets containing that point.
    """
    until = at + timedelta(microseconds=1)
    projection = await read_projection(
        c,
        spot_id=spot_id,
        activity=q.activity,
        profile_id="general",
        mode=q.mode,
        from_at=at,
        until_at=until,
        as_of=as_of,
        historical=False,
        page_size=100,
    )
    query = QueryParams.model_validate(
        {
            "spot_id": spot_id,
            "activity": q.activity,
            "profile_id": "general",
            "mode": q.mode,
            "from": at,
            "until": until,
        }
    )
    public = _public_rows(projection["rows"], as_of, datetime.now(UTC), query)
    assessments = [
        {
            "assessment_id": r["assessment_id"],
            "target_id": r["target_id"],
            "input_manifest_id": r["input_manifest_id"],
            "score": r["score"],
            "safety_status": r["safety_status"],
            "support_status": r["support"]["status"],
            "environment_status": r["environment"]["status"],
            "evaluated_at": r["evaluated_at"],
            "valid_until": r["valid_until"],
            "reason_codes": r["reason_codes"],
            "input_ids": [i["input_id"] for i in r["inputs"]],
        }
        for r in public
    ]
    forecast = await select_forecasts(
        c,
        spot_id=spot_id,
        activity=q.activity,
        as_of=as_of,
        from_at=at,
        until_at=until,
        page_size=100,
    )
    return (
        {
            "status": projection["coverage"]["status"],
            "reason_codes": projection["coverage"]["reason_codes"],
            "rows": assessments,
        },
        {
            key: forecast[key]
            for key in ("status", "horizon_start_at", "horizon_end_at", "rows")
        },
    )


async def spatial_view(reader, q, *, temperature_only=False):
    as_of = q.as_of or datetime.now(UTC)
    at = q.at or as_of
    clauses, params = [], []
    if q.spot_id:
        clauses.append("id=%s")
        params.append(q.spot_id)
    if q.kind:
        clauses.append("type=%s")
        params.append(q.kind)
    if q.west is not None:
        clauses.append("lng BETWEEN %s AND %s AND lat BETWEEN %s AND %s")
        params.extend([q.west, q.east, q.south, q.north])
        # Current mutable catalog coordinates cannot satisfy a historical bbox.
        if q.as_of is not None:
            clauses.append("catalog_verified_at<=%s")
            params.append(as_of)
    condition = " AND ".join(clauses) or "true"
    async with reader.connection() as c:
        if (
            q.spot_id
            and not await (
                await c.execute(
                    "SELECT 1 FROM pongdang_data.spots_waterspot WHERE id=%s",
                    [q.spot_id],
                )
            ).fetchone()
        ):
            raise HTTPException(404, "place_not_found")
        places = await (
            await c.execute(
                "SELECT id AS spot_id,name,type,lat,lng,region,catalog_source,"
                "catalog_verified_at "
                f"FROM pongdang_data.spots_waterspot WHERE {condition} "
                "ORDER BY id LIMIT %s OFFSET %s",
                [*params, q.page_size + 1, (q.page - 1) * q.page_size],
            )
        ).fetchall()
        has_more = len(places) > q.page_size
        places = places[: q.page_size]
        links = await station_links(c, [p["spot_id"] for p in places], q, at, as_of)
        values = await evidence(
            c, [r["station_id"] for r in links], q, at, as_of, temperature_only
        )
        total_derived_rows = 0
        for place in places:
            related = [r for r in links if r["spot_id"] == place["spot_id"]]
            ids = {r["station_id"] for r in related}
            metrics = [r for r in values if r["station_id"] in ids]
            if temperature_only:
                # A temperature read has no dependency on assessment or forecast
                # projections. Keep their envelope fields, but distinguish an
                # unrequested layer from a claim that no such evidence exists.
                assessment = {
                    "status": "not_requested",
                    "reason_codes": ["temperature_only_view"],
                    "rows": [],
                }
                forecast = {
                    "status": "not_requested",
                    "horizon_start_at": None,
                    "horizon_end_at": None,
                    "rows": [],
                }
            else:
                assessment, forecast = await domain_layers(
                    c, place["spot_id"], q, at, as_of
                )
            total_derived_rows += len(assessment["rows"]) + len(forecast["rows"])
            if total_derived_rows > 100:
                raise HTTPException(
                    422, "response_scope_too_large: narrow the place page"
                )
            historical_metadata = q.as_of is not None and (
                place["catalog_verified_at"] is None
                or place["catalog_verified_at"] > as_of
            )
            if historical_metadata:
                for key in (
                    "name",
                    "type",
                    "lat",
                    "lng",
                    "region",
                    "catalog_source",
                    "catalog_verified_at",
                ):
                    place[key] = None
            place.update(
                metadata_state="historical_metadata_unavailable"
                if historical_metadata
                else "current_metadata",
                assessment=assessment,
                forecast=forecast,
                stations=related,
                layers=metrics,
                status="available"
                if metrics or assessment["rows"] or forecast["rows"]
                else "no_data",
                reason_codes=[] if metrics else ["no_mapped_measurements"],
                safety_status=assessment["rows"][0]["safety_status"]
                if len(assessment["rows"]) == 1
                else "unknown",
                score=assessment["rows"][0]["score"]
                if len(assessment["rows"]) == 1
                else None,
                assessment_path="water-index/assessments",
                forecast_path="water-forecast/forecasts",
                timezone="Asia/Seoul",
            )
    return SpatialEnvelope(
        query=q,
        as_of=as_of,
        at=at,
        status="available" if places else "no_data",
        rows=places,
        has_more=has_more,
        reason_codes=(
            ["historical_catalog_filter_may_be_incomplete"]
            if q.as_of is not None and q.west is not None
            else []
        )
        + ([] if places else ["no_places"]),
    )


def create_twin_router(settings):
    router = APIRouter(
        prefix="/api/data", tags=["water-twin"], route_class=WaterIndexRoute
    )
    reader = DataReader(settings)

    @router.get("/water-twin", response_model=SpatialEnvelope)
    async def twin(request: Request, q: Annotated[SpatialQuery, Query()]):
        if len(request.query_params) != len(request.query_params.multi_items()):
            raise HTTPException(422, "invalid_request: duplicate query")
        try:
            return await spatial_view(reader, q)
        except ValueError, KeyError:
            raise HTTPException(503, "spatial_data_unavailable") from None

    @router.get("/water-temperature", response_model=SpatialEnvelope)
    async def temperature(request: Request, q: Annotated[SpatialQuery, Query()]):
        if len(request.query_params) != len(request.query_params.multi_items()):
            raise HTTPException(422, "invalid_request: duplicate query")
        try:
            return await spatial_view(reader, q, temperature_only=True)
        except ValueError, KeyError:
            raise HTTPException(503, "spatial_data_unavailable") from None

    return router
