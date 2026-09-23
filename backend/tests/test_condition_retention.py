"""Forecast retention keeps evidence intervals without accumulating old splits."""

from contextlib import contextmanager
from datetime import UTC, datetime, timedelta

from test_condition_score import envelope, metric, source

from app.water_index.activity_score import calculate_activity_score
from app.water_index.condition_retention import RetainedPublication, retain_payload
from app.water_index.conditions import ConditionsEnvelope, DisplayMetric

NOW = datetime(2026, 9, 22, tzinfo=UTC)


class FixtureConnection:
    def __init__(self, rows=()):
        self.rows = rows

    @contextmanager
    def cursor(self, **_kwargs):
        yield self

    def execute(self, *_args):
        return self

    def fetchall(self):
        return [stored(row) for row in self.rows]


def record(start, end, score):
    return {
        "spot_id": 1,
        "activity": "relax",
        "mode": "forecast",
        "target_start": start,
        "target_end": end,
        "payload": {
            "at": start.isoformat(),
            "condition_score": {
                "score": score,
                "components": [{"metric": "air_temperature", "score": score}],
            },
            "reason_codes": [],
        },
    }


def stored(row):
    """Represent a published record in the current condition_result shape."""
    payload = row["payload"]
    return {
        **{
            key: row[key]
            for key in (
                "spot_id",
                "activity",
                "mode",
                "target_start",
                "target_end",
            )
        },
        "generation_id": 1,
        "source_revision": 1,
        "computed_at": NOW,
        "place_name": "Fixture place",
        "evidence_at": payload["at"],
        "evidence_as_of": payload["at"],
        "support_status": "unknown",
        "safety_status": "unknown",
        "condition_score": payload["condition_score"],
        "retained": False,
        "retained_at": None,
        "detail": {
            "restriction_refs": [],
            "metrics": [],
            "context_metrics": [],
            "display_metrics": [],
            "missing_metrics": [],
            "required_evidence": [],
            "reason_codes": payload["reason_codes"],
            "projection": None,
        },
    }


def test_fresh_forecast_boundaries_do_not_accumulate_across_ten_publications():
    connection = FixtureConnection()
    until = NOW + timedelta(days=1)
    for generation in range(1, 11):
        boundary = NOW + timedelta(minutes=30 * generation)
        current = [
            record(NOW, boundary, 90.0 - generation),
            record(boundary, until, 70.0 - generation),
        ]
        retention = RetainedPublication(
            connection,
            {"generation_id": generation - 1} if connection.rows else None,
            {"generation_id": generation},
        )
        actual = list(retention.records(current))
        assert len(actual) == 2
        assert actual == current
        connection.rows = actual


def test_missing_forecast_preserves_distinct_original_target_intervals():
    boundary = NOW + timedelta(hours=1)
    until = NOW + timedelta(hours=2)
    previous = [record(NOW, boundary, 80.0), record(boundary, until, 40.0)]
    origin = {"generation_id": 1}
    retention = RetainedPublication(
        FixtureConnection(previous), origin, {"generation_id": 2}
    )
    actual = list(retention.records([record(NOW, until, None)]))
    assert [(row["target_start"], row["target_end"]) for row in actual] == [
        (NOW, boundary),
        (boundary, until),
    ]
    for old, kept in zip(previous, actual, strict=True):
        assert kept["payload"]["condition_score"] == old["payload"]["condition_score"]
        assert kept["payload"]["at"] == old["payload"]["at"]
        assert kept["payload"]["retained_at"] == old["payload"]["at"]
        assert kept["payload"]["retained"] is True
        assert kept["payload"]["projection"]["generation_id"] == origin["generation_id"]
        assert kept["payload"]["projection"]["status"] == "ready"


def scored_payload(at, values):
    metrics = tuple(
        metric(
            name,
            value,
            evidence=(
                source(
                    name,
                    value,
                    observed_at=at - timedelta(minutes=1),
                    fetched_at=at,
                    valid_from=at - timedelta(minutes=1),
                    valid_until=at + timedelta(minutes=10),
                ),
            ),
        )
        for name, value in values.items()
    )
    result = envelope(metrics=metrics, at=at, as_of=at)
    return result.model_copy(
        update={
            "condition_score": calculate_activity_score(result),
            "display_metrics": tuple(DisplayMetric(**m.model_dump()) for m in metrics),
        }
    ).model_dump(mode="json")


def test_missing_independent_wind_keeps_new_air_and_recomputes_only_worker_total():
    previous = scored_payload(NOW, {"air_temperature": 22.0, "wind_speed": 2.0})
    current = scored_payload(NOW + timedelta(hours=1), {"air_temperature": 26.0})
    actual = retain_payload(previous, current, {"generation_id": 1})
    assert previous["condition_score"]["score"] == 62.5
    assert actual["condition_score"]["score"] == 100.0
    assert actual["condition_score"]["available_components"] == 2
    assert actual["retained"] is True
    assert actual["retained_at"] == current["at"]
    air, wind = actual["metrics"]
    assert air == current["metrics"][0]
    assert wind["status"] == "stale"
    assert wind["evidence"] == previous["metrics"][1]["evidence"]
    assert wind["reason_codes"] == previous["metrics"][1]["reason_codes"]
    assert actual["display_metrics"][1]["status"] == "provisional"
    # Decoding the stored publication later must preserve each original source
    # clock, without pretending the borrowed wind acquired a new validity.
    assert ConditionsEnvelope.model_validate(
        {
            **actual,
            "at": NOW + timedelta(hours=5),
            "as_of": NOW + timedelta(hours=5),
        }
    ).metrics[1].evidence[0].valid_until == NOW + timedelta(minutes=10)
    lower = scored_payload(NOW + timedelta(hours=2), {"air_temperature": 10.0})
    again = retain_payload(actual, lower, {"generation_id": 2})
    assert again["condition_score"]["score"] == 50.0
    assert again["metrics"][1]["evidence"] == wind["evidence"]


def test_display_only_failure_does_not_freeze_valid_activity_components():
    previous = scored_payload(NOW, {"air_temperature": 25.0, "precipitation": 0.5})
    current = scored_payload(NOW + timedelta(hours=1), {"air_temperature": 10.0})
    actual = retain_payload(previous, current, {"generation_id": 1})
    assert actual["condition_score"]["score"] == 0.0
    assert (
        actual["condition_score"]["components"]
        == current["condition_score"]["components"]
    )
    assert actual["display_metrics"][1]["name"] == "precipitation"
    assert actual["display_metrics"][1]["value"] == 0.5
    assert actual["metrics"][0] == current["metrics"][0]


def test_invalid_numeric_component_keeps_prior_wind_with_new_air():
    previous = scored_payload(NOW, {"air_temperature": 22.0, "wind_speed": 2.0})
    current = scored_payload(
        NOW + timedelta(hours=1), {"air_temperature": 26.0, "wind_speed": -1.0}
    )
    assert current["metrics"][1]["status"] == "available"
    assert (
        next(
            c
            for c in current["condition_score"]["components"]
            if c["metric"] == "wind_speed"
        )["score"]
        is None
    )
    # Producer display selection also excludes out-of-domain measurements.
    current["display_metrics"] = current["display_metrics"][:1]
    actual = retain_payload(previous, current, {"generation_id": 1})
    assert actual["condition_score"]["available_components"] == 2
    assert actual["condition_score"]["score"] == 100.0
    assert actual["metrics"][0] == current["metrics"][0]
    assert actual["metrics"][1]["value"] == 2.0
    assert actual["metrics"][1]["evidence"] == previous["metrics"][1]["evidence"]
    assert actual["display_metrics"][1]["value"] == 2.0


def test_unchanged_partial_recheck_reuses_original_result_but_new_source_does_not():
    previous = scored_payload(NOW, {"air_temperature": 22.0, "wind_speed": 2.0})
    current = scored_payload(NOW + timedelta(hours=1), {"air_temperature": 26.0})
    partial = retain_payload(previous, current, {"generation_id": 1})
    recheck = {
        **current,
        "at": (NOW + timedelta(hours=1, minutes=5)).isoformat(),
        "as_of": (NOW + timedelta(hours=1, minutes=5)).isoformat(),
    }
    assert retain_payload(partial, recheck, {"generation_id": 2}) is partial
    updated_source = scored_payload(
        NOW + timedelta(hours=1, minutes=5), {"air_temperature": 26.0}
    )
    updated = retain_payload(partial, updated_source, {"generation_id": 2})
    assert updated is not partial
    assert updated["metrics"][0]["evidence"] == updated_source["metrics"][0]["evidence"]


def test_complete_failure_keeps_original_result_and_restrictions_still_win():
    previous = scored_payload(NOW, {"air_temperature": 25.0, "wind_speed": 2.0})
    missing = scored_payload(NOW + timedelta(hours=1), {})
    actual = retain_payload(previous, missing, {"generation_id": 1})
    assert actual["condition_score"] == previous["condition_score"]
    assert actual["metrics"] == previous["metrics"]
    assert actual["retained_at"] == previous["at"]
    restricted = {**missing, "safety_status": "restricted"}
    assert retain_payload(previous, restricted, {}) is restricted


def test_undeclared_score_formula_never_mixes_old_and_new_components():
    previous = scored_payload(NOW, {"air_temperature": 25.0, "wind_speed": 2.0})
    current = scored_payload(NOW + timedelta(hours=1), {"air_temperature": 10.0})
    previous["condition_score"]["model_id"] = "coupled-formula"
    current["condition_score"]["model_id"] = "coupled-formula"
    actual = retain_payload(previous, current, {"generation_id": 1})
    assert actual["condition_score"] == previous["condition_score"]
    assert actual["metrics"] == previous["metrics"]
