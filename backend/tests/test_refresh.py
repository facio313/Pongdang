"""Refresh authentication and request contracts without external services."""

from datetime import UTC, datetime
from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import SecretStr

from app.ingestion.jobs import Job, scheduled_interval
from app.refresh import api


def settings(**overrides):
    return SimpleNamespace(
        **{
            "sso_proxy_secret": SecretStr("refresh-test-secret-with-32-characters"),
            "sso_allowed_origins": "https://example.test",
            **overrides,
        }
    )


def headers(**overrides):
    return {
        "X-Pongdang-SSO-Token": "refresh-test-secret-with-32-characters",
        "X-Pongdang-SSO-Subject": "existing-sso-user",
        "X-Pongdang-SSO-Grants": "access-pongdang",
        "Origin": "https://example.test",
        **overrides,
    }


def client(conf=None):
    app = FastAPI()
    app.include_router(api.create_router(conf or settings()))
    return TestClient(app)


@pytest.mark.parametrize(
    ("given", "status"),
    [
        ({}, 401),
        (headers(**{"X-Pongdang-SSO-Token": "invalid"}), 401),
        (headers(**{"X-Pongdang-SSO-Grants": "access-legacy"}), 403),
        (headers(**{"Origin": "https://hostile.test"}), 403),
        (headers(**{"Sec-Fetch-Site": "cross-site"}), 403),
    ],
)
def test_refresh_requires_sso_grant_and_same_origin(monkeypatch, given, status):
    def unexpected(*_):
        pytest.fail("Rejected requests must not enter the refresh queue")

    monkeypatch.setattr(api, "enqueue_refresh", unexpected)
    assert (
        client().post("/api/data/refresh", headers=given, json={}).status_code == status
    )


def test_refresh_requires_configured_authentication():
    assert (
        client(settings(sso_proxy_secret=SecretStr("")))
        .post("/api/data/refresh", headers=headers(), json={})
        .status_code
        == 503
    )


def test_queue_and_status_expose_only_public_contract(monkeypatch):
    row = dict(
        request_id=uuid4(),
        status="queued",
        requested_at=datetime.now(UTC),
        finished_at=None,
        failed_jobs=[],
    )
    calls = []

    def queue(conf):
        calls.append("queue")
        return {**row, "owner_subject": "must-not-leak"}

    def read(conf, request_id):
        calls.append("read")
        assert request_id == row["request_id"]
        return row

    monkeypatch.setattr(api, "enqueue_refresh", queue)
    monkeypatch.setattr(api, "read_refresh", read)
    with client() as http:
        response = http.post("/api/data/refresh", headers=headers(), json={})
        assert response.status_code == 202
        assert response.headers["cache-control"] == "private, no-store"
        assert set(response.json()) == set(row)
        for _ in range(2):
            status = http.get(
                f"/api/data/refresh/{row['request_id']}", headers=headers()
            )
            assert status.status_code == 200
            assert status.headers["cache-control"] == "private, no-store"
        assert (
            http.post(
                "/api/data/refresh", headers=headers(), json={"provider": "arbitrary"}
            ).status_code
            == 422
        )
        assert (
            http.get("/api/data/refresh/not-a-uuid", headers=headers()).status_code
            == 422
        )
    assert calls == ["queue", "read", "read"]


def test_unknown_request_and_db_errors_are_sanitized(monkeypatch):
    import psycopg

    monkeypatch.setattr(api, "read_refresh", lambda *_: None)
    assert (
        client().get(f"/api/data/refresh/{uuid4()}", headers=headers()).status_code
        == 404
    )

    def fail(*_):
        raise psycopg.OperationalError("credentials-must-not-leak")

    monkeypatch.setattr(api, "enqueue_refresh", fail)
    response = client().post("/api/data/refresh", headers=headers(), json={})
    assert response.status_code == 503
    assert response.json() == {"detail": "REFRESH_UNAVAILABLE"}


def test_external_schedule_has_ten_minute_floor_without_changing_internal_pulses():
    assert scheduled_interval(Job("external", 300, fetch=lambda: None)) == 600
    assert scheduled_interval(Job("catalog", 86400, fetch=lambda: None)) == 86400
    assert scheduled_interval(Job("photos", 300, external_collection=True)) == 600
    assert scheduled_interval(Job("internal", 60, process=lambda: None)) == 60
