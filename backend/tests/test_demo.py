import asyncio
from copy import deepcopy
from datetime import UTC, datetime

import psycopg
import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.demo import DemoReader
from app.demo_data import DEMO_CATALOG, SCENARIOS, build_demo
from app.main import create_app
from app.seed_demo import REFERENCES, write_demo

ANCHOR = datetime(2026, 9, 9, 3, tzinfo=UTC)
SPOTS = [
    {"id": 1, "name": "테스트 경포", "type": "beach", "lat": 37.803, "lng": 128.91},
    {"id": 2, "name": "테스트 안목", "type": "beach", "lat": 37.7719, "lng": 128.9487},
    {"id": 3, "name": "테스트 사천", "type": "beach", "lat": 37.836, "lng": 128.878},
]


def connect(settings):
    return psycopg.connect(
        host=settings.postgres_host,
        port=settings.postgres_port,
        dbname=settings.postgres_db,
        user=settings.postgres_user,
        password=settings.postgres_password.get_secret_value(),
    )


def test_generator_covers_all_missing_datasets_with_consistent_relationships():
    bundle = build_demo(SPOTS, ANCHOR)
    assert bundle == build_demo(SPOTS, ANCHOR)
    assert all(bundle["rows"].values())
    assert len(bundle["manifest"]["scenarios"]) == 6
    assert sum(bundle["manifest"]["counts"].values()) == 1678
    rows = bundle["rows"]
    for key, references in REFERENCES.items():
        for column, target in references.items():
            ids = {row["id"] for row in rows[target]}
            assert all(row[column] in ids for row in rows[key])
    for dataset in DEMO_CATALOG:
        keys = {column["key"] for column in dataset["columns"]}
        for row in rows[dataset["key"]]:
            assert set(row) == keys
            assert row["_demo_note"]
    assert all(
        not row["verified"] and not row["active"] for row in rows["calibrations"]
    )
    assert all(
        row["safety_status"] == "unknown" and row["score"] is None
        for key in ("scores", "forecasts")
        for row in rows[key]
    )
    for code, *_ in SCENARIOS:
        assert any(row["_demo_set"].startswith(code) for row in rows["metrics"])
    humidity = [
        row for row in rows["metrics"] if row["name"] == "relative_humidity_pct"
    ]
    assert len(humidity) == 36
    assert sum(row["numeric_value"] is None for row in humidity) == 6
    assert all(
        0 <= row["numeric_value"] <= 100
        for row in humidity
        if row["numeric_value"] is not None
    )
    values = {row["id"]: row for row in rows["metrics"]}
    for link in rows["lineage"]:
        derived, source = (
            values[link["derived_metric_id"]],
            values[link["source_metric_id"]],
        )
        assert derived["_demo_set"] == source["_demo_set"]
        assert derived["_demo_spot"] == source["_demo_spot"]
        if (
            derived["numeric_value"] is not None
            and source["name"] == "air_temperature_c"
        ):
            assert derived["numeric_value"] <= source["numeric_value"]
    assert all(
        row["provider"].startswith("PONGDANG_DEMO_") for row in rows["snapshots"]
    )
    assert all(row["key"] != "condition-pipeline" for row in rows["heartbeat"])


@pytest.fixture(scope="module")
def demo_settings():
    settings = Settings()
    if settings.postgres_db != "pongdang_test":
        pytest.fail("Demo tests require the disposable pongdang_test database")
    with connect(settings) as connection:
        assert (
            connection.execute("SELECT to_regnamespace('pongdang_demo')").fetchone()[0]
            is None
        )
        connection.execute("CREATE TABLE public.demo_test_sentinel (id integer)")
        connection.execute("INSERT INTO public.demo_test_sentinel VALUES (73)")
    # An invalid FK must roll back the entire seed, including schema creation.
    broken = deepcopy(build_demo(SPOTS, ANCHOR))
    broken["rows"]["metrics"][0]["snapshot_id"] = 999999
    with pytest.raises(psycopg.errors.ForeignKeyViolation):
        write_demo(settings, broken)
    with connect(settings) as connection:
        assert (
            connection.execute("SELECT to_regnamespace('pongdang_demo')").fetchone()[0]
            is None
        )
    result = write_demo(settings, build_demo(SPOTS, ANCHOR))
    assert result["created"] is True
    yield settings
    with connect(settings) as connection:
        assert connection.execute(
            "SELECT id FROM public.demo_test_sentinel"
        ).fetchall() == [(73,)]
        # Exact schema created by this fixture, only on disposable PostgreSQL.
        connection.execute("DROP SCHEMA pongdang_demo CASCADE")
        connection.execute("DROP TABLE public.demo_test_sentinel")


def test_seed_is_idempotent_and_does_not_overwrite(demo_settings):
    result = write_demo(demo_settings, build_demo(SPOTS, ANCHOR))
    assert result["created"] is False
    assert result["manifest"]["created_at"] == ANCHOR.isoformat()


def test_demo_queries_are_read_only_and_isolated_from_live(demo_settings):
    async def transaction_mode():
        async with DemoReader(demo_settings).connection() as connection:
            return await (
                await connection.execute("SHOW transaction_read_only")
            ).fetchone()

    assert asyncio.run(transaction_mode())["transaction_read_only"] == "on"
    settings = demo_settings.model_copy(update={"collector_db_host": ""})
    with TestClient(create_app(settings)) as client:
        summary = client.get("/api/demo/summary").json()
        assert summary["is_demo"] is True
        assert summary["heartbeat"] is None
        assert summary["demo_manifest"]["version"] == "collector-demo-v1"
        assert all(dataset["count"] > 0 for dataset in summary["datasets"])
        assert client.get("/api/collector/summary").status_code == 503
        assert all(
            "_demo_set" not in [c["key"] for c in d["columns"]]
            for d in client.get("/api/collector/catalog").json()
        )
        for dataset in DEMO_CATALOG:
            response = client.get(
                "/api/demo/datasets/" + dataset["key"], params={"page_size": 1}
            )
            assert response.status_code == 200
            assert response.json()["is_demo"] is True
            assert len(response.json()["rows"]) == 1
        result = client.get(
            "/api/demo/datasets/metrics",
            params={
                "filter_column": "name",
                "filter_value": "air_temperature_c",
                "q": "clear",
            },
        ).json()
        assert result["total"] == 6
        assert all(20 < row["numeric_value"] < 30 for row in result["rows"])
        humid = client.get(
            "/api/demo/datasets/metrics",
            params={
                "filter_column": "name",
                "filter_value": "relative_humidity_pct",
                "q": "humid",
            },
        ).json()
        assert humid["total"] == 6
        assert all(row["numeric_value"] == 86 for row in humid["rows"])
        assert (
            client.get(
                "/api/demo/datasets/metrics", params={"q": "' OR 1=1 --"}
            ).json()["total"]
            == 0
        )
        assert client.get("/api/demo/datasets/metrics?page_size=101").status_code == 422
        assert client.get("/api/demo/datasets/users_user").status_code == 404
        assert client.post("/api/demo/datasets/metrics", json={}).status_code == 405


def test_seed_rejects_source_target_before_connecting():
    settings = Settings()
    with pytest.raises(ValueError, match="shared"):
        write_demo(settings.model_copy(update={"postgres_host": "cksDB"}), {})
    with pytest.raises(ValueError, match="Unexpected"):
        write_demo(settings.model_copy(update={"postgres_db": "other"}), {})
