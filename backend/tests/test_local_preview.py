"""Boundaries of the separately launched local testing entry point."""

import copy

import pytest
from fastapi.testclient import TestClient

from dev import local_preview as preview


@pytest.fixture
def config():
    return {
        "kind": "pongdang-isolated-local-preview-v1",
        "postgres_host": "127.0.0.1",
        "postgres_port": 15499,
        "postgres_db": "pongdang_test",
        "postgres_user": "preview_app",
        "postgres_password": "unit-test-database-password",
        "database_marker": "unit-test-marker",
        "username": "test-user",
        "password": "unit-test-login-password",
        "attachment_root": "/tmp/local-preview-test-attachments",
        "windy_thumbnail_root": "/tmp/local-preview-test-thumbnails",
    }


@pytest.fixture
def app(config, monkeypatch):
    async def no_database(_settings):
        pass

    monkeypatch.setattr("app.main.check_database", no_database)
    monkeypatch.setattr(preview, "verify_database", lambda *_: None)
    monkeypatch.setattr(
        "app.travel.storage.profile",
        lambda _settings, subject: {"test_subject": subject},
    )
    return preview.create_preview_app(config)


def client_for(app, *, peer="127.0.0.1"):
    return TestClient(
        app,
        base_url=preview.ORIGIN,
        root_path="/pongdang",
        client=(peer, 49152),
    )


def login(client, config, **kwargs):
    return client.post(
        "/pongdang/api/auth/login",
        json={"username": config["username"], "password": config["password"]},
        headers={"origin": preview.ORIGIN, "sec-fetch-site": "same-origin"},
        **kwargs,
    )


@pytest.mark.parametrize(
    "changes",
    [
        {"postgres_db": "pongdang"},
        {"postgres_host": "192.0.2.1"},
        {"postgres_host": "localhost"},
        {"postgres_port": 5432},
        {"database_marker": ""},
        {"kind": "production"},
    ],
)
def test_requires_separate_marked_loopback_database(config, changes):
    with pytest.raises(ValueError, match="separate loopback"):
        preview.preview_settings({**config, **changes})


def test_does_not_inherit_provider_credentials(config, monkeypatch):
    for key in (
        "AI_API_KEY",
        "KAKAO_REST_KEY",
        "KAKAO_REST_API_KEY",
        "WINDY_WEBCAMS_API_KEY",
        "NOTIFICATIONS_RESEND_API_KEY",
    ):
        monkeypatch.setenv(key, "inherited-value-must-not-be-used")
    monkeypatch.setenv("AI_PROVIDER", "openai")
    monkeypatch.setenv("NOTIFICATIONS_DELIVERY_ENABLED", "true")
    settings = preview.preview_settings(config)
    assert settings.ai_effective_provider == "disabled"
    assert settings.travel_route_provider == "disabled"
    assert settings.notifications_provider == "disabled"
    assert not settings.notifications_delivery_enabled
    assert all(
        not getattr(settings, key).get_secret_value()
        for key in (
            "ai_api_key",
            "kakao_rest_key",
            "kakao_rest_api_key",
            "windy_webcams_api_key",
            "notifications_resend_api_key",
            "data_go_kr_key",
        )
    )


def test_login_cookie_and_real_private_auth_chain(app, config):
    with client_for(app) as client:
        assert client.get("/pongdang/api/auth/state").status_code == 401
        private = "/pongdang/api/data/travel/preferences"
        assert client.get(private).status_code == 401
        response = login(client, config)
        assert response.status_code == 200
        cookie = response.headers["set-cookie"].lower()
        assert "httponly" in cookie and "samesite=strict" in cookie
        assert "path=/pongdang/" in cookie and "domain=" not in cookie
        assert client.get("/pongdang/api/auth/state").json()["authenticated"]
        assert client.get(private).json() == {"test_subject": preview.SUBJECT}
        ai = client.get("/pongdang/api/data/ai/status")
        assert ai.status_code == 200
        assert not ai.json()["enabled"]
        client.post("/pongdang/api/auth/logout", headers={"origin": preview.ORIGIN})
        assert client.get(private).status_code == 401


def test_invalid_credentials_do_not_authenticate_or_accept_forged_sso(app, config):
    with client_for(app) as client:
        bad = {**config, "username": "다른 사용자"}
        assert login(client, bad).status_code == 401
        assert login(client, {**config, "password": "wrong"}).status_code == 401
        assert client.get("/pongdang/api/auth/state").status_code == 401
        assert (
            client.get(
                "/pongdang/api/data/travel/preferences",
                headers={
                    "x-pongdang-sso-token": "forged-token",
                    "x-pongdang-sso-subject": "production-owner",
                    "x-pongdang-sso-grants": "access-pongdang",
                    "cookie": "production_session=not-a-local-session",
                },
            ).status_code
            == 401
        )


@pytest.mark.parametrize(
    "headers",
    [
        {"host": "pongdang.site"},
        {"origin": "https://pongdang.site"},
        {"origin": "http://localhost:5173"},
        {"sec-fetch-site": "cross-site"},
    ],
)
def test_untrusted_browser_boundaries_are_denied(app, headers):
    with client_for(app) as client:
        assert (
            client.get("/pongdang/api/auth/state", headers=headers).status_code == 403
        )


def test_remote_peer_and_missing_write_origin_are_denied(app, config):
    with client_for(app, peer="192.0.2.10") as client:
        assert login(client, config).status_code == 403
    with client_for(app) as client:
        assert (
            client.post(
                "/pongdang/api/auth/login",
                json={"username": config["username"], "password": config["password"]},
            ).status_code
            == 403
        )


def test_expired_and_duplicate_sessions_are_rejected(config, monkeypatch):
    monkeypatch.setattr(preview, "verify_database", lambda *_: None)

    async def no_database(_settings):
        pass

    monkeypatch.setattr("app.main.check_database", no_database)
    clock = [100.0]
    app = preview.create_preview_app(config, now=lambda: clock[0])
    with client_for(app) as client:
        assert login(client, config).status_code == 200
        token = client.cookies.get(preview.COOKIE)
        assert (
            client.get(
                "/pongdang/api/auth/state",
                headers={
                    "cookie": f"{preview.COOKIE}={token};{preview.COOKIE}={token}"
                },
            ).status_code
            == 401
        )
        clock[0] += preview.SESSION_SECONDS + 1
        assert client.get("/pongdang/api/auth/state").status_code == 401


def test_network_guard_only_permits_owned_database():
    guard = preview.network_guard(15499)
    guard("socket.connect", (None, ("127.0.0.1", 15499)))
    for destination in [
        ("127.0.0.1", 5432),
        ("192.0.2.1", 443),
        ("127.0.0.1", 4189),
        "/tmp/another-db",
    ]:
        with pytest.raises(PermissionError):
            guard("socket.connect", (None, destination))
    with pytest.raises(PermissionError):
        guard("socket.getaddrinfo", ("pongdang.site", 443))


def test_normal_application_has_no_test_login_routes(config, monkeypatch):
    async def no_database(_settings):
        pass

    monkeypatch.setattr("app.main.check_database", no_database)
    settings = preview.preview_settings(copy.deepcopy(config))
    with client_for(preview.create_app(settings)) as client:
        assert client.get("/pongdang/api/auth/state").status_code == 404
        assert client.post("/pongdang/api/auth/login", json={}).status_code == 404
