"""Explicit SSO operations; independent of AI availability and paid-call budgets."""

import asyncio
from datetime import UTC, datetime
from typing import Annotated
from uuid import UUID

import psycopg
from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from fastapi.routing import APIRoute
from pydantic import Field

from app.auth import Principal, require_principal
from app.travel import companion, storage, tokens
from app.travel.catalog import Catalog
from app.travel.language import copy
from app.travel.models import (
    Locale,
    Mood,
    PlanInput,
    PlanUpdate,
    PreferenceUpdate,
    RecommendationInput,
    RecommendationResult,
    Record,
    SessionRefresh,
    SessionSettings,
    SessionStart,
    SignalInput,
    SignalKind,
    TravelRequest,
    TripPlan,
    TripSession,
)
from app.travel.plans import draft_plan, preserve_fixed
from app.travel.recommend import WEIGHTS, recommend


class ComparisonInput(Record):
    selection_token: str = Field(min_length=1, max_length=16000)
    ranks: list[int] = Field(min_length=1, max_length=3)


class MoodInput(Record):
    text: str = Field(min_length=1, max_length=300)
    locale: Locale = "ko"


class MoodPromotion(Record):
    mood: Mood
    expected_revision: int = Field(ge=0)


def mood_proposal(text, locale="ko"):
    quiet = any(
        word in text.lower()
        for word in (
            "지친",
            "쉬고",
            "조용",
            "휴식",
            "스트레스",
            "tired",
            "rest",
            "quiet",
            "疲れ",
            "休み",
            "静か",
            "累",
            "休息",
            "安静",
            "安靜",
        )
    )
    active = any(
        word in text.lower()
        for word in (
            "신나게",
            "움직",
            "활동",
            "active",
            "energetic",
            "元気",
            "活跃",
            "活躍",
        )
    )
    mood = Mood(
        text=text,
        tags=["짧은 이동", "조용한 휴식"]
        if quiet
        else ["활동적인 여행"]
        if active
        else [],
        activity_intensity="low" if quiet else "high" if active else None,
        max_travel_minutes=60 if quiet else None,
        confirmed=False,
    )
    return {
        "mood": mood,
        "confirmation": copy(
            locale, "mood_quiet" if quiet else "mood_active" if active else "mood_other"
        ),
        "scope": "this_trip_only",
        "applied": False,
    }


def create_router(settings):
    auth = require_principal(settings, allow_local_operator=True)

    class PrivateRoute(APIRoute):
        def get_route_handler(self):
            original = super().get_route_handler()

            async def bounded(request: Request):
                auth(request)
                if request.method not in {"GET", "HEAD"}:
                    body = bytearray()
                    async for chunk in request.stream():
                        body.extend(chunk)
                        if len(body) > 64000:
                            raise HTTPException(413, "travel_input_limit")
                    request._body = bytes(body)
                try:
                    response = await original(request)
                except psycopg.Error:
                    raise HTTPException(503, "TRAVEL_STORAGE_UNAVAILABLE") from None
                response.headers["Cache-Control"] = "private, no-store"
                return response

            return bounded

    router = APIRouter(
        prefix="/api/data/travel", tags=["travel"], route_class=PrivateRoute
    )
    Actor = Annotated[Principal, Depends(auth)]

    @router.get("/capabilities")
    async def capabilities(actor: Actor):
        from app.travel.directions import availability

        return {
            "contract_version": "pongdang-travel.v1",
            "timezone": "Asia/Seoul",
            "features": [
                "preferences",
                "recommendations",
                "comparison",
                "trip_drafts",
                "saved_plans",
                "foreground_companion",
            ],
            "route_provider": availability(settings),
            "keyword_catalog": "/api/data/travel/keywords",
            "route_recommendation": "/api/data/travel/routes/recommend",
            "recommendation_stages": ["places_activities", "route_on_explicit_request"],
            "price_provider": "unconfigured",
            "background_notifications": False,
            "images": [],
            "image_status": "licensed_card_images_unconfigured",
            "languages": await Catalog(settings, datetime.now(UTC)).languages(),
            "policy": {
                "version": "explicit-preference.v1",
                "weights": WEIGHTS,
                "meaning": "preference_match_only",
                "safety_score": None,
            },
            "tags": [
                "조용한 휴식",
                "온천",
                "물멍",
                "서핑",
                "자연 풍경",
                "짧은 이동",
                "아이와 함께",
                "인파 회피",
                "사진 촬영",
            ],
            "card_actions": ["like", "dislike", "skip", "undo_by_deleting_signal"],
        }

    @router.get("/keywords")
    def keyword_options(actor: Actor):
        from app.travel.keywords import catalogue

        return catalogue()

    @router.get("/preferences")
    def get_preferences(actor: Actor):
        return storage.profile(settings, actor.subject)

    @router.put("/preferences")
    def put_preferences(body: PreferenceUpdate, actor: Actor):
        return storage.save_profile(settings, actor.subject, body)

    @router.get("/signals")
    def get_signals(
        actor: Actor,
        limit: int = Query(100, ge=1, le=100),
        offset: int = Query(0, ge=0, le=10000),
        spot_id: int | None = Query(None, gt=0, le=2**53 - 1),
        kind: SignalKind | None = None,
    ):
        return {
            "rows": storage.signals(
                settings,
                actor.subject,
                limit=limit,
                offset=offset,
                spot_id=spot_id,
                kind=kind,
            ),
            "limit": limit,
            "offset": offset,
        }

    @router.post("/signals", status_code=201)
    def post_signal(body: SignalInput, actor: Actor):
        return storage.save_signal(settings, actor.subject, body)

    @router.delete("/signals/{signal_id}", status_code=204)
    def remove_signal(signal_id: UUID, actor: Actor):
        storage.delete_signal(settings, actor.subject, signal_id.hex)
        return Response(status_code=204)

    @router.delete("/history", status_code=204)
    def reset_history(actor: Actor, reset_profile: bool = False):
        storage.reset_history(settings, actor.subject, reset_profile=reset_profile)
        return Response(status_code=204)

    @router.post("/mood/proposal")
    def propose_mood(body: MoodInput, actor: Actor):
        return mood_proposal(body.text, body.locale)

    @router.post("/mood/profile")
    def promote_mood(body: MoodPromotion, actor: Actor):
        if not body.mood.confirmed:
            raise HTTPException(422, "mood_confirmation_required")
        preference = storage.profile(settings, actor.subject)["preference"]
        preference.tags = list(dict.fromkeys([*preference.tags, *body.mood.tags]))
        if body.mood.activity_intensity:
            preference.activity_intensity = body.mood.activity_intensity
        if body.mood.max_travel_minutes:
            preference.max_travel_minutes = body.mood.max_travel_minutes
        return storage.save_profile(
            settings,
            actor.subject,
            PreferenceUpdate(
                preference=preference, expected_revision=body.expected_revision
            ),
        )

    @router.post("/recommendations", response_model=RecommendationResult)
    async def recommendations(body: RecommendationInput, actor: Actor):
        return await recommend(settings, actor.subject, body)

    from app.travel.routing import RouteRecommendationInput, recommend_route

    @router.post("/routes/recommend")
    async def route_recommendations(body: RouteRecommendationInput, actor: Actor):
        try:
            async with asyncio.timeout(45):
                return await recommend_route(settings, actor.subject, body)
        except TimeoutError:
            raise HTTPException(503, "route_calculation_timeout") from None

    @router.post("/compare")
    async def compare(body: ComparisonInput, actor: Actor):
        now = datetime.now(UTC)
        selection = tokens.decode(settings, actor.subject, body.selection_token, now)
        if len(set(body.ranks)) != len(body.ranks) or any(
            r < 1 or r > len(selection["spot_ids"]) for r in body.ranks
        ):
            raise HTTPException(422, "selected_rank_not_found")
        ids = [selection["spot_ids"][rank - 1] for rank in body.ranks]
        catalog = Catalog(settings, now)
        places = await catalog.places(ids)
        request = TravelRequest.model_validate(selection["request"])
        restrictions = await catalog.restrictions(ids, request)
        return {
            "queried_at": now,
            "request": request,
            "rows": [
                {
                    "original_rank": rank,
                    "place": places[sid],
                    "restrictions": restrictions[sid],
                    "conditions": await catalog.conditions(sid, request),
                }
                for rank, sid in zip(body.ranks, ids, strict=True)
            ],
        }

    @router.post("/plans/draft", response_model=TripPlan)
    async def draft(body: PlanInput, actor: Actor):
        return await draft_plan(settings, actor.subject, body)

    @router.post("/plans", response_model=TripPlan, status_code=201)
    async def save(body: PlanInput, actor: Actor):
        plan = await draft_plan(settings, actor.subject, body)
        return await asyncio.to_thread(storage.save_plan, settings, actor.subject, plan)

    @router.get("/plans")
    def get_plans(
        actor: Actor,
        limit: int = Query(100, ge=1, le=100),
        offset: int = Query(0, ge=0, le=10000),
    ):
        return {
            "rows": storage.plans(settings, actor.subject, limit=limit, offset=offset),
            "limit": limit,
            "offset": offset,
        }

    @router.get("/plans/{plan_id}", response_model=TripPlan)
    def get_plan(plan_id: UUID, actor: Actor):
        return storage.get_plan(settings, actor.subject, plan_id.hex)

    @router.put("/plans/{plan_id}", response_model=TripPlan)
    async def update(plan_id: UUID, body: PlanUpdate, actor: Actor):
        previous = await asyncio.to_thread(
            storage.get_plan, settings, actor.subject, plan_id.hex
        )
        if previous.revision != body.expected_revision:
            raise HTTPException(409, "plan_revision_conflict")
        preserve_fixed(previous, body)
        plan = await draft_plan(settings, actor.subject, body)
        return await asyncio.to_thread(
            storage.save_plan,
            settings,
            actor.subject,
            plan,
            identifier=plan_id.hex,
            expected=body.expected_revision,
        )

    @router.delete("/plans/{plan_id}", status_code=204)
    def remove_plan(plan_id: UUID, actor: Actor):
        storage.delete_plan(settings, actor.subject, plan_id.hex)
        return Response(status_code=204)

    @router.post("/sessions", response_model=TripSession, status_code=201)
    def start(body: SessionStart, actor: Actor):
        return companion.start_session(settings, actor.subject, body)

    @router.get("/sessions/{session_id}", response_model=TripSession)
    def get_session(session_id: UUID, actor: Actor):
        return companion.get_session(settings, actor.subject, session_id.hex)

    @router.get("/sessions")
    def get_sessions(
        actor: Actor,
        limit: int = Query(100, ge=1, le=100),
        offset: int = Query(0, ge=0, le=10000),
    ):
        return {
            "rows": companion.sessions(
                settings, actor.subject, limit=limit, offset=offset
            ),
            "limit": limit,
            "offset": offset,
        }

    @router.post("/sessions/{session_id}/refresh")
    async def refresh(session_id: UUID, body: SessionRefresh, actor: Actor):
        return await companion.refresh(settings, actor.subject, session_id.hex, body)

    @router.put("/sessions/{session_id}/settings", response_model=TripSession)
    def notification_settings(session_id: UUID, body: SessionSettings, actor: Actor):
        return companion.change_session(
            settings, actor.subject, session_id.hex, notification_update=body
        )

    @router.post("/sessions/{session_id}/end", response_model=TripSession)
    def end(session_id: UUID, actor: Actor):
        return companion.change_session(
            settings, actor.subject, session_id.hex, end=True
        )

    @router.get("/sessions/{session_id}/events")
    def get_events(
        session_id: UUID,
        actor: Actor,
        limit: int = Query(100, ge=1, le=100),
        offset: int = Query(0, ge=0, le=10000),
    ):
        return {
            "rows": companion.events(
                settings, actor.subject, session_id.hex, limit=limit, offset=offset
            ),
            "limit": limit,
            "offset": offset,
        }

    @router.post("/sessions/{session_id}/events/{event_id}/ack")
    def ack(session_id: UUID, event_id: UUID, actor: Actor):
        return companion.acknowledge(
            settings, actor.subject, session_id.hex, event_id.hex
        )

    return router
