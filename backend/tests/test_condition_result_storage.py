"""Bounded published result history on the disposable Pongdang database."""

import asyncio
from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

from psycopg.rows import dict_row
from test_condition_score_integration import database as database
from test_condition_score_integration import source, station

from app.data_reader import DataReader
from app.ingestion.storage import store_batch
from app.schema import connect
from app.water_index.condition_api import ConditionQuery
from app.water_index.condition_producer import produce_conditions
from app.water_index.condition_result import (
    DETAIL_FIELDS,
    content_digest,
    result_payload,
)
from app.water_index.condition_storage import (
    _unavailable,
    projection_revision,
    prune_condition_results,
    publish_conditions,
    read_condition_set,
    read_condition_summaries,
)

KST = ZoneInfo("Asia/Seoul")


def test_retention_runs_without_a_new_publication(database):
    store_batch(database, source())
    _, spot = station(database)
    published_at = datetime.now(UTC) - timedelta(seconds=1)
    with connect(database) as connection:
        revision = projection_revision(connection)
    activities = ("swim", "surf", "relax", "mudflat", "onsen", "rafting")
    records = []
    for activity in activities:
        payload = _unavailable(
            ConditionQuery(spot_id=spot, activity=activity, mode="observation"),
            published_at,
            published_at,
            {"latest_generation_id": None, "name": "Disposable place"},
        ).model_dump(mode="json")
        records.append(
            dict(
                spot_id=spot,
                activity=activity,
                mode="observation",
                target_start=published_at,
                target_end=published_at + timedelta(hours=1),
                payload=payload,
            )
        )
    assert publish_conditions(
        database,
        records=records,
        computed_at=published_at,
        source_revision=revision,
    ) == len(records)
    with connect(database) as connection:
        today = connection.execute("SELECT clock_timestamp()").fetchone()[0]
        today = today.astimezone(KST).replace(hour=0, minute=0, second=0, microsecond=0)
        cutoff = today - timedelta(days=7)
        future_end = today + timedelta(days=8)
        bounds = {
            "swim": (cutoff - timedelta(hours=2), cutoff - timedelta(hours=1)),
            "surf": (cutoff - timedelta(hours=1), cutoff + timedelta(hours=1)),
            "relax": (future_end - timedelta(hours=1), future_end + timedelta(hours=1)),
            "mudflat": (
                future_end + timedelta(hours=1),
                future_end + timedelta(hours=2),
            ),
            "onsen": (cutoff, cutoff + timedelta(hours=1)),
            "rafting": (future_end - timedelta(hours=1), future_end),
        }
        for activity, (begin, end) in bounds.items():
            connection.execute(
                "UPDATE pongdang_data.condition_result "
                "SET target_start=%s,target_end=%s "
                "WHERE spot_id=%s AND activity=%s",
                [begin, end, spot, activity],
            )
        generation_count = connection.execute(
            "SELECT count(*) FROM pongdang_data.condition_generation"
        ).fetchone()[0]
        evidence_count = connection.execute(
            "SELECT count(*) FROM pongdang_data.conditions_observationsnapshot"
        ).fetchone()[0]
    assert prune_condition_results(database) == 4
    assert prune_condition_results(database) == 0
    with connect(database) as connection:
        rows = connection.execute(
            "SELECT activity,target_start,target_end "
            "FROM pongdang_data.condition_result ORDER BY activity"
        ).fetchall()
        assert rows == [
            ("onsen", cutoff, cutoff + timedelta(hours=1)),
            ("rafting", future_end - timedelta(hours=1), future_end),
            ("relax", future_end - timedelta(hours=1), future_end),
            ("surf", cutoff, cutoff + timedelta(hours=1)),
        ]
        assert (
            connection.execute(
                "SELECT count(*) FROM pongdang_data.condition_generation"
            ).fetchone()[0]
            == generation_count
        )
        assert (
            connection.execute(
                "SELECT count(*) FROM pongdang_data.conditions_observationsnapshot"
            ).fetchone()[0]
            == evidence_count
        )


def test_identical_republication_reuses_detail_json(database):
    first_at = datetime.now(UTC) - timedelta(minutes=2)
    store_batch(database, source(fetched_at=first_at - timedelta(minutes=1)))
    _, spot = station(database)
    assert produce_conditions(database, now=first_at) > 0
    with connect(database) as connection:
        with connection.cursor(row_factory=dict_row) as cursor:
            previous = cursor.execute(
                "SELECT *,ctid AS heap_id FROM pongdang_data.condition_result "
                "WHERE spot_id=%s AND activity='swim' AND mode='observation' "
                "ORDER BY target_start",
                [spot],
            ).fetchall()
        columns = {
            row[0]
            for row in connection.execute(
                "SELECT column_name FROM information_schema.columns "
                "WHERE table_schema='pongdang_data' "
                "AND table_name='condition_result'"
            ).fetchall()
        }
        assert "detail" in columns
        assert set(DETAIL_FIELDS).isdisjoint(columns)
        assert set(previous[0]["detail"]) == set(DETAIL_FIELDS)
        revision = projection_revision(connection)
        # This ordinary input revision does not revoke the earlier publication.
        connection.execute(
            "UPDATE pongdang_data.conditions_observationmetric "
            "SET numeric_value=numeric_value+1"
        )
        revision = projection_revision(connection)
    records = [
        dict(
            spot_id=row["spot_id"],
            activity=row["activity"],
            mode=row["mode"],
            target_start=row["target_start"],
            target_end=row["target_end"],
            payload=result_payload(row),
        )
        for row in previous
    ]
    assert all(
        content_digest(record["payload"]) == row["content_digest"]
        for record, row in zip(records, previous, strict=True)
    )
    second_at = first_at + timedelta(minutes=1)
    assert publish_conditions(
        database,
        records=records,
        computed_at=second_at,
        source_revision=revision,
    ) == len(records)
    with connect(database) as connection:
        latest = connection.execute(
            "SELECT id,reused_count FROM pongdang_data.condition_generation "
            "ORDER BY id DESC LIMIT 1"
        ).fetchone()
        with connection.cursor(row_factory=dict_row) as cursor:
            current = cursor.execute(
                "SELECT *,ctid AS heap_id FROM pongdang_data.condition_result "
                "WHERE spot_id=%s AND activity='swim' AND mode='observation' "
                "ORDER BY target_start",
                [spot],
            ).fetchall()
    assert latest[1] == len(previous)
    assert [row["generation_id"] for row in current] == [
        row["generation_id"] for row in previous
    ]
    assert [row["heap_id"] for row in current] == [row["heap_id"] for row in previous]
    assert [row["content_digest"] for row in current] == [
        row["content_digest"] for row in previous
    ]
    shown = asyncio.run(
        read_condition_set(
            DataReader(database),
            [ConditionQuery(spot_id=spot, activity="swim", mode="observation")],
        )
    )[0]
    assert shown.projection.generation_id == latest[0]
    assert shown.projection.status == "ready"


def test_kst_d8_results_are_deleted_and_crossing_interval_is_clipped(database):
    store_batch(database, source())
    _, spot = station(database)
    today = (
        datetime.now(UTC)
        .astimezone(KST)
        .replace(hour=0, minute=0, second=0, microsecond=0)
    )
    cutoff = today - timedelta(days=7)
    old_at = cutoff - timedelta(hours=4)
    with connect(database) as connection:
        revision = projection_revision(connection)

    def record(activity, start, end, computed_at):
        query = ConditionQuery(spot_id=spot, activity=activity, mode="observation")
        payload = _unavailable(
            query,
            computed_at,
            computed_at,
            {"latest_generation_id": None, "name": "Disposable place"},
        ).model_dump(mode="json")
        return dict(
            spot_id=spot,
            activity=activity,
            mode="observation",
            target_start=start,
            target_end=end,
            payload=payload,
        )

    assert (
        publish_conditions(
            database,
            records=[
                record(
                    "swim",
                    cutoff - timedelta(hours=3),
                    cutoff - timedelta(hours=2),
                    old_at,
                ),
                record(
                    "swim",
                    cutoff - timedelta(hours=1),
                    cutoff + timedelta(hours=1),
                    old_at,
                ),
            ],
            computed_at=old_at,
            source_revision=revision,
        )
        == 2
    )
    with connect(database) as connection:
        assert connection.execute(
            "SELECT target_start,target_end FROM pongdang_data.condition_result "
            "WHERE spot_id=%s AND activity='swim' ORDER BY target_start",
            [spot],
        ).fetchall() == [(cutoff, cutoff + timedelta(hours=1))]
    current_at = datetime.now(UTC)
    assert (
        publish_conditions(
            database,
            records=[
                record("surf", current_at, current_at + timedelta(hours=1), current_at)
            ],
            computed_at=current_at,
            source_revision=revision,
        )
        == 1
    )
    with connect(database) as connection:
        rows = connection.execute(
            "SELECT target_start,target_end FROM pongdang_data.condition_result "
            "WHERE spot_id=%s AND activity='swim' ORDER BY target_start",
            [spot],
        ).fetchall()
        assert rows == [(cutoff, cutoff + timedelta(hours=1))]
        assert connection.execute(
            "SELECT count(*) FROM pongdang_data.condition_result "
            "WHERE target_start<%s OR target_end<=%s",
            [cutoff, cutoff],
        ).fetchone() == (0,)


def test_only_changed_future_interval_rewrites_detail(database):
    store_batch(database, source())
    _, spot = station(database)
    start = datetime.now(UTC) + timedelta(hours=1)
    first_at = datetime.now(UTC) - timedelta(minutes=2)
    with connect(database) as connection:
        revision = projection_revision(connection)

    def rows(names):
        for index, name in enumerate(names):
            payload = _unavailable(
                ConditionQuery(spot_id=spot, activity="swim", mode="forecast"),
                first_at,
                first_at,
                {"latest_generation_id": None, "name": name},
            ).model_dump(mode="json")
            yield dict(
                spot_id=spot,
                activity="swim",
                mode="forecast",
                target_start=start + timedelta(hours=index),
                target_end=start + timedelta(hours=index + 1),
                payload=payload,
            )

    assert (
        publish_conditions(
            database,
            records=rows(("첫째", "둘째", "셋째")),
            computed_at=first_at,
            source_revision=revision,
        )
        == 3
    )
    with connect(database) as connection:
        original = connection.execute(
            "SELECT generation_id,content_digest FROM "
            "pongdang_data.condition_result ORDER BY target_start"
        ).fetchall()
    assert (
        publish_conditions(
            database,
            records=rows(("첫째", "변경", "셋째")),
            computed_at=first_at + timedelta(minutes=1),
            source_revision=revision,
        )
        == 3
    )
    with connect(database) as connection:
        latest = connection.execute(
            "SELECT id,reused_count FROM pongdang_data.condition_generation "
            "ORDER BY id DESC LIMIT 1"
        ).fetchone()
        result = connection.execute(
            "SELECT generation_id,content_digest "
            "FROM pongdang_data.condition_result ORDER BY target_start"
        ).fetchall()
    assert latest[1] == 2
    assert [row[0] for row in result] == [original[0][0], latest[0], original[2][0]]
    assert result[0][1] == original[0][1]
    assert result[2][1] == original[2][1]
    broad = next(rows(("첫째",)))
    broad["target_end"] = start + timedelta(hours=3)
    assert (
        publish_conditions(
            database,
            records=[broad],
            computed_at=first_at + timedelta(seconds=90),
            source_revision=revision,
        )
        == 1
    )
    with connect(database) as connection:
        latest = connection.execute(
            "SELECT id,reused_count FROM pongdang_data.condition_generation "
            "ORDER BY id DESC LIMIT 1"
        ).fetchone()
        result = connection.execute(
            "SELECT generation_id,place_name "
            "FROM pongdang_data.condition_result ORDER BY target_start"
        ).fetchall()
    assert latest[1] == 1
    assert result == [
        (original[0][0], "첫째"),
        (latest[0], "첫째"),
        (latest[0], "첫째"),
    ]


def test_hard_invalidation_gap_and_two_publications_never_revive_old_score(database):
    store_batch(database, source())
    _, spot = station(database)
    assert produce_conditions(database) > 0
    with connect(database) as connection:
        original = connection.execute(
            "SELECT condition_score FROM pongdang_data.condition_result "
            "WHERE spot_id=%s AND activity='swim' AND mode='observation' "
            "ORDER BY target_start DESC LIMIT 1",
            [spot],
        ).fetchone()[0]
        assert original["score"] is not None
        connection.execute(
            "UPDATE pongdang_data.spots_waterspot SET name=name || ' corrected' "
            "WHERE id=%s",
            [spot],
        )
        revision = projection_revision(connection)
        invalidated_at = connection.execute(
            "SELECT invalidated_at FROM pongdang_data.condition_source_revision "
            "WHERE id=1"
        ).fetchone()[0]
        connection.execute(
            "UPDATE pongdang_data.spots_waterspot SET name=name || ' again' "
            "WHERE id=%s",
            [spot],
        )
        revision = projection_revision(connection)
        assert (
            connection.execute(
                "SELECT invalidated_at FROM pongdang_data.condition_source_revision "
                "WHERE id=1"
            ).fetchone()[0]
            == invalidated_at
        )

    pending = asyncio.run(
        read_condition_set(
            DataReader(database),
            [ConditionQuery(spot_id=spot, activity="swim", mode="observation")],
        )
    )[0]
    assert pending.condition_score.score is None
    assert pending.projection.status == "pending"

    def unknown_record(at):
        payload = _unavailable(
            ConditionQuery(spot_id=spot, activity="swim", mode="observation"),
            at,
            at,
            {"latest_generation_id": None, "name": "Corrected place"},
        ).model_dump(mode="json")
        return dict(
            spot_id=spot,
            activity="swim",
            mode="observation",
            target_start=at,
            target_end=at + timedelta(hours=1),
            payload=payload,
        )

    first_at = datetime.now(UTC)
    assert first_at > invalidated_at
    assert (
        publish_conditions(
            database,
            records=[unknown_record(first_at)],
            computed_at=first_at,
            source_revision=revision,
        )
        == 1
    )
    gap_at = invalidated_at + (first_at - invalidated_at) / 2
    first_gap = asyncio.run(
        read_condition_set(
            DataReader(database),
            [
                ConditionQuery(
                    spot_id=spot,
                    activity="swim",
                    mode="observation",
                    at=gap_at,
                )
            ],
        )
    )[0]
    assert first_gap.condition_score.score is None
    second_at = datetime.now(UTC)
    assert (
        publish_conditions(
            database,
            records=[unknown_record(second_at)],
            computed_at=second_at,
            source_revision=revision,
        )
        == 1
    )
    shown = asyncio.run(
        read_condition_set(
            DataReader(database),
            [
                ConditionQuery(
                    spot_id=spot,
                    activity="swim",
                    mode="observation",
                    at=gap_at,
                ),
                ConditionQuery(spot_id=spot, activity="swim", mode="observation"),
            ],
        )
    )
    assert shown[0].condition_score.score is None
    assert shown[1].condition_score.score is None
    assert shown[1].projection.status == "ready"


def test_missing_key_after_hard_invalidation_does_not_revive_old_score(database):
    store_batch(database, source())
    _, spot = station(database)
    assert produce_conditions(database) > 0
    with connect(database) as connection:
        old_score = connection.execute(
            "SELECT condition_score FROM pongdang_data.condition_result "
            "WHERE spot_id=%s AND activity='swim' AND mode='observation' "
            "ORDER BY target_start DESC LIMIT 1",
            [spot],
        ).fetchone()[0]["score"]
        assert old_score is not None
        connection.execute(
            "UPDATE pongdang_data.spots_waterspot SET name=name || ' corrected' "
            "WHERE id=%s",
            [spot],
        )
        revision = projection_revision(connection)
        invalidated_at = connection.execute(
            "SELECT invalidated_at FROM pongdang_data.condition_source_revision "
            "WHERE id=1"
        ).fetchone()[0]

    published_at = datetime.now(UTC)
    payload = _unavailable(
        ConditionQuery(spot_id=spot, activity="surf", mode="observation"),
        published_at,
        published_at,
        {"latest_generation_id": None, "name": "Corrected place"},
    ).model_dump(mode="json")
    assert (
        publish_conditions(
            database,
            records=[
                dict(
                    spot_id=spot,
                    activity="surf",
                    mode="observation",
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
        assert connection.execute(
            "SELECT target_end FROM pongdang_data.condition_result "
            "WHERE spot_id=%s AND activity='swim' AND mode='observation' "
            "ORDER BY target_start DESC LIMIT 1",
            [spot],
        ).fetchone() == (invalidated_at,)

    query = ConditionQuery(spot_id=spot, activity="swim", mode="observation")
    detail = asyncio.run(read_condition_set(DataReader(database), [query]))[0]
    summary = asyncio.run(read_condition_summaries(DataReader(database), [query]))[0]
    assert detail.condition_score.status == "unavailable"
    assert detail.condition_score.score is None
    assert detail.projection.status == "pending"
    assert detail.projection.retention_allowed is False
    assert summary.condition_score.status == "unavailable"
    assert summary.condition_score.score is None
    assert summary.retention_allowed is False
