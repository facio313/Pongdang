from datetime import UTC, datetime, timedelta

import psycopg
import pytest
from pydantic import ValidationError

from app.config import Settings
from app.ingestion import Batch, collect, ingest
from app.schema import connect, initialize


@pytest.fixture
def database():
    settings = Settings()
    if settings.postgres_db != "pongdang_test":
        pytest.fail("Requires disposable pongdang_test database")
    assert initialize(settings) is True
    assert initialize(settings) is False
    with connect(settings) as connection:
        connection.execute(
            "INSERT INTO pongdang_data.spots_waterspot (id,name) VALUES (1,'Test spot')"
        )
    yield settings
    with connect(settings) as connection:
        connection.execute("DROP SCHEMA pongdang_data CASCADE")


def batch():
    now = datetime.now(UTC) - timedelta(seconds=10)
    return Batch.model_validate(
        {
            "provider": "TEST_PROVIDER",
            "batch_key": "batch-1",
            "adapter_version": "v1",
            "observations": [
                {
                    "record_id": "station-1-time-1",
                    "spot_id": 1,
                    "observed_at": now - timedelta(hours=2),
                    "fetched_at": now,
                    "valid_until": now - timedelta(hours=1),
                    "spatial_scope": "station",
                    "metrics": [
                        {
                            "name": "air_temperature_c",
                            "numeric_value": 24.5,
                            "unit": "celsius",
                        },
                        {
                            "name": "relative_humidity_pct",
                            "numeric_value": None,
                            "unit": "percent",
                        },
                    ],
                }
            ],
        }
    )


def test_atomic_idempotent_import_preserves_expiry_and_missing(database):
    value = batch()
    assert ingest(database, value) is True
    assert ingest(database, value) is False
    with connect(database) as connection:
        assert connection.execute(
            "SELECT name,state FROM pongdang_data.conditions_observationmetric "
            "ORDER BY name"
        ).fetchall() == [
            ("air_temperature_c", "stale"),
            ("relative_humidity_pct", "missing"),
        ]
        assert (
            connection.execute(
                "SELECT valid_until FROM pongdang_data.conditions_observationsnapshot"
            ).fetchone()[0]
            == value.observations[0].valid_until
        )
        assert (
            connection.execute(
                "SELECT count(*) FROM pongdang_data.conditions_ingestionrun"
            ).fetchone()[0]
            == 1
        )
        assert (
            connection.execute(
                "SELECT count(*) FROM pongdang_data.conditions_conditionscore"
            ).fetchone()[0]
            == 0
        )
    changed = value.model_copy(deep=True)
    changed.observations[0].metrics[0].numeric_value = 999
    with pytest.raises(ValueError, match="different evidence"):
        ingest(database, changed)


def test_invalid_reference_rolls_back_every_row(database):
    value = batch()
    second = value.observations[0].model_copy(
        update={"record_id": "missing-spot", "spot_id": 999}
    )
    value.observations.append(second)
    with pytest.raises(psycopg.errors.ForeignKeyViolation):
        ingest(database, value)
    with connect(database) as connection:
        for table in (
            "conditions_observationmetric",
            "conditions_observationsnapshot",
            "conditions_ingestionrun",
            "ingestion_batches",
        ):
            assert (
                connection.execute(
                    psycopg.sql.SQL("SELECT count(*) FROM {}").format(
                        psycopg.sql.Identifier("pongdang_data", table)
                    )
                ).fetchone()[0]
                == 0
            )


def test_provider_failure_does_not_create_success_or_touch_evidence(database):
    class FailedProvider:
        def fetch(self):
            raise RuntimeError("upstream unavailable")

    with pytest.raises(RuntimeError):
        collect(database, FailedProvider())
    with connect(database) as connection:
        assert (
            connection.execute(
                "SELECT count(*) FROM pongdang_data.conditions_ingestionrun"
            ).fetchone()[0]
            == 0
        )


def test_rejects_demo_nonfinite_unknown_fields_and_duplicates():
    for change in (
        {"provider": "PONGDANG_DEMO"},
        {"password": "must-not-be-an-import-field"},
    ):
        with pytest.raises(ValidationError):
            Batch.model_validate({**batch().model_dump(), **change})
    value = batch().model_dump()
    value["observations"][0]["metrics"][0]["numeric_value"] = float("nan")
    with pytest.raises(ValidationError):
        Batch.model_validate(value)
    value = batch().model_dump()
    value["observations"] *= 2
    with pytest.raises(ValidationError):
        Batch.model_validate(value)
