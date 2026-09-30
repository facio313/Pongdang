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


def test_explicit_kakao_opt_in_keeps_other_integrations_disabled(config, tmp_path):
    env = tmp_path / "route.env"
    env.write_text(
        "KAKAO_REST_API_KEY=explicit-route-test-key\n"
        "KAKAO_REST_KEY=unused-collection-test-key\n"
        "AI_API_KEY=unused-ai-test-key\n"
        "POSTGRES_DB=production\n"
    )
    key = preview.read_kakao_route_key(env)
    settings = preview.preview_settings(config, kakao_rest_api_key=key)
    assert settings.travel_route_provider == "kakao"
    assert settings.kakao_rest_api_key.get_secret_value() == "explicit-route-test-key"
    assert settings.postgres_db == "pongdang_test"
    assert not settings.kakao_rest_key.get_secret_value()
    assert not settings.ai_api_key.get_secret_value()
    assert settings.ai_effective_provider == "disabled"
    assert settings.notifications_provider == "disabled"
    assert not settings.notifications_delivery_enabled


def test_explicit_kakao_key_fallback_and_missing_key(tmp_path):
    env = tmp_path / "route.env"
    env.write_text("KAKAO_REST_API_KEY=\nKAKAO_REST_KEY=fallback-test-key\n")
    assert preview.read_kakao_route_key(env) == "fallback-test-key"
    env.write_text("AI_API_KEY=unrelated-test-key\n")
    with pytest.raises(ValueError, match="no Kakao REST key"):
        preview.read_kakao_route_key(env)


def test_explicit_ai_opt_in_is_bounded_and_does_not_import_other_settings(
    config, tmp_path
):
    env = tmp_path / "ai.env"
    env.write_text(
        "AI_API_KEY=explicit-ai-test-key\n"
        "AI_MODEL=another-model\n"
        "AI_MAX_DAILY_CALLS=1000\n"
        "AI_DAILY_BUDGET_MICROUSD=999999999\n"
        "KAKAO_REST_API_KEY=unused-route-test-key\n"
        "POSTGRES_DB=production\n"
    )
    settings = preview.preview_settings(config, ai_api_key=preview.read_ai_key(env))
    assert settings.ai_effective_provider == "openai"
    assert settings.ai_api_key.get_secret_value() == "explicit-ai-test-key"
    assert settings.ai_model == settings.ai_pricing_model == "gpt-6-luna"
    assert settings.ai_max_daily_calls == 30
    assert settings.ai_daily_budget_microusd == 600000
    assert settings.postgres_db == "pongdang_test"
    assert settings.travel_route_provider == "disabled"
    assert not settings.kakao_rest_api_key.get_secret_value()
    assert settings.notifications_provider == "disabled"
    env.write_text("KAKAO_REST_API_KEY=unrelated-test-key\n")
    with pytest.raises(ValueError, match="no AI API key"):
        preview.read_ai_key(env)


def test_openai_network_opt_in_allows_only_resolved_https_destination():
    guard = preview.network_guard(15499, openai_addresses={("1.1.1.1", 443)})
    guard("socket.getaddrinfo", (preview.OPENAI_HOST, 443))
    guard("socket.getaddrinfo", (preview.OPENAI_HOST.encode(), 443))
    guard("socket.connect", (None, ("1.1.1.1", 443)))
    guard("socket.connect", (None, ("127.0.0.1", 15499)))
    for hostname, port in [
        (preview.OPENAI_HOST + ".example.com", 443),
        (preview.OPENAI_HOST, 80),
        (preview.KAKAO_DIRECTIONS_HOST, 443),
    ]:
        with pytest.raises(PermissionError):
            guard("socket.getaddrinfo", (hostname, port))
    for address in [("127.0.0.1", 5432), ("8.8.8.8", 443), ("1.1.1.1", 80)]:
        with pytest.raises(PermissionError):
            guard("socket.connect", (None, address))
    with pytest.raises(PermissionError):
        preview.network_guard(15499)("socket.getaddrinfo", (preview.OPENAI_HOST, 443))


def test_kakao_network_opt_in_preserves_database_and_destination_boundaries():
    guard = preview.network_guard(15499, kakao_addresses={("1.1.1.1", 443)})
    guard("socket.getaddrinfo", (preview.KAKAO_DIRECTIONS_HOST, 443))
    guard("socket.getaddrinfo", (preview.KAKAO_DIRECTIONS_HOST.encode(), 443))
    guard("socket.connect", (None, ("1.1.1.1", 443)))
    guard("socket.connect", (None, ("127.0.0.1", 15499)))
    for destination in [("127.0.0.1", 5432), ("1.1.1.1", 80), ("8.8.8.8", 443)]:
        with pytest.raises(PermissionError):
            guard("socket.connect", (None, destination))
    for hostname, port in [
        ("example.com", 443),
        (preview.KAKAO_DIRECTIONS_HOST + ".example.com", 443),
        (preview.KAKAO_DIRECTIONS_HOST, 80),
    ]:
        with pytest.raises(PermissionError):
            guard("socket.getaddrinfo", (hostname, port))


def test_kakao_resolution_rejects_nonpublic_addresses(monkeypatch):
    def resolve(host, port, **kwargs):
        assert host == preview.KAKAO_DIRECTIONS_HOST and port == 443
        return [(None, None, None, None, ("1.1.1.1", 443))]

    monkeypatch.setattr(preview.socket, "getaddrinfo", resolve)
    assert preview.resolve_kakao_addresses() == frozenset({("1.1.1.1", 443)})
    for address in ("127.0.0.1", "10.0.0.1", "::1"):
        monkeypatch.setattr(
            preview.socket,
            "getaddrinfo",
            lambda *args, address=address, **kwargs: [
                (None, None, None, None, (address, 443))
            ],
        )
        with pytest.raises(ValueError, match="public HTTPS"):
            preview.resolve_kakao_addresses()


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


def test_disabled_preview_chat_never_repeats_old_beach_recommendations(
    app, config, monkeypatch
):
    async def forbidden(*args, **kwargs):
        raise AssertionError("A disabled model must not select places")

    monkeypatch.setattr("app.travel.chat.recommend", forbidden)
    with client_for(app) as client:
        assert login(client, config).status_code == 200
        response = client.post(
            "/pongdang/api/data/ai/chat",
            json={
                "message": "오전엔 해변으로 갔다가 오후에는 계곡에 가고 싶어.",
                "travel": {
                    "request": {
                        "region": "gangwon",
                        "keyword_selection": [
                            {"category": "place_type", "values": ["beach"]}
                        ],
                    }
                },
            },
            headers={"origin": preview.ORIGIN},
        )
    assert response.status_code == 200
    value = response.json()
    assert value["status"] == "unavailable"
    assert "ai_scope_unavailable" in value["reason_codes"]
    assert value["travel_results"] == {}
    assert value["candidates"] == []


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
