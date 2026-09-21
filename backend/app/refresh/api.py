"""SSO-authorized queue writes and read-only shared refresh progress."""

from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

import psycopg
from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, ConfigDict

from app.auth import Principal, require_principal
from app.refresh.service import enqueue_refresh, read_refresh


class RefreshInput(BaseModel):
    model_config = ConfigDict(extra="forbid")


class RefreshStatus(BaseModel):
    request_id: UUID
    status: Literal["queued", "running", "succeeded", "partial", "failed"]
    requested_at: datetime
    finished_at: datetime | None
    failed_jobs: list[str]


def create_router(settings):
    router = APIRouter(prefix="/api/data/refresh", tags=["refresh"])
    authenticated = require_principal(settings)

    @router.post("", response_model=RefreshStatus, status_code=202)
    def request_refresh(
        body: RefreshInput,
        principal: Annotated[Principal, Depends(authenticated)],
        response: Response,
    ):
        response.headers["Cache-Control"] = "private, no-store"
        try:
            return enqueue_refresh(settings)
        except psycopg.Error:
            raise HTTPException(503, detail="REFRESH_UNAVAILABLE") from None

    @router.get("/{request_id}", response_model=RefreshStatus)
    def status(
        request_id: UUID,
        principal: Annotated[Principal, Depends(authenticated)],
        response: Response,
    ):
        response.headers["Cache-Control"] = "private, no-store"
        try:
            result = read_refresh(settings, request_id)
        except psycopg.Error:
            raise HTTPException(503, detail="REFRESH_UNAVAILABLE") from None
        if result is None:
            raise HTTPException(404, detail="REFRESH_NOT_FOUND")
        return result

    return router
