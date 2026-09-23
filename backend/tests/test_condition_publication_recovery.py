"""Large condition publication stays atomic without blocking source updates."""

from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from psycopg.errors import QueryCanceled
from test_condition_score_integration import database as database
from test_condition_score_integration import source, station

from app.ingestion.jobs import Job
from app.ingestion.models import Value
from app.ingestion.storage import store_batch
from app.ingestion.worker import registered_jobs, run_due
from app.main import create_app
from app.schema import connect
from app.water_index import condition_storage
from app.water_index.condition_api import ConditionQuery
from app.water_index.condition_producer import produce_conditions
from app.water_index.condition_storage import (
    ConditionInputsChanged,
    _unavailable,
    projection_revision,
    publish_conditions,
)


def publication(database):
    store_batch(database, source())
    _, spot = station(database)
    now = datetime.now(UTC)
    with connect(database) as c:
        revision = projection_revision(c)
    payload = _unavailable(
        ConditionQuery(spot_id=spot, activity="swim", mode="observation"),
        now,
        now,
        {"latest_generation_id": None, "name": "Disposable place"},
    ).model_dump(mode="json")
    return (
        now,
        revision,
        {
            "spot_id": spot,
            "activity": "swim",
            "mode": "observation",
            "target_start": now,
            "target_end": now + timedelta(minutes=1),
            "payload": payload,
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
        assert c.execute(
            "SELECT count(*) FROM pongdang_data.condition_result"
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
            c.execute(
                "UPDATE pongdang_data.spots_waterspot SET name=name || ' revised'"
            )

    with pytest.raises(ConditionInputsChanged):
        publish_conditions(
            database, records=records(), computed_at=now, source_revision=revision
        )
    assert_unpublished(database)


def test_complete_iterator_records_committed_count(database):
    now, revision, record = publication(database)
    record["payload"]["place_name"] = "경포 🌊"
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
            "SELECT place_name FROM pongdang_data.condition_result"
        ).fetchone() == ("경포 🌊",)


@pytest.mark.parametrize("fail_after_merge", [False, True])
def test_readers_keep_complete_scores_during_publish_and_rollback(
    database, monkeypatch, fail_after_merge
):
    store_batch(database, source())
    _, spot = station(database)
    assert produce_conditions(database) > 0
    params = dict(spot_id=spot, activity="swim", mode="observation")
    endpoint = "/api/data/water-index/conditions"
    with TestClient(create_app(database)) as client:
        first = client.get(endpoint, params=params).json()
        store_batch(
            database,
            source(
                source_id="updated-weather",
                observed_at=datetime.now(UTC) - timedelta(minutes=1),
                values=[Value(name="air_temperature", numeric_value=28, unit="degC")],
            ),
        )
        merge = condition_storage._merge_result_stage
        observed = []

        def read_before_commit(connection, computed_at):
            reused = merge(connection, computed_at)
            # The publisher has already replaced result rows in its open
            # transaction. An independent HTTP read must still see the old set
            # without waiting for the writer or recalculating anything.
            response = client.get(endpoint, params=params)
            assert response.status_code == 200, response.text
            body = response.json()
            assert body["condition_score"] == first["condition_score"]
            assert (
                body["projection"]["generation_id"]
                == first["projection"]["generation_id"]
            )
            assert body["projection"]["status"] == "ready"
            assert body["projection"]["refresh_after"] is None
            summary = client.get(
                endpoint + "/summary",
                params=dict(spot_ids=str(spot), activity="swim"),
            )
            assert summary.status_code == 200, summary.text
            assert (
                summary.json()["rows"][0]["condition_score"] == first["condition_score"]
            )
            observed.append(body)
            if fail_after_merge:
                raise RuntimeError("Publication interrupted before commit")
            return reused

        monkeypatch.setattr(
            condition_storage, "_merge_result_stage", read_before_commit
        )
        if fail_after_merge:
            with pytest.raises(RuntimeError, match="Publication interrupted"):
                produce_conditions(database)
        else:
            assert produce_conditions(database) > 0
        assert len(observed) == 1
        after = client.get(endpoint, params=params).json()
        assert after["projection"]["status"] == "ready"
        assert after["projection"]["refresh_after"] is None
        if fail_after_merge:
            assert after["condition_score"] == first["condition_score"]
            assert (
                after["projection"]["generation_id"]
                == first["projection"]["generation_id"]
            )
        else:
            assert (
                after["condition_score"]["score"] != first["condition_score"]["score"]
            )
            assert (
                after["projection"]["generation_id"]
                != first["projection"]["generation_id"]
            )


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
            "SELECT g.record_count,g.reused_count FROM "
            "pongdang_data.condition_generation g "
            "GROUP BY g.id ORDER BY g.id"
        ).fetchall() == [(2005, 0), (1, 1), (1, 1)]
        assert c.execute(
            "SELECT count(*) FROM pongdang_data.condition_snapshot"
        ).fetchone() == (0,)
        assert c.execute(
            "SELECT count(*) FROM pongdang_data.condition_result"
        ).fetchone() == (1,)


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
