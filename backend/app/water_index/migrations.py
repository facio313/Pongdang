"""Additive v4 storage for explicit, immutable Water Index evidence views."""


def migrate_water_index(connection):
    """Create empty history tables; never infer targets or seed assessments."""
    connection.execute(
        "CREATE TABLE IF NOT EXISTS pongdang_data.water_index_target ("
        "target_id text PRIMARY KEY, spot_id bigint NOT NULL REFERENCES "
        "pongdang_data.spots_waterspot(id), activity text NOT NULL, "
        "profile_id text NOT NULL, request_mode text NOT NULL, "
        "start_at timestamptz NOT NULL, end_at timestamptz, "
        "payload jsonb NOT NULL, digest text NOT NULL, "
        "created_at timestamptz NOT NULL DEFAULT clock_timestamp(), "
        "available_at timestamptz GENERATED ALWAYS AS (created_at) STORED, "
        "CHECK(end_at IS NULL OR end_at>start_at), "
        "CHECK(request_mode IN ('observation','forecast')))"
    )
    connection.execute(
        "CREATE TABLE IF NOT EXISTS pongdang_data.water_index_input_manifest ("
        "manifest_id text PRIMARY KEY, payload jsonb NOT NULL, digest text NOT NULL, "
        "created_at timestamptz NOT NULL DEFAULT clock_timestamp(), "
        "available_at timestamptz GENERATED ALWAYS AS (created_at) STORED)"
    )
    connection.execute(
        "CREATE TABLE IF NOT EXISTS pongdang_data.water_index_assessment ("
        "assessment_id text PRIMARY KEY, target_id text NOT NULL REFERENCES "
        "pongdang_data.water_index_target(target_id), input_manifest_id text "
        "REFERENCES pongdang_data.water_index_input_manifest(manifest_id), "
        "as_of timestamptz NOT NULL, evaluated_at timestamptz, "
        "payload jsonb NOT NULL, digest text NOT NULL, "
        "created_at timestamptz NOT NULL DEFAULT clock_timestamp(), "
        "available_at timestamptz GENERATED ALWAYS AS (created_at) STORED, "
        "CHECK(evaluated_at IS NULL OR evaluated_at>=as_of))"
    )
    connection.execute(
        "CREATE TABLE IF NOT EXISTS pongdang_data.water_index_read_manifest ("
        "manifest_id text PRIMARY KEY, spot_id bigint NOT NULL REFERENCES "
        "pongdang_data.spots_waterspot(id), activity text NOT NULL, "
        "profile_id text NOT NULL, request_mode text NOT NULL, "
        "scope_start_at timestamptz NOT NULL, scope_end_at timestamptz NOT NULL, "
        "read_valid_until timestamptz NOT NULL, "
        "selection_policy_version text NOT NULL, payload jsonb NOT NULL, "
        "digest text NOT NULL, "
        "created_at timestamptz NOT NULL DEFAULT clock_timestamp(), "
        "available_at timestamptz GENERATED ALWAYS AS (created_at) STORED, "
        "CHECK(scope_end_at>scope_start_at), "
        "CHECK(read_valid_until>created_at), "
        "CHECK(request_mode IN ('observation','forecast')))"
    )
    connection.execute(
        "CREATE INDEX IF NOT EXISTS water_index_read_lookup_idx ON "
        "pongdang_data.water_index_read_manifest "
        "(spot_id,activity,profile_id,request_mode,available_at DESC)"
    )
    connection.execute(
        "CREATE OR REPLACE FUNCTION pongdang_data.water_index_immutable() "
        "RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN "
        "RAISE EXCEPTION 'Water Index history is immutable'; END; $$"
    )
    for table in (
        "water_index_target",
        "water_index_input_manifest",
        "water_index_assessment",
        "water_index_read_manifest",
    ):
        # Names are source constants, never supplied by a caller.
        connection.execute(
            f"CREATE OR REPLACE TRIGGER {table}_immutable "
            f"BEFORE UPDATE OR DELETE ON pongdang_data.{table} "
            "FOR EACH ROW EXECUTE FUNCTION pongdang_data.water_index_immutable()"
        )
    connection.execute("UPDATE pongdang_data.schema_version SET version=4 WHERE id=1")
