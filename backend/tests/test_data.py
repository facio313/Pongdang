import asyncio
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, patch

import psycopg
import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.data_reader import DataReader
from app.main import create_app
from app.schema import initialize


@pytest.fixture(scope="module")
def data_settings():
    settings = Settings()
    if settings.postgres_db != "pongdang_test":
        pytest.fail("Collector fixtures require the disposable pongdang_test database")
    initialize(settings)
    with psycopg.connect(
        host=settings.postgres_host,
        port=settings.postgres_port,
        dbname=settings.postgres_db,
        user=settings.postgres_user,
        password=settings.postgres_password.get_secret_value(),
        options="-c search_path=pongdang_data",
    ) as connection:
        connection.execute(
            "INSERT INTO spots_waterspot (id,name,region,catalog_source) VALUES "
            "(1,'테스트 해변','강릉','KHOA'),(2,'100% 테스트','속초','TourAPI')"
        )
        connection.execute(
            "INSERT INTO conditions_pipelineheartbeat "
            "(id,key,state,current_tasks,last_seen_at) VALUES "
            "(1,'condition-pipeline','running','[]',%s)",
            [datetime.now(UTC) - timedelta(days=2)],
        )
        connection.execute(
            "INSERT INTO forecasts_dailyforecast "
            "(id,availability,safety_status,score) "
            "VALUES (1,'unavailable','unknown',NULL)"
        )
        connection.execute(
            "INSERT INTO conditions_observationsnapshot (id,provider,state) "
            "VALUES (1,'PONGDANG_FUSION','missing')"
        )
    yield settings
    with psycopg.connect(
        host=settings.postgres_host,
        port=settings.postgres_port,
        dbname=settings.postgres_db,
        user=settings.postgres_user,
        password=settings.postgres_password.get_secret_value(),
        options="-c search_path=pongdang_data",
    ) as connection:
        connection.execute("DROP SCHEMA pongdang_data CASCADE")


@pytest.fixture
def client(data_settings):
    with TestClient(create_app(data_settings)) as client:
        yield client


def test_pagination_filter_search_and_null_values(client):
    first = client.get("/api/data/datasets/spots?page_size=1").json()
    second = client.get("/api/data/datasets/spots?page_size=1&page=2").json()
    assert first["total"] == 2
    assert first["rows"][0]["id"] == 2
    assert second["rows"][0]["id"] == 1
    result = client.get("/api/data/datasets/spots", params={"q": "%"}).json()
    assert result["total"] == 1  # Percent is literal, not a SQL wildcard.
    assert result["rows"][0]["name"] == "100% 테스트"
    filtered = client.get(
        "/api/data/datasets/spots",
        params={
            "filter_column": "region",
            "filter_value": "강릉",
        },
    ).json()
    assert filtered["rows"][0]["id"] == 1
    injected = client.get(
        "/api/data/datasets/spots",
        params={
            "q": "' OR 1=1 --",
        },
    ).json()
    assert injected["total"] == 0
    forecast = client.get("/api/data/datasets/forecasts").json()["rows"][0]
    assert forecast["score"] is None
    assert forecast["availability"] == "unavailable"


@pytest.mark.parametrize(
    "path",
    [
        "spots?sort=password",
        "spots?sort=id;DROP%20TABLE%20spots_waterspot",
        "spots?filter_column=password&filter_value=x",
        "spots?page_size=101",
        "spots?page=0",
        "spots?page=1001",
        "spots?direction=unsafe",
    ],
)
def test_rejects_unbounded_or_unapproved_query(client, path):
    assert client.get(f"/api/data/datasets/{path}").status_code == 422


def test_unapproved_table_and_mutation_are_unavailable(client):
    assert client.get("/api/data/datasets/users_user").status_code == 404
    assert client.get("/api/data/datasets/forecasts_waterforecast").status_code == 404
    assert (
        client.post("/api/data/datasets/spots", json={"name": "x"}).status_code == 405
    )


def test_summary_does_not_treat_stale_running_as_live_or_missing_as_observed(client):
    result = client.get("/api/data/summary")
    assert result.status_code == 200
    summary = result.json()
    assert summary["heartbeat"]["effective_state"] == "stale"
    assert summary["heartbeat"]["state"] == "running"
    assert summary["providers"][0]["state"] == "missing"
    assert summary["forecasts"][0]["availability"] == "unavailable"
    assert (
        next(item for item in summary["datasets"] if item["key"] == "metrics")["count"]
        == 0
    )


def test_source_queries_use_read_only_transactions(data_settings):
    async def check():
        async with DataReader(data_settings).connection() as connection:
            row = await (
                await connection.execute("SHOW transaction_read_only")
            ).fetchone()
            return row["transaction_read_only"]

    assert asyncio.run(check()) == "on"


def test_connection_error_does_not_leak_credentials(client):
    with patch(
        "app.data_reader.psycopg.AsyncConnection.connect",
        new=AsyncMock(
            side_effect=psycopg.OperationalError("private credential marker"),
        ),
    ):
        response = client.get("/api/data/datasets/spots")
        assert response.status_code == 503
        assert "private" not in response.text


def test_legacy_api_is_not_mounted(data_settings):
    with TestClient(create_app(data_settings)) as client:
        assert len(client.get("/api/data/catalog").json()) == 14
        assert client.get("/api/collector/catalog").status_code == 404
        assert client.get("/api/collector/summary").status_code == 404
