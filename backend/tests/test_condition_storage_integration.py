"""Published score reads, transactional invalidation and no request-side work."""

import asyncio
from contextlib import asynccontextmanager
from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from test_condition_score_integration import database as database
from test_condition_score_integration import source, station

from app.data_reader import DataReader
from app.ingestion.models import Value
from app.ingestion.storage import store_batch
from app.main import create_app
from app.schema import connect
from app.water_index.condition_api import ConditionQuery
from app.water_index.condition_producer import produce_conditions
from app.water_index.condition_storage import (
    projection_due,
    projection_revision,
    publish_conditions,
    read_condition_set,
)

BASE = "/api/data/water-index"


def query(spot_id, **extra):
    return dict(spot_id=spot_id, activity="swim", mode="observation", **extra)


def test_product_get_never_calculates_or_populates_missing_results(
    database, monkeypatch
):
    store_batch(database, source())
    _, spot = station(database)

    def forbidden(*args, **kwargs):
        raise AssertionError("Product reads must not calculate a score")

    with monkeypatch.context() as patch:
        patch.setattr(
            "app.water_index.condition_api.calculate_activity_score", forbidden
        )
        with TestClient(create_app(database)) as client:
            response = client.get(BASE + "/conditions", params=query(spot))
            assert response.status_code == 200
            assert response.json()["condition_score"]["score"] is None
            assert response.json()["projection"]["status"] == "pending"
    assert produce_conditions(database) > 0
    with monkeypatch.context() as patch:
        patch.setattr(
            "app.water_index.condition_api.calculate_activity_score", forbidden
        )
        patch.setattr("app.water_index.recommendation_api.read_conditions", forbidden)
        with TestClient(create_app(database)) as client:
            response = client.get(BASE + "/conditions", params=query(spot))
            assert response.status_code == 200, response.text
            body = response.json()
            assert body["condition_score"]["score"] is not None
            assert body["projection"]["status"] == "ready"
            assert body["projection"]["computed_at"]
            recommendation = client.get(
                BASE + "/recommendation", params={"spot_id": spot}
            )
            assert recommendation.status_code == 200, recommendation.text
            assert all(c["projection"] for c in recommendation.json()["conditions"])


def test_missing_refresh_preserves_published_scores_before_and_after_worker(database):
    original = source()
    store_batch(database, original)
    _, spot = station(database)
    produce_conditions(database)
    with TestClient(create_app(database)) as client:
        first = client.get(BASE + "/conditions", params=query(spot)).json()
        assert first["condition_score"]["score"] is not None
        revised = original.model_copy(
            update={
                "fetched_at": datetime.now(UTC),
                "readings": [
                    original.readings[0].model_copy(
                        update={
                            "values": [
                                Value(
                                    name="air_temperature",
                                    unit="degC",
                                    missing=True,
                                )
                            ]
                        }
                    )
                ],
            }
        )
        store_batch(database, revised)
        pending = client.get(BASE + "/conditions", params=query(spot)).json()
        assert pending["condition_score"] == first["condition_score"]
        assert pending["projection"]["status"] == "refreshing"
        assert pending["projection"]["retention_allowed"] is True
        produce_conditions(database)
        replacement = client.get(BASE + "/conditions", params=query(spot)).json()
        assert replacement["condition_score"] == first["condition_score"]
        assert replacement["projection"]["status"] == "refreshing"
        assert replacement["retained"] is True
        assert replacement["metrics"] == first["metrics"]
        assert (
            replacement["projection"]["computed_at"]
            == first["projection"]["computed_at"]
        )
        assert (
            replacement["projection"]["generation_id"]
            != first["projection"]["generation_id"]
        )


def test_new_observations_keep_published_scores_for_cold_clients_until_replaced(
    database,
):
    now = datetime.now(UTC)
    store_batch(
        database,
        source(source_id="earlier", observed_at=now - timedelta(minutes=10)),
    )
    _, spot = station(database)
    assert produce_conditions(database) > 0
    params = query(spot)
    with TestClient(create_app(database)) as client:
        first = client.get(BASE + "/conditions", params=params).json()
    store_batch(
        database,
        source(
            source_id="new-observation",
            observed_at=now - timedelta(minutes=1),
            values=[Value(name="air_temperature", numeric_value=28, unit="degC")],
        ),
    )
    # A new client has no browser cache. The API must supply the old complete
    # result, its real calculation time and explicit refresh state itself.
    with TestClient(create_app(database)) as client:
        pending = client.get(BASE + "/conditions", params=params).json()
        assert pending["condition_score"] == first["condition_score"]
        assert pending["retained"] is True
        projection = pending["projection"]
        assert projection["status"] == "refreshing"
        assert projection["generation_id"] == first["projection"]["generation_id"]
        assert projection["computed_at"] == first["projection"]["computed_at"]
        assert projection["source_revision"] < projection["latest_source_revision"]
        assert projection["retention_allowed"] is True
        summary = client.get(
            BASE + "/conditions/summary",
            params={"spot_ids": str(spot), "activity": "swim"},
        ).json()["rows"][0]
        assert summary["condition_score"] == first["condition_score"]
        assert summary["retained"] is True
        recommendation = client.get(
            BASE + "/recommendation", params={"spot_id": spot}
        ).json()
        swim = next(c for c in recommendation["conditions"] if c["activity"] == "swim")
        assert swim["retained"] is True
        assert swim["condition_score"] == first["condition_score"]
        assert produce_conditions(database) > 0
        current = client.get(BASE + "/conditions", params=params).json()
        assert current["projection"]["status"] == "ready"
        assert current["retained"] is False
        assert current["projection"]["generation_id"] != projection["generation_id"]
        assert current["condition_score"]["score"] != first["condition_score"]["score"]


def test_one_select_reads_multiple_activities_and_reports_missing_place(database):
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

    queries = [
        ConditionQuery(spot_id=spot, activity=activity, mode="observation")
        for activity in ("swim", "surf", "relax")
    ]
    results = asyncio.run(read_condition_set(CountedReader(database), queries))
    assert len(statements) == 1
    assert len(results) == 3
    assert len({r.projection.generation_id for r in results}) == 1
    with TestClient(create_app(database)) as client:
        response = client.get(
            BASE + "/conditions/summary",
            params={"spot_ids": f"{spot},999999999", "activity": "swim"},
        )
        assert response.status_code == 200, response.text
        assert len(response.json()["rows"]) == 1
        assert response.json()["unavailable"] == [
            {"spot_id": 999999999, "reason": "place_not_found"}
        ]


def test_unchanged_inputs_skip_and_changed_inputs_cannot_publish(database):
    store_batch(database, source())
    with connect(database) as c:
        previous = projection_revision(c)
        assert projection_due(c)
    assert produce_conditions(database) > 0
    assert produce_conditions(database) == 0
    with connect(database) as c:
        assert not projection_due(c)
        before = c.execute(
            "SELECT count(*) FROM pongdang_data.condition_generation"
        ).fetchone()[0]
        c.execute("UPDATE pongdang_data.spots_waterspot SET name=name || ' revised'")
    with pytest.raises(RuntimeError, match="CONDITION_INPUT_CHANGED"):
        publish_conditions(
            database,
            records=[],
            computed_at=datetime.now(UTC),
            source_revision=previous,
        )
    with connect(database) as c:
        assert projection_due(c)
        assert (
            c.execute(
                "SELECT count(*) FROM pongdang_data.condition_generation"
            ).fetchone()[0]
            == before
        )


def test_replaced_display_sets_are_bounded_and_source_evidence_is_preserved(database):
    observed_at = datetime.now(UTC) - timedelta(minutes=5)
    for temperature in (20, 21, 22):
        store_batch(
            database,
            source(
                observed_at=observed_at,
                values=[
                    Value(
                        name="air_temperature", numeric_value=temperature, unit="degC"
                    )
                ],
            ),
        )
        assert produce_conditions(database) > 0
    with connect(database) as c:
        assert (
            c.execute(
                "SELECT count(*) FROM pongdang_data.condition_generation"
            ).fetchone()[0]
            == 3
        )
        retained = c.execute(
            "SELECT DISTINCT generation_id FROM pongdang_data.condition_snapshot "
            "ORDER BY generation_id"
        ).fetchall()
        newest = c.execute(
            "SELECT id FROM pongdang_data.condition_generation ORDER BY id DESC LIMIT 2"
        ).fetchall()
        assert retained == list(reversed(newest))
        assert (
            c.execute(
                "SELECT count(*) FROM pongdang_data.conditions_observationsnapshot"
            ).fetchone()[0]
            == 3
        )


def test_projection_read_exposes_expiry_without_extending_source_validity(database):
    now = datetime.now(UTC)
    batch = source(
        fetched_at=now - timedelta(seconds=1),
        valid_until=now + timedelta(seconds=30),
    )
    store_batch(database, batch)
    _, spot = station(database)
    produce_conditions(database, now=now)
    reader = DataReader(database)
    q = ConditionQuery(**query(spot))
    current = asyncio.run(read_condition_set(reader, [q], now=now))[0]
    expired = asyncio.run(
        read_condition_set(reader, [q], now=now + timedelta(minutes=1))
    )[0]
    assert current.condition_score.score is not None
    assert expired.condition_score == current.condition_score
    assert expired.metrics == current.metrics
    assert expired.retained is True
    assert expired.retained_at == current.at
    assert expired.metrics[0].evidence[0].valid_until == batch.readings[0].valid_until
    assert expired.projection.computed_at == current.projection.computed_at


def test_series_returns_requested_targets_from_one_published_set(database, monkeypatch):
    now = datetime.now(UTC)
    start = now + timedelta(hours=1)
    store_batch(
        database,
        source(
            mode="forecast",
            observed_at=start,
            valid_until=start + timedelta(hours=2),
            issued_at=now - timedelta(hours=1),
        ),
    )
    _, spot = station(database)
    produce_conditions(database)

    def forbidden(*args, **kwargs):
        raise AssertionError("Series reads must use saved scores")

    monkeypatch.setattr(
        "app.water_index.condition_api.calculate_activity_score", forbidden
    )
    targets = [start, start + timedelta(hours=1), start + timedelta(hours=3)]
    params = {
        "spot_id": spot,
        "activity": "swim",
        "targets": ",".join(t.isoformat() for t in targets),
    }
    with TestClient(create_app(database)) as client:
        response = client.get(BASE + "/conditions/series", params=params)
        assert response.status_code == 200, response.text
        rows = response.json()["rows"]
        assert len(rows) == 3
        assert [datetime.fromisoformat(row["at"]) for row in rows] == targets
        assert rows[0]["condition_score"]["score"] is not None
        assert rows[1]["condition_score"]["score"] is not None
        assert rows[2]["condition_score"]["score"] is None
        assert len({row["projection"]["generation_id"] for row in rows}) == 1
        params["targets"] = ",".join(
            (start + timedelta(minutes=i)).isoformat() for i in range(33)
        )
        assert client.get(BASE + "/conditions/series", params=params).status_code == 422


def test_local_v18_upgrade_removes_extra_truncate_triggers(database):
    from psycopg import sql

    from app.schema import VERSION, initialize
    from app.water_index.condition_invalidation import INPUT_TABLES

    store_batch(database, source())
    with connect(database) as c:
        for table, _ in INPUT_TABLES:
            c.execute(
                sql.SQL(
                    "CREATE TRIGGER condition_projection_truncated "
                    "AFTER TRUNCATE ON {} "
                    "FOR EACH STATEMENT EXECUTE FUNCTION "
                    "pongdang_data.invalidate_condition_projection()"
                ).format(sql.Identifier("pongdang_data", table))
            )
        c.execute("UPDATE pongdang_data.schema_version SET version=18")
    assert initialize(database)
    assert not initialize(database)
    with connect(database) as c:
        assert c.execute(
            "SELECT version FROM pongdang_data.schema_version"
        ).fetchone() == (VERSION,)
        assert c.execute(
            "SELECT count(*) FROM pg_trigger "
            "WHERE tgname='condition_projection_truncated'"
        ).fetchone() == (0,)
        before = c.execute(
            "SELECT revision FROM pongdang_data.condition_source_revision"
        ).fetchone()[0]
        c.execute("TRUNCATE pongdang_data.water_index_authority_evidence")
        assert c.execute(
            "SELECT revision FROM pongdang_data.condition_source_revision"
        ).fetchone() == (before + 1,)
