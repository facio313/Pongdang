"""Worker-published condition sets. Product reads never calculate a score."""

import json
from contextlib import nullcontext
from datetime import UTC, datetime, timedelta
from functools import partial
from itertools import batched

from fastapi import HTTPException
from psycopg import sql
from psycopg.types.json import Jsonb

from app.water_index.activity_score import ActivityScore
from app.water_index.condition_retention import RetainedPublication
from app.water_index.conditions import (
    ACTIVITIES,
    ConditionProjection,
    ConditionsEnvelope,
)

MODEL_VERSION = "1.0.0"
REFRESH_SECONDS = 600
RETAIN_GENERATIONS = 2
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


def projection_revision(connection):
    row = connection.execute(
        "SELECT revision FROM pongdang_data.condition_source_revision WHERE id=1"
    ).fetchone()
    return row["revision"] if isinstance(row, dict) else row[0]


def projection_is_current(connection, source_revision, day_start):
    row = connection.execute(
        "SELECT EXISTS(SELECT 1 FROM pongdang_data.condition_generation "
        "WHERE source_revision=%s AND model_version=%s AND computed_at>=%s) AS ready",
        [source_revision, MODEL_VERSION, day_start],
    ).fetchone()
    return row["ready"] if isinstance(row, dict) else row[0]


def projection_due(connection):
    row = connection.execute(
        "SELECT NOT EXISTS(SELECT 1 FROM pongdang_data.condition_generation g "
        "JOIN pongdang_data.condition_source_revision r "
        "ON r.id=1 AND g.source_revision=r.revision WHERE g.model_version=%s "
        "AND g.computed_at >= date_trunc('day',now() AT TIME ZONE 'Asia/Seoul') "
        "AT TIME ZONE 'Asia/Seoul') AS due",
        [MODEL_VERSION],
    ).fetchone()
    return row["due"] if isinstance(row, dict) else row[0]


def _prune_generations(connection):
    cutoff = connection.execute(
        "SELECT id FROM pongdang_data.condition_generation "
        "ORDER BY id DESC OFFSET %s LIMIT 1",
        [RETAIN_GENERATIONS - 1],
    ).fetchone()
    if cutoff is None:
        return
    # A generation contains more than 100,000 large JSONB rows in production.
    # Bound each deletion statement, not the surrounding atomic transaction.
    while True:
        deleted = connection.execute(
            "WITH obsolete AS (SELECT ctid FROM pongdang_data.condition_snapshot "
            "WHERE generation_id<%s LIMIT 2000) "
            "DELETE FROM pongdang_data.condition_snapshot s USING obsolete o "
            "WHERE s.ctid=o.ctid",
            [cutoff[0]],
        ).rowcount
        if deleted < 2000:
            return


def publish_conditions(settings, *, records, computed_at, source_revision):
    """Publish a complete generation atomically, only for the inputs we read."""
    from app.schema import connect

    if computed_at > datetime.now(UTC):
        raise ValueError("Condition calculation cannot use future knowledge")
    with connect(settings) as c:
        current = c.execute(
            "SELECT revision FROM pongdang_data.condition_source_revision WHERE id=1"
        ).fetchone()[0]
        if current != source_revision:
            raise ConditionInputsChanged
        previous = c.execute(
            "SELECT g.id,g.source_revision,g.computed_at FROM "
            "pongdang_data.condition_generation g CROSS JOIN "
            "pongdang_data.condition_source_revision r WHERE r.id=1 "
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
        count = 0
        # Materialize only one small batch before opening COPY: Python scoring
        # must not consume the database statement timeout while COPY is open.
        for batch in batched(records, 500, strict=False):
            retained = list(retention.records(batch))
            with (
                c.cursor() as cursor,
                cursor.copy(
                    "COPY pongdang_data.condition_snapshot "
                    "(generation_id,spot_id,activity,mode,"
                    "target_start,target_end,payload) "
                    "FROM STDIN"
                ) as copy,
            ):
                for record in retained:
                    copy.write_row(
                        (
                            generation[0],
                            record["spot_id"],
                            record["activity"],
                            record["mode"],
                            record["target_start"],
                            record["target_end"],
                            Jsonb(record["payload"], dumps=_payload_json),
                        )
                    )
                    count += 1
        # Last usable values were copied forward with their original evidence
        # and times. Pruning old generations must not prune those display values.
        _prune_generations(c)
        c.execute(
            "UPDATE pongdang_data.condition_generation "
            "SET record_count=%s,published_at=clock_timestamp() WHERE id=%s",
            [count, generation[0]],
        )
        # Computing, copying and removing old generations must not block source
        # commits. Lock only for the final publication check; a changed input
        # rolls back this entire transaction, including generation cleanup.
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
        if row["generation_id"] is None
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
                "invalidated_revision FROM "
                "pongdang_data.condition_source_revision WHERE id=1) "
                "SELECT q.ordinal,p.id AS place_id,p.name,r.revision,"
                "r.invalidated_revision,g.source_revision,g.id AS "
                "generation_id,g.computed_at,s.payload FROM wanted q "
                "CROSS JOIN revision r LEFT JOIN pongdang_data.spots_waterspot p "
                "ON p.id=q.spot_id LEFT JOIN LATERAL (SELECT id,computed_at,"
                "source_revision FROM pongdang_data.condition_generation "
                "WHERE source_revision>=r.invalidated_revision "
                "AND source_revision<=r.revision "
                "AND model_version=%s AND computed_at<=q.as_of "
                "ORDER BY id DESC LIMIT 1) g ON true "
                "LEFT JOIN LATERAL (SELECT payload FROM "
                "pongdang_data.condition_snapshot WHERE generation_id=g.id "
                "AND spot_id=q.spot_id AND activity=q.activity AND mode=q.mode "
                "AND target_start<=q.at "
                "AND (q.mode='observation' OR target_end>q.at) "
                "ORDER BY target_start DESC LIMIT 1) s ON true ORDER BY q.ordinal",
                [Jsonb(wanted), MODEL_VERSION],
            )
        ).fetchall()
    result = []
    for row, q in zip(rows, queries, strict=True):
        if row["place_id"] is None:
            result.append(HTTPException(404, "place_not_found"))
            continue
        at, as_of = q.times(now)
        if row["payload"] is None:
            envelope = _unavailable(q, at, as_of, row)
        else:
            payload = row["payload"]
            retained_at = payload.get("retained_at")
            envelope = ConditionsEnvelope.model_validate(
                {**payload, "at": at, "as_of": as_of, "retained_at": retained_at}
            )
        computed_at = row["computed_at"]
        if envelope.retained and envelope.projection:
            computed_at = envelope.projection.computed_at
        refreshing = envelope.retained or bool(
            row["payload"] and row["source_revision"] != row["revision"]
        )
        result.append(
            envelope.model_copy(
                update={
                    "retained": refreshing,
                    "projection": ConditionProjection(
                        generation_id=row["generation_id"],
                        source_revision=row["source_revision"]
                        if row["generation_id"] is not None
                        else row["revision"],
                        latest_source_revision=row["revision"],
                        computed_at=computed_at,
                        refresh_after=computed_at + timedelta(seconds=REFRESH_SECONDS)
                        if computed_at
                        else None,
                        status="refreshing"
                        if refreshing
                        else "ready"
                        if row["payload"]
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


async def read_projected_conditions(reader, q, *, now=None, connection=None):
    result = (await read_condition_set(reader, [q], now=now, connection=connection))[0]
    if isinstance(result, HTTPException):
        raise result
    return result
