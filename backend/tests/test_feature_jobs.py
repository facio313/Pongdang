"""Verify the domain branch shares durable collection scheduling."""

from datetime import UTC, datetime
from zoneinfo import ZoneInfo

import pytest
from test_condition_score_integration import database as database

import app.feature_jobs as feature_jobs_module
from app.config import Settings
from app.ingestion.jobs import FORECAST_JOBS, Job, scheduled_interval
from app.ingestion.worker import registered_jobs, run_due
from app.refresh.service import DYNAMIC_JOBS, PROJECTION_JOBS
from app.schema import connect, initialize


def test_forecast_schedule_and_publication_precede_static_collection():
    jobs = registered_jobs(Settings())
    names = [job.name for job in jobs]
    publication = names.index("condition_projection")
    for job in jobs:
        if job.name in DYNAMIC_JOBS:
            assert names.index(job.name) < publication
        elif job.external_collection:
            assert names.index(job.name) > publication
        if job.name in FORECAST_JOBS:
            assert scheduled_interval(job) == 1800
    assert FORECAST_JOBS <= set(names)
    by_name = {job.name: job for job in jobs}
    assert scheduled_interval(by_name["kma_nowcast"]) == 600
    assert scheduled_interval(by_name["kma_buoy"]) == 600
    assert scheduled_interval(by_name["koem_water_quality"]) == 86400


def test_result_retention_registers_and_schedules_next_kst_day(monkeypatch):
    settings = Settings()
    kst = ZoneInfo("Asia/Seoul")
    current = datetime(2026, 9, 23, 12, 34, 56, 123456, tzinfo=kst)

    class FrozenDatetime(datetime):
        @classmethod
        def now(cls, tz=None):
            return current.astimezone(tz)

    monkeypatch.setattr(feature_jobs_module, "datetime", FrozenDatetime)
    monkeypatch.setattr(
        "app.water_index.condition_storage.prune_condition_results",
        lambda _: 4,
    )
    jobs = registered_jobs(settings)
    names = [job.name for job in jobs]
    retention = jobs[names.index("condition_result_retention")]
    assert (
        names.index("condition_result_retention")
        == names.index("condition_projection") + 1
    )
    assert retention.interval_seconds == 600
    assert not retention.external_collection
    assert retention.name not in PROJECTION_JOBS
    assert retention.process() == {
        "received": 4,
        "inserted": 0,
        "state": "succeeded",
        "error": "",
        "next_run_seconds": 41104,
    }
    current = datetime(2026, 9, 23, 23, 59, 50, tzinfo=kst)
    assert retention.process()["next_run_seconds"] == 30


def test_result_retention_has_independent_backoff(database, monkeypatch):
    def failed_projection():
        raise RuntimeError("projection interrupted")

    projection = Job("condition_projection", 600, process=failed_projection)
    assert run_due(database, [projection])[0]["state"] == "failed"
    monkeypatch.setattr(
        "app.water_index.condition_storage.prune_condition_results",
        lambda _: 0,
    )
    retention = next(
        job
        for job in registered_jobs(database)
        if job.name == "condition_result_retention"
    )
    assert run_due(database, [retention])[0]["state"] == "succeeded"

    def failed_retention(_):
        raise RuntimeError("retention interrupted")

    monkeypatch.setattr(
        "app.water_index.condition_storage.prune_condition_results",
        failed_retention,
    )
    retention = next(
        job
        for job in registered_jobs(database)
        if job.name == "condition_result_retention"
    )
    report = run_due(database, [retention], force=True)[0]
    assert report["state"] == "failed"
    assert report["error"] == "COLLECTION_ERROR"
    with connect(database) as connection:
        assert connection.execute(
            "SELECT extract(epoch FROM next_run_at-finished_at) "
            "FROM pongdang_data.collection_job "
            "WHERE task_name='condition_result_retention'"
        ).fetchone() == (1200,)


def test_domain_job_restarts_due_backoff_and_sanitized_errors():
    settings = Settings()
    if settings.postgres_db != "pongdang_test":
        pytest.fail("Only disposable pongdang_test is permitted")
    initialize(settings)
    try:
        calls = []

        def process():
            calls.append(1)
            return dict(received=1, inserted=1, state="succeeded")

        job = Job("test-domain", 60, process=process)
        first = run_due(settings, [job])
        assert first[0]["state"] == "succeeded"
        assert run_due(settings, [job]) == []
        assert calls == [1]

        def failure():
            raise RuntimeError("secret-that-must-not-be-exposed")

        failed = Job("test-domain", 60, process=failure)
        report = run_due(settings, [failed], force=True)
        assert report[0]["error"] == "COLLECTION_ERROR"
        with connect(settings) as c:
            row = c.execute(
                "SELECT next_run_at,consecutive_failures,last_error FROM "
                "pongdang_data.collection_job WHERE task_name='test-domain'"
            ).fetchone()
        assert row[0] > datetime.now(UTC) and row[1] == 1
        assert row[2] == "COLLECTION_ERROR"
        assert run_due(settings, [job]) == []
        assert run_due(settings, [job], force=True)[0]["state"] == "succeeded"
    finally:
        with connect(settings) as c:
            c.execute("DROP SCHEMA pongdang_data CASCADE")
