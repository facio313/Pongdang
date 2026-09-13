def migrate_forecast(c):
    c.execute(
        "CREATE TABLE IF NOT EXISTS pongdang_data.forecast_revision ("
        "revision_id bigserial PRIMARY KEY, source_key text NOT NULL, spot_id bigint "
        "NOT NULL REFERENCES pongdang_data.spots_waterspot(id), station_id bigint "
        "NOT NULL REFERENCES pongdang_data.collection_station(id), provider text "
        "NOT NULL, "
        "target_start_at timestamptz NOT NULL, target_end_at timestamptz NOT NULL, "
        "fetched_at timestamptz NOT NULL, issued_at timestamptz, "
        "available_at timestamptz NOT NULL DEFAULT clock_timestamp(), "
        "previous_revision_id bigint UNIQUE REFERENCES "
        "pongdang_data.forecast_revision(revision_id), "
        "payload jsonb NOT NULL, digest text NOT NULL, "
        "CHECK(target_end_at>target_start_at))"
    )
    c.execute(
        "CREATE INDEX IF NOT EXISTS forecast_revision_lookup_idx ON "
        "pongdang_data.forecast_revision(spot_id,source_key,available_at "
        "DESC,revision_id DESC)"
    )
    c.execute(
        "CREATE OR REPLACE TRIGGER forecast_revision_immutable BEFORE UPDATE OR DELETE "
        "ON pongdang_data.forecast_revision FOR EACH ROW EXECUTE FUNCTION "
        "pongdang_data.water_index_immutable()"
    )
