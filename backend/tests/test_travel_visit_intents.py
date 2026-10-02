"""Separate, bounded catalogue reads preserve every requested visit."""

import asyncio
from contextlib import asynccontextmanager
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from pydantic import SecretStr, ValidationError
from test_ai_chat import MemoryBudget, ScriptedProvider
from test_ai_intent import MESSAGE, decision
from test_condition_score import envelope
from test_travel_integration import BASE, trip_request
from test_travel_integration import travel_db as _travel_db

from app.ai.chat import ChatRequest
from app.ai.tools import ToolError
from app.config import Settings
from app.ingestion.models import Place, SourceBatch
from app.ingestion.storage import store_batch
from app.travel import published, storage, tokens
from app.travel.catalog import Catalog, matches_visit_intent
from app.travel.chat import (
    RequestPatch,
    TravelToolSession,
    apply_patch,
    assemble_travel,
    travel_converse,
)
from app.travel.keywords import choices
from app.travel.models import (
    Evidence,
    RecommendationInput,
    TravelPreference,
    TravelRequest,
)
from app.travel.recommend import recommend

NOW = datetime(2026, 10, 1, 0, tzinfo=UTC)
travel_db = _travel_db
VISITS = [
    {"place_type": "beach", "part_of_day": "morning"},
    {"place_type": "valley", "part_of_day": "afternoon"},
]


def settings():
    return Settings(
        _env_file=None,
        postgres_password="offline-test",
        sso_proxy_secret="offline-test-secret-more-than-32-characters",
    )


def place(sid, kind, *, category="", provider="TEST"):
    return {
        "spot_id": sid,
        "name": f"등록 {kind} {sid}",
        "region": "강릉",
        "address": "강릉",
        "kind": kind,
        "category": category,
        "catalog_tags": ["해변"]
        if kind == "beach"
        else ["계곡"]
        if kind == "valley"
        else [],
        "catalog_role": "meal" if kind == "restaurant" else "visit",
        "catalog_locale": "ko",
        "latitude": 37.8,
        "longitude": 128.9,
        "catalog_verified_at": NOW,
        "evidence": Evidence(
            evidence_id=f"catalog:{provider}:{sid}",
            provider=provider,
            fetched_at=NOW,
            status="available",
        ),
    }


class VisitCatalog:
    def __init__(self, *, valley_status="available"):
        self.now, self.reader = NOW, object()
        self.requests = []
        self.valley_status = valley_status

    async def search(self, request):
        self.requests.append(request)
        kind = request.visit_intents[0].place_type
        if kind == "valley" and self.valley_status == "query_failed":
            raise HTTPException(503, "offline_catalog_failure")
        rows = [place(1, "beach"), place(2, "beach")]
        if self.valley_status == "available":
            rows += [place(3, "valley"), place(4, "valley")]
        return rows, {"candidate_limit": 300, "sql_page_size": 100}

    async def restrictions(self, ids, request):
        return {sid: [] for sid in ids}


@pytest.fixture
def offline_reads(monkeypatch):
    monkeypatch.setattr(storage, "signals", lambda *_: [])

    async def read(_reader, queries, *, now):
        return [envelope(spot_id=query.spot_id) for query in queries]

    monkeypatch.setattr(published, "read_condition_set", read)


def request(**changes):
    return TravelRequest(
        region="강릉",
        dates=[NOW.date()],
        origin={"label": "강릉역"},
        visit_intents=VISITS,
        keyword_selection=[
            {"category": "place_type", "values": ["beach"]},
            {"category": "activity", "values": ["swim"]},
        ],
        **changes,
    )


def test_multi_visit_queries_override_old_beach_filter_and_bind_all_ranks(
    offline_reads,
):
    catalog = VisitCatalog()
    original = request()
    result = asyncio.run(
        recommend(
            settings(),
            "owner",
            RecommendationInput(request=original, preference=TravelPreference()),
            now=NOW,
            catalog=catalog,
        )
    )
    assert [choices(item, "place_type") for item in catalog.requests] == [
        ["beach"],
        ["valley"],
    ]
    assert all(choices(item, "activity") == [] for item in catalog.requests)
    assert [row.spot_id for row in result.recommendations] == [1, 3, 2, 4]
    assert [row.rank for row in result.recommendations] == [1, 2, 3, 4]
    assert [
        group["intent"]["part_of_day"] for group in result.recommendation_groups
    ] == ["morning", "afternoon"]
    assert [
        len(group["result"]["recommendations"])
        for group in result.recommendation_groups
    ] == [2, 2]
    assert all(
        group["result"]["selection_token"] is None
        for group in result.recommendation_groups
    )
    decoded = tokens.decode(settings(), "owner", result.selection_token, NOW)
    assert decoded["spot_ids"] == [1, 3, 2, 4]
    assert decoded["request"] == original.model_dump(mode="json")
    with pytest.raises(HTTPException):
        tokens.decode(settings(), "another-owner", result.selection_token, NOW)


@pytest.mark.parametrize("valley_status", ["available", "no_data", "query_failed"])
def test_chat_renders_every_visit_and_preserves_missing_or_failed_stage(
    offline_reads, valley_status
):
    session = TravelToolSession(
        settings(),
        NOW,
        body=ChatRequest(
            message="오전엔 해변으로 갔다가 오후에는 계곡에 가고 싶어.",
            travel={"request": request(), "preference": {}},
        ),
        owner="owner",
        catalog=VisitCatalog(valley_status=valley_status),
    )
    asyncio.run(session.execute("travel_recommend", {"limit": 5}))
    response = assemble_travel(SimpleNamespace(status="partial", answer=""), session)
    assert response.answer.index("오전 · 해변") < response.answer.index("오후 · 계곡")
    assert "등록 beach 1" in response.answer
    valley = response.travel_results["recommendation_groups"][1]["result"]
    if valley_status == "available":
        assert "등록 valley 3" in response.answer
        assert valley["status"] == "partial"
    elif valley_status == "no_data":
        assert valley["status"] == "no_data"
        assert "후보가 없어요" in response.answer.split("오후 · 계곡")[1]
    else:
        assert valley["status"] == "query_failed"
        assert "조회하지 못했어요" in response.answer.split("오후 · 계곡")[1]
    assert response.travel.request.visit_intents == request().visit_intents
    assert "arrival_at" not in response.travel_results["recommendations"]


def test_visit_answer_opens_with_both_visits_and_readable_regions(offline_reads):
    class RegionalCatalog(VisitCatalog):
        async def search(self, request):
            rows, scope = await super().search(request)
            for row in rows:
                row["region"] = "51:170" if row["kind"] == "beach" else "51:780"
                row["address"] = ""
            return rows, scope

    original = request()
    original.origin = None
    original.dates = []
    session = TravelToolSession(
        settings(),
        NOW,
        body=ChatRequest(
            message=MESSAGE,
            travel={
                "request": original,
                "preference": {"tags": ["해변", "조용한 휴식"]},
            },
        ),
        owner="owner",
        catalog=RegionalCatalog(),
    )
    asyncio.run(session.execute("travel_recommend", {"limit": 5}))
    response = assemble_travel(
        SimpleNamespace(status="partial", answer="", clarification=None), session
    )
    opening = response.answer.split("\n\n")[0]
    assert "오전 · 해변: 등록 beach 1 (동해시)" in opening
    assert "오후 · 계곡: 등록 valley 3 (철원군)" in opening
    assert "등록 beach 2 (동해시)" in opening
    assert "등록 valley 4 (철원군)" in opening
    assert "51:" not in response.answer
    assert response.clarification is None
    assert "이동 시간" in response.answer
    assert response.travel.request.origin is None
    assert response.travel.preference.tags == ["해변", "조용한 휴식"]
    valley = response.travel_results["recommendation_groups"][1]["result"]
    for row in valley["recommendations"]:
        assert "해변" not in row["unknown_conditions"]
        assert "조용한 휴식" in row["unknown_conditions"]
        assert "계곡" in {match["tag"] for match in row["matched_preferences"]}


def test_cafe_is_a_positive_provider_category_not_every_restaurant():
    cafe_request = TravelRequest(
        visit_intents=[{"place_type": "cafe"}], place_role="meal"
    )
    cafe = place(
        1, "restaurant", category="음식점 > 카페 > 커피전문점", provider="KAKAO_LOCAL"
    )
    meal = place(2, "restaurant", category="음식점 > 한식", provider="KAKAO_LOCAL")
    generic = place(3, "restaurant", category="39", provider="TOURAPI_KOREAN")
    assert matches_visit_intent(cafe_request, cafe)
    assert not matches_visit_intent(cafe_request, meal)
    assert not matches_visit_intent(cafe_request, generic)
    assert not matches_visit_intent(cafe_request, place(4, "beach"))
    restaurant_request = TravelRequest(
        visit_intents=[{"place_type": "restaurant"}], place_role="meal"
    )
    assert matches_visit_intent(restaurant_request, meal)
    assert not matches_visit_intent(restaurant_request, cafe)


def test_saved_plan_preview_does_not_replace_visit_results(offline_reads):
    session = TravelToolSession(
        settings(),
        NOW,
        body=ChatRequest(
            message=MESSAGE, travel={"request": request(), "preference": {}}
        ),
        owner="owner",
        catalog=VisitCatalog(),
    )
    asyncio.run(session.execute("travel_recommend", {}))
    session.travel_results["draft_plan"] = {
        "days": [
            {
                "date": NOW.date().isoformat(),
                "items": [{"name": "기존 일정 장소", "stay_minutes": 60}],
            }
        ]
    }
    response = assemble_travel(SimpleNamespace(status="partial", answer=""), session)
    assert "오전 · 해변" in response.answer and "오후 · 계곡" in response.answer
    assert "기존 일정 장소" in response.answer


def test_cafe_sql_applies_positive_category_before_bounded_read():
    queries = []

    class Reader:
        @asynccontextmanager
        async def connection(self):
            yield self

        async def execute(self, sql, params):
            queries.append((sql, params))
            return self

        async def fetchone(self):
            return {"count": 0}

    catalog = Catalog(settings(), NOW, reader=Reader())
    rows, scope = asyncio.run(
        catalog.search(
            TravelRequest(
                region="강릉",
                place_role="meal",
                visit_intents=[{"place_type": "cafe"}],
            )
        )
    )
    assert rows == []
    assert "p.provider='KAKAO_LOCAL' AND (p.category='음식점 > 카페'" in queries[0][0]
    assert "p.category LIKE '음식점 > 카페 > %%'" in queries[0][0]
    assert scope["candidate_limit"] == 300
    assert scope["sql_page_size"] == 100


def test_patch_accepts_visits_and_keeps_new_keyword_selection_with_transport():
    updated = apply_patch(
        TravelRequest(),
        RequestPatch(
            visit_intents=VISITS,
            transport="walking",
            keyword_selection=[
                {"category": "place_type", "values": ["valley"]},
                {"category": "transport", "values": ["driving"]},
            ],
        ),
    )
    assert choices(updated, "place_type") == ["valley"]
    assert choices(updated, "transport") == ["walking"]
    assert len(updated.visit_intents) == 2
    with pytest.raises(ValidationError):
        TravelRequest(visit_intents=[{"place_type": "beach"}] * 6)


def test_model_cannot_add_swimming_to_visit_intent_without_user_request():
    session = TravelToolSession(
        settings(),
        NOW,
        body=ChatRequest(message=MESSAGE, travel={}),
        owner="owner",
    )
    with pytest.raises(ToolError, match="explicit_activity_intent_required"):
        asyncio.run(
            session.execute(
                "travel_recommend",
                {
                    "changes": {
                        "visit_intents": [{"place_type": "beach", "activity": "swim"}],
                    }
                },
            )
        )
    assert session.travel_context.request.visit_intents == []


def test_private_saved_context_waits_for_prepare(monkeypatch):
    reads = []
    previous = SimpleNamespace(request=request())
    monkeypatch.setattr(
        storage, "get_plan", lambda *_: reads.append("plan") or previous
    )
    session = TravelToolSession(
        settings(),
        NOW,
        body=ChatRequest(message="추천해줘", travel={"plan_id": "saved-plan"}),
        owner="owner",
    )
    assert reads == []
    asyncio.run(session.prepare())
    assert reads == ["plan"]
    assert (
        session.travel_context.request.visit_intents == previous.request.visit_intents
    )


def test_public_recommendations_preserve_beach_valley_cafe_from_real_sql(
    travel_db, monkeypatch
):
    config, client, places, _ = travel_db
    store_batch(
        config,
        SourceBatch(
            provider="KAKAO_LOCAL",
            fetched_at=datetime.now(UTC),
            places=[
                Place(
                    source_id=f"isolated-{key}",
                    name=f"격리 {name}",
                    kind="beach_search_result",
                    latitude=37.81,
                    longitude=128.91,
                    category=category,
                    region="격리",
                )
                for key, name, category in [
                    ("valley", "계곡", "여행 > 관광,명소 > 계곡"),
                    ("cafe", "카페", "음식점 > 카페 > 커피전문점"),
                    ("restaurant", "한식집", "음식점 > 한식"),
                ]
            ],
        ),
    )
    wanted = VISITS + [{"place_type": "cafe", "part_of_day": "evening"}]
    original = trip_request() | {
        "visit_intents": wanted,
        "keyword_selection": [{"category": "place_type", "values": ["beach"]}],
        "must_include": [places["isolated-beach"]],
    }
    response = client.post(BASE + "/recommendations", json={"request": original})
    assert response.status_code == 200, response.text
    result = response.json()
    groups = result["recommendation_groups"]
    assert [group["intent"]["place_type"] for group in groups] == [
        "beach",
        "valley",
        "cafe",
    ]
    assert [group["result"]["recommendations"][0]["name"] for group in groups] == [
        "격리 해변",
        "격리 계곡",
        "격리 카페",
    ]
    assert all("격리 한식집" != row["name"] for row in result["recommendations"])
    assert len(result["recommendations"]) == 3
    assert [row["rank"] for row in result["recommendations"]] == [1, 2, 3]
    assert all(len(group["result"]["recommendations"]) <= 2 for group in groups)
    decoded = tokens.decode(
        config, "traveller-a", result["selection_token"], datetime.now(UTC)
    )
    assert decoded["spot_ids"] == [row["spot_id"] for row in result["recommendations"]]
    assert len(decoded["request"]["visit_intents"]) == 3

    from test_travel_route_order import Directions

    from app.travel import routing

    directions = Directions()
    monkeypatch.setattr(routing, "KakaoDirections", lambda *_, **__: directions)
    route = client.post(
        BASE + "/routes/recommend",
        json={
            "selection_token": result["selection_token"],
            "candidate_ranks": [1, 2, 3],
            "stop_count": 3,
            "preserve_order": True,
            "include_geometry": False,
            "request": original
            | {
                "dates": [(datetime.now(UTC) + timedelta(days=1)).date().isoformat()],
                "origin": {"label": "격리 해변", "spot_id": places["isolated-beach"]},
            },
        },
    )
    assert route.status_code == 200, route.text
    calculated = route.json()
    assert calculated["route_calculated"] is True
    assert calculated["route"]["spot_ids"] == decoded["spot_ids"]
    assert [item["name"] for item in calculated["route"]["items"]] == [
        "격리 해변",
        "격리 계곡",
        "격리 카페",
    ]


def test_luna_decision_queries_both_requested_visits_and_renders_real_sql(travel_db):
    config, _, _, _ = travel_db
    store_batch(
        config,
        SourceBatch(
            provider="KAKAO_LOCAL",
            fetched_at=datetime.now(UTC),
            places=[
                Place(
                    source_id="isolated-chat-valley",
                    name="격리 오후 계곡",
                    kind="beach_search_result",
                    latitude=37.81,
                    longitude=128.91,
                    category="여행 > 관광,명소 > 계곡",
                    region="격리",
                )
            ],
        ),
    )
    config = config.model_copy(
        update={
            "ai_provider": "auto",
            "ai_api_key": SecretStr("offline-test-key"),
        }
    )
    provider = ScriptedProvider(
        [decision(action="recommend", changes={"visit_intents": VISITS})]
    )
    account = MemoryBudget()
    response = asyncio.run(
        travel_converse(
            config,
            ChatRequest(
                message=MESSAGE,
                travel={
                    "request": trip_request()
                    | {
                        "keyword_selection": [
                            {"category": "place_type", "values": ["beach"]}
                        ],
                    }
                },
            ),
            "traveller-a",
            provider,
            budget_api=account,
        )
    )
    assert response.provider == "openai", response.reason_codes
    assert not response.fallback
    assert response.features == ["travel_recommend"]
    assert len(provider.bodies) == 1
    assert provider.bodies[0]["tools"] == []
    assert "오전 · 해변" in response.answer and "격리 해변" in response.answer
    assert "오후 · 계곡" in response.answer and "격리 오후 계곡" in response.answer
    groups = response.travel_results["recommendation_groups"]
    assert [group["intent"]["place_type"] for group in groups] == ["beach", "valley"]
    assert all(group["result"]["recommendations"] for group in groups)
    assert [turn.kind for turn in response.model_trace] == ["attempt", "scope", "tool"]
    assert response.model_trace[1].plan["changes"]["visit_intents"] == [
        {**intent, "activity": None} for intent in VISITS
    ]
