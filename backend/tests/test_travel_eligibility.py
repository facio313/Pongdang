"""Shared activity eligibility, grid preferences and forecast preview contracts."""

import asyncio
from contextlib import asynccontextmanager
from datetime import timedelta
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException
from test_condition_score import NOW, envelope, metric, source
from test_recommendation import scored, tide
from test_travel_published import Catalog, settings

from app.travel import published, storage
from app.travel.environment import compare_samples, preview_time
from app.travel.models import (
    EnvironmentPreference,
    RecommendationInput,
    TravelPreference,
    TravelRequest,
)
from app.travel.recommend import recommend
from app.water_index import recommendation_api
from app.water_index.activity_score import calculate_activity_score
from app.water_index.recommendation import activity_eligibility, decide


class Reader:
    @asynccontextmanager
    async def connection(self):
        yield self

    @asynccontextmanager
    async def transaction(self):
        yield


def beach_sample(sid, **values):
    return scored(
        "swim",
        **{
            "water_temperature": 24.0,
            "air_temperature": 27.0,
            "wave_height": 0.2,
            "wind_speed": 1.0,
            **values,
        },
    ).model_copy(update={"spot_id": sid, "place_kind": "beach"})


def run_candidates(monkeypatch, samples, *, tides=None):
    catalog = Catalog(len(samples))
    catalog.reader = Reader()

    async def read(_reader, queries, *, now):
        return [samples[q.spot_id] for q in queries]

    async def read_tide(_connection, sid, at, as_of):
        return (tides or {}).get(sid)

    monkeypatch.setattr(published, "read_condition_set", read)
    monkeypatch.setattr(recommendation_api, "read_tide", read_tide)
    monkeypatch.setattr(storage, "signals", lambda *_: [])
    return asyncio.run(
        recommend(
            settings(),
            "offline-owner",
            RecommendationInput(
                request=TravelRequest(activity="swim"),
                preference=TravelPreference(),
            ),
            now=NOW,
            catalog=catalog,
        )
    )


def test_cold_high_scoring_swim_is_excluded_by_both_recommendation_paths(monkeypatch):
    cold, warm = beach_sample(1, water_temperature=17.0), beach_sample(2)
    assert cold.condition_score.score == 83.8
    assert decide({"swim": cold}).choice is None
    result = run_candidates(monkeypatch, {1: cold, 2: warm})
    assert [item.spot_id for item in result.recommendations] == [2]
    assert result.excluded[0]["reason"] == "selected_activity_ineligible"
    assert "water_too_cold_for_immersion" in result.excluded[0]["rules_applied"]


def test_missing_essential_data_keeps_a_place_only_with_no_activity_comparison(
    monkeypatch,
):
    missing = scored("swim", air_temperature=27.0).model_copy(
        update={"spot_id": 1, "place_kind": "beach"}
    )
    result = run_candidates(monkeypatch, {1: missing})
    item = result.recommendations[0]
    assert item.conditions["ranking_score"] is None
    eligibility = item.conditions["activity_eligibility"]
    assert eligibility["dropped"] is True
    assert "essential_measurement_missing" in eligibility["rules_applied"]
    assert "장소 후보와 활동 추천은 구분" in item.reason
    assert decide({"swim": missing}).choice is None


def test_the_same_tide_rule_demotes_travel_and_today_without_changing_scores(
    monkeypatch,
):
    samples = {1: beach_sample(1), 2: beach_sample(2, wind_speed=3.0)}
    tide_context = tide("near_low", 20)
    result = run_candidates(monkeypatch, samples, tides={1: tide_context})
    assert [item.spot_id for item in result.recommendations] == [2, 1]
    lowered = result.recommendations[1]
    eligibility = lowered.conditions["activity_eligibility"]
    expected, _ = activity_eligibility(samples[1], tide=tide_context)
    assert eligibility == expected.model_dump(mode="json")
    assert eligibility["demoted"] and not eligibility["dropped"]
    assert eligibility["score"] == samples[1].condition_score.score
    assert lowered.conditions["ranking_score"] is None
    assert lowered.conditions["tide"]["phase"] == "near_low"


def test_a_tide_read_failure_keeps_the_gap_and_does_not_invent_restrictions(
    monkeypatch,
):
    catalog = Catalog(1)
    catalog.reader = Reader()
    sample = beach_sample(1)
    monkeypatch.setattr(
        published, "read_condition_set", AsyncMock(return_value=[sample, sample])
    )
    monkeypatch.setattr(
        recommendation_api, "read_tide", AsyncMock(side_effect=HTTPException(503))
    )
    reader = published.PublishedEnvironmentReader(catalog)
    result = asyncio.run(reader.compare(1, TravelRequest(activity="swim"), NOW))
    actual = result["samples"][0]
    assert actual["tide_lookup_status"] == "unavailable"
    assert "tide_lookup_unavailable" in actual["reason_codes"]
    assert not actual["activity_eligibility"]["demoted"]
    assert actual["safety_status"] == "unknown"


def test_published_future_preview_uses_the_latest_forecast_contract(monkeypatch):
    queries_seen = []
    future = NOW + timedelta(days=1)

    async def read(_reader, queries, *, now):
        queries_seen.extend(queries)
        for query in queries:
            assert query.product_times(now) == (future, NOW)
        return [
            envelope(q.activity, mode="forecast", metrics=(), at=q.at) for q in queries
        ]

    monkeypatch.setattr(published, "read_condition_set", read)
    reader = published.PublishedEnvironmentReader(Catalog())
    result = asyncio.run(reader.compare(1, TravelRequest(), future))
    assert all(
        query.mode == "forecast" and query.as_of is None for query in queries_seen
    )
    assert result["samples"][0]["mode"] == "forecast"


def grid_sample(**overrides):
    rows = tuple(
        metric(name, value, relation="containing_forecast_grid")
        for name, value in (
            ("air_temperature", 22.0),
            ("relative_humidity", 50.0),
            ("wind_speed", 2.0),
            ("precipitation", 0.0),
        )
    )
    data = envelope("walk", metrics=(), context_metrics=rows, **overrides)
    return data.model_copy(update={"condition_score": calculate_activity_score(data)})


def compare_grid(data):
    return compare_samples(
        [EnvironmentPreference(metric="air_temperature", minimum=18.0, maximum=26.0)],
        [data.model_dump(mode="json")],
        NOW,
        NOW,
    )


def test_kma_grid_weather_has_the_same_value_in_score_and_preference_evidence():
    data = grid_sample()
    assert data.condition_score.score == 100
    result = compare_grid(data)
    assert result["preference_points"] == 100
    record = result["criteria"][0]
    assert record["values"] == [22.0]
    assert record["evidence"][0]["relation"] == "containing_forecast_grid"
    assert record["evidence"][0]["mapping_id"] is None
    assert (
        record["evidence"][0]["spatial_scope"] == data.context_metrics[0].spatial_scope
    )
    assert (
        record["evidence"][0]["sources"]
        == data.context_metrics[0].model_dump(mode="json")["evidence"]
    )


def test_published_preview_includes_grid_context_in_preference_metrics(monkeypatch):
    data = grid_sample()
    monkeypatch.setattr(
        published, "read_condition_set", AsyncMock(return_value=[data, data])
    )
    request = TravelRequest(
        activity="walk",
        environment_preferences=[
            EnvironmentPreference(metric="air_temperature", minimum=18.0, maximum=26.0)
        ],
    )
    result = asyncio.run(
        published.PublishedEnvironmentReader(Catalog()).compare(1, request, NOW)
    )
    assert result["preference_points"] == 100
    assert result["samples"][0]["preference_metrics"][0]["relation"] == (
        "containing_forecast_grid"
    )


@pytest.mark.parametrize(
    "kind", ["retained", "stale", "conflict", "nearby", "non_kma", "missing"]
)
def test_grid_preferences_preserve_unavailable_or_unrepresentative_evidence(kind):
    data = grid_sample()
    row = data.context_metrics[0]
    changes = {
        "stale": {"status": "stale"},
        "conflict": {
            "status": "conflict",
            "reason_codes": ("conflicting_measurement_evidence",),
            "evidence": (source(value=22.0), source(value=26.0)),
        },
        "nearby": {"relation": "nearby_station_context"},
        "non_kma": {"evidence": (source(provider="unapproved_context"),)},
        "missing": {
            "status": "missing",
            "value": None,
            "evidence": (source(value=None, is_missing=True),),
        },
    }
    if kind == "retained":
        data = data.model_copy(update={"retained": True, "retained_at": NOW})
    else:
        data = data.model_copy(
            update={"context_metrics": (row.model_copy(update=changes[kind]),)}
        )
    assert compare_grid(data)["preference_points"] is None


def test_primary_missing_measurement_is_not_overridden_by_a_favourable_grid():
    data = grid_sample().model_copy(
        update={
            "metrics": (
                metric(
                    "air_temperature",
                    None,
                    relation="representative_station",
                    mapping_id="reviewed",
                    status="missing",
                    evidence=(source(value=None, is_missing=True),),
                ),
            )
        }
    )
    assert compare_grid(data)["preference_points"] is None


def test_forecast_grid_preserves_unknown_issue_time_when_score_can_use_it():
    row = metric(
        "air_temperature",
        None,
        relation="containing_forecast_grid",
        status="unknown",
        reason_codes=("provider_issue_time_unknown",),
        evidence=(source(mode="forecast", issued_at=None),),
    )
    data = envelope("walk", mode="forecast", metrics=(), context_metrics=(row,))
    score = calculate_activity_score(data)
    assert score.components[0].value == 22.0
    compared = compare_grid(data)
    assert compared["preference_points"] == 100
    assert "provider_issue_time_unknown" in compared["criteria"][0]["reason_codes"]
    assert compared["criteria"][0]["evidence"][0]["sources"][0]["issued_at"] is None


@pytest.mark.parametrize(
    "part,hour", [("morning", 9), ("afternoon", 13), ("evening", 18)]
)
def test_visit_preview_uses_the_requested_visit_time_without_changing_departure(
    part, hour
):
    request = TravelRequest(
        dates=[NOW.date()],
        departure_time="08:00",
        visit_intents=[{"place_type": "beach", "part_of_day": part}],
    )
    target, basis = preview_time(request, NOW)
    assert target.hour == hour and basis == "visit_time_window_preview"
    assert request.departure_time.hour == 8


@pytest.mark.parametrize(
    "changes",
    [
        {
            "activity_eligibility": {
                "dropped": True,
                "rules_applied": ["water_too_cold_for_immersion"],
            }
        },
        {"activity_eligibility": {"dropped": False, "demoted": True}},
        {"retained": True},
        {"condition_score": {"score": 99.0, "status": "partial"}},
    ],
)
def test_multiple_selected_activities_use_the_eligible_complete_score(changes):
    from app.travel.environment import EnvironmentReader

    swim = {
        "activity": "swim",
        "condition_score": {"score": 99.0, "status": "evaluated"},
        **changes,
    }
    walking = {
        "activity": "walk",
        "condition_score": {"score": 60.0, "status": "evaluated"},
    }
    assert EnvironmentReader.choose([swim, walking])["matched_activity"] == "walk"


def test_multiple_selected_activities_keep_an_unknown_alternative_to_a_restriction():
    from app.travel.environment import EnvironmentReader

    restricted = {
        "activity": "swim",
        "safety_status": "restricted",
        "condition_score": None,
    }
    unknown = {"activity": "walk", "status": "unknown", "condition_score": None}
    assert EnvironmentReader.choose([restricted, unknown])["matched_activity"] == "walk"


@pytest.mark.parametrize("future,chunk_sizes", [(False, [200, 40]), (True, [120])])
def test_multiple_selected_activities_keep_bounded_reads_in_one_snapshot(
    monkeypatch, future, chunk_sizes
):
    catalog = Catalog(30)
    catalog.reader = Reader()
    calls = []

    async def read(_reader, queries, *, now, connection=None):
        calls.append((queries, connection))
        assert len(queries) <= 200
        return [
            envelope(q.activity, spot_id=q.spot_id, mode=q.mode, at=q.at, metrics=())
            for q in queries
        ]

    monkeypatch.setattr(published, "read_condition_set", read)
    request = TravelRequest(activities=["swim", "surf", "walk", "relax"])
    reader = published.PublishedEnvironmentReader(catalog)
    target = NOW + timedelta(days=1) if future else NOW
    asyncio.run(reader.prefetch(list(range(1, 31)), request, target))
    assert [len(queries) for queries, _ in calls] == chunk_sizes
    if not future:
        assert all(connection is catalog.reader for _, connection in calls)
    else:
        assert all(
            q.mode == "forecast" and q.as_of is None for qs, _ in calls for q in qs
        )
    assert len(reader.cache) == 120
    assert {
        reader.cache[(1, activity, target.isoformat())]["activity"]
        for activity in request.activities
    } == set(request.activities)
    asyncio.run(reader.at(1, request, target))
    assert len(calls) == len(chunk_sizes)


def test_selected_swim_and_surf_share_one_tide_read_and_keep_both_eligibilities(
    monkeypatch,
):
    catalog = Catalog(1)
    catalog.reader = Reader()
    tide_calls = []
    water = {
        "swim": beach_sample(1),
        "surf": scored(
            "surf",
            water_temperature=24.0,
            air_temperature=27.0,
            wave_height=1.1,
            wave_period=9.0,
            wind_speed=3.0,
        ).model_copy(update={"spot_id": 1, "place_kind": "beach"}),
    }

    async def read(_reader, queries, *, now):
        return [water[q.activity] for q in queries]

    async def read_tide(_connection, sid, at, as_of):
        tide_calls.append(sid)
        return tide("near_high", 20)

    monkeypatch.setattr(published, "read_condition_set", read)
    monkeypatch.setattr(recommendation_api, "read_tide", read_tide)
    request = TravelRequest(activity="swim", activities=["swim", "surf"])
    reader = published.PublishedEnvironmentReader(catalog)
    asyncio.run(reader.prefetch([1], request, NOW))
    assert tide_calls == [1]
    for activity in request.activities:
        sample = reader.cache[(1, activity, NOW.isoformat())]
        assert sample["activity"] == activity
        assert sample["activity_eligibility"]["demoted"] is True
        assert sample["tide"]["phase"] == "near_high"


def test_a_visit_resets_inherited_multiple_activities():
    from app.travel.keywords import normalize
    from app.travel.models import VisitIntent
    from app.travel.recommend import request_for_visit

    request = TravelRequest(activity="surf", activities=["surf", "swim"])
    cafe = normalize(request_for_visit(request, VisitIntent(place_type="cafe")))
    assert cafe.activity == "relax"
    assert cafe.activities == ["relax"]
