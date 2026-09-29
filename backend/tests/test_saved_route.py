"""Saved routes retain authenticated provider evidence without new provider calls."""

import asyncio
import random
from datetime import UTC, datetime, timedelta

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.config import Settings
from app.travel import api, route_snapshot
from app.travel.models import Evidence, PlanInput, TripPlan
from app.travel.plans import draft_plan

NOW = datetime(2026, 9, 29, 0, tzinfo=UTC)


class Catalog:
    async def places(self, ids):
        return {
            sid: {
                "spot_id": sid,
                "name": "Registered test beach",
                "evidence": Evidence(
                    evidence_id="test:catalog",
                    provider="TEST",
                    fetched_at=NOW,
                    status="available",
                ),
            }
            for sid in ids
        }

    async def restrictions(self, ids, request):
        return {sid: [] for sid in ids}

    async def conditions(self, sid, request):
        return {"status": "unknown", "facts": []}


@pytest.fixture
def saved_route():
    settings = Settings(
        _env_file=None,
        sso_proxy_secret="saved-route-unit-secret-at-least-32-characters",
        sso_allowed_origins="http://testserver",
    )
    body = PlanInput.model_validate(
        {
            "request": {
                "dates": ["2026-09-29"],
                "day_trip": True,
                "departure_time": "09:00",
                "transport": "driving",
                "origin": {
                    "label": "Registered origin",
                    "latitude": 37.7,
                    "longitude": 128.8,
                },
            },
            "stops": [
                {
                    "item_id": "route-0-7",
                    "spot_id": 7,
                    "day": "2026-09-29",
                    "stay_minutes": 60,
                }
            ],
        }
    )
    evidence = {
        "provider": "kakao_mobility",
        "source_record_id": "unit-route",
        "fetched_at": NOW.isoformat(),
        "valid_until": (NOW + timedelta(minutes=5)).isoformat(),
    }
    points = [
        {"longitude": 128.8, "latitude": 37.7},
        {"longitude": 128.9, "latitude": 37.8},
    ]
    result = {
        "contract_version": "travel-route.v1",
        "status": "partial",
        "route_calculated": True,
        "reason_codes": ["reference_time_matrix_estimate"],
        "queried_at": NOW.isoformat(),
        "optimality": "user_selected_order",
        "route": {
            "origin": {
                "label": "Registered origin",
                "latitude": 37.7,
                "longitude": 128.8,
            },
            "items": [
                {
                    "spot_id": 7,
                    "name": "Registered test beach",
                    "arrival_at": "2026-09-29T09:10:00+09:00",
                    "departure_at": "2026-09-29T10:10:00+09:00",
                    "latitude": 37.8,
                    "longitude": 128.9,
                }
            ],
            "legs": [
                {
                    "from_spot_id": start,
                    "to_spot_id": end,
                    "duration_minutes": 10,
                    "evidence": evidence,
                    "geometry": {"polyline": points},
                }
                for start, end in [(None, 7), (7, None)]
            ],
            "travel_minutes": 20,
            "return_at": "2026-09-29T10:20:00+09:00",
        },
    }
    receipt = route_snapshot.encode(settings, "owner", body, result, NOW)
    return settings, body.model_copy(update={"route_token": receipt}), result


def test_saved_route_survives_plan_json_roundtrip_with_times_and_evidence(saved_route):
    settings, body, result = saved_route
    plan = asyncio.run(draft_plan(settings, "owner", body, now=NOW, catalog=Catalog()))
    restored = TripPlan.model_validate_json(plan.model_dump_json())
    assert restored.route_snapshot == result
    assert restored.route_status == "saved_estimate"
    assert (
        restored.days[0]["items"][0]["arrival_at"]
        == result["route"]["items"][0]["arrival_at"]
    )
    assert restored.days[0]["return_at"] == result["route"]["return_at"]
    assert restored.legs[0]["geometry"] == result["route"]["legs"][0]["geometry"]
    assert restored.legs[0]["evidence"] == result["route"]["legs"][0]["evidence"]
    assert "route_provider_unconfigured" not in restored.unresolved
    assert "travel_time_unknown" not in restored.unresolved
    assert restored.cost["total_krw"] is None
    assert "route_token" not in restored.model_dump()


@pytest.mark.parametrize(
    "change", ["owner", "signature", "time", "stay", "place", "origin"]
)
def test_receipt_rejects_another_owner_or_changed_itinerary(saved_route, change):
    settings, body, _ = saved_route
    owner = "another-owner" if change == "owner" else "owner"
    if change == "signature":
        body = body.model_copy(
            update={
                "route_token": body.route_token[:-1]
                + ("0" if body.route_token[-1] != "0" else "1")
            }
        )
    elif change in {"time", "origin"}:
        data = body.request.model_dump(mode="json")
        if change == "time":
            data["departure_time"] = "10:00:00"
        else:
            data["origin"]["latitude"] = 36
        body = PlanInput.model_validate({**body.model_dump(), "request": data})
    elif change in {"stay", "place"}:
        stop = body.stops[0].model_copy(
            update={"stay_minutes": 30} if change == "stay" else {"spot_id": 9}
        )
        body = body.model_copy(update={"stops": [stop]})
    with pytest.raises(HTTPException) as exc:
        route_snapshot.decode(settings, owner, body, NOW)
    assert exc.value.status_code == 422


def test_expired_receipts_cannot_be_newly_saved(saved_route):
    settings, body, _ = saved_route
    with pytest.raises(HTTPException) as exc:
        route_snapshot.decode(settings, "owner", body, NOW + timedelta(minutes=30))
    assert exc.value.status_code == 410


def test_decompression_is_bounded_even_for_a_valid_signature(saved_route, monkeypatch):
    settings, body, _ = saved_route
    monkeypatch.setattr(route_snapshot, "MAX_SNAPSHOT_BYTES", 64)
    with pytest.raises(HTTPException) as exc:
        route_snapshot.decode(settings, "owner", body, NOW)
    assert exc.value.status_code == 422


def test_unsigned_client_route_data_is_rejected(saved_route):
    _, body, result = saved_route
    with pytest.raises(ValidationError):
        PlanInput.model_validate({**body.model_dump(), "route_snapshot": result})


def test_old_plan_without_route_remains_a_draft(saved_route):
    settings, body, _ = saved_route
    plan = asyncio.run(
        draft_plan(
            settings,
            "owner",
            body.model_copy(update={"route_token": None}),
            now=NOW,
            catalog=Catalog(),
        )
    )
    payload = plan.model_dump(mode="json")
    payload.pop("route_snapshot")
    restored = TripPlan.model_validate(payload)
    assert restored.route_snapshot is None
    assert restored.days[0]["items"][0]["arrival_at"] is None
    assert "route_provider_unconfigured" in restored.unresolved


def test_api_preserves_saved_roads_and_clears_them_after_itinerary_changes(
    saved_route, monkeypatch
):
    settings, body, result = saved_route
    rng = random.Random(7)
    result["route"]["legs"][0]["geometry"]["polyline"] = [
        {"latitude": 37.7 + rng.random() / 10, "longitude": 128.8 + rng.random() / 10}
        for _ in range(8000)
    ]
    body = body.model_copy(
        update={
            "route_token": route_snapshot.encode(settings, "owner", body, result, NOW)
        }
    )
    assert 64000 < len(body.model_dump_json()) < 64000 + route_snapshot.MAX_TOKEN_LENGTH
    stored = {}
    identifier = "a" * 32

    async def local_draft(settings, owner, body):
        return await draft_plan(settings, owner, body, now=NOW, catalog=Catalog())

    def save(_settings, owner, plan, *, identifier=identifier, expected=None):
        assert owner == "owner"
        stored[identifier] = plan.model_copy(
            update={"plan_id": identifier, "revision": (expected or 0) + 1}
        )
        return stored[identifier]

    monkeypatch.setattr(api, "draft_plan", local_draft)
    monkeypatch.setattr(api.storage, "save_plan", save)
    monkeypatch.setattr(api.storage, "get_plan", lambda _s, _o, key: stored[key])
    app = FastAPI()
    app.include_router(api.create_router(settings))
    headers = {
        "x-pongdang-sso-token": settings.sso_proxy_secret.get_secret_value(),
        "x-pongdang-sso-subject": "owner",
        "x-pongdang-sso-grants": "access-pongdang",
        "origin": "http://testserver",
    }
    with TestClient(app, headers=headers) as client:
        response = client.post(
            "/api/data/travel/plans", json=body.model_dump(mode="json")
        )
        assert response.status_code == 201
        url = f"/api/data/travel/plans/{identifier}"
        assert client.get(url).json()["route_snapshot"] == result
        update = body.model_dump(mode="json", exclude={"route_token"})
        response = client.put(url, json={**update, "expected_revision": 1})
        assert response.status_code == 200
        assert response.json()["route_snapshot"] == result
        update["request"]["departure_time"] = "10:00:00"
        response = client.put(url, json={**update, "expected_revision": 2})
        assert response.status_code == 200
        assert response.json()["route_snapshot"] is None
        assert response.json()["days"][0]["items"][0]["arrival_at"] is None
        assert (
            client.post(
                "/api/data/travel/plans",
                content=b"x" * (64001 + route_snapshot.MAX_TOKEN_LENGTH),
            ).status_code
            == 413
        )
        assert (
            client.post(
                "/api/data/travel/recommendations", content=b"x" * 64001
            ).status_code
            == 413
        )
