"""Bounded cleanup preserves published references on an isolated disposable DB."""

from dataclasses import replace
from datetime import UTC, datetime, timedelta

import pytest
from psycopg import errors
from psycopg.types.json import Jsonb
from test_assessment_forecast_tides_integration import batch as tide_batch
from test_condition_score_integration import source
from test_water_index_storage import db as db
from test_water_index_storage import diagnostic, read, view

from app.forecast.storage import project_forecasts
from app.ingestion.storage import store_batch
from app.schema import connect
from app.water_index import retention
from app.water_index.engine import diagnostic_assessment
from app.water_index.models import EvaluationRequest
from app.water_index.producer import produce_assessments
from app.water_index.service import evaluate_and_store
from app.water_index.storage import StorageBundle, TargetRecord, store_bundle


@pytest.fixture
def retained_db(db):
    with connect(db) as c:
        retention.migrate_bounded_retention(c)
    return db


def artifact(settings, name, *, target=None, activity="swim", manifest=True):
    target = target or diagnostic("target-" + name)
    if target.activity != activity:
        target = diagnostic_assessment(
            target_id=target.target_id,
            spot_id=991,
            activity=activity,
            target=target.target,
            context=target.context,
        )
    at = datetime.now(UTC) - timedelta(seconds=1)
    request = EvaluationRequest(
        target_id=target.target_id,
        spot_id=991,
        activity=activity,
        target=target.target,
        context=target.context,
        as_of=at,
        evaluated_at=at,
        requested_mode="forecast",
    )
    result = evaluate_and_store(settings, request)
    if manifest:
        publication = replace(
            view(
                target,
                selections={target.target_id: result.assessment_id},
                manifest_id="view-" + name,
            ),
            activity=activity,
        )
        store_bundle(settings, StorageBundle(read_manifests=[publication]))
        with connect(settings) as c:
            c.execute(
                "INSERT INTO pongdang_data.water_index_production_run "
                "(spot_id,activity,mode,digest,read_manifest_id) "
                "VALUES (991,%s,'forecast',%s,%s)",
                [activity, name, publication.manifest_id],
            )
    return target, result


def counts(settings):
    with connect(settings) as c:
        return {
            table: c.execute("SELECT count(*) FROM pongdang_data." + table).fetchone()[
                0
            ]
            for table, _, _ in retention.TABLES
        }


def complete_cleanup(settings, *, batch_size=2000):
    deleted = 0
    for _ in range(30):
        result = retention.prune_water_index_history(settings, batch_size=batch_size)
        assert not result["skipped"]
        assert result["deleted"] <= batch_size
        deleted += result["deleted"]
        if not result["pending"]:
            return deleted
    pytest.fail("Bounded cleanup did not converge")


def test_cleanup_keeps_latest_read_reference_closure_and_missing_targets(retained_db):
    settings = retained_db
    artifact(settings, "old")
    artifact(settings, "unpublished", manifest=False)
    target, result = artifact(settings, "current")
    missing = diagnostic("missing-current-target")
    latest = view(
        target,
        selections={
            target.target_id: result.assessment_id,
            missing.target_id: None,
        },
        manifest_id="latest-with-missing",
    )
    store_bundle(
        settings,
        StorageBundle(
            targets=[TargetRecord(missing, "forecast")], read_manifests=[latest]
        ),
    )
    with connect(settings) as c:
        c.execute(
            "INSERT INTO pongdang_data.water_index_production_run "
            "(spot_id,activity,mode,digest,read_manifest_id) "
            "VALUES (991,'swim','forecast','latest','latest-with-missing')"
        )
    before = read(settings, target)
    assert complete_cleanup(settings, batch_size=2) > 0
    assert counts(settings) == {
        "water_index_production_run": 1,
        "water_index_read_manifest": 1,
        "water_index_assessment": 1,
        "water_index_input_manifest": 1,
        "water_index_target": 2,
    }
    after = read(settings, target)
    assert after["rows"] == before["rows"]
    assert after["coverage"] == before["coverage"]
    with connect(settings) as c:
        assert c.execute(
            "SELECT assessment_id,input_manifest_id FROM "
            "pongdang_data.water_index_assessment"
        ).fetchone() == (result.assessment_id, result.input_manifest_id)
        assert c.execute(
            "SELECT target_id FROM pongdang_data.water_index_target ORDER BY target_id"
        ).fetchall() == [(missing.target_id,), (target.target_id,)]
    assert complete_cleanup(settings) == 0


def test_latest_expired_and_old_manifest_preserve_their_dependencies(retained_db):
    settings = retained_db
    target, result = artifact(settings, "expired", activity="surf", manifest=False)
    now = datetime.now(UTC)
    with connect(settings) as c:
        # Model an already expired legacy view without mutating immutable rows.
        # Its scope crosses today and its evidence remains a required dependency.
        c.execute(
            "INSERT INTO pongdang_data.water_index_read_manifest "
            "(manifest_id,spot_id,activity,profile_id,request_mode,scope_start_at,"
            "scope_end_at,read_valid_until,selection_policy_version,payload,digest,"
            "created_at) VALUES ('legacy-expired',991,'surf','general','forecast',"
            "%s,%s,%s,'stored-selection.v1',%s,'fixture',%s)",
            [
                now - timedelta(days=2),
                now + timedelta(days=29),
                now - timedelta(hours=1),
                Jsonb({"selections": {target.target_id: result.assessment_id}}),
                now - timedelta(days=2),
            ],
        )
        # An out-of-window group has no current dependency to retain.
        c.execute(
            "INSERT INTO pongdang_data.water_index_read_manifest "
            "(manifest_id,spot_id,activity,profile_id,request_mode,scope_start_at,"
            "scope_end_at,read_valid_until,selection_policy_version,payload,digest,"
            "created_at) VALUES ('outside-window',991,'relax','general','forecast',"
            "%s,%s,%s,'stored-selection.v1',%s,'fixture',%s)",
            [
                now + timedelta(days=10),
                now + timedelta(days=11),
                now + timedelta(days=1),
                Jsonb({"selections": {}}),
                now - timedelta(days=2),
            ],
        )
    complete_cleanup(settings)
    with connect(settings) as c:
        assert c.execute(
            "SELECT manifest_id FROM pongdang_data.water_index_read_manifest "
            "ORDER BY manifest_id"
        ).fetchall() == [("legacy-expired",)]
        assert c.execute(
            "SELECT assessment_id FROM pongdang_data.water_index_assessment"
        ).fetchone() == (result.assessment_id,)


def test_ordinary_mutations_and_unrelated_forecast_remain_immutable(retained_db):
    settings = retained_db
    artifact(settings, "protected")
    for table, key, _ in retention.TABLES:
        for statement in (
            "DELETE FROM pongdang_data." + table,
            f"UPDATE pongdang_data.{table} SET {key}={key}",
        ):
            with pytest.raises(errors.RaiseException, match="immutable"):
                with connect(settings) as c:
                    c.execute(statement)
    with pytest.raises(errors.RaiseException, match="immutable"):
        with connect(settings) as c:
            c.execute("SET LOCAL pongdang.retention.water_index='on'")
            c.execute("UPDATE pongdang_data.water_index_target SET target_id=target_id")
    now = datetime.now(UTC)
    store_batch(
        settings,
        source(
            mode="forecast",
            observed_at=now + timedelta(hours=1),
            valid_until=now + timedelta(hours=2),
        ),
    )
    assert project_forecasts(settings) == 1
    with pytest.raises(errors.RaiseException, match="immutable"):
        with connect(settings) as c:
            c.execute("SET LOCAL pongdang.retention.water_index='on'")
            c.execute("DELETE FROM pongdang_data.forecast_revision")
    complete_cleanup(settings)
    with connect(settings) as c:
        assert c.execute(
            "SELECT count(*) FROM pongdang_data.conditions_observationsnapshot"
        ).fetchone() == (1,)
        assert c.execute(
            "SELECT count(*) FROM pongdang_data.forecast_revision"
        ).fetchone() == (1,)


def test_cleanup_skips_an_active_producer_without_changing_any_rows(retained_db):
    settings = retained_db
    artifact(settings, "old")
    artifact(settings, "new")
    before = counts(settings)
    with connect(settings) as c:
        c.execute("SELECT pg_advisory_xact_lock(hashtext('pongdang-water-index'))")
        result = retention.prune_water_index_history(settings)
    assert result == dict(deleted=0, pending=True, skipped=True, counts={})
    assert counts(settings) == before


def test_cleanup_failure_rolls_back_the_current_batch(retained_db, monkeypatch):
    settings = retained_db
    artifact(settings, "old")
    artifact(settings, "new")
    before = counts(settings)
    delete = retention._delete_obsolete

    def interrupted(c, table, key, kept, limit):
        if table == "water_index_read_manifest":
            raise RuntimeError("Interrupted after deleting the obsolete run")
        return delete(c, table, key, kept, limit)

    monkeypatch.setattr(retention, "_delete_obsolete", interrupted)
    with pytest.raises(RuntimeError, match="Interrupted"):
        retention.prune_water_index_history(settings)
    assert counts(settings) == before


def test_retention_window_uses_kst_midnight_and_eight_calendar_dates():
    before = datetime(2026, 9, 27, 14, 59, tzinfo=UTC)
    after = before + timedelta(minutes=1)
    first, first_end = retention.retention_window(before)
    second, second_end = retention.retention_window(after)
    assert first.isoformat() == "2026-09-27T00:00:00+09:00"
    assert second.isoformat() == "2026-09-28T00:00:00+09:00"
    assert first_end - first == second_end - second == timedelta(days=8)


def test_producer_limits_forecasts_but_preserves_required_older_observations(
    retained_db,
):
    settings = retained_db
    now = datetime.now(UTC)
    start, end = retention.retention_window(now)
    for name, at in (
        ("last-included-minute", end - timedelta(minutes=1)),
        ("exclusive-upper-bound", end),
        ("far-future", end + timedelta(days=2)),
    ):
        store_batch(
            settings,
            tide_batch(at=at, fetched=now - timedelta(seconds=1), source_id=name),
        )
    older = start - timedelta(hours=1)
    store_batch(
        settings,
        source(
            observed_at=older,
            fetched_at=now - timedelta(seconds=1),
            valid_until=end,
        ),
    )
    assert produce_assessments(settings) > 0
    with connect(settings) as c:
        assert c.execute(
            "SELECT DISTINCT scope_start_at,scope_end_at "
            "FROM pongdang_data.water_index_read_manifest"
        ).fetchall() == [(start, end)]
        assert c.execute(
            "SELECT DISTINCT start_at FROM pongdang_data.water_index_target "
            "ORDER BY start_at"
        ).fetchall() == [(older,), (end - timedelta(minutes=1),)]


def test_producer_republishes_the_window_at_kst_day_rollover(retained_db):
    settings = retained_db
    now = datetime.now(UTC) - timedelta(seconds=1)
    yesterday = now - timedelta(days=1)
    start, end = retention.retention_window(now)
    store_batch(
        settings,
        tide_batch(
            at=now + timedelta(hours=2),
            fetched=yesterday - timedelta(minutes=1),
        ),
    )
    assert produce_assessments(settings, now=yesterday) > 0
    assert produce_assessments(settings, now=yesterday + timedelta(seconds=1)) == 0
    assert produce_assessments(settings, now=now) > 0
    complete_cleanup(settings)
    with connect(settings) as c:
        assert c.execute(
            "SELECT DISTINCT scope_start_at,scope_end_at "
            "FROM pongdang_data.water_index_read_manifest"
        ).fetchall() == [(start, end)]
