"""Durable, coalesced refresh requests without HTTP-side provider calls."""

from uuid import uuid4

from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

from app.schema import connect

STATUS_COLUMNS = "request_id,status,requested_at,finished_at,failed_jobs"
TERMINAL_STATES = frozenset({"succeeded", "partial", "no_data", "failed"})
# Only configured dynamic data participates. Catalogues, images, details and
# notification delivery keep their own schedules and provider budgets.
DYNAMIC_JOBS = frozenset(
    {
        "kma_nowcast",
        "kma_ultra_forecast",
        "kma_short_forecast",
        "kma_mid_forecast",
        "kma_warnings",
        "kma_aws",
        "kma_buoy",
        "khoa_beach",
        "khoa_surfing",
        "khoa_mudflat",
        "khoa_rip_current",
        "khoa_tide_recent",
        "khoa_buoy_recent",
        "khoa_water_temperature",
        "khoa_tide_level",
        "khoa_tide_extrema",
        "khoa_waves",
        "khoa_tide_timeseries",
        "khoa_hf_current",
        "khoa_current_timeseries",
        "khoa_roms",
        "koem_water_quality",
        "nier_water_quality",
        "koem_wemo_water_quality",
        "hrfco_waterlevel",
        "airkorea_observations",
        "kasi_rise_set",
        "kma_uv_forecast",
    }
)
PROJECTION_JOBS = (
    "forecast_projection",
    "water_index_evaluation",
    "quality_comparison",
    "condition_projection",
)


def enqueue_refresh(settings):
    with connect(settings) as c:
        c.row_factory = dict_row
        c.execute("SELECT pg_advisory_xact_lock(hashtext('pongdang-refresh-enqueue'))")
        active = c.execute(
            f"SELECT {STATUS_COLUMNS} FROM pongdang_data.collection_refresh_request "
            "WHERE status IN ('queued','running') LIMIT 1"
        ).fetchone()
        if active:
            return active
        return c.execute(
            "INSERT INTO pongdang_data.collection_refresh_request(request_id) "
            f"VALUES (%s) RETURNING {STATUS_COLUMNS}",
            [uuid4()],
        ).fetchone()


def read_refresh(settings, request_id):
    with connect(settings) as c:
        c.execute("SET TRANSACTION READ ONLY")
        c.row_factory = dict_row
        return c.execute(
            f"SELECT {STATUS_COLUMNS} FROM pongdang_data.collection_refresh_request "
            "WHERE request_id=%s",
            [request_id],
        ).fetchone()


def finish_task(connection, request_id, name, state, finished):
    """Called in the same transaction that commits a collection job's result."""
    connection.execute(
        "UPDATE pongdang_data.collection_refresh_task SET state=%s,finished_at=%s "
        "WHERE request_id=%s AND task_name=%s",
        [state, finished, request_id, name],
    )


def task_rows(settings, request_id):
    with connect(settings) as c:
        c.execute("SET TRANSACTION READ ONLY")
        return c.execute(
            "SELECT task_name,state,not_before,finished_at "
            "FROM pongdang_data.collection_refresh_task WHERE request_id=%s "
            "ORDER BY task_name",
            [request_id],
        ).fetchall()


def run_pending_refresh(settings, jobs):
    """Resume one request under a session lock; each job keeps its own lock."""
    from app.ingestion.worker import run_due

    with connect(settings) as guard:
        guard.autocommit = True
        if not guard.execute(
            "SELECT pg_try_advisory_lock(hashtext('pongdang-refresh-worker'))"
        ).fetchone()[0]:
            return None
        try:
            request = guard.execute(
                "SELECT request_id,requested_at,status FROM "
                "pongdang_data.collection_refresh_request "
                "WHERE status IN ('queued','running') LIMIT 1"
            ).fetchone()
            if request is None:
                return None
            request_id, requested_at, status = request
            by_name = {job.name: job for job in jobs if job.enabled}
            if status == "queued":
                selected = sorted(DYNAMIC_JOBS & by_name.keys())
                selected += [name for name in PROJECTION_JOBS if name in by_name]
                # A request cannot claim success without source collection and
                # the common score projection, even under incomplete config.
                unavailable = []
                if not DYNAMIC_JOBS & by_name.keys():
                    unavailable.append("external_data")
                if "condition_projection" not in by_name:
                    unavailable.append("condition_projection")
                with connect(settings) as c:
                    for name in selected + unavailable:
                        c.execute(
                            "INSERT INTO pongdang_data.collection_refresh_task "
                            "(request_id,task_name,not_before,state,finished_at) "
                            "VALUES (%s,%s,%s,%s,CASE WHEN %s THEN now() END) "
                            "ON CONFLICT DO NOTHING",
                            [
                                request_id,
                                name,
                                requested_at,
                                "failed" if name in unavailable else "pending",
                                name in unavailable,
                            ],
                        )
                    c.execute(
                        "UPDATE pongdang_data.collection_refresh_request "
                        "SET status='running',started_at=now() WHERE request_id=%s",
                        [request_id],
                    )
            rows = task_rows(settings, request_id)
            for name, state, not_before, _ in rows:
                if name in PROJECTION_JOBS or state in TERMINAL_STATES:
                    continue
                if name not in by_name:
                    with connect(settings) as c:
                        c.execute(
                            "UPDATE pongdang_data.collection_refresh_task "
                            "SET state='failed',finished_at=now() "
                            "WHERE request_id=%s AND task_name=%s",
                            [request_id, name],
                        )
                    continue
                run_due(
                    settings,
                    [by_name[name]],
                    refresh_id=request_id,
                    requested_at=not_before,
                )
            rows = task_rows(settings, request_id)
            sources = [row for row in rows if row[0] not in PROJECTION_JOBS]
            if any(row[1] not in TERMINAL_STATES for row in sources):
                return request_id
            # Persist the dependency boundary. A pre-existing projection may be
            # reused only if it started after every source task had completed.
            ready_at = max([requested_at] + [row[3] for row in sources if row[3]])
            for name in PROJECTION_JOBS:
                task = next((row for row in rows if row[0] == name), None)
                if task is None or task[1] in TERMINAL_STATES:
                    if task and task[3]:
                        ready_at = max(ready_at, task[3])
                    continue
                if name not in by_name:
                    with connect(settings) as c:
                        c.execute(
                            "UPDATE pongdang_data.collection_refresh_task "
                            "SET state='failed',finished_at=now() "
                            "WHERE request_id=%s AND task_name=%s",
                            [request_id, name],
                        )
                    continue
                with connect(settings) as c:
                    c.execute(
                        "UPDATE pongdang_data.collection_refresh_task "
                        "SET not_before=GREATEST(not_before,%s) "
                        "WHERE request_id=%s AND task_name=%s",
                        [ready_at, request_id, name],
                    )
                result = run_due(
                    settings,
                    [by_name[name]],
                    refresh_id=request_id,
                    requested_at=ready_at,
                )
                if not result:
                    return request_id
                completed = next(
                    row for row in task_rows(settings, request_id) if row[0] == name
                )
                if completed[3]:
                    ready_at = max(ready_at, completed[3])
            rows = task_rows(settings, request_id)
            if any(row[1] not in TERMINAL_STATES for row in rows):
                return request_id
            failed = sorted(row[0] for row in rows if row[1] != "succeeded")
            states = {row[0]: row[1] for row in rows}
            successful_source = any(
                states.get(name) in {"succeeded", "partial"} for name in DYNAMIC_JOBS
            )
            final = (
                "failed"
                if not successful_source
                or states.get("condition_projection") not in {"succeeded", "partial"}
                else "partial"
                if failed
                else "succeeded"
            )
            with connect(settings) as c:
                c.execute(
                    "UPDATE pongdang_data.collection_refresh_request "
                    "SET status=%s,finished_at=now(),failed_jobs=%s "
                    "WHERE request_id=%s",
                    [final, Jsonb(failed), request_id],
                )
            return request_id
        finally:
            guard.execute(
                "SELECT pg_advisory_unlock(hashtext('pongdang-refresh-worker'))"
            )
