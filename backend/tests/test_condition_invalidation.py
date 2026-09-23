"""Duplicate collection must not blank the published home/today conditions."""

from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from psycopg import errors, sql
from test_condition_score_integration import database as database
from test_condition_score_integration import source, station

from app.ingestion.storage import store_batch
from app.main import create_app
from app.schema import VERSION, connect, initialize, migrate_condition_continuity
from app.water_index import condition_invalidation
from app.water_index.condition_producer import produce_conditions
from app.water_index.condition_storage import (
    migrate_conditions,
    projection_due,
    projection_revision,
    projection_urgent,
)
from app.water_index.models import SafetyEvidence
from app.water_index.sources import AuthorityRecord, EvidenceBundle, register_evidence


def test_duplicate_fetch_keeps_published_conditions_and_original_evidence(database):
    batch = source()
    store_batch(database, batch)
    _, spot = station(database)
    assert produce_conditions(database) > 0
    with connect(database) as c:
        revision = projection_revision(c)
        original = c.execute(
            "SELECT fetched_at,valid_until FROM "
            "pongdang_data.conditions_observationsnapshot"
        ).fetchone()
    with TestClient(create_app(database)) as client:
        params = {"spot_id": spot, "activity": "swim", "mode": "observation"}
        before = client.get("/api/data/water-index/conditions", params=params).json()
        assert before["condition_score"]["score"] is not None
        fetched_at = datetime.now(UTC)
        assert (
            store_batch(database, batch.model_copy(update={"fetched_at": fetched_at}))
            == 0
        )
        after = client.get("/api/data/water-index/conditions", params=params).json()
        assert after["projection"] == before["projection"]
        assert after["condition_score"] == before["condition_score"]
        recommendation = client.get(
            "/api/data/water-index/recommendation", params={"spot_id": spot}
        ).json()
        assert all(
            c["projection"]["status"] == "ready" for c in recommendation["conditions"]
        )
    with connect(database) as c:
        assert projection_revision(c) == revision
        assert not projection_due(c)
        assert c.execute(
            "SELECT fetched_at FROM pongdang_data.collection_station"
        ).fetchone() == (fetched_at,)
        assert (
            c.execute(
                "SELECT fetched_at,valid_until FROM "
                "pongdang_data.conditions_observationsnapshot"
            ).fetchone()
            == original
        )
    assert produce_conditions(database) == 0


def test_only_missing_publication_or_hard_revocation_is_urgent(database):
    with connect(database) as c:
        assert projection_urgent(c)

    first = source()
    store_batch(database, first)
    assert produce_conditions(database) > 0
    with connect(database) as c:
        assert not projection_urgent(c)

    store_batch(
        database,
        source(
            source_id="fixture-reading-routine-refresh",
            observed_at=first.readings[0].observed_at + timedelta(minutes=1),
        ),
    )
    with connect(database) as c:
        assert projection_due(c)
        assert not projection_urgent(c)
        c.execute("UPDATE pongdang_data.spots_waterspot SET lat=coalesce(lat,0)+0.1")
        assert projection_urgent(c)


@pytest.mark.parametrize(
    "table,assignment",
    [
        (
            "conditions_observationsnapshot",
            "valid_until=valid_until-interval '1 minute'",
        ),
        ("conditions_observationmetric", "numeric_value=numeric_value+1"),
        ("collection_station", "latitude=latitude+0.1"),
        ("spots_waterspot", "lat=lat+0.1"),
        ("collection_station", "source_valid_until=now()"),
        ("collection_station", "fetched_at=now()+interval '1 hour'"),
        ("spots_waterspot", "catalog_verified_at=NULL"),
    ],
)
def test_real_input_changes_still_invalidate(database, table, assignment):
    store_batch(database, source())
    with connect(database) as c:
        revision = projection_revision(c)
        c.execute(
            sql.SQL("UPDATE {} SET {}").format(
                sql.Identifier("pongdang_data", table),
                sql.SQL(assignment),
            )
        )
        assert projection_revision(c) == revision + 1


def test_new_restriction_immediately_hides_old_score(database):
    batch = source()
    store_batch(database, batch)
    _, spot = station(database)
    assert produce_conditions(database) > 0
    with TestClient(create_app(database)) as client:
        params = {"spot_id": spot, "activity": "swim", "mode": "observation"}
        before = client.get("/api/data/water-index/conditions", params=params).json()
        assert before["condition_score"]["score"] is not None
        base = batch.fetched_at
        register_evidence(
            database,
            EvidenceBundle(
                authorities=[
                    AuthorityRecord(
                        evidence_id="fixture-restriction",
                        source_url="https://www.weather.go.kr/fixture",
                        reviewed_by="Fixture review",
                        evidence=SafetyEvidence(
                            evidence_ref="fixture-restriction-ref",
                            spot_id=spot,
                            activity="swim",
                            provider="fixture-official",
                            provider_record_id="fixture-restriction",
                            authority="Fixture authority",
                            fetched_at=base,
                            issued_at=base,
                            valid_from=base,
                            valid_until=base + timedelta(hours=1),
                            authoritative=True,
                            source_status="active",
                            state="current",
                            scope="Disposable restriction",
                            effect="restricted",
                            check_id="fixture-check",
                            rule_id="fixture-rule",
                        ),
                    )
                ]
            ),
        )
        pending = client.get("/api/data/water-index/conditions", params=params).json()
        assert pending["projection"]["status"] == "pending"
        assert pending["projection"]["retention_allowed"] is False
        assert pending["condition_score"]["score"] is None
        assert produce_conditions(database) > 0
        blocked = client.get("/api/data/water-index/conditions", params=params).json()
        assert blocked["safety_status"] == "restricted"
        assert blocked["condition_score"]["score"] is None


def test_v16_upgrade_does_not_revive_previously_invalidated_scores(database):
    store_batch(database, source())
    _, spot = station(database)
    assert produce_conditions(database) > 0
    with connect(database) as c:
        migrate_conditions(c)
        # A v16 database predates the v20 invalidation clock trigger.
        c.execute(
            "DROP TRIGGER condition_invalidation_clock ON "
            "pongdang_data.condition_source_revision"
        )
        c.execute(
            "ALTER TABLE pongdang_data.condition_source_revision "
            "DROP COLUMN invalidated_revision"
        )
        c.execute(
            "UPDATE pongdang_data.conditions_observationmetric "
            "SET numeric_value=NULL,is_missing=true,state='missing'"
        )
        revision = projection_revision(c)
        c.execute("UPDATE pongdang_data.schema_version SET version=16")
    assert initialize(database)
    assert not initialize(database)
    with connect(database) as c:
        assert c.execute(
            "SELECT revision,invalidated_revision FROM "
            "pongdang_data.condition_source_revision"
        ).fetchone() == (revision, revision)
        assert c.execute(
            "SELECT count(*) FROM pongdang_data.condition_generation"
        ).fetchone() == (1,)
    with TestClient(create_app(database)) as client:
        pending = client.get(
            "/api/data/water-index/conditions",
            params={"spot_id": spot, "activity": "swim", "mode": "observation"},
        ).json()
        assert pending["condition_score"]["score"] is None
        assert pending["projection"]["retention_allowed"] is False


def test_v15_upgrade_preserves_records_and_published_generation(database):
    batch = source()
    store_batch(database, batch)
    assert produce_conditions(database) > 0
    with connect(database) as c:
        tables = [
            row[0]
            for row in c.execute(
                "SELECT DISTINCT event_object_table FROM information_schema.triggers "
                "WHERE trigger_schema='pongdang_data' "
                "AND trigger_name='condition_projection_changed_insert'"
            )
        ]
        assert len(tables) == 6
        for table in tables:
            for event in ("insert", "update", "delete", "truncate"):
                c.execute(
                    sql.SQL("DROP TRIGGER {} ON {}").format(
                        sql.Identifier("condition_projection_changed_" + event),
                        sql.Identifier("pongdang_data", table),
                    )
                )
        migrate_conditions(c)
        c.execute("UPDATE pongdang_data.schema_version SET version=15")
        generation = c.execute(
            "SELECT id,record_count,source_revision FROM "
            "pongdang_data.condition_generation"
        ).fetchall()
        revision = projection_revision(c)
    assert initialize(database)
    assert not initialize(database)
    with connect(database) as c:
        assert c.execute(
            "SELECT version FROM pongdang_data.schema_version"
        ).fetchone() == (VERSION,)
        assert (
            c.execute(
                "SELECT id,record_count,source_revision FROM "
                "pongdang_data.condition_generation"
            ).fetchall()
            == generation
        )
        assert projection_revision(c) == revision
    assert (
        store_batch(
            database, batch.model_copy(update={"fetched_at": datetime.now(UTC)})
        )
        == 0
    )
    with connect(database) as c:
        assert projection_revision(c) == revision
        assert not projection_due(c)
    assert produce_conditions(database) == 0


@pytest.mark.parametrize(
    "table",
    [
        "conditions_observationsnapshot",
        "conditions_observationmetric",
        "collection_station",
        "spots_waterspot",
        "water_index_station_mapping",
        "water_index_authority_evidence",
    ],
)
def test_empty_writes_and_identical_updates_do_not_invalidate(database, table):
    store_batch(database, source())
    with connect(database) as c:
        revision = projection_revision(c)
        column = "payload" if table.startswith("water_index_") else "id"
        c.execute(
            sql.SQL("UPDATE {} SET {}={} WHERE false").format(
                sql.Identifier("pongdang_data", table),
                sql.Identifier(column),
                sql.Identifier(column),
            )
        )
        c.execute(
            sql.SQL("DELETE FROM {} WHERE false").format(
                sql.Identifier("pongdang_data", table),
            )
        )
        c.execute(
            sql.SQL("UPDATE {} SET {}={}").format(
                sql.Identifier("pongdang_data", table),
                sql.Identifier(column),
                sql.Identifier(column),
            )
        )
        assert projection_revision(c) == revision


@pytest.mark.parametrize(
    "locked_table", ["spots_waterspot", "condition_source_revision"]
)
def test_migration_waits_for_readers_without_blocking_other_reads(
    database, monkeypatch, locked_table
):
    waits = []
    with connect(database) as reader, connect(database) as migration:
        reader.execute(
            sql.SQL("SELECT 1 FROM {} LIMIT 1").format(
                sql.Identifier("pongdang_data", locked_table)
            )
        )

        def finish_reader(delay):
            waits.append(delay)
            # The failed NOWAIT attempt acquired earlier table locks first;
            # rolling back its savepoint must have released every one of them.
            with connect(database) as other_reader:
                for table, _ in condition_invalidation.INPUT_TABLES:
                    other_reader.execute(
                        sql.SQL("SELECT 1 FROM {} LIMIT 1").format(
                            sql.Identifier("pongdang_data", table)
                        )
                    )
            reader.commit()

        monkeypatch.setattr(condition_invalidation, "sleep", finish_reader)
        migrate_condition_continuity(migration)
        assert waits == [0.5]
        assert migration.execute(
            "SELECT version FROM pongdang_data.schema_version"
        ).fetchone() == (VERSION,)


def test_migration_lock_wait_is_bounded_and_leaves_schema_intact(database, monkeypatch):
    clock = iter([0, 300])
    monkeypatch.setattr(condition_invalidation, "monotonic", lambda: next(clock))
    monkeypatch.setattr(
        condition_invalidation, "sleep", lambda _: pytest.fail("Deadline passed")
    )
    with connect(database) as reader:
        reader.execute("SELECT 1 FROM pongdang_data.spots_waterspot LIMIT 1")
        with pytest.raises(errors.LockNotAvailable), connect(database) as migration:
            migrate_condition_continuity(migration)
        assert reader.execute(
            "SELECT version FROM pongdang_data.schema_version"
        ).fetchone() == (VERSION,)
