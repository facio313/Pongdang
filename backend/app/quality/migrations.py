"""Additive storage; no seed, no migration on HTTP or application startup."""


def migrate(connection):
    connection.execute(
        "CREATE TABLE IF NOT EXISTS pongdang_data.quality_observation ("
        "evidence_id text PRIMARY KEY, owner_key text NOT NULL, "
        "review_id text NOT NULL, "
        "revision integer NOT NULL CHECK(revision>0), "
        "spot_id bigint NOT NULL REFERENCES "
        "pongdang_data.spots_waterspot(id), observed_at timestamptz NOT NULL, "
        "received_at timestamptz NOT NULL DEFAULT clock_timestamp(), "
        "retracted boolean NOT NULL, payload jsonb NOT NULL, digest text NOT NULL, "
        "UNIQUE(owner_key,review_id,revision))"
    )
    connection.execute(
        "CREATE INDEX IF NOT EXISTS quality_observation_lookup ON "
        "pongdang_data.quality_observation (spot_id,received_at DESC)"
    )
    connection.execute(
        "CREATE TABLE IF NOT EXISTS pongdang_data.quality_analysis ("
        "analysis_id text PRIMARY KEY, spot_id bigint NOT NULL REFERENCES "
        "pongdang_data.spots_waterspot(id), from_at timestamptz NOT NULL, "
        "until_at timestamptz NOT NULL, as_of timestamptz NOT NULL, "
        "available_at timestamptz NOT NULL DEFAULT clock_timestamp(), "
        "payload jsonb NOT NULL, digest text NOT NULL, CHECK(until_at>from_at))"
    )
    connection.execute(
        "CREATE INDEX IF NOT EXISTS quality_analysis_lookup ON "
        "pongdang_data.quality_analysis (spot_id,available_at DESC)"
    )
    connection.execute(
        "CREATE TABLE IF NOT EXISTS pongdang_data.quality_job_cursor ("
        "id integer PRIMARY KEY CHECK(id=1), last_spot_id bigint NOT NULL DEFAULT 0)"
    )
    connection.execute(
        "CREATE OR REPLACE FUNCTION pongdang_data.quality_immutable() "
        "RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN "
        "RAISE EXCEPTION 'Quality evidence history is immutable'; END; $$"
    )
    for table in ("quality_observation", "quality_analysis"):
        connection.execute(
            f"CREATE OR REPLACE TRIGGER {table}_immutable "
            f"BEFORE UPDATE OR DELETE ON pongdang_data.{table} "
            "FOR EACH ROW EXECUTE FUNCTION pongdang_data.quality_immutable()"
        )
