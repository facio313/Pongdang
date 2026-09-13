"""Authenticated owner projections, bounded read-only GETs and explicit mutations."""

from typing import Annotated
from uuid import UUID

import psycopg
from fastapi import APIRouter, Depends, HTTPException, Query, Response
from psycopg.rows import dict_row

from app.auth import Principal, require_principal
from app.notifications.models import (
    EvaluationPage,
    EvaluationView,
    EventPage,
    EventView,
    SubscriptionInput,
    SubscriptionPage,
    SubscriptionView,
)
from app.notifications.service import (
    cancel_subscription,
    save_subscription,
    subscription_view,
)
from app.schema import connect


def create_router(settings):
    router = APIRouter(prefix="/api/data/notifications", tags=["notifications"])
    authenticated = require_principal(settings)

    @router.get("/subscriptions", response_model=SubscriptionPage)
    def subscriptions(
        principal: Annotated[Principal, Depends(authenticated)],
        response: Response,
        limit: int = Query(100, ge=1, le=100),
        offset: int = Query(0, ge=0, le=10000),
    ):
        response.headers["Cache-Control"] = "private, no-store"
        try:
            with connect(settings) as c:
                c.execute("SET TRANSACTION READ ONLY")
                c.row_factory = dict_row
                rows = c.execute(
                    "SELECT * FROM pongdang_data.notification_subscription "
                    "WHERE owner_subject=%s ORDER BY id LIMIT %s OFFSET %s",
                    [principal.subject, limit, offset],
                ).fetchall()
            return SubscriptionPage(
                rows=[subscription_view(row, settings) for row in rows],
                limit=limit,
                offset=offset,
            )
        except psycopg.Error:
            raise HTTPException(503, detail="NOTIFICATIONS_UNAVAILABLE") from None

    @router.post("/subscriptions", response_model=SubscriptionView, status_code=201)
    def create(
        body: SubscriptionInput, principal: Annotated[Principal, Depends(authenticated)]
    ):
        try:
            return save_subscription(settings, principal, body)
        except psycopg.Error:
            raise HTTPException(503, detail="NOTIFICATIONS_UNAVAILABLE") from None

    @router.put("/subscriptions/{subscription_id}", response_model=SubscriptionView)
    def update(
        subscription_id: UUID,
        body: SubscriptionInput,
        principal: Annotated[Principal, Depends(authenticated)],
        expected_revision: int = Query(..., ge=1),
    ):
        try:
            return save_subscription(
                settings,
                principal,
                body,
                identifier=str(subscription_id),
                expected=expected_revision,
            )
        except psycopg.Error:
            raise HTTPException(503, detail="NOTIFICATIONS_UNAVAILABLE") from None

    @router.delete("/subscriptions/{subscription_id}", status_code=204)
    def cancel(
        subscription_id: UUID, principal: Annotated[Principal, Depends(authenticated)]
    ):
        try:
            cancel_subscription(settings, principal.subject, str(subscription_id))
        except psycopg.Error:
            raise HTTPException(503, detail="NOTIFICATIONS_UNAVAILABLE") from None
        return Response(status_code=204)

    @router.get("/events", response_model=EventPage)
    def events(
        principal: Annotated[Principal, Depends(authenticated)],
        response: Response,
        subscription_id: UUID | None = None,
        limit: int = Query(100, ge=1, le=100),
        offset: int = Query(0, ge=0, le=10000),
    ):
        response.headers["Cache-Control"] = "private, no-store"
        try:
            with connect(settings) as c:
                c.execute("SET TRANSACTION READ ONLY")
                c.row_factory = dict_row
                rows = c.execute(
                    "SELECT e.id,e.subscription_id,e.subscription_revision,"
                    "e.season_year AS year,e.kind,e.state,e.created_at,"
                    "e.payload AS evidence,o.state AS delivery_state,o.attempts,"
                    "o.last_error FROM pongdang_data.notification_event e JOIN "
                    "pongdang_data.notification_subscription s "
                    "ON s.id=e.subscription_id "
                    "JOIN pongdang_data.notification_outbox o ON o.event_id=e.id "
                    "WHERE s.owner_subject=%s AND (%s::text IS NULL OR s.id=%s) "
                    "ORDER BY e.created_at DESC,e.id LIMIT %s OFFSET %s",
                    [
                        principal.subject,
                        str(subscription_id) if subscription_id else None,
                        str(subscription_id) if subscription_id else None,
                        limit,
                        offset,
                    ],
                ).fetchall()
            return EventPage(
                rows=[EventView(**row) for row in rows], limit=limit, offset=offset
            )
        except psycopg.Error:
            raise HTTPException(503, detail="NOTIFICATIONS_UNAVAILABLE") from None

    @router.get(
        "/subscriptions/{subscription_id}/evaluations", response_model=EvaluationPage
    )
    def evaluations(
        subscription_id: UUID,
        principal: Annotated[Principal, Depends(authenticated)],
        response: Response,
        limit: int = Query(100, ge=1, le=100),
        offset: int = Query(0, ge=0, le=10000),
    ):
        response.headers["Cache-Control"] = "private, no-store"
        try:
            with connect(settings) as c:
                c.execute("SET TRANSACTION READ ONLY")
                c.row_factory = dict_row
                owned = c.execute(
                    "SELECT id FROM pongdang_data.notification_subscription "
                    "WHERE id=%s AND owner_subject=%s",
                    [str(subscription_id), principal.subject],
                ).fetchone()
                if not owned:
                    raise HTTPException(404, detail="SUBSCRIPTION_NOT_FOUND")
                rows = c.execute(
                    "SELECT id,subscription_id,subscription_revision,evaluated_at,"
                    "condition_state,payload AS evidence FROM "
                    "pongdang_data.notification_evaluation WHERE subscription_id=%s "
                    "ORDER BY evaluated_at DESC,id DESC LIMIT %s OFFSET %s",
                    [str(subscription_id), limit, offset],
                ).fetchall()
            return EvaluationPage(
                rows=[EvaluationView(**row) for row in rows], limit=limit, offset=offset
            )
        except psycopg.Error:
            raise HTTPException(503, detail="NOTIFICATIONS_UNAVAILABLE") from None

    return router
