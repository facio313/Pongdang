"""Projection bounds apply to relevant evidence in disposable PostgreSQL only."""

from datetime import UTC, datetime, timedelta

import pytest

from app.config import Settings
from app.forecast.storage import (
    forecast_from_normalized,
    project_forecasts,
    read_normalized,
)
from app.ingestion.errors import SourceScopeTooLargeError
from app.ingestion.jobs import Job
from app.ingestion.models import Reading, SourceBatch, Station, Value
from app.ingestion.storage import store_batch
from app.ingestion.worker import run_due
from app.schema import connect, initialize
from app.water_index.producer import produce_assessments


@pytest.fixture
def db():
    settings = Settings()
    if settings.postgres_db != "pongdang_test":
        pytest.fail("Integration requires disposable pongdang_test")
    initialize(settings)
    yield settings
    with connect(settings) as c:
        c.execute("DROP SCHEMA pongdang_data CASCADE")


def save_source(
    db,
    now,
    *,
    source_id,
    start=None,
    end=None,
    modes=("forecast", "observation"),
    provider="TEST_SCOPE",
    version="1",
):
    start = start or now - timedelta(minutes=1)
    end = end or now + timedelta(hours=1)
    batch = SourceBatch(
        provider=provider,
        adapter_version=version,
        fetched_at=now - timedelta(seconds=1),
        readings=[
            Reading(
                source_id=source_id,
                station=Station(
                    source_id="TEST_SCOPE_STATION",
                    name="Isolated scope test fixture",
                    kind="buoy",
                ),
                observed_at=start,
                valid_until=end,
                spatial_scope="Isolated test station point",
                values=[
                    Value(name="wave_height", unit="m", mode=mode)
                    if mode == "forecast"
                    else Value(
                        name="water_temperature",
                        numeric_value=20.0,
                        unit="degC",
                        mode=mode,
                    )
                    for mode in modes
                ],
            )
        ],
    )
    store_batch(db, batch)
    with connect(db) as c:
        return c.execute(
            "SELECT id FROM pongdang_data.conditions_observationsnapshot "
            "WHERE provider=%s AND source_record_id=%s",
            [provider, source_id],
        ).fetchone()[0]


def copy_sources(db, snapshot_id, count):
    """Bulk software fixtures avoid thousands of separate ingestion transactions."""
    with connect(db) as c:
        c.execute(
            "WITH copies AS (INSERT INTO "
            "pongdang_data.conditions_observationsnapshot "
            "(spot_id,provider,state,observed_at,fetched_at,valid_until,valid_from,"
            "spatial_scope,provider_record_id,ingestion_version,source_record_id,"
            "station_id,issued_at) SELECT "
            "s.spot_id,s.provider,s.state,s.observed_at,s.fetched_at,s.valid_until,"
            "s.valid_from,s.spatial_scope,s.provider_record_id||':copy:'||n,"
            "s.ingestion_version,s.source_record_id||':copy:'||n,s.station_id,"
            "s.issued_at FROM pongdang_data.conditions_observationsnapshot s "
            "CROSS JOIN generate_series(1,%s) n WHERE s.id=%s RETURNING id) "
            "INSERT INTO pongdang_data.conditions_observationmetric "
            "(snapshot_id,name,numeric_value,text_value,unit,mode,state,source,"
            "observed_at,fetched_at,valid_until,station_id,spatial_scope,is_missing) "
            "SELECT c.id,m.name,m.numeric_value,m.text_value,m.unit,m.mode,m.state,"
            "m.source,m.observed_at,m.fetched_at,m.valid_until,m.station_id,"
            "m.spatial_scope,m.is_missing FROM copies c CROSS JOIN "
            "pongdang_data.conditions_observationmetric m WHERE m.snapshot_id=%s",
            [count, snapshot_id, snapshot_id],
        )


@pytest.mark.parametrize("projection", ["forecast", "assessment"])
def test_unrelated_sources_do_not_exhaust_projection_limit(db, projection):
    now = datetime.now(UTC)
    irrelevant = save_source(
        db,
        now,
        source_id="unrelated",
        start=now - timedelta(days=1),
        end=now if projection == "assessment" else now + timedelta(hours=1),
        modes=("forecast",) if projection == "assessment" else ("observation",),
    )
    copy_sources(db, irrelevant, 5000)
    applicable = save_source(db, now, source_id="applicable")
    with connect(db) as c:
        with pytest.raises(SourceScopeTooLargeError):
            read_normalized(c, now)
        rows = read_normalized(
            c,
            now,
            forecast_only=projection == "forecast",
            current_only=projection == "assessment",
        )
    assert [r["snapshot"]["id"] for r in rows] == [applicable]
    assert {m["mode"] for m in rows[0]["metrics"]} == {"forecast", "observation"}
    forecast = forecast_from_normalized(rows[0])
    assert forecast.issued_at is None
    assert forecast.inputs[0].numeric_value is None
    assert forecast.inputs[0].state == "missing"

    function = project_forecasts if projection == "forecast" else produce_assessments
    assert function(db, now=now) > 0
    assert function(db, now=now) == 0
    with connect(db) as c:
        assert c.execute(
            "SELECT count(*) FROM pongdang_data.conditions_observationsnapshot"
        ).fetchone() == (5002,)


def test_current_scope_excludes_exact_expiry_without_changing_evidence(db):
    now = datetime.now(UTC)
    for name, end in (
        ("expired", now - timedelta(microseconds=1)),
        ("boundary", now),
        ("current", now + timedelta(microseconds=1)),
    ):
        save_source(db, now, source_id=name, end=end)
    with connect(db) as c:
        sources = read_normalized(c, now, current_only=True)
        assert [s["snapshot"]["source_record_id"] for s in sources] == ["current"]
        assert c.execute(
            "SELECT count(*) FROM pongdang_data.conditions_observationsnapshot"
        ).fetchone() == (3,)


@pytest.mark.parametrize("projection", ["forecast", "assessment"])
def test_applicable_overflow_fails_atomically_with_fixed_error(db, projection, capsys):
    now = datetime.now(UTC)
    source = save_source(db, now, source_id="applicable", modes=("forecast",))
    copy_sources(db, source, 5000)
    function = project_forecasts if projection == "forecast" else produce_assessments

    def process():
        function(db, now=now)
        pytest.fail("Overflow must fail, never return a partial projection")

    result = run_due(db, [Job("scope-test", 60, process=process)], force=True)
    assert result == [
        {
            "job": "scope-test",
            "state": "failed",
            "received": 0,
            "inserted": 0,
            "error": "SOURCE_SCOPE_TOO_LARGE",
        }
    ]
    with connect(db) as c:
        assert c.execute(
            "SELECT state,last_error,consecutive_failures,last_success_at FROM "
            "pongdang_data.collection_job WHERE task_name='scope-test'"
        ).fetchone() == ("failed", "SOURCE_SCOPE_TOO_LARGE", 1, None)
        assert c.execute(
            "SELECT count(*) FROM pongdang_data.forecast_revision"
        ).fetchone() == (0,)
        assert c.execute(
            "SELECT count(*) FROM pongdang_data.water_index_assessment"
        ).fetchone() == (0,)
    assert "SOURCE_SCOPE_TOO_LARGE" in capsys.readouterr().out


def test_similar_untrusted_exception_message_stays_hidden(db, capsys):
    secret = "SOURCE_SCOPE_TOO_LARGE https://example.test/?serviceKey=secret-value"

    def process():
        raise ValueError(secret)

    result = run_due(db, [Job("private-failure-test", 60, process=process)])
    assert result[0]["error"] == "COLLECTION_ERROR"
    assert "secret-value" not in capsys.readouterr().out
    with connect(db) as c:
        assert c.execute(
            "SELECT last_error FROM pongdang_data.collection_job "
            "WHERE task_name='private-failure-test'"
        ).fetchone() == ("COLLECTION_ERROR",)


@pytest.mark.parametrize("scope", ["forecast_only", "current_only"])
def test_filtered_tide_revision_still_suppresses_legacy_day(db, scope):
    # Both slots fall on the same Korea calendar day, regardless of test time.
    now = datetime.now(UTC).replace(
        hour=3, minute=0, second=0, microsecond=0
    ) - timedelta(days=1)
    save_source(
        db,
        now,
        source_id="legacy-timestamp-slot",
        start=now + timedelta(hours=1),
        end=now + timedelta(hours=2),
        provider="khoa_tide_extrema",
        modes=("forecast",),
    )
    revised = save_source(
        db,
        now,
        source_id="revised-ordered-slot",
        start=now - timedelta(hours=1),
        end=now,
        provider="khoa_tide_extrema",
        version="tide-event-slots.2",
        modes=("observation",),
    )
    with connect(db) as c:
        rows = read_normalized(c, now, **{scope: True})
    assert [r["snapshot"]["id"] for r in rows] == [revised]
    assert forecast_from_normalized(rows[0]) is None
    assert datetime.fromisoformat(rows[0]["snapshot"]["valid_until"]) == now
