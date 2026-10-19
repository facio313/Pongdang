"""Normalized reads must not aggregate unrelated forecast metric history."""

import os
from contextlib import contextmanager
from datetime import UTC, datetime, timedelta

import pytest

from app.config import Settings
from app.forecast.storage import read_normalized
from app.schema import connect


@pytest.fixture
def database():
    settings = Settings(_env_file=None)
    if (
        os.environ.get("PONGDANG_TEST_DISPOSABLE") != "1"
        or settings.postgres_host not in {"127.0.0.1", "localhost"}
        or settings.postgres_db != "pongdang_test"
    ):
        pytest.fail("Requires an explicitly disposable loopback pongdang_test")
    # Only the columns used by read_normalized are needed for this query-plan
    # regression. CREATE fails rather than adopting any pre-existing schema.
    with connect(settings) as connection:
        connection.execute("CREATE SCHEMA pongdang_data")
        connection.execute("""
            CREATE TABLE pongdang_data.collection_station (id bigint PRIMARY KEY);
            INSERT INTO pongdang_data.collection_station VALUES (1);
            CREATE TABLE pongdang_data.conditions_observationsnapshot (
                id bigint PRIMARY KEY, station_id bigint NOT NULL,
                provider text NOT NULL, source_record_id text NOT NULL,
                state text NOT NULL DEFAULT 'current',
                observed_at timestamptz NOT NULL, valid_until timestamptz NOT NULL,
                fetched_at timestamptz NOT NULL, issued_at timestamptz,
                ingestion_version text NOT NULL DEFAULT 'fixture.1'
            );
            CREATE TABLE pongdang_data.conditions_observationmetric (
                id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
                snapshot_id bigint NOT NULL, name text NOT NULL,
                mode text NOT NULL, numeric_value double precision
            );
            CREATE INDEX metrics_snapshot_idx ON
                pongdang_data.conditions_observationmetric (snapshot_id);
        """)
    try:
        yield settings
    finally:
        with connect(settings) as connection:
            connection.execute("DROP SCHEMA pongdang_data CASCADE")


class RecordedConnection:
    def __init__(self, connection):
        self.connection = connection

    @contextmanager
    def cursor(self, **kwargs):
        with self.connection.cursor(**kwargs) as cursor:
            self.actual_cursor = cursor
            yield self

    def execute(self, query, params):
        self.query, self.params = query, params
        return self.actual_cursor.execute(query, params)


def plan_nodes(plan):
    yield plan
    for child in plan.get("Plans", ()):
        yield from plan_nodes(child)


@pytest.mark.parametrize("forecast_only", [False, True])
@pytest.mark.parametrize("current_only", [False, True])
def test_normalized_read_bounds_history_and_preserves_selection(
    database, forecast_only, current_only
):
    now = datetime(2026, 10, 20, 3, tzinfo=UTC)
    with connect(database) as connection:
        connection.execute(
            "INSERT INTO pongdang_data.conditions_observationsnapshot "
            "(id,station_id,provider,source_record_id,observed_at,valid_until,"
            "fetched_at) SELECT n,1,'kma_fixture',n::text,%s,%s,%s "
            "FROM generate_series(1,10000) n",
            [
                now - timedelta(days=41),
                now - timedelta(days=40),
                now - timedelta(days=42),
            ],
        )
        connection.execute(
            "INSERT INTO pongdang_data.conditions_observationmetric "
            "(snapshot_id,name,mode) SELECT n,'metric-'||m,'forecast' "
            "FROM generate_series(1,10000) n CROSS JOIN generate_series(1,4) m"
        )
        for number in range(1, 9):
            provider = "khoa_tide_extrema" if number >= 7 else "kma_fixture"
            observed = now + timedelta(hours=1)
            until = now + timedelta(hours=2)
            if number in {4, 8}:
                observed, until = now - timedelta(hours=2), now - timedelta(hours=1)
            fetched = (
                now + timedelta(seconds=1)
                if number == 6
                else now - timedelta(seconds=9 - number)
            )
            connection.execute(
                "INSERT INTO pongdang_data.conditions_observationsnapshot "
                "(id,station_id,provider,source_record_id,state,observed_at,"
                "valid_until,fetched_at,ingestion_version) "
                "VALUES (%s,1,%s,%s,%s,%s,%s,%s,%s)",
                [
                    10000 + number,
                    provider,
                    str(number),
                    "superseded" if number == 5 else "current",
                    observed,
                    until,
                    fetched,
                    "tide-event-slots.2" if number == 8 else "fixture.1",
                ],
            )
            connection.execute(
                "INSERT INTO pongdang_data.conditions_observationmetric "
                "(snapshot_id,name,mode,numeric_value) VALUES (%s,'height',%s,%s)",
                [
                    10000 + number,
                    "observation" if number == 3 else "forecast",
                    None if number == 2 else float(number),
                ],
            )
        connection.execute("ANALYZE pongdang_data.conditions_observationsnapshot")
        connection.execute("ANALYZE pongdang_data.conditions_observationmetric")
        recorded = RecordedConnection(connection)
        rows = read_normalized(
            recorded, now, forecast_only=forecast_only, current_only=current_only
        )
        expected = {10002, 10008}
        if not forecast_only:
            expected.add(10003)
        if not current_only:
            expected.add(10004)
        assert {row["snapshot"]["id"] for row in rows} == expected
        latest = next(row for row in rows if row["snapshot"]["id"] == 10002)
        assert latest["metrics"][0]["numeric_value"] is None

        # Measure rows visited, not a hardware-dependent elapsed-time threshold.
        # This EXPLAIN ANALYZE runs only on the disposable fixture database.
        plan = connection.execute(
            "EXPLAIN (ANALYZE, FORMAT JSON) " + recorded.query, recorded.params
        ).fetchone()[0][0]["Plan"]
        visited = sum(
            node["Actual Rows"] * node["Actual Loops"]
            for node in plan_nodes(plan)
            if node.get("Relation Name") == "conditions_observationmetric"
        )
        assert visited < 100, f"Scanned {visited} metrics for {len(rows)} live targets"
