"""SourceBatch -> PostgreSQL -> authenticated review -> worker -> read-only API.

Only a separately configured disposable pongdang_test is accepted.
"""

from datetime import UTC, datetime, timedelta

import psycopg
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import SecretStr

from app.config import Settings
from app.ingestion.models import Reading, SourceBatch, Station, Value
from app.ingestion.storage import store_batch
from app.quality.api import create_router
from app.quality.migrations import migrate
from app.quality.service import run_quality_job
from app.schema import connect, initialize


@pytest.fixture
def database():
    settings = Settings()
    if settings.postgres_db != "pongdang_test":
        pytest.fail("Quality integration requires disposable pongdang_test")
    initialize(settings)
    with connect(settings) as c:
        migrate(c)
    yield settings.model_copy(
        update={
            "sso_proxy_secret": SecretStr("quality-test-only-secret-32-characters"),
            "sso_allowed_origins": "https://test.invalid",
        }
    )
    with connect(settings) as c:
        c.execute("DROP SCHEMA pongdang_data CASCADE")


def headers(subject="alice"):
    return {
        "X-Pongdang-SSO-Token": "quality-test-only-secret-32-characters",
        "X-Pongdang-SSO-Subject": subject,
        "X-Pongdang-SSO-Grants": "access-pongdang",
        "Origin": "https://test.invalid",
    }


def provider_batch(now, number=1):
    sampled = now.replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(days=1)
    station = Station(
        source_id="fixture-station",
        name="Synthetic quality test station",
        kind="marine_water_quality",
        latitude=37,
        longitude=128,
    )
    return SourceBatch(
        provider="koem_water_quality",
        fetched_at=now - timedelta(seconds=10),
        stations=[station],
        readings=[
            Reading(
                source_id="fixture-source-sample",
                station=station,
                observed_at=sampled,
                valid_until=sampled + timedelta(days=1),
                spatial_scope="fixture-station-surface",
                values=[
                    Value(name="turbidity", numeric_value=number, unit="NTU"),
                    Value(name="observation_precision", text_value="day"),
                    Value(name="measurement_method", text_value="fixture-method"),
                    Value(name="official_wqi_grade", text_value="1"),
                ],
            )
        ],
    )


def test_input_to_storage_processing_http_revisions_and_read_only(database):
    now = datetime.now(UTC)
    batch = provider_batch(now)
    assert store_batch(database, batch) > 0
    with connect(database) as c:
        spot = c.execute(
            "SELECT spot_id FROM pongdang_data.collection_station "
            "WHERE source_id='fixture-station'"
        ).fetchone()[0]
    app = FastAPI()
    app.include_router(create_router(database))
    with TestClient(app) as client:
        pending = client.get("/api/data/quality/comparisons", params={"spot_id": spot})
        assert (
            pending.status_code == 200
            and pending.json()["status"] == "analysis_pending"
        )
        first = run_quality_job(database)
        assert first["inserted"] == 1
        missing = client.get(
            "/api/data/quality/comparisons", params={"spot_id": spot}
        ).json()
        assert missing["rows"][0]["status"] == "no_review_data"
        observed = batch.readings[0].observed_at + timedelta(hours=3)
        body = {
            "review_id": "fixture-review",
            "revision": 1,
            "spot_id": spot,
            "observed_at": observed.isoformat(),
            "spatial_relation": "at_spot",
            "text": "물이 탁했다. 연락처 같은 원문은 공개 분석에 내보내지 않음",
            "measurements": [
                {
                    "item": "turbidity",
                    "value": 3,
                    "unit": "NTU",
                    "method": "fixture-method",
                    "sampled_at": observed.isoformat(),
                    "scope": "fixture-station-surface",
                }
            ],
        }
        created = client.post(
            "/api/data/quality/observations", headers=headers(), json=body
        )
        assert created.status_code == 201, created.text
        assert created.json()["created"] is True
        duplicate = client.post(
            "/api/data/quality/observations", headers=headers(), json=body
        )
        assert duplicate.status_code == 201 and duplicate.json()["created"] is False
        conflict = client.post(
            "/api/data/quality/observations",
            headers=headers(),
            json={**body, "text": "수정"},
        )
        assert conflict.status_code == 409
        own = client.get("/api/data/quality/observations", headers=headers()).json()
        assert own["total"] == 1
        other = client.get(
            "/api/data/quality/observations", headers=headers("bob")
        ).json()
        assert other["total"] == 0
        assert run_quality_job(database)["inserted"] == 1
        assert run_quality_job(database)["inserted"] == 0
        response = client.get("/api/data/quality/comparisons", params={"spot_id": spot})
        assert response.status_code == 200, response.text
        row = response.json()["rows"][0]
        assert row["status"] == "measurements_compared"
        assert row["measurement_comparisons"][0]["difference"] == 2
        assert row["official_sources"][0]["official_grade"] == "1"
        assert row["official_sources"][0]["issued_at"] is None
        assert row["safety_status"] == "unknown" and row["confidence_percent"] is None
        assert "연락처" not in response.text and "owner_key" not in response.text
        cutoff = response.json()["queried_at"]
        with connect(database) as c:
            before = c.execute(
                "SELECT count(*) FROM pongdang_data.quality_analysis"
            ).fetchone()[0]
        for _ in range(2):
            assert client.get("/api/data/quality/comparisons").status_code == 200
        with connect(database) as c:
            assert (
                c.execute(
                    "SELECT count(*) FROM pongdang_data.quality_analysis"
                ).fetchone()[0]
                == before
            )
        # Provider correction persists old lineage; saved comparisons remain replayable.
        assert store_batch(database, provider_batch(datetime.now(UTC), number=4)) > 0
        assert run_quality_job(database)["inserted"] == 1
        latest = client.get("/api/data/quality/comparisons").json()["rows"][0]
        assert latest["measurement_comparisons"][0]["difference"] == -1
        replay = client.get(
            "/api/data/quality/comparisons", params={"as_of": cutoff}
        ).json()
        assert replay["rows"][0]["analysis_id"] == row["analysis_id"]
        # Append-only correction and retraction, no destructive updates.
        assert (
            client.post(
                "/api/data/quality/observations",
                headers=headers(),
                json={**body, "revision": 2, "retracted": True},
            ).status_code
            == 201
        )
        assert run_quality_job(database)["inserted"] == 1
        assert (
            client.get("/api/data/quality/comparisons").json()["rows"][0]["status"]
            == "no_review_data"
        )
    with pytest.raises(psycopg.Error):
        with connect(database) as c:
            c.execute("UPDATE pongdang_data.quality_observation SET revision=99")
    with pytest.raises(psycopg.Error):
        with connect(database) as c:
            c.execute("DELETE FROM pongdang_data.quality_analysis")
