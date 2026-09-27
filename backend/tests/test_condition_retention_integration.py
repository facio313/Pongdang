"""DB publications retain real values across expiry, restarts and partial refreshes."""

import asyncio
from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from test_condition_score_integration import database as database
from test_condition_score_integration import source, station

from app.data_reader import DataReader
from app.ingestion.models import Value
from app.ingestion.storage import store_batch
from app.main import create_app
from app.schema import connect, initialize
from app.water_index import condition_retention
from app.water_index.condition_api import ConditionQuery
from app.water_index.condition_producer import produce_conditions
from app.water_index.condition_result import RESULT_COLUMNS
from app.water_index.condition_storage import (
    _copy_result_batch,
    _create_result_stage,
    _unavailable,
    projection_revision,
    read_condition_set,
)

BASE = "/api/data/water-index"


def read(settings, spot, now):
    return asyncio.run(
        read_condition_set(
            DataReader(settings),
            [ConditionQuery(spot_id=spot, activity="swim", mode="observation")],
            now=now,
        )
    )[0]


def test_expired_snapshot_survives_multiple_publications_and_new_clients(database):
    now = datetime.now(UTC)
    original = source(
        fetched_at=now - timedelta(hours=4),
        observed_at=now - timedelta(hours=4, minutes=5),
        valid_until=now - timedelta(hours=3),
        values=[
            Value(name="air_temperature", numeric_value=22, unit="degC"),
            Value(name="wind_speed", numeric_value=2, unit="m/s"),
        ],
    )
    store_batch(database, original)
    _, spot = station(database)
    produce_conditions(database, now=original.fetched_at)
    first = read(database, spot, original.fetched_at)
    assert first.condition_score.available_components == 2
    # Each subsequent collection only has one component. Publish its new value
    # while retaining the independent wind component and original provenance.
    for offset in (3, 2, 1):
        fetched = now - timedelta(hours=offset)
        store_batch(
            database,
            source(
                source_id=f"partial-{offset}",
                fetched_at=fetched,
                observed_at=fetched - timedelta(minutes=1),
                values=[Value(name="air_temperature", numeric_value=26, unit="degC")],
            ),
        )
        assert produce_conditions(database, now=fetched) > 0
        latest = read(database, spot, fetched)
        assert latest.condition_score.score == 100.0
        assert latest.condition_score.available_components == 2
        components = {c.metric: c for c in latest.condition_score.components}
        assert components["air_temperature"].value == 26.0
        assert components["wind_speed"].value == 2.0
        wind = next(m for m in latest.metrics if m.name == "wind_speed")
        assert wind.status == "stale"
        assert wind.evidence[0].observed_at == original.readings[0].observed_at
    with connect(database) as c:
        assert c.execute(
            "SELECT count(*) FROM pongdang_data.condition_snapshot "
            "WHERE generation_id=%s",
            [first.projection.generation_id],
        ).fetchone() == (0,)
    with TestClient(create_app(database)) as client:
        params = dict(spot_id=spot, activity="swim", mode="observation")
        body = client.get(BASE + "/conditions", params=params).json()
        assert body["condition_score"] == latest.condition_score.model_dump(mode="json")
        assert body["retained"] is True
        assert body["retained_at"] == latest.retained_at.isoformat().replace(
            "+00:00", "Z"
        )
        assert body["projection"]["status"] == "ready"
        assert body["projection"]["refresh_after"] is None
        summary = client.get(
            BASE + "/conditions/summary",
            params=dict(spot_ids=str(spot), activity="swim"),
        ).json()["rows"][0]
        assert summary["condition_score"] == body["condition_score"]
        assert summary["retained"] is True
        recommendation = client.get(BASE + "/recommendation", params=dict(spot_id=spot))
        assert recommendation.status_code == 200
        swim = next(
            c for c in recommendation.json()["conditions"] if c["activity"] == "swim"
        )
        assert swim["condition_score"] == body["condition_score"]
    # Collector downtime beyond the precomputed observation horizon still reads
    # the saved observation, without relabelling it as a new measurement.
    later = read(database, spot, now + timedelta(days=9))
    assert later.condition_score == latest.condition_score
    assert later.retained_at == latest.retained_at


def test_complete_lower_score_replaces_retained_values(database):
    now = datetime.now(UTC)
    store_batch(database, source(observed_at=now - timedelta(minutes=10)))
    _, spot = station(database)
    produce_conditions(database)
    first = read(database, spot, datetime.now(UTC))
    store_batch(
        database,
        source(
            source_id="lower-score",
            observed_at=now - timedelta(minutes=1),
            values=[Value(name="air_temperature", numeric_value=10, unit="degC")],
        ),
    )
    produce_conditions(database)
    current = read(database, spot, datetime.now(UTC))
    assert current.condition_score.score < first.condition_score.score
    assert current.metrics[0].value == 10
    assert current.retained is False


def test_v17_upgrade_preserves_publication_and_classifies_source_corrections(database):
    store_batch(database, source())
    _, spot = station(database)
    produce_conditions(database)
    first = read(database, spot, datetime.now(UTC))
    with connect(database) as c:
        c.execute("UPDATE pongdang_data.schema_version SET version=17")
    assert initialize(database)
    assert not initialize(database)
    with connect(database) as c:
        c.execute(
            "UPDATE pongdang_data.conditions_observationmetric SET numeric_value=21"
        )
    pending = read(database, spot, datetime.now(UTC))
    assert pending.condition_score == first.condition_score
    assert pending.projection.status == "ready"
    assert pending.projection.refresh_after is None
    assert pending.projection.retention_allowed is True


def test_station_validity_refresh_keeps_previous_observation(database):
    store_batch(database, source())
    _, spot = station(database)
    produce_conditions(database)
    first = read(database, spot, datetime.now(UTC))
    with connect(database) as c:
        c.execute(
            "UPDATE pongdang_data.collection_station SET "
            "source_valid_until=now()-interval '1 minute'"
        )
    pending = read(database, spot, datetime.now(UTC))
    assert pending.condition_score == first.condition_score
    assert pending.projection.retention_allowed is True
    assert produce_conditions(database) > 0
    current = read(database, spot, datetime.now(UTC))
    assert current.condition_score == first.condition_score


def test_forecast_retention_is_scoped_to_original_target_interval(database):
    now = datetime.now(UTC)
    start = now + timedelta(hours=1)
    original = source(
        source_id="forecast",
        mode="forecast",
        observed_at=start,
        valid_until=start + timedelta(hours=1),
        issued_at=now - timedelta(hours=1),
    )
    store_batch(database, original)
    _, spot = station(database)
    produce_conditions(database)
    queries = [
        ConditionQuery(spot_id=spot, activity="swim", mode="forecast", at=at)
        for at in (start, start + timedelta(minutes=30), start + timedelta(hours=2))
    ]
    before = asyncio.run(read_condition_set(DataReader(database), queries))
    store_batch(
        database,
        original.model_copy(
            update={
                "fetched_at": datetime.now(UTC),
                "readings": [
                    original.readings[0].model_copy(
                        update={
                            "valid_until": start + timedelta(hours=3),
                            "values": [
                                Value(
                                    name="air_temperature",
                                    unit="degC",
                                    missing=True,
                                    mode="forecast",
                                )
                            ],
                        }
                    )
                ],
            }
        ),
    )
    produce_conditions(database)
    after = asyncio.run(read_condition_set(DataReader(database), queries))
    assert after[0].condition_score == before[0].condition_score
    assert after[1].condition_score == before[1].condition_score
    assert after[0].retained and after[1].retained
    assert after[0].at == start
    assert after[1].at == start + timedelta(minutes=30)
    assert after[2].condition_score.score is None


@pytest.mark.parametrize("at_boundary", [False, True])
def test_retention_lookup_bounds_and_valid_observation_predecessor(
    database, monkeypatch, at_boundary
):
    """Batch lookups skip revoked/unpublished history and preserve exact edges."""
    store_batch(database, source())
    _, spot = station(database)
    now = datetime.now(UTC)
    end = now + timedelta(hours=1)

    def record(mode, begin, finish):
        return dict(
            spot_id=spot,
            activity="swim",
            mode=mode,
            target_start=begin,
            target_end=finish,
            payload=_unavailable(
                ConditionQuery(spot_id=spot, activity="swim", mode=mode),
                begin,
                max(now, begin) if mode == "observation" else now,
                {"latest_generation_id": None, "name": "Disposable place"},
            ).model_dump(mode="json"),
        )

    with connect(database) as c:
        revision = projection_revision(c)
        generations = []
        for offset, source_revision, published in (
            (3, revision, True),
            (2, revision - 1, True),
            (1, revision, False),
        ):
            generations.append(
                c.execute(
                    "INSERT INTO pongdang_data.condition_generation "
                    "(source_revision,model_version,computed_at,record_count,"
                    "result_published) VALUES (%s,'1.0.0',%s,0,%s) RETURNING id",
                    [source_revision, now - timedelta(hours=offset), published],
                ).fetchone()[0]
            )
        c.execute(
            "UPDATE pongdang_data.condition_source_revision "
            "SET invalidated_revision=%s WHERE id=1",
            [revision],
        )
        _create_result_stage(c)
        for offset, generation in zip((3, 2, 1), generations, strict=True):
            _copy_result_batch(
                c,
                [
                    record(
                        "observation",
                        now - timedelta(hours=offset),
                        now - timedelta(hours=offset - 1),
                    )
                ],
                generation,
            )
        observation_starts = [
            now + timedelta(minutes=30),
            end,
            end + timedelta(hours=1),
        ]
        if at_boundary:
            observation_starts.insert(0, now)
        _copy_result_batch(
            c,
            [
                record("observation", start, start + timedelta(minutes=30))
                for start in observation_starts
            ]
            + [
                record("forecast", begin, finish)
                for begin, finish in (
                    (now - timedelta(hours=1), now),
                    (now, now + timedelta(minutes=30)),
                    (now + timedelta(minutes=30), end),
                    (end, end + timedelta(hours=1)),
                )
            ],
            generations[0],
        )
        c.execute(
            "INSERT INTO pongdang_data.condition_result (" + RESULT_COLUMNS + ") "
            "SELECT " + RESULT_COLUMNS + " FROM condition_result_stage"
        )
        seen = []
        result_payload = condition_retention.result_payload

        def inspect_row(row):
            seen.append((row["mode"], row["target_start"], row["generation_id"]))
            return result_payload(row)

        monkeypatch.setattr(condition_retention, "result_payload", inspect_row)
        retained = condition_retention.RetainedPublication(
            c, {"generation_id": generations[0]}, {"generation_id": 999}
        )
        assert (
            len(
                list(
                    retained.records(
                        [record("observation", now, end), record("forecast", now, end)]
                    )
                )
            )
            == 2
        )
        assert seen == [
            ("forecast", now, generations[0]),
            ("forecast", now + timedelta(minutes=30), generations[0]),
            (
                "observation",
                now if at_boundary else now - timedelta(hours=3),
                generations[0],
            ),
            ("observation", now + timedelta(minutes=30), generations[0]),
            ("observation", end, generations[0]),
        ]
