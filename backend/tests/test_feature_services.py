"""A3/A4/A5/B real storage-to-HTTP checks on disposable PostgreSQL only."""

from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.ai.service import reserve, validate_order
from app.config import Settings
from app.ingestion.models import Reading, SourceBatch, Station, Value
from app.ingestion.storage import store_batch
from app.livecams.service import (
    Camera,
    check_camera,
    register_camera,
    run_checks,
    safe_url,
)
from app.schema import connect, initialize
from app.twin.api import SpatialQuery


@pytest.fixture
def feature_db():
    settings = Settings()
    if settings.postgres_db != "pongdang_test":
        pytest.fail("Feature tests require disposable pongdang_test")
    initialize(settings)
    yield settings
    with connect(settings) as c:
        c.execute("DROP SCHEMA pongdang_data CASCADE")


def reading(settings, *, missing=False, value=17.4, mode="observation", offset=0):
    now = datetime.now(UTC) - timedelta(seconds=10)
    station = Station(
        source_id="TEST-ST",
        name="Test only station",
        kind="buoy",
        latitude=37.0,
        longitude=129.0,
    )
    batch = SourceBatch(
        provider="TEST_OFFICIAL",
        fetched_at=now,
        readings=[
            Reading(
                source_id="record-1",
                station=station,
                observed_at=now + timedelta(hours=offset),
                valid_until=now + timedelta(hours=offset + 2),
                spatial_scope="test station point",
                values=[
                    Value(
                        name="water_temperature",
                        unit="°C",
                        numeric_value=None if missing else value,
                        missing=missing,
                        mode=mode,
                    )
                ],
            )
        ],
    )
    store_batch(settings, batch)
    with connect(settings) as c:
        spot = c.execute(
            "SELECT spot_id FROM pongdang_data.collection_station "
            "WHERE source_id='TEST-ST'"
        ).fetchone()[0]
    return spot


@pytest.mark.parametrize(
    "query",
    [
        {"west": 0},
        {"west": -180, "east": 180, "south": 0, "north": 1},
        {"at": "2026-01-01T00:00:00"},
        {"page_size": 101},
        {"west": float("nan")},
        {"as_of": datetime.now(UTC) + timedelta(days=1)},
        {"mode": "estimated"},
        {"at": datetime.now(UTC) - timedelta(days=32)},
    ],
)
def test_spatial_bounds(query):
    with pytest.raises(ValidationError):
        SpatialQuery(**query)


def test_twin_temperature_storage_http_correction_and_get_readonly(feature_db):
    from app.main import create_app

    spot = reading(feature_db)
    with TestClient(create_app(feature_db)) as client:
        response = client.get("/api/data/water-temperature", params={"spot_id": spot})
        assert response.status_code == 200, response.text
        body = response.json()
        layer = body["rows"][0]["layers"][0]
        assert layer["numeric_value"] == 17.4
        assert layer["status"] == "observation" and layer["unit"] == "°C"
        assert body["rows"][0]["stations"][0]["relation"] == "station_observation_point"
        assert body["rows"][0]["safety_status"] == "unknown"
        assert body["rows"][0]["score"] is None
        with connect(feature_db) as c:
            before = c.execute(
                "SELECT count(*) FROM pongdang_data.ingestion_batches"
            ).fetchone()
        for _ in range(2):
            assert client.get("/api/data/water-twin").status_code == 200
            assert (
                client.get(
                    "/api/data/ai/explanation", params={"spot_id": spot}
                ).status_code
                == 200
            )
        with connect(feature_db) as c:
            assert (
                c.execute(
                    "SELECT count(*) FROM pongdang_data.ingestion_batches"
                ).fetchone()
                == before
            )
            assert c.execute(
                "SELECT count(*) FROM pongdang_data.ai_daily_budget"
            ).fetchone() == (0,)
        reading(feature_db, missing=True)
        changed = client.get(
            "/api/data/water-temperature", params={"spot_id": spot}
        ).json()
        assert changed["rows"][0]["layers"][0]["numeric_value"] is None
        assert changed["rows"][0]["layers"][0]["status"] == "missing"
        assert (
            client.get(
                "/api/data/water-twin", params={"spot_id": 987654321}
            ).status_code
            == 404
        )
        assert (
            client.get("/api/data/water-twin", params={"page_size": 101}).status_code
            == 422
        )


def test_forecasts_never_displayed_as_observations(feature_db):
    from app.main import create_app

    spot = reading(feature_db, mode="forecast", offset=1)
    with TestClient(create_app(feature_db)) as client:
        assert (
            client.get("/api/data/water-temperature", params={"spot_id": spot}).json()[
                "rows"
            ][0]["layers"]
            == []
        )
        data = client.get(
            "/api/data/water-temperature",
            params={
                "spot_id": spot,
                "mode": "forecast",
                "at": (datetime.now(UTC) + timedelta(hours=1)).isoformat(),
            },
        ).json()
        assert data["rows"][0]["layers"][0]["status"] == "forecast"
        assert data["rows"][0]["layers"][0]["issued_at"] is None


@pytest.mark.parametrize(
    "url",
    [
        "http://khoa.go.kr/a",
        "https://user:pass@khoa.go.kr/a",
        "https://khoa.go.kr/?key=x",
        "https://khoa.go.kr:444/a",
        "https://127.0.0.1/a",
        "https://evil.test/a",
        "https://khoa.go.kr.evil.test/a",
    ],
)
def test_camera_url_boundary(url):
    with pytest.raises(ValueError):
        safe_url(url)


def camera(spot):
    now = datetime.now(UTC) - timedelta(seconds=1)
    return Camera(
        camera_id="test-camera",
        spot_id=spot,
        provider="Test official agency",
        public_page="https://www.khoa.go.kr/test-camera",
        playback_url=None,
        media_kind="live",
        playback_method="external_page",
        embed_allowed=False,
        usage_terms="Software test fixture only",
        terms_url="https://www.khoa.go.kr/terms",
        location_evidence="Isolated test location",
        reviewed_at=now,
        review_valid_until=now + timedelta(days=1),
        source_revision="test-1",
    )


def test_camera_registered_revision_checked_failure_and_empty(feature_db):
    from app.main import create_app

    settings = feature_db.model_copy(update={"livecam_allowed_hosts": "www.khoa.go.kr"})
    with TestClient(create_app(settings)) as client:
        assert client.get("/api/data/livecams").json()["status"] == "no_data"
        spot = reading(settings)
        item = camera(spot)
        revision = register_camera(settings, item)
        assert register_camera(settings, item) == revision
        with pytest.raises(ValueError):
            register_camera(
                settings, item.model_copy(update={"usage_terms": "conflict"})
            )
        run_checks(
            settings, checker=lambda *_: ("reachable", "media_liveness_not_verified")
        )
        data = client.get("/api/data/livecams").json()["rows"][0]
        assert data["status"] == "reachable" and data["live_verified"] is False
        run_checks(settings, checker=lambda *_: ("unverifiable", "check_failed"))
        assert (
            client.get("/api/data/livecams").json()["rows"][0]["status"]
            == "unverifiable"
        )


def test_camera_check_failure_sanitized():
    class Broken:
        def open(self, *_, **__):
            raise OSError("SENSITIVE_UPSTREAM_CREDENTIAL")

    assert check_camera(camera(1), {"www.khoa.go.kr"}, opener=Broken()) == (
        "unverifiable",
        "check_failed",
    )


@pytest.mark.parametrize(
    "output",
    [
        {"ordered_fact_ids": ["imaginary"]},
        {"ordered_fact_ids": ["a", "a"]},
        {"ordered_fact_ids": ["a"], "score": 100},
        {"ordered_fact_ids": []},
        {"ordered_fact_ids": [1]},
        {"ordered_fact_ids": [["a"]]},
    ],
)
def test_ai_rejects_invented_missing_duplicate_or_extra_output(output):
    with pytest.raises(ValueError):
        validate_order(output, ["a", "b"])


def test_ai_budget_persists_failure_reservations(feature_db):
    settings = feature_db.model_copy(update={"ai_max_daily_calls": 1})
    assert reserve(settings, 100)
    assert not reserve(settings, 100)
    assert not reserve(settings.model_copy(), 100)
