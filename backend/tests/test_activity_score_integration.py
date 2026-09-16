"""Read-only automatic index through disposable database/API fixture contracts."""

from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient
from test_condition_score_integration import conditions, counts, source, station
from test_condition_score_integration import database as database

from app.ingestion.models import Place, SourceBatch, Value
from app.ingestion.storage import store_batch
from app.ingestion.weather import grid_coordinates
from app.main import create_app
from app.schema import connect


def catalog_place(settings, latitude=37.5, longitude=129):
    store_batch(
        settings,
        SourceBatch(
            provider="kakao_keyword",
            fetched_at=datetime.now(UTC),
            places=[
                Place(
                    source_id="fixture-catalog",
                    name="Actual catalog fixture",
                    kind="beach",
                    latitude=latitude,
                    longitude=longitude,
                )
            ],
        ),
    )
    with connect(settings) as c:
        return c.execute(
            "SELECT spot_id FROM pongdang_data.collection_place "
            "WHERE source_id='fixture-catalog'"
        ).fetchone()[0]


def test_catalog_place_get_returns_context_score_without_registering_mapping(database):
    store_batch(
        database,
        source(values=[Value(name="air_temperature", numeric_value=25, unit="degC")]),
    )
    _, station_spot = station(database)
    spot = catalog_place(database, latitude=37.501)
    assert spot != station_spot
    before = counts(database)
    with TestClient(create_app(database)) as client:
        view = conditions(client, spot)
        assert view["metrics"] == []
        assert view["condition_score"]["score"] == 100
        assert view["condition_score"]["status"] == "partial"
        context = view["context_metrics"][0]
        assert context["relation"] == "nearby_station_context"
        assert 0 < context["distance_km"] < 1
        assert view["support_status"] == view["safety_status"] == "unknown"
    assert counts(database) == before
    with connect(database) as c:
        assert (
            c.execute(
                "SELECT count(*) FROM pongdang_data.water_index_station_mapping "
                "WHERE spot_id=%s",
                [spot],
            ).fetchone()[0]
            == 0
        )


def test_unknown_coordinates_never_count_as_zero_distance_and_radius_is_bounded(
    database,
):
    store_batch(database, source())
    spot = catalog_place(database)
    with connect(database) as c:
        c.execute(
            "UPDATE pongdang_data.collection_station SET latitude=NULL,longitude=NULL"
        )
    with TestClient(create_app(database)) as client:
        view = conditions(client, spot)
        assert (
            view["context_metrics"] == [] and view["condition_score"]["score"] is None
        )
        with connect(database) as c:
            c.execute(
                "UPDATE pongdang_data.collection_station "
                "SET latitude=38.5,longitude=129"
            )
        view = conditions(client, spot)
        assert view["context_metrics"] == []


def test_exact_kma_grid_context_works_without_fabricating_station_coordinates(database):
    nx, ny = grid_coordinates(37.5, 129)
    batch = source(
        station_id=f"kma-grid-{nx}-{ny}",
        kind="weather_forecast_grid",
        provider="kma_short_forecast",
        mode="forecast",
        issued_at=datetime.now(UTC) - timedelta(hours=1),
    )
    store_batch(database, batch)
    with connect(database) as c:
        c.execute(
            "UPDATE pongdang_data.collection_station SET latitude=NULL,longitude=NULL"
        )
    spot = catalog_place(database)
    with TestClient(create_app(database)) as client:
        view = conditions(client, spot, mode="forecast")
        assert view["condition_score"]["score"] == 25
        assert view["context_metrics"][0]["relation"] == "containing_forecast_grid"
        assert view["context_metrics"][0]["distance_km"] is None


def test_khoa_skill_forecast_preserves_unknown_issue_and_identical_variants(database):
    now = datetime.now(UTC)
    kwargs = dict(
        provider="khoa_surfing",
        kind="surfing",
        mode="forecast",
        observed_at=now - timedelta(minutes=5),
        fetched_at=now,
        values=[Value(name="air_temperature", numeric_value=25, unit="°C")],
    )
    for skill in ("beginner", "intermediate", "advanced"):
        store_batch(database, source(source_id=skill, **kwargs))
    _, spot = station(database)
    with TestClient(create_app(database)) as client:
        view = conditions(client, spot, "surf", mode="forecast")
        assert view["metrics"][0]["status"] == "conflict"
        assert len(view["metrics"][0]["evidence"]) == 3
        result = view["condition_score"]
        assert result["score"] == 100
        assert "identical_provider_variants" in result["reason_codes"]
        assert "provider_issue_time_unknown" in result["reason_codes"]


def test_irrelevant_activity_and_mode_stations_do_not_consume_context_limit(database):
    for number in range(7):
        store_batch(
            database,
            source(
                station_id=f"irrelevant-beach-{number}",
                provider="khoa_beach",
                kind="beach",
                mode="forecast",
            ),
        )
        store_batch(database, source(station_id=f"irrelevant-observation-{number}"))
    store_batch(
        database,
        source(
            station_id="applicable-surf",
            provider="khoa_surfing",
            kind="surfing",
            mode="forecast",
        ),
    )
    spot = catalog_place(database, latitude=37.501)
    with TestClient(create_app(database)) as client:
        view = conditions(client, spot, "surf", mode="forecast")
        assert view["condition_score"]["score"] == 25
        assert {m["evidence"][0]["provider"] for m in view["context_metrics"]} == {
            "khoa_surfing"
        }


def test_direct_place_get_fills_absent_wave_and_rain_from_context(database):
    store_batch(
        database,
        source(
            station_id="direct-beach",
            provider="khoa_beach",
            kind="beach",
            values=[Value(name="water_temperature", numeric_value=24, unit="°C")],
        ),
    )
    _, spot = station(database, "direct-beach")
    store_batch(
        database,
        source(
            station_id="nearby-buoy",
            provider="khoa_buoy_recent",
            values=[Value(name="wave_height", numeric_value=0.4, unit="m")],
        ),
    )
    store_batch(
        database,
        source(
            station_id="local-weather",
            provider="kma_nowcast",
            values=[Value(name="precipitation", numeric_value=0, unit="mm/1h")],
        ),
    )
    before = counts(database)
    with TestClient(create_app(database)) as client:
        view = conditions(client, spot)
    displayed = {m["name"]: m for m in view["display_metrics"]}
    assert displayed["water_temperature"]["relation"] == "station_observation_point"
    assert displayed["wave_height"]["value"] == 0.4
    assert displayed["wave_height"]["relation"] == "nearby_station_context"
    assert displayed["wave_height"]["distance_km"] == 0
    assert displayed["precipitation"]["value"] == 0
    assert view["condition_score"]["total_components"] == 4
    assert "precipitation" not in {
        c["metric"] for c in view["condition_score"]["components"]
    }
    assert counts(database) == before


def test_stale_direct_wave_is_not_hidden_by_fresh_context(database):
    now = datetime.now(UTC)
    store_batch(
        database,
        source(
            station_id="direct-beach",
            provider="khoa_beach",
            kind="beach",
            observed_at=now - timedelta(hours=3),
            valid_until=now - timedelta(hours=1),
            values=[Value(name="wave_height", numeric_value=2, unit="m")],
        ),
    )
    _, spot = station(database, "direct-beach")
    store_batch(
        database,
        source(
            station_id="nearby-buoy",
            provider="khoa_buoy_recent",
            values=[Value(name="wave_height", numeric_value=0.4, unit="m")],
        ),
    )
    with TestClient(create_app(database)) as client:
        view = conditions(client, spot)
    assert view["metrics"][0]["status"] == "stale"
    assert not any(m["name"] == "wave_height" for m in view["display_metrics"])
    assert not any(m["name"] == "wave_height" for m in view["context_metrics"])
    assert view["condition_score"]["score"] is None
