"""Independent B checks: immutable facts, privacy, failures and durable caps.

All model responses are local test doubles; no OpenAI API request is made.
"""

import asyncio
import json
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime, timedelta
from io import BytesIO
from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import SecretStr

from app.ai import service
from app.config import Settings
from app.schema import connect, initialize


@pytest.fixture
def ai_settings():
    return Settings(
        _env_file=None,
        postgres_password="unit-test-only",
        ai_provider="openai",
        ai_model="unit-test-model",
        ai_api_key="private-test-key",
        sso_proxy_secret="a-test-secret-at-least-32-characters",
        sso_allowed_origins="https://example.test",
    ).model_copy(
        update={
            "ai_pricing_model": "unit-test-model",
            "ai_input_microusd_per_million_tokens": 2_000_000,
            "ai_output_microusd_per_million_tokens": 10_000_000,
        }
    )


@pytest.fixture
def spatial(monkeypatch):
    now = datetime(2026, 9, 14, tzinfo=UTC)
    source = SimpleNamespace(
        as_of=now,
        at=now,
        reason_codes=[],
        rows=[
            {
                "spot_id": 45,
                "status": "available",
                "reason_codes": [],
                "owner_subject": "must-not-enter-model",
                "upstream_url": "https://approved.test?key=must-not-enter-model",
                "stations": [],
                "layers": [
                    {
                        "metric_id": 7,
                        "snapshot_id": 3,
                        "name": "water_temperature",
                        "numeric_value": 21.4,
                        "text_value": "private-freeform-review-must-not-enter-model",
                        "unit": "degC",
                        "status": "observation",
                        "station_id": 9,
                        "observed_at": now,
                        "mode": "observation",
                    }
                ],
            }
        ],
    )

    async def view(*_, **__):
        return source

    monkeypatch.setattr(service, "spatial_view", view)
    return source


def explain(settings, *, adapter, budget=lambda *_: True, use_model=True):
    return asyncio.run(
        service.explain(
            settings,
            service.ExplainRequest(spot_id=45, use_model=use_model),
            adapter=adapter,
            budget=budget,
        )
    )


def forbidden(*_):
    pytest.fail("This path must not reserve budget or call a model")


def test_model_can_only_reorder_server_facts_and_never_receives_private_context(
    spatial, ai_settings
):
    baseline = explain(
        ai_settings, adapter=forbidden, budget=forbidden, use_model=False
    )
    received = []

    def model(_, payload):
        received.extend(payload)
        serialized = json.dumps(payload)
        assert "must-not-enter-model" not in serialized
        assert "private-test-key" not in serialized
        return {"ordered_fact_ids": [fact["fact_id"] for fact in reversed(payload)]}

    result = explain(ai_settings, adapter=model)
    assert result.provider == "openai"
    assert result.facts == list(reversed(baseline.facts))
    assert result.disclaimer == service.DISCLAIMER
    assert all(f["evidence_refs"] for f in received)
    assert result.as_of == spatial.as_of


@pytest.mark.parametrize(
    "kind", ["invented_value", "missing_fact", "extra_field", "error"]
)
def test_invalid_model_result_falls_back_to_identical_evidence(
    spatial, ai_settings, kind
):
    baseline = explain(
        ai_settings, adapter=forbidden, budget=forbidden, use_model=False
    )

    def invalid(_, payload):
        ids = [fact["fact_id"] for fact in payload]
        if kind == "error":
            raise RuntimeError("private-test-key https://secret.test/?token=abc")
        if kind == "invented_value":
            return {"ordered_fact_ids": ["safe_to_swim_100_percent", *ids[1:]]}
        if kind == "missing_fact":
            return {"ordered_fact_ids": ids[:1]}
        return {"ordered_fact_ids": ids, "message": "Water is safe and grade A"}

    result = explain(ai_settings, adapter=invalid)
    assert result.facts == baseline.facts
    assert result.provider == "deterministic"
    assert result.model is None
    assert "ai_output_unverified_or_unavailable" in result.reason_codes
    assert "private-test-key" not in result.model_dump_json()
    assert "safe_to_swim" not in result.model_dump_json()


@pytest.mark.parametrize(
    ("change", "code"),
    [
        ({"ai_provider": "disabled"}, "ai_not_configured"),
        ({"ai_api_key": SecretStr("")}, "ai_not_configured"),
        ({"ai_model": ""}, "ai_not_configured"),
        ({"ai_max_input_bytes": 1}, "ai_input_limit"),
    ],
)
def test_no_provider_call_or_budget_write_when_unconfigured_or_oversized(
    spatial, ai_settings, change, code
):
    result = explain(
        ai_settings.model_copy(update=change), adapter=forbidden, budget=forbidden
    )
    assert result.provider == "deterministic"
    assert code in result.reason_codes


def test_exhausted_budget_cannot_reach_adapter(spatial, ai_settings):
    result = explain(ai_settings, adapter=forbidden, budget=lambda *_: False)
    assert result.provider == "deterministic"
    assert "ai_budget_exhausted" in result.reason_codes


def test_budget_storage_failure_keeps_deterministic_explanation(spatial, ai_settings):
    def failed_budget(*_):
        raise RuntimeError("database-password-must-not-leak")

    result = explain(ai_settings, adapter=forbidden, budget=failed_budget)
    assert result.provider == "deterministic"
    assert result.reason_codes == ["ai_budget_unavailable"]
    assert "database-password" not in result.model_dump_json()


@pytest.mark.parametrize(
    "change",
    [
        {"ai_pricing_model": "different-model"},
        {"ai_input_microusd_per_million_tokens": None},
        {"ai_output_microusd_per_million_tokens": None},
    ],
)
def test_missing_or_wrong_model_price_blocks_model_and_budget(
    spatial, ai_settings, change
):
    result = explain(
        ai_settings.model_copy(update=change), adapter=forbidden, budget=forbidden
    )
    assert result.reason_codes == ["ai_pricing_not_configured"]


def test_budget_reserves_full_provider_body_and_schema(spatial, ai_settings):
    measured = []

    def budget(settings, size):
        measured.append(size)
        return True

    def adapter(settings, payload):
        assert measured == [len(service.request_bytes(settings, payload))]
        assert measured[0] > len(json.dumps(payload, ensure_ascii=False).encode())
        return {"ordered_fact_ids": [f["fact_id"] for f in payload]}

    assert explain(ai_settings, adapter=adapter, budget=budget).provider == "openai"


def test_no_data_preserves_source_reason_and_never_calls_model(spatial, ai_settings):
    spatial.rows[0].update(
        status="no_data", layers=[], reason_codes=["no_mapped_measurements"]
    )
    result = explain(ai_settings, adapter=forbidden, budget=forbidden)
    assert result.status == "no_data" and result.data_status == "no_data"
    assert "no_mapped_measurements" in result.reason_codes
    assert "no_evidence_to_order" in result.reason_codes


def test_activity_time_mode_contract_reaches_bound_source(
    monkeypatch, spatial, ai_settings
):
    as_of = datetime.now(UTC) - timedelta(seconds=1)
    at = as_of - timedelta(days=1)
    seen = []

    async def view(_, query):
        seen.append(query)
        return spatial

    monkeypatch.setattr(service, "spatial_view", view)
    request = service.ExplainRequest(
        spot_id=45, activity="surf", at=at, as_of=as_of, mode="forecast"
    )
    result = asyncio.run(
        service.explain(ai_settings, request, adapter=forbidden, budget=forbidden)
    )
    assert seen[0].at == at and seen[0].as_of == as_of
    assert seen[0].mode == "forecast" and seen[0].activity == "surf"
    assert result.activity == "surf" and result.mode == "forecast"
    with pytest.raises(ValueError):
        service.ExplainRequest(spot_id=45, at="2026-09-01T00:00:00")
    with pytest.raises(ValueError):
        service.ExplainRequest(spot_id=45, at=as_of - timedelta(days=32), as_of=as_of)


def test_total_timeout_is_bounded_and_preserves_facts(
    monkeypatch, spatial, ai_settings
):
    async def timed_out(awaitable, *, timeout):
        assert timeout == ai_settings.ai_timeout_seconds + 1
        awaitable.close()
        raise TimeoutError("private transport state")

    baseline = explain(
        ai_settings, adapter=forbidden, budget=forbidden, use_model=False
    )
    monkeypatch.setattr(service.asyncio, "wait_for", timed_out)
    result = explain(ai_settings, adapter=forbidden)
    assert result.facts == baseline.facts
    assert result.reason_codes == ["ai_output_unverified_or_unavailable"]


def test_public_get_never_calls_model_or_budget_even_with_extra_query(
    monkeypatch, spatial, ai_settings
):
    original = service.explain

    async def bounded(settings, request):
        return await original(settings, request, adapter=forbidden, budget=forbidden)

    monkeypatch.setattr(service, "explain", bounded)
    app = FastAPI()
    app.include_router(service.create_ai_router(ai_settings))
    client = TestClient(app)
    for url in (
        "/api/data/ai/explanation?spot_id=45",
        "/api/data/ai/explanation?spot_id=45&use_model=true",
    ):
        response = client.get(url)
        assert response.status_code == 200
        assert response.json()["provider"] == "deterministic"
    assert client.get("/api/data/ai/explanation?spot_id=-1").status_code == 422
    assert (
        client.get("/api/data/ai/explanation?spot_id=45&activity=made_up").status_code
        == 422
    )
    response = client.post(
        "/api/data/ai/explanation", json={"spot_id": 45, "use_model": True}
    )
    assert response.status_code == 401


class Opener:
    def __init__(self, payload):
        self.payload = payload
        self.requests = []

    def open(self, request, timeout):
        self.requests.append((request, timeout))
        return BytesIO(self.payload)


def test_openai_responses_contract_is_fixed_bounded_and_has_no_key_in_body(
    monkeypatch, ai_settings
):
    output = {
        "status": "completed",
        "output": [
            {
                "content": [
                    {
                        "type": "output_text",
                        "text": '{"ordered_fact_ids":["one"]}',
                    }
                ]
            }
        ],
    }
    opener = Opener(json.dumps(output).encode())
    monkeypatch.setattr(service, "build_opener", lambda *_: opener)
    facts = [{"fact_id": "one", "text": "verified", "evidence_refs": ["metric:1"]}]
    assert service.openai_order(ai_settings, facts) == {"ordered_fact_ids": ["one"]}
    request, timeout = opener.requests[0]
    body = json.loads(request.data)
    assert request.full_url == "https://api.openai.com/v1/responses"
    assert request.get_header("Authorization") == "Bearer private-test-key"
    assert "private-test-key" not in request.data.decode()
    assert timeout == ai_settings.ai_timeout_seconds
    assert body["store"] is False
    assert body["model"] == "unit-test-model"
    assert body["max_output_tokens"] == ai_settings.ai_max_output_tokens
    assert json.loads(body["input"]) == facts
    schema = body["text"]["format"]["schema"]
    assert schema["additionalProperties"] is False
    assert schema["properties"]["ordered_fact_ids"]["items"]["enum"] == ["one"]


@pytest.mark.parametrize(
    "payload",
    [
        b"x" * 65537,
        b'{"status":"incomplete","output":[]}',
        b'{"status":"completed","output":[]}',
        b'{"status":"completed","output":[{"content":[{"type":"refusal"}]}]}',
    ],
)
def test_provider_truncated_refused_and_oversized_outputs_are_not_explanations(
    monkeypatch, ai_settings, payload
):
    monkeypatch.setattr(service, "build_opener", lambda *_: Opener(payload))
    with pytest.raises(ValueError):
        service.openai_order(ai_settings, [])


@pytest.fixture
def ai_db():
    settings = Settings()
    if settings.postgres_db != "pongdang_test":
        pytest.fail("AI reservation integration requires disposable pongdang_test")
    initialize(settings)
    with connect(settings) as c:
        service.migrate_ai(c)
    yield settings
    with connect(settings) as c:
        c.execute("DROP SCHEMA pongdang_data CASCADE")


def test_daily_call_budget_is_atomic_under_concurrent_workers(ai_db):
    settings = ai_db.model_copy(update={"ai_max_daily_calls": 2})
    with ThreadPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(lambda _: service.reserve(settings, 100), range(8)))
    assert sum(results) == 2
    with connect(settings) as c:
        calls, tokens, cost = c.execute(
            "SELECT calls,reserved_tokens,reserved_cost_microusd "
            "FROM pongdang_data.ai_daily_budget"
        ).fetchone()
    assert calls == 2
    assert tokens >= 2 * settings.ai_max_output_tokens
    assert cost == 2 * settings.ai_reserved_call_microusd


@pytest.mark.parametrize("field", ["ai_max_daily_tokens", "ai_daily_budget_microusd"])
def test_token_and_cost_reservation_limits_prevent_a_call(ai_db, field):
    settings = ai_db.model_copy(update={field: 0})
    assert service.reserve(settings, 100) is False
    with connect(settings) as c:
        assert c.execute(
            "SELECT calls,reserved_tokens,reserved_cost_microusd "
            "FROM pongdang_data.ai_daily_budget"
        ).fetchone() == (0, 0, 0)


def test_configured_model_prices_can_exceed_minimum_call_reservation(ai_db):
    settings = ai_db.model_copy(
        update={
            "ai_input_microusd_per_million_tokens": 100_000_000,
            "ai_output_microusd_per_million_tokens": 200_000_000,
            "ai_daily_budget_microusd": 163_600,
        }
    )
    assert service.reserve(settings, 100) is True
    assert service.reserve(settings, 100) is False
    with connect(settings) as c:
        assert c.execute(
            "SELECT calls,reserved_tokens,reserved_cost_microusd "
            "FROM pongdang_data.ai_daily_budget"
        ).fetchone() == (1, 1380, 163600)
