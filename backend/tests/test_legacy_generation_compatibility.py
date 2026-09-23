"""v19 rollback must ignore generations published only in the v20 result table."""

from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient
from test_condition_score_integration import database as database
from test_condition_score_integration import source, station

from app.ingestion.models import Value
from app.ingestion.storage import store_batch
from app.main import create_app
from app.schema import connect
from app.water_index.condition_producer import produce_conditions
from app.water_index.condition_storage import (
    MODEL_VERSION,
    projection_due,
    projection_is_current,
    projection_revision,
    publish_conditions,
)


def insert_result_only_generation(settings, *, computed_at=None):
    with connect(settings) as c:
        revision = projection_revision(c)
        return c.execute(
            "INSERT INTO pongdang_data.condition_generation "
            "(source_revision,model_version,computed_at,record_count) "
            "VALUES(%s,%s,%s,100) RETURNING id",
            [revision, MODEL_VERSION, computed_at or datetime.now(UTC)],
        ).fetchone()[0]


def test_result_only_generation_does_not_hide_legacy_read_or_delay_rebuild(database):
    store_batch(database, source())
    _, spot = station(database)
    produce_conditions(database)
    params = {"spot_id": spot, "activity": "swim", "mode": "observation"}
    with TestClient(create_app(database)) as client:
        before = client.get("/api/data/water-index/conditions", params=params).json()
        assert before["condition_score"]["score"] is not None
        store_batch(database, source(source_id="new-revision"))
        result_only = insert_result_only_generation(database)
        with connect(database) as c:
            assert projection_due(c)
            assert not projection_is_current(
                c, projection_revision(c), datetime.now(UTC) - timedelta(days=1)
            )
        after = client.get("/api/data/water-index/conditions", params=params).json()
        assert after["condition_score"] == before["condition_score"]
        assert (
            after["projection"]["generation_id"]
            == before["projection"]["generation_id"]
        )
        assert after["projection"]["generation_id"] != result_only


def test_rebuild_retains_previous_legacy_score_past_result_only_generation(database):
    original = source()
    store_batch(database, original)
    _, spot = station(database)
    produce_conditions(database)
    params = {"spot_id": spot, "activity": "swim", "mode": "observation"}
    with TestClient(create_app(database)) as client:
        before = client.get("/api/data/water-index/conditions", params=params).json()
        assert before["condition_score"]["score"] is not None
        store_batch(
            database,
            original.model_copy(
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
            ),
        )
        result_only = insert_result_only_generation(database)
        assert produce_conditions(database) > 0
        after = client.get("/api/data/water-index/conditions", params=params).json()
        assert after["condition_score"] == before["condition_score"]
        assert after["retained"] is True
        assert after["projection"]["generation_id"] > result_only
        with connect(database) as c:
            assert not projection_due(c)
            assert projection_is_current(
                c, projection_revision(c), datetime.now(UTC) - timedelta(days=1)
            )


def test_result_only_generations_do_not_evict_two_retained_legacy_generations(database):
    store_batch(database, source())
    _, spot = station(database)
    now = datetime.now(UTC)
    with connect(database) as c:
        revision = projection_revision(c)
    legacy_ids = []
    for minute in (10, 8, 6):
        computed_at = now - timedelta(minutes=minute)
        assert (
            publish_conditions(
                database,
                computed_at=computed_at,
                source_revision=revision,
                records=[
                    {
                        "spot_id": spot,
                        "activity": "swim",
                        "mode": "observation",
                        "target_start": computed_at,
                        "target_end": computed_at + timedelta(minutes=1),
                        "payload": {},
                    }
                ],
            )
            == 1
        )
        with connect(database) as c:
            legacy_ids.append(
                c.execute(
                    "SELECT max(generation_id) FROM pongdang_data.condition_snapshot"
                ).fetchone()[0]
            )
        insert_result_only_generation(
            database, computed_at=computed_at + timedelta(seconds=1)
        )
    with connect(database) as c:
        remaining = c.execute(
            "SELECT DISTINCT generation_id FROM pongdang_data.condition_snapshot "
            "ORDER BY generation_id"
        ).fetchall()
    assert remaining == [(identifier,) for identifier in legacy_ids[-2:]]
