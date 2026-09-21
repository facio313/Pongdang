"""The explicit v4 -> v5 path preserves existing collection evidence."""

from datetime import UTC, datetime, timedelta

import pytest
from psycopg import sql

from app import schema
from app.config import Settings
from app.ingestion.models import Reading, SourceBatch, Station, Value
from app.ingestion.storage import store_batch


def test_v4_upgrade_preserves_evidence_and_is_idempotent(monkeypatch):
    settings = Settings()
    if settings.postgres_db != "pongdang_test":
        pytest.fail("Only disposable pongdang_test is permitted")
    with schema.connect(settings) as connection:
        connection.execute("DROP SCHEMA IF EXISTS pongdang_data CASCADE")
    try:
        # v4 consists of collection + existing Water Index, before feature tables.
        with monkeypatch.context() as patch:
            patch.setattr(schema, "migrate_features", lambda connection: None)
            patch.setattr(schema, "migrate_place_provenance", lambda connection: None)
            patch.setattr(schema, "migrate_ai_concierge", lambda connection: None)
            patch.setattr(schema, "migrate_travel", lambda connection: None)
            patch.setattr(schema, "migrate_attachments", lambda connection: None)
            patch.setattr(
                schema, "migrate_regional_collection", lambda connection: None
            )
            patch.setattr(schema, "migrate_place_details", lambda connection: None)
            patch.setattr(schema, "migrate_persistent_catalog", lambda connection: None)
            patch.setattr(schema, "migrate_score_refresh", lambda connection: None)
            patch.setattr(schema, "migrate_place_identity", lambda connection: None)
            patch.setattr(schema, "migrate_windy_thumbnails", lambda connection: None)
            patch.setattr(
                schema, "migrate_condition_invalidation", lambda connection: None
            )
            assert schema.initialize(settings)
        with schema.connect(settings) as connection:
            assert connection.execute(
                "SELECT version FROM pongdang_data.schema_version WHERE id=1"
            ).fetchone() == (4,)
            assert connection.execute(
                "SELECT to_regclass('pongdang_data.forecast_revision')"
            ).fetchone() == (None,)
        now = datetime.now(UTC)
        station = Station(source_id="v4-test", name="Isolated test", kind="buoy")
        store_batch(
            settings,
            SourceBatch(
                provider="TEST_V4",
                fetched_at=now,
                readings=[
                    Reading(
                        source_id="v4-record",
                        station=station,
                        observed_at=now,
                        valid_until=now + timedelta(hours=1),
                        spatial_scope="isolated station point",
                        values=[
                            Value(name="water_temperature", numeric_value=0, unit="°C")
                        ],
                    )
                ],
            ),
        )
        tables = [
            "conditions_observationsnapshot",
            "conditions_observationmetric",
            "collection_station",
            "spots_waterspot",
            "ingestion_batches",
        ]

        def evidence():
            with schema.connect(settings) as connection:
                connection.execute("SET TRANSACTION READ ONLY")
                return {
                    table: connection.execute(
                        sql.SQL(
                            "SELECT to_jsonb(t) FROM {} t ORDER BY to_jsonb(t)::text"
                        ).format(sql.Identifier("pongdang_data", table))
                    ).fetchall()
                    for table in tables
                }

        before = evidence()
        assert schema.initialize(settings)
        assert not schema.initialize(settings)
        assert evidence() == before
        with schema.connect(settings) as connection:
            assert connection.execute(
                "SELECT version FROM pongdang_data.schema_version WHERE id=1"
            ).fetchone() == (schema.VERSION,)
            for table in (
                "forecast_revision",
                "water_index_station_mapping",
                "water_index_production_run",
                "notification_event",
            ):
                assert connection.execute(
                    "SELECT to_regclass(%s)", [f"pongdang_data.{table}"]
                ).fetchone()[0]
    finally:
        with schema.connect(settings) as connection:
            connection.execute("DROP SCHEMA IF EXISTS pongdang_data CASCADE")
