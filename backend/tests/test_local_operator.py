"""Loopback travel/AI without SSO; notifications stay fail-closed."""

from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient
from pydantic import SecretStr

from app.ai import local
from app.config import Settings
from app.ingestion.models import Place, SourceBatch
from app.ingestion.storage import store_batch
from app.main import create_app
from app.schema import connect, initialize

ORIGIN = local.ORIGIN
LOOPBACK = {"origin": ORIGIN, "sec-fetch-site": "same-origin"}


@pytest.fixture
def settings():
    return Settings(
        _env_file=None,
        postgres_password="offline-only",
        postgres_host="127.0.0.1",
        postgres_db="pongdang_test",
        ai_provider="disabled",
        sso_proxy_secret="",
        sso_allowed_origins="",
    )


@pytest.fixture
def app(settings, monkeypatch):
    async def no_database(_settings):
        pass

    monkeypatch.setattr("app.main.check_database", no_database)
    return create_app(settings)


def test_loopback_without_sso_opens_travel_and_ai_not_notifications(app):
    with TestClient(app, base_url=ORIGIN, client=("127.0.0.1", 49152)) as client:
        keywords = client.get("/api/data/travel/keywords")
        assert keywords.status_code == 200
        assert keywords.json()["version"] == "travel-keywords.v1"
        status = client.get("/api/data/ai/status")
        assert status.status_code == 200
        assert status.json()["auth_mode"] == "local_operator"
        notes = client.get("/api/data/notifications/subscriptions")
        assert notes.status_code == 503
        assert notes.json()["detail"] == "AUTH_NOT_CONFIGURED"


def test_remote_peer_and_forwarded_loopback_stay_closed(app):
    # /keywords is a public catalogue read now, so it cannot tell "open" from
    # "closed" here; /preferences is personal data and always needs auth.
    with TestClient(app, base_url=ORIGIN, client=("192.0.2.5", 45678)) as remote:
        assert remote.get("/api/data/travel/preferences").status_code == 503
        response = remote.get(
            "/api/data/travel/preferences", headers={"x-forwarded-for": "127.0.0.1"}
        )
        assert response.status_code == 503
        assert response.json()["detail"] == "AUTH_NOT_CONFIGURED"


@pytest.mark.parametrize(
    "headers",
    [
        {"host": "evil.test:5173"},
        {"origin": "https://evil.test"},
        {"origin": "http://127.0.0.1:9999"},
        {"sec-fetch-site": "cross-site"},
    ],
)
def test_untrusted_host_origin_never_opens_travel_writes(app, headers):
    with TestClient(app, base_url=ORIGIN, client=("127.0.0.1", 49152)) as client:
        response = client.post(
            "/api/data/travel/recommendations",
            json={"request": {"region": "강릉"}},
            headers={**LOOPBACK, **headers},
        )
        assert response.status_code in {403, 503}


def test_configured_sso_still_required(settings, monkeypatch):
    async def no_database(_settings):
        pass

    monkeypatch.setattr("app.main.check_database", no_database)
    locked = settings.model_copy(
        update={
            "sso_proxy_secret": SecretStr(
                "isolated-travel-sso-secret-at-least-32-characters"
            ),
            "sso_allowed_origins": ORIGIN,
        }
    )
    with TestClient(
        create_app(locked), base_url=ORIGIN, client=("127.0.0.1", 49152)
    ) as client:
        # /keywords is a public catalogue read now; /preferences is personal
        # data and stays behind SSO even for the loopback origin.
        assert client.get("/api/data/travel/preferences").status_code == 401
        assert client.get("/api/data/ai/status").status_code == 401


def test_loopback_recommendation_uses_catalog_without_sso():
    settings = Settings(
        _env_file=None,
        ai_provider="disabled",
        sso_proxy_secret="",
        sso_allowed_origins="",
        postgres_db="pongdang_test",
        postgres_host="127.0.0.1",
    )
    if settings.postgres_db != "pongdang_test":
        pytest.fail("local operator DB tests require disposable pongdang_test")
    with connect(settings) as connection:
        connection.execute("DROP SCHEMA IF EXISTS pongdang_data CASCADE")
    initialize(settings)
    store_batch(
        settings,
        SourceBatch(
            provider="TOURAPI_KOREAN",
            fetched_at=datetime.now(UTC),
            places=[
                Place(
                    source_id="local-operator-beach",
                    name="로컬 운영자 해변",
                    kind="beach",
                    region="강릉",
                    latitude=37.8,
                    longitude=128.9,
                    category="해수욕장",
                )
            ],
        ),
    )
    try:
        with TestClient(
            create_app(settings), base_url=ORIGIN, client=("127.0.0.1", 49152)
        ) as client:
            response = client.post(
                "/api/data/travel/recommendations",
                json={
                    "request": {
                        "region": "강릉",
                        "preferred_tags": ["서핑"],
                        "activity": "relax",
                        "locale": "ko",
                    },
                    "limit": 3,
                },
                headers=LOOPBACK,
            )
            assert response.status_code == 200, response.text
            result = response.json()
            assert result["recommendations"][0]["name"] == "로컬 운영자 해변"
            assert result["selection_token"]
            assert result["recommendations"][0]["spot_id"]
    finally:
        with connect(settings) as connection:
            connection.execute("DROP SCHEMA IF EXISTS pongdang_data CASCADE")
