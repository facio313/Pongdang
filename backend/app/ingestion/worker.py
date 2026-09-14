"""Separate, restart-safe periodic collector. No HTTP mutation endpoint."""

import argparse
import signal
import threading
from datetime import UTC, datetime, timedelta

from psycopg.types.json import Jsonb

from app.config import Settings
from app.ingestion.http import ProviderError
from app.ingestion.storage import store_batch
from app.schema import connect


def registered_jobs(settings):
    from app.feature_jobs import feature_jobs
    from app.ingestion.environment import environment_jobs
    from app.ingestion.marine import marine_jobs
    from app.ingestion.marine_extra import marine_extra_jobs
    from app.ingestion.places import place_jobs
    from app.ingestion.water import water_jobs
    from app.ingestion.water_tour_extra import water_tour_extra_jobs
    from app.ingestion.weather import weather_jobs

    return (
        weather_jobs(settings)
        + marine_jobs(settings)
        + water_jobs(settings)
        + place_jobs(settings)
        + marine_extra_jobs(settings)
        + environment_jobs(settings)
        + water_tour_extra_jobs(settings)
        + feature_jobs(settings)
    )


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
                "state=CASE WHEN EXCLUDED.state='disabled' THEN 'disabled' "
                "WHEN collection_job.state='disabled' THEN 'pending' "
                "ELSE collection_job.state END,last_error=CASE WHEN "
                "EXCLUDED.state='disabled' "
                "THEN EXCLUDED.last_error ELSE collection_job.last_error END",
                [
                    job.name,
                    "pending" if job.enabled else "disabled",
                    job.interval_seconds,
                    "" if job.enabled else job.disabled_reason,
                ],
            )


def run_due(settings, jobs, *, force=False):
    """Session advisory locks prevent concurrent workers from duplicating a job."""
    outcomes = []
    synchronize_jobs(settings, jobs)
    for job in jobs:
        if not job.enabled:
            continue
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
                    "SELECT next_run_at,consecutive_failures FROM "
                    "pongdang_data.collection_job "
                    "WHERE task_name=%s",
                    [job.name],
                ).fetchone()
                if not force and row[0] and row[0] > datetime.now(UTC):
                    continue
                started = datetime.now(UTC)
                with connect(settings) as c:
                    c.execute(
                        "UPDATE pongdang_data.collection_job SET "
                        "state='running',started_at=%s "
                        "WHERE task_name=%s",
                        [started, job.name],
                    )
                heartbeat(settings, tasks=[job.name])
                state, error, received, inserted = "succeeded", "", 0, 0
                try:
                    if job.process is not None:
                        result = job.process()
                        received, inserted = result["received"], result["inserted"]
                        state, error = result["state"], result.get("error", "")
                        if state not in {"succeeded", "partial", "no_data", "failed"}:
                            raise ValueError("Unknown domain job result")
                    else:
                        batch = job.fetch()
                        received = (
                            len(batch.readings)
                            + len(batch.stations)
                            + len(batch.places)
                            + len(batch.warnings)
                        )
                        inserted = store_batch(settings, batch)
                        has_data = bool(
                            batch.readings or batch.places or batch.warnings
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
                except Exception:
                    # Exceptions can contain request URLs, keys or database credentials.
                    state, error = "failed", "COLLECTION_ERROR"
                finished = datetime.now(UTC)
                failures = (int(row[1] or 0) + 1) if state == "failed" else 0
                delay = (
                    min(86400, job.interval_seconds * 2 ** min(failures, 6))
                    if failures
                    else job.interval_seconds
                )
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
    try:
        while not stop.is_set():
            try:
                run_due(settings, jobs)
            except Exception:
                print(
                    "Collector database unavailable; retrying after poll interval",
                    flush=True,
                )
            stop.wait(settings.collector_poll_seconds)
    finally:
        try:
            heartbeat(settings, state="stopped")
        except Exception:
            pass


if __name__ == "__main__":
    main()
