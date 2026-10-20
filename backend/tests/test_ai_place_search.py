"""District-plus-name searches must reach real candidates without losing scope."""

import asyncio
from datetime import UTC, datetime, timedelta

import pytest
from pydantic import SecretStr
from test_ai_chat import MemoryBudget, ScriptedProvider
from test_ai_reads import read_decision
from test_travel_integration import travel_db as _travel_db

from app.ai.chat import ChatRequest, converse
from app.ai.tools import ToolSession, search_place_predicate
from app.ingestion.models import Place, SourceBatch
from app.ingestion.storage import store_batch
from app.regions import place_search_predicate

travel_db = _travel_db


@pytest.mark.parametrize(
    "query", ["강릉", "강원도", "고성 검증해변", "경포해수욕장", "강릉' OR 1=1 --"]
)
def test_existing_scopes_unknown_names_and_literal_input_are_preserved(query):
    assert search_place_predicate(query) == place_search_predicate(query)


def test_district_and_name_are_separate_bound_parameters():
    predicate, params = search_place_predicate("강원도 강릉시 검증해변")
    region_predicate, region_params = place_search_predicate("강원도 강릉시")
    assert predicate == region_predicate + " AND position(lower(%s) in lower(s.name))>0"
    assert params == [*region_params, "검증해변"]
    assert "검증해변" not in predicate
    assert search_place_predicate("강릉 %'_장소")[1][-1] == "%'_장소"


@pytest.fixture
def named_places(travel_db):
    config, *_ = travel_db
    store_batch(
        config,
        SourceBatch(
            provider="KAKAO_LOCAL",
            fetched_at=datetime.now(UTC) - timedelta(seconds=1),
            places=[
                Place(
                    source_id=source_id,
                    name=name,
                    kind="beach_search_result",
                    category="여행 > 관광,명소 > 해수욕장,해변",
                    latitude=latitude,
                    longitude=128.9,
                    region=region,
                    address=region,
                )
                for source_id, name, latitude, region in [
                    ("named-gangneung", "검증해변", 37.8, "강원특별자치도 강릉시"),
                    ("named-sokcho", "검증해변", 38.2, "강원특별자치도 속초시"),
                    ("name-is-not-region", "강릉 검증해변", 35.1, "부산광역시"),
                ]
            ],
        ),
    )
    return config


def test_district_search_finds_only_the_named_place_in_that_district(named_places):
    for query in (
        "강릉 검증해변",
        "강릉시 검증해변",
        "강원도 강릉 검증해변",
        "Gangwon-do Gangneung-si 검증해변",
    ):
        session = ToolSession(named_places, datetime.now(UTC))
        result = asyncio.run(
            session.execute("search_places", {"query": query, "limit": 8})
        )
        assert result["status"] == "available"
        assert len(result["candidates"]) == 1
        place = result["candidates"][0]
        assert place["name"] == "검증해변" and "강릉시" in place["region"]
        assert result["scope"]["query"] == query
    unknown = asyncio.run(
        ToolSession(named_places, datetime.now(UTC)).execute(
            "search_places",
            {"query": "강릉 없는장소"},
        )
    )
    assert not unknown["candidates"]


def test_recorded_live_read_intent_reaches_evidence_without_another_model_call(
    named_places,
):
    # Exact interpretation returned by the approved live probe on 2026-10-20:
    # the model preserved the district, but the old substring search found zero.
    provider = ScriptedProvider(
        [
            read_decision(
                place_query="강릉 검증해변",
                activity="swim",
                when="today",
                features=["place_conditions", "assessment_support"],
            )
        ]
    )
    response = asyncio.run(
        converse(
            named_places.model_copy(
                update={"ai_provider": "auto", "ai_api_key": SecretStr("offline")}
            ),
            ChatRequest(
                message="강릉 검증해변의 오늘 수온과 수영 점수를 알려줘.",
                context={"region": "gangwon"},
            ),
            "isolated-owner",
            provider,
            budget_api=MemoryBudget(),
        )
    )
    assert response.provider == "openai" and not response.fallback
    assert response.status == "available" and response.clarification is None
    assert [c["name"] for c in response.candidates] == ["검증해변"]
    assert response.features == [
        "search_places",
        "place_conditions",
        "assessment_support",
    ]
    assert len(provider.bodies) == 1 and response.facts


def test_name_only_keeps_distinct_places_ambiguous(named_places):
    provider = ScriptedProvider([read_decision(place_query="검증해변")])
    response = asyncio.run(
        converse(
            named_places.model_copy(
                update={"ai_provider": "auto", "ai_api_key": SecretStr("offline")}
            ),
            ChatRequest(message="검증해변 수온 알려줘"),
            "isolated-owner",
            provider,
            budget_api=MemoryBudget(),
        )
    )
    assert response.status == "clarification"
    assert len(response.candidates) == 3
    assert response.features == ["search_places"]
