"""Migration waits for old publishers without placing readers behind its DDL."""

from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime, timedelta
from threading import Event

import pytest
from fastapi.testclient import TestClient
from psycopg import errors, sql
from psycopg.types.json import Jsonb
from test_condition_score_integration import database as database
from test_condition_score_integration import source, station

from app.ingestion.storage import store_batch
from app.main import create_app
from app.schema import connect, initialize
from app.water_index import condition_storage
from app.water_index.condition_producer import produce_conditions

TABLES = (
    "condition_generation",
    "condition_source_revision",
    "condition_snapshot",
)


def legacy_score(settings):
    store_batch(settings, source())
    _, spot = station(settings)
    assert produce_conditions(settings) > 0
    params = {"spot_id": spot, "activity": "swim", "mode": "observation"}
    with TestClient(create_app(settings)) as client:
        before = client.get("/api/data/water-index/conditions", params=params).json()
    assert before["condition_score"]["score"] is not None
    computed_at = datetime.now(UTC) - timedelta(seconds=1)
    with connect(settings) as c:
        c.execute(
            "INSERT INTO pongdang_data.condition_snapshot "
            "(generation_id,spot_id,activity,mode,target_start,target_end,payload) "
            "VALUES(%s,%s,'swim','observation',%s,%s,%s)",
            [
                before["projection"]["generation_id"],
                spot,
                computed_at,
                computed_at + timedelta(hours=1),
                Jsonb(before),
            ],
        )
        c.execute(
            "DROP TRIGGER condition_invalidation_clock ON "
            "pongdang_data.condition_source_revision"
        )
        c.execute("DROP FUNCTION pongdang_data.stamp_condition_invalidation()")
        c.execute(
            "ALTER TABLE pongdang_data.condition_source_revision "
            "DROP COLUMN invalidated_at"
        )
        c.execute("DROP TABLE pongdang_data.condition_result")
        c.execute(
            "ALTER TABLE pongdang_data.condition_generation "
            "DROP COLUMN result_published"
        )
        c.execute("UPDATE pongdang_data.schema_version SET version=19")
    return params, before


@pytest.mark.parametrize("busy_table", TABLES)
def test_migration_wait_keeps_readers_available_and_preserves_score(
    database, monkeypatch, busy_table
):
    params, before = legacy_score(database)
    waiting, resume = Event(), Event()

    def pause(delay):
        assert delay == 0.5
        waiting.set()
        assert resume.wait(5), "Test did not release the legacy publisher"

    monkeypatch.setattr(condition_storage, "sleep", pause)
    with connect(database) as publisher:
        publisher.execute(
            sql.SQL("LOCK TABLE {} IN ROW EXCLUSIVE MODE").format(
                sql.Identifier("pongdang_data", busy_table)
            )
        )
        with ThreadPoolExecutor(max_workers=1) as executor:
            migration = executor.submit(initialize, database)
            try:
                assert waiting.wait(5), "Migration did not retry a busy table"
                assert not migration.done()
                with connect(database) as reader:
                    reader.execute("SET LOCAL statement_timeout = 250")
                    for table in TABLES:
                        reader.execute(
                            sql.SQL("SELECT count(*) FROM {}").format(
                                sql.Identifier("pongdang_data", table)
                            )
                        ).fetchone()
                    assert reader.execute(
                        "SELECT version FROM pongdang_data.schema_version"
                    ).fetchone() == (19,)
            finally:
                publisher.rollback()
                resume.set()
            assert migration.result(timeout=10) is True
    with TestClient(create_app(database)) as client:
        after = client.get("/api/data/water-index/conditions", params=params).json()
    assert after["condition_score"] == before["condition_score"]
    assert after["projection"]["status"] == "ready"
    with connect(database) as c:
        assert c.execute(
            "SELECT version FROM pongdang_data.schema_version"
        ).fetchone() == (20,)


def test_migration_lock_deadline_releases_partial_locks(database, monkeypatch):
    clock = iter((100.0, 699.9, 700.0))
    sleeps = []
    monkeypatch.setattr(condition_storage, "monotonic", lambda: next(clock))
    monkeypatch.setattr(condition_storage, "sleep", sleeps.append)
    with connect(database) as publisher, connect(database) as migration:
        publisher.execute(
            "LOCK TABLE pongdang_data.condition_snapshot IN ROW EXCLUSIVE MODE"
        )
        with pytest.raises(errors.LockNotAvailable):
            condition_storage._lock_result_migration(migration)
        assert sleeps == [0.5]
        assert migration.execute("SELECT 1").fetchone() == (1,)
        with connect(database) as reader:
            reader.execute("SET LOCAL statement_timeout = 250")
            for table in TABLES:
                reader.execute(
                    sql.SQL("SELECT count(*) FROM {}").format(
                        sql.Identifier("pongdang_data", table)
                    )
                ).fetchone()
