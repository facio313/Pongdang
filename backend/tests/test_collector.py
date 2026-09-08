import asyncio
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, patch

import psycopg
import pytest
from fastapi.testclient import TestClient
from psycopg import sql

from app.collector import CATALOG, CollectorReader
from app.config import Settings
from app.main import create_app


@pytest.fixture(scope="module")
def collector_settings():
    settings = Settings()
    if settings.postgres_db != "pongdang_test":
        pytest.fail("Collector fixtures require the disposable pongdang_test database")
    settings = settings.model_copy(
        update={
            "collector_db_host": settings.postgres_host,
            "collector_db_port": settings.postgres_port,
            "collector_db_name": settings.postgres_db,
            "collector_db_user": settings.postgres_user,
            "collector_db_password": settings.postgres_password,
        }
    )
    # Only disposable CI PostgreSQL receives these synthetic query fixtures.
    types = {
        "text": "text",
        "number": "double precision",
        "boolean": "boolean",
        "json": "jsonb",
        "datetime": "timestamptz",
        "date": "date",
    }
    with psycopg.connect(
        host=settings.postgres_host,
        port=settings.postgres_port,
        dbname=settings.postgres_db,
        user=settings.postgres_user,
        password=settings.postgres_password.get_secret_value(),
    ) as connection:
        for dataset in CATALOG:
            columns = [
                sql.SQL("{} {}").format(
                    sql.Identifier(column["key"]),
                    sql.SQL(
                        "bigint PRIMARY KEY"
                        if column["key"] == "id"
                        else types[column["type"]]
                    ),
                )
                for column in dataset["columns"]
            ]
            connection.execute(
                sql.SQL("CREATE TABLE {} ({})").format(
                    sql.Identifier(dataset["table"]),
                    sql.SQL(", ").join(columns),
                )
            )
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
    ) as connection:
        for dataset in CATALOG:
            connection.execute(
                sql.SQL("DROP TABLE {}").format(
                    sql.Identifier(dataset["table"]),
                )
            )


@pytest.fixture
def client(collector_settings):
    with TestClient(create_app(collector_settings)) as client:
        yield client


def test_pagination_filter_search_and_null_values(client):
    first = client.get("/api/collector/datasets/spots?page_size=1").json()
    second = client.get("/api/collector/datasets/spots?page_size=1&page=2").json()
    assert first["total"] == 2
    assert first["rows"][0]["id"] == 2
    assert second["rows"][0]["id"] == 1
    result = client.get("/api/collector/datasets/spots", params={"q": "%"}).json()
    assert result["total"] == 1  # Percent is literal, not a SQL wildcard.
    assert result["rows"][0]["name"] == "100% 테스트"
    filtered = client.get(
        "/api/collector/datasets/spots",
        params={
            "filter_column": "region",
            "filter_value": "강릉",
        },
    ).json()
    assert filtered["rows"][0]["id"] == 1
    injected = client.get(
        "/api/collector/datasets/spots",
        params={
            "q": "' OR 1=1 --",
        },
    ).json()
    assert injected["total"] == 0
    forecast = client.get("/api/collector/datasets/forecasts").json()["rows"][0]
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
    assert client.get(f"/api/collector/datasets/{path}").status_code == 422


def test_unapproved_table_and_mutation_are_unavailable(client):
    assert client.get("/api/collector/datasets/users_user").status_code == 404
    assert (
        client.get("/api/collector/datasets/forecasts_waterforecast").status_code == 404
    )
    assert (
        client.post("/api/collector/datasets/spots", json={"name": "x"}).status_code
        == 405
    )


def test_summary_does_not_treat_stale_running_as_live_or_missing_as_observed(client):
    result = client.get("/api/collector/summary")
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


def test_source_queries_use_read_only_transactions(collector_settings):
    async def check():
        async with CollectorReader(collector_settings).connection() as connection:
            row = await (
                await connection.execute("SHOW transaction_read_only")
            ).fetchone()
            return row["transaction_read_only"]

    assert asyncio.run(check()) == "on"


def test_connection_error_does_not_leak_credentials(client):
    with patch(
        "app.collector.psycopg.AsyncConnection.connect",
        new=AsyncMock(
            side_effect=psycopg.OperationalError("private credential marker"),
        ),
    ):
        response = client.get("/api/collector/datasets/spots")
        assert response.status_code == 503
        assert "private" not in response.text


def test_catalog_remains_available_without_source_configuration():
    settings = Settings().model_copy(update={"collector_db_host": ""})
    with TestClient(create_app(settings)) as client:
        assert len(client.get("/api/collector/catalog").json()) == 14
        assert client.get("/api/collector/summary").status_code == 503
