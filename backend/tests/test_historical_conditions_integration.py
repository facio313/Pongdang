"""Recent past targets read finalized published results, never raw evidence."""

import asyncio
from contextlib import asynccontextmanager
from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

import pytest
from fastapi.testclient import TestClient
from test_condition_score_integration import counts, source, station
from test_condition_score_integration import database as database

from app.data_reader import DataReader
from app.ingestion.models import Value
from app.ingestion.storage import store_batch
from app.main import create_app
from app.schema import connect
from app.water_index.condition_producer import produce_conditions
from app.water_index.recommendation_api import (
    RecommendationQuery,
    read_activities,
    read_activity,
)

BASE = "/api/data/water-index"


def published_counts(settings):
    with connect(settings) as c:
        return tuple(
            c.execute(f"SELECT count(*) FROM pongdang_data.{table}").fetchone()[0]
            for table in ("condition_generation", "condition_result")
        )


@pytest.mark.parametrize("mode", ["observation", "forecast"])
def test_explicit_past_target_reads_published_conditions_and_recommendation(
    database, mode, monkeypatch
):
    now = datetime.now(UTC)
    day_start = now.astimezone(ZoneInfo("Asia/Seoul")).replace(
        hour=0, minute=0, second=0, microsecond=0
    )
    source_time = day_start - timedelta(hours=12)
    target = source_time + timedelta(minutes=10)
    store_batch(
        database,
        source(
            source_id="historical-target",
            mode=mode,
            observed_at=source_time - timedelta(minutes=1),
            fetched_at=source_time,
            issued_at=source_time - timedelta(hours=1) if mode == "forecast" else None,
            valid_until=source_time + timedelta(minutes=30),
        ),
    )
    _, spot = station(database)
    assert produce_conditions(database, now=source_time + timedelta(minutes=5)) > 0
    # A newer, different value must not replace the explicitly selected target.
    store_batch(
        database,
        source(
            source_id="current-target",
            mode=mode,
            observed_at=now,
            fetched_at=now,
            issued_at=now - timedelta(minutes=1) if mode == "forecast" else None,
            values=[Value(name="air_temperature", numeric_value=28, unit="degC")],
        ),
    )
    assert produce_conditions(database) > 0
    before = counts(database)
    published_before = published_counts(database)
    params = dict(spot_id=spot, mode=mode, at=target.isoformat())

    async def forbidden(*args, **kwargs):
        raise AssertionError("Past product reads must use published results")

    monkeypatch.setattr("app.water_index.condition_api.read_conditions", forbidden)

    with TestClient(create_app(database)) as client:
        response = client.get(
            BASE + "/conditions", params=params | {"activity": "swim"}
        )
        assert response.status_code == 200, response.text
        assert response.headers["cache-control"] == "no-store"
        body = response.json()
        assert body["projection"] is not None
        assert body["condition_score"]["score"] is not None
        assert body["metrics"][0]["value"] == 22

        response = client.get(BASE + "/recommendation", params=params)
        assert response.status_code == 200, response.text
        assert response.headers["cache-control"] == "no-store"
        activities = response.json()["conditions"]
        assert all(row["projection"] is not None for row in activities)
        assert all(row["metrics"][0]["value"] == 22 for row in activities)

    assert counts(database) == before
    assert published_counts(database) == published_before


@pytest.mark.parametrize("mode", ["observation", "forecast"])
@pytest.mark.parametrize("single_activity", [False, True])
def test_current_recommendation_activity_reads_use_one_select(
    database, monkeypatch, mode, single_activity
):
    store_batch(database, source())
    _, spot = station(database)
    produce_conditions(database)
    statements = []

    class CountedConnection:
        def __init__(self, connection):
            self.connection = connection

        async def execute(self, statement, parameters):
            statements.append(statement)
            return await self.connection.execute(statement, parameters)

    class CountedReader(DataReader):
        @asynccontextmanager
        async def connection(self):
            async with super().connection() as connection:
                yield CountedConnection(connection)

    def forbidden(*args, **kwargs):
        raise AssertionError("Current activity reads must not calculate raw evidence")

    monkeypatch.setattr("app.water_index.condition_api.read_conditions", forbidden)
    now = datetime.now(UTC)
    query = RecommendationQuery(
        spot_id=spot, mode=mode, at=now if mode == "forecast" else None
    )
    reader = CountedReader(database)
    if single_activity:
        rows = [asyncio.run(read_activity(reader, query, "swim", now))]
    else:
        rows = list(asyncio.run(read_activities(reader, query, now)).values())
    assert len(statements) == 1
    assert all(row.projection is not None for row in rows)
