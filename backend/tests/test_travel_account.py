"""Account display uses the authenticated principal; no DB or SSO calls."""

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from test_ai_chat import HEADERS
from test_ai_chat import settings as _settings

from app.travel import api, storage

settings = _settings


def test_preferences_identify_only_the_authenticated_account(settings, monkeypatch):
    owners = []

    def profile(_settings, owner):
        owners.append(owner)
        return {"preference": {"tags": []}, "revision": 0, "account_id": "untrusted"}

    monkeypatch.setattr(storage, "profile", profile)
    app = FastAPI()
    app.include_router(api.create_router(settings))
    with TestClient(app) as client:
        response = client.get(
            "/api/data/travel/preferences?account_id=another-account",
            headers={**HEADERS, "x-pongdang-sso-subject": "signed-in-account"},
        )
    assert response.status_code == 200
    assert response.json()["account_id"] == "signed-in-account"
    assert owners == ["signed-in-account"]
    assert response.headers["cache-control"] == "private, no-store"
    assert HEADERS["x-pongdang-sso-token"] not in response.text


@pytest.mark.parametrize(
    "headers,status",
    [({}, 401), ({**HEADERS, "x-pongdang-sso-grants": "another-app"}, 403)],
)
def test_account_id_is_not_returned_without_access(
    settings, monkeypatch, headers, status
):
    def no_read(*_):
        pytest.fail("Unauthenticated account display must not read profiles")

    monkeypatch.setattr(storage, "profile", no_read)
    app = FastAPI()
    app.include_router(api.create_router(settings))
    with TestClient(app) as client:
        response = client.get("/api/data/travel/preferences", headers=headers)
    assert response.status_code == status
    assert "account_id" not in response.json()
