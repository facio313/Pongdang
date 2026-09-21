"""Explicit past targets preserve the raw API while current reads use snapshots."""

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
from app.water_index.condition_api import ConditionQuery, read_conditions
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
            for table in ("condition_generation", "condition_snapshot")
        )


@pytest.mark.parametrize("mode", ["observation", "forecast"])
def test_explicit_past_target_matches_raw_conditions_and_recommendation(database, mode):
    now = datetime.now(UTC)
    day_start = now.astimezone(ZoneInfo("Asia/Seoul")).replace(
        hour=0, minute=0, second=0, microsecond=0
    )
    target = (
        now - min(timedelta(minutes=10), (now - day_start) / 2)
        if mode == "observation"
        else day_start - timedelta(hours=12)
    )
    store_batch(
        database,
        source(
            source_id="historical-target",
            mode=mode,
            observed_at=target - timedelta(minutes=1),
            fetched_at=target,
            issued_at=target - timedelta(hours=1) if mode == "forecast" else None,
            valid_until=target + timedelta(minutes=30),
        ),
    )
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
    _, spot = station(database)
    before = counts(database)
    published_before = published_counts(database)
    params = dict(spot_id=spot, mode=mode, at=target.isoformat())

    async def expected(views):
        reader = DataReader(database)
        return [
            (
                await read_conditions(
                    reader,
                    ConditionQuery(**params, activity=view["activity"]),
                    now=datetime.fromisoformat(view["as_of"]),
                )
            ).model_dump(mode="json")
            for view in views
        ]

    with TestClient(create_app(database)) as client:
        response = client.get(
            BASE + "/conditions", params=params | {"activity": "swim"}
        )
        assert response.status_code == 200, response.text
        assert response.headers["cache-control"] == "no-store"
        body = response.json()
        assert [body] == asyncio.run(expected([body]))
        assert body["projection"] is None
        assert body["condition_score"]["score"] is not None
        assert body["metrics"][0]["value"] == 22

        response = client.get(BASE + "/recommendation", params=params)
        assert response.status_code == 200, response.text
        assert response.headers["cache-control"] == "no-store"
        activities = response.json()["conditions"]
        assert activities == asyncio.run(expected(activities))
        assert all(row["projection"] is None for row in activities)
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

    monkeypatch.setattr("app.water_index.recommendation_api.read_conditions", forbidden)
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
