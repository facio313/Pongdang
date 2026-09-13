"""Verify the domain branch shares durable collection scheduling."""

from datetime import UTC, datetime

import pytest

from app.config import Settings
from app.ingestion.jobs import Job
from app.ingestion.worker import run_due
from app.schema import connect, initialize


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
