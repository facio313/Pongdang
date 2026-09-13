"""Retired example routes must never seed or serve synthetic records."""

from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.main import create_app


@pytest.mark.parametrize(
    "path",
    [
        "/api/demo",
        "/api/demo/catalog",
        "/api/demo/summary",
        "/api/demo/datasets/metrics",
        "/api/collector/summary",
    ],
)
def test_retired_routes_return_404_without_database_access(path):
    with (
        patch("app.main.check_database", new=AsyncMock()) as readiness,
        patch(
            "psycopg.connect", side_effect=AssertionError("Unexpected sync connection")
        ),
        patch(
            "psycopg.Connection.connect",
            side_effect=AssertionError("Unexpected sync connection"),
        ),
        patch(
            "psycopg.AsyncConnection.connect",
            side_effect=AssertionError("Retired routes must not open a database"),
        ),
        TestClient(create_app()) as client,
    ):
        assert client.get(path).status_code == 404
        assert client.post(path, json={}).status_code == 404
        readiness.assert_awaited_once()


def test_startup_and_catalog_never_seed_or_collect():
    # Only the explicit readiness check may access the database at startup.
    # Any separate read/write connection from a seed or collector fails this test.
    with (
        patch("app.main.check_database", new=AsyncMock()) as readiness,
        patch(
            "psycopg.connect", side_effect=AssertionError("Unexpected sync connection")
        ),
        patch(
            "psycopg.Connection.connect",
            side_effect=AssertionError("Unexpected sync connection"),
        ),
        patch(
            "psycopg.AsyncConnection.connect",
            side_effect=AssertionError("Startup/catalog must not seed or collect"),
        ),
        TestClient(create_app()) as client,
    ):
        response = client.get("/api/data/catalog")
        assert response.status_code == 200
        assert response.json()
        assert all(
            not column["key"].startswith("_demo")
            for dataset in response.json()
            for column in dataset["columns"]
        )
        paths = client.get("/api/openapi.json").json()["paths"]
        assert "/api/data/summary" in paths
        assert not any(path.startswith("/api/demo") for path in paths)
        readiness.assert_awaited_once()
