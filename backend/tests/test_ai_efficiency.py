"""Reduce paid work without losing conversational state or patch semantics."""

import asyncio
import copy
import json

import pytest
from test_ai_chat import NOW, FixtureSession, MemoryBudget, ScriptedProvider, final
from test_ai_chat import settings as _settings
from test_ai_intent import IntentSession, decision

from app.ai import chat
from app.ai.intent import IntentDecision
from app.travel.chat import TravelToolSession

settings = _settings


@pytest.mark.parametrize("message", ["안녕하세요!", "고마워", "감사합니다.", "thanks"])
def test_social_reply_uses_no_model_budget_or_database_and_keeps_trip(
    settings, message
):
    request = chat.ChatRequest(
        message=message,
        context={"spot_ids": [45, 46], "activity": "relax", "time_text": "tomorrow"},
        travel={
            "request": {"region": "강릉", "preferred_tags": ["물멍"]},
            "selection_token": "user-provided-selection",
        },
    )
    original = request.model_dump()
    provider, account = ScriptedProvider([]), MemoryBudget(limit=0)

    def forbidden_session(*args):
        pytest.fail("A social reply must not open a data session")

    response = asyncio.run(
        chat.converse(
            settings,
            request,
            "private-owner",
            provider,
            now=NOW,
            session_factory=forbidden_session,
            budget_api=account,
        )
    )
    assert response.status == "available" and not response.fallback
    assert response.context == request.context and response.travel == request.travel
    assert request.model_dump() == original
    assert not response.facts and not response.model_trace
    assert not provider.bodies and not account.sizes and account.admissions == 0


@pytest.mark.parametrize(
    "message", ["응", "고마워, 카페도 추가해줘", "안녕, 내일 수온은?"]
)
def test_confirmation_and_mixed_requests_still_interpret_the_whole_message(
    settings, message
):
    history = [
        {"role": "user", "content": "밥 먹고 카페 갔다가 물멍"},
        {"role": "assistant", "content": "식사와 카페 뒤 어느 물가로 갈까요?"},
    ]
    provider = ScriptedProvider([decision(action="clarify", clarification="place")])
    account = MemoryBudget()
    response = asyncio.run(
        chat.converse(
            settings,
            chat.ChatRequest(message=message, history=history),
            "owner",
            provider,
            now=NOW,
            session_factory=FixtureSession,
            budget_api=account,
        )
    )
    assert response.status == "clarification"
    assert len(provider.bodies) == len(account.sizes) == 1
    payload = json.loads(provider.bodies[0]["input"][0]["content"])
    assert payload["untrusted_history"] == history and payload["USER_INPUT"] == message


def test_payload_preserves_all_recent_messages_and_nonempty_trip_conditions(settings):
    history = [
        {
            "role": "user" if i % 2 == 0 else "assistant",
            "content": f"대화 {i}: " + "물멍 여행 " * 40,
        }
        for i in range(8)
    ]
    request = chat.ChatRequest(
        message="카페는 그대로 두고 오후만 계곡으로 바꿔줘",
        history=history,
        context={"spot_ids": [45], "activity": "relax"},
        travel={
            "request": {
                "region": "강릉",
                "day_trip": False,
                "origin": {
                    "label": "private home",
                    "latitude": 37.12345,
                    "longitude": 128.12345,
                },
                "dates": ["2026-10-02"],
                "preferred_tags": ["물멍"],
                "purpose": "연락처 person@example.test 키 sk-private-token-value",
                "visit_intents": [
                    {"place_type": "cafe", "part_of_day": "morning"},
                    {"place_type": "valley", "part_of_day": "afternoon"},
                ],
            },
        },
    )
    session = TravelToolSession(settings, NOW, body=request, owner="private-owner")
    context = session.model_context()
    payload = json.loads(chat.initial_input(request, NOW)[0]["content"])
    assert payload["untrusted_history"] == history
    assert payload["untrusted_context"]["spot_ids"] == [45]
    assert context["region"] == "강릉" and context["day_trip"] is False
    assert context["dates"] == ["2026-10-02"] and context["preferred_tags"] == ["물멍"]
    assert [v["place_type"] for v in context["visit_intents"]] == ["cafe", "valley"]
    assert context["origin"] == {"label": "user_supplied_origin", "available": True}
    assert context["purpose"] == "연락처 [이메일 생략] 키 [비밀값 생략]"
    assert "budget" not in context and "avoid" not in context
    assert "private home" not in json.dumps(context) and "37.12345" not in json.dumps(
        context
    )
    assert chat.compact_context({"a": 0, "b": False, "c": None, "d": []}) == {
        "a": 0,
        "b": False,
    }


def test_empty_patch_lists_still_clear_preferences_in_followup_model_input(settings):
    provider = ScriptedProvider(
        [
            decision(action="route", changes={"avoid": []}),
            final(intent="clarify", clarification="place", sections=[]),
        ]
    )
    asyncio.run(
        chat.converse(
            settings,
            chat.ChatRequest(message="피할 조건은 없애고 경로를 정해줘"),
            "owner",
            provider,
            now=NOW,
            session_factory=IntentSession,
            budget_api=MemoryBudget(),
        )
    )
    interpreted = json.loads(provider.bodies[1]["input"][-1]["content"])
    assert interpreted["interpreted_request"]["changes"]["avoid"] == []
    assert "read" not in interpreted["interpreted_request"]


def test_schema_compaction_reduces_size_without_changing_validation():
    raw = IntentDecision.model_json_schema()
    compact = chat.strict_schema(copy.deepcopy(raw))

    def legacy(value):
        if isinstance(value, dict):
            result = {k: legacy(v) for k, v in value.items() if k != "default"}
            if result.get("type") == "object":
                result["additionalProperties"] = False
                result["required"] = list(result.get("properties", {}))
            return result
        if isinstance(value, list):
            return [legacy(v) for v in value]
        return value

    previous = legacy(raw)
    assert len(json.dumps(compact)) < len(json.dumps(previous))
    assert compact["required"] == previous["required"]
    for key in compact["$defs"]:
        assert compact["$defs"][key].get("required") == previous["$defs"][key].get(
            "required"
        )
    # Keep the underlying validation and canonical model schema unchanged.
    assert "title" in IntentDecision.model_json_schema()
    with pytest.raises(ValueError):
        IntentDecision.model_validate(
            {"relevance": "N", "action": "recommend", "changes": {}}
        )
