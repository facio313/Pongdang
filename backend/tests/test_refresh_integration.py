"""Disposable PostgreSQL: HTTP queue -> existing worker -> projection result."""

from datetime import UTC, datetime, timedelta

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import SecretStr

from app.config import Settings
from app.ingestion.http import ProviderError
from app.ingestion.jobs import Job
from app.ingestion.models import Reading, SourceBatch, Station, Value
from app.ingestion.worker import run_due, synchronize_jobs
from app.refresh.api import create_router
from app.refresh.migrations import migrate_refresh
from app.refresh.service import enqueue_refresh, read_refresh, run_pending_refresh
from app.schema import connect, initialize


@pytest.fixture
def db(monkeypatch):
    from app.water_index import condition_storage

    # These tests isolate worker scheduling with a deliberately stubbed score
    # processor. Real source-generation invalidation has its own integration tests.
    monkeypatch.setattr(condition_storage, "projection_due", lambda _: False)
    conf = Settings()
    if conf.postgres_db != "pongdang_test":
        pytest.fail("Requires disposable pongdang_test")
    conf = conf.model_copy(
        update={
            "sso_proxy_secret": SecretStr("refresh-test-secret-with-32-characters"),
            "sso_allowed_origins": "https://example.test",
        }
    )
    initialize(conf)
    with connect(conf) as c:
        migrate_refresh(c)
    yield conf
    with connect(conf) as c:
        c.execute("DROP SCHEMA pongdang_data CASCADE")


def batch(value=19):
    now = datetime.now(UTC)
    return SourceBatch(
        provider="REFRESH_TEST",
        fetched_at=now,
        readings=[
            Reading(
                source_id="observation-1",
                station=Station(source_id="station", name="Isolated test", kind="buoy"),
                observed_at=now - timedelta(minutes=1),
                valid_until=now + timedelta(hours=1),
                spatial_scope="OFFLINE TEST ONLY",
                values=[
                    Value(name="water_temperature", numeric_value=value, unit="°C")
                ],
            )
        ],
    )


def projection(calls, *, state="succeeded"):
    def process():
        calls.append("projection")
        return dict(received=0, inserted=0, state=state)

    return Job("condition_projection", 600, process=process)


def test_http_queue_coalesces_and_waits_for_persisted_data_then_scores(db):
    calls = []

    def fetch():
        calls.append("source")
        return batch()

    def score():
        with connect(db) as c:
            assert c.execute(
                "SELECT count(*) FROM pongdang_data.conditions_observationsnapshot"
            ).fetchone() == (1,)
        calls.append("score")
        return dict(received=1, inserted=1, state="succeeded")

    jobs = [
        Job("kma_nowcast", 300, fetch),
        Job("condition_projection", 600, process=score),
        Job("place_photos", 300, process=lambda: pytest.fail("Static job")),
    ]
    app = FastAPI()
    app.include_router(create_router(db))
    headers = {
        "X-Pongdang-SSO-Token": "refresh-test-secret-with-32-characters",
        "X-Pongdang-SSO-Subject": "existing-sso-user",
        "X-Pongdang-SSO-Grants": "access-pongdang",
        "Origin": "https://example.test",
    }
    with TestClient(app) as http:
        first = http.post("/api/data/refresh", json={}, headers=headers)
        second = http.post("/api/data/refresh", json={}, headers=headers)
        assert first.status_code == second.status_code == 202
        assert first.json() == second.json()
        assert calls == []  # POST only queues; GET only reads.
        request_id = first.json()["request_id"]
        assert (
            http.get(f"/api/data/refresh/{request_id}", headers=headers).json()[
                "status"
            ]
            == "queued"
        )
        assert calls == []
        run_pending_refresh(db, jobs)
        result = http.get(f"/api/data/refresh/{request_id}", headers=headers).json()
        assert result["status"] == "succeeded"
        assert result["finished_at"] is not None and result["failed_jobs"] == []
        assert calls == ["source", "score"]
        assert run_pending_refresh(db, jobs) is None
        assert run_due(db, jobs[:2]) == []
        assert calls == ["source", "score"]


def test_manual_refresh_bypasses_normal_interval_but_preserves_failure_backoff(db):
    calls = []
    source = Job("kma_nowcast", 3600, lambda: batch())
    score = projection(calls)
    run_due(db, [source, score])
    request = enqueue_refresh(db)
    run_pending_refresh(db, [source, score])
    assert read_refresh(db, request["request_id"])["status"] == "succeeded"
    assert calls == ["projection", "projection"]

    def fail():
        raise ProviderError("HTTP_429")

    failed_source = Job("kma_nowcast", 3600, fail)
    run_due(db, [failed_source], force=True)
    with connect(db) as c:
        previous = c.execute(
            "SELECT next_run_at,last_success_at,consecutive_failures "
            "FROM pongdang_data.collection_job WHERE task_name='kma_nowcast'"
        ).fetchone()
        observations = c.execute(
            "SELECT count(*),max(valid_until) FROM "
            "pongdang_data.conditions_observationsnapshot"
        ).fetchone()
    blocked = Job("kma_nowcast", 3600, lambda: pytest.fail("Backoff bypass"))
    request = enqueue_refresh(db)
    run_pending_refresh(db, [blocked, score])
    result = read_refresh(db, request["request_id"])
    assert result["status"] == "failed" and result["failed_jobs"] == ["kma_nowcast"]
    with connect(db) as c:
        assert (
            c.execute(
                "SELECT next_run_at,last_success_at,consecutive_failures "
                "FROM pongdang_data.collection_job WHERE task_name='kma_nowcast'"
            ).fetchone()
            == previous
        )
        assert (
            c.execute(
                "SELECT count(*),max(valid_until) FROM "
                "pongdang_data.conditions_observationsnapshot"
            ).fetchone()
            == observations
        )


def test_pending_locked_job_resumes_without_repeating_completed_sources(db):
    calls = []

    def source(name):
        def fetch():
            calls.append(name)
            return batch()

        return Job(name, 600, fetch)

    jobs = [source("kma_nowcast"), source("kma_aws"), projection(calls)]
    request = enqueue_refresh(db)
    with connect(db) as guard:
        guard.execute("SELECT pg_advisory_lock(hashtext('pongdang-job/kma_nowcast'))")
        try:
            run_pending_refresh(db, jobs)
            assert calls == ["kma_aws"]
            assert read_refresh(db, request["request_id"])["status"] == "running"
            assert enqueue_refresh(db)["request_id"] == request["request_id"]
        finally:
            guard.execute(
                "SELECT pg_advisory_unlock(hashtext('pongdang-job/kma_nowcast'))"
            )
    run_pending_refresh(db, jobs)
    assert calls == ["kma_aws", "kma_nowcast", "projection"]
    assert read_refresh(db, request["request_id"])["status"] == "succeeded"


def test_concurrent_automatic_result_can_fulfill_requested_source(db):
    calls = []

    def fetch():
        calls.append("source")
        return batch()

    source = Job("kma_nowcast", 600, fetch)
    request = enqueue_refresh(db)
    run_due(db, [source])
    run_pending_refresh(db, [source, projection(calls)])
    assert calls == ["source", "projection"]
    assert read_refresh(db, request["request_id"])["status"] == "succeeded"


@pytest.mark.parametrize("state", ["partial", "no_data", "failed"])
def test_unsuccessful_sources_are_reported_without_claiming_full_refresh(db, state):
    source = Job(
        "kma_nowcast",
        600,
        process=lambda: dict(
            received=1 if state == "partial" else 0, inserted=0, state=state
        ),
        external_collection=True,
    )
    request = enqueue_refresh(db)
    run_pending_refresh(db, [source, projection([])])
    result = read_refresh(db, request["request_id"])
    assert result["status"] == ("partial" if state == "partial" else "failed")
    assert result["failed_jobs"] == ["kma_nowcast"]


def test_missing_source_configuration_or_score_projection_fails_explicitly(db):
    request = enqueue_refresh(db)
    run_pending_refresh(db, [projection([])])
    assert read_refresh(db, request["request_id"])["failed_jobs"] == ["external_data"]
    request = enqueue_refresh(db)
    run_pending_refresh(db, [Job("kma_nowcast", 600, lambda: batch())])
    result = read_refresh(db, request["request_id"])
    assert result["status"] == "failed"
    assert result["failed_jobs"] == ["condition_projection"]


def test_external_continuations_and_existing_fast_schedules_obey_minimum(db):
    job = Job(
        "external_catalog",
        86400,
        process=lambda: dict(
            received=1, inserted=1, state="partial", next_run_seconds=60
        ),
        external_collection=True,
    )
    run_due(db, [job])
    fast = Job("kma_nowcast", 300, lambda: batch())
    synchronize_jobs(db, [fast])
    with connect(db) as c:
        assert c.execute(
            "SELECT extract(epoch FROM next_run_at-finished_at) FROM "
            "pongdang_data.collection_job WHERE task_name='external_catalog'"
        ).fetchone() == (600,)
        c.execute(
            "UPDATE pongdang_data.collection_job SET interval_seconds=300,"
            "finished_at=now(),next_run_at=now()+interval '300 seconds' "
            "WHERE task_name='kma_nowcast'"
        )
    synchronize_jobs(db, [fast])
    with connect(db) as c:
        assert c.execute(
            "SELECT interval_seconds,extract(epoch FROM next_run_at-finished_at) "
            "FROM pongdang_data.collection_job WHERE task_name='kma_nowcast'"
        ).fetchone() == (600, 600)


def test_forecast_interval_shortening_preserves_failure_backoff(db):
    forecast = Job("kma_short_forecast", 3600, lambda: batch())
    run_due(db, [forecast])
    with connect(db) as c:
        c.execute(
            "UPDATE pongdang_data.collection_job SET interval_seconds=3600,"
            "next_run_at=finished_at+interval '1 hour' "
            "WHERE task_name='kma_short_forecast'"
        )
    synchronize_jobs(db, [forecast])
    with connect(db) as c:
        assert c.execute(
            "SELECT interval_seconds,extract(epoch FROM next_run_at-finished_at) "
            "FROM pongdang_data.collection_job WHERE task_name='kma_short_forecast'"
        ).fetchone() == (1800, 1800)
        c.execute(
            "UPDATE pongdang_data.collection_job SET interval_seconds=3600,"
            "consecutive_failures=1,next_run_at=finished_at+interval '2 hours' "
            "WHERE task_name='kma_short_forecast'"
        )
    synchronize_jobs(db, [forecast])
    with connect(db) as c:
        assert c.execute(
            "SELECT interval_seconds,extract(epoch FROM next_run_at-finished_at) "
            "FROM pongdang_data.collection_job WHERE task_name='kma_short_forecast'"
        ).fetchone() == (1800, 7200)
    assert run_due(db, [forecast]) == []


@pytest.mark.parametrize("source_state", ["failed", "no_data"])
def test_one_unavailable_provider_does_not_block_independent_source_or_score(
    db, source_state
):
    calls = []

    def unavailable():
        if source_state == "failed":
            raise ProviderError("NETWORK_ERROR")
        return SourceBatch(provider="EMPTY_TEST", fetched_at=datetime.now(UTC))

    def project():
        with connect(db) as c:
            assert c.execute(
                "SELECT count(*) FROM pongdang_data.conditions_observationsnapshot"
            ).fetchone() == (1,)
        calls.append("projection")
        return dict(received=1, inserted=1, state="succeeded")

    jobs = [
        Job("unavailable_source", 600, unavailable),
        Job("independent_source", 600, lambda: batch()),
        Job("condition_projection", 600, process=project),
    ]
    outcomes = run_due(db, jobs)
    assert [outcome["state"] for outcome in outcomes] == [
        source_state,
        "succeeded",
        "succeeded",
    ]
    assert calls == ["projection"]


def test_changed_score_inputs_run_before_interval_but_not_during_backoff(
    db, monkeypatch
):
    from app.water_index import condition_storage

    calls = []
    job = projection(calls)
    assert run_due(db, [job])[0]["state"] == "succeeded"
    assert run_due(db, [job]) == []
    monkeypatch.setattr(condition_storage, "projection_due", lambda _: True)
    assert run_due(db, [job])[0]["state"] == "succeeded"
    assert calls == ["projection", "projection"]
    broken = projection(calls, state="failed")
    assert run_due(db, [broken], force=True)[0]["state"] == "failed"
    assert run_due(db, [job]) == []
    assert calls == ["projection", "projection", "projection"]
