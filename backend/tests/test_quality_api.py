"""Quality HTTP contracts and errors without production DB access."""

from contextlib import asynccontextmanager
from datetime import UTC, datetime, timedelta

from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

from app.config import Settings
from app.quality.api import create_router
from app.quality.storage import QualityError


def settings(**overrides):
    return Settings(_env_file=None, postgres_password="test-only", **overrides)


def client_for(configuration):
    app = FastAPI()
    app.include_router(create_router(configuration))
    return TestClient(app)


def test_get_boundaries_reject_invalid_before_db():
    with client_for(settings()) as client:
        for query in (
            "page_size=101",
            "page=1001",
            "spot_id=0",
            "as_of=2026-01-01",
            "page=1&page=2",
            "unexpected=value",
            "as_of="
            + (datetime.now(UTC) + timedelta(days=1)).isoformat().replace("+", "%2B"),
        ):
            response = client.get("/api/data/quality/comparisons?" + query)
            assert response.status_code == 422, response.text
            assert response.json()["error_code"] == "invalid_request"
            assert response.headers["cache-control"] == "no-store"


def test_api_db_failure_is_not_fake_empty_data(monkeypatch):
    from app.quality import api

    @asynccontextmanager
    async def broken(self):
        raise HTTPException(503, "connection failed")
        yield

    monkeypatch.setattr(api.DataReader, "connection", broken)
    with client_for(settings()) as client:
        response = client.get("/api/data/quality/comparisons")
        assert response.status_code == 503
        assert response.json()["error_code"] == "quality_unavailable"


def test_authenticated_writes_fail_closed_and_openapi_has_typed_contracts():
    with client_for(settings()) as client:
        assert client.get("/api/data/quality/observations").status_code == 503
        document = client.get("/openapi.json").json()
        assert "ComparisonEnvelope" in document["components"]["schemas"]
        assert "ObservationInput" in document["components"]["schemas"]
    with client_for(settings(sso_proxy_secret="x" * 32)) as client:
        assert client.get("/api/data/quality/observations").status_code == 401


def test_owner_identity_is_injected_and_conflict_is_sanitized(monkeypatch):
    from app.quality import api

    calls = []

    def conflict(configuration, subject, value):
        calls.append((subject, value.review_id))
        raise QualityError("revision_conflict", 409)

    monkeypatch.setattr(api, "store_observation", conflict)
    config = settings(
        sso_proxy_secret="x" * 32, sso_allowed_origins="https://test.invalid"
    )
    headers = {
        "X-Pongdang-SSO-Token": "x" * 32,
        "X-Pongdang-SSO-Subject": "alice",
        "X-Pongdang-SSO-Grants": "access-pongdang",
        "Origin": "https://test.invalid",
    }
    body = {
        "review_id": "test-review",
        "revision": 1,
        "spot_id": 1,
        "observed_at": "2026-01-01T12:00:00+09:00",
        "spatial_relation": "at_spot",
        "text": "탁하지 않았다",
    }
    with client_for(config) as client:
        response = client.post(
            "/api/data/quality/observations", headers=headers, json=body
        )
        assert response.status_code == 409 and calls == [("alice", "test-review")]
        assert response.json()["error_code"] == "revision_conflict"
        assert (
            client.post(
                "/api/data/quality/observations",
                headers=headers,
                json={**body, "owner_key": "bob"},
            ).status_code
            == 422
        )
        assert (
            client.post(
                "/api/data/quality/observations",
                headers={**headers, "Origin": "https://evil.invalid"},
                json=body,
            ).status_code
            == 403
        )
