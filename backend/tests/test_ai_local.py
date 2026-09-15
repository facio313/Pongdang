"""Local operator HTTP boundaries; no database writes or provider network calls."""

import json
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app.ai import local
from app.ai.chat import ChatResponse, Context
from app.config import Settings
from app.main import create_app

TOKEN = "local-test-bootstrap-token-with-high-entropy-placeholder"
HEADERS = {"origin": local.ORIGIN, "sec-fetch-site": "same-origin"}


@pytest.fixture
def settings():
    return Settings(
        _env_file=None,
        postgres_password="offline-only",
        postgres_host="127.0.0.1",
        postgres_db="pongdang_test",
        ai_api_key="offline-test-key",
        sso_proxy_secret="",
        sso_allowed_origins="",
    )


@pytest.fixture
def state(settings, monkeypatch):
    async def no_database(_settings):
        pass

    monkeypatch.setattr("app.main.check_database", no_database)
    calls = []

    class Provider:
        async def aclose(self):
            pass

    async def handler(settings, body, actor, provider, *, budget_api):
        calls.append((body, actor, budget_api))
        return ChatResponse(
            request_id="local-test",
            status="ok",
            answer="로컬 테스트",
            provider="deterministic",
            fallback=True,
            model=None,
            scope={},
            candidates=[],
            facts=[],
            sources=[],
            warnings=[],
            limitations=[],
            features=[],
            reason_codes=[],
            context=Context(),
            sections=[],
        )

    clock = [100.0]
    provider = Provider()
    app = local.create_local_app(
        settings,
        bootstrap_token=TOKEN,
        now=lambda: clock[0],
        provider=provider,
        handler=handler,
    )
    with TestClient(app, base_url=local.ORIGIN, client=("127.0.0.1", 49152)) as client:
        yield SimpleNamespace(
            client=client, app=app, clock=clock, calls=calls, provider=provider
        )


def exchange(client, token=TOKEN, **kwargs):
    return client.post(
        "/api/local/session", json={"token": token}, headers=HEADERS, **kwargs
    )


def test_bootstrap_private_page_and_session_cookie(state):
    page = state.client.get("/api/local/start")
    assert page.status_code == 200
    assert TOKEN not in page.text and "offline-test-key" not in page.text
    assert "history.replaceState" in page.text
    assert page.headers["cache-control"] == "no-store"
    assert page.headers["referrer-policy"] == "no-referrer"
    assert "'sha256-" in page.headers["content-security-policy"]
    assert "frame-ancestors 'none'" in page.headers["content-security-policy"]
    response = exchange(state.client)
    assert response.status_code == 200 and response.json() == {"status": "ready"}
    cookie = response.headers["set-cookie"]
    assert "HttpOnly" in cookie and "SameSite=strict" in cookie
    assert "Path=/api/data/ai" in cookie and "Max-Age=7200" in cookie
    assert "Domain=" not in cookie
    assert TOKEN not in cookie and "offline-test-key" not in cookie
    status = state.client.get("/api/data/ai/status")
    assert status.status_code == 200
    assert status.json()["auth_mode"] == "local_operator"
    assert not state.calls


def test_authenticated_chat_keeps_operator_budget_and_no_sso_identity(state):
    assert exchange(state.client).status_code == 200
    response = state.client.post(
        "/api/data/ai/chat", json={"message": "안녕"}, headers=HEADERS
    )
    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    assert len(state.calls) == 1
    assert state.calls[0][1] == "local-operator"
    assert state.calls[0][2] is local.OperatorAccounting


@pytest.mark.parametrize("token", ["wrong", None, 5, {}, "x" * 129])
def test_invalid_bootstrap_never_grants_or_spends(state, token):
    assert exchange(state.client, token).status_code == 401
    assert state.client.get("/api/data/ai/status").status_code == 401
    assert not state.calls
    assert exchange(state.client).status_code == 200


def test_one_time_and_expired_bootstrap(state):
    assert exchange(state.client).status_code == 200
    assert exchange(state.client).status_code == 401
    assert state.client.get("/api/data/ai/status").status_code == 200


def test_bootstrap_expiry_is_monotonic(state):
    state.clock[0] += local.BOOTSTRAP_SECONDS
    assert exchange(state.client).status_code == 401
    assert not state.calls


def test_session_expiry_forgery_and_duplicate_cookie(state):
    assert exchange(state.client).status_code == 200
    real_cookie = state.client.cookies.get(local.COOKIE)
    for cookie in (
        f"{local.COOKIE}=forged",
        f"{local.COOKIE}=forged; {local.COOKIE}={real_cookie}",
        f"{local.COOKIE}={real_cookie}; {local.COOKIE}=forged",
    ):
        response = state.client.get("/api/data/ai/status", headers={"cookie": cookie})
        assert response.status_code == 401
    state.clock[0] += local.SESSION_SECONDS
    response = state.client.get("/api/data/ai/status")
    assert response.status_code == 401
    assert response.json()["detail"] == "LOCAL_OPERATOR_SESSION_REQUIRED"
    assert not state.calls


@pytest.mark.parametrize(
    "headers",
    [
        {"host": "evil.test:5173"},
        {"host": "127.0.0.1:8000"},
        {"origin": "http://127.0.0.1:9999"},
        {"origin": "https://evil.test"},
        {"origin": "null"},
        {"sec-fetch-site": "same-site"},
        {"sec-fetch-site": "cross-site"},
    ],
)
def test_untrusted_host_origin_fetch_site_never_reaches_handler(state, headers):
    assert exchange(state.client).status_code == 200
    for path in ("/api/local/start", "/api/data/ai/status"):
        assert state.client.get(path, headers=headers).status_code == 403
    response = state.client.post(
        "/api/data/ai/chat", json={"message": "안녕"}, headers={**HEADERS, **headers}
    )
    assert response.status_code == 403
    assert not state.calls


def test_post_requires_origin_and_rejects_remote_peer_even_forwarded_loopback(state):
    response = state.client.post("/api/local/session", json={"token": TOKEN})
    assert response.status_code == 403
    with TestClient(
        state.app, base_url=local.ORIGIN, client=("192.0.2.5", 45678)
    ) as remote:
        response = remote.post(
            "/api/local/session",
            json={"token": TOKEN},
            headers={**HEADERS, "x-forwarded-for": "127.0.0.1"},
        )
        assert response.status_code == 403
    assert not state.calls


def test_bounds_validation_and_authorization_before_body(state):
    response = state.client.post(
        "/api/data/ai/chat", content="x" * 20001, headers=HEADERS
    )
    assert response.status_code == 401
    assert response.json()["detail"] == "LOCAL_OPERATOR_SESSION_REQUIRED"
    response = state.client.post(
        "/api/local/session",
        content="x" * 1025,
        headers={**HEADERS, "content-type": "application/json"},
    )
    assert response.status_code == 413
    for value in ({"token": TOKEN, "extra": 1}, [], "oops"):
        response = state.client.post("/api/local/session", json=value, headers=HEADERS)
        assert response.status_code == 400
    assert exchange(state.client).status_code == 200
    assert (
        state.client.post(
            "/api/data/ai/chat", content="x" * 20001, headers=HEADERS
        ).status_code
        == 413
    )
    assert (
        state.client.post(
            "/api/data/ai/chat", json={"message": "ok", "extra": 1}, headers=HEADERS
        ).status_code
        == 422
    )
    assert not state.calls


def test_local_cookie_does_not_unlock_sso_apis_or_default_production(state, settings):
    assert exchange(state.client).status_code == 200
    response = state.client.get("/api/data/notifications/subscriptions")
    assert response.status_code == 503
    assert response.json()["detail"] == "AUTH_NOT_CONFIGURED"
    production = create_app(settings)
    with TestClient(production, base_url=local.ORIGIN) as client:
        assert client.get("/api/local/start").status_code == 404
        assert (
            client.post("/api/local/session", json={"token": TOKEN}).status_code == 404
        )
        client.cookies.set(local.COOKIE, state.client.cookies.get(local.COOKIE))
        response = client.get("/api/data/ai/status")
        assert response.status_code == 503
        assert response.json()["detail"] == "AUTH_NOT_CONFIGURED"
    assert not state.calls


@pytest.mark.parametrize(
    "changes",
    [
        {"postgres_host": "db"},
        {"postgres_host": "192.0.2.4"},
        {"postgres_db": "legacy"},
    ],
)
def test_local_factory_rejects_other_databases_before_provider(settings, changes):
    with pytest.raises(ValueError, match="loopback Pongdang"):
        local.create_local_app(settings.model_copy(update=changes))


def test_cli_private_file_fixed_binding_and_cleanup(tmp_path, monkeypatch, capsys):
    app = object()
    monkeypatch.setattr(local, "create_local_app", lambda **kwargs: app)
    session_file = tmp_path / "session.json"
    captured = []

    def run(received, **kwargs):
        assert received is app
        assert kwargs == {
            "host": "127.0.0.1",
            "port": 8000,
            "proxy_headers": False,
            "access_log": False,
        }
        assert session_file.stat().st_mode & 0o777 == 0o600
        value = json.loads(session_file.read_text())
        assert set(value) == {"bootstrap_url"}
        url = value["bootstrap_url"]
        assert url.startswith(local.ORIGIN + "/api/local/start#token=")
        assert len(url.split("=", 1)[1]) >= 43
        captured.append(url)

    monkeypatch.setattr("uvicorn.run", run)
    assert local.main(["--session-file", str(session_file)]) == 0
    assert not session_file.exists()
    assert captured[0] not in capsys.readouterr().out


def test_cli_will_not_clobber_existing_file(tmp_path, monkeypatch):
    monkeypatch.setattr(local, "create_local_app", lambda **kwargs: object())
    session_file = Path(tmp_path, "existing.json")
    session_file.write_text("keep")
    assert local.main(["--session-file", str(session_file)]) == 1
    assert session_file.read_text() == "keep"
