from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from test_quality_integration import database as database
from test_quality_integration import provider_batch

from app.ingestion.models import Place, SourceBatch, Value
from app.ingestion.storage import store_batch
from app.main import create_app
from app.schema import connect


def beach(settings, *, kind="beach", latitude=37.001):
    store_batch(
        settings,
        SourceBatch(
            provider="TOURAPI_KOREAN",
            fetched_at=datetime.now(UTC),
            places=[
                Place(
                    source_id="grade-beach",
                    name="Water quality fixture",
                    kind=kind,
                    latitude=latitude,
                    longitude=128,
                )
            ],
        ),
    )
    with connect(settings) as c:
        return c.execute(
            "SELECT spot_id FROM pongdang_data.collection_place "
            "WHERE source_id='grade-beach'"
        ).fetchone()[0]


def read(client, spot):
    result = client.get("/api/data/quality/grade", params={"spot_id": spot})
    assert result.status_code == 200, result.text
    return result.json()


def test_real_collected_historical_grade_reaches_beach_without_seeding(database):
    now = datetime.now(UTC)
    batch = provider_batch(now)
    sample = batch.readings[0].model_copy(
        update={
            "observed_at": now - timedelta(days=300),
            "valid_until": now - timedelta(days=299),
        }
    )
    store_batch(database, batch.model_copy(update={"readings": [sample]}))
    spot = beach(database)
    with connect(database) as c:
        before = c.execute(
            "SELECT (SELECT count(*) FROM "
            "pongdang_data.conditions_observationsnapshot),"
            "(SELECT count(*) FROM pongdang_data.quality_analysis),"
            "(SELECT count(*) FROM pongdang_data.water_index_station_mapping)"
        ).fetchone()
    with TestClient(create_app(database)) as client:
        data = read(client, spot)
        assert data["grade"] == 1 and data["label"] == "매우 좋음"
        assert data["basis"] == "official_grade" and data["status"] == "historical"
        assert data["age_days"] == 300
        assert data["relation"] == "nearby_station_context"
        assert 0 < data["distance_km"] < 1
        assert (
            data["current_beach_grade"] is None and data["safety_status"] == "unknown"
        )
        assert data["sources"][0]["provider_record_id"]
        assert data["measurements"][0]["unit"] == "NTU"
        assert read(client, spot)["grade"] == 1
    with connect(database) as c:
        after = c.execute(
            "SELECT (SELECT count(*) FROM "
            "pongdang_data.conditions_observationsnapshot),"
            "(SELECT count(*) FROM pongdang_data.quality_analysis),"
            "(SELECT count(*) FROM pongdang_data.water_index_station_mapping)"
        ).fetchone()
    assert before == after


@pytest.mark.parametrize(
    "kind,latitude,status",
    [("valley", 37.001, "unsupported"), ("beach", 38.001, "no_data")],
)
def test_marine_grade_never_transfers_to_river_or_distant_beach(
    database, kind, latitude, status
):
    store_batch(database, provider_batch(datetime.now(UTC)))
    spot = beach(database, kind=kind, latitude=latitude)
    with TestClient(create_app(database)) as client:
        data = read(client, spot)
        assert data["grade"] is None and data["status"] == status


def test_latest_missing_result_never_falls_back_to_older_good_grade(database):
    now = datetime.now(UTC)
    old = provider_batch(now - timedelta(days=90))
    store_batch(database, old)
    batch = provider_batch(now)
    latest = batch.readings[0].model_copy(
        update={
            "source_id": "new-sample",
            "values": [Value(name="official_wqi_grade", missing=True)],
        }
    )
    store_batch(database, batch.model_copy(update={"readings": [latest]}))
    spot = beach(database)
    with TestClient(create_app(database)) as client:
        data = read(client, spot)
        assert data["grade"] is None and data["status"] == "no_data"
        assert data["age_days"] < 3


def test_latest_layer_conflict_and_provider_correction_are_explicit(database):
    now = datetime.now(UTC)
    batch = provider_batch(now)
    second = batch.readings[0].model_copy(
        update={
            "source_id": "bottom",
            "values": [Value(name="official_wqi_grade", numeric_value=5)],
        }
    )
    store_batch(
        database, batch.model_copy(update={"readings": [*batch.readings, second]})
    )
    spot = beach(database)
    with TestClient(create_app(database)) as client:
        data = read(client, spot)
        assert data["grade"] is None and data["status"] == "conflict"
        fixed = second.model_copy(
            update={"values": [Value(name="official_wqi_grade", numeric_value=1)]}
        )
        store_batch(
            database,
            batch.model_copy(
                update={"fetched_at": datetime.now(UTC), "readings": [fixed]}
            ),
        )
        assert read(client, spot)["grade"] == 1


def test_grade_endpoint_rejects_unknown_place_and_unbounded_queries(database):
    with TestClient(create_app(database)) as client:
        assert client.get("/api/data/quality/grade?spot_id=999999").status_code == 404
        for query in (
            "",
            "spot_id=0",
            "spot_id=1&spot_id=2",
            "spot_id=1&radius=999",
            "spot_id=1&as_of=2026-01-01",
        ):
            assert client.get("/api/data/quality/grade?" + query).status_code == 422
