"""One model interpretation, real read contracts, and explicit incomplete results."""

import asyncio
import json

import pytest
from test_ai_chat import NOW, FixtureSession, MemoryBudget, ScriptedProvider, call
from test_ai_chat import settings as _settings
from test_ai_intent import decision, empty_decision

from app.ai import chat
from app.ai.intent import IntentDecision
from app.ai.provider import ProviderError
from app.ai.reads import ReadIntent, evidence_answer

settings = _settings


def read_decision(**changes):
    response = decision()
    content = response["output"][0]["content"][0]
    value = json.loads(content["text"])
    value["read"] = {
        "features": ["place_conditions"],
        "place_query": "경포해수욕장",
        **changes,
    }
    content["text"] = json.dumps(value)
    return response


class ReadSession(FixtureSession):
    def __init__(
        self, settings, now, *, ids=(45,), has_more=False, search_failed=False
    ):
        super().__init__(settings, now)
        self.ids, self.has_more, self.search_failed = ids, has_more, search_failed

    async def execute(self, name, arguments):
        if name == "place_conditions":
            return await super().execute(name, arguments)
        self.calls.append((name, arguments))
        self.features.append(name)
        if name == "search_places":
            if self.search_failed:
                self.facts["failed"] = {
                    "fact_id": "failed",
                    "feature": name,
                    "text": "장소 조회에 실패했습니다.",
                    "data_status": "query_failed",
                }
                return {"status": "query_failed"}
            candidates = [
                {"candidate_id": f"spot:{sid}", "spot_id": sid, "name": "경포해수욕장"}
                for sid in self.ids
            ]
            self.candidates.update((c["candidate_id"], c) for c in candidates)
            self.facts["search"] = {
                "fact_id": "search",
                "feature": name,
                "text": f"장소 {len(candidates)}개를 찾았습니다.",
                "data_status": "available" if candidates else "no_data",
                "metadata": {"has_more": self.has_more},
            }
            return {
                "status": "available" if candidates else "no_data",
                "candidates": candidates,
                "facts": [self.facts["search"]],
            }
        self.facts["assessment"] = {
            "fact_id": "assessment",
            "feature": name,
            "text": "수영 점수는 미확인입니다.",
            "data_status": "unknown",
            "metadata": {"score": None},
        }
        return {"status": "unknown"}


def run(settings, script, *, context=None, session=None):
    session = session or ReadSession(settings, NOW)
    provider, account = ScriptedProvider(script), MemoryBudget()
    response = asyncio.run(
        chat.converse(
            settings,
            chat.ChatRequest(
                message="경포해수욕장 오늘 수온과 수영 점수 알려줘.",
                context=context or {},
            ),
            "private-owner-id",
            provider,
            now=NOW,
            session_factory=lambda *_: session,
            budget_api=account,
        )
    )
    return response, session, provider, account


@pytest.mark.parametrize("retry", [False, True])
def test_named_conditions_and_score_need_one_interpretation_not_followup_models(
    settings, retry
):
    script = [empty_decision()] if retry else []
    script.append(
        read_decision(
            features=["place_conditions", "assessment_support"],
            activity="swim",
            when="today",
        )
    )
    response, session, provider, account = run(
        settings, script, context={"spot_id": 999}
    )
    assert response.status == "available" and not response.fallback
    assert len(provider.bodies) == len(account.sizes) == 1 + int(retry)
    assert [name for name, _ in session.calls] == [
        "search_places",
        "place_conditions",
        "assessment_support",
    ]
    assert session.calls[1][1]["spot_ids"] == [45]
    assert session.calls[2][1]["spot_id"] == 45
    assert session.calls[1][1]["when"] == "today"
    assert "21.4 degC" in response.answer and "수영 점수는 미확인" in response.answer
    assert "KHOA" in response.answer and NOW.isoformat() in response.answer
    assert "입수 안전을 판단할 수 없습니다" in response.answer
    assert "ai_model_call_limit" not in response.reason_codes


@pytest.mark.parametrize(
    "ids,has_more", [((), False), ((45, 46), False), ((45,), True)]
)
def test_ambiguous_missing_or_truncated_places_never_select_first_match(
    settings, ids, has_more
):
    response, session, provider, _ = run(
        settings,
        [read_decision()],
        context={"spot_id": 999},
        session=ReadSession(settings, NOW, ids=ids, has_more=has_more),
    )
    assert response.status == "clarification"
    if ids:
        assert response.clarification.startswith(chat.QUESTIONS["place"])
        assert "검색된 후보: 경포해수욕장" in response.clarification
    else:
        assert response.clarification == chat.QUESTIONS["location"]
    assert [name for name, _ in session.calls] == ["search_places"]
    assert len(provider.bodies) == 1
    assert "21.4" not in response.answer


def test_selected_context_is_requeried_without_model_generated_ids(settings):
    response, session, provider, _ = run(
        settings,
        [read_decision(place_query=None, activity="relax", when="tomorrow")],
        context={"spot_ids": [45, 46], "activity": "swim"},
    )
    assert response.status == "available" and len(provider.bodies) == 1
    assert len(session.calls) == 1
    assert session.calls[0][1]["spot_ids"] == [45, 46]
    assert session.calls[0][1]["activity"] == "relax"
    assert session.calls[0][1]["when"] == "tomorrow"


@pytest.mark.parametrize(
    "changes,question",
    [
        ({"place_query": None}, "location"),
        ({"when": "this_weekend"}, "weekend_day"),
        ({"features": ["quality"], "when": "tomorrow"}, "time"),
    ],
)
def test_missing_targets_and_unsupported_periods_ask_before_reads(
    settings, changes, question
):
    response, session, provider, _ = run(settings, [read_decision(**changes)])
    assert response.status == "clarification" and not session.calls
    assert response.clarification == chat.QUESTIONS[question]
    assert len(provider.bodies) == 1


def test_invalid_custom_period_never_becomes_current_conditions(settings):
    response, session, provider, _ = run(
        settings,
        [read_decision(when="custom", start=None, end=None)],
    )
    assert not session.calls and len(provider.bodies) == 1
    assert response.status == "clarification"
    assert "invalid_time_range" in response.reason_codes


def test_search_failure_is_not_missing_data_or_a_success(settings):
    response, session, _, _ = run(
        settings,
        [read_decision()],
        session=ReadSession(settings, NOW, search_failed=True),
    )
    assert response.status == "query_failed"
    assert "장소 조회에 실패" in response.answer
    assert [name for name, _ in session.calls] == ["search_places"]


def test_tool_budget_stops_without_a_false_completed_answer(settings):
    response, session, provider, _ = run(
        settings.model_copy(update={"ai_max_tool_calls": 1}), [read_decision()]
    )
    assert response.status == "unavailable"
    assert "ai_tool_limit" in response.reason_codes
    assert "끝까지 완료하지 못했습니다" in response.answer
    assert [name for name, _ in session.calls] == ["search_places"]
    assert len(provider.bodies) == 1


@pytest.mark.parametrize("retry", [False, True])
def test_legacy_multistep_read_is_not_complete_after_only_search(settings, retry):
    script = [decision(), call("search_places", {"query": "경포해수욕장"})]
    if retry:
        script.insert(0, empty_decision())
    else:
        script.append(ProviderError("ai_rate_limited"))
    response, session, provider, _ = run(
        settings,
        script,
    )
    assert response.status == "unavailable" and len(provider.bodies) == 3
    assert "ai_read_incomplete" in response.reason_codes
    assert (
        "ai_model_call_limit" if retry else "ai_rate_limited"
    ) in response.reason_codes
    assert "끝까지 완료하지 못했습니다" in response.answer
    assert [name for name, _ in session.calls] == ["search_places"]


@pytest.mark.parametrize(
    "changes",
    [
        {"spot_id": 123},
        {"features": ["arbitrary_sql"]},
        {"features": ["place_conditions", "place_conditions"]},
        {"features": ["quality"], "temperature_confirmed_only": True},
        {"features": ["capabilities"], "place_query": "경포해변"},
        {"place_query": "  "},
    ],
)
def test_read_intent_has_no_arbitrary_tools_or_ids(changes):
    with pytest.raises(ValueError):
        ReadIntent.model_validate({"features": ["place_conditions"], **changes})


@pytest.mark.parametrize("action", ["reject", "recommend", "route", "clarify"])
def test_other_actions_cannot_carry_hidden_read_requests(action):
    with pytest.raises(ValueError):
        IntentDecision.model_validate(
            {
                "relevance": "N" if action == "reject" else "Y",
                "action": action,
                "changes": {},
                "read": {"features": ["place_conditions"]},
            }
        )


def test_evidence_text_keeps_missing_values_provider_times_and_mandatory_warnings():
    facts = [
        {
            "text": "수온: 값 미확인; 자료 상태 unknown.",
            "metadata": {"evidence": [{"provider": "KHOA", "issued_at": None}]},
        },
        {"text": "공식 출입 제한을 확인해야 합니다.", "mandatory": True},
    ]
    answer = evidence_answer(facts, "확인한 자료입니다.")
    assert "값 미확인" in answer and "KHOA" in answer
    assert "공식 출입 제한" in answer
    assert "발행" not in answer and "None" not in answer


def test_one_model_read_preserves_real_tool_projection_and_source_units(
    settings, monkeypatch
):
    from test_ai_tools import NOW as TOOL_NOW
    from test_ai_tools import FixtureReader, install_tool_services

    from app.ai.tools import ToolSession

    install_tool_services(monkeypatch)
    reader = FixtureReader()
    provider = ScriptedProvider(
        [read_decision(place_query="경포해변", activity="swim", when="today")]
    )
    account = MemoryBudget()
    response = asyncio.run(
        chat.converse(
            settings,
            chat.ChatRequest(message="경포해변 오늘 수온 알려줘"),
            "private-owner-id",
            provider,
            now=TOOL_NOW,
            session_factory=lambda configured, now: ToolSession(
                configured, now, reader=reader
            ),
            budget_api=account,
        )
    )
    assert response.status == "available" and not response.fallback
    assert len(provider.bodies) == len(account.sizes) == 1
    assert response.features == ["search_places", "place_conditions"]
    assert "18.2 °C" in response.answer and "khoa_buoy" in response.answer
    assert "2026-01-02T14:49:00Z" in response.answer
    assert reader.condition_reads == 1 and reader.open_connections == 0
    assert account.sizes[0] <= settings.ai_max_input_bytes
