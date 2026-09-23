"""Restart-safe periodic collector and worker-owned explicit refresh requests."""

import argparse
import signal
import threading
from dataclasses import replace
from datetime import UTC, datetime, timedelta
from time import monotonic

from psycopg.errors import QueryCanceled
from psycopg.types.json import Jsonb

from app.config import Settings
from app.ingestion.errors import SourceScopeTooLargeError
from app.ingestion.http import ProviderError
from app.ingestion.jobs import scheduled_interval
from app.ingestion.storage import store_batch
from app.schema import connect
from app.water_index.condition_storage import ConditionInputsChanged


def registered_jobs(settings):
    from app.attachments.collector import attachment_jobs
    from app.feature_jobs import feature_jobs
    from app.ingestion.administrative import administrative_jobs
    from app.ingestion.environment import environment_jobs
    from app.ingestion.marine import marine_jobs
    from app.ingestion.marine_extra import marine_extra_jobs
    from app.ingestion.places import place_jobs
    from app.ingestion.water import water_jobs
    from app.ingestion.water_tour_extra import water_tour_extra_jobs
    from app.ingestion.weather import weather_jobs
    from app.place_details.collector import place_detail_jobs
    from app.refresh.service import DYNAMIC_JOBS

    external_jobs = (
        weather_jobs(settings)
        + marine_jobs(settings)
        + water_jobs(settings)
        + place_jobs(settings)
        + marine_extra_jobs(settings)
        + environment_jobs(settings)
        + water_tour_extra_jobs(settings)
        + administrative_jobs(settings)
    )
    sources = [
        replace(
            job,
            interval_seconds=scheduled_interval(job),
            external_collection=True,
        )
        for job in external_jobs
    ]
    # Live-camera checks also contact providers. Internal projections and
    # heartbeat/notification scheduling retain their separate semantics.
    features = [
        replace(
            job,
            interval_seconds=max(600, job.interval_seconds),
            external_collection=True,
        )
        if job.name == "livecam_checks"
        else job
        for job in feature_jobs(settings)
    ]
    # Publish product conditions immediately after collecting their inputs.
    # Optional assessment/history and catalogue enrichment can take longer;
    # they must not hold up the generation read by the home/today screens.
    jobs = [job for job in sources if job.name in DYNAMIC_JOBS]
    jobs += [job for job in features if job.name == "condition_projection"]
    jobs += [job for job in features if job.name != "condition_projection"]
    jobs += [job for job in sources if job.name not in DYNAMIC_JOBS] + [
        replace(
            job,
            interval_seconds=max(600, job.interval_seconds),
            external_collection=True,
        )
        for job in place_detail_jobs(settings) + attachment_jobs(settings)
    ]
    return jobs


def heartbeat(settings, state="running", tasks=None):
    with connect(settings) as c:
        c.execute(
            "INSERT INTO pongdang_data.conditions_pipelineheartbeat "
            "(key,state,current_tasks,last_seen_at,updated_at) "
            "VALUES ('condition-pipeline',%s,%s,now(),now()) "
            "ON CONFLICT(key) DO UPDATE SET state=EXCLUDED.state,"
            "current_tasks=EXCLUDED.current_tasks,last_seen_at=now(),updated_at=now()",
            [state, Jsonb(tasks or [])],
        )


def synchronize_jobs(settings, jobs):
    with connect(settings) as c:
        for job in jobs:
            c.execute(
                "INSERT INTO pongdang_data.collection_job "
                "(task_name,state,interval_seconds,next_run_at,consecutive_failures,"
                "last_error,records_received,records_inserted) "
                "VALUES (%s,%s,%s,now(),0,%s,0,0) "
                "ON CONFLICT(task_name) DO UPDATE SET "
                "interval_seconds=EXCLUDED.interval_seconds,"
                "next_run_at=CASE WHEN collection_job.consecutive_failures=0 "
                "AND collection_job.finished_at IS NOT NULL "
                "AND EXCLUDED.interval_seconds>collection_job.interval_seconds "
                "THEN GREATEST(collection_job.next_run_at,"
                "collection_job.finished_at+EXCLUDED.interval_seconds*interval "
                "'1 second') WHEN collection_job.consecutive_failures=0 "
                "AND collection_job.finished_at IS NOT NULL "
                "AND EXCLUDED.interval_seconds<collection_job.interval_seconds "
                "THEN LEAST(collection_job.next_run_at,"
                "collection_job.finished_at+EXCLUDED.interval_seconds*interval "
                "'1 second') ELSE collection_job.next_run_at END,"
                "state=CASE WHEN EXCLUDED.state='disabled' THEN 'disabled' "
                "WHEN collection_job.state='disabled' THEN 'pending' "
                "ELSE collection_job.state END,last_error=CASE WHEN "
                "EXCLUDED.state='disabled' "
                "THEN EXCLUDED.last_error ELSE collection_job.last_error END",
                [
                    job.name,
                    "pending" if job.enabled else "disabled",
                    scheduled_interval(job),
                    "" if job.enabled else job.disabled_reason,
                ],
            )


def run_due(
    settings, jobs, *, force=False, refresh_id=None, requested_at=None, before_job=None
):
    """Session advisory locks prevent concurrent workers from duplicating a job."""
    outcomes = []
    synchronize_jobs(settings, jobs)
    for job in jobs:
        if not job.enabled:
            continue
        if before_job is not None:
            before_job()
        with connect(settings) as guard:
            guard.autocommit = True
            locked = guard.execute(
                "SELECT pg_try_advisory_lock(hashtext(%s))",
                ["pongdang-job/" + job.name],
            ).fetchone()[0]
            if not locked:
                continue
            try:
                row = guard.execute(
                    "SELECT next_run_at,consecutive_failures,state,started_at,"
                    "finished_at FROM "
                    "pongdang_data.collection_job "
                    "WHERE task_name=%s",
                    [job.name],
                ).fetchone()
                if refresh_id is not None:
                    from app.refresh.service import TERMINAL_STATES, finish_task

                    task = guard.execute(
                        "SELECT state FROM pongdang_data.collection_refresh_task "
                        "WHERE request_id=%s AND task_name=%s",
                        [refresh_id, job.name],
                    ).fetchone()
                    if task is None or task[0] in TERMINAL_STATES:
                        continue
                    # A concurrent automatic run can fulfill this request, but
                    # only if its work started after the requested boundary.
                    if (
                        row[2] in TERMINAL_STATES
                        and row[3] is not None
                        and row[3] >= requested_at
                        and row[4] is not None
                    ):
                        with connect(settings) as c:
                            finish_task(c, refresh_id, job.name, row[2], row[4])
                        outcomes.append(
                            dict(
                                job=job.name,
                                state=row[2],
                                received=0,
                                inserted=0,
                                error="",
                            )
                        )
                        continue
                    if row[1] and row[0] and row[0] > datetime.now(UTC):
                        # Manual refresh never cancels provider failure backoff.
                        with connect(settings) as c:
                            finish_task(
                                c, refresh_id, job.name, "failed", datetime.now(UTC)
                            )
                        outcomes.append(
                            dict(
                                job=job.name,
                                state="failed",
                                received=0,
                                inserted=0,
                                error="REFRESH_BACKOFF_ACTIVE",
                            )
                        )
                        continue
                elif not force and row[0] and row[0] > datetime.now(UTC):
                    if job.name != "condition_projection" or row[1]:
                        continue
                    from app.water_index.condition_storage import projection_due

                    # A source change or new target day makes the persisted
                    # score generation due immediately, without upstream I/O.
                    if not projection_due(guard):
                        continue
                started = datetime.now(UTC)
                with connect(settings) as c:
                    c.execute(
                        "UPDATE pongdang_data.collection_job SET "
                        "state='running',started_at=%s "
                        "WHERE task_name=%s",
                        [started, job.name],
                    )
                    if refresh_id is not None:
                        c.execute(
                            "UPDATE pongdang_data.collection_refresh_task "
                            "SET state='running' WHERE request_id=%s AND task_name=%s",
                            [refresh_id, job.name],
                        )
                heartbeat(settings, tasks=[job.name])
                state, error, received, inserted = "succeeded", "", 0, 0
                next_run_seconds = None
                try:
                    if job.process is not None:
                        result = job.process()
                        received, inserted = result["received"], result["inserted"]
                        state, error = result["state"], result.get("error", "")
                        if state not in {"succeeded", "partial", "no_data", "failed"}:
                            raise ValueError("Unknown domain job result")
                        next_run_seconds = result.get("next_run_seconds")
                        if next_run_seconds is not None and (
                            type(next_run_seconds) is not int
                            or not 30 <= next_run_seconds <= 86400
                        ):
                            raise ValueError("Invalid domain job continuation delay")
                    else:
                        batch = job.fetch()
                        received = (
                            len(batch.readings)
                            + len(batch.stations)
                            + len(batch.places)
                            + len(batch.place_details)
                            + len(batch.warnings)
                        )
                        inserted = store_batch(settings, batch)
                        has_data = bool(
                            batch.readings
                            or batch.places
                            or batch.place_details
                            or batch.warnings
                        )
                        if batch.catalog_only and batch.stations:
                            has_data = True
                        if not has_data:
                            state = "no_data"
                        elif batch.coverage == "bounded":
                            state = "partial"
                            error = "BOUNDED_CATALOG"
                except ProviderError as exc:
                    state, error = "failed", exc.code
                except SourceScopeTooLargeError:
                    state, error = "failed", "SOURCE_SCOPE_TOO_LARGE"
                except ConditionInputsChanged:
                    state, error = "failed", "CONDITION_INPUT_CHANGED"
                except QueryCanceled:
                    state, error = "failed", "DATABASE_STATEMENT_TIMEOUT"
                except Exception:
                    # Exceptions can contain request URLs, keys or database credentials.
                    state, error = "failed", "COLLECTION_ERROR"
                finished = datetime.now(UTC)
                failures = (int(row[1] or 0) + 1) if state == "failed" else 0
                delay = (
                    30
                    if error == "CONDITION_INPUT_CHANGED"
                    and job.name == "condition_projection"
                    else min(86400, scheduled_interval(job) * 2 ** min(failures, 6))
                    if failures
                    else next_run_seconds
                    if next_run_seconds is not None
                    and state in {"succeeded", "partial"}
                    else scheduled_interval(job)
                )
                if job.external_collection or job.fetch is not None:
                    delay = max(600, delay)
                next_run = finished + timedelta(seconds=delay)
                with connect(settings) as c:
                    c.execute(
                        "UPDATE pongdang_data.collection_job SET "
                        "state=%s,finished_at=%s,"
                        "last_success_at=CASE WHEN %s IN ('succeeded','partial') "
                        "THEN %s "
                        "ELSE last_success_at "
                        "END,next_run_at=%s,consecutive_failures=%s,"
                        "last_error=%s,records_received=%s,records_inserted=%s WHERE "
                        "task_name=%s",
                        [
                            state,
                            finished,
                            state,
                            finished,
                            next_run,
                            failures,
                            error,
                            received,
                            inserted,
                            job.name,
                        ],
                    )
                    c.execute(
                        "INSERT INTO pongdang_data.conditions_ingestionrun "
                        "(task_name,status,started_at,finished_at,error_code) VALUES "
                        "(%s,%s,%s,%s,%s)",
                        [job.name, state, started, finished, error],
                    )
                    if refresh_id is not None:
                        finish_task(c, refresh_id, job.name, state, finished)
                outcomes.append(
                    dict(
                        job=job.name,
                        state=state,
                        received=received,
                        inserted=inserted,
                        error=error,
                    )
                )
                print(
                    f"{job.name}: {state}; received={received}; inserted={inserted}; "
                    f"error={error or '-'}",
                    flush=True,
                )
            finally:
                guard.execute(
                    "SELECT pg_advisory_unlock(hashtext(%s))",
                    ["pongdang-job/" + job.name],
                )
    heartbeat(settings, state="idle")
    return outcomes


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--once", action="store_true")
    parser.add_argument(
        "--force", action="store_true", help="Run selected jobs now even if not yet due"
    )
    parser.add_argument("--job", action="append", help="Exact registered job name")
    args = parser.parse_args()
    settings = Settings()
    jobs = registered_jobs(settings)
    if args.job:
        unknown = set(args.job) - {j.name for j in jobs}
        if unknown:
            parser.error("Unknown job name")
        jobs = [j for j in jobs if j.name in args.job]
    if args.once:
        outcomes = run_due(settings, jobs, force=args.force)
        raise SystemExit(1 if any(o["state"] == "failed" for o in outcomes) else 0)
    if args.force:
        parser.error("--force requires --once")
    stop = threading.Event()
    for sig in (signal.SIGTERM, signal.SIGINT):
        signal.signal(sig, lambda *_: stop.set())

    def pulse():
        while not stop.wait(30):
            try:
                with connect(settings) as c:
                    c.execute(
                        "UPDATE pongdang_data.conditions_pipelineheartbeat "
                        "SET last_seen_at=now(),updated_at=now() WHERE "
                        "key='condition-pipeline'"
                    )
            except Exception:
                pass  # Next pulse retries; never print connection credentials.

    threading.Thread(target=pulse, daemon=True).start()
    from app.refresh.service import run_pending_refresh

    last_refresh_check = 0.0

    def refresh_if_requested():
        nonlocal last_refresh_check
        if monotonic() - last_refresh_check < 1:
            return
        last_refresh_check = monotonic()
        run_pending_refresh(settings, jobs)

    next_due_check = 0.0
    try:
        while not stop.is_set():
            try:
                refresh_if_requested()
                if monotonic() >= next_due_check:
                    run_due(settings, jobs, before_job=refresh_if_requested)
                    next_due_check = monotonic() + settings.collector_poll_seconds
            except Exception:
                print(
                    "Collector database unavailable; retrying after poll interval",
                    flush=True,
                )
                stop.wait(settings.collector_poll_seconds)
                continue
            stop.wait(min(2, settings.collector_poll_seconds))
    finally:
        try:
            heartbeat(settings, state="stopped")
        except Exception:
            pass


if __name__ == "__main__":
    main()
