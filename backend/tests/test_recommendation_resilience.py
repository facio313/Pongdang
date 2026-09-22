"""Optional recommendation lookups cannot hide already loaded condition scores."""

import asyncio
from contextlib import asynccontextmanager
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from psycopg import OperationalError
from psycopg.errors import QueryCanceled
from test_recommendation import beach, tide, with_score

from app.water_index import recommendation_api as api
from app.water_index.models import RECOMMENDED_ACTIVITIES
from app.water_index.recommendation import decide

BASE = "/api/data/water-index/recommendation"


class FixtureReader:
    def __init__(self):
        self.failure = None
        self.rollbacks = []
        self.execute = AsyncMock(return_value=self)

    @asynccontextmanager
    async def connection(self):
        if self.failure is not None:
            raise self.failure
        yield self

    @asynccontextmanager
    async def transaction(self):
        try:
            yield
        except BaseException as exc:
            self.rollbacks.append(type(exc))
            raise

    async def fetchone(self):
        return {
            "id": 1,
            "name": "Software fixture",
            "place_kind": "beach",
            "lat": 37.8,
            "lng": 128.9,
        }


def alternative_row(kind, spot_id):
    return {
        "kind": kind,
        "id": spot_id,
        "name": "Software fixture alternative",
        "distance_km": 1.0,
        "address": None,
        "region": None,
    }


@pytest.fixture
def lookup(monkeypatch):
    reader = FixtureReader()
    envelopes = beach()
    state = SimpleNamespace(
        reader=reader,
        envelopes=envelopes,
        activities=AsyncMock(return_value=envelopes),
        tide=AsyncMock(return_value=tide("near_low", 20)),
        valleys=AsyncMock(return_value=[alternative_row("valley", 2)]),
        catalog=AsyncMock(return_value=[alternative_row("meal", 3)]),
        nested=AsyncMock(return_value=decide(envelopes).choice),
    )
    monkeypatch.setattr(api, "DataReader", lambda _settings: reader)
    monkeypatch.setattr(api, "read_activities", state.activities)
    monkeypatch.setattr(api, "read_tide", state.tide)
    monkeypatch.setattr(api, "read_valleys", state.valleys)
    monkeypatch.setattr(api, "read_catalog_places", state.catalog)
    monkeypatch.setattr(api, "read_recommendation_choice", state.nested)
    app = FastAPI()
    app.include_router(api.create_recommendation_router(None))
    with TestClient(app) as client:
        state.client = client
        yield state


def assert_preserved(response, lookup, unavailable):
    assert response.status_code == 200, response.text
    view = response.json()
    assert view["conditions"] == [
        lookup.envelopes[activity].model_dump(mode="json")
        for activity in RECOMMENDED_ACTIVITIES
    ]
    assert {row["activity"]: row["score"] for row in view["ranked"]} == {
        activity: evidence.condition_score.score
        for activity, evidence in lookup.envelopes.items()
    }
    assert unavailable in view["reason_codes"]
    assert unavailable in [reason["code"] for reason in view["reasons"]]
    return view


@pytest.mark.parametrize(
    ("stage", "failure", "unavailable"),
    [
        ("connection", HTTPException(503), "recommendation_context_unavailable"),
        ("place", QueryCanceled(), "place_lookup_unavailable"),
        ("tide", OperationalError(), "tide_lookup_unavailable"),
        ("valleys", QueryCanceled(), "alternatives_lookup_unavailable"),
        ("catalog", OperationalError(), "alternatives_lookup_unavailable"),
        ("nested", HTTPException(503), "alternative_conditions_unavailable"),
        ("nested", HTTPException(404), "alternative_conditions_unavailable"),
    ],
)
def test_optional_failure_keeps_conditions_scores_and_other_context(
    lookup, stage, failure, unavailable
):
    if stage == "connection":
        lookup.reader.failure = failure
    elif stage == "place":
        lookup.reader.execute.side_effect = failure
    else:
        getattr(lookup, stage).side_effect = failure

    view = assert_preserved(
        lookup.client.get(BASE, params={"spot_id": 1}), lookup, unavailable
    )
    assert view["choice"]["score"] is not None
    if stage in {"connection", "place"}:
        assert view["place_name"] == "Software fixture"
        assert view["place_kind"] is None
        assert view["tide"] is None
    if stage in {"place", "tide", "valleys", "catalog"}:
        assert type(failure) in lookup.reader.rollbacks
    if stage == "valleys":
        assert [row["kind"] for row in view["alternatives"]] == ["meal"]
    if stage in {"catalog", "nested"}:
        valley = next(row for row in view["alternatives"] if row["kind"] == "valley")
        assert (valley["score"] is None) == (stage == "nested")
        assert (valley["best_activity"] is None) == (stage == "nested")


def test_total_optional_budget_preserves_completed_lookups(lookup, monkeypatch):
    async def delayed(*_args):
        await asyncio.sleep(60)

    lookup.catalog.side_effect = delayed
    monkeypatch.setattr(api, "RECOMMENDATION_CONTEXT_TIMEOUT", 0.05)
    view = assert_preserved(
        lookup.client.get(BASE, params={"spot_id": 1}),
        lookup,
        "recommendation_context_unavailable",
    )
    assert view["tide"]["phase"] == "near_low"
    assert [row["kind"] for row in view["alternatives"]] == ["valley"]
    assert view["alternatives"][0]["score"] is None
    lookup.nested.assert_not_awaited()


def test_optional_failure_does_not_override_official_restrictions(lookup):
    for activity, evidence in lookup.envelopes.items():
        lookup.envelopes[activity] = with_score(
            evidence.model_copy(update={"safety_status": "restricted"})
        )
    lookup.reader.failure = HTTPException(503)
    view = assert_preserved(
        lookup.client.get(BASE, params={"spot_id": 1}),
        lookup,
        "recommendation_context_unavailable",
    )
    assert view["choice"] is None
    assert all(row["dropped"] for row in view["ranked"])


@pytest.mark.parametrize("stage", ["connection", "nested"])
def test_authorization_errors_are_not_optional_missing_context(lookup, stage):
    if stage == "connection":
        lookup.reader.failure = HTTPException(403)
    else:
        lookup.nested.side_effect = HTTPException(403)
    assert lookup.client.get(BASE, params={"spot_id": 1}).status_code == 403


def test_failure_of_the_core_conditions_still_returns_unavailable(lookup):
    lookup.activities.side_effect = HTTPException(503)
    assert lookup.client.get(BASE, params={"spot_id": 1}).status_code == 503
    lookup.reader.execute.assert_not_awaited()
