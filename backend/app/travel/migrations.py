"""Explicit additive v8 migration; never run from startup or a request."""


def migrate_travel(c):
    c.execute(
        "CREATE TABLE IF NOT EXISTS pongdang_data.travel_preference ("
        "owner_subject text PRIMARY KEY, revision integer NOT NULL CHECK(revision>0),"
        "payload jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())"
    )
    c.execute(
        "CREATE TABLE IF NOT EXISTS pongdang_data.travel_signal ("
        "id text PRIMARY KEY, owner_subject text NOT NULL, payload jsonb NOT NULL,"
        "created_at timestamptz NOT NULL DEFAULT now())"
    )
    c.execute(
        "CREATE INDEX IF NOT EXISTS travel_signal_owner_idx ON "
        "pongdang_data.travel_signal(owner_subject,created_at DESC,id)"
    )
    c.execute(
        "CREATE TABLE IF NOT EXISTS pongdang_data.travel_plan ("
        "id text PRIMARY KEY, owner_subject text NOT NULL,"
        "revision integer NOT NULL CHECK(revision>0), payload jsonb NOT NULL,"
        "updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(id,owner_subject))"
    )
    c.execute(
        "CREATE INDEX IF NOT EXISTS travel_plan_owner_idx ON "
        "pongdang_data.travel_plan(owner_subject,updated_at DESC,id)"
    )
    c.execute(
        "CREATE TABLE IF NOT EXISTS pongdang_data.travel_session ("
        "id text PRIMARY KEY, owner_subject text NOT NULL, plan_id text NOT NULL,"
        "revision integer NOT NULL CHECK(revision>0), payload jsonb NOT NULL,"
        "updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(id,owner_subject),"
        "FOREIGN KEY(plan_id,owner_subject) REFERENCES "
        "pongdang_data.travel_plan(id,owner_subject) ON DELETE CASCADE)"
    )
    c.execute(
        "CREATE INDEX IF NOT EXISTS travel_session_owner_idx ON "
        "pongdang_data.travel_session(owner_subject,updated_at DESC,id)"
    )
    c.execute(
        "CREATE TABLE IF NOT EXISTS pongdang_data.travel_event ("
        "id text PRIMARY KEY, owner_subject text NOT NULL, session_id text NOT NULL,"
        "deduplication_key text NOT NULL, payload jsonb NOT NULL,"
        "created_at timestamptz NOT NULL DEFAULT now(),"
        "UNIQUE(session_id,deduplication_key), FOREIGN KEY(session_id,owner_subject)"
        " REFERENCES pongdang_data.travel_session(id,owner_subject) ON DELETE CASCADE)"
    )
    c.execute(
        "CREATE INDEX IF NOT EXISTS travel_event_owner_idx ON "
        "pongdang_data.travel_event(owner_subject,session_id,created_at DESC,id)"
    )
    # No public catalog entry or model tool can select these tables.
    for table in ("preference", "signal", "plan", "session", "event"):
        c.execute(f"REVOKE ALL ON pongdang_data.travel_{table} FROM PUBLIC")
    c.execute("UPDATE pongdang_data.schema_version SET version=8 WHERE id=1")
