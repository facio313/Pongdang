"""Notification/auth software tests never send to an external service."""

import json
from datetime import UTC, datetime, timedelta
from io import BytesIO
from types import SimpleNamespace
from urllib.error import HTTPError

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import SecretStr, ValidationError

from app.notifications import service
from app.notifications.api import create_router
from app.notifications.models import SubscriptionInput
from app.notifications.provider import (
    ENDPOINT,
    DeliveryError,
    ResendProvider,
    configuration_state,
)


def settings(**overrides):
    return SimpleNamespace(
        **{
            "sso_proxy_secret": SecretStr("a-test-secret-at-least-32-characters"),
            "sso_allowed_origins": "https://example.test",
            "notifications_delivery_enabled": True,
            "notifications_provider": "resend",
            "notifications_resend_api_key": SecretStr("test-key"),
            "notifications_from_email": "pongdang@example.test",
            **overrides,
        }
    )


def headers(**overrides):
    return {
        "X-Pongdang-SSO-Token": "a-test-secret-at-least-32-characters",
        "X-Pongdang-SSO-Subject": "sso-existing-user",
        "X-Pongdang-SSO-Grants": "access-pongdang",
        "X-Pongdang-SSO-Email": "existing@example.test",
        "Origin": "https://example.test",
        **overrides,
    }


@pytest.mark.parametrize(
    ("given", "status", "code"),
    [
        ({}, 401, "SSO_AUTHENTICATION_REQUIRED"),
        (
            headers(**{"X-Pongdang-SSO-Token": "forged"}),
            401,
            "SSO_AUTHENTICATION_REQUIRED",
        ),
        (
            headers(**{"X-Pongdang-SSO-Grants": "access-legacy"}),
            403,
            "SSO_GRANT_REQUIRED",
        ),
        (headers(**{"Origin": "https://hostile.test"}), 403, "ORIGIN_NOT_ALLOWED"),
        (
            headers(**{"Sec-Fetch-Site": "cross-site"}),
            403,
            "CROSS_SITE_REQUEST_REJECTED",
        ),
    ],
)
def test_authentication_precedes_any_notification_write(given, status, code):
    app = FastAPI()
    app.include_router(create_router(settings()))
    response = TestClient(app).post(
        "/api/data/notifications/subscriptions",
        headers=given,
        json={"spot_id": 1, "year": 2026, "minimum_temperature_c": 20},
    )
    assert response.status_code == status
    assert response.json()["detail"] == code


def test_auth_not_configured_fails_closed_and_limits_are_enforced():
    app = FastAPI()
    app.include_router(create_router(settings(sso_proxy_secret=SecretStr(""))))
    response = TestClient(app).get("/api/data/notifications/events", headers=headers())
    assert response.status_code == 503
    app = FastAPI()
    app.include_router(create_router(settings()))
    assert (
        TestClient(app)
        .get("/api/data/notifications/events?limit=101", headers=headers())
        .status_code
        == 422
    )


@pytest.mark.parametrize(
    "change",
    [
        {"minimum_temperature_c": float("nan")},
        {"minimum_temperature_c": None},
        {"timezone": "Made/Up"},
        {"destination": "one@example.test,two@example.test"},
        {"destination": "user@example.test\nHeader: attack"},
        {"score": 90},
    ],
)
def test_explicit_preference_and_input_validation(change):
    with pytest.raises(ValidationError):
        SubscriptionInput.model_validate(
            {"spot_id": 1, "year": 2026, "minimum_temperature_c": 20, **change}
        )


class Opener:
    def __init__(self, result):
        self.result = result
        self.requests = []

    def open(self, request, timeout):
        self.requests.append((request, timeout))
        if isinstance(self.result, Exception):
            raise self.result
        return BytesIO(self.result)


def test_resend_adapter_preserves_idempotency_key_and_real_contract():
    opener = Opener(b'{"id":"provider-message-id"}')
    provider = ResendProvider(settings(), opener=opener)
    message = {
        "from": "pongdang@example.test",
        "to": ["x@example.test"],
        "text": "data",
    }
    assert provider.send("event-1", message) == "provider-message-id"
    assert provider.send("event-1", message) == "provider-message-id"
    for request, timeout in opener.requests:
        assert request.full_url == ENDPOINT
        assert request.get_header("Idempotency-key") == "pongdang-temperature/event-1"
        assert request.get_header("Authorization") == "Bearer test-key"
        assert timeout == 10 and json.loads(request.data) == message


@pytest.mark.parametrize(
    ("result", "retry", "code"),
    [
        (
            HTTPError(ENDPOINT, 429, "sensitive body", {}, None),
            True,
            "PROVIDER_HTTP_429",
        ),
        (HTTPError(ENDPOINT, 403, "secret", {}, None), False, "PROVIDER_HTTP_403"),
        (TimeoutError("secret URL"), True, "PROVIDER_NETWORK_ERROR"),
        (b"{}", True, "PROVIDER_INVALID_RESPONSE"),
        (b"x" * 16385, True, "PROVIDER_RESPONSE_TOO_LARGE"),
    ],
)
def test_provider_errors_are_bounded_and_redacted(result, retry, code):
    with pytest.raises(DeliveryError) as caught:
        ResendProvider(settings(), opener=Opener(result)).send("event", {})
    assert caught.value.retryable is retry
    assert str(caught.value) == code


def test_disabled_provider_never_connects():
    opener = Opener(b'{"id":"should-not-send"}')
    conf = settings(notifications_delivery_enabled=False)
    assert configuration_state(conf) == "delivery_disabled"
    with pytest.raises(DeliveryError, match="PROVIDER_NOT_CONFIGURED"):
        ResendProvider(conf, opener=opener).send("event", {})
    assert opener.requests == []


class Rows:
    def __init__(self, rows):
        self.rows = iter(rows)

    def execute(self, *_):
        return self

    def fetchone(self):
        return next(self.rows)


@pytest.mark.parametrize(
    ("value", "unit", "expiry", "missing", "prior", "state", "reason"),
    [
        (21, "degC", 60, False, 0, "met", "annual_history_not_certified"),
        (21, "°C", 60, False, 0, "met", "annual_history_not_certified"),
        (21, "degC", 60, False, 1, "met", "earlier_qualifying_observation"),
        (0, "degC", 60, False, 0, "not_met", "below_user_preference"),
        (21, "degC", -1, False, 0, "unknown", "temperature_expired"),
        (None, "degC", 60, True, 0, "unknown", "temperature_missing"),
        (70, "degF", 60, False, 0, "unknown", "temperature_unit_not_comparable"),
    ],
)
def test_condition_has_explicit_missing_expiry_history_and_safety(
    monkeypatch, value, unit, expiry, missing, prior, state, reason
):
    now = datetime(2026, 9, 14, tzinfo=UTC)
    monkeypatch.setattr(service, "_station", lambda *_: {"station_id": 1})
    observation = {
        "observed_at": now - timedelta(minutes=1),
        "valid_until": now + timedelta(seconds=expiry),
        "numeric_value": value,
        "unit": unit,
        "is_missing": missing,
    }
    sub = {
        "spot_id": 1,
        "season_year": 2026,
        "timezone": "Asia/Seoul",
        "minimum_temperature_c": 20,
    }
    result = service.evaluate_condition(
        Rows([observation, {"count": 1}, {"count": prior}]), sub, now
    )
    assert result["condition_state"] == state
    assert reason in result["reason_codes"]
    assert result["safety_status"] == "unknown"
    assert result["first_in_year"] is (False if prior else None)


def test_local_year_boundary_and_unmapped_places(monkeypatch):
    sub = {
        "spot_id": 1,
        "season_year": 2027,
        "timezone": "Asia/Seoul",
        "minimum_temperature_c": 20,
    }
    monkeypatch.setattr(service, "_station", lambda *_: None)
    now = datetime(2026, 12, 31, 15, tzinfo=UTC)
    result = service.evaluate_condition(None, sub, now)
    assert result["reason_codes"] == ["station_mapping_missing_or_ambiguous"]
    before = service.evaluate_condition(None, sub, now - timedelta(seconds=1))
    assert before["reason_codes"] == ["outside_subscription_year"]


def test_conflicting_same_time_temperature_is_not_arbitrarily_selected(monkeypatch):
    now = datetime.now(UTC)
    monkeypatch.setattr(service, "_station", lambda *_: {"station_id": 1})
    observation = {
        "observed_at": now - timedelta(minutes=1),
        "valid_until": now + timedelta(minutes=1),
        "numeric_value": 24,
        "unit": "°C",
        "is_missing": False,
    }
    sub = {
        "spot_id": 1,
        "season_year": now.year,
        "timezone": "UTC",
        "minimum_temperature_c": 20,
    }
    result = service.evaluate_condition(Rows([observation, {"count": 2}]), sub, now)
    assert result["condition_state"] == "unknown"
    assert result["reason_codes"] == ["conflicting_temperature_evidence"]


def test_observation_must_be_inside_representative_mapping_period(monkeypatch):
    now = datetime.now(UTC)
    monkeypatch.setattr(
        service,
        "_station",
        lambda *_: {
            "station_id": 1,
            "valid_from": now,
            "valid_until": now + timedelta(hours=1),
        },
    )
    observation = {"observed_at": now - timedelta(minutes=1)}
    sub = {
        "spot_id": 1,
        "season_year": now.year,
        "timezone": "UTC",
        "minimum_temperature_c": 20,
    }
    result = service.evaluate_condition(Rows([observation]), sub, now)
    assert result["reason_codes"] == ["observation_outside_mapping_period"]
