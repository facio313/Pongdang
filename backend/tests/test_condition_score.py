"""Software contracts for explicit condition matching, not field validation."""

import json
from datetime import UTC, datetime, timedelta

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.config import Settings
from app.main import create_app
from app.water_index import condition_api as api
from app.water_index.conditions import (
    ACTIVITIES,
    METRICS,
    ConditionMetric,
    ConditionsEnvelope,
    Criterion,
    SourceValue,
    calculate_conditions,
)

NOW = datetime(2026, 1, 2, tzinfo=UTC)
BASE = "/api/data/water-index"


def source(name="air_temperature", value=22.0, **changes):
    data = dict(
        metric_id=1,
        snapshot_id=1,
        provider="kma_aws",
        provider_record_id="fixture-revision",
        source_record_id="fixture-reading",
        name=name,
        numeric_value=value,
        text_value=None,
        is_missing=False,
        unit=METRICS[name].unit,
        mode="observation",
        observed_at=NOW - timedelta(minutes=5),
        issued_at=None,
        fetched_at=NOW - timedelta(minutes=1),
        valid_from=NOW - timedelta(minutes=5),
        valid_until=NOW + timedelta(hours=1),
        spatial_scope="isolated software fixture station point",
        source_state="recorded",
        metric_state="recorded",
    )
    return SourceValue(**(data | changes))


def metric(name="air_temperature", value=22.0, **changes):
    data = dict(
        name=name,
        label=METRICS[name].label,
        unit=METRICS[name].unit,
        value=value,
        station_id=1,
        station_name="Software fixture",
        relation="station_observation_point",
        mapping_id=None,
        spatial_scope="isolated fixture",
        status="available",
        reason_codes=(),
        evidence=(source(name, value),),
    )
    return ConditionMetric(**(data | changes))


def envelope(activity="swim", metrics=None, **changes):
    data = dict(
        spot_id=1,
        place_name="Software fixture",
        activity=activity,
        mode="observation",
        at=NOW,
        as_of=NOW,
        support_status="unknown",
        safety_status="unknown",
        restriction_refs=(),
        metrics=(metric(),) if metrics is None else metrics,
        missing_metrics=(),
        required_evidence=ACTIVITIES[activity].required_evidence,
        reason_codes=("activity_support_unknown", "safety_requirements_not_validated"),
    )
    return ConditionsEnvelope(**(data | changes))


def criterion(name="air_temperature", minimum=20.0, maximum=25.0, weight=1.0):
    return Criterion(
        metric=name, station_id=1, minimum=minimum, maximum=maximum, weight=weight
    )


@pytest.mark.parametrize("activity", ACTIVITIES)
def test_all_activities_have_explicit_arithmetic_not_environment_scores(activity):
    result = calculate_conditions(envelope(activity), (criterion(),))
    assert result.score == 100 and result.status == "evaluated"
    assert result.evidence.environment_score is None
    assert result.evidence.support_status == result.evidence.safety_status == "unknown"
    assert result.model.scientific_validation == "not_evaluated"
    assert "not_a_safety_or_suitability_score" in result.reason_codes


@pytest.mark.parametrize("value,score", [(20, 100), (25, 100), (19.99, 0), (25.01, 0)])
def test_inclusive_bounds_and_outside(value, score):
    data = envelope(metrics=(metric(value=float(value)),))
    assert calculate_conditions(data, (criterion(),)).score == score


def test_zero_equal_bounds_single_sided_decimal_rounding_and_tiny_weights():
    zero = envelope(metrics=(metric(value=0.0),))
    for low, high in [(0.0, 0.0), (None, 0.0), (0.0, None)]:
        assert (
            calculate_conditions(
                zero, (criterion(minimum=low, maximum=high, weight=5e-324),)
            ).score
            == 100
        )
    data = envelope(metrics=(metric(), metric("wind_speed", 9.0)))
    result = calculate_conditions(
        data,
        (
            criterion(weight=2.01),
            criterion("wind_speed", 0.0, 3.0, 1.99),
        ),
    )
    assert result.score == 50.3 and result.total_weight == 4
    assert result.matched_weight == 2.01
    assert [r.weighted_points for r in result.criteria] == [2.01, 0.0]


@pytest.mark.parametrize(
    "status",
    ["missing", "stale", "unknown", "conflict", "unit_mismatch", "not_applicable"],
)
def test_one_unavailable_selected_criterion_withholds_entire_total(status):
    bad = metric("wind_speed", None, status=status, reason_codes=("reason",))
    result = calculate_conditions(
        envelope(metrics=(metric(), bad)),
        (
            criterion(weight=3.0),
            criterion("wind_speed", 0.0, 3.0, 1.0),
        ),
    )
    assert result.status == "incomplete"
    assert result.score is result.matched_weight is None
    assert result.total_weight == 4 and result.criteria[0].matched
    assert result.criteria[1].matched is None
    assert result.criteria[1].reason_codes == ("reason",)


@pytest.mark.parametrize(
    "changes",
    [
        {"safety_status": "restricted", "restriction_refs": ("closure",)},
        {"support_status": "unsupported"},
    ],
)
def test_official_restrictions_block_even_perfect_conditions(changes):
    result = calculate_conditions(envelope(**changes), (criterion(),))
    assert result.score is None and result.status == "blocked"
    assert result.criteria[0].matched is True


def test_missing_station_ambiguous_metric_unselected_missing_and_duplicates():
    wrong = criterion().model_copy(update={"station_id": 2})
    assert calculate_conditions(envelope(), (wrong,)).status == "incomplete"
    assert (
        calculate_conditions(
            envelope(metrics=(metric(), metric())), (criterion(),)
        ).score
        is None
    )
    data = envelope(metrics=(metric(), metric("wind_speed", None, status="missing")))
    assert calculate_conditions(data, (criterion(),)).score == 100
    with pytest.raises(ValueError):
        calculate_conditions(envelope(), (criterion(), criterion()))
    with pytest.raises(ValueError):
        calculate_conditions(envelope("onsen"), (criterion("water_temperature"),))


def test_reproducibility_and_criteria_or_revision_identity():
    data, criteria = envelope(), (criterion(),)
    first = calculate_conditions(data, criteria)
    assert first == calculate_conditions(data, criteria)
    assert (
        first.calculation_id
        != calculate_conditions(data, (criterion(weight=2.0),)).calculation_id
    )
    changed = envelope(
        metrics=(metric(evidence=(source(provider_record_id="revision-2"),)),)
    )
    assert (
        first.calculation_id != calculate_conditions(changed, criteria).calculation_id
    )


@pytest.mark.parametrize(
    "changes",
    [
        {"unit": "°F"},
        {"evidence": ()},
        {"evidence": (source(is_missing=True),)},
        {"evidence": (source(unit="°F"),)},
        {"evidence": (source(metric_id=None),)},
        {"evidence": (source(value=23.0),)},
    ],
)
def test_available_requires_consistent_unit_and_one_actual_source(changes):
    with pytest.raises(ValidationError):
        metric(**changes)


@pytest.mark.parametrize(
    "changes",
    [
        {"fetched_at": NOW + timedelta(seconds=1)},
        {"issued_at": NOW + timedelta(seconds=1)},
        {"valid_until": NOW},
        {"valid_from": NOW + timedelta(seconds=1)},
        {"mode": "forecast"},
    ],
)
def test_available_requires_correct_time_and_mode(changes):
    with pytest.raises(ValidationError):
        envelope(metrics=(metric(evidence=(source(**changes),)),))


def test_model_copy_cannot_bypass_contract():
    forged = envelope().model_copy(
        update={"metrics": (metric().model_copy(update={"unit": "°F"}),)}
    )
    with pytest.raises(ValidationError):
        calculate_conditions(forged, (criterion(),))


@pytest.mark.parametrize(
    "activity,name",
    [(a, m.name) for a, definition in ACTIVITIES.items() for m in definition.metrics],
)
def test_every_activity_metric_reaches_matching_with_its_own_unit(activity, name):
    """Exercise all 23 registered activity/metric pairs through the adapter."""
    row = source(name, 0.0).model_dump() | {"revision_ambiguous": False}
    link = {
        "station_id": 1,
        "name": "Isolated metric-contract fixture",
        "kind": "river_level"
        if activity == "rafting"
        else "bath_water"
        if name == "bath_water_temperature"
        else "weather_station",
        "relation": "station_observation_point",
        "mapping": None,
    }
    query = api.ConditionQuery(spot_id=1, activity=activity, mode="observation")
    selected = api.group_metric([row], link, query, NOW, NOW)
    assert selected.status == "available" and selected.value == 0
    data = envelope(activity, metrics=(selected,))
    assert calculate_conditions(data, (criterion(name, -1.0, 1.0),)).score == 100
    assert calculate_conditions(data, (criterion(name, 1.0, 2.0),)).score == 0
    bad = api.group_metric([row | {"unit": "unverified"}], link, query, NOW, NOW)
    assert bad.status == "unit_mismatch"
    assert (
        calculate_conditions(
            envelope(activity, metrics=(bad,)), (criterion(name),)
        ).score
        is None
    )


@pytest.fixture
def client(monkeypatch):
    async def read(reader, q):
        return envelope(q.activity, at=q.at or NOW, as_of=q.as_of or NOW)

    monkeypatch.setattr(api, "read_conditions", read)
    return TestClient(
        create_app(Settings(_env_file=None, postgres_password="test-only"))
    )


def body():
    return dict(
        spot_id=1,
        activity="swim",
        mode="observation",
        at=NOW.isoformat(),
        as_of=NOW.isoformat(),
        criteria=[criterion().model_dump()],
    )


def test_http_catalog_calculation_no_store_and_openapi(client):
    catalog = client.get(BASE + "/activities")
    assert catalog.status_code == 200 and len(catalog.json()["rows"]) == 6
    response = client.post(BASE + "/condition-score", json=body())
    assert response.status_code == 200 and response.json()["score"] == 100
    assert response.headers["cache-control"] == "no-store"
    operation = client.get("/api/openapi.json").json()["paths"][
        BASE + "/condition-score"
    ]["post"]
    schema = operation["requestBody"]
    assert "#/$defs/" not in json.dumps(schema)
    assert (
        schema["content"]["application/json"]["schema"]["properties"]["criteria"][
            "maxItems"
        ]
        == 8
    )


@pytest.mark.parametrize(
    "change",
    [
        {"activity": "invented"},
        {"spot_id": True},
        {"spot_id": 1.5},
        {"mode": "mixed"},
        {"at": 1234},
        {"at": "2026-01-02"},
        {"as_of": "2099-01-01T00:00:00Z"},
        {"at": "2026-01-03T00:00:00Z"},
        {"at": "2025-01-01T00:00:00Z"},
        {"criteria": []},
        {"criteria": [criterion().model_dump()] * 9},
        {"numeric_value": 25},
        {"score": 99},
    ],
)
def test_invalid_bodies_never_read_collection(client, monkeypatch, change):
    async def forbidden(*args, **kwargs):
        pytest.fail("Invalid request must not read the DB")

    monkeypatch.setattr(api, "read_conditions", forbidden)
    assert (
        client.post(BASE + "/condition-score", json=body() | change).status_code == 422
    )


@pytest.mark.parametrize(
    "change",
    [
        {"minimum": None, "maximum": None},
        {"minimum": 30, "maximum": 20},
        {"weight": 0},
        {"weight": -1},
        {"weight": 1001},
        {"weight": True},
        {"weight": "1"},
        {"minimum": True},
        {"station_id": True},
        {"metric": "official_grade"},
    ],
)
def test_bad_criteria_are_rejected(client, change):
    data = body()
    data["criteria"][0].update(change)
    assert client.post(BASE + "/condition-score", json=data).status_code == 422


def test_body_limits_nonfinite_and_duplicate_properties(client):
    url, headers = BASE + "/condition-score", {"content-type": "application/json"}
    raw = json.dumps(body())
    assert (
        client.post(url, content='{"spot_id":2,' + raw[1:], headers=headers).status_code
        == 422
    )
    assert (
        client.post(
            url, content=raw.replace('"weight": 1.0', '"weight": NaN'), headers=headers
        ).status_code
        == 422
    )
    assert client.post(url, content=b" " * 16385, headers=headers).status_code == 413
    assert (
        client.post(
            url, content=raw, headers={"content-type": "text/plain"}
        ).status_code
        == 415
    )
    assert client.post(url + "?activity=surf", json=body()).status_code == 422


def test_query_validation_and_db_outage_stays_failure(client, monkeypatch):
    assert (
        client.get(
            BASE + "/conditions?spot_id=1&spot_id=2&activity=swim&mode=observation"
        ).status_code
        == 422
    )
    assert client.get(BASE + "/activities?extra=1").status_code == 422

    async def unavailable(*args, **kwargs):
        raise HTTPException(503, "collection unavailable")

    monkeypatch.setattr(api, "read_conditions", unavailable)
    response = client.post(BASE + "/condition-score", json=body())
    assert response.status_code == 503 and "score" not in response.json()
