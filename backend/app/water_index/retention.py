"""Bound immutable evaluation storage to the latest published read dependencies."""

from datetime import datetime, timedelta
from time import monotonic
from zoneinfo import ZoneInfo

from psycopg import sql

KST = ZoneInfo("Asia/Seoul")
RETENTION_POLICY = "latest-current-window.v1"
DELETE_ROWS_PER_STATEMENT = 1000
TABLES = (
    ("water_index_production_run", "run_id", "wi_retention_runs"),
    ("water_index_read_manifest", "manifest_id", "wi_retention_reads"),
    ("water_index_assessment", "assessment_id", "wi_retention_assessments"),
    ("water_index_input_manifest", "manifest_id", "wi_retention_inputs"),
    ("water_index_target", "target_id", "wi_retention_targets"),
)


def retention_window(now):
    """Today and the following seven KST dates, with an exclusive upper bound."""
    if now.tzinfo is None:
        raise ValueError("Retention requires a timezone-aware cutoff")
    start = now.astimezone(KST).replace(hour=0, minute=0, second=0, microsecond=0)
    return start, start + timedelta(days=8)


def migrate_bounded_retention(connection):
    """Keep ordinary history immutable; permit only this explicit DELETE path."""
    connection.execute("""
        CREATE OR REPLACE FUNCTION pongdang_data.water_index_immutable()
        RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
            IF TG_OP='DELETE'
               AND current_setting('pongdang.retention.water_index',true)='on'
               AND TG_TABLE_SCHEMA='pongdang_data'
               AND TG_TABLE_NAME IN (
                   'water_index_production_run','water_index_read_manifest',
                   'water_index_assessment','water_index_input_manifest',
                   'water_index_target'
               ) THEN
                RETURN OLD;
            END IF;
            RAISE EXCEPTION 'Water Index history is immutable';
        END; $$
    """)
    # PostgreSQL does not create indexes for referencing foreign-key columns.
    # Without these, deleting one unused parent repeatedly scans millions of
    # child artifacts during the initial bounded cleanup.
    for table, column in (
        ("water_index_production_run", "read_manifest_id"),
        ("water_index_assessment", "input_manifest_id"),
        ("water_index_assessment", "target_id"),
    ):
        connection.execute(
            sql.SQL("CREATE INDEX IF NOT EXISTS {} ON {} ({})").format(
                sql.Identifier(table + "_" + column + "_idx"),
                sql.Identifier("pongdang_data", table),
                sql.Identifier(column),
            )
        )


def _keep_dependencies(connection, now):
    start, end = retention_window(now)
    connection.execute(
        "CREATE TEMP TABLE wi_retention_reads ON COMMIT DROP AS "
        "SELECT DISTINCT ON (spot_id,activity,profile_id,request_mode) "
        "manifest_id AS id FROM pongdang_data.water_index_read_manifest "
        "WHERE available_at<=%s AND scope_start_at<%s AND scope_end_at>%s "
        "ORDER BY spot_id,activity,profile_id,request_mode,available_at DESC,"
        "manifest_id DESC",
        [now, end, start],
    )
    # Keep the latest view even after its expiry: it is a bounded per-group
    # fallback/reference, not permission for a reader to extend its validity.
    # Preserve its complete reference closure, including pre-migration views.
    connection.execute("ALTER TABLE wi_retention_reads ADD PRIMARY KEY (id)")
    connection.execute(
        "CREATE TEMP TABLE wi_retention_runs ON COMMIT DROP AS "
        "SELECT DISTINCT ON (r.spot_id,r.activity,r.mode) r.run_id AS id "
        "FROM pongdang_data.water_index_production_run r "
        "JOIN wi_retention_reads k ON k.id=r.read_manifest_id "
        "ORDER BY r.spot_id,r.activity,r.mode,r.run_id DESC"
    )
    connection.execute(
        "CREATE TEMP TABLE wi_retention_assessments ON COMMIT DROP AS "
        "SELECT DISTINCT selected.value AS id "
        "FROM pongdang_data.water_index_read_manifest r "
        "JOIN wi_retention_reads k ON k.id=r.manifest_id "
        "CROSS JOIN LATERAL jsonb_each_text(r.payload->'selections') selected "
        "WHERE selected.value IS NOT NULL"
    )
    connection.execute("ALTER TABLE wi_retention_assessments ADD PRIMARY KEY (id)")
    connection.execute(
        "CREATE TEMP TABLE wi_retention_inputs ON COMMIT DROP AS "
        "SELECT DISTINCT a.input_manifest_id AS id "
        "FROM pongdang_data.water_index_assessment a "
        "JOIN wi_retention_assessments k ON k.id=a.assessment_id "
        "WHERE a.input_manifest_id IS NOT NULL"
    )
    connection.execute(
        "CREATE TEMP TABLE wi_retention_targets ON COMMIT DROP AS "
        "SELECT selected.key AS id "
        "FROM pongdang_data.water_index_read_manifest r "
        "JOIN wi_retention_reads k ON k.id=r.manifest_id "
        "CROSS JOIN LATERAL jsonb_each_text(r.payload->'selections') selected "
        "UNION SELECT a.target_id "
        "FROM pongdang_data.water_index_assessment a "
        "JOIN wi_retention_assessments k ON k.id=a.assessment_id"
    )
    for table in ("wi_retention_runs", "wi_retention_inputs", "wi_retention_targets"):
        connection.execute(
            sql.SQL("ALTER TABLE {} ADD PRIMARY KEY (id)").format(sql.Identifier(table))
        )
    for _, _, table in TABLES:
        connection.execute(sql.SQL("ANALYZE {}").format(sql.Identifier(table)))


def _delete_obsolete(connection, table, key, kept, limit):
    # Victims remain immutable under the producer lock. Resolve their physical
    # tuples once instead of re-probing the large primary key for every delete.
    # Keep membership checks correlated: a merge anti-join reads scattered heap
    # pages in primary-key order just to obtain a small victim batch.
    return connection.execute(
        sql.SQL(
            "WITH obsolete AS MATERIALIZED (SELECT r.ctid FROM {table} r "
            "WHERE NOT EXISTS (SELECT 1 FROM {kept} k WHERE k.id=r.{key} OFFSET 0) "
            "LIMIT %s) DELETE FROM {table} r "
            "WHERE r.ctid=ANY(ARRAY(SELECT ctid FROM obsolete))"
        ).format(
            key=sql.Identifier(key),
            table=sql.Identifier("pongdang_data", table),
            kept=sql.Identifier(kept),
        ),
        [limit],
    ).rowcount


def prune_water_index_history(settings, *, now=None, batch_size=2000, max_seconds=10):
    """Delete a bounded batch, preserving live references and producer exclusion.

    Each call owns one transaction. A pending result can resume in another call;
    child phases finish before parent phases so even intermediate commits keep
    the JSON read selections and foreign keys intact.
    """
    from app.schema import connect

    if type(batch_size) is not int or not 1 <= batch_size <= 10000:
        raise ValueError("Retention batch size must be between 1 and 10000")
    if not 0 < max_seconds <= 60:
        raise ValueError("Retention time budget must be between 0 and 60 seconds")
    started = monotonic()
    result = dict(deleted=0, pending=False, skipped=False, counts={})
    with connect(settings) as connection:
        if not connection.execute(
            "SELECT pg_try_advisory_xact_lock("
            "hashtext('pongdang-job/water_index_evaluation'))"
        ).fetchone()[0]:
            return {**result, "pending": True, "skipped": True}
        acquired = connection.execute(
            "SELECT pg_try_advisory_xact_lock(hashtext('pongdang-water-index'))"
        ).fetchone()[0]
        if not acquired:
            return {**result, "pending": True, "skipped": True}
        clock = connection.execute("SELECT clock_timestamp()").fetchone()[0]
        now = now or clock
        if not isinstance(now, datetime) or now.tzinfo is None or now > clock:
            raise ValueError("Retention cannot use naive or future knowledge")
        _keep_dependencies(connection, now)
        connection.execute("SET LOCAL pongdang.retention.water_index = 'on'")
        for table, key, kept in TABLES:
            while True:
                remaining = batch_size - result["deleted"]
                if not remaining or monotonic() - started >= max_seconds:
                    result["pending"] = True
                    break
                # Large JSON/TOAST rows still incur per-row trigger and index
                # work. Bound each statement as well as the whole transaction.
                limit = min(remaining, DELETE_ROWS_PER_STATEMENT)
                deleted = _delete_obsolete(connection, table, key, kept, limit)
                result["counts"][table] = result["counts"].get(table, 0) + deleted
                result["deleted"] += deleted
                if deleted < limit:
                    break
            if result["pending"]:
                break
        connection.execute("SET LOCAL pongdang.retention.water_index = 'off'")
    return result
