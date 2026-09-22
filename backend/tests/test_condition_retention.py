"""Forecast retention keeps evidence intervals without accumulating old splits."""

from contextlib import contextmanager
from datetime import UTC, datetime, timedelta

from app.water_index.condition_retention import RetainedPublication

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
        return self.rows


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
        assert kept["payload"]["projection"] == origin
