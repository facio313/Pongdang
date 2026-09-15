"""Software verification of the provisional index, not human outcome validation."""

from datetime import timedelta

import pytest
from pydantic import ValidationError
from test_condition_score import NOW, envelope, metric, source

from app.water_index.activity_score import BEACH_AIR, WIND, calculate_activity_score
from app.water_index.condition_api import ConditionQuery, group_metric
from app.water_index.conditions import ACTIVITIES, Criterion, calculate_conditions


def component(result, name):
    return next(c for c in result.components if c.metric == name)


def test_published_air_range_and_wind_intervals_with_declared_adaptation():
    assert [BEACH_AIR.score(x) for x in (21, 23, 25, 30, 31.5, 33)] == [
        0,
        50,
        100,
        100,
        50,
        0,
    ]
    # Original Table 6 speeds are km/h. Input is m/s, not mislabeled km/h.
    for kmh, points in (
        (0, 80),
        (0.5, 80),
        (0.6, 100),
        (9.9, 100),
        (10, 90),
        (20, 80),
        (30, 60),
        (40, 30),
        (50, 0),
        (70, 0),
    ):
        assert WIND.score(kmh / 3.6) == points
    assert "논문" in BEACH_AIR.criterion("°C")
    assert "km/h" in WIND.criterion("m/s")


@pytest.mark.parametrize("activity", ACTIVITIES)
def test_six_activities_compute_without_manual_criteria_and_preserve_unknown(activity):
    evidence = envelope(activity, metrics=(metric(value=25.0),))
    result = calculate_activity_score(evidence)
    assert result.status == "partial" and result.score == 100
    assert result.available_components == 1
    assert result.coverage == 1 / result.total_components
    assert result.scientific_validation == "not_evaluated"
    assert evidence.environment_score is None
    assert evidence.safety_status == evidence.support_status == "unknown"
    assert all(s.url.startswith("https://doi.org/") for s in result.sources)


def test_components_and_total_use_available_evidence_without_missing_points():
    evidence = envelope(metrics=(metric(value=23.0), metric("wave_height", 2.0)))
    result = calculate_activity_score(evidence)
    assert result.score == 25 and result.coverage == 0.5
    assert component(result, "air_temperature").score == 50
    assert component(result, "wave_height").score == 0
    assert component(result, "water_temperature").score is None
    assert result == calculate_activity_score(evidence)


@pytest.mark.parametrize(
    "status", ["missing", "stale", "unknown", "unit_mismatch", "not_applicable"]
)
def test_no_available_source_never_returns_zero_or_previous_score(status):
    result = calculate_activity_score(
        envelope(metrics=(metric(value=None, status=status),))
    )
    assert result.status == "unavailable" and result.score is None
    assert result.coverage == 0


@pytest.mark.parametrize(
    "changes", [{"safety_status": "restricted"}, {"support_status": "unsupported"}]
)
def test_official_restriction_withholds_even_high_partial_score(changes):
    result = calculate_activity_score(
        envelope(metrics=(metric(value=25.0),), **changes)
    )
    assert result.status == "blocked" and result.score is None
    assert component(result, "air_temperature").score == 100


def forecast_metric(
    *, sources=None, status="unknown", reasons=("provider_issue_time_unknown",)
):
    return metric(
        value=None,
        status=status,
        reason_codes=reasons,
        evidence=sources or (source(value=25.0, mode="forecast", issued_at=None),),
    )


def test_khoa_unknown_issue_provisional_only_retains_forecast_source_and_warning():
    evidence = envelope(metrics=(forecast_metric(),), mode="forecast")
    result = calculate_activity_score(evidence)
    assert result.score == 100
    assert "provider_issue_time_unknown" in result.reason_codes
    assert component(result, "air_temperature").value == 25
    assert evidence.metrics[0].status == "unknown"
    assert evidence.metrics[0].evidence[0].issued_at is None
    strict = calculate_conditions(
        evidence,
        (
            Criterion(
                metric="air_temperature",
                station_id=1,
                minimum=20.0,
                maximum=30.0,
                weight=1.0,
            ),
        ),
    )
    assert strict.score is None and strict.status == "incomplete"


@pytest.mark.parametrize(
    "changes",
    [
        {"valid_until": NOW},
        {"fetched_at": NOW + timedelta(seconds=1)},
        {"issued_at": NOW + timedelta(seconds=1)},
        {"unit": "°F"},
        {"is_missing": True},
        {"metric_id": None},
        {"spatial_scope": None},
        {"mode": "observation"},
        {"observed_at": NOW + timedelta(seconds=1)},
    ],
)
def test_unknown_issue_path_never_bypasses_source_contract(changes):
    reading = source(**({"value": 25.0, "mode": "forecast"} | changes))
    result = calculate_activity_score(
        envelope(metrics=(forecast_metric(sources=(reading,)),), mode="forecast")
    )
    assert result.score is None


def test_identical_skill_variant_values_can_score_but_conflicting_values_cannot():
    first = source(value=25.0, mode="forecast")
    second = source(
        value=25.0, mode="forecast", metric_id=2, provider_record_id="skill-2"
    )
    same = forecast_metric(
        sources=(first, second),
        status="conflict",
        reasons=("conflicting_measurement_evidence",),
    )
    evidence = envelope(metrics=(same,), mode="forecast")
    result = calculate_activity_score(evidence)
    assert result.score == 100 and "identical_provider_variants" in result.reason_codes
    assert len(evidence.metrics[0].evidence) == 2
    changed = same.model_copy(
        update={"evidence": (first, second.model_copy(update={"numeric_value": 26.0}))}
    )
    assert (
        calculate_activity_score(envelope(metrics=(changed,), mode="forecast")).score
        is None
    )


def test_nearby_context_is_separate_from_strict_metrics_and_preserves_station_scope():
    contextual = metric(value=25.0, relation="nearby_station_context", distance_km=1.2)
    evidence = envelope(metrics=(), context_metrics=(contextual,))
    result = calculate_activity_score(evidence)
    assert result.score == 100 and evidence.metrics == ()
    c = component(result, "air_temperature")
    assert c.relation == "nearby_station_context" and c.distance_km == 1.2
    assert "nearby_station_context" in result.reason_codes


def test_onsen_never_uses_sea_temperature_and_rafting_needs_local_flow_bounds():
    sea = envelope("onsen", metrics=(metric("water_temperature", 38.0),))
    assert calculate_activity_score(sea).score is None
    river = calculate_activity_score(
        envelope("rafting", metrics=(metric("river_flow", 200.0),))
    )
    assert (
        river.score is None and component(river, "river_flow").status == "unconfigured"
    )


def test_invalid_units_and_forged_available_value_are_revalidated():
    forged = envelope().model_copy(
        update={"metrics": (metric().model_copy(update={"value": 100.0}),)}
    )
    with pytest.raises(ValidationError):
        calculate_activity_score(forged)


@pytest.mark.parametrize(
    "activity,name,provider,kind",
    [
        ("rafting", "water_temperature", "khoa_buoy_recent", "marine_buoy"),
        ("swim", "air_temperature", "khoa_surfing", "surfing"),
        ("onsen", "bath_water_temperature", "khoa_buoy_recent", "marine_buoy"),
    ],
)
def test_duplicate_provider_variants_cannot_bypass_station_activity_scope(
    activity, name, provider, kind
):
    first = source(name, 27.0, provider=provider).model_dump() | {
        "revision_ambiguous": False
    }
    second = first | {"metric_id": 2, "provider_record_id": "second-variant"}
    link = {
        "station_id": 1,
        "name": "Fixture",
        "kind": kind,
        "relation": "station_observation_point",
        "mapping": None,
    }
    query = ConditionQuery(spot_id=1, activity=activity, mode="observation")
    selected = group_metric([first, second], link, query, NOW, NOW)
    assert selected.status == "not_applicable"
    assert (
        calculate_activity_score(envelope(activity, metrics=(selected,))).score is None
    )
