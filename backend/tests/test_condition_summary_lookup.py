"""Ordered summary lookups preserve publication, cutoff and invalidation rules."""

import asyncio
import os
from datetime import UTC, datetime, timedelta

import pytest
from fastapi import HTTPException

from app.config import Settings
from app.data_reader import DataReader
from app.ingestion.models import Place, SourceBatch
from app.ingestion.storage import store_batch
from app.schema import connect, initialize
from app.water_index.condition_api import ConditionQuery
from app.water_index.condition_result import RESULT_COLUMNS
from app.water_index.condition_storage import (
    _copy_result_batch,
    _create_result_stage,
    _unavailable,
    projection_revision,
    read_condition_set,
    read_condition_summaries,
)
from app.water_index.conditions import summarize_conditions


@pytest.fixture
def database():
    settings = Settings(_env_file=None)
    if (
        os.environ.get("PONGDANG_TEST_DISPOSABLE") != "1"
        or settings.postgres_host != "127.0.0.1"
        or settings.postgres_db != "pongdang_test"
    ):
        pytest.fail("Summary lookups require a disposable loopback pongdang_test")
    initialize(settings)
    try:
        yield settings
    finally:
        with connect(settings) as connection:
            connection.execute("DROP SCHEMA pongdang_data CASCADE")


def test_summary_lookup_keeps_valid_predecessors_and_historical_boundaries(database):
    now = datetime.now(UTC)
    store_batch(
        database,
        SourceBatch(
            provider="TOURAPI_KOREAN",
            fetched_at=now,
            places=[
                Place(
                    source_id=f"summary-fixture-{index}",
                    name=f"Disposable summary place {index}",
                    kind="beach",
                    latitude=37.5 + index / 1000,
                    longitude=129,
                )
                for index in range(25)
            ],
        ),
    )
    with connect(database) as connection:
        spots = [
            row[0]
            for row in connection.execute(
                "SELECT id FROM pongdang_data.spots_waterspot ORDER BY id"
            ).fetchall()
        ]
        assert len(spots) == 25
        revision = projection_revision(connection)
        generations = []
        for offset, source_revision, published, model in (
            (5, revision, True, "1.0.0"),
            (4, revision - 1, True, "1.0.0"),
            (3, revision, False, "1.0.0"),
            (2, revision, True, "other-model"),
            (1, revision, True, "1.0.0"),
        ):
            generations.append(
                connection.execute(
                    "INSERT INTO pongdang_data.condition_generation "
                    "(source_revision,model_version,computed_at,record_count,"
                    "result_published) VALUES (%s,%s,%s,0,%s) RETURNING id",
                    [
                        source_revision,
                        model,
                        now - timedelta(hours=offset),
                        published,
                    ],
                ).fetchone()[0]
            )
        connection.execute(
            "UPDATE pongdang_data.condition_source_revision "
            "SET invalidated_revision=%s WHERE id=1",
            [revision],
        )
        connection.execute(
            "UPDATE pongdang_data.condition_source_revision "
            "SET invalidated_at=%s WHERE id=1",
            [now - timedelta(hours=2)],
        )
        _create_result_stage(connection)

        def record(spot, mode, start, end, label):
            return dict(
                spot_id=spot,
                activity="swim",
                mode=mode,
                target_start=start,
                target_end=end,
                payload=_unavailable(
                    ConditionQuery(spot_id=spot, activity="swim", mode=mode),
                    start,
                    now,
                    {"latest_generation_id": None, "name": label},
                ).model_dump(mode="json"),
            )

        # Newer rows are deliberately ineligible. LIMIT 1 before generation
        # checks would hide the valid expired observation predecessor.
        for index, label in enumerate(
            ("eligible", "revoked", "unpublished", "wrong-model")
        ):
            _copy_result_batch(
                connection,
                [
                    record(
                        spot,
                        "observation",
                        now - timedelta(hours=4 - index),
                        now - timedelta(hours=3 - index),
                        label,
                    )
                    for spot in spots
                ],
                generations[index],
            )
        _copy_result_batch(
            connection,
            [
                record(
                    spots[0],
                    "forecast",
                    now - timedelta(hours=4),
                    now + timedelta(hours=2),
                    "forecast",
                )
            ],
            generations[0],
        )
        connection.execute(
            "INSERT INTO pongdang_data.condition_result (" + RESULT_COLUMNS + ") "
            "SELECT " + RESULT_COLUMNS + " FROM condition_result_stage"
        )

    def query(spot, **extra):
        return ConditionQuery(spot_id=spot, activity="swim", **extra)

    queries = [query(spot, mode="observation") for spot in reversed(spots)]
    queries.extend(
        [
            query(
                spots[0], mode="observation", at=now - timedelta(hours=3, minutes=30)
            ),
            query(
                spots[0], mode="observation", at=now - timedelta(hours=2, minutes=30)
            ),
            query(spots[0], mode="observation", at=now - timedelta(hours=2)),
            query(spots[0], mode="forecast", at=now + timedelta(hours=1)),
            query(spots[0], mode="forecast", at=now + timedelta(hours=2)),
            query(
                spots[0],
                mode="forecast",
                at=now + timedelta(hours=1),
                as_of=now - timedelta(hours=2),
            ),
            query(999999999, mode="observation"),
        ]
    )
    reader = DataReader(database)
    details = asyncio.run(read_condition_set(reader, queries, now=now))
    summaries = asyncio.run(read_condition_summaries(reader, queries, now=now))
    for detail, summary in zip(details, summaries, strict=True):
        if isinstance(detail, HTTPException):
            assert isinstance(summary, HTTPException)
            assert (summary.status_code, summary.detail) == (
                detail.status_code,
                detail.detail,
            )
        else:
            assert summary.model_dump(mode="json") == summarize_conditions(
                detail
            ).model_dump(mode="json")
    assert [row.spot_id for row in summaries[:25]] == list(reversed(spots))
    assert all(row.place_name == "eligible" for row in summaries[:25])
    assert summaries[25].place_name == "eligible"
    assert summaries[26].place_name == "revoked"
    assert summaries[27].retention_allowed is False
    assert summaries[28].place_name == "forecast"
    assert summaries[29].retention_allowed is False
    assert summaries[30].retention_allowed is False

    with connect(database) as connection:
        connection.execute(
            "UPDATE pongdang_data.condition_source_revision "
            "SET invalidated_revision=revision+1 WHERE id=1"
        )
    blocked = asyncio.run(read_condition_summaries(reader, queries[:25], now=now))
    assert all(row.retention_allowed is False for row in blocked)
