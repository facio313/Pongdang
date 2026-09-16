"""Bounded read API plus authenticated owner-scoped observation revisions."""

import asyncio
from datetime import UTC, datetime
from typing import Annotated

import psycopg
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import AwareDatetime, BaseModel, ConfigDict, Field

from app.auth import Principal, require_principal
from app.data_reader import DataReader
from app.quality.grade_reader import read_grade
from app.quality.grading import QualityGradeEnvelope
from app.quality.models import (
    ComparisonEnvelope,
    ObservationInput,
    ObservationReceipt,
    OwnerObservationEnvelope,
)
from app.quality.storage import (
    QualityError,
    read_analyses,
    read_observations,
    store_observation,
)
from app.water_index.api import WaterIndexRoute, error_response


class QualityQuery(BaseModel):
    model_config = ConfigDict(extra="forbid")
    spot_id: int | None = Field(default=None, gt=0)
    as_of: AwareDatetime | None = None
    page: int = Field(default=1, ge=1, le=1000)
    page_size: int = Field(default=25, ge=1, le=100)


class GradeQuery(BaseModel):
    model_config = ConfigDict(extra="forbid")
    spot_id: int = Field(gt=0)


def create_router(settings):
    router = APIRouter(
        prefix="/api/data/quality", tags=["water-quality"], route_class=WaterIndexRoute
    )
    reader = DataReader(settings)
    auth = require_principal(settings)

    @router.get("/grade", response_model=QualityGradeEnvelope)
    async def grade(request: Request, query: Annotated[GradeQuery, Query()]):
        if len(request.query_params) != len(request.query_params.multi_items()):
            return error_response(
                422, "invalid_request", "수질 조회 조건이 올바르지 않습니다."
            )
        async with reader.connection() as connection:
            return await read_grade(connection, query.spot_id, datetime.now(UTC))

    @router.get("/comparisons", response_model=ComparisonEnvelope)
    async def comparisons(request: Request, query: Annotated[QualityQuery, Query()]):
        now = datetime.now(UTC)
        names = [name for name, _ in request.query_params.multi_items()]
        if len(names) != len(set(names)) or (query.as_of and query.as_of > now):
            return error_response(
                422, "invalid_request", "수질 조회 조건이 올바르지 않습니다."
            )
        try:
            async with reader.connection() as connection:
                return ComparisonEnvelope.model_validate(
                    await read_analyses(connection, query, now)
                )
        except HTTPException, ValueError, KeyError:
            return error_response(
                503, "quality_unavailable", "수질 비교 자료를 조회할 수 없습니다."
            )

    @router.get("/observations", response_model=OwnerObservationEnvelope)
    async def observations(
        principal: Annotated[Principal, Depends(auth)],
        page: Annotated[int, Query(ge=1, le=1000)] = 1,
        page_size: Annotated[int, Query(ge=1, le=100)] = 25,
    ):
        async with reader.connection() as connection:
            return await read_observations(
                connection, principal.subject, page, page_size
            )

    @router.post("/observations", status_code=201, response_model=ObservationReceipt)
    async def observation(
        value: ObservationInput, principal: Annotated[Principal, Depends(auth)]
    ):
        try:
            evidence, created = await asyncio.to_thread(
                store_observation, settings, principal.subject, value
            )
            return {
                "evidence_id": evidence.evidence_id,
                "review_id": value.review_id,
                "revision": value.revision,
                "created": created,
                "received_at": evidence.received_at,
                "signals": evidence.signals,
                "analysis_version": evidence.analysis_version,
                "status": "retracted" if value.retracted else "analysis_pending",
            }
        except QualityError as exc:
            return error_response(
                exc.status_code, exc.code, "현장 관찰 저장 조건을 확인해 주세요."
            )
        except ValueError:
            return error_response(
                422, "invalid_observation", "관찰 시각과 입력을 확인해 주세요."
            )
        except psycopg.Error:
            return error_response(
                503, "quality_unavailable", "현장 관찰을 저장할 수 없습니다."
            )

    return router
