"""Explicit retirement of the legacy condition result snapshots."""

import asyncio
import sys
from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

import pytest
from psycopg.types.json import Jsonb
from test_condition_score_integration import database as database
from test_condition_score_integration import source, station

from app import schema
from app.data_reader import DataReader
from app.ingestion.storage import store_batch
from app.schema import connect, initialize, retire_condition_snapshots
from app.water_index.condition_api import ConditionQuery
from app.water_index.condition_producer import produce_conditions
from app.water_index.condition_storage import (
    _unavailable,
    projection_due,
    projection_is_current,
    projection_revision,
    publish_conditions,
    read_condition_set,
    repair_condition_result_history,
)

KST = ZoneInfo("Asia/Seoul")


def _legacy_snapshots(settings):
    computed_at = datetime.now(UTC) - timedelta(minutes=5)
    with connect(settings) as connection:
        spot = connection.execute(
            "INSERT INTO pongdang_data.spots_waterspot(name) "
            "VALUES('Disposable retirement fixture') RETURNING id"
        ).fetchone()[0]
        revision = projection_revision(connection)
        generation = connection.execute(
            "INSERT INTO pongdang_data.condition_generation "
            "(source_revision,model_version,computed_at,record_count) "
            "VALUES(%s,'1.0.0',%s,256) RETURNING id",
            [revision, computed_at],
        ).fetchone()[0]
        connection.execute(
            "INSERT INTO pongdang_data.condition_snapshot "
            "(generation_id,spot_id,activity,mode,target_start,target_end,payload) "
            "SELECT %s,%s,'swim','forecast',%s+i*interval '1 minute',"
            "%s+(i+1)*interval '1 minute',jsonb_build_object('fixture',i,'blob',("
            "SELECT string_agg(md5(i::text || ':' || part::text),'') "
            "FROM generate_series(1,64) part)) "
            "FROM generate_series(1,256) i",
            [generation, spot, computed_at, computed_at],
        )
    return spot, revision, generation, computed_at


def test_retirement_refuses_until_a_new_nonempty_result_is_published(database):
    spot, revision, legacy_generation, computed_at = _legacy_snapshots(database)
    with pytest.raises(ValueError, match="newer result generation"):
        retire_condition_snapshots(database)

    with connect(database) as connection:
        empty_generation = connection.execute(
            "INSERT INTO pongdang_data.condition_generation "
            "(source_revision,model_version,computed_at,record_count) "
            "VALUES(%s,'1.0.0',%s,0) RETURNING id",
            [revision, computed_at + timedelta(minutes=1)],
        ).fetchone()[0]
    assert empty_generation > legacy_generation
    with pytest.raises(ValueError, match="newer result generation"):
        retire_condition_snapshots(database)

    with connect(database) as connection:
        connection.execute(
            "UPDATE pongdang_data.condition_generation "
            "SET result_published=true WHERE id=%s",
            [empty_generation],
        )
    with pytest.raises(ValueError, match="nonempty result generation"):
        retire_condition_snapshots(database)

    with connect(database) as connection:
        connection.execute(
            "UPDATE pongdang_data.condition_generation SET record_count=1 WHERE id=%s",
            [empty_generation],
        )
    with pytest.raises(ValueError, match="stored results"):
        retire_condition_snapshots(database)

    published_at = computed_at + timedelta(minutes=2)
    query = ConditionQuery(spot_id=spot, activity="swim", mode="forecast")
    payload = _unavailable(
        query,
        published_at,
        published_at,
        {"latest_generation_id": None, "name": "Disposable retirement fixture"},
    ).model_dump(mode="json")
    assert (
        publish_conditions(
            database,
            records=[
                dict(
                    spot_id=spot,
                    activity="swim",
                    mode="forecast",
                    target_start=published_at,
                    target_end=published_at + timedelta(hours=1),
                    payload=payload,
                )
            ],
            computed_at=published_at,
            source_revision=revision,
        )
        == 1
    )
    with connect(database) as connection:
        before_size = connection.execute(
            "SELECT pg_total_relation_size('pongdang_data.condition_snapshot')"
        ).fetchone()[0]

    assert retire_condition_snapshots(database) == 256
    assert retire_condition_snapshots(database) == 0
    with connect(database) as connection:
        legacy_rows = connection.execute(
            "SELECT count(*) FROM pongdang_data.condition_snapshot"
        ).fetchone()[0]
        result_rows = connection.execute(
            "SELECT count(*) FROM pongdang_data.condition_result"
        ).fetchone()[0]
        after_size = connection.execute(
            "SELECT pg_total_relation_size('pongdang_data.condition_snapshot')"
        ).fetchone()[0]
    assert legacy_rows == 0
    assert result_rows == 1
    assert after_size < before_size


def test_snapshot_only_generation_is_never_treated_as_a_result(database):
    now = datetime.now(UTC) - timedelta(seconds=1)
    store_batch(database, source(fetched_at=now - timedelta(minutes=1)))
    _, spot = station(database)
    day_start = now.astimezone(KST).replace(hour=0, minute=0, second=0, microsecond=0)
    with connect(database) as connection:
        revision = projection_revision(connection)
        legacy_generation, completed = connection.execute(
            "INSERT INTO pongdang_data.condition_generation "
            "(source_revision,model_version,computed_at,record_count) "
            "VALUES(%s,'1.0.0',%s,1) RETURNING id,result_published",
            [revision, now - timedelta(minutes=1)],
        ).fetchone()
        connection.execute(
            "INSERT INTO pongdang_data.condition_snapshot "
            "(generation_id,spot_id,activity,mode,target_start,target_end,payload) "
            "VALUES(%s,%s,'swim','observation',%s,%s,'{}')",
            [legacy_generation, spot, now, now + timedelta(hours=1)],
        )
        assert completed is False
        assert projection_due(connection)
        assert not projection_is_current(connection, revision, day_start)

    assert produce_conditions(database, now=now) > 0
    with connect(database) as connection:
        published_generation = connection.execute(
            "SELECT id FROM pongdang_data.condition_generation "
            "WHERE result_published ORDER BY id DESC LIMIT 1"
        ).fetchone()[0]
        assert published_generation > legacy_generation
        assert not projection_due(connection)
        ignored_generation, completed = connection.execute(
            "INSERT INTO pongdang_data.condition_generation "
            "(source_revision,model_version,computed_at,record_count) "
            "VALUES(%s,'1.0.0',clock_timestamp(),1) "
            "RETURNING id,result_published",
            [revision],
        ).fetchone()
        assert ignored_generation > published_generation
        assert completed is False
        assert not projection_due(connection)
        assert projection_is_current(connection, revision, day_start)

    shown = asyncio.run(
        read_condition_set(
            DataReader(database),
            [ConditionQuery(spot_id=spot, activity="swim", mode="observation")],
            now=now,
        )
    )[0]
    assert shown.projection.generation_id == published_generation


def test_v20_backfill_marks_only_the_completed_result_generation(database):
    with connect(database) as connection:
        spot = connection.execute(
            "INSERT INTO pongdang_data.spots_waterspot(name) "
            "VALUES('Disposable migration fixture') RETURNING id"
        ).fetchone()[0]
        revision = projection_revision(connection)
        computed_at = datetime.now(UTC) - timedelta(minutes=1)
        generation = connection.execute(
            "INSERT INTO pongdang_data.condition_generation "
            "(source_revision,model_version,computed_at,record_count) "
            "VALUES(%s,'1.0.0',%s,1) RETURNING id",
            [revision, computed_at],
        ).fetchone()[0]
        payload = _unavailable(
            ConditionQuery(spot_id=spot, activity="swim", mode="forecast"),
            computed_at,
            computed_at,
            {"latest_generation_id": None, "name": "Disposable migration fixture"},
        ).model_dump(mode="json")
        connection.execute(
            "INSERT INTO pongdang_data.condition_snapshot "
            "(generation_id,spot_id,activity,mode,target_start,target_end,payload) "
            "VALUES(%s,%s,'swim','forecast',%s,%s,%s)",
            [
                generation,
                spot,
                computed_at,
                computed_at + timedelta(hours=1),
                Jsonb(payload),
            ],
        )
        connection.execute(
            "INSERT INTO pongdang_data.condition_snapshot "
            "(generation_id,spot_id,activity,mode,target_start,target_end,payload) "
            "VALUES(%s,%s,'swim','forecast',%s,%s,%s)",
            [
                generation,
                spot,
                computed_at - timedelta(hours=2),
                computed_at - timedelta(hours=1),
                Jsonb(payload),
            ],
        )
        # A real v19 database can already have a hard invalidation, but it has
        # no clock column from which v20 can recover the historical boundary.
        connection.execute(
            "DROP TRIGGER condition_invalidation_clock ON "
            "pongdang_data.condition_source_revision"
        )
        connection.execute("DROP FUNCTION pongdang_data.stamp_condition_invalidation()")
        connection.execute(
            "UPDATE pongdang_data.condition_source_revision "
            "SET revision=revision+1,invalidated_revision=revision+1"
        )
        connection.execute(
            "ALTER TABLE pongdang_data.condition_source_revision "
            "DROP COLUMN invalidated_at"
        )
        connection.execute("DROP TABLE pongdang_data.condition_result")
        connection.execute(
            "ALTER TABLE pongdang_data.condition_generation "
            "DROP COLUMN result_published"
        )
        connection.execute("UPDATE pongdang_data.schema_version SET version=19")

    assert initialize(database)
    with connect(database) as connection:
        assert connection.execute(
            "SELECT result_published FROM pongdang_data.condition_generation "
            "WHERE id=%s",
            [generation],
        ).fetchone() == (True,)
        assert connection.execute(
            "SELECT count(*) FROM pongdang_data.condition_result"
        ).fetchone() == (1,)
        assert connection.execute(
            "SELECT min(target_start) FROM pongdang_data.condition_result"
        ).fetchone() == (computed_at,)
        assert connection.execute(
            "SELECT revision,invalidated_revision,invalidated_at::text "
            "FROM pongdang_data.condition_source_revision WHERE id=1"
        ).fetchone() == (revision + 1, revision + 1, "-infinity")
        assert connection.execute(
            "SELECT to_regclass('pongdang_data.condition_generation_published_idx')"
        ).fetchone()[0]


def test_v20_backfill_and_repair_keep_latest_missing_history(database):
    now = datetime.now(UTC)
    target_start = now - timedelta(hours=3)
    target_end = now - timedelta(hours=2)
    with connect(database) as connection:
        spot = connection.execute(
            "INSERT INTO pongdang_data.spots_waterspot(name) "
            "VALUES('Disposable history fixture') RETURNING id"
        ).fetchone()[0]
        revision = projection_revision(connection)
        generations = []
        for name, computed_at in (
            ("Older legacy result", now - timedelta(minutes=10)),
            ("Latest legacy result", now - timedelta(minutes=5)),
        ):
            generation = connection.execute(
                "INSERT INTO pongdang_data.condition_generation "
                "(source_revision,model_version,computed_at,record_count) "
                "VALUES(%s,'1.0.0',%s,1) RETURNING id",
                [revision, computed_at],
            ).fetchone()[0]
            payload = _unavailable(
                ConditionQuery(spot_id=spot, activity="swim", mode="forecast"),
                target_start,
                computed_at,
                {"latest_generation_id": None, "name": name},
            ).model_dump(mode="json")
            connection.execute(
                "INSERT INTO pongdang_data.condition_snapshot "
                "(generation_id,spot_id,activity,mode,target_start,target_end,payload) "
                "VALUES(%s,%s,'swim','forecast',%s,%s,%s)",
                [generation, spot, target_start, target_end, Jsonb(payload)],
            )
            generations.append(generation)
        connection.execute(
            "DROP TRIGGER condition_invalidation_clock ON "
            "pongdang_data.condition_source_revision"
        )
        connection.execute("DROP FUNCTION pongdang_data.stamp_condition_invalidation()")
        connection.execute(
            "ALTER TABLE pongdang_data.condition_source_revision "
            "DROP COLUMN invalidated_at"
        )
        connection.execute("DROP TABLE pongdang_data.condition_result")
        connection.execute(
            "ALTER TABLE pongdang_data.condition_generation "
            "DROP COLUMN result_published"
        )
        connection.execute("UPDATE pongdang_data.schema_version SET version=19")

    assert initialize(database)

    def stored_history():
        with connect(database) as connection:
            return connection.execute(
                "SELECT generation_id,target_start,target_end,place_name "
                "FROM pongdang_data.condition_result WHERE spot_id=%s "
                "AND target_end<=%s",
                [spot, now],
            ).fetchall()

    expected = [(generations[-1], target_start, target_end, "Latest legacy result")]
    assert stored_history() == expected
    future_start = now + timedelta(hours=1)
    published_at = datetime.now(UTC) - timedelta(seconds=1)
    future_payload = _unavailable(
        ConditionQuery(spot_id=spot, activity="swim", mode="forecast"),
        future_start,
        published_at,
        {"latest_generation_id": None, "name": "Current v20 result"},
    ).model_dump(mode="json")
    assert (
        publish_conditions(
            database,
            records=[
                dict(
                    spot_id=spot,
                    activity="swim",
                    mode="forecast",
                    target_start=future_start,
                    target_end=future_start + timedelta(hours=1),
                    payload=future_payload,
                )
            ],
            computed_at=published_at,
            source_revision=revision,
        )
        == 1
    )

    def future_fingerprint():
        with connect(database) as connection:
            return connection.execute(
                "SELECT generation_id,target_start,target_end,content_digest,ctid "
                "FROM pongdang_data.condition_result WHERE spot_id=%s "
                "AND target_start>=%s",
                [spot, now],
            ).fetchall()

    future_before = future_fingerprint()
    assert len(future_before) == 1
    assert repair_condition_result_history(database) == 0
    assert future_fingerprint() == future_before
    with connect(database) as connection:
        connection.execute(
            "DELETE FROM pongdang_data.condition_result WHERE spot_id=%s "
            "AND target_end<=%s",
            [spot, now],
        )
    assert repair_condition_result_history(database) == 1
    assert repair_condition_result_history(database) == 0
    assert stored_history() == expected
    assert future_fingerprint() == future_before

    shown = asyncio.run(
        read_condition_set(
            DataReader(database),
            [
                ConditionQuery(
                    spot_id=spot,
                    activity="swim",
                    mode="forecast",
                    at=target_start + timedelta(minutes=30),
                    as_of=now,
                )
            ],
            now=now,
        )
    )[0]
    assert shown.place_name == "Latest legacy result"
    assert shown.projection.generation_id == generations[-1]


def test_retirement_requires_schema_v20_even_when_legacy_table_is_empty(database):
    with connect(database) as connection:
        connection.execute("UPDATE pongdang_data.schema_version SET version=19")
    with pytest.raises(ValueError, match="requires schema v20"):
        retire_condition_snapshots(database)


def test_retirement_cli_keeps_existing_initialize_message(monkeypatch, capsys):
    marker = object()
    monkeypatch.setattr(schema, "Settings", lambda: marker)
    monkeypatch.setattr(schema, "initialize", lambda settings: False)
    monkeypatch.setattr(sys, "argv", ["schema", "--initialize"])
    schema.main()
    assert capsys.readouterr().out == "Pongdang schema already initialized\n"

    monkeypatch.setattr(schema, "retire_condition_snapshots", lambda settings: 7)
    monkeypatch.setattr(sys, "argv", ["schema", "--retire-condition-snapshots"])
    schema.main()
    assert capsys.readouterr().out == "Pongdang condition snapshots retired: 7\n"
