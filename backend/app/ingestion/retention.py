"""Bound source history without removing live, referenced or correction evidence."""

from datetime import UTC, datetime, timedelta
from time import monotonic

from psycopg import errors, sql

from app.schema import connect
from app.water_index.condition_storage import RESULT_LOCK
from app.water_index.retention import retention_window

LOCKS = (
    "pongdang-water-index",
    "pongdang-forecast-projector",
    "pongdang-ingestion",
    RESULT_LOCK,
    "pongdang-quality-producer",
    "pongdang-job/condition_projection",
    "pongdang-job/condition_notifications",
)
# Writers that publish JSON references must not race the reference scan. Ordinary
# SELECTs remain available; NOWAIT avoids queueing a lock behind an active writer.
REFERENCE_TABLES = (
    "condition_result",
    "condition_snapshot",
    "water_index_assessment",
    "water_index_input_manifest",
    "forecast_revision",
    "notification_subscription",
    "notification_event",
    "notification_evaluation",
    "quality_analysis",
    "conditions_observationsnapshot",
    "conditions_observationmetric",
)


def migrate_source_retention(connection):
    """Install a DELETE-only maintenance path; normal changes still invalidate."""
    from app.water_index.condition_invalidation import install_condition_invalidation

    install_condition_invalidation(connection)
    connection.execute("""
        CREATE OR REPLACE FUNCTION pongdang_data.forecast_retention_guard()
        RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
            IF TG_OP='DELETE' AND
               current_setting('pongdang.retention.sources',true)='on' THEN
                RETURN OLD;
            END IF;
            RAISE EXCEPTION 'Water Index history is immutable';
        END $$
    """)
    connection.execute(
        "CREATE OR REPLACE TRIGGER forecast_revision_immutable "
        "BEFORE UPDATE OR DELETE ON pongdang_data.forecast_revision "
        "FOR EACH ROW EXECUTE FUNCTION pongdang_data.forecast_retention_guard()"
    )


def _prune_forecasts(connection, now, start, end, limit):
    # Entire identities are retired together: the self FK must never be severed,
    # and a prior revision must not become the latest after a correction is lost.
    connection.execute(
        "CREATE TEMP TABLE source_retention_forecasts ON COMMIT DROP AS "
        "SELECT source_key FROM pongdang_data.forecast_revision "
        "GROUP BY source_key HAVING max(available_at)<=%s AND "
        "NOT bool_or(target_start_at<%s AND target_end_at>%s) "
        "ORDER BY source_key LIMIT %s",
        [now, end, start, limit],
    )
    count = connection.execute(
        "DELETE FROM pongdang_data.forecast_revision f USING "
        "source_retention_forecasts obsolete WHERE f.source_key=obsolete.source_key"
    ).rowcount
    pending = connection.execute(
        "SELECT count(*)>=%s FROM source_retention_forecasts", [limit]
    ).fetchone()[0]
    return count, pending


def _keep_query(connection, query, params=()):
    connection.execute(
        "INSERT INTO source_retention_keep " + query + " ON CONFLICT DO NOTHING",
        params,
    )


def _keep_references(connection):
    for table, column, keys in (
        ("condition_result", "detail", ("spot_id", "activity", "mode", "target_start")),
        (
            "condition_snapshot",
            "payload",
            ("generation_id", "spot_id", "activity", "mode", "target_start"),
        ),
        ("water_index_assessment", "payload", ("assessment_id",)),
        ("water_index_input_manifest", "payload", ("manifest_id",)),
        ("forecast_revision", "payload", ("revision_id",)),
        ("notification_event", "payload", ("id",)),
        ("notification_evaluation", "payload", ("id",)),
    ):
        for predicate, params in _pages(connection, table, keys):
            # Read and decompress each payload once, in bounded keyset pages.
            # InputDTO also permits a metric reference without a snapshot ID.
            connection.execute(
                sql.SQL(
                    "INSERT INTO source_retention_keep SELECT DISTINCT v.id "
                    "FROM (SELECT {column} FROM {table} WHERE {predicate}) t "
                    "CROSS JOIN LATERAL jsonb_path_query(t.{column},"
                    "'$.** ? (exists(@.snapshot_id) || exists(@.metric_id))') ref "
                    "LEFT JOIN pongdang_data.conditions_observationmetric m "
                    "ON m.id=(ref->>'metric_id')::bigint CROSS JOIN LATERAL "
                    "(VALUES ((ref->>'snapshot_id')::bigint),(m.snapshot_id)) v(id) "
                    "WHERE v.id IS NOT NULL ON CONFLICT DO NOTHING"
                ).format(
                    table=sql.Identifier("pongdang_data", table),
                    column=sql.Identifier(column),
                    predicate=predicate,
                ),
                params,
            )
    for predicate, params in _pages(connection, "quality_analysis", ("analysis_id",)):
        connection.execute(
            sql.SQL(
                "INSERT INTO source_retention_keep SELECT DISTINCT "
                "substring(ref#>>'{{}}' from 21)::bigint FROM "
                "(SELECT payload FROM pongdang_data.quality_analysis "
                "WHERE {}) q CROSS JOIN LATERAL "
                "jsonb_path_query(q.payload,'$.official_sources[*].evidence_id') ref "
                "WHERE ref#>>'{{}}' ~ '^collection-snapshot:[0-9]+$' "
                "ON CONFLICT DO NOTHING"
            ).format(predicate),
            params,
        )


def _pages(connection, table, keys):
    """Locate payload-page boundaries using only a table's primary-key index."""
    columns = sql.SQL(",").join(map(sql.Identifier, keys))
    descending = sql.SQL(",").join(
        sql.SQL("{} DESC").format(sql.Identifier(key)) for key in keys
    )
    placeholders = sql.SQL(",").join(sql.Placeholder() for _ in keys)
    lower, params = sql.SQL("true"), []
    while True:
        last = connection.execute(
            sql.SQL(
                "SELECT {columns} FROM (SELECT {columns} FROM {table} "
                "WHERE {lower} ORDER BY {columns} LIMIT 500) page "
                "ORDER BY {descending} LIMIT 1"
            ).format(
                columns=columns,
                table=sql.Identifier("pongdang_data", table),
                lower=lower,
                descending=descending,
            ),
            params,
        ).fetchone()
        if last is None:
            return
        yield (
            sql.SQL("{} AND ({})<=({})").format(lower, columns, placeholders),
            [*params, *last],
        )
        lower = sql.SQL("({})>({})").format(columns, placeholders)
        params = list(last)


def _keep_inputs(connection, now, start, end):
    connection.execute(
        "CREATE TEMP TABLE source_retention_keep (id bigint PRIMARY KEY) ON COMMIT DROP"
    )
    _keep_references(connection)
    _keep_query(
        connection,
        "SELECT id FROM pongdang_data.conditions_observationsnapshot "
        "WHERE (observed_at<%s AND (observed_at>=%s OR valid_until>%s)) "
        "OR fetched_at>%s OR issued_at>%s",
        [end, start, start, now, now],
    )
    # Latest targets may be stale, missing, contradictory or corrected. Keep all
    # ties and then their complete source revision families, never just values.
    _keep_query(
        connection,
        "SELECT id FROM (SELECT s.id,dense_rank() OVER (PARTITION BY "
        "s.station_id,s.provider,m.name,m.mode ORDER BY "
        "COALESCE(m.observed_at,s.observed_at) DESC) AS position "
        "FROM pongdang_data.conditions_observationsnapshot s JOIN "
        "pongdang_data.conditions_observationmetric m ON m.snapshot_id=s.id "
        "WHERE s.fetched_at<=%s AND (s.issued_at IS NULL OR s.issued_at<=%s) "
        "AND COALESCE(m.observed_at,s.observed_at)<=CASE WHEN "
        "m.mode='observation' THEN %s::timestamptz ELSE %s::timestamptz END) r "
        "WHERE position=1",
        [now, now, now, start],
    )
    # Product presence, including a metric omitted by a later revision, controls
    # nearby station selection before the value's quality/age is considered.
    _keep_query(
        connection,
        "SELECT DISTINCT ON (s.station_id,s.provider,m.name,m.mode) s.id "
        "FROM pongdang_data.conditions_observationsnapshot s JOIN "
        "pongdang_data.conditions_observationmetric m ON m.snapshot_id=s.id "
        "LEFT JOIN source_retention_keep k ON k.id=s.id "
        "WHERE s.fetched_at<=%s ORDER BY s.station_id,s.provider,m.name,m.mode,"
        "(k.id IS NOT NULL) DESC,s.fetched_at DESC,s.id DESC",
        [now],
    )
    _keep_query(
        connection,
        "SELECT DISTINCT ON (s.station_id) s.id FROM "
        "pongdang_data.conditions_observationsnapshot s LEFT JOIN "
        "source_retention_keep k ON k.id=s.id WHERE s.fetched_at<=%s "
        "ORDER BY s.station_id,(k.id IS NOT NULL) DESC,s.fetched_at DESC,s.id DESC",
        [now],
    )
    # The annual temperature count supports new subscriptions and editable
    # thresholds, so existing subscribers alone are not a sufficient boundary.
    # Account for calendar years in every accepted user timezone.
    year = (now.astimezone(UTC) - timedelta(hours=14)).year
    annual_start = datetime(year, 1, 1, tzinfo=UTC) - timedelta(hours=14)
    _keep_query(
        connection,
        "SELECT DISTINCT s.id FROM pongdang_data.conditions_observationsnapshot s "
        "JOIN pongdang_data.conditions_observationmetric m ON m.snapshot_id=s.id "
        "WHERE m.name='water_temperature' AND m.mode='observation' "
        "AND s.observed_at>=%s",
        [annual_start],
    )
    _keep_query(
        connection,
        "SELECT id FROM pongdang_data.conditions_observationsnapshot "
        "WHERE observed_at>=%s AND (provider IN "
        "('koem_water_quality','nier_water_quality') OR "
        "(provider='khoa_tide_extrema' AND ingestion_version='tide-event-slots.2'))",
        [now - timedelta(days=31)],
    )
    # Preserve correction/reversion/omitted-slot semantics for each retained
    # natural identity. Timestamp-specific identities outside this set expire.
    _keep_query(
        connection,
        "SELECT s.id FROM pongdang_data.conditions_observationsnapshot s JOIN "
        "(SELECT DISTINCT s.station_id,s.provider,"
        "COALESCE(s.source_record_id,s.provider_record_id) AS source_key "
        "FROM pongdang_data.conditions_observationsnapshot s JOIN "
        "source_retention_keep k ON k.id=s.id) families "
        "ON s.station_id IS NOT DISTINCT FROM families.station_id "
        "AND s.provider=families.provider AND "
        "COALESCE(s.source_record_id,s.provider_record_id)=families.source_key",
    )
    connection.execute("ANALYZE source_retention_keep")


def _delete_snapshot_batch(connection, batch_size):
    connection.execute("DELETE FROM source_retention_delete")
    connection.execute(
        "INSERT INTO source_retention_delete "
        "SELECT s.id FROM pongdang_data.conditions_observationsnapshot s "
        "WHERE NOT EXISTS(SELECT 1 FROM source_retention_keep k WHERE k.id=s.id) "
        "ORDER BY s.id LIMIT %s",
        [batch_size],
    )
    connection.execute("ANALYZE source_retention_delete")
    counts = {}
    for table, key in (
        ("conditions_observationmetric", "snapshot_id"),
        ("conditions_observationsnapshot", "id"),
    ):
        counts[table] = connection.execute(
            sql.SQL(
                "DELETE FROM {} r USING source_retention_delete d WHERE r.{}=d.id"
            ).format(sql.Identifier("pongdang_data", table), sql.Identifier(key))
        ).rowcount
    return counts


def prune_source_history(
    settings, *, now=None, batch_size=2000, max_batches=1, max_seconds=20
):
    """Run after Water Index pruning; reuse locked references for bounded batches.

    A forecast identity's complete revision chain is one indivisible deletion
    unit. Each raw snapshot batch is capped by batch_size, with all its metrics.
    The deletion budget starts after reference preparation and is checked after
    each complete batch. All batches share one transaction and roll back together.
    A skipped/pending pass can resume without weakening any evidence contract.
    """
    if type(batch_size) is not int or not 1 <= batch_size <= 10000:
        raise ValueError("Retention batch size must be between 1 and 10000")
    if type(max_batches) is not int or not 1 <= max_batches <= 20:
        raise ValueError("Retention batch count must be between 1 and 20")
    if not 0 < max_seconds <= 60:
        raise ValueError("Retention time budget must be between 0 and 60 seconds")
    from app.ingestion.worker import registered_jobs

    # Gate jobs before their fetch/process step. Otherwise a new worker could
    # fetch successfully, then time out waiting for this transaction's data locks
    # and unnecessarily back off. The worker already owns our own job's lock.
    job_locks = sorted(
        {
            "pongdang-job/" + job.name
            for job in registered_jobs(settings)
            if job.enabled and job.name != "evidence_retention"
        }
    )
    result = dict(deleted=0, pending=False, skipped=False, counts={})
    with connect(settings) as connection:
        for lock in (*job_locks, *LOCKS):
            if not connection.execute(
                "SELECT pg_try_advisory_xact_lock(hashtext(%s))", [lock]
            ).fetchone()[0]:
                return {**result, "pending": True, "skipped": True}
        clock = connection.execute("SELECT clock_timestamp()").fetchone()[0]
        now = now or clock
        if not isinstance(now, datetime) or now.tzinfo is None or now > clock:
            raise ValueError("Retention cannot use naive or future knowledge")
        start, end = retention_window(now)
        # Do not decompress an old publication backlog just to protect records
        # whose result-retention phase has not finished yet.
        if connection.execute(
            "SELECT EXISTS(SELECT 1 FROM pongdang_data.condition_result "
            "WHERE target_end<=%s)",
            [start],
        ).fetchone()[0]:
            return {**result, "pending": True, "skipped": True}
        try:
            with connection.transaction():
                connection.execute(
                    sql.SQL("LOCK TABLE {} IN SHARE MODE NOWAIT").format(
                        sql.SQL(",").join(
                            sql.Identifier("pongdang_data", table)
                            for table in REFERENCE_TABLES
                        )
                    )
                )
        except errors.LockNotAvailable:
            return {**result, "pending": True, "skipped": True}
        connection.execute("SET LOCAL pongdang.retention.sources = 'on'")
        forecast_count, forecast_pending = _prune_forecasts(
            connection, now, start, end, batch_size
        )
        result["counts"]["forecast_revision"] = forecast_count
        _keep_inputs(connection, now, start, end)
        connection.execute(
            "CREATE TEMP TABLE source_retention_delete (id bigint PRIMARY KEY) "
            "ON COMMIT DROP"
        )
        # Keep the producer/reference locks throughout: these references cannot
        # change while multiple batches reuse the expensive JSON scan.
        deadline = monotonic() + max_seconds
        for _ in range(max_batches):
            counts = _delete_snapshot_batch(connection, batch_size)
            for table, count in counts.items():
                result["counts"][table] = result["counts"].get(table, 0) + count
            snapshots_pending = counts["conditions_observationsnapshot"] == batch_size
            if not snapshots_pending or monotonic() >= deadline:
                break
        result["deleted"] = sum(result["counts"].values())
        result["pending"] = forecast_pending or snapshots_pending
        connection.execute("SET LOCAL pongdang.retention.sources = 'off'")
    return result
