from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Query, Request

from app.data_reader import DataReader
from app.water_index.api import QueryParams, WaterIndexRoute, error_response

from .models import ForecastEnvelope
from .storage import select_forecasts


def create_forecast_router(settings):
    router = APIRouter(
        prefix="/api/data/water-forecast",
        tags=["water-forecast"],
        route_class=WaterIndexRoute,
    )
    reader = DataReader(settings)

    @router.get("/forecasts", response_model=ForecastEnvelope)
    async def forecasts(request: Request, query: Annotated[QueryParams, Query()]):
        now = datetime.now(UTC)
        if (
            len(request.query_params) != len(request.query_params.multi_items())
            or query.as_of
            and query.as_of > now
        ):
            return error_response(
                422, "invalid_request", "조회 기준시각과 중복 조건을 확인하세요."
            )
        if query.mode not in {None, "forecast"}:
            return error_response(
                422, "invalid_request", "공식 예보 조회는 forecast 모드입니다."
            )
        async with reader.connection() as connection:
            result = await select_forecasts(
                connection,
                spot_id=query.spot_id,
                as_of=query.as_of or now,
                from_at=query.from_at,
                until_at=query.until_at,
                activity=query.activity,
                page=query.page,
                page_size=query.page_size,
            )
        return {
            "contract_version": "water-forecast.v1",
            "as_of": query.as_of or now,
            "queried_at": now,
            "page": query.page,
            "page_size": query.page_size,
            **result,
            "assessment_endpoint": "/api/data/water-index/assessments",
            "recommendation_status": "unavailable",
            "recommendation_reason": "model_not_validated",
        }

    return router
