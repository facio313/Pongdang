"""Reuse stored inland catalogues/evidence on an explicitly disposable database."""

import asyncio
import os
from datetime import UTC, datetime, timedelta

import pytest
from test_condition_producer_integration import assert_parity, inputs, put

from app.attachments.collector import due_places as due_photos
from app.config import Settings
from app.data_reader import DataReader
from app.ingestion.models import Place, SourceBatch, Value
from app.ingestion.storage import store_batch
from app.ingestion.water_tour_extra import tourism_place
from app.livecams.places import read_places_page
from app.place_details.collector import link_places
from app.place_details.models import DetailField, PlaceDetail
from app.quality.grade_reader import read_grade
from app.schema import connect, initialize
from app.water_index.condition_api import ConditionQuery
from app.water_index.condition_producer import produce_conditions
from app.water_index.condition_storage import read_condition_set


@pytest.fixture
def inland_db():
    settings = Settings(_env_file=None, ai_provider="disabled")
    assert os.environ.get("PONGDANG_TEST_DISPOSABLE") == "1"
    assert settings.postgres_db == "pongdang_test"
    assert settings.postgres_host in {"127.0.0.1", "localhost"}
    initialize(settings)
    yield settings
    with connect(settings) as c:
        c.execute("DROP SCHEMA pongdang_data CASCADE")


def catalog(settings, *, kind="lake"):
    now = datetime.now(UTC) - timedelta(minutes=1)
    store_batch(
        settings,
        SourceBatch(
            provider="TOURAPI_KOREAN",
            fetched_at=now,
            places=[
                Place(
                    source_id="127565",
                    name="OFFLINE TEST 영랑호",
                    kind=kind,
                    category="12",
                    address="강원특별자치도 속초시",
                    latitude=37.5,
                    longitude=129,
                )
            ],
        ),
    )
    with connect(settings) as c:
        return c.execute(
            "SELECT spot_id FROM pongdang_data.collection_place "
            "WHERE source_id='127565'"
        ).fetchone()[0]


def test_saved_official_lake_detail_unlocks_catalogue_and_photo_collection(inland_db):
    spot = catalog(inland_db, kind="tourism")
    store_batch(
        inland_db,
        SourceBatch(
            provider="TOURAPI_KOREAN",
            fetched_at=datetime.now(UTC),
            place_details=[
                PlaceDetail(
                    source_id="127565",
                    content_type="12",
                    name="OFFLINE TEST 영랑호",
                    overview="Stored official overview",
                    details=[
                        DetailField(
                            section="common",
                            key="cat3",
                            label="소분류",
                            value="A01011700",
                        )
                    ],
                )
            ],
        ),
    )
    link_places(inland_db)
    page = asyncio.run(read_places_page(DataReader(inland_db), kind="lake"))
    assert [r["id"] for r in page["rows"]] == [spot]
    assert page["rows"][0]["place_kind"] == "lake"
    assert [p["id"] for p in due_photos(inland_db)] == [spot]


def test_recollection_updates_kind_without_a_provider_revision_change(inland_db):
    now = datetime.now(UTC) - timedelta(minutes=1)
    row = {
        "contentid": "127565",
        "title": "OFFLINE TEST 영랑호",
        "mapx": 129,
        "mapy": 37.5,
        "contenttypeid": "12",
        "modifiedtime": "20240101120000",
    }
    original = tourism_place(row, now)
    store_batch(
        inland_db,
        SourceBatch(provider="TOURAPI_KOREAN", fetched_at=now, places=[original]),
    )
    with connect(inland_db) as c:
        before = c.execute(
            "SELECT id,spot_id FROM pongdang_data.collection_place "
            "WHERE source_id='127565'"
        ).fetchone()
    normalized = tourism_place({**row, "cat3": "A01011700"}, now + timedelta(seconds=1))
    assert normalized.source_modified_at == original.source_modified_at
    store_batch(
        inland_db,
        SourceBatch(
            provider="TOURAPI_KOREAN",
            fetched_at=now + timedelta(seconds=1),
            places=[normalized],
        ),
    )
    with connect(inland_db) as c:
        after = c.execute(
            "SELECT id,spot_id,kind FROM pongdang_data.collection_place "
            "WHERE source_id='127565'"
        ).fetchone()
    assert after[:2] == before and after[2] == "lake"
    page = asyncio.run(read_places_page(DataReader(inland_db), kind="lake"))
    assert [r["id"] for r in page["rows"]] == [before[1]]


def test_inland_worker_and_reader_reuse_weather_and_freshwater_without_marine_leak(
    inland_db,
):
    now = datetime.now(UTC) - timedelta(seconds=1)
    spot = catalog(inland_db)
    put(
        inland_db,
        observed=now - timedelta(minutes=10),
        fetched=now,
        values=[
            Value(name="air_temperature", numeric_value=25, unit="°C"),
            Value(name="precipitation", numeric_value=0, unit="mm/1h"),
        ],
    )
    put(
        inland_db,
        provider="khoa_water_temperature",
        station="fixture-sea",
        kind="marine_buoy",
        observed=now - timedelta(minutes=10),
        fetched=now,
        values=[
            Value(name="water_temperature", numeric_value=28, unit="°C"),
            Value(name="wave_height", numeric_value=0.2, unit="m"),
        ],
    )
    put(
        inland_db,
        provider="hrfco_waterlevel",
        station="fixture-river",
        kind="river_level",
        observed=now - timedelta(minutes=10),
        fetched=now,
        values=[
            Value(name="river_level", numeric_value=1.2, unit="m"),
            Value(name="river_flow", numeric_value=0, unit="m³/s"),
        ],
    )
    loaded, _, _ = inputs(inland_db, now)
    query = ConditionQuery(
        spot_id=spot, activity="swim", mode="observation", at=now, as_of=now
    )
    assert_parity(inland_db, loaded, query, now, now)
    place = next(p for p in loaded.places if p["id"] == spot)
    envelope = loaded.envelope(place, query, now, now)
    assert envelope.place_kind == "lake"
    assert produce_conditions(inland_db, now=now) > 0
    stored = asyncio.run(read_condition_set(DataReader(inland_db), [query], now=now))[0]
    assert stored.place_kind == "lake"
    assert stored.condition_score.model_version == "1.1.0"
    assert stored.model_dump(exclude={"projection"}) == envelope.model_dump(
        exclude={"projection"}
    )
    assert all(
        s.provider != "khoa_water_temperature"
        for m in (*envelope.metrics, *envelope.context_metrics)
        for s in m.evidence
    )
    assert any(
        m.name == "river_level" and m.value == 1.2 for m in envelope.context_metrics
    )
    assert envelope.condition_score.components[0].score is None
    assert envelope.safety_status == "unknown"


def test_historical_nier_sample_is_visible_without_a_marine_grade(inland_db):
    spot = catalog(inland_db, kind="reservoir")
    now = datetime.now(UTC) - timedelta(seconds=1)
    observed = now - timedelta(days=30)
    put(
        inland_db,
        provider="nier_water_quality",
        station="fixture-lab",
        kind="river_water_quality",
        observed=observed,
        until=observed + timedelta(days=1),
        fetched=now,
        values=[
            Value(name="water_temperature", numeric_value=21.0, unit="°C"),
            Value(name="total_phosphorus", numeric_value=0.03, unit=""),
        ],
    )

    async def query():
        async with DataReader(inland_db).connection() as c:
            return await read_grade(c, spot, now)

    result = asyncio.run(query())
    assert result.method_version == "inland-sampling.v1"
    assert result.status == "historical"
    assert result.grade is None and result.wqi is None
    assert result.provider == "nier_water_quality"
    assert result.age_days == 30
    assert "nearby_station_not_same_waterbody" in result.reason_codes
    assert result.measurements[1].unit is None
    assert result.sources[0].observed_at == observed
