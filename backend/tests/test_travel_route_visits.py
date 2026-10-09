"""Route revalidation keeps the same per-visit contracts as recommendations."""

import asyncio

import pytest
from test_travel_route_order import Directions
from test_travel_visit_intents import NOW, VISITS, place, settings

from app.travel import storage, tokens
from app.travel.models import TravelPreference, TravelRequest
from app.travel.routing import RouteRecommendationInput, recommend_route


class VisitRouteCatalog:
    def __init__(self, rows, blocked=None):
        self.rows = {row["spot_id"]: row for row in rows}
        self.blocked = blocked
        self.restriction_reads = []

    async def places(self, ids):
        return {sid: self.rows[sid] for sid in ids}

    async def restrictions(self, ids, request):
        self.restriction_reads.append((ids, request.activity))
        return {
            sid: [{"blocked": True}] if (sid, request.activity) == self.blocked else []
            for sid in ids
        }


class VisitEnvironment:
    def __init__(self):
        self.activities = []

    async def compare(self, sid, request, start, end, exclude=()):
        self.activities.append((sid, request.activity))
        return {"preference_points": None, "status": "not_selected"}


@pytest.fixture
def visit_route(monkeypatch):
    monkeypatch.setattr(
        storage, "profile", lambda *_: {"preference": TravelPreference(tags=["해변"])}
    )
    monkeypatch.setattr(storage, "signals", lambda *_: [])

    def run(rows, *, visits=VISITS, blocked=None, **changes):
        request = TravelRequest(
            dates=[NOW.date()],
            departure_time="09:10",
            origin={"label": "첫 장소", "spot_id": rows[0]["spot_id"]},
            keyword_selection=[
                {"category": "place_type", "values": ["beach"]},
                {"category": "activity", "values": ["swim"]},
            ],
            visit_intents=visits,
            **changes,
        )
        config = settings()
        token = tokens.encode(
            config, "owner", request, [p["spot_id"] for p in rows], NOW
        )
        catalog = VisitRouteCatalog(rows, blocked)
        directions, environment = Directions(), VisitEnvironment()
        result = asyncio.run(
            recommend_route(
                config,
                "owner",
                RouteRecommendationInput(
                    selection_token=token,
                    candidate_ranks=list(range(1, len(rows) + 1)),
                    stop_count=len(rows),
                    preserve_order=True,
                    include_geometry=False,
                ),
                now=NOW,
                catalog=catalog,
                directions=directions,
                environment=environment,
            )
        )
        return result, catalog, directions, environment

    return run


def test_beaches_and_valleys_keep_all_four_selected_stops(visit_route):
    rows = [
        place(1, "beach"),
        place(3, "valley"),
        place(2, "beach"),
        place(4, "valley"),
    ]
    result, catalog, directions, environment = visit_route(rows)
    assert result["route_calculated"] is True
    assert result["route"]["spot_ids"] == [1, 3, 2, 4]
    assert result["excluded"] == []
    assert environment.activities == [
        (1, "relax"),
        (3, "relax"),
        (2, "relax"),
        (4, "relax"),
    ]
    assert all(activity == "relax" for _, activity in catalog.restriction_reads)
    assert len(directions.calls) == 4


def test_each_stop_uses_its_activity_for_restrictions_and_environment(visit_route):
    rows = [
        place(1, "beach"),
        place(2, "valley"),
        place(3, "restaurant", category="음식점 > 카페", provider="KAKAO_LOCAL"),
        place(4, "onsen"),
    ]
    rows[3]["catalog_tags"] = ["온천"]
    visits = [
        {"place_type": "beach", "activity": "swim"},
        {"place_type": "valley"},
        {"place_type": "cafe"},
        {"place_type": "hot_spring", "activity": "onsen"},
    ]
    result, catalog, _, environment = visit_route(rows, visits=visits)
    assert result["route_calculated"] is True
    assert environment.activities == [
        (1, "swim"),
        (2, "relax"),
        (3, "relax"),
        (4, "onsen"),
    ]
    assert catalog.restriction_reads == [
        ([1], "swim"),
        ([2], "relax"),
        ([3], "relax"),
        ([4], "onsen"),
    ]
    assert [item["activities"][0]["activity"] for item in result["route"]["items"]] == [
        "swim",
        "relax",
        "relax",
        "onsen",
    ]


@pytest.mark.parametrize(
    ("changes", "blocked", "reason"),
    [
        ({}, (2, "relax"), "official_restriction"),
        ({"avoid": ["계곡"]}, None, "avoid_preference"),
        (
            {"required": [{"attribute": "kind", "value": "beach"}]},
            None,
            "required_condition_unconfirmed",
        ),
        ({"exclude": [2]}, None, None),
    ],
)
def test_multi_visit_does_not_bypass_hard_constraints(
    visit_route, changes, blocked, reason
):
    result, _, directions, _ = visit_route(
        [place(1, "beach"), place(2, "valley")], blocked=blocked, **changes
    )
    assert result["route_calculated"] is False
    assert result["reason_codes"] == ["insufficient_verified_candidates_for_stop_count"]
    assert result["available_count"] == 1
    if reason:
        assert {"spot_id": 2, "reason": reason}.items() <= result["excluded"][0].items()
    assert directions.calls == []


def test_place_outside_every_requested_visit_is_still_rejected(visit_route):
    result, _, directions, _ = visit_route([place(1, "beach"), place(2, "river")])
    assert result["route_calculated"] is False
    assert result["excluded"] == [
        {"spot_id": 2, "reason": "selected_place_type_unconfirmed"}
    ]
    assert directions.calls == []
