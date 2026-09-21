"""Large condition publication stays atomic without blocking source updates."""

from datetime import UTC, datetime, timedelta

import pytest
from psycopg.errors import QueryCanceled
from test_condition_score_integration import database as database
from test_condition_score_integration import source, station

from app.ingestion.jobs import Job
from app.ingestion.storage import store_batch
from app.ingestion.worker import registered_jobs, run_due
from app.schema import connect
from app.water_index.condition_storage import (
    ConditionInputsChanged,
    projection_revision,
    publish_conditions,
)


def publication(database):
    store_batch(database, source())
    _, spot = station(database)
    now = datetime.now(UTC)
    with connect(database) as c:
        revision = projection_revision(c)
    return (
        now,
        revision,
        {
            "spot_id": spot,
            "activity": "swim",
            "mode": "observation",
            "target_start": now,
            "target_end": now + timedelta(minutes=1),
            "payload": {},
        },
    )


def assert_unpublished(database):
    with connect(database) as c:
        assert c.execute(
            "SELECT count(*) FROM pongdang_data.condition_generation"
        ).fetchone() == (0,)
        assert c.execute(
            "SELECT count(*) FROM pongdang_data.condition_snapshot"
        ).fetchone() == (0,)


def test_stream_failure_does_not_publish_partial_generation(database):
    now, revision, record = publication(database)

    def records():
        for minute in range(501):
            yield {
                **record,
                "target_start": now + timedelta(minutes=minute),
                "target_end": now + timedelta(minutes=minute + 1),
            }
        raise RuntimeError("calculation interrupted")

    with pytest.raises(RuntimeError, match="calculation interrupted"):
        publish_conditions(
            database, records=records(), computed_at=now, source_revision=revision
        )
    assert_unpublished(database)


def test_source_change_during_stream_is_not_blocked_or_published(database):
    now, revision, record = publication(database)

    def records():
        for minute in range(501):
            yield {
                **record,
                "target_start": now + timedelta(minutes=minute),
                "target_end": now + timedelta(minutes=minute + 1),
            }
        with connect(database) as c:
            c.execute("UPDATE pongdang_data.spots_waterspot SET name=name")

    with pytest.raises(ConditionInputsChanged):
        publish_conditions(
            database, records=records(), computed_at=now, source_revision=revision
        )
    assert_unpublished(database)


def test_complete_iterator_records_committed_count(database):
    now, revision, record = publication(database)
    record["payload"] = {"장소": "경포 🌊", "value": 23.1, "missing": None}
    assert (
        publish_conditions(
            database, records=iter([record]), computed_at=now, source_revision=revision
        )
        == 1
    )
    with connect(database) as c:
        assert c.execute(
            "SELECT record_count FROM pongdang_data.condition_generation"
        ).fetchone() == (1,)
        assert c.execute(
            "SELECT payload FROM pongdang_data.condition_snapshot"
        ).fetchone() == (record["payload"],)


def test_cleanup_spans_multiple_batches_and_retains_complete_sets(database):
    now, revision, record = publication(database)
    for offset, count in ((3, 2005), (2, 1), (1, 1)):
        records = (
            {
                **record,
                "target_start": now + timedelta(minutes=minute),
                "target_end": now + timedelta(minutes=minute + 1),
            }
            for minute in range(count)
        )
        assert (
            publish_conditions(
                database,
                records=records,
                computed_at=now - timedelta(seconds=offset),
                source_revision=revision,
            )
            == count
        )
    with connect(database) as c:
        assert c.execute(
            "SELECT g.record_count,count(s.generation_id) FROM "
            "pongdang_data.condition_generation g LEFT JOIN "
            "pongdang_data.condition_snapshot s ON s.generation_id=g.id "
            "GROUP BY g.id ORDER BY g.id"
        ).fetchall() == [(2005, 0), (1, 1), (1, 1)]


def test_input_race_retries_soon_and_database_timeout_is_identified(database):
    def changed():
        raise ConditionInputsChanged

    job = Job("condition_projection", 600, process=changed)
    assert run_due(database, [job])[0]["error"] == "CONDITION_INPUT_CHANGED"
    with connect(database) as c:
        assert c.execute(
            "SELECT extract(epoch FROM next_run_at-finished_at) FROM "
            "pongdang_data.collection_job WHERE task_name='condition_projection'"
        ).fetchone() == (30,)

    def timeout():
        raise QueryCanceled("query text or credentials must not enter status")

    failed = Job("condition_projection", 600, process=timeout)
    result = run_due(database, [failed], force=True)[0]
    assert result["state"] == "failed"
    assert result["error"] == "DATABASE_STATEMENT_TIMEOUT"


def test_product_projection_precedes_slow_enrichment(database):
    names = [job.name for job in registered_jobs(database)]
    index = names.index("condition_projection")
    assert names.index("kma_nowcast") < index
    assert names.index("khoa_water_temperature") < index
    for name in ("forecast_projection", "water_index_evaluation", "place_details"):
        assert index < names.index(name)
