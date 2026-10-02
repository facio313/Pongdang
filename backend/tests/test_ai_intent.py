"""Public scope gate and intent dispatch, with no network or database access."""

import asyncio
import json

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from test_ai_chat import (
    HEADERS,
    NOW,
    FixtureSession,
    MemoryBudget,
    ScriptedProvider,
    call,
    final,
)
from test_ai_chat import settings as _settings

from app.ai import chat
from app.ai.intent import IntentDecision
from app.ai.provider import ProviderError
from app.travel.models import TravelContext

settings = _settings
MESSAGE = "오전엔 해변으로 갔다가 오후에는 계곡에 가고 싶어."
VISITS = [
    {"place_type": "beach", "part_of_day": "morning", "activity": None},
    {"place_type": "valley", "part_of_day": "afternoon", "activity": None},
]


def decision(relevance="Y", action="read", changes=None, clarification=None):
    value = {
        "relevance": relevance,
        "action": action,
        "changes": changes or {},
        "clarification": clarification,
    }
    return {
        "status": "completed",
        "output": [
            {
                "type": "message",
                "role": "assistant",
                "content": [{"type": "output_text", "text": json.dumps(value)}],
            }
        ],
        "usage": {"input_tokens": 80, "output_tokens": 50},
    }


class IntentSession(FixtureSession):
    def __init__(self, settings, now):
        super().__init__(settings, now)
        self.travel_context = TravelContext(
            request={
                "region": "gangwon",
                "keyword_selection": [{"category": "place_type", "values": ["beach"]}],
            }
        )
        self.prepared = False

    def model_context(self):
        return self.travel_context.request.model_dump(mode="json")

    async def prepare(self):
        self.prepared = True

    async def execute(self, name, arguments):
        from app.travel.chat import RequestPatch, apply_patch

        assert self.prepared
        self.travel_context.request = apply_patch(
            self.travel_context.request,
            RequestPatch.model_validate(arguments["changes"]),
        )
        self.calls.append((name, arguments))
        self.features.append(name)
        return {"status": "no_data"}

    async def fallback(self):
        pytest.fail("A scope-gated request must never make heuristic fallback reads")


def run(settings, script, *, message=MESSAGE, account=None, factory=IntentSession):
    provider = ScriptedProvider(script)
    account = account or MemoryBudget()
    session = factory(settings, NOW)
    response = asyncio.run(
        chat.converse(
            settings,
            chat.ChatRequest(message=message),
            "private-owner-id",
            provider,
            now=NOW,
            session_factory=lambda *_: session,
            budget_api=account,
        )
    )
    return response, session, provider, account


@pytest.mark.parametrize("message", ["주식 종목 추천해줘", "부산 해변 추천해줘"])
def test_n_returns_fixed_response_before_any_domain_read(settings, message):
    response, session, provider, account = run(
        settings,
        [decision("N", "reject")],
        message=message,
    )
    assert response.answer == "관련 없는 것은 질문 받지 않는다."
    assert response.status == "out_of_scope" and not response.fallback
    assert response.reason_codes == ["ai_out_of_scope"]
    assert not session.prepared and not session.calls
    assert response.facts == response.candidates == response.features == []
    assert len(provider.bodies) == len(account.sizes) == 1
    assert provider.bodies[0]["tools"] == []
    assert provider.bodies[0]["tool_choice"] == "none"
    assert account.usage == [("1", 80, 50)]
    assert [turn.kind for turn in response.model_trace] == ["attempt", "scope"]
    assert response.model_trace[1].plan["relevance"] == "N"


@pytest.mark.parametrize(
    "message,visits",
    [
        (MESSAGE, VISITS),
        (
            "오전엔 계곡을 갔다 오후엔 해변을 가고 싶어.",
            [
                {"place_type": "valley", "part_of_day": "morning", "activity": None},
                {"place_type": "beach", "part_of_day": "afternoon", "activity": None},
            ],
        ),
    ],
)
def test_two_visits_are_interpreted_before_one_bounded_db_action(
    settings, message, visits
):
    response, session, provider, _ = run(
        settings,
        [
            decision(
                action="recommend",
                changes={"visit_intents": visits},
            )
        ],
        message=message,
    )
    assert [
        v.model_dump() for v in session.travel_context.request.visit_intents
    ] == visits
    assert session.calls == [
        (
            "travel_recommend",
            {
                "changes": {
                    "visit_intents": [
                        {
                            key: value
                            for key, value in visit.items()
                            if value is not None
                        }
                        for visit in visits
                    ]
                },
                "limit": 5,
            },
        )
    ]
    assert session.travel_context.request.region == "gangwon"
    assert len(provider.bodies) == 1  # no unnecessary final model composition
    assert response.provider == "openai" and not response.fallback
    assert [t.kind for t in response.model_trace] == ["attempt", "scope", "tool"]
    assert response.model_trace[1].plan["changes"]["visit_intents"] == visits


def empty_decision():
    return {
        "status": "completed",
        "output": [{"type": "reasoning", "summary": []}],
        "usage": {"input_tokens": 80, "output_tokens": 0},
    }


def test_empty_scope_is_retried_once_with_its_own_budget_reservation(settings):
    response, session, provider, account = run(
        settings,
        [
            empty_decision(),
            decision(action="recommend", changes={"visit_intents": VISITS}),
        ],
    )
    assert response.provider == "openai" and not response.fallback
    assert not response.reason_codes
    assert len(provider.bodies) == len(account.sizes) == 2
    assert provider.bodies[0] == provider.bodies[1]
    assert account.usage == [("1", 80, 0), ("2", 80, 50)]
    assert len(session.calls) == 1
    assert [turn.kind for turn in response.model_trace] == [
        "attempt",
        "retry",
        "attempt",
        "scope",
        "tool",
    ]
    retry = response.model_trace[1]
    assert retry.error == "ai_empty_output"
    assert retry.plan == {
        "output_items": 1,
        "message_items": 0,
        "text_parts": 0,
        "text_characters": 0,
    }


def test_repeated_empty_scope_stops_without_reads_and_keeps_diagnostics(settings):
    response, session, provider, account = run(
        settings,
        [empty_decision(), empty_decision()],
    )
    assert response.status == "unavailable"
    assert response.reason_codes == ["ai_empty_output", "ai_scope_unavailable"]
    assert not session.prepared and not session.calls
    assert len(provider.bodies) == len(account.sizes) == 2
    assert response.model_trace[-1].plan["text_parts"] == 0
    assert account.released == ["local-lease"]


@pytest.mark.parametrize("bounded_by", ["daily_budget", "request_calls"])
def test_empty_scope_retry_cannot_exceed_existing_limits(settings, bounded_by):
    account = MemoryBudget(limit=1 if bounded_by == "daily_budget" else 3)
    if bounded_by == "request_calls":
        settings = settings.model_copy(update={"ai_max_model_calls": 1})
    response, session, provider, account = run(
        settings,
        [empty_decision()],
        account=account,
    )
    assert response.status == "unavailable" and not session.calls
    assert len(provider.bodies) == len(account.sizes) == 1
    assert (
        "ai_budget_exhausted" if bounded_by == "daily_budget" else "ai_empty_output"
    ) in response.reason_codes


def test_retry_can_still_reject_an_unrelated_request_without_reads(settings):
    response, session, provider, _ = run(
        settings,
        [empty_decision(), decision("N", "reject")],
        message="주식 추천해줘",
    )
    assert response.status == "out_of_scope"
    assert response.answer == "관련 없는 것은 질문 받지 않는다."
    assert not session.prepared and not session.calls
    assert len(provider.bodies) == 2


def test_empty_scope_retry_keeps_the_original_request_deadline(settings):
    class SlowRetry(ScriptedProvider):
        async def respond(self, body):
            if self.bodies:
                self.bodies.append(body)
                await asyncio.sleep(10)
            return await super().respond(body)

    provider, account = SlowRetry([empty_decision()]), MemoryBudget()
    session = IntentSession(settings, NOW)
    response = asyncio.run(
        chat.converse(
            settings.model_copy(update={"ai_request_timeout_seconds": 0.2}),
            chat.ChatRequest(message=MESSAGE),
            "owner",
            provider,
            now=NOW,
            session_factory=lambda *_: session,
            budget_api=account,
        )
    )
    assert "ai_request_timeout" in response.reason_codes
    assert len(provider.bodies) == len(account.sizes) == 2
    assert not session.prepared and not session.calls
    assert account.released == ["local-lease"]


@pytest.mark.parametrize("split_messages", [False, True])
def test_split_text_is_assembled_before_strict_intent_validation(split_messages):
    raw = decision(action="recommend", changes={"visit_intents": VISITS})
    text = raw["output"][0]["content"][0]["text"]
    pieces = [text[:73], text[73:141], text[141:]]
    if split_messages:
        raw["output"] = [
            {"type": "message", "content": [{"type": "output_text", "text": piece}]}
            for piece in pieces
        ]
    else:
        raw["output"][0]["content"] = [
            {"type": "output_text", "text": piece} for piece in pieces
        ]
    _, _, parsed = chat.parse_response(raw, plan_type=IntentDecision, allow_tools=False)
    assert [v.model_dump() for v in parsed.changes.visit_intents] == VISITS


def test_multiple_complete_decisions_are_invalid_not_empty():
    raw = decision()
    raw["output"] += decision("N", "reject")["output"]
    with pytest.raises(ProviderError, match="ai_output_unverified"):
        chat.parse_response(raw, plan_type=IntentDecision, allow_tools=False)


@pytest.mark.parametrize("travel_screen", [False, True])
def test_y_read_can_use_registered_tools_and_compose_within_existing_limit(
    settings, travel_screen
):
    class ReadSession(FixtureSession):
        def __init__(self, settings, now):
            super().__init__(settings, now)
            if travel_screen:
                self.travel_results = {}

    response, session, provider, _ = run(
        settings,
        [decision(), call(), final()],
        message="강릉 해변의 수온을 보여줘",
        factory=ReadSession,
    )
    assert response.provider == "openai" and not response.fallback
    assert session.calls == [
        ("place_conditions", {"spot_ids": [45], "activity": "swim"})
    ]
    assert len(provider.bodies) == settings.ai_max_model_calls
    assert provider.bodies[0]["text"]["format"]["name"] == "pongdang_request_intent"
    assert provider.bodies[1]["tools"][0]["name"] == "place_conditions"


@pytest.mark.parametrize(
    "failure",
    [
        ProviderError("ai_authentication_failed"),
        ProviderError("ai_timeout"),
        ProviderError("ai_quota_exhausted"),
    ],
)
def test_failed_judgment_does_not_fall_back_to_old_beach_filter(settings, failure):
    response, session, provider, _ = run(settings, [failure])
    assert response.status == "unavailable" and response.fallback
    assert response.reason_codes == [failure.code, "ai_scope_unavailable"]
    assert "확인하지 못했습니다" in response.answer
    assert not session.prepared and not session.calls
    assert len(provider.bodies) == 1
    assert [t.kind for t in response.model_trace] == ["attempt", "error"]
    assert response.model_trace[-1].error == failure.code


def test_disabled_model_cannot_silently_skip_the_relevance_check(settings):
    response, session, provider, account = run(
        settings.model_copy(update={"ai_provider": "disabled"}),
        [],
    )
    assert response.status == "unavailable"
    assert "ai_disabled" in response.reason_codes
    assert "ai_scope_unavailable" in response.reason_codes
    assert not session.prepared and not session.calls
    assert not provider.bodies and not account.sizes


@pytest.mark.parametrize(
    "raw,code",
    [
        (call("search_places", {"query": "anything"}), "ai_scope_tool_rejected"),
        (decision("N", "recommend"), "ai_output_unverified"),
        (decision("N", "reject", {"region": "강릉"}), "ai_output_unverified"),
        (decision("Y", "reject"), "ai_output_unverified"),
        (decision("Y", "clarify"), "ai_output_unverified"),
        (decision(changes={"sql": "SELECT *"}), "ai_output_unverified"),
    ],
)
def test_malformed_or_tool_call_scope_responses_never_authorize_reads(
    settings, raw, code
):
    response, session, _, _ = run(settings, [raw])
    assert response.status == "unavailable"
    assert code in response.reason_codes
    assert not session.prepared and not session.calls


def test_relevant_ambiguous_weekend_asks_before_reading(settings):
    response, session, _, _ = run(
        settings,
        [
            decision(
                action="clarify",
                clarification="weekend_day",
            )
        ],
        message="이번 주말 계곡에 가고 싶어",
    )
    assert response.status == "clarification"
    assert "토요일과 일요일" in response.clarification
    assert not session.calls


def test_scope_trace_redacts_private_context(settings):
    response, _, provider, _ = run(
        settings,
        [
            decision(
                action="recommend",
                changes={
                    "origin": {
                        "label": "집",
                        "latitude": 37.123456789,
                        "longitude": 128.87654321,
                    },
                    "visit_intents": VISITS,
                },
            )
        ],
    )
    serialized = response.model_dump_json()
    assert "37.123456789" not in serialized
    assert "128.87654321" not in serialized
    assert "private-owner-id" not in json.dumps(provider.bodies)


def test_scope_schema_is_closed_and_visit_count_is_bounded():
    schema = chat.strict_schema(IntentDecision.model_json_schema())
    assert schema["additionalProperties"] is False
    assert set(schema["required"]) == set(schema["properties"])
    with pytest.raises(ValueError):
        IntentDecision.model_validate(
            {
                "relevance": "Y",
                "action": "recommend",
                "changes": {"visit_intents": VISITS * 3},
            }
        )


def test_public_router_rejects_before_saved_plan_or_companion_reads(
    settings, monkeypatch
):
    account = MemoryBudget()
    for name in (
        "acquire_request",
        "reserve_attempt",
        "record_usage",
        "release_request",
    ):
        monkeypatch.setattr(chat.budget, name, getattr(account, name))
    for target in ("app.travel.storage.get_plan", "app.travel.companion.get_session"):
        monkeypatch.setattr(
            target, lambda *_args, **_kw: pytest.fail("No domain read before Y")
        )
    provider = ScriptedProvider([decision("N", "reject")])
    app = FastAPI()
    router, _ = chat.create_chat_router(settings, provider=provider)
    app.include_router(router)
    with TestClient(app) as client:
        response = client.post(
            "/api/data/ai/chat",
            headers=HEADERS,
            json={
                "message": "주식 추천해줘",
                "travel": {
                    "plan_id": "saved-private-plan",
                    "session_id": "private-session",
                },
            },
        )
    assert response.status_code == 200, response.text
    assert response.json()["status"] == "out_of_scope"
    assert response.json()["answer"] == "관련 없는 것은 질문 받지 않는다."
