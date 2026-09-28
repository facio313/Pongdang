"""Manual order is explicit and never changes the default optimizer contract.

All storage/provider boundaries are replaced; these tests open no DB or network.
"""

import asyncio
from datetime import UTC, datetime, timedelta

import pytest
from pydantic import ValidationError

from app.config import Settings
from app.travel import routing, tokens
from app.travel.models import TravelPreference, TravelRequest
from app.travel.routing import RouteRecommendationInput, recommend_route


class Catalog:
    async def places(self, ids):
        return {
            sid: {
                "spot_id": sid,
                "name": f"Place {sid}",
                "latitude": 37 + sid / 100,
                "longitude": 128,
            }
            for sid in ids
        }

    async def restrictions(self, ids, request):
        return {sid: [] for sid in ids}


class Directions:
    status = "configured"

    def __init__(self):
        self.calls = []

    async def leg(self, origin, destination, departure, *, geometry=False):
        self.calls.append((origin["latitude"], destination["latitude"], geometry))
        return {
            "duration_seconds": 600,
            "toll_krw": 0,
            "polyline": [],
            "source_record_id": "unit-route",
            "fetched_at": departure.isoformat(),
        }


class Environment:
    async def compare(self, sid, request, start, end):
        return {"preference_points": 0, "status": "evaluated"}


@pytest.fixture
def route_case(monkeypatch):
    monkeypatch.setattr(
        routing.storage, "profile", lambda *args: {"preference": TravelPreference()}
    )
    monkeypatch.setattr(routing.storage, "signals", lambda *args: [])
    # The preference ranking disagrees with the requested order.
    monkeypatch.setattr(
        routing,
        "rank_places",
        lambda places, *args: ([(p, []) for p in reversed(places)], []),
    )
    monkeypatch.setattr(routing.keywords, "activity_options", lambda *args: [])
    settings = Settings(
        _env_file=None,
        sso_proxy_secret="unit-ordered-route-secret-at-least-32-characters",
    )
    now = datetime.now(UTC)
    request = TravelRequest(
        dates=[(now + timedelta(days=1)).date()],
        departure_time="09:00",
        origin={"label": "First place", "spot_id": 12},
    )
    token = tokens.encode(settings, "unit-user", request, [7, 9, 12], now)

    def run(**kwargs):
        body = RouteRecommendationInput(selection_token=token, **kwargs)
        directions = Directions()
        result = asyncio.run(
            recommend_route(
                settings,
                "unit-user",
                body,
                now=now,
                catalog=Catalog(),
                directions=directions,
                environment=Environment(),
            )
        )
        return result, directions.calls

    return run


def test_manual_order_keeps_all_checked_places_and_skips_origin_self_route(route_case):
    result, calls = route_case(candidate_ranks=[3, 1, 2], preserve_order=True)
    assert result["route"]["spot_ids"] == [12, 7, 9]
    assert [stop["spot_id"] for stop in result["plan_input"]["stops"]] == [12, 7, 9]
    assert result["candidate_scope"]["orders_considered"] == 1
    assert result["optimality"] == "user_selected_order"
    assert result["alternatives"] == []
    first_leg = result["route"]["legs"][0]
    assert first_leg["duration_minutes"] == 0
    assert first_leg["evidence"]["status"] == "same_registered_place"
    assert "source_record_id" not in first_leg["evidence"]
    assert all(a != b for a, b, _ in calls)
    assert len(calls) == 6  # Three actual roads, summary + geometry each.
    assert result["saved"] is False


def test_manual_order_does_not_restore_unchecked_places(route_case):
    result, _ = route_case(
        candidate_ranks=[3, 1], preserve_order=True, include_geometry=False
    )
    assert result["route"]["spot_ids"] == [12, 7]
    assert result["candidate_scope"]["requested_stop_count"] == 2


def test_unavailable_checked_place_fails_without_silent_replacement(
    route_case, monkeypatch
):
    monkeypatch.setattr(
        routing,
        "rank_places",
        lambda places, *args: ([(p, []) for p in places if p["spot_id"] != 7], []),
    )
    result, calls = route_case(candidate_ranks=[3, 1, 2], preserve_order=True)
    assert result["route_calculated"] is False
    assert result["reason_codes"] == ["insufficient_verified_candidates_for_stop_count"]
    assert calls == []


def test_default_still_compares_candidate_permutations(route_case):
    result, _ = route_case(candidate_ranks=[3, 1], stop_count=2, include_geometry=False)
    assert result["candidate_scope"]["orders_considered"] == 2
    assert (
        result["candidate_scope"]["search"]
        == "exhaustive_permutations_of_selected_candidates"
    )
    assert result["optimality"] == "best_under_reference_matrix_and_sampled_preferences"


@pytest.mark.parametrize(
    "kwargs",
    [
        {"candidate_ranks": []},
        {"candidate_ranks": [1, 2], "stop_count": 1},
        {"candidate_ranks": [1, 1]},
    ],
)
def test_manual_order_rejects_ambiguous_selection(kwargs):
    with pytest.raises(ValidationError):
        RouteRecommendationInput(selection_token="unit", preserve_order=True, **kwargs)
