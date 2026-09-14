from datetime import UTC, datetime, timedelta

import pytest
from pydantic import ValidationError

from app.config import Settings
from app.ingestion.http import Client, ProviderError
from app.ingestion.jobs import Job
from app.ingestion.models import Place, Reading, SourceBatch, Station, Value
from app.ingestion.storage import store_batch
from app.ingestion.worker import run_due, synchronize_jobs
from app.schema import VERSION, connect, initialize, remove_demo


@pytest.fixture
def db():
    settings = Settings()
    if settings.postgres_db != "pongdang_test":
        pytest.fail("Requires disposable pongdang_test")
    initialize(settings)
    yield settings
    with connect(settings) as c:
        c.execute("DROP SCHEMA pongdang_data CASCADE")
        c.execute("DROP SCHEMA IF EXISTS pongdang_demo CASCADE")


def evidence():
    now = datetime.now(UTC) - timedelta(minutes=1)
    return SourceBatch(
        provider="TEST_OFFICIAL",
        fetched_at=now,
        readings=[
            Reading(
                source_id="station-a/202601010000",
                station=Station(
                    source_id="station-a", name="Provider station", kind="buoy"
                ),
                observed_at=now - timedelta(hours=1),
                valid_until=now + timedelta(hours=1),
                spatial_scope="station only",
                values=[
                    Value(name="water_temperature", numeric_value=21.4, unit="degC"),
                    Value(name="wave_height", unit="m"),
                ],
            )
        ],
    )


def test_fetch_time_changes_do_not_duplicate_or_extend_evidence(db):
    batch = evidence()
    assert store_batch(db, batch) == 2  # station and reading
    again = batch.model_copy(update={"fetched_at": datetime.now(UTC)})
    assert store_batch(db, again) == 0
    with connect(db) as c:
        snapshot = c.execute(
            "SELECT fetched_at,valid_until,source_record_id FROM "
            "pongdang_data.conditions_observationsnapshot"
        ).fetchone()
        assert snapshot == (
            batch.fetched_at,
            batch.readings[0].valid_until,
            batch.readings[0].source_id,
        )
        assert c.execute(
            "SELECT state FROM pongdang_data.conditions_observationmetric "
            "WHERE name='wave_height'"
        ).fetchone() == ("missing",)
    revision = batch.model_copy(deep=True)
    revision.readings[0].values[0].numeric_value = 21.5
    assert store_batch(db, revision) == 1
    with connect(db) as c:
        assert c.execute(
            "SELECT count(*) FROM pongdang_data.conditions_observationsnapshot"
        ).fetchone() == (2,)
    assert store_batch(db, batch) == 0
    with connect(db) as c:
        current = c.execute(
            "SELECT m.numeric_value,s.fetched_at FROM "
            "pongdang_data.conditions_observationsnapshot s JOIN "
            "pongdang_data.conditions_observationmetric m ON m.snapshot_id=s.id "
            "WHERE s.state<>'superseded' AND m.name='water_temperature'"
        ).fetchall()
        assert current == [(21.4, batch.fetched_at)]
        assert c.execute(
            "SELECT state FROM pongdang_data.conditions_observationmetric "
            "WHERE name='wave_height' ORDER BY id"
        ).fetchall() == [("missing",), ("superseded",)]


def test_validation_precedes_all_writes(db):
    batch = evidence()
    batch.readings[0].values[0].numeric_value = float("inf")
    with pytest.raises(ValidationError):
        store_batch(db, batch)
    with connect(db) as c:
        assert c.execute(
            "SELECT count(*) FROM pongdang_data.collection_station"
        ).fetchone() == (0,)


def test_conflicting_records_or_station_metadata_are_not_order_dependent(db):
    for station_change in (False, True):
        batch = evidence()
        other = batch.readings[0].model_copy(deep=True)
        if station_change:
            other.source_id = "another-observation"
            other.station.name = "Conflicting station name"
        else:
            other.values[0].numeric_value = 900
        batch.readings.append(other)
        with pytest.raises(ValidationError, match="Conflicting"):
            store_batch(db, batch)
    with connect(db) as c:
        assert c.execute(
            "SELECT count(*) FROM pongdang_data.collection_station"
        ).fetchone() == (0,)


def test_station_correction_updates_common_place(db):
    batch = evidence()
    store_batch(db, batch)
    batch.readings[0].station.name = "Corrected official name"
    batch.readings[0].station.latitude = 37.8
    store_batch(db, batch)
    with connect(db) as c:
        assert c.execute(
            "SELECT s.name,s.lat FROM pongdang_data.spots_waterspot s "
            "JOIN pongdang_data.collection_station t ON t.spot_id=s.id"
        ).fetchone() == ("Corrected official name", 37.8)


def test_metadata_without_observations_is_no_data(db):
    batch = evidence()
    metadata = batch.model_copy(
        update={"readings": [], "stations": [batch.readings[0].station]}
    )
    job = Job("metadata_not_observations", 600, lambda: metadata)
    assert run_due(db, [job])[0]["state"] == "no_data"
    with connect(db) as c:
        assert c.execute(
            "SELECT last_success_at FROM pongdang_data.collection_job"
        ).fetchone() == (None,)
    catalog = metadata.model_copy(update={"catalog_only": True})
    assert (
        run_due(db, [Job("station_catalog", 600, lambda: catalog)])[0]["state"]
        == "succeeded"
    )


def test_due_schedule_failure_backoff_does_not_touch_observations(db):
    calls = []
    batch = evidence()

    def fetch():
        calls.append(True)
        return batch

    job = Job("test_collect", 600, fetch)
    assert run_due(db, [job])[0]["state"] == "succeeded"
    assert run_due(db, [job]) == []
    assert len(calls) == 1
    with connect(db) as c:
        saved = c.execute(
            "SELECT fetched_at,valid_until FROM "
            "pongdang_data.conditions_observationsnapshot"
        ).fetchall()
        last_success = c.execute(
            "SELECT last_success_at FROM pongdang_data.collection_job"
        ).fetchone()[0]

    def failed():
        raise ProviderError("HTTP_403")

    result = run_due(db, [Job(job.name, 600, failed)], force=True)
    assert result[0]["error"] == "HTTP_403"
    with connect(db) as c:
        assert (
            c.execute(
                "SELECT fetched_at,valid_until FROM "
                "pongdang_data.conditions_observationsnapshot"
            ).fetchall()
            == saved
        )
        state, failures, success, delay = c.execute(
            "SELECT state,consecutive_failures,last_success_at,"
            "extract(epoch from next_run_at-finished_at) "
            "FROM pongdang_data.collection_job"
        ).fetchone()
        assert (state, failures, success, delay) == ("failed", 1, last_success, 1200)
        assert c.execute(
            "SELECT count(*) FROM pongdang_data.conditions_ingestionrun "
            "WHERE status='failed'"
        ).fetchone() == (1,)


def test_parallel_worker_lock_skips_job_and_disabled_never_fetches(db):
    def unexpected():
        pytest.fail("Must not fetch")

    with connect(db) as lock:
        lock.execute("SELECT pg_advisory_lock(hashtext('pongdang-job/locked'))")
        try:
            assert run_due(db, [Job("locked", 60, unexpected)]) == []
        finally:
            lock.execute("SELECT pg_advisory_unlock(hashtext('pongdang-job/locked'))")
    assert run_due(db, [Job("disabled", 60, unexpected, False)]) == []


def test_demo_removal_preserves_real_collection_and_is_idempotent(db):
    store_batch(db, evidence())
    with connect(db) as c:
        c.execute("CREATE SCHEMA pongdang_demo")
        c.execute("CREATE TABLE pongdang_demo.synthetic (id int)")
        c.execute("INSERT INTO pongdang_demo.synthetic VALUES (1)")
    assert remove_demo(db) is True
    assert remove_demo(db) is False
    with connect(db) as c:
        assert c.execute(
            "SELECT count(*) FROM pongdang_data.collection_station"
        ).fetchone() == (1,)


def test_v1_upgrade_preserves_existing_rows(db):
    store_batch(db, evidence())
    with connect(db) as c:
        c.execute("DROP TABLE pongdang_data.collection_job")
        c.execute("DROP TABLE pongdang_data.collection_warning")
        c.execute("UPDATE pongdang_data.schema_version SET version=1")
    assert initialize(db) is True
    assert initialize(db) is False
    with connect(db) as c:
        assert c.execute(
            "SELECT count(*) FROM pongdang_data.collection_station"
        ).fetchone() == (1,)
        assert c.execute(
            "SELECT version FROM pongdang_data.schema_version"
        ).fetchone() == (VERSION,)


@pytest.mark.parametrize(
    "url",
    [
        "http://apis.data.go.kr/x",
        "https://example.org/x",
        "https://dapi.kakao.com:444/x",
    ],
)
def test_provider_client_never_sends_keys_to_unapproved_endpoints(url):
    with pytest.raises(ProviderError, match="ENDPOINT_NOT_ALLOWED"):
        Client().get_text(url, {"serviceKey": "private-test-value"})


def test_service_approval_disable_reason_and_reactivation(db):
    batch = evidence()
    job = Job(
        "approval_pending",
        86400,
        lambda: batch,
        enabled=False,
        disabled_reason="SERVICE_APPROVAL_UNCONFIRMED",
    )
    assert run_due(db, [job]) == []
    with connect(db) as c:
        assert c.execute(
            "SELECT state,last_error,last_success_at FROM pongdang_data.collection_job"
        ).fetchone() == ("disabled", "SERVICE_APPROVAL_UNCONFIRMED", None)
    active = Job(job.name, 86400, lambda: batch)
    synchronize_jobs(db, [active])
    assert run_due(db, [active], force=True)[0]["state"] == "succeeded"
    with connect(db) as c:
        assert c.execute(
            "SELECT state,last_error FROM pongdang_data.collection_job"
        ).fetchone() == ("succeeded", "")


def test_place_provider_times_migrate_and_are_readable_without_new_observations(db):
    from fastapi.testclient import TestClient

    from app.main import create_app

    # Simulate the existing v5 catalogue. Migration must keep the existing record.
    now = datetime.now(UTC)
    place = Place(
        source_id="official-content-id",
        name="Official catalogue entry",
        kind="tourism",
        latitude=37.8,
        longitude=128.9,
    )
    batch = SourceBatch(provider="TOURAPI_ENGLISH", fetched_at=now, places=[place])
    assert store_batch(db, batch) == 1
    with connect(db) as c:
        c.execute(
            "ALTER TABLE pongdang_data.collection_place "
            "DROP COLUMN source_created_at, DROP COLUMN source_modified_at"
        )
        c.execute(
            "ALTER TABLE pongdang_data.collection_station "
            "DROP COLUMN source_valid_from, DROP COLUMN source_valid_until"
        )
        c.execute("UPDATE pongdang_data.schema_version SET version=5 WHERE id=1")
    assert initialize(db)
    assert not initialize(db)
    with connect(db) as c:
        assert c.execute(
            "SELECT source_id,source_created_at,source_modified_at "
            "FROM pongdang_data.collection_place"
        ).fetchone() == (
            place.source_id,
            None,
            None,
        )
    station = Station(
        source_id="official-zone",
        name="Official forecast zone",
        kind="forecast_zone",
        source_valid_from=now - timedelta(days=100),
        source_valid_until=now + timedelta(days=100),
    )
    store_batch(
        db,
        SourceBatch(
            provider="KMA_FORECAST_ZONES",
            fetched_at=now,
            catalog_only=True,
            stations=[station],
        ),
    )
    place.source_created_at = now - timedelta(days=100)
    place.source_modified_at = now - timedelta(days=2)
    assert store_batch(db, batch) == 0  # Updates the original catalogue identity.
    with TestClient(create_app(db)) as client:
        response = client.get(
            "/api/data/datasets/source-places",
            params={
                "filter_column": "provider",
                "filter_value": batch.provider,
            },
        )
        assert response.status_code == 200
        result = response.json()
        assert result["total"] == 1
        row = result["rows"][0]
        assert (
            datetime.fromisoformat(row["source_created_at"]) == place.source_created_at
        )
        assert (
            datetime.fromisoformat(row["source_modified_at"])
            == place.source_modified_at
        )
        assert client.get("/api/data/datasets/snapshots").json()["total"] == 0
        station_row = client.get("/api/data/datasets/source-stations").json()["rows"][0]
        assert (
            datetime.fromisoformat(station_row["source_valid_from"])
            == station.source_valid_from
        )
        assert (
            datetime.fromisoformat(station_row["source_valid_until"])
            == station.source_valid_until
        )
        assert (
            client.get("/api/data/datasets/source-places?page_size=101").status_code
            == 422
        )


def test_nullable_catalogue_metadata_preserves_existing_evidence_hash():
    import hashlib

    from app.ingestion.storage import digest

    reading = evidence().readings[0]
    original_json = reading.model_dump_json(
        exclude={
            "station": {"source_valid_from", "source_valid_until"},
        }
    )
    assert digest(reading) == hashlib.sha256(original_json.encode()).hexdigest()
