from pathlib import Path

from app.config import Settings
from app.data_reader import DataReader
from app.main import create_app


def test_legacy_environment_cannot_redirect_data_reads(monkeypatch):
    monkeypatch.setenv("COLLECTOR_DB_HOST", "unreachable-legacy.example")
    monkeypatch.setenv("COLLECTOR_DB_PASSWORD", "ignored-legacy-credential")
    settings = Settings()
    assert not any(name.startswith("collector_db_") for name in Settings.model_fields)
    assert DataReader(settings).settings.postgres_host == settings.postgres_host
    routes = create_app(settings).openapi()["paths"]
    assert "/api/data/summary" in routes
    assert "/api/collector/summary" not in routes


def test_compose_and_deployment_do_not_attach_legacy_networks():
    root = Path(__file__).resolve().parents[2]
    assert not (root / "compose.collector.yaml").exists()
    for path in (root / "compose.yaml", root / "ops/pongdang-deploy"):
        contents = path.read_text()
        assert "COLLECTOR_DB_" not in contents
        assert "cksDB" not in contents
        assert "compose.collector" not in contents
