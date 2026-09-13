"""A3/A4/A5 regressions on disposable storage and isolated network doubles."""

from datetime import UTC, datetime, timedelta
from urllib.error import HTTPError

import psycopg
import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.forecast.storage import project_forecasts
from app.ingestion.models import Reading, SourceBatch, Station, Value
from app.ingestion.storage import store_batch
from app.livecams.service import Camera, check_camera, register_camera, run_checks
from app.main import create_app
from app.schema import connect, initialize
from app.water_index.producer import produce_assessments


@pytest.fixture
def database():
    settings = Settings()
    if settings.postgres_db != "pongdang_test":
        pytest.fail("Spatial integration requires disposable pongdang_test")
    initialize(settings)
    yield settings
    with connect(settings) as c:
        c.execute("DROP SCHEMA pongdang_data CASCADE")


def batch(
    *,
    fetched_at,
    observed_at,
    name="Fixture station",
    latitude=37,
    mode="observation",
    value=17.4,
):
    station = Station(
        source_id="spatial-fixture",
        name=name,
        kind="buoy",
        latitude=latitude,
        longitude=129,
    )
    return SourceBatch(
        provider="khoa_buoy",
        fetched_at=fetched_at,
        readings=[
            Reading(
                source_id="stable-fixture-record",
                station=station,
                observed_at=observed_at,
                valid_until=observed_at + timedelta(hours=2),
                spatial_scope="Fixture station point",
                values=[
                    Value(
                        name="water_temperature",
                        unit="°C",
                        numeric_value=value,
                        missing=value is None,
                        mode=mode,
                    )
                ],
            )
        ],
    )


def station_spot(settings):
    with connect(settings) as c:
        return c.execute(
            "SELECT spot_id FROM pongdang_data.collection_station "
            "WHERE source_id='spatial-fixture'"
        ).fetchone()[0]


def test_historical_metrics_survive_catalog_refresh_without_future_metadata(database):
    observed = datetime.now(UTC) - timedelta(minutes=30)
    store_batch(database, batch(fetched_at=datetime.now(UTC), observed_at=observed))
    spot = station_spot(database)
    with TestClient(create_app(database)) as client:
        before = client.get("/api/data/water-temperature", params={"spot_id": spot})
        assert before.status_code == 200, before.text
        cutoff = before.json()["as_of"]
        store_batch(
            database,
            batch(
                fetched_at=datetime.now(UTC),
                observed_at=observed,
                name="Later corrected metadata",
                latitude=38,
                value=None,
            ),
        )
        historical = client.get(
            "/api/data/water-temperature", params={"spot_id": spot, "as_of": cutoff}
        )
        assert historical.status_code == 200, historical.text
        place = historical.json()["rows"][0]
        assert place["layers"][0]["numeric_value"] == 17.4
        assert (
            place["stations"][0]["metadata_state"] == "historical_metadata_unavailable"
        )
        assert place["stations"][0]["latitude"] is None
        assert place["metadata_state"] == "historical_metadata_unavailable"
        assert place["name"] is None and place["lat"] is None
        current = client.get("/api/data/water-temperature", params={"spot_id": spot})
        assert current.json()["rows"][0]["layers"][0]["status"] == "missing"
        assert current.json()["rows"][0]["stations"][0]["latitude"] == 38
        assert current.headers["cache-control"] == "no-store"
        assert client.get("/api/data/water-twin?page=1&page=2").status_code == 422


def test_twin_reads_actual_a1_and_a2_outputs_for_exact_same_context(database):
    now = datetime.now(UTC)
    target = now + timedelta(hours=1)
    store_batch(database, batch(fetched_at=now, observed_at=target, mode="forecast"))
    spot = station_spot(database)
    assert project_forecasts(database) > 0
    assert produce_assessments(database) > 0
    with TestClient(create_app(database)) as client:
        response = client.get(
            "/api/data/water-twin",
            params={
                "spot_id": spot,
                "activity": "swim",
                "mode": "forecast",
                "at": (target + timedelta(minutes=1)).isoformat(),
            },
        )
        assert response.status_code == 200, response.text
        place = response.json()["rows"][0]
        assert place["forecast"]["rows"][0]["provider"] == "khoa_buoy"
        assert place["forecast"]["rows"][0]["data_kind"] == "official_forecast"
        assert (
            datetime.fromisoformat(place["forecast"]["rows"][0]["target_start_at"])
            == target
        )
        assert place["assessment"]["rows"][0]["assessment_id"]
        assert place["assessment"]["rows"][0]["input_manifest_id"]
        assert place["assessment"]["rows"][0]["input_ids"]
        assessment = place["assessment"]["rows"][0]
        assert place["score"] is None
        assert place["safety_status"] == assessment["safety_status"]
        assert place["safety_status"] in {"unknown", "not_assessed"}
        assert assessment["support_status"] == "unknown"
        future = client.get(
            "/api/data/water-twin",
            params={
                "spot_id": spot,
                "activity": "swim",
                "mode": "forecast",
                "at": (target + timedelta(days=7)).isoformat(),
            },
        )
        assert future.status_code == 200
        assert (
            future.json()["rows"][0]["forecast"]["status"] == "outside_forecast_horizon"
        )
        assert future.json()["rows"][0]["assessment"]["rows"] == []
        schemas = client.get("/api/openapi.json").json()["components"]["schemas"]
        assert "SpatialPlace" in schemas and "MetricLayer" in schemas
        assert "CameraEnvelope" in schemas


def camera(spot=1, number=0):
    now = datetime.now(UTC) - timedelta(seconds=1)
    return Camera(
        camera_id=f"camera-{number:03d}",
        spot_id=spot,
        provider="Fixture authority",
        public_page="https://www.khoa.go.kr/fixture-public-camera",
        media_kind="live",
        playback_method="external_page",
        embed_allowed=False,
        usage_terms="Isolated software fixture only",
        terms_url="https://www.khoa.go.kr/terms",
        location_evidence="Fixture station point",
        reviewed_at=now,
        review_valid_until=now + timedelta(days=1),
        source_revision="fixture-1",
    )


@pytest.mark.parametrize(
    ("code", "state"),
    [
        (404, "offline"),
        (410, "offline"),
        (503, "offline"),
        (403, "unverifiable"),
        (302, "unverifiable"),
    ],
)
def test_camera_http_errors_distinguish_offline_from_unverified_access(code, state):
    class Unavailable:
        def open(self, *args, **kwargs):
            raise HTTPError("https://www.khoa.go.kr/fixture", code, "hidden", {}, None)

    status, reason = check_camera(camera(), {"www.khoa.go.kr"}, opener=Unavailable())
    assert status == state
    assert "https" not in reason


def test_camera_101st_entry_is_checked_and_history_is_immutable(database):
    settings = database.model_copy(update={"livecam_allowed_hosts": "www.khoa.go.kr"})
    with connect(settings) as c:
        spot = c.execute(
            "INSERT INTO pongdang_data.spots_waterspot(name) "
            "VALUES('Isolated camera test place') RETURNING id"
        ).fetchone()[0]
    for index in range(101):
        register_camera(settings, camera(spot, index))
    checked = []

    def checker(item, hosts):
        checked.append(item.camera_id)
        return "reachable", "media_liveness_not_verified"

    first = run_checks(settings, checker=checker)
    second = run_checks(settings, checker=checker)
    assert first["received"] == 100 and second["received"] == 100
    assert len(set(checked)) == 101 and "camera-100" in checked
    with TestClient(create_app(settings)) as client:
        assert len(client.get("/api/data/livecams?page_size=100").json()["rows"]) == 100
        assert (
            len(client.get("/api/data/livecams?page_size=100&page=2").json()["rows"])
            == 1
        )
    for table in ("livecam_revision", "livecam_check"):
        with pytest.raises(psycopg.Error):
            with connect(settings) as c:
                c.execute(f"DELETE FROM pongdang_data.{table}")
