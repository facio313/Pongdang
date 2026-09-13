"""Explicit additive private notification tables; excluded from data allowlist."""

from psycopg import sql


def migrate(connection):
    connection.execute(
        "CREATE TABLE IF NOT EXISTS pongdang_data.notification_subscription ("
        "id text PRIMARY KEY, owner_subject text NOT NULL, "
        "spot_id bigint NOT NULL REFERENCES pongdang_data.spots_waterspot(id), "
        "season_year integer NOT NULL CHECK(season_year BETWEEN 2000 AND 2100), "
        "timezone text NOT NULL, minimum_temperature_c double precision NOT NULL "
        "CHECK(minimum_temperature_c BETWEEN -5 AND 60), channel text NOT NULL "
        "CHECK(channel IN ('in_app','email')), destination text, "
        "active boolean NOT NULL DEFAULT true, revision integer NOT NULL DEFAULT 1, "
        "created_at timestamptz NOT NULL DEFAULT now(), "
        "updated_at timestamptz NOT NULL DEFAULT now(), "
        "condition_state text NOT NULL DEFAULT 'unknown', "
        "last_evaluated_at timestamptz, "
        "UNIQUE(owner_subject,spot_id,season_year))"
    )
    connection.execute(
        "CREATE TABLE IF NOT EXISTS pongdang_data.notification_evaluation ("
        "id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, "
        "subscription_id text NOT NULL REFERENCES "
        "pongdang_data.notification_subscription(id), "
        "subscription_revision integer NOT NULL, evaluated_at timestamptz NOT NULL, "
        "evidence_key text NOT NULL, condition_state text NOT NULL, "
        "payload jsonb NOT NULL, UNIQUE(subscription_id,subscription_revision,"
        "evidence_key))"
    )
    connection.execute(
        "CREATE TABLE IF NOT EXISTS pongdang_data.notification_event ("
        "id text PRIMARY KEY, subscription_id text NOT NULL REFERENCES "
        "pongdang_data.notification_subscription(id), "
        "subscription_revision integer NOT NULL, season_year integer NOT NULL, "
        "kind text NOT NULL, state text NOT NULL DEFAULT 'active', "
        "created_at timestamptz NOT NULL, payload jsonb NOT NULL)"
    )
    # Replace the pre-release draft's over-broad uniqueness without removing any
    # event/evidence. Corrected, never-dispatched events must not consume a season.
    old_constraints = connection.execute(
        "SELECT conname FROM pg_constraint WHERE "
        "conrelid='pongdang_data.notification_event'::regclass AND contype='u' "
        "AND pg_get_constraintdef(oid)="
        "'UNIQUE (subscription_id, subscription_revision, season_year, kind)'"
    ).fetchall()
    for (name,) in old_constraints:
        connection.execute(
            sql.SQL(
                "ALTER TABLE pongdang_data.notification_event DROP CONSTRAINT {}"
            ).format(sql.Identifier(name))
        )
    connection.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS notification_active_event_unique ON "
        "pongdang_data.notification_event "
        "(subscription_id,subscription_revision,season_year,kind) WHERE state='active'"
    )
    connection.execute(
        "CREATE TABLE IF NOT EXISTS pongdang_data.notification_outbox ("
        "event_id text PRIMARY KEY REFERENCES "
        "pongdang_data.notification_event(id), state text NOT NULL, "
        "attempts integer NOT NULL DEFAULT 0, first_attempt_at timestamptz, "
        "next_attempt_at timestamptz NOT NULL, provider text NOT NULL, "
        "provider_message_id text, last_error text, "
        "message_payload jsonb, updated_at timestamptz NOT NULL)"
    )
    connection.execute(
        "CREATE INDEX IF NOT EXISTS notification_owner_idx ON "
        "pongdang_data.notification_subscription(owner_subject,id)"
    )
    connection.execute(
        "CREATE INDEX IF NOT EXISTS notification_outbox_due_idx ON "
        "pongdang_data.notification_outbox(next_attempt_at) "
        "WHERE state IN ('pending','retry','sending','not_configured')"
    )
    connection.execute(
        "CREATE TABLE IF NOT EXISTS pongdang_data.notification_delivery_attempt ("
        "id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, "
        "event_id text NOT NULL REFERENCES pongdang_data.notification_event(id), "
        "attempt integer NOT NULL, attempted_at timestamptz NOT NULL, "
        "state text NOT NULL, error_code text, UNIQUE(event_id,attempt))"
    )
