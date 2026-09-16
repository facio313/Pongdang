"""Collected grid and tide evidence reaches product places without DB mappings."""

from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient
from test_assessment_forecast_tides_integration import batch, params
from test_assessment_forecast_tides_integration import db as db

from app.forecast.storage import project_forecasts
from app.ingestion.models import Place, Reading, SourceBatch, Station, Value
from app.ingestion.storage import store_batch
from app.ingestion.weather import grid_coordinates
from app.main import create_app
from app.schema import connect


def place(settings, kind="beach", latitude=37.01, longitude=128):
    store_batch(
        settings,
        SourceBatch(
            provider="TOURAPI_KOREAN",
            fetched_at=datetime.now(UTC),
            places=[
                Place(
                    source_id="connected-place",
                    name="Connection fixture",
                    kind=kind,
                    latitude=latitude,
                    longitude=longitude,
                )
            ],
        ),
    )
    with connect(settings) as c:
        return c.execute(
            "SELECT spot_id FROM pongdang_data.collection_place "
            "WHERE source_id='connected-place'"
        ).fetchone()[0]


def test_collected_nearby_tide_is_explicit_station_context(db):
    now = datetime.now(UTC)
    store_batch(
        db, batch(at=now + timedelta(hours=1), fetched=now - timedelta(seconds=3))
    )
    project_forecasts(db)
    spot = place(db)
    with TestClient(create_app(db)) as client:
        response = client.get(
            "/api/data/tides/events", params=params(spot, now, now + timedelta(days=1))
        )
        assert response.status_code == 200, response.text
        data = response.json()
        assert data["next_high"]["kind"] == "high"
        assert data["next_high"]["spatial_relation"] == "nearby_station_context"
        assert data["next_high"]["spot_id"] == spot
        assert data["next_high"]["source_spot_id"] != spot
        assert 1 < data["next_high"]["distance_km"] < 2
        assert data["next_high"]["mapping_evidence_ref"] is None
        window = client.get(
            "/api/data/tides/windows", params=params(spot, now, now + timedelta(days=1))
        ).json()
        assert window["rows"] == []
    with connect(db) as c:
        assert (
            c.execute(
                "SELECT count(*) FROM pongdang_data.water_index_station_mapping"
            ).fetchone()[0]
            == 0
        )


def test_tides_do_not_fill_inland_or_distant_places(db):
    now = datetime.now(UTC)
    store_batch(
        db, batch(at=now + timedelta(hours=1), fetched=now - timedelta(seconds=3))
    )
    project_forecasts(db)
    with TestClient(create_app(db)) as client:
        for kind, latitude in [("valley", 37.001), ("beach", 39)]:
            spot = place(db, kind=kind, latitude=latitude)
            data = client.get(
                "/api/data/tides/events",
                params=params(spot, now, now + timedelta(days=1)),
            ).json()
            assert data["next_high"] is None and data["rows"] == []


def test_forecast_list_connects_only_exact_kma_grid_with_provenance(db):
    now = datetime.now(UTC)
    nx, ny = grid_coordinates(37.01, 128)
    for index, grid in enumerate([(nx, ny), (nx + 1, ny)]):
        station = Station(
            source_id=f"kma-grid-{grid[0]}-{grid[1]}",
            kind="weather_forecast_grid",
            name=f"Weather cell {index}",
        )
        store_batch(
            db,
            SourceBatch(
                provider="kma_short_forecast",
                fetched_at=now - timedelta(seconds=3),
                readings=[
                    Reading(
                        source_id=f"forecast-{index}",
                        station=station,
                        observed_at=now + timedelta(hours=1),
                        issued_at=now - timedelta(hours=1),
                        valid_until=now + timedelta(hours=2),
                        spatial_scope="5km weather cell",
                        values=[
                            Value(
                                name="precipitation",
                                numeric_value=index,
                                unit="mm/1h",
                                mode="forecast",
                            )
                        ],
                    )
                ],
            ),
        )
    project_forecasts(db)
    spot = place(db)
    with TestClient(create_app(db)) as client:
        response = client.get(
            "/api/data/water-forecast/forecasts",
            params=params(spot, now, now + timedelta(days=1)),
        )
        assert response.status_code == 200, response.text
        data = response.json()
        assert data["total"] == 1
        row = data["rows"][0]
        assert row["inputs"][0]["numeric_value"] == 0
        assert row["spatial_relation"] == "containing_forecast_grid"
        assert row["requested_spot_id"] == spot
        assert row["spot_id"] != spot and row["mapping_evidence_ref"] is None
