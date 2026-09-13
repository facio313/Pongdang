"""Bounded, read-only projections of explicitly persisted assessment manifests."""

from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from typing import Annotated, Any, Literal

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.routing import APIRoute
from pydantic import (
    AwareDatetime,
    BaseModel,
    ConfigDict,
    Field,
    ValidationError,
    field_validator,
    model_validator,
)

from app.config import Settings
from app.data_reader import DataReader
from app.water_index.models import AssessmentDTO, SupportDTO, Target
from app.water_index.registry import CONTEXT_PROFILES, DEFAULT_MODEL
from app.water_index.storage import StorageReadError, read_projection

CONTRACT_VERSION = "water-assessment.v1-draft"
Activity = Literal["swim", "surf", "relax", "mudflat", "onsen", "rafting"]


class QueryParams(BaseModel):
    model_config = ConfigDict(extra="forbid")

    spot_id: int = Field(gt=0)
    activity: Activity
    from_at: AwareDatetime = Field(alias="from")
    until_at: AwareDatetime = Field(alias="until")
    as_of: AwareDatetime | None = None
    profile_id: Literal["general"] | None = None
    mode: Literal["observation", "forecast"] | None = None
    page: int = Field(default=1, ge=1, le=1000)
    page_size: int = Field(default=25, ge=1, le=100)

    @field_validator("spot_id", "page", "page_size", mode="before")
    @classmethod
    def decimal_integer(cls, value):
        if isinstance(value, str) and (not value.isascii() or not value.isdecimal()):
            raise ValueError("An unsigned decimal integer is required")
        if isinstance(value, bool) or isinstance(value, float):
            raise ValueError("An integer is required")
        return value

    @field_validator("from_at", "until_at", "as_of", mode="before")
    @classmethod
    def explicit_iso_time(cls, value):
        if value is None or isinstance(value, datetime):
            return value
        if not isinstance(value, str) or "T" not in value:
            raise ValueError("An offset ISO8601 time is required")
        return value

    @model_validator(mode="after")
    def bounded_period(self):
        duration = self.until_at.astimezone(UTC) - self.from_at.astimezone(UTC)
        if not timedelta(0) < duration <= timedelta(days=31):
            raise ValueError("The request window must be positive and at most 31 days")
        return self


class ResponseRecord(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)


class AssessmentQueryParams(QueryParams):
    profile_id: Literal["general"]
    mode: Literal["observation", "forecast"]


class TimeSpan(ResponseRecord):
    start_at: AwareDatetime
    end_at: AwareDatetime

    @model_validator(mode="after")
    def positive_window(self):
        if self.end_at <= self.start_at:
            raise ValueError("A coverage window must have positive length")
        return self


class MissingTarget(Target):
    target_id: str = Field(min_length=1, max_length=200)


class Coverage(ResponseRecord):
    status: Literal["available", "partial", "unavailable", "unknown"]
    supported_windows: list[TimeSpan] = Field(max_length=100)
    uncovered_windows: list[TimeSpan] = Field(max_length=100)
    missing_targets: list[MissingTarget] = Field(max_length=100)
    reason_codes: list[str] = Field(max_length=100)


class ReadQuery(ResponseRecord):
    spot_id: int = Field(gt=0)
    activity: Activity
    profile_id: Literal["general"]
    mode: Literal["observation", "forecast"]
    from_at: AwareDatetime = Field(alias="from")
    until_at: AwareDatetime = Field(alias="until")


class SupportRow(ResponseRecord):
    target_id: str = Field(min_length=1, max_length=200)
    spot_id: int = Field(gt=0)
    activity: Activity
    target: Target
    support: SupportDTO


class Envelope(ResponseRecord):
    contract_version: Literal["water-assessment.v1-draft"] = CONTRACT_VERSION
    as_of: AwareDatetime
    queried_at: AwareDatetime
    query: ReadQuery
    coverage: Coverage
    rows: list[AssessmentDTO] = Field(max_length=100)
    total: int = Field(ge=0)
    page: int = Field(ge=1, le=1000)
    page_size: int = Field(ge=1, le=100)


class SupportEnvelope(Envelope):
    rows: list[SupportRow] = Field(max_length=100)


def error_response(status: int, code: str, detail: str) -> JSONResponse:
    return JSONResponse(
        status_code=status,
        content={"detail": detail, "error_code": code},
        headers={"Cache-Control": "no-store"},
    )


class WaterIndexRoute(APIRoute):
    """Keep validation failures compatible with the existing detail-string client."""

    def get_route_handler(self) -> Callable:
        original = super().get_route_handler()

        async def handler(request: Request):
            try:
                response = await original(request)
            except RequestValidationError:
                # Do not echo arbitrary query values, credentials or internal SQL.
                return error_response(
                    422,
                    "invalid_request",
                    "물 여행 평가 조회 조건이 올바르지 않습니다.",
                )
            response.headers["Cache-Control"] = "no-store"
            return response

        return handler


def _check_lists(value: Any) -> None:
    if isinstance(value, list):
        if len(value) > 100:
            raise StorageReadError(
                422, "response_scope_too_large", "조회 범위가 너무 큽니다."
            )
        for child in value:
            _check_lists(child)
    elif isinstance(value, dict):
        for child in value.values():
            _check_lists(child)


def _public_rows(
    rows: list[dict], as_of: datetime, queried_at: datetime, query: QueryParams
) -> list[dict]:
    """Validate saved outputs; never compute a score or a safety decision on GET."""
    public = []
    for saved in rows:
        row = AssessmentDTO.model_validate(saved).model_dump(mode="json")
        model = row["model"]
        # There is no released numerical model in this implementation. A stored
        # experimental/candidate fixture or an invented version cannot enable one.
        if row["score"] is not None or model != DEFAULT_MODEL.model_dump(mode="json"):
            raise ValueError("Stored model is outside the public registry")
        if row["as_of"] is not None:
            if datetime.fromisoformat(row["as_of"]) > as_of:
                raise ValueError("Stored assessment is after the read cutoff")
        if (
            row["spot_id"] != query.spot_id
            or row["activity"] != query.activity
            or row["context"] != CONTEXT_PROFILES["general"].model_dump(mode="json")
        ):
            raise ValueError("Stored row is outside the requested context")
        target_start = datetime.fromisoformat(row["target"]["start_at"])
        target_end = row["target"]["end_at"]
        overlaps = (
            target_start < query.until_at
            and datetime.fromisoformat(target_end) > query.from_at
            if target_end is not None
            else query.from_at <= target_start < query.until_at
        )
        if not overlaps:
            raise ValueError("Stored target does not overlap the query")
        for item in row["inputs"]:
            # Even a reference-only input must have been available at this read.
            if (
                datetime.fromisoformat(item["fetched_at"]) > as_of
                or (
                    item["issued_at"] is not None
                    and datetime.fromisoformat(item["issued_at"]) > as_of
                )
                or (
                    item["mode"] == "observation"
                    and datetime.fromisoformat(item["observed_at"]) > as_of
                )
            ):
                raise ValueError("Reference input is after the read cutoff")
        # queried_at describes this read only. Evaluation cutoff, input manifest,
        # target and evaluated_at remain the immutable stored values.
        row["queried_at"] = queried_at.isoformat()
        public.append(row)
    return public


def create_water_index_router(settings: Settings) -> APIRouter:
    router = APIRouter(
        prefix="/api/data/water-index",
        tags=["water-index"],
        route_class=WaterIndexRoute,
    )
    reader = DataReader(settings)

    async def read(request: Request, query: QueryParams, route: str):
        queried_at = datetime.now(UTC)
        names = [name for name, _ in request.query_params.multi_items()]
        if len(names) != len(set(names)):
            return error_response(
                422, "invalid_request", "중복 조회 조건은 허용하지 않습니다."
            )
        if route == "assessments" and (query.profile_id is None or query.mode is None):
            return error_response(
                422, "invalid_request", "profile_id와 mode를 명시해 주세요."
            )
        if query.as_of is not None and query.as_of > queried_at:
            return error_response(
                422, "invalid_request", "미래 조회 기준시각은 허용하지 않습니다."
            )
        # Support and coverage are also selected from the same context-bound read
        # manifests. Their explicit default is non-personal general/forecast.
        profile_id, mode = query.profile_id or "general", query.mode or "forecast"
        as_of = query.as_of or queried_at
        try:
            async with reader.connection() as connection:
                projection = await read_projection(
                    connection,
                    spot_id=query.spot_id,
                    activity=query.activity,
                    profile_id=profile_id,
                    mode=mode,
                    from_at=query.from_at,
                    until_at=query.until_at,
                    as_of=as_of,
                    historical=query.as_of is not None,
                    page=query.page,
                    page_size=query.page_size,
                    route=route,
                )
            if route == "assessments":
                projection["rows"] = _public_rows(
                    projection["rows"], as_of, queried_at, query
                )
            envelope = {
                "contract_version": CONTRACT_VERSION,
                "as_of": as_of,
                "queried_at": queried_at,
                "query": {
                    "spot_id": query.spot_id,
                    "activity": query.activity,
                    "profile_id": profile_id,
                    "mode": mode,
                    "from": query.from_at,
                    "until": query.until_at,
                },
                **projection,
                "page": query.page,
                "page_size": query.page_size,
            }
            _check_lists(envelope)
            response_type = Envelope if route == "assessments" else SupportEnvelope
            return response_type.model_validate(envelope)
        except StorageReadError as exc:
            return error_response(exc.status_code, exc.code, exc.detail)
        except ValidationError, ValueError:
            return error_response(
                503, "assessment_unavailable", "저장된 평가 투영을 제공할 수 없습니다."
            )
        except HTTPException as exc:
            # DataReader already converts DB failures to a sanitized 503. Preserve
            # that distinction from a valid empty result, without exposing internals.
            if exc.status_code == 503:
                return error_response(
                    503, "assessment_unavailable", "평가 자료를 조회할 수 없습니다."
                )
            raise

    @router.get("/assessments", response_model=Envelope)
    async def assessments(
        request: Request, query: Annotated[AssessmentQueryParams, Query()]
    ):
        return await read(request, query, "assessments")

    @router.get("/support", response_model=SupportEnvelope)
    async def support(request: Request, query: Annotated[QueryParams, Query()]):
        return await read(request, query, "support")

    @router.get("/coverage", response_model=SupportEnvelope)
    async def coverage(request: Request, query: Annotated[QueryParams, Query()]):
        return await read(request, query, "coverage")

    return router
