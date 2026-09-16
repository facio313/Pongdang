from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Query, Request
from pydantic import AwareDatetime, field_validator

from app.data_reader import DataReader
from app.forecast.storage import select_forecasts
from app.tides.context import mark_context, nearby_tide_station
from app.tides.models import TideEnvelope, WindowEnvelope
from app.tides.service import tide_event
from app.tides.storage import read_windows
from app.water_index.api import QueryParams, WaterIndexRoute, error_response


class TideQuery(QueryParams):
    reference_at: AwareDatetime | None = None

    _reference_iso = field_validator("reference_at", mode="before")(
        QueryParams.explicit_iso_time.__func__
    )


def create_tides_router(settings):
    router = APIRouter(
        prefix="/api/data/tides", tags=["tides"], route_class=WaterIndexRoute
    )
    reader = DataReader(settings)

    @router.get("/events", response_model=TideEnvelope)
    async def events(request: Request, query: Annotated[TideQuery, Query()]):
        now = datetime.now(UTC)
        as_of, reference = query.as_of or now, query.reference_at or now
        if as_of > now or len(request.query_params) != len(
            request.query_params.multi_items()
        ):
            return error_response(
                422, "invalid_request", "조회 기준시각과 중복 조건을 확인하세요."
            )
        if query.mode not in {None, "forecast"}:
            return error_response(
                422, "invalid_request", "조석 사건은 공식 예측 자료입니다."
            )
        if not query.from_at <= reference < query.until_at:
            return error_response(
                422,
                "invalid_request",
                "타이머 기준시각은 조회 기간 안에 있어야 합니다.",
            )
        async with reader.connection() as c:
            selected = await select_forecasts(
                c,
                spot_id=query.spot_id,
                as_of=as_of,
                from_at=query.from_at,
                until_at=query.until_at,
                activity=query.activity,
                page=query.page,
                page_size=query.page_size,
                provider="khoa_tide_extrema",
            )
            station = None
            source_spot = query.spot_id
            if selected["status"] == "no_forecast_data":
                station = await nearby_tide_station(c, query.spot_id, as_of)
                if station:
                    source_spot = station["spot_id"]
                    selected = await select_forecasts(
                        c,
                        spot_id=source_spot,
                        as_of=as_of,
                        from_at=query.from_at,
                        until_at=query.until_at,
                        activity=query.activity,
                        page=query.page,
                        page_size=query.page_size,
                        provider="khoa_tide_extrema",
                    )
            future = await select_forecasts(
                c,
                spot_id=source_spot,
                as_of=as_of,
                from_at=reference,
                until_at=query.until_at,
                activity=query.activity,
                page=1,
                page_size=100,
                provider="khoa_tide_extrema",
            )
            if station:
                mark_context(selected, station, query.spot_id)
                mark_context(future, station, query.spot_id)
        rows = [tide_event(f, reference) for f in selected["rows"]]
        next_events = [tide_event(f, reference) for f in future["rows"]]
        next_events = [
            e
            for e in next_events
            if e["event_at"] >= reference and e["state"] != "stale"
        ]
        return {
            "contract_version": "tide-timer.v1",
            "as_of": as_of,
            "queried_at": now,
            "reference_at": reference,
            "page": query.page,
            "page_size": query.page_size,
            "total": selected["total"],
            "rows": rows,
            "status": selected["status"],
            "next_high": next((e for e in next_events if e["kind"] == "high"), None),
            "next_low": next((e for e in next_events if e["kind"] == "low"), None),
            "reason_codes": ["events_are_not_safe_activity_windows"],
            "next_event_scope": "requested_interval",
            "horizon_start_at": selected["horizon_start_at"],
            "horizon_end_at": selected["horizon_end_at"],
        }

    @router.get("/windows", response_model=WindowEnvelope)
    async def windows(request: Request, query: Annotated[QueryParams, Query()]):
        now = datetime.now(UTC)
        if (
            query.as_of
            and query.as_of > now
            or len(request.query_params) != len(request.query_params.multi_items())
        ):
            return error_response(
                422, "invalid_request", "조회 기준시각과 중복 조건을 확인하세요."
            )
        async with reader.connection() as c:
            result = await read_windows(
                c,
                spot_id=query.spot_id,
                activity=query.activity,
                from_at=query.from_at,
                until_at=query.until_at,
                as_of=query.as_of or now,
                page=query.page,
                page_size=query.page_size,
            )
        return {
            "contract_version": "tide-operating-window.v1",
            "as_of": query.as_of or now,
            "queried_at": now,
            "page": query.page,
            "page_size": query.page_size,
            **result,
        }

    return router
