"""Explicit additive v22 migration; never called by reads or worker startup."""


def migrate_place_translations(c):
    c.execute("""
        CREATE TABLE IF NOT EXISTS pongdang_data.place_translation (
          provider text NOT NULL,
          source_id text NOT NULL,
          source_hash text NOT NULL CHECK(source_hash ~ '^[0-9a-f]{64}$'),
          locale text NOT NULL CHECK(locale IN ('en','ja','zh-CN')),
          model_version text NOT NULL,
          model text NOT NULL,
          source_text jsonb NOT NULL CHECK(jsonb_typeof(source_text)='object'),
          translated_text jsonb,
          state text NOT NULL CHECK(state IN ('pending','ready','failed','superseded')),
          translated_at timestamptz,
          next_attempt_at timestamptz NOT NULL DEFAULT now(),
          consecutive_failures integer NOT NULL DEFAULT 0,
          error_code text NOT NULL DEFAULT '',
          PRIMARY KEY(provider,source_id,source_hash,locale,model_version),
          CHECK((state='ready')=(translated_text IS NOT NULL)))
    """)
    c.execute("""
        CREATE TABLE IF NOT EXISTS pongdang_data.place_translation_budget (
          day date PRIMARY KEY,
          calls integer NOT NULL DEFAULT 0 CHECK(calls>=0),
          reserved_cost_microusd bigint NOT NULL DEFAULT 0
            CHECK(reserved_cost_microusd>=0))
    """)
    c.execute("""
        CREATE INDEX IF NOT EXISTS place_translation_current
          ON pongdang_data.place_translation(provider,source_id,locale)
          WHERE state='ready'
    """)
    for table in ("place_translation", "place_translation_budget"):
        c.execute(f"REVOKE ALL ON pongdang_data.{table} FROM PUBLIC")
    c.execute("UPDATE pongdang_data.schema_version SET version=22 WHERE id=1")
