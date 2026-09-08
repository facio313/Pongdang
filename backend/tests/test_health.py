from unittest.mock import AsyncMock, patch

import psycopg
from fastapi.testclient import TestClient

from app.main import create_app


def test_health_and_database_readiness():
    with TestClient(create_app()) as client:
        assert client.get("/api/health").json() == {"status": "ok"}
        assert client.get("/api/ready").json() == {"status": "ok"}
        assert client.get("/api/openapi.json").status_code == 200


def test_database_outage_returns_503_without_connection_details():
    with TestClient(create_app()) as client:
        with patch(
            "app.main.check_database",
            new=AsyncMock(side_effect=psycopg.OperationalError("private credentials")),
        ):
            response = client.get("/api/ready")
            assert response.status_code == 503
            assert response.json() == {"detail": "Database unavailable"}
            assert client.get("/api/health").status_code == 200
