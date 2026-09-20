"""Pure policy and trust-boundary tests, including absence of required evidence."""

import asyncio
from datetime import UTC, date, datetime, timedelta
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from app.ai.chat import ChatRequest, ResponsePlan, SectionPlan, validate_plan
from app.ai.provider import ProviderError
from app.travel.chat import RequestPatch, TravelToolSession, apply_patch
from app.travel.companion import event_proposals, present
from app.travel.models import (
    Evidence,
    NotificationSettings,
    PlanInput,
    PlanStopInput,
    PlanUpdate,
    SignalInput,
    TravelPreference,
    TravelRequest,
    TripSession,
)
from app.travel.plans import RouteQuote, draft_plan, preserve_fixed
from app.travel.recommend import rank_places

NOW = datetime(2026, 9, 15, 0, tzinfo=UTC)
DAY = date(2026, 9, 15)


def place(sid=1, tags=None):
    return {
        "spot_id": sid,
        "name": f"Isolated registered {sid}",
        "region": "isolated",
        "address": "isolated",
        "kind": "beach",
        "catalog_tags": tags or ["해변"],
        "evidence": Evidence(
            evidence_id=f"catalog:test:{sid}",
            provider="TEST",
            fetched_at=NOW,
            status="available",
        ),
    }


class CatalogFixture:
    async def places(self, ids):
        return {sid: place(sid) for sid in ids}

    async def restrictions(self, ids, request):
        return {sid: [] for sid in ids}

    async def conditions(self, sid, request):
        return {
            "status": "unknown",
            "facts": [],
            "forecast_status": "outside_forecast_horizon",
        }


def request(**changes):
    return TravelRequest(
        dates=[DAY],
        origin={"label": "explicit origin"},
        departure_time="09:00",
        return_by="20:00",
        **changes,
    )


def stop(sid=1, **changes):
    return PlanStopInput(item_id=str(sid), spot_id=sid, day=DAY, **changes)


def test_wishes_mood_and_negative_review_never_become_place_facts():
    data = place()
    original = dict(data)
    preference = TravelPreference(tags=["#아이와함께_얕은물"], learning_enabled=True)
    signals = [
        {
            "id": "negative",
            "payload": {
                "kind": "review",
                "action": "negative",
                "tags": ["해변"],
                "spot_id": 1,
            },
        }
    ]
    ranked, _ = rank_places(
        [data],
        TravelRequest(mood={"text": "지친다", "tags": ["해변"]}),
        preference,
        signals,
        {},
    )
    assert ranked[0][1] == []
    assert "#아이와함께_얕은물" in ranked[0][2]
    assert data == original
    confirmed = TravelRequest(mood={"text": "쉼", "tags": ["해변"], "confirmed": True})
    ranked, _ = rank_places([data], confirmed, TravelPreference(), [], {})
    assert ranked[0][1][0].source == "mood"


def test_explicit_preference_wins_and_official_restriction_cannot_be_relaxed():
    ranked, excluded = rank_places(
        [place(1), place(2, ["온천"])],
        TravelRequest(),
        TravelPreference(tags=["온천"]),
        [],
        {2: [{"blocked": True, "evidence_id": "closure"}]},
    )
    assert [row[0]["spot_id"] for row in ranked] == [1]
    assert excluded[0]["reason"] == "official_restriction"


def test_form_chat_patch_preserves_other_fields_and_model_cannot_confirm_mood():
    original = request(budget={"amount": 100000}, preferred_tags=["물멍"])
    changed = apply_patch(
        original,
        RequestPatch(
            companion_type="children",
            mood={"text": "tired", "tags": ["조용한 휴식"], "confirmed": True},
        ),
    )
    assert changed.budget == original.budget
    assert changed.dates == original.dates
    assert changed.preferred_tags == original.preferred_tags
    assert changed.mood.confirmed is False
    assert changed.companion_type == "children"
    assert changed.activity == "relax"


@pytest.mark.parametrize(
    "field,value",
    [
        ("fact_ids", ["invented"]),
        ("candidate_ids", ["spot:999"]),
        ("structured_ids", ["invented-order"]),
    ],
)
def test_model_cannot_invent_fact_place_or_itinerary_identity(field, value):
    section = {
        "title": "itinerary",
        "fact_ids": [],
        "candidate_ids": [],
        "structured_ids": [],
    }
    section[field] = value
    plan = ResponsePlan(
        intent="explain", clarification=None, sections=[SectionPlan(**section)]
    )
    session = SimpleNamespace(
        facts={}, candidates={}, structured={}, features=["travel_draft"]
    )
    with pytest.raises(ProviderError, match="ai_output_unverified"):
        validate_plan(plan, session, ChatRequest(message="일정 만들어줘"))


def test_recommendation_rank_ids_are_not_accepted_as_candidates():
    plan = ResponsePlan(
        intent="explain",
        clarification=None,
        sections=[
            SectionPlan(
                title="recommendations",
                fact_ids=[],
                candidate_ids=["recommendation:1:7"],
                structured_ids=[],
            )
        ],
    )
    session = SimpleNamespace(
        facts={},
        candidates={"spot:7": {"candidate_id": "spot:7"}},
        structured={},
        features=["travel_recommend"],
        travel_results={"recommendations": {}},
    )
    with pytest.raises(ProviderError, match="ai_output_unverified"):
        validate_plan(plan, session, ChatRequest(message="추천해줘"))


def test_spot_candidate_ids_from_recommend_session_are_accepted():
    plan = ResponsePlan(
        intent="explain",
        clarification=None,
        sections=[
            SectionPlan(
                title="recommendations",
                fact_ids=[],
                candidate_ids=["spot:7"],
                structured_ids=["travel_recommend:abc"],
            )
        ],
    )
    session = SimpleNamespace(
        facts={},
        candidates={"spot:7": {"candidate_id": "spot:7"}},
        structured={"travel_recommend:abc": {}},
        features=["travel_recommend"],
        travel_results={"recommendations": {}},
    )
    validate_plan(plan, session, ChatRequest(message="추천해줘"))


def test_location_clarify_after_travel_recommend_is_unverified():
    plan = ResponsePlan(intent="clarify", clarification="location", sections=[])
    session = SimpleNamespace(
        facts={}, candidates={}, structured={}, features=["travel_recommend"]
    )
    with pytest.raises(ProviderError, match="ai_output_unverified"):
        validate_plan(plan, session, ChatRequest(message="추천해줘"))


def test_location_clarify_before_recommend_remains_allowed():
    plan = ResponsePlan(intent="clarify", clarification="location", sections=[])
    session = SimpleNamespace(facts={}, candidates={}, structured={}, features=[])
    validate_plan(plan, session, ChatRequest(message="어디가 좋아?"))


def test_recommend_tool_payload_uses_spot_candidate_ids(monkeypatch):
    from app.config import Settings

    row = SimpleNamespace(
        recommendation_id="recommendation:1:7",
        spot_id=7,
        rank=1,
        name="경포",
        region="강릉",
        confirmed={
            "kind": "beach",
            "latitude": 37.8,
            "longitude": 128.9,
            "catalog_verified_at": NOW.isoformat(),
        },
        reason="등록된 장소",
        activities=[],
        unknown_conditions=[],
        evidence=[SimpleNamespace(evidence_id="e1", provider="TEST")],
        actions={"view": "#spots"},
    )

    async def fake_recommend(*_args, **_kwargs):
        return SimpleNamespace(
            selection_token="tok",
            clarification=None,
            status="available",
            candidate_scope={},
            recommendations=[row],
            model_dump=lambda mode="json": {
                "recommendations": [
                    {"recommendation_id": "recommendation:1:7", "spot_id": 7}
                ]
            },
        )

    monkeypatch.setattr("app.travel.chat.recommend", fake_recommend)
    session = TravelToolSession(
        Settings(_env_file=None, postgres_password="offline-only"),
        NOW,
        body=ChatRequest(message="추천해줘", travel={}),
        owner="isolated",
        catalog=CatalogFixture(),
    )
    payload = asyncio.run(
        session.execute("travel_recommend", {"changes": {}, "limit": 1})
    )
    listed = payload["result"]["recommendations"][0]
    assert listed["candidate_id"] == "spot:7"
    assert "recommendation_id" not in listed
    assert "spot:7" in session.candidates
    assert (
        session.travel_results["recommendations"]["recommendations"][0][
            "recommendation_id"
        ]
        == "recommendation:1:7"
    )


def test_unknown_routes_keep_precision_and_total_cost_unknown_but_prove_conflicts():
    body = PlanInput(
        request=request(budget={"amount": 100}),
        stops=[stop(stay_minutes=720, cost={"amount": 500})],
    )
    plan = asyncio.run(
        draft_plan(None, "owner", body, now=NOW, catalog=CatalogFixture())
    )
    assert plan.days[0]["items"][0]["arrival_at"] is None
    assert plan.days[0]["return_at"] is None
    assert plan.cost["total_krw"] is None
    assert plan.cost["budget_status"] == "exceeded"
    assert {x["code"] for x in plan.conflicts} >= {
        "known_cost_exceeds_budget",
        "return_deadline_exceeded",
    }


class OfficialRoutes:
    status = "configured_test_adapter"

    async def quote(self, origin, destination, mode, departure_at):
        return RouteQuote(
            origin_key=origin,
            destination_key=destination,
            mode=mode,
            departure_at=departure_at,
            duration_minutes=30,
            provider="isolated_official_route",
            source_record_id="test-route",
            source_url="https://www.example.go.kr/route",
            fetched_at=NOW,
            valid_until=NOW + timedelta(hours=1),
            cost_krw=None,
        )


def test_verified_route_contract_counts_each_leg_stay_and_return():
    body = PlanInput(request=request(), stops=[stop(), stop(2)])
    plan = asyncio.run(
        draft_plan(
            None,
            "owner",
            body,
            now=NOW,
            catalog=CatalogFixture(),
            routes=OfficialRoutes(),
        )
    )
    items = plan.days[0]["items"]
    assert datetime.fromisoformat(items[0]["arrival_at"]).hour == 9
    assert datetime.fromisoformat(items[0]["arrival_at"]).minute == 30
    assert datetime.fromisoformat(items[0]["departure_at"]) <= datetime.fromisoformat(
        items[1]["arrival_at"]
    )
    assert datetime.fromisoformat(plan.days[0]["return_at"]).hour == 12
    assert len(plan.legs) == 3
    assert plan.status == "draft"  # Opening/reservation/price evidence still absent.


def test_fixed_items_require_explicit_unlock_and_conflicting_anchors_are_reported():
    fixed = stop(fixed=True, requested_arrival="10:00", stay_minutes=120)
    body = PlanInput(
        request=request(), stops=[fixed, stop(2, fixed=True, requested_arrival="10:30")]
    )
    plan = asyncio.run(
        draft_plan(None, "owner", body, now=NOW, catalog=CatalogFixture())
    )
    assert any(
        c["code"] == "overlapping_or_unreachable_fixed_time" for c in plan.conflicts
    )
    changed = PlanUpdate(request=request(), stops=[stop(2)], expected_revision=1)
    with pytest.raises(HTTPException, match="fixed_item_requires_explicit_unlock"):
        preserve_fixed(plan, changed)
    changed.unlock_item_ids = ["1", "2"]
    preserve_fixed(plan, changed)


def session():
    return TripSession(
        session_id="test-session",
        plan_id="test-plan",
        plan_revision=1,
        revision=1,
        state="active",
        started_at=NOW,
        location_status="denied",
        notifications=NotificationSettings(),
        last_seen_at=NOW,
        last_refresh_at=NOW,
        snapshot={
            "data_status": "available",
            "valid_until": (NOW + timedelta(seconds=30)).isoformat(),
        },
    )


def test_foreground_heartbeat_and_evidence_expiry_are_separate():
    assert present(session(), NOW).monitoring is True
    expired = present(session(), NOW + timedelta(seconds=31))
    assert expired.connection_status == "connected"
    assert expired.monitoring is False
    assert expired.snapshot["data_status"] == "stale"
    disconnected = present(session(), NOW + timedelta(minutes=2))
    assert disconnected.connection_status == "disconnected"
    assert disconnected.monitoring is False


def tide_fact(**changes):
    meta = {
        "kind": "low",
        "provider": "khoa_tide_extrema",
        "spot_id": 1,
        "spatial_relation": "representative_station",
        "mapping_evidence_ref": "reviewed",
        "state": "available",
        "data_kind": "official_forecast",
        "source_key": "slot",
        "revision_id": 2,
        "previous_revision_id": 1,
        "event_at": (NOW + timedelta(minutes=30)).isoformat(),
        "valid_until": (NOW + timedelta(hours=1)).isoformat(),
        "fetched_at": NOW.isoformat(),
    }
    return {"feature": "tides", "metadata": meta | changes}


def test_low_tide_event_requires_official_current_mapped_forecast_and_target_window():
    events = event_proposals(session(), {}, [tide_fact()], NOW)
    assert len(events) == 1
    assert events[0]["kind"] == "low_tide"
    assert events[0]["previous_key"] == "tide:slot:1"
    assert event_proposals(session(), {}, [], NOW) == []
    for change in (
        {"state": "stale"},
        {"mapping_evidence_ref": None},
        {"event_at": (NOW + timedelta(minutes=31)).isoformat()},
        {"provider": "unknown_provider"},
    ):
        assert event_proposals(session(), {}, [tide_fact(**change)], NOW) == []


@pytest.mark.parametrize(
    "signal",
    [
        {"kind": "visit", "action": "like", "spot_id": 1},
        {"kind": "visit", "action": "confirm", "spot_id": 1},
        {"kind": "review", "action": "positive", "spot_id": 1, "satisfaction": 1},
    ],
)
def test_clicks_and_negative_reviews_cannot_be_positive_visits(signal):
    with pytest.raises(ValidationError):
        SignalInput(**signal)


def test_model_cannot_silently_relax_mandatory_conditions():
    from app.ai.tools import ToolError

    original = TravelRequest(
        required=[{"attribute": "child_friendly", "value": "true"}]
    )
    with pytest.raises(
        ToolError, match="required_relaxation_needs_explicit_form_change"
    ):
        apply_patch(original, RequestPatch(required=[]))


def test_observation_correction_and_new_observation_remain_distinct():
    def fact(snapshot, at):
        return {
            "feature": "place_conditions",
            "spot_id": 1,
            "data_status": "available",
            "metadata": {
                "relation": "representative_station",
                "mapping_id": "reviewed",
                "evidence": [
                    {
                        "mode": "observation",
                        "is_missing": False,
                        "unit": "degC",
                        "numeric_value": 20,
                        "name": "water_temperature",
                        "provider": "official",
                        "source_record_id": "station-temperature",
                        "snapshot_id": snapshot,
                        "source_state": "recorded",
                        "metric_state": "recorded",
                        "observed_at": at.isoformat(),
                        "fetched_at": NOW.isoformat(),
                        "valid_until": (NOW + timedelta(hours=1)).isoformat(),
                    }
                ],
            },
        }

    state = session()
    state.snapshot["facts"] = [fact(1, NOW - timedelta(minutes=10))]
    corrected = event_proposals(state, {}, [fact(2, NOW - timedelta(minutes=10))], NOW)
    assert corrected[0]["kind"] == "data_corrected"
    assert corrected[0]["previous_key"] is not None
    updated = event_proposals(state, {}, [fact(3, NOW)], NOW)
    assert updated[0]["kind"] == "data_updated"
    assert updated[0]["previous_key"] is None
    unknown_mapping = fact(3, NOW)
    unknown_mapping["metadata"]["mapping_id"] = None
    assert event_proposals(state, {}, [unknown_mapping], NOW) == []


def test_visit_learning_is_optional_and_negative_experience_is_not_rewarded():
    signal = {
        "id": "visit",
        "payload": {"kind": "visit", "action": "confirm", "spot_id": 1, "tags": []},
    }
    p = TravelPreference(learning_enabled=True)
    ranked, _ = rank_places([place()], TravelRequest(), p, [signal], {})
    assert ranked[0][1][0].source == "confirmed_visit"
    negative = {
        "id": "review",
        "payload": {
            "kind": "review",
            "action": "negative",
            "spot_id": 1,
            "tags": ["해변"],
        },
    }
    ranked, _ = rank_places([place()], TravelRequest(), p, [negative, signal], {})
    assert ranked[0][1] == []
    p.learning_enabled = False
    ranked, _ = rank_places([place()], TravelRequest(), p, [signal], {})
    assert ranked[0][1] == []


def test_meal_and_lodging_roles_require_registered_classification():
    from app.travel.catalog import catalog_role

    assert (
        catalog_role(
            {"provider": "TOURAPI_KOREAN", "type": "tourism", "category": "39"}
        )
        == "meal"
    )
    assert (
        catalog_role(
            {"provider": "tourapi_japanese", "type": "tourism", "category": "80"}
        )
        == "lodging"
    )
    assert (
        catalog_role({"provider": "UNKNOWN", "type": "tourism", "category": "39"})
        == "unknown"
    )
    assert (
        catalog_role(
            {"provider": "KAKAO_LOCAL", "type": "facility", "category": "약국"}
        )
        == "unknown"
    )


def test_multiday_drafts_keep_days_and_lodging_selection_unresolved():
    tomorrow = DAY + timedelta(days=1)
    request_body = TravelRequest(
        dates=[DAY, tomorrow],
        day_trip=False,
        origin={"label": "origin"},
        departure_time="09:00",
        return_by="20:00",
    )
    plan = asyncio.run(
        draft_plan(
            None,
            "owner",
            PlanInput(
                request=request_body,
                stops=[stop(), stop(2).model_copy(update={"day": tomorrow})],
            ),
            now=NOW,
            catalog=CatalogFixture(),
        )
    )
    assert [d["date"] for d in plan.days] == [DAY.isoformat(), tomorrow.isoformat()]
    assert any("lodging_selection_required" in x for x in plan.unresolved)
    assert all(
        i["reservation_status"] == "not_booked" for d in plan.days for i in d["items"]
    )


@pytest.mark.parametrize("activity", ["swim", "surf", "rafting"])
def test_emotion_does_not_authorize_model_to_infer_water_activity(activity):
    from app.ai.tools import ToolError
    from app.config import Settings

    session = TravelToolSession(
        Settings(),
        NOW,
        body=ChatRequest(message="요즘 너무 지친다", travel={}),
        owner="isolated",
        catalog=CatalogFixture(),
    )
    with pytest.raises(ToolError, match="explicit_activity_intent_required"):
        asyncio.run(
            session.execute("travel_recommend", {"changes": {"activity": activity}})
        )
    assert session.travel_context.request.activity == "relax"


def test_province_ties_preserve_district_order_but_explicit_preferences_win():
    district_order = [place(1), place(1000), place(1001), place(2)]
    ranked, _ = rank_places(
        district_order, TravelRequest(region="gangwon"), TravelPreference(), [], {}
    )
    assert [row[0]["spot_id"] for row in ranked] == [1, 1000, 1001, 2]
    local, _ = rank_places(
        district_order, TravelRequest(region="강릉"), TravelPreference(), [], {}
    )
    assert [row[0]["spot_id"] for row in local] == [1, 2, 1000, 1001]
    district_order[-1] = place(2, ["온천"])
    preferred, _ = rank_places(
        district_order,
        TravelRequest(region="gangwon"),
        TravelPreference(tags=["온천"]),
        [],
        {},
    )
    assert [row[0]["spot_id"] for row in preferred] == [2, 1, 1000, 1001]


def test_province_environment_shortlist_and_equal_scores_preserve_districts(
    monkeypatch,
):
    from app.config import Settings
    from app.travel import storage
    from app.travel.models import RecommendationInput
    from app.travel.recommend import recommend

    ordered = [place(1), place(1000), *(place(i) for i in range(2, 32))]
    for row in ordered:
        row["catalog_locale"] = "ko"

    class ProvinceCatalog(CatalogFixture):
        async def search(self, request):
            return ordered, {"scan_order": "round_robin_district_then_spot_id"}

    class MissingEnvironment:
        def __init__(self):
            self.calls = []

        async def compare(self, sid, request, target):
            self.calls.append(sid)
            return {"status": "incomplete", "preference_points": None}

    monkeypatch.setattr(storage, "signals", lambda *_: [])
    environment = MissingEnvironment()
    result = asyncio.run(
        recommend(
            Settings(
                _env_file=None,
                sso_proxy_secret="offline-test-secret-more-than-32-characters",
                postgres_password="offline-test-password",
            ),
            "offline-test-owner",
            RecommendationInput(
                request=TravelRequest(
                    region="gangwon",
                    keyword_selection=[
                        {"category": "weather", "values": ["dry"]},
                    ],
                ),
                preference=TravelPreference(),
            ),
            now=NOW,
            catalog=ProvinceCatalog(),
            environment=environment,
        )
    )
    assert len(environment.calls) == 30
    assert environment.calls[:3] == [1, 1000, 2]
    assert [row.spot_id for row in result.recommendations] == [1, 1000, 2, 3, 4]
    assert (
        result.candidate_scope["environment_comparison"]["shortlist_order"]
        == "explicit_preference_then_district_round_robin"
    )
