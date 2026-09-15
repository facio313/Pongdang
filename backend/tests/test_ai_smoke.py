"""Explicit operator CLI tests: offline provider, real disposable accounting DB."""

import asyncio
import json

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import SecretStr

from app.ai import budget, smoke
from app.ai.chat import create_chat_router
from app.config import Settings
from app.schema import connect, initialize


def isolated_settings(**changes):
    return Settings(_env_file=None, postgres_password="offline-test-only", **changes)


def test_local_flag_requires_explicit_live_and_never_loads_settings(monkeypatch):
    monkeypatch.setattr("app.config.Settings", lambda: pytest.fail("No settings read"))
    with pytest.raises(SystemExit) as failure:
        smoke.main(["--local"])
    assert failure.value.code == 2
    assert smoke.main([]) == 0


@pytest.mark.parametrize(
    "host,dbname,allowed",
    [
        ("127.0.0.1", "pongdang", True),
        ("localhost", "pongdang_test", True),
        ("::1", "pongdang_test", True),
        ("192.0.2.1", "pongdang", False),
        ("db", "pongdang", False),
        ("cksdb", "pongdang", False),
        ("127.0.0.1", "other_database", False),
    ],
)
def test_operator_scope_is_loopback_and_known_pongdang_db_only(host, dbname, allowed):
    settings = isolated_settings(postgres_host=host, postgres_db=dbname)
    assert budget.operator_local_database(settings) is allowed


def test_remote_local_smoke_rejects_before_provider_or_database(monkeypatch, capsys):
    settings = isolated_settings(postgres_host="db", ai_api_key="offline-test-key")
    monkeypatch.setattr("app.config.Settings", lambda: settings)
    monkeypatch.setattr(
        "app.ai.provider.ResponsesProvider", lambda _: pytest.fail("No provider")
    )
    monkeypatch.setattr("app.schema.connect", lambda _: pytest.fail("No DB connection"))
    assert smoke.main(["--local", "--live"]) == 1
    assert json.loads(capsys.readouterr().out)["reason"] == "ai_operator_local_required"
    assert (
        budget.acquire_operator_request(settings).reason_code
        == "ai_operator_local_required"
    )


@pytest.fixture
def operator_db():
    settings = Settings()
    if settings.postgres_db != "pongdang_test":
        pytest.fail("Operator smoke tests require disposable pongdang_test")
    with connect(settings) as c:
        c.execute("DROP SCHEMA IF EXISTS pongdang_data CASCADE")
    initialize(settings)
    settings = settings.model_copy(
        update={
            "ai_api_key": SecretStr("offline-provider-test-key"),
            "ai_provider": "auto",
            "ai_model": "gpt-5.6-luna",
            "ai_pricing_model": "gpt-5.6-luna",
            "ai_input_microusd_per_million_tokens": 200000,
            "ai_output_microusd_per_million_tokens": 1200000,
            "sso_proxy_secret": SecretStr(""),
            "sso_allowed_origins": "",
        }
    )
    yield settings
    with connect(settings) as c:
        c.execute("DROP SCHEMA pongdang_data CASCADE")


class OfflineProvider:
    """Exercises real function input/output composition without HTTP."""

    def __init__(self, settings):
        self.settings = settings
        self.bodies = []
        self.closed = False

    async def respond(self, body):
        self.bodies.append(body)
        assert "offline-provider-test-key" not in json.dumps(body)
        assert body["store"] is False
        assert [t["name"] for t in body["tools"]] == ["capabilities"]
        if len(self.bodies) == 1:
            output = [
                {
                    "type": "function_call",
                    "name": "capabilities",
                    "call_id": "operator-capabilities",
                    "arguments": '{"include_collection_status":false}',
                }
            ]
        else:
            assert len(self.bodies) == 2
            returned = next(
                item
                for item in body["input"]
                if item.get("type") == "function_call_output"
            )
            assert returned["call_id"] == "operator-capabilities"
            result = json.loads(returned["output"])
            assert result["tool"] == "capabilities"
            assert result["facts"]
            output = [
                {
                    "type": "message",
                    "content": [
                        {
                            "type": "output_text",
                            "text": json.dumps(
                                {
                                    "intent": "features",
                                    "clarification": None,
                                    "sections": [
                                        {
                                            "title": "features",
                                            "fact_ids": result["fact_ids"],
                                            "candidate_ids": [],
                                        }
                                    ],
                                }
                            ),
                        }
                    ],
                }
            ]
        return {
            "status": "completed",
            "output": output,
            "usage": {"input_tokens": 10, "output_tokens": 5},
        }

    async def aclose(self):
        self.closed = True


def test_explicit_local_smoke_uses_real_budgets_without_creating_sso(
    operator_db, monkeypatch, capsys
):
    provider = OfflineProvider(operator_db)
    monkeypatch.setattr("app.config.Settings", lambda: operator_db)
    monkeypatch.setattr("app.ai.provider.ResponsesProvider", lambda settings: provider)
    assert smoke.main(["--live", "--local"]) == 0
    result = json.loads(capsys.readouterr().out)
    assert result["status"] == "passed"
    assert result["features"] == ["capabilities"]
    assert result["reason_codes"] == []
    assert provider.closed and len(provider.bodies) == 2
    assert operator_db.sso_proxy_secret.get_secret_value() == ""
    assert operator_db.sso_allowed_origins == ""
    with connect(operator_db) as c:
        assert c.execute(
            "SELECT calls,observed_calls,reserved_cost_microusd,actual_input_tokens,"
            "actual_output_tokens FROM pongdang_data.ai_daily_budget"
        ).fetchone() == (2, 2, 40000, 20, 10)
        assert c.execute(
            "SELECT count(*) FROM pongdang_data.ai_request_leases"
        ).fetchone() == (0,)
        digests = c.execute(
            "SELECT principal_digest FROM pongdang_data.ai_principal_rate"
        ).fetchall()
        assert len(digests) == 1 and len(digests[0][0]) == 64
    # The operator-only CLI path does not grant browser access or mint a user.
    router, _ = create_chat_router(operator_db, provider=provider)
    app = FastAPI()
    app.include_router(router)
    with TestClient(app) as client:
        assert (
            client.get("/api/data/ai/status").json()["detail"] == "AUTH_NOT_CONFIGURED"
        )
        response = client.post("/api/data/ai/chat", json={"message": "안녕"})
        assert response.status_code == 503
        assert response.json()["detail"] == "AUTH_NOT_CONFIGURED"
    assert len(provider.bodies) == 2


def test_production_live_mode_keeps_existing_sso_admission(
    operator_db, monkeypatch, capsys
):
    provider = OfflineProvider(operator_db)
    monkeypatch.setattr("app.config.Settings", lambda: operator_db)
    monkeypatch.setattr("app.ai.provider.ResponsesProvider", lambda _: provider)
    assert smoke.main(["--live"]) == 1
    result = json.loads(capsys.readouterr().out)
    assert "ai_admission_not_configured" in result["reason_codes"]
    assert not provider.bodies and provider.closed
    with connect(operator_db) as c:
        assert c.execute(
            "SELECT count(*) FROM pongdang_data.ai_daily_budget"
        ).fetchone() == (0,)


def test_operator_and_authenticated_calls_share_global_capacity_and_rate(operator_db):
    settings = operator_db.model_copy(update={"ai_principal_requests_per_minute": 2})
    first = budget.acquire_operator_request(settings)
    assert first.lease_id
    authenticated = settings.model_copy(
        update={
            "sso_proxy_secret": SecretStr(
                "a-server-only-test-secret-at-least-32-characters"
            )
        }
    )
    second = budget.acquire_request(authenticated, "actual-test-user")
    assert second.lease_id
    assert (
        budget.acquire_operator_request(settings).reason_code == "ai_concurrency_limit"
    )
    budget.release_request(settings, first.lease_id)
    budget.release_request(settings, second.lease_id)
    third = budget.acquire_operator_request(settings)
    assert third.lease_id
    budget.release_request(settings, third.lease_id)
    assert budget.acquire_operator_request(settings).reason_code == "ai_rate_limit"
    assert (
        budget.acquire_request(settings, "operator-live-smoke").reason_code
        == "ai_admission_not_configured"
    )


def test_local_smoke_function_is_opt_in_by_default(operator_db, monkeypatch, capsys):
    provider = OfflineProvider(operator_db)
    monkeypatch.setattr("app.config.Settings", lambda: operator_db)
    monkeypatch.setattr("app.ai.provider.ResponsesProvider", lambda _: provider)
    assert asyncio.run(smoke.run()) == 1
    assert "ai_admission_not_configured" in capsys.readouterr().out
    assert not provider.bodies
