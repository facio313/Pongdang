"""Worker-published condition sets. Product reads never calculate a score."""

import json
from contextlib import nullcontext
from datetime import UTC, datetime, timedelta
from functools import partial
from itertools import batched
from time import monotonic, sleep
from zoneinfo import ZoneInfo

from fastapi import HTTPException
from psycopg import errors, sql
from psycopg.types.json import Jsonb

from app.water_index.activity_score import ActivityScore
from app.water_index.condition_result import (
    RESULT_COLUMNS,
    content_digest,
    detail_fields,
    result_payload,
    summary_fields,
)
from app.water_index.condition_retention import RetainedPublication
from app.water_index.conditions import (
    ACTIVITIES,
    ConditionProjection,
    ConditionsEnvelope,
    ConditionSummary,
    summarize_conditions,
)

MODEL_VERSION = "1.0.0"
REFRESH_SECONDS = 600
KST = ZoneInfo("Asia/Seoul")
RESULT_LOCK = "pongdang-condition-results"
# These payloads contain substantial Korean descriptions and source evidence.
# Send their UTF-8 JSON directly instead of expanding every character to \\uXXXX.
_payload_json = partial(json.dumps, ensure_ascii=False, separators=(",", ":"))


class ConditionInputsChanged(RuntimeError):
    """A newer source commit requires rebuilding before publication."""

    def __init__(self):
        super().__init__("CONDITION_INPUT_CHANGED")


def migrate_conditions(connection):
    """Add result storage and transactional invalidation; preserve all evidence."""
    connection.execute(
        "CREATE TABLE IF NOT EXISTS pongdang_data.condition_source_revision ("
        "id integer PRIMARY KEY CHECK(id=1), revision bigint NOT NULL DEFAULT 0)"
    )
    connection.execute(
        "INSERT INTO pongdang_data.condition_source_revision(id) VALUES(1) "
        "ON CONFLICT DO NOTHING"
    )
    connection.execute(
        "CREATE TABLE IF NOT EXISTS pongdang_data.condition_generation ("
        "id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, "
        "source_revision bigint NOT NULL, model_version text NOT NULL, "
        "computed_at timestamptz NOT NULL, published_at timestamptz NOT NULL "
        "DEFAULT clock_timestamp(), record_count integer NOT NULL, "
        "reused_count integer NOT NULL DEFAULT 0, "
        "result_published boolean NOT NULL DEFAULT false, "
        "UNIQUE(source_revision,model_version,computed_at))"
    )
    connection.execute(
        "CREATE INDEX IF NOT EXISTS condition_generation_revision_idx ON "
        "pongdang_data.condition_generation(source_revision,model_version,id DESC)"
    )
    connection.execute(
        "CREATE TABLE IF NOT EXISTS pongdang_data.condition_snapshot ("
        "generation_id bigint NOT NULL REFERENCES "
        "pongdang_data.condition_generation(id), "
        "spot_id bigint NOT NULL REFERENCES pongdang_data.spots_waterspot(id), "
        "activity text NOT NULL, mode text NOT NULL "
        "CHECK(mode IN ('observation','forecast')), "
        "target_start timestamptz NOT NULL,target_end timestamptz NOT NULL, "
        "payload jsonb NOT NULL,CHECK(target_end>target_start), "
        "PRIMARY KEY(generation_id,spot_id,activity,mode,target_start))"
    )
    connection.execute(
        "CREATE OR REPLACE FUNCTION pongdang_data.invalidate_condition_projection() "
        "RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN "
        "UPDATE pongdang_data.condition_source_revision SET revision=revision+1 "
        "WHERE id=1; RETURN NULL; END $$"
    )
    for table in (
        "conditions_observationsnapshot",
        "conditions_observationmetric",
        "collection_station",
        "spots_waterspot",
        "water_index_station_mapping",
        "water_index_authority_evidence",
    ):
        connection.execute(
            sql.SQL(
                "CREATE OR REPLACE TRIGGER condition_projection_changed "
                "AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON {} "
                "FOR EACH STATEMENT EXECUTE FUNCTION "
                "pongdang_data.invalidate_condition_projection()"
            ).format(sql.Identifier("pongdang_data", table))
        )


def _lock_result_migration(connection):
    """Wait for legacy publishers without blocking readers behind a DDL wait."""
    # Start the outer transaction so each failed attempt rolls back a savepoint,
    # releasing even the table locks acquired before a later table was busy.
    connection.execute("SELECT 1")
    deadline = monotonic() + 600
    while True:
        try:
            with connection.transaction():
                connection.execute(
                    "LOCK TABLE pongdang_data.condition_generation, "
                    "pongdang_data.condition_source_revision, "
                    "pongdang_data.condition_snapshot "
                    "IN ACCESS EXCLUSIVE MODE NOWAIT"
                )
            return
        except errors.LockNotAvailable:
            if monotonic() >= deadline:
                raise
            sleep(0.5)


def migrate_condition_results(connection):
    """Add the directly readable result table without changing collected evidence."""
    _lock_result_migration(connection)
    connection.execute(
        "ALTER TABLE pongdang_data.condition_generation "
        "ADD COLUMN IF NOT EXISTS reused_count integer NOT NULL DEFAULT 0, "
        "ADD COLUMN IF NOT EXISTS result_published boolean NOT NULL DEFAULT false"
    )
    connection.execute(
        "CREATE INDEX IF NOT EXISTS condition_generation_published_idx ON "
        "pongdang_data.condition_generation(model_version,id DESC) "
        "WHERE result_published"
    )
    connection.execute(
        "ALTER TABLE pongdang_data.condition_source_revision "
        "ADD COLUMN IF NOT EXISTS invalidated_at timestamptz"
    )
    # Earlier revisions did not record the revocation clock. Treat them as
    # revoked from the beginning rather than inventing a historical boundary.
    connection.execute(
        "UPDATE pongdang_data.condition_source_revision "
        "SET invalidated_at='-infinity'::timestamptz "
        "WHERE invalidated_revision>0 AND invalidated_at IS NULL"
    )
    connection.execute("""
        CREATE OR REPLACE FUNCTION pongdang_data.stamp_condition_invalidation()
        RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
            IF NEW.invalidated_revision > OLD.invalidated_revision THEN
                IF OLD.invalidated_revision=0 OR OLD.invalidated_at IS NULL
                   OR EXISTS (
                       SELECT 1 FROM pongdang_data.condition_generation g
                       WHERE g.result_published
                       AND g.source_revision >= OLD.invalidated_revision
                   ) THEN
                    NEW.invalidated_at := statement_timestamp();
                ELSE
                    NEW.invalidated_at := OLD.invalidated_at;
                END IF;
            END IF;
            RETURN NEW;
        END $$
    """)
    connection.execute(
        "CREATE OR REPLACE TRIGGER condition_invalidation_clock "
        "BEFORE UPDATE OF invalidated_revision ON "
        "pongdang_data.condition_source_revision FOR EACH ROW "
        "EXECUTE FUNCTION pongdang_data.stamp_condition_invalidation()"
    )
    connection.execute(
        "CREATE TABLE IF NOT EXISTS pongdang_data.condition_result ("
        "generation_id bigint NOT NULL REFERENCES "
        "pongdang_data.condition_generation(id), "
        "spot_id bigint NOT NULL REFERENCES pongdang_data.spots_waterspot(id), "
        "activity text NOT NULL, mode text NOT NULL "
        "CHECK(mode IN ('observation','forecast')), "
        "target_start timestamptz NOT NULL, target_end timestamptz NOT NULL, "
        "content_digest bytea NOT NULL, "
        "place_name text, evidence_at timestamptz NOT NULL, "
        "evidence_as_of timestamptz NOT NULL, support_status text NOT NULL, "
        "safety_status text NOT NULL, condition_score jsonb, "
        "retained boolean NOT NULL, retained_at timestamptz, "
        "water_temperature jsonb, expires_at timestamptz, detail jsonb NOT NULL, "
        "CHECK(target_end>target_start), "
        "PRIMARY KEY(spot_id,activity,mode,target_start))"
    )
    connection.execute(
        "CREATE INDEX IF NOT EXISTS condition_result_end_idx ON "
        "pongdang_data.condition_result(target_end)"
    )
    _backfill_latest_result(connection)


def projection_revision(connection):
    row = connection.execute(
        "SELECT revision FROM pongdang_data.condition_source_revision WHERE id=1"
    ).fetchone()
    return row["revision"] if isinstance(row, dict) else row[0]


def projection_is_current(connection, source_revision, day_start):
    row = connection.execute(
        "SELECT EXISTS(SELECT 1 FROM pongdang_data.condition_generation "
        "WHERE result_published AND source_revision=%s AND model_version=%s "
        "AND computed_at>=%s) AS ready",
        [source_revision, MODEL_VERSION, day_start],
    ).fetchone()
    return row["ready"] if isinstance(row, dict) else row[0]


def projection_due(connection):
    row = connection.execute(
        "SELECT NOT EXISTS(SELECT 1 FROM pongdang_data.condition_generation g "
        "JOIN pongdang_data.condition_source_revision r "
        "ON r.id=1 AND g.source_revision=r.revision "
        "WHERE g.result_published AND g.model_version=%s "
        "AND g.computed_at >= date_trunc('day',now() AT TIME ZONE 'Asia/Seoul') "
        "AT TIME ZONE 'Asia/Seoul') AS due",
        [MODEL_VERSION],
    ).fetchone()
    return row["due"] if isinstance(row, dict) else row[0]


def projection_urgent(connection):
    """Bypass the durable schedule only when no safe result can be served."""
    row = connection.execute(
        "SELECT latest.source_revision IS NULL OR "
        "r.invalidated_revision>latest.source_revision AS urgent FROM "
        "pongdang_data.condition_source_revision r LEFT JOIN LATERAL ("
        "SELECT g.source_revision FROM pongdang_data.condition_generation g "
        "WHERE g.result_published AND g.model_version=%s "
        "ORDER BY g.id DESC LIMIT 1) latest ON true WHERE r.id=1",
        [MODEL_VERSION],
    ).fetchone()
    return row["urgent"] if isinstance(row, dict) else row[0]


def _create_result_stage(connection):
    connection.execute(
        "CREATE TEMP TABLE condition_result_stage "
        "(LIKE pongdang_data.condition_result) ON COMMIT DROP"
    )


def _copy_result_batch(connection, records, generation_id):
    with (
        connection.cursor() as cursor,
        cursor.copy(
            f"COPY condition_result_stage ({RESULT_COLUMNS}) FROM STDIN"
        ) as copy,
    ):
        for record in records:
            payload = record["payload"]
            if payload.get("contract_version") != "water-conditions.v1":
                raise ValueError("A published result requires a condition envelope")
            water, expires_at = summary_fields(payload)
            copy.write_row(
                (
                    generation_id,
                    record["spot_id"],
                    record["activity"],
                    record["mode"],
                    record["target_start"],
                    record["target_end"],
                    content_digest(payload),
                    payload["place_name"],
                    payload["at"],
                    payload["as_of"],
                    payload["support_status"],
                    payload["safety_status"],
                    Jsonb(payload["condition_score"], dumps=_payload_json),
                    payload["retained"],
                    payload["retained_at"],
                    Jsonb(water, dumps=_payload_json),
                    expires_at,
                    Jsonb(detail_fields(payload), dumps=_payload_json),
                )
            )


def _create_result_old_compare(connection):
    """Project readable old intervals once, without repeatedly probing JSON heaps."""
    connection.execute(
        "CREATE TEMP TABLE condition_result_old_compare ON COMMIT DROP AS "
        "SELECT cr.spot_id,cr.activity,cr.mode,cr.target_start,"
        "CASE WHEN origin.source_revision<revision.invalidated_revision "
        "THEN least(cr.target_end,revision.invalidated_at) "
        "ELSE cr.target_end END AS target_end,cr.content_digest "
        "FROM pongdang_data.condition_result cr JOIN "
        "pongdang_data.condition_generation origin "
        "ON origin.id=cr.generation_id AND origin.result_published "
        "CROSS JOIN pongdang_data.condition_source_revision revision "
        "WHERE revision.id=1 AND ("
        "origin.source_revision>=revision.invalidated_revision "
        "OR cr.target_start<revision.invalidated_at)"
    )
    connection.execute(
        "CREATE INDEX condition_result_old_compare_key ON "
        "condition_result_old_compare(spot_id,activity,mode,target_start)"
    )
    connection.execute(
        "CREATE INDEX condition_result_old_compare_lookup ON "
        "condition_result_old_compare"
        "(spot_id,activity,mode,content_digest,target_start)"
    )
    connection.execute("ANALYZE condition_result_old_compare")


def _split_result_stage(connection):
    """Split staged intervals at every already stored readable boundary."""
    connection.execute(
        "CREATE INDEX IF NOT EXISTS condition_result_stage_key_idx ON "
        "condition_result_stage(spot_id,activity,mode,target_start)"
    )
    connection.execute("ANALYZE condition_result_stage")
    connection.execute(
        "CREATE TEMP TABLE condition_result_split_keys ON COMMIT DROP AS "
        "SELECT s.spot_id,s.activity,s.mode,s.target_start "
        "FROM condition_result_stage s WHERE EXISTS ("
        "SELECT 1 FROM condition_result_old_compare r "
        "WHERE r.spot_id=s.spot_id AND r.activity=s.activity "
        "AND r.mode=s.mode AND ((r.target_start>s.target_start "
        "AND r.target_start<s.target_end) OR "
        "(r.target_end>s.target_start AND r.target_end<s.target_end)))"
    )
    connection.execute(
        "CREATE UNIQUE INDEX ON condition_result_split_keys"
        "(spot_id,activity,mode,target_start)"
    )
    columns = RESULT_COLUMNS.split(",")
    split_values = ",".join(
        "span.begin"
        if column == "target_start"
        else "span.finish"
        if column == "target_end"
        else f"s.{column}"
        for column in columns
    )
    connection.execute(
        "CREATE TEMP TABLE condition_result_stage_split "
        "(LIKE pongdang_data.condition_result) ON COMMIT DROP"
    )
    connection.execute(
        "INSERT INTO condition_result_stage_split (" + RESULT_COLUMNS + ") "
        "SELECT " + split_values + " FROM condition_result_stage s "
        "JOIN condition_result_split_keys k ON k.spot_id=s.spot_id "
        "AND k.activity=s.activity AND k.mode=s.mode "
        "AND k.target_start=s.target_start "
        "CROSS JOIN LATERAL (SELECT boundary AS begin, "
        "lead(boundary) OVER (ORDER BY boundary) AS finish FROM ("
        "SELECT s.target_start AS boundary UNION SELECT s.target_end "
        "UNION SELECT r.target_start FROM condition_result_old_compare r "
        "WHERE r.spot_id=s.spot_id AND r.activity=s.activity "
        "AND r.mode=s.mode AND r.target_start>s.target_start "
        "AND r.target_start<s.target_end "
        "UNION SELECT r.target_end FROM condition_result_old_compare r "
        "WHERE r.spot_id=s.spot_id AND r.activity=s.activity "
        "AND r.mode=s.mode AND r.target_end>s.target_start "
        "AND r.target_end<s.target_end) boundaries) span "
        "WHERE span.finish IS NOT NULL"
    )
    connection.execute(
        "DELETE FROM condition_result_stage s USING condition_result_split_keys k "
        "WHERE k.spot_id=s.spot_id AND k.activity=s.activity "
        "AND k.mode=s.mode AND k.target_start=s.target_start"
    )
    connection.execute(
        "INSERT INTO condition_result_stage (" + RESULT_COLUMNS + ") "
        "SELECT " + RESULT_COLUMNS + " FROM condition_result_stage_split"
    )
    connection.execute("DROP TABLE condition_result_stage_split")
    connection.execute("DROP TABLE condition_result_split_keys")
    connection.execute("ANALYZE condition_result_stage")


def _insert_missing_result_history(connection, computed_at):
    """Fill only absent D-7 history, clipped at any hard invalidation boundary."""
    now = connection.execute("SELECT clock_timestamp()").fetchone()[0]
    cutoff = now.astimezone(KST).replace(hour=0, minute=0, second=0, microsecond=0)
    cutoff -= timedelta(days=7)
    columns = RESULT_COLUMNS.split(",")
    history_values = ",".join(
        "candidate.begin"
        if column == "target_start"
        else "candidate.finish"
        if column == "target_end"
        else f"s.{column}"
        for column in columns
    )
    return connection.execute(
        "INSERT INTO pongdang_data.condition_result (" + RESULT_COLUMNS + ") "
        "SELECT " + history_values + " FROM condition_result_stage s "
        "JOIN pongdang_data.condition_generation origin ON origin.id=s.generation_id "
        "CROSS JOIN pongdang_data.condition_source_revision revision "
        "CROSS JOIN LATERAL (SELECT greatest(s.target_start,%s) AS begin,"
        "least(s.target_end,%s,CASE WHEN origin.source_revision<"
        "revision.invalidated_revision THEN revision.invalidated_at "
        "ELSE 'infinity'::timestamptz END) AS finish) candidate "
        "WHERE revision.id=1 AND candidate.begin<candidate.finish "
        "AND NOT EXISTS (SELECT 1 FROM condition_result_old_compare r "
        "WHERE r.spot_id=s.spot_id AND r.activity=s.activity "
        "AND r.mode=s.mode AND r.target_start<candidate.finish "
        "AND r.target_end>candidate.begin)",
        [cutoff, computed_at],
    ).rowcount


def _merge_result_stage(connection, computed_at):
    """Freeze elapsed intervals and only replace changed live result segments."""
    # A 100k-row future window is larger than the ordinary 10-second SQL limit.
    # This bounded allowance covers only result reconciliation, not source locks.
    connection.execute("SET LOCAL statement_timeout = 120000")
    # Legacy migrations use PostgreSQL -infinity for an unknown revocation
    # boundary. Keep it in SQL timestamp syntax: Python datetime cannot decode
    # infinity, and the value is only passed back to SQL comparisons below.
    invalidation = connection.execute(
        "SELECT invalidated_revision,invalidated_at::text FROM "
        "pongdang_data.condition_source_revision WHERE id=1"
    ).fetchone()
    if invalidation[0] > 0 and invalidation[1] is not None:
        # A hard correction only preserves intervals before the correction.
        # In particular, the time between correction and this publication is
        # unavailable, including for historical observation requests.
        connection.execute(
            "UPDATE pongdang_data.condition_result r "
            "SET target_end=%s FROM pongdang_data.condition_generation cg "
            "WHERE cg.id=r.generation_id AND cg.result_published "
            "AND cg.source_revision<%s AND r.target_start<%s "
            "AND r.target_end>%s",
            [invalidation[1], invalidation[0], invalidation[1], invalidation[1]],
        )
        connection.execute(
            "DELETE FROM pongdang_data.condition_result r "
            "USING pongdang_data.condition_generation cg "
            "WHERE cg.id=r.generation_id AND cg.result_published "
            "AND cg.source_revision<%s AND r.target_start>=%s",
            [invalidation[0], invalidation[1]],
        )
    _create_result_old_compare(connection)
    _split_result_stage(connection)
    _insert_missing_result_history(connection, computed_at)
    connection.execute(
        "DELETE FROM condition_result_stage WHERE target_end<=%s", [computed_at]
    )
    connection.execute(
        "UPDATE condition_result_stage SET target_start=%s WHERE target_start<%s",
        [computed_at, computed_at],
    )
    connection.execute("ANALYZE condition_result_stage")
    # Reuse checks repeatedly probe interval keys and digests. Project the
    # staged side once so they never revisit its wide JSON heap.
    connection.execute(
        "CREATE TEMP TABLE condition_result_stage_compare ON COMMIT DROP AS "
        "SELECT spot_id,activity,mode,target_start,target_end,content_digest "
        "FROM condition_result_stage"
    )
    connection.execute(
        "CREATE INDEX condition_result_stage_compare_lookup ON "
        "condition_result_stage_compare"
        "(spot_id,activity,mode,content_digest,target_start)"
    )
    connection.execute("ANALYZE condition_result_stage_compare")
    # A stage interval can be split differently from an old interval. A row is
    # reusable when equal-content stage intervals cover all of its live part.
    # PostgreSQL range_agg checks the whole union, including gaps.
    connection.execute(
        "CREATE TEMP TABLE condition_result_reuse ON COMMIT DROP AS "
        "SELECT r.spot_id,r.activity,r.mode,r.target_start "
        "FROM condition_result_old_compare r WHERE r.target_end>%s AND ("
        "SELECT range_agg(tstzrange("
        "greatest(s.target_start,r.target_start,%s),"
        "least(s.target_end,r.target_end),'[)')) "
        "FROM condition_result_stage_compare s WHERE s.spot_id=r.spot_id "
        "AND s.activity=r.activity AND s.mode=r.mode "
        "AND s.content_digest=r.content_digest "
        "AND s.target_start<r.target_end "
        "AND s.target_end>greatest(r.target_start,%s)) "
        "@> tstzrange(greatest(r.target_start,%s),r.target_end,'[)')",
        [computed_at] * 4,
    )
    connection.execute(
        "CREATE UNIQUE INDEX ON condition_result_reuse"
        "(spot_id,activity,mode,target_start)"
    )
    # A stage row need not have exactly the old boundary to be covered. Keep
    # every reusable old JSON row and insert only the uncovered stage intervals.
    connection.execute(
        "CREATE TEMP TABLE condition_result_insert ON COMMIT DROP AS "
        "SELECT s.spot_id,s.activity,s.mode,s.target_start "
        "FROM condition_result_stage_compare s WHERE NOT coalesce(("
        "SELECT range_agg(tstzrange("
        "greatest(r.target_start,s.target_start),"
        "least(r.target_end,s.target_end),'[)')) "
        "FROM condition_result_old_compare r JOIN condition_result_reuse u "
        "ON u.spot_id=r.spot_id AND u.activity=r.activity "
        "AND u.mode=r.mode AND u.target_start=r.target_start "
        "WHERE r.spot_id=s.spot_id AND r.activity=s.activity "
        "AND r.mode=s.mode AND r.content_digest=s.content_digest "
        "AND r.target_start<s.target_end AND r.target_end>s.target_start) "
        "@> tstzrange(s.target_start,s.target_end,'[)'),false)"
    )
    connection.execute(
        "CREATE UNIQUE INDEX ON condition_result_insert"
        "(spot_id,activity,mode,target_start)"
    )
    # The complete generation itself confirms every unchanged live interval.
    # Updating each result tuple just to repeat that fact creates large heap
    # and WAL churn even when all display JSON stays untouched.
    reused = connection.execute(
        "SELECT count(*) FROM condition_result_reuse"
    ).fetchone()[0]
    connection.execute(
        "UPDATE pongdang_data.condition_result r SET target_end=%s "
        "WHERE r.target_start<%s AND r.target_end>%s "
        "AND NOT EXISTS (SELECT 1 FROM condition_result_reuse u "
        "WHERE u.spot_id=r.spot_id AND u.activity=r.activity "
        "AND u.mode=r.mode AND u.target_start=r.target_start)",
        [computed_at] * 3,
    )
    connection.execute(
        "DELETE FROM pongdang_data.condition_result r "
        "WHERE r.target_start>=%s AND NOT EXISTS "
        "(SELECT 1 FROM condition_result_reuse u "
        "WHERE u.spot_id=r.spot_id AND u.activity=r.activity "
        "AND u.mode=r.mode AND u.target_start=r.target_start)",
        [computed_at],
    )
    connection.execute(
        "INSERT INTO pongdang_data.condition_result (" + RESULT_COLUMNS + ") "
        "SELECT s." + RESULT_COLUMNS.replace(",", ",s.") + " "
        "FROM condition_result_stage s JOIN condition_result_insert i "
        "ON i.spot_id=s.spot_id AND i.activity=s.activity "
        "AND i.mode=s.mode AND i.target_start=s.target_start"
    )
    connection.execute("DROP TABLE condition_result_insert")
    connection.execute("DROP TABLE condition_result_reuse")
    connection.execute("DROP TABLE condition_result_stage_compare")
    connection.execute("DROP TABLE condition_result_old_compare")
    connection.execute("SET LOCAL statement_timeout = 10000")
    return reused


def _lock_condition_results(connection):
    connection.execute("SELECT pg_advisory_xact_lock(hashtext(%s))", [RESULT_LOCK])


def _prune_result_history(connection):
    """Retain KST D-7 through D+7, counting changed result rows."""
    now = connection.execute("SELECT clock_timestamp()").fetchone()[0]
    today = now.astimezone(KST).replace(hour=0, minute=0, second=0, microsecond=0)
    cutoff = today - timedelta(days=7)
    deleted_count = 0
    while True:
        deleted = connection.execute(
            "WITH obsolete AS (SELECT ctid FROM pongdang_data.condition_result "
            "WHERE target_end<=%s LIMIT 2000) "
            "DELETE FROM pongdang_data.condition_result r USING obsolete o "
            "WHERE r.ctid=o.ctid",
            [cutoff],
        ).rowcount
        deleted_count += deleted
        if deleted < 2000:
            break
    future_end = today + timedelta(days=8)
    deleted_count += connection.execute(
        "DELETE FROM pongdang_data.condition_result WHERE target_start>=%s",
        [future_end],
    ).rowcount
    clipped_count = connection.execute(
        "UPDATE pongdang_data.condition_result "
        "SET target_start=greatest(target_start,%s), "
        "target_end=least(target_end,%s) "
        "WHERE target_start<%s OR target_end>%s",
        [cutoff, future_end, cutoff, future_end],
    ).rowcount
    return deleted_count + clipped_count


def prune_condition_results(settings):
    """Trim expired published results even when no new score is published."""
    from app.schema import connect

    with connect(settings) as connection:
        _lock_condition_results(connection)
        return _prune_result_history(connection)


def _copy_legacy_result_stage(connection, generation_id, *, before=None):
    last = None
    count = 0
    while True:
        after = (
            ""
            if last is None
            else "AND (spot_id,activity,mode,target_start)>(%s,%s,%s,%s) "
        )
        params = [generation_id]
        if before is not None:
            params.append(before)
        if last is not None:
            params.extend(last)
        rows = connection.execute(
            "SELECT spot_id,activity,mode,target_start,target_end,payload "
            "FROM pongdang_data.condition_snapshot WHERE generation_id=%s "
            + ("AND target_start<%s " if before is not None else "")
            + after
            + "ORDER BY spot_id,activity,mode,target_start LIMIT 500",
            params,
        ).fetchall()
        if not rows:
            return count
        _copy_result_batch(
            connection,
            [
                dict(
                    spot_id=row[0],
                    activity=row[1],
                    mode=row[2],
                    target_start=row[3],
                    target_end=row[4],
                    payload=row[5],
                )
                for row in rows
            ],
            generation_id,
        )
        count += len(rows)
        last = rows[-1][:4]


def _backfill_result_stage_history(connection, computed_at):
    """Insert only missing retained history; never alter current or future rows."""
    connection.execute("SET LOCAL statement_timeout = 120000")
    _create_result_old_compare(connection)
    _split_result_stage(connection)
    inserted = _insert_missing_result_history(connection, computed_at)
    connection.execute("DROP TABLE condition_result_old_compare")
    connection.execute("SET LOCAL statement_timeout = 10000")
    return inserted


def _backfill_latest_result(connection):
    """Make the last two legacy publications readable before workers run again."""
    generations = connection.execute(
        "SELECT id,computed_at FROM pongdang_data.condition_generation "
        "WHERE id IN (SELECT DISTINCT generation_id FROM "
        "pongdang_data.condition_snapshot) ORDER BY id DESC LIMIT 2"
    ).fetchall()
    if not generations:
        return
    _create_result_stage(connection)
    # The newest complete legacy generation is what users saw before the
    # migration. Publish it first; older generations may fill historical gaps
    # but must never replace its history or live projection.
    for index, (generation_id, computed_at) in enumerate(generations):
        if index == 0:
            _copy_legacy_result_stage(connection, generation_id)
            _merge_result_stage(connection, computed_at)
        else:
            # Older generations can only fill completed historical gaps.
            # Avoid copying their large future payloads into the repair stage.
            _copy_legacy_result_stage(connection, generation_id, before=computed_at)
            _backfill_result_stage_history(connection, computed_at)
        connection.execute(
            "UPDATE pongdang_data.condition_generation "
            "SET result_published=true WHERE id=%s",
            [generation_id],
        )
        connection.execute("TRUNCATE condition_result_stage")
    _prune_result_history(connection)
    connection.execute("DROP TABLE condition_result_stage")


def repair_condition_result_history(settings):
    """Fill missing D-7 legacy history without touching published live results."""
    from app.schema import connect

    with connect(settings) as connection:
        _lock_condition_results(connection)
        version = connection.execute(
            "SELECT version FROM pongdang_data.schema_version WHERE id=1"
        ).fetchone()[0]
        if version != 20:
            raise ValueError("Condition history repair requires schema v20")
        generations = connection.execute(
            "SELECT id,computed_at FROM pongdang_data.condition_generation "
            "WHERE result_published AND id IN (SELECT DISTINCT generation_id "
            "FROM pongdang_data.condition_snapshot) ORDER BY id DESC LIMIT 2"
        ).fetchall()
        if not generations:
            return 0
        _create_result_stage(connection)
        inserted = 0
        for generation_id, computed_at in generations:
            _copy_legacy_result_stage(connection, generation_id, before=computed_at)
            inserted += _backfill_result_stage_history(connection, computed_at)
            connection.execute("TRUNCATE condition_result_stage")
        connection.execute("DROP TABLE condition_result_stage")
        return inserted


def publish_conditions(settings, *, records, computed_at, source_revision):
    """Publish a complete generation atomically, only for the inputs we read."""
    from app.schema import connect

    if computed_at > datetime.now(UTC):
        raise ValueError("Condition calculation cannot use future knowledge")
    with connect(settings) as c:
        _lock_condition_results(c)
        current = c.execute(
            "SELECT revision FROM pongdang_data.condition_source_revision WHERE id=1"
        ).fetchone()[0]
        if current != source_revision:
            raise ConditionInputsChanged
        previous = c.execute(
            "SELECT g.id,g.source_revision,g.computed_at FROM "
            "pongdang_data.condition_generation g CROSS JOIN "
            "pongdang_data.condition_source_revision r WHERE r.id=1 "
            "AND g.result_published "
            "AND g.source_revision>=r.invalidated_revision "
            "AND g.model_version=%s ORDER BY g.id DESC LIMIT 1",
            [MODEL_VERSION],
        ).fetchone()
        generation = c.execute(
            "INSERT INTO pongdang_data.condition_generation "
            "(source_revision,model_version,computed_at,record_count) "
            "VALUES(%s,%s,%s,%s) ON CONFLICT DO NOTHING RETURNING id",
            [source_revision, MODEL_VERSION, computed_at, 0],
        ).fetchone()
        if generation is None:
            return 0

        def origin(identifier, revision, timestamp):
            return dict(
                generation_id=identifier,
                source_revision=revision,
                computed_at=timestamp.isoformat(),
                refresh_after=(
                    timestamp + timedelta(seconds=REFRESH_SECONDS)
                ).isoformat(),
                status="ready",
                retention_allowed=True,
            )

        retention = RetainedPublication(
            c,
            origin(*previous) if previous else None,
            origin(generation[0], source_revision, computed_at),
        )
        _create_result_stage(c)
        count = 0
        # Materialize only one small batch before opening COPY: Python scoring
        # must not consume the database statement timeout while COPY is open.
        for batch in batched(records, 500, strict=False):
            retained = list(retention.records(batch))
            _copy_result_batch(c, retained, generation[0])
            count += len(retained)
        reused = _merge_result_stage(c, computed_at)
        _prune_result_history(c)
        c.execute(
            "UPDATE pongdang_data.condition_generation "
            "SET record_count=%s,reused_count=%s,result_published=true,"
            "published_at=clock_timestamp() WHERE id=%s",
            [count, reused, generation[0]],
        )
        # Computing and copying must not block source commits. Lock only for
        # the final publication check; changed input rolls back the publication.
        current = c.execute(
            "SELECT revision FROM pongdang_data.condition_source_revision "
            "WHERE id=1 FOR SHARE"
        ).fetchone()[0]
        if current != source_revision:
            raise ConditionInputsChanged
    return count


def _unavailable(q, at, as_of, row):
    reason = (
        "condition_projection_pending"
        if row["latest_generation_id"] is None
        else "condition_projection_unavailable_for_target"
    )
    definition = ACTIVITIES[q.activity]
    return ConditionsEnvelope(
        spot_id=q.spot_id,
        place_name=row["name"],
        activity=q.activity,
        mode=q.mode,
        at=at,
        as_of=as_of,
        support_status="unknown",
        safety_status="unknown",
        restriction_refs=(),
        metrics=(),
        context_metrics=(),
        missing_metrics=tuple(m.name for m in definition.metrics),
        required_evidence=definition.required_evidence,
        reason_codes=(reason,),
        condition_score=ActivityScore(
            status="unavailable",
            score=None,
            coverage=0.0,
            available_components=0,
            total_components=len(definition.metrics),
            components=(),
            reason_codes=(reason, "not_a_safety_score"),
            sources=(),
        ),
    )


async def read_condition_set(reader, queries, *, now=None, connection=None):
    """One SELECT for bounded places/activities/targets in one consistent set.

    Read the last complete publication even through collection/expiry gaps.
    Restrictions and mapping changes still revoke affected evidence. No
    calculation or write happens on a cache miss.
    """
    if not queries or len(queries) > 200:
        raise ValueError("A condition set must contain 1 to 200 queries")
    now = now or datetime.now(UTC)
    wanted = []
    for index, q in enumerate(queries):
        at, as_of = q.times(now)
        wanted.append(
            dict(
                ordinal=index,
                spot_id=q.spot_id,
                activity=q.activity,
                mode=q.mode,
                at=at.isoformat(),
                as_of=as_of.isoformat(),
            )
        )
    async with (
        nullcontext(connection) if connection is not None else reader.connection()
    ) as c:
        rows = await (
            await c.execute(
                "WITH wanted AS (SELECT * FROM jsonb_to_recordset(%s::jsonb) AS q("
                "ordinal int,spot_id bigint,activity text,mode text,at timestamptz,"
                "as_of timestamptz)), revision AS (SELECT revision,"
                "invalidated_revision,invalidated_at FROM "
                "pongdang_data.condition_source_revision WHERE id=1), "
                "latest AS (SELECT id,source_revision,computed_at FROM "
                "pongdang_data.condition_generation WHERE result_published "
                "AND model_version=%s "
                "ORDER BY id DESC LIMIT 1) "
                "SELECT q.ordinal,p.id AS place_id,p.name,r.revision,"
                "r.invalidated_revision,latest.id AS latest_generation_id,"
                "g.id AS projection_generation_id,g.source_revision,"
                "g.computed_at,s.* "
                "FROM wanted q "
                "CROSS JOIN revision r LEFT JOIN latest ON true "
                "LEFT JOIN pongdang_data.spots_waterspot p "
                "ON p.id=q.spot_id LEFT JOIN LATERAL (SELECT cr.* FROM "
                "pongdang_data.condition_result cr JOIN "
                "pongdang_data.condition_generation origin "
                "ON origin.id=cr.generation_id AND origin.result_published "
                "WHERE cr.spot_id=q.spot_id AND cr.activity=q.activity "
                "AND cr.mode=q.mode AND cr.target_start<=q.at "
                "AND (cr.target_end>q.at OR "
                "(q.mode='observation' AND q.at>=%s "
                "AND origin.source_revision>=r.invalidated_revision)) "
                "AND ((q.at<%s AND (origin.source_revision>=r.invalidated_revision "
                "OR q.at<r.invalidated_at)) OR "
                "(q.at>=%s AND latest.source_revision>=r.invalidated_revision)) "
                "AND origin.model_version=%s AND origin.computed_at<=q.as_of "
                "AND (q.at<%s OR latest.computed_at<=q.as_of) "
                "ORDER BY cr.target_start DESC LIMIT 1) s ON true "
                "LEFT JOIN pongdang_data.condition_generation g "
                "ON g.id=CASE WHEN s.generation_id IS NULL THEN NULL "
                "WHEN q.at<%s THEN s.generation_id "
                "ELSE latest.id END AND g.result_published ORDER BY q.ordinal",
                [Jsonb(wanted), MODEL_VERSION, now, now, now, MODEL_VERSION, now, now],
            )
        ).fetchall()
    result = []
    for row, q in zip(rows, queries, strict=True):
        if row["place_id"] is None:
            result.append(HTTPException(404, "place_not_found"))
            continue
        at, as_of = q.times(now)
        if row["generation_id"] is None:
            envelope = _unavailable(q, at, as_of, row)
        else:
            payload = result_payload(row)
            retained_at = payload.get("retained_at")
            envelope = ConditionsEnvelope.model_validate(
                {**payload, "at": at, "as_of": as_of, "retained_at": retained_at}
            )
        computed_at = row["computed_at"]
        if envelope.retained and envelope.projection:
            computed_at = envelope.projection.computed_at
        result.append(
            envelope.model_copy(
                update={
                    "projection": ConditionProjection(
                        generation_id=row["projection_generation_id"]
                        if row["generation_id"] is not None
                        else row["latest_generation_id"]
                        if row["invalidated_revision"] == 0
                        else None,
                        source_revision=row["source_revision"]
                        if row["generation_id"] is not None
                        else row["revision"],
                        latest_source_revision=row["revision"],
                        computed_at=computed_at,
                        # A completed display is ready even while the worker is
                        # fetching or publishing its replacement. Do not turn a
                        # source revision or an old calculation clock into fast
                        # frontend polling; ordinary reads use their 30m cadence.
                        refresh_after=None,
                        status="ready"
                        if row["generation_id"] is not None
                        else "pending",
                        retention_allowed=(
                            row["generation_id"] is not None
                            or row["invalidated_revision"] == 0
                        ),
                    ),
                }
            )
        )
    return result


async def read_condition_summaries(reader, queries, *, now=None, connection=None):
    """Read list fields directly from durable results, without evidence JSON."""
    if not queries or len(queries) > 200:
        raise ValueError("A condition set must contain 1 to 200 queries")
    now = now or datetime.now(UTC)
    wanted = []
    for index, q in enumerate(queries):
        at, as_of = q.times(now)
        wanted.append(
            dict(
                ordinal=index,
                spot_id=q.spot_id,
                activity=q.activity,
                mode=q.mode,
                at=at.isoformat(),
                as_of=as_of.isoformat(),
            )
        )
    async with (
        nullcontext(connection) if connection is not None else reader.connection()
    ) as c:
        rows = await (
            await c.execute(
                "WITH wanted AS (SELECT * FROM jsonb_to_recordset(%s::jsonb) AS q("
                "ordinal int,spot_id bigint,activity text,mode text,at timestamptz,"
                "as_of timestamptz)), revision AS (SELECT revision,"
                "invalidated_revision,invalidated_at FROM "
                "pongdang_data.condition_source_revision WHERE id=1), "
                "latest AS (SELECT id,source_revision,computed_at FROM "
                "pongdang_data.condition_generation WHERE result_published "
                "AND model_version=%s "
                "ORDER BY id DESC LIMIT 1) "
                "SELECT q.ordinal,p.id AS place_id,p.name,r.revision,"
                "r.invalidated_revision,latest.id AS latest_generation_id,"
                "s.generation_id,g.source_revision,s.place_name,s.support_status,"
                "s.safety_status,s.condition_score,s.water_temperature,"
                "s.expires_at,s.retained FROM wanted q CROSS JOIN revision r "
                "LEFT JOIN latest ON true "
                "LEFT JOIN pongdang_data.spots_waterspot p ON p.id=q.spot_id "
                "LEFT JOIN LATERAL (SELECT cr.generation_id,"
                "cr.place_name,"
                "cr.support_status,"
                "cr.safety_status,cr.condition_score,cr.water_temperature,"
                "cr.expires_at,cr.retained FROM pongdang_data.condition_result cr "
                "JOIN pongdang_data.condition_generation origin "
                "ON origin.id=cr.generation_id AND origin.result_published "
                "WHERE cr.spot_id=q.spot_id "
                "AND cr.activity=q.activity AND cr.mode=q.mode "
                "AND cr.target_start<=q.at "
                "AND (cr.target_end>q.at OR "
                "(q.mode='observation' AND q.at>=%s "
                "AND origin.source_revision>=r.invalidated_revision)) "
                "AND ((q.at<%s AND (origin.source_revision>=r.invalidated_revision "
                "OR q.at<r.invalidated_at)) OR "
                "(q.at>=%s AND latest.source_revision>=r.invalidated_revision)) "
                "AND origin.model_version=%s AND origin.computed_at<=q.as_of "
                "AND (q.at<%s OR latest.computed_at<=q.as_of) "
                "ORDER BY cr.target_start DESC LIMIT 1) s ON true "
                "LEFT JOIN pongdang_data.condition_generation g "
                "ON g.id=CASE WHEN s.generation_id IS NULL THEN NULL "
                "WHEN q.at<%s THEN s.generation_id "
                "ELSE latest.id END AND g.result_published ORDER BY q.ordinal",
                [Jsonb(wanted), MODEL_VERSION, now, now, now, MODEL_VERSION, now, now],
            )
        ).fetchall()
    result = []
    for row, q in zip(rows, queries, strict=True):
        if row["place_id"] is None:
            result.append(HTTPException(404, "place_not_found"))
            continue
        at, as_of = q.times(now)
        if row["generation_id"] is None:
            result.append(
                summarize_conditions(_unavailable(q, at, as_of, row)).model_copy(
                    update={"retention_allowed": row["invalidated_revision"] == 0}
                )
            )
            continue
        result.append(
            ConditionSummary.model_validate(
                dict(
                    spot_id=q.spot_id,
                    place_name=row["place_name"],
                    support_status=row["support_status"],
                    safety_status=row["safety_status"],
                    condition_score=row["condition_score"],
                    retained=row["retained"],
                    retention_allowed=True,
                    water_temperature=row["water_temperature"],
                    expires_at=row["expires_at"],
                )
            )
        )
    return result


async def read_projected_conditions(reader, q, *, now=None, connection=None):
    result = (await read_condition_set(reader, [q], now=now, connection=connection))[0]
    if isinstance(result, HTTPException):
        raise result
    return result
