"""Source cleanup on an explicitly disposable PostgreSQL 18 database."""

from datetime import UTC, datetime, timedelta

import pytest
from psycopg import errors
from psycopg.types.json import Jsonb
from test_condition_producer_integration import database as database
from test_condition_producer_integration import inputs
from test_condition_score_integration import source, station

from app.forecast.storage import project_forecasts
from app.ingestion import retention
from app.ingestion.models import Value
from app.ingestion.storage import store_batch
from app.schema import connect
from app.water_index.condition_producer import produce_conditions
from app.water_index.retention import retention_window


def put(settings, name, at, *, provider="kma_aws", values=None, mode="observation"):
    store_batch(
        settings,
        source(
            source_id=name,
            station_id=provider,
            observed_at=at,
            fetched_at=datetime.now(UTC) - timedelta(seconds=1),
            provider=provider,
            values=values,
            mode=mode,
        ),
    )
    with connect(settings) as c:
        return c.execute(
            "SELECT s.id,m.id FROM pongdang_data.conditions_observationsnapshot s "
            "JOIN pongdang_data.conditions_observationmetric m ON m.snapshot_id=s.id "
            "WHERE s.source_record_id=%s ORDER BY s.id DESC,m.id LIMIT 1",
            [name],
        ).fetchone()


def saved(settings):
    with connect(settings) as c:
        return set(
            row[0]
            for row in c.execute(
                "SELECT id FROM pongdang_data.conditions_observationsnapshot"
            ).fetchall()
        )


def clock_state(settings):
    with connect(settings) as c:
        return c.execute(
            "SELECT revision,invalidated_revision,invalidated_at "
            "FROM pongdang_data.condition_source_revision"
        ).fetchone()


def test_cleanup_keeps_missing_conflicts_revisions_and_does_not_revoke(database):
    now = datetime.now(UTC)
    old, _ = put(database, "obsolete", now - timedelta(days=50))
    # Both the old air slot and its omission by a later source revision matter.
    corrected, _ = put(database, "corrected", now - timedelta(days=3))
    latest, _ = put(
        database,
        "corrected",
        now - timedelta(days=3),
        values=[Value(name="wind_speed", numeric_value=4, unit="m/s")],
    )
    tied, _ = put(database, "conflicting-target", now - timedelta(days=3))
    now = datetime.now(UTC)
    before_inputs, start, end = inputs(database, now)
    before = before_inputs.records(now, start, end)
    revision = clock_state(database)
    result = retention.prune_source_history(database, now=now)
    assert result["counts"]["conditions_observationsnapshot"] == 1
    assert saved(database) == {corrected, latest, tied}
    assert old not in saved(database)
    assert clock_state(database) == revision
    after_inputs, start, end = inputs(database, now)
    assert after_inputs.records(now, start, end) == before
    assert retention.prune_source_history(database)["deleted"] == 0
    # The maintenance marker is transaction-local and does not affect corrections
    # or an ordinary DELETE, including the invalidation wall-clock trigger.
    with connect(database) as c:
        c.execute(
            "DELETE FROM pongdang_data.conditions_observationmetric "
            "WHERE snapshot_id=%s",
            [tied],
        )
    after = clock_state(database)
    assert after[0] > revision[0] and after[1] == after[0]
    assert after[2] is not None


def test_annual_temperature_and_31_day_quality_are_real_calculation_inputs(database):
    now = datetime.now(UTC)
    water = [Value(name="water_temperature", numeric_value=21, unit="degC")]
    year_start = datetime(now.year, 1, 1, tzinfo=UTC)
    annual, _ = put(database, "annual", year_start + timedelta(hours=2), values=water)
    obsolete, _ = put(
        database, "prior-year", year_start - timedelta(days=20), values=water
    )
    put(database, "temperature-latest", now - timedelta(minutes=5), values=water)
    recent, _ = put(
        database,
        "quality-20-days",
        now - timedelta(days=20),
        provider="koem_water_quality",
    )
    prior, _ = put(
        database,
        "quality-40-days",
        now - timedelta(days=40),
        provider="koem_water_quality",
    )
    # An old station's only/newest laboratory result remains historical context.
    historical, _ = put(
        database,
        "quality-historical",
        now - timedelta(days=90),
        provider="nier_water_quality",
    )
    retention.prune_source_history(database)
    assert {annual, recent, historical} <= saved(database)
    assert not {obsolete, prior} & saved(database)


def test_retained_json_references_keep_old_sources_and_metric_only_inputs(database):
    now = datetime.now(UTC)
    names = ("condition", "input", "metric-only", "event", "evaluation", "quality")
    evidence = {
        name: put(database, name, now - timedelta(days=100 + i))
        for i, name in enumerate(names)
    }
    obsolete, _ = put(database, "unreferenced", now - timedelta(days=120))
    put(database, "latest", now - timedelta(minutes=2))
    assert produce_conditions(database) > 0
    _, spot = station(database, "kma_aws")
    with connect(database) as c:
        c.execute(
            "UPDATE pongdang_data.condition_result SET detail=jsonb_set("
            "detail,'{metrics,0,evidence,0,snapshot_id}',%s) "
            "WHERE mode='observation'",
            [Jsonb(evidence["condition"][0])],
        )
        c.execute(
            "INSERT INTO pongdang_data.water_index_input_manifest "
            "(manifest_id,payload,digest) VALUES ('reference-fixture',%s,'fixture')",
            [
                Jsonb(
                    {
                        "inputs": [{"snapshot_id": evidence["input"][0]}],
                        "evaluation_request": {
                            "inputs": [{"metric_id": evidence["metric-only"][1]}]
                        },
                    }
                )
            ],
        )
        c.execute(
            "INSERT INTO pongdang_data.notification_subscription "
            "(id,owner_subject,spot_id,season_year,timezone,"
            "minimum_temperature_c,channel) "
            "VALUES ('fixture','fixture-owner',%s,%s,'Asia/Seoul',20,'in_app')",
            [spot, now.year],
        )
        c.execute(
            "INSERT INTO pongdang_data.notification_event "
            "(id,subscription_id,subscription_revision,season_year,kind,"
            "created_at,payload) "
            "VALUES ('event','fixture',1,%s,'fixture',%s,%s)",
            [
                now.year,
                now,
                Jsonb({"observation": {"snapshot_id": evidence["event"][0]}}),
            ],
        )
        c.execute(
            "INSERT INTO pongdang_data.notification_evaluation "
            "(subscription_id,subscription_revision,evaluated_at,evidence_key,"
            "condition_state,payload) "
            "VALUES ('fixture',1,%s,'fixture','unknown',%s)",
            [now, Jsonb({"observation": {"snapshot_id": evidence["evaluation"][0]}})],
        )
        c.execute(
            "INSERT INTO pongdang_data.quality_analysis "
            "(analysis_id,spot_id,from_at,until_at,as_of,payload,digest) "
            "VALUES ('fixture',%s,%s,%s,%s,%s,'fixture')",
            [
                spot,
                now - timedelta(days=31),
                now,
                now,
                Jsonb(
                    {
                        "official_sources": [
                            {
                                "evidence_id": "collection-snapshot:"
                                + str(evidence["quality"][0])
                            }
                        ]
                    }
                ),
            ],
        )
    result = retention.prune_source_history(database)
    assert result["deleted"] > 0
    assert obsolete not in saved(database)
    assert {value[0] for value in evidence.values()} <= saved(database)


def test_forecast_chain_cleanup_preserves_live_chain_and_normal_immutability(database):
    now = datetime.now(UTC)
    start, end = retention_window(now)
    past = start - timedelta(days=3)
    old, _ = put(database, "old-forecast", past, mode="forecast")
    # Project at the historical capture clock on the isolated database only.
    with connect(database) as c:
        c.execute(
            "UPDATE pongdang_data.conditions_observationsnapshot SET fetched_at=%s",
            [past],
        )
        c.execute(
            "UPDATE pongdang_data.conditions_observationmetric SET fetched_at=%s",
            [past],
        )
    assert project_forecasts(database, now=past + timedelta(minutes=1)) > 0
    fresh, _ = put(
        database, "fresh-forecast", now + timedelta(hours=1), mode="forecast"
    )
    assert project_forecasts(database) > 0
    # Keep the old and new versions of the live chain together.
    with connect(database) as c:
        live = c.execute(
            "SELECT revision_id,source_key,spot_id,station_id,provider,target_start_at,"
            "target_end_at,fetched_at,payload FROM pongdang_data.forecast_revision "
            "WHERE payload->>'snapshot_id'=%s",
            [str(fresh)],
        ).fetchone()
        c.execute(
            "INSERT INTO pongdang_data.forecast_revision "
            "(previous_revision_id,source_key,spot_id,station_id,provider,"
            "target_start_at,target_end_at,fetched_at,payload,digest) "
            "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,'corrected')",
            [*live[:-1], Jsonb(live[-1])],
        )
    result = retention.prune_source_history(database)
    assert result["counts"]["forecast_revision"] == 1
    assert old in saved(database)  # the pre-midnight forecast anchor is still needed
    with connect(database) as c:
        assert (
            c.execute(
                "SELECT count(*) FROM pongdang_data.forecast_revision"
            ).fetchone()[0]
            == 2
        )
        with pytest.raises(errors.RaiseException, match="immutable"):
            c.execute("DELETE FROM pongdang_data.forecast_revision")
    # current-only projection does not repeatedly regenerate outside-window rows.
    put(database, "too-far", end + timedelta(hours=1), mode="forecast")
    assert project_forecasts(database) == 1  # the deliberately changed fixture digest
    with connect(database) as c:
        assert not c.execute(
            "SELECT 1 FROM pongdang_data.forecast_revision WHERE target_start_at>=%s",
            [end],
        ).fetchone()


@pytest.mark.parametrize("lock", [retention.RESULT_LOCK, "pongdang-ingestion"])
def test_busy_producer_is_skipped_without_partial_cleanup(database, lock):
    now = datetime.now(UTC)
    put(database, "old", now - timedelta(days=50))
    put(database, "current", now - timedelta(minutes=1))
    before = saved(database)
    with connect(database) as c:
        c.execute("SELECT pg_advisory_xact_lock(hashtext(%s))", [lock])
        result = retention.prune_source_history(database)
    assert result == {"deleted": 0, "pending": True, "skipped": True, "counts": {}}
    assert saved(database) == before


def test_reference_writer_and_old_result_backlog_skip_cleanup(database):
    now = datetime.now(UTC)
    put(database, "current", now - timedelta(minutes=1))
    assert produce_conditions(database) > 0
    with connect(database) as c:
        c.execute("LOCK TABLE pongdang_data.notification_event IN ROW EXCLUSIVE MODE")
        assert retention.prune_source_history(database)["skipped"]
    with connect(database) as c:
        c.execute(
            "UPDATE pongdang_data.condition_result SET "
            "target_start=target_start-interval '10 days',"
            "target_end=target_end-interval '10 days'"
        )
    assert retention.prune_source_history(database)["skipped"]


def test_reference_pages_and_bounded_batches_preserve_last_page_reference(database):
    now = datetime.now(UTC)
    protected, _ = put(database, "referenced-on-last-page", now - timedelta(days=80))
    obsolete = {
        put(database, f"obsolete-{i}", now - timedelta(days=50 + i))[0]
        for i in range(5)
    }
    put(database, "current", now - timedelta(minutes=1))
    with connect(database) as c:
        c.execute(
            "INSERT INTO pongdang_data.water_index_input_manifest "
            "(manifest_id,payload,digest) SELECT lpad(n::text,4,'0'),"
            "CASE WHEN n=501 THEN %s::jsonb ELSE '{}'::jsonb END,'fixture' "
            "FROM generate_series(1,501) n",
            [Jsonb({"inputs": [{"snapshot_id": protected}]})],
        )
    deleted = 0
    for _ in range(5):
        result = retention.prune_source_history(database, batch_size=2)
        assert result["counts"]["conditions_observationsnapshot"] <= 2
        deleted += result["counts"]["conditions_observationsnapshot"]
        if not result["pending"]:
            break
    assert deleted == 5
    assert not obsolete & saved(database)
    assert protected in saved(database)
