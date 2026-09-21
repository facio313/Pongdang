"""Invalidate published conditions only when collection inputs actually change."""

from time import monotonic, sleep

from psycopg import errors, sql

INPUT_TABLES = (
    ("conditions_observationsnapshot", ()),
    ("conditions_observationmetric", ()),
    ("collection_station", ("fetched_at",)),
    ("spots_waterspot", ("catalog_verified_at",)),
    ("water_index_station_mapping", ()),
    ("water_index_authority_evidence", ()),
)


def _lock_inputs(connection):
    """Wait for active readers without queuing an exclusive lock behind them."""
    # Ensure transaction() below is a savepoint even for a fresh connection.
    connection.execute("SELECT 1")
    deadline = monotonic() + 300
    statement = sql.SQL("LOCK TABLE {} IN ACCESS EXCLUSIVE MODE NOWAIT").format(
        sql.SQL(", ").join(
            sql.Identifier("pongdang_data", table) for table, _ in INPUT_TABLES
        )
    )
    while True:
        try:
            # A failed multi-table attempt must release every lock it acquired.
            # Success retains the locks until the outer migration commits.
            with connection.transaction():
                connection.execute(statement)
            return
        except errors.LockNotAvailable:
            if monotonic() >= deadline:
                raise
            sleep(0.5)


def migrate_condition_invalidation(connection):
    """Replace v15 statement triggers without changing source data or scores."""
    _lock_inputs(connection)
    connection.execute("""
        CREATE OR REPLACE FUNCTION pongdang_data.condition_input_content(
            content jsonb, refresh_fields text[], cutoff timestamptz
        ) RETURNS jsonb LANGUAGE sql STABLE AS $$
            SELECT content - ARRAY(
                SELECT field FROM unnest(refresh_fields) AS field
                WHERE content->field <> 'null'::jsonb
                  AND (content->>field)::timestamptz <= cutoff
            )
        $$
    """)
    # NULL/future metadata timestamps remain significant. Once already known,
    # a later successful verification alone does not alter condition inputs.
    # Observation fetch/expiry timestamps are NEVER excluded.
    connection.execute("""
        CREATE OR REPLACE FUNCTION pongdang_data.invalidate_condition_projection()
        RETURNS trigger LANGUAGE plpgsql AS $$
        DECLARE changed boolean;
        BEGIN
            IF TG_OP = 'INSERT' THEN
                SELECT EXISTS(SELECT 1 FROM new_inputs) INTO changed;
            ELSIF TG_OP = 'DELETE' THEN
                SELECT EXISTS(SELECT 1 FROM old_inputs) INTO changed;
            ELSIF TG_OP = 'UPDATE' THEN
                SELECT EXISTS(
                    SELECT pongdang_data.condition_input_content(
                        to_jsonb(n), TG_ARGV, statement_timestamp()
                    ) FROM new_inputs n
                    EXCEPT
                    SELECT pongdang_data.condition_input_content(
                        to_jsonb(o), TG_ARGV, statement_timestamp()
                    ) FROM old_inputs o
                ) INTO changed;
            ELSE
                changed := true;
            END IF;
            IF changed THEN
                UPDATE pongdang_data.condition_source_revision
                SET revision=revision+1 WHERE id=1;
            END IF;
            RETURN NULL;
        END $$
    """)
    for table, refresh_fields in INPUT_TABLES:
        target = sql.Identifier("pongdang_data", table)
        connection.execute(
            sql.SQL("DROP TRIGGER IF EXISTS condition_projection_changed ON {}").format(
                target
            )
        )
        for event, transition in (
            ("INSERT", "REFERENCING NEW TABLE AS new_inputs"),
            ("DELETE", "REFERENCING OLD TABLE AS old_inputs"),
            ("UPDATE", "REFERENCING OLD TABLE AS old_inputs NEW TABLE AS new_inputs"),
            ("TRUNCATE", ""),
        ):
            connection.execute(
                sql.SQL(
                    "CREATE OR REPLACE TRIGGER {} AFTER {} ON {} {} "
                    "FOR EACH STATEMENT EXECUTE FUNCTION "
                    "pongdang_data.invalidate_condition_projection({})"
                ).format(
                    sql.Identifier("condition_projection_changed_" + event.lower()),
                    sql.SQL(event),
                    target,
                    sql.SQL(transition),
                    sql.SQL(",").join(map(sql.Literal, refresh_fields)),
                )
            )
    connection.execute("UPDATE pongdang_data.schema_version SET version=16 WHERE id=1")
