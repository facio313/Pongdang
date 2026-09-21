"""Real PostgreSQL18 source->projection->assessment->HTTP tests, disposable only."""

import asyncio
from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.data_reader import DataReader
from app.forecast.storage import project_forecasts, select_forecasts
from app.ingestion.models import Reading, SourceBatch, Station, Value
from app.ingestion.storage import store_batch
from app.main import create_app
from app.schema import connect, initialize
from app.tides.service import OperatingWindow
from app.tides.storage import register_window
from app.water_index.models import SupportEvidence
from app.water_index.producer import produce_assessments
from app.water_index.sources import (
    AuthorityRecord,
    EvidenceBundle,
    StationMapping,
    register_evidence,
)


@pytest.fixture
def db():
    settings = Settings()
    if settings.postgres_db != "pongdang_test":
        pytest.fail("Integration requires disposable pongdang_test")
    initialize(settings)
    yield settings
    with connect(settings) as c:
        c.execute("DROP SCHEMA pongdang_data CASCADE")


def batch(
    *,
    at,
    fetched,
    height=34.0,
    code="1",
    source_id="fixture-source",
    provider="khoa_tide_extrema",
):
    station = Station(
        source_id="FIXTURE_TIDE",
        name="Synthetic test station",
        kind="tide_station",
        latitude=37.0,
        longitude=128.0,
    )
    return SourceBatch(
        provider=provider,
        fetched_at=fetched,
        readings=[
            Reading(
                source_id=source_id,
                station=station,
                observed_at=at,
                valid_until=at + timedelta(minutes=1),
                spatial_scope="Fixture station point",
                values=[
                    Value(
                        name="tide_level",
                        numeric_value=height,
                        unit="cm",
                        mode="forecast",
                    ),
                    Value(
                        name="tide_extremum_code",
                        numeric_value=float(code),
                        text_value=code,
                        mode="forecast",
                    ),
                ],
            )
        ],
    )


def ids(db):
    with connect(db) as c:
        return c.execute(
            "SELECT spot_id,id FROM pongdang_data.collection_station "
            "ORDER BY id LIMIT 1"
        ).fetchone()


def params(spot, start, end):
    return {
        "spot_id": spot,
        "activity": "mudflat",
        "from": start.isoformat(),
        "until": end.isoformat(),
        "mode": "forecast",
        "profile_id": "general",
        "page_size": 100,
    }


def test_tide_lookup_stays_bounded_with_unrelated_forecast_history(db):
    now = datetime.now(UTC)
    at = now + timedelta(hours=2)
    store_batch(db, batch(at=at, fetched=now - timedelta(seconds=1)))
    spot, _ = ids(db)
    assert project_forecasts(db) == 1
    with connect(db) as c:
        # Reproduce accumulated history and an empty, not-yet-analyzed mapping
        # table. The former per-row mapping plan paid large JIT startup costs.
        c.execute(
            "INSERT INTO pongdang_data.forecast_revision "
            "(source_key,spot_id,station_id,provider,target_start_at,target_end_at,"
            "fetched_at,payload,digest) SELECT f.source_key||'-fixture-'||n,"
            "f.spot_id,f.station_id,'fixture_unrelated',f.target_start_at,"
            "f.target_end_at,f.fetched_at,"
            "jsonb_set(f.payload,'{provider}','\"fixture_unrelated\"'),"
            "f.digest||n FROM pongdang_data.forecast_revision f "
            "CROSS JOIN generate_series(1,20000) n"
        )
        c.execute("ANALYZE pongdang_data.forecast_revision")

    async def read():
        async with DataReader(db).connection() as c:
            await c.execute("SET LOCAL statement_timeout=1000")
            return await select_forecasts(
                c,
                spot_id=spot,
                as_of=datetime.now(UTC),
                from_at=at - timedelta(minutes=1),
                until_at=at + timedelta(minutes=2),
                provider="khoa_tide_extrema",
            )

    result = asyncio.run(read())
    assert result["status"] == "available"
    assert result["total"] == 1
    assert result["rows"][0]["inputs"][0]["numeric_value"] == 34.0


def test_real_storage_publication_correction_and_readonly_http(db):
    now = datetime.now(UTC)
    at = now + timedelta(hours=2)
    first = batch(at=at, fetched=now - timedelta(seconds=2))
    assert store_batch(db, first) > 0
    spot, station = ids(db)
    assert project_forecasts(db) == 1
    assert project_forecasts(db) == 0
    assert produce_assessments(db) > 0
    assert produce_assessments(db) == 0
    with connect(db) as c:
        cutoff = c.execute("SELECT clock_timestamp()").fetchone()[0]
        before = c.execute(
            "SELECT count(*) FROM pongdang_data.water_index_assessment"
        ).fetchone()[0]
    with TestClient(create_app(db)) as client:
        query = params(spot, at - timedelta(minutes=1), at + timedelta(minutes=2))
        forecast = client.get("/api/data/water-forecast/forecasts", params=query)
        assert forecast.status_code == 200, forecast.text
        assert forecast.json()["rows"][0]["inputs"][0]["numeric_value"] == 34.0
        assessment = client.get("/api/data/water-index/assessments", params=query)
        assert assessment.status_code == 200, assessment.text
        saved = assessment.json()["rows"][0]
        assert saved["assessment_id"] and saved["inputs"][0]["snapshot_id"]
        assert saved["score"] is None and saved["support"]["status"] == "unknown"
        events = client.get(
            "/api/data/tides/events",
            params={**query, "reference_at": (at - timedelta(seconds=30)).isoformat()},
        )
        assert events.status_code == 200, events.text
        assert events.json()["next_high"]["seconds_until"] == 30
        assert events.json()["next_low"] is None
        assert (
            client.get(
                "/api/data/water-forecast/forecasts",
                params={**query, "spot_id": 999999},
            ).status_code
            == 404
        )
        assert (
            client.get(
                "/api/data/water-forecast/forecasts",
                params=params(spot, at + timedelta(days=9), at + timedelta(days=10)),
            ).json()["status"]
            == "outside_forecast_horizon"
        )
        with connect(db) as c:
            assert (
                c.execute(
                    "SELECT count(*) FROM pongdang_data.water_index_assessment"
                ).fetchone()[0]
                == before
            )
        corrected = batch(
            at=at + timedelta(minutes=3),
            fetched=datetime.now(UTC),
            height=40.0,
            source_id="fixture-source",
        )
        assert store_batch(db, corrected) > 0
        assert project_forecasts(db) == 1
        assert produce_assessments(db) > 0
        wide = params(spot, at - timedelta(minutes=1), at + timedelta(minutes=5))
        latest = client.get("/api/data/water-forecast/forecasts", params=wide).json()
        assert latest["total"] == 1 and latest["rows"][0]["previous_revision_id"]
        assert latest["rows"][0]["inputs"][0]["numeric_value"] == 40.0
        historical = client.get(
            "/api/data/water-forecast/forecasts",
            params={**wide, "as_of": cutoff.isoformat()},
        ).json()
        assert historical["rows"][0]["inputs"][0]["numeric_value"] == 34.0
        assert historical["rows"][0]["issued_at"] is None
        # Provider restores A after corrected B: new revision retains old evidence
        # timestamps and cannot silently reuse B or extend A's original lifetime.
        store_batch(db, first)
        assert project_forecasts(db) == 1
        assert produce_assessments(db) > 0
        reverted = client.get("/api/data/water-forecast/forecasts", params=wide).json()
        assert reverted["rows"][0]["inputs"][0]["numeric_value"] == 34.0
        assert (
            reverted["rows"][0]["previous_revision_id"]
            == latest["rows"][0]["revision_id"]
        )
        assert reverted["rows"][0]["fetched_at"] == historical["rows"][0]["fetched_at"]
        windows = client.get("/api/data/tides/windows", params=query)
        assert windows.json()["status"] == "no_official_operating_window"
    with connect(db) as c:
        with pytest.raises(Exception, match="immutable"):
            c.execute("UPDATE pongdang_data.forecast_revision SET digest='changed'")


@pytest.mark.parametrize("correction_kind", ["activity_removed", "period_shortened"])
def test_reviewed_mapping_support_and_window_input_path(db, correction_kind):
    now = datetime.now(UTC)
    at = now + timedelta(hours=2)
    store_batch(db, batch(at=at, fetched=now - timedelta(seconds=1)))
    spot, station = ids(db)
    with connect(db) as c:
        destination = c.execute(
            "INSERT INTO pongdang_data.spots_waterspot(name) "
            "VALUES('Synthetic destination') RETURNING id"
        ).fetchone()[0]
    mapping = StationMapping(
        mapping_id="fixture-map",
        spot_id=destination,
        station_id=station,
        spatial_scope="Fixture reviewed coast relation",
        mapping_version="fixture-v1",
        evidence_ref="fixture-report",
        source_url="https://www.khoa.go.kr/",
        authority="Fixture operator",
        reviewed_by="fixture",
        activities=["mudflat"],
        valid_from=now,
        valid_until=now + timedelta(days=1),
    )
    support = SupportEvidence(
        evidence_ref="fixture-support",
        provider="fixture_operator",
        provider_record_id="fixture-open",
        spot_id=destination,
        activity="mudflat",
        authority="Fixture operator",
        authoritative=True,
        source_status="active",
        state="current",
        fetched_at=now,
        valid_from=now,
        valid_until=now + timedelta(days=1),
        status="supported",
        scope="Fixture area",
        mapping_version="fixture-v1",
    )
    bundle = EvidenceBundle(
        mappings=[mapping],
        authorities=[
            AuthorityRecord(
                evidence_id="fixture-authority",
                source_url="https://www.khoa.go.kr/",
                reviewed_by="fixture",
                evidence=support,
            )
        ],
    )
    assert register_evidence(db, bundle) == 2
    assert register_evidence(db, bundle) == 0
    conflicting = mapping.model_copy(update={"mapping_id": "fixture-conflicting-map"})
    with pytest.raises(ValueError, match="Overlapping station mappings"):
        register_evidence(db, EvidenceBundle(mappings=[conflicting]))
    assert project_forecasts(db) > 0 and produce_assessments(db) > 0
    window = OperatingWindow(
        window_id="fixture-window",
        source_key="fixture-window-source",
        spot_id=destination,
        station_id=station,
        start_at=at,
        end_at=at + timedelta(hours=1),
        provider="fixture_operator",
        provider_record_id="fixture-hours",
        source_url="https://www.khoa.go.kr/",
        fetched_at=now,
        valid_until=now + timedelta(days=1),
        operating_status="open",
        controls_status="confirmed",
        control_evidence_refs=["fixture-control"],
        scope="Fixture area",
        reviewed_by="fixture",
    )
    assert register_window(db, window) == 1 and register_window(db, window) == 0
    with TestClient(create_app(db)) as client:
        query = params(destination, at - timedelta(minutes=1), at + timedelta(hours=2))
        forecast = client.get("/api/data/water-forecast/forecasts", params=query)
        assert forecast.status_code == 200, forecast.text
        assert (
            forecast.json()["rows"][0]["spatial_relation"] == "representative_station"
        )
        assert forecast.json()["rows"][0]["mapping_evidence_ref"] == "fixture-map"
        assessment = client.get(
            "/api/data/water-index/assessments", params=query
        ).json()["rows"][0]
        assert (
            assessment["spot_id"] == destination
            and assessment["inputs"][0]["spot_id"] == spot
        )
        assert assessment["inputs"][0]["mapping_evidence_ref"] == "fixture-map"
        assert (
            assessment["support"]["status"] == "supported"
            and assessment["score"] is None
        )
        assert (
            client.get("/api/data/water-index/support", params=query).json()["total"]
            == 1
        )
        assert (
            client.get("/api/data/tides/windows", params=query).json()["rows"][0][
                "state"
            ]
            == "official_operating_window"
        )

        with connect(db) as c:
            cutoff = c.execute("SELECT clock_timestamp()").fetchone()[0]
            original = c.execute(
                "SELECT payload FROM pongdang_data.water_index_assessment "
                "WHERE assessment_id=%s",
                [assessment["assessment_id"]],
            ).fetchone()[0]
        changes = {
            "mapping_id": "fixture-map-correction",
            "supersedes_id": mapping.mapping_id,
        }
        if correction_kind == "activity_removed":
            changes["activities"] = ("relax",)
        else:
            changes["valid_until"] = now + timedelta(hours=1)
        register_evidence(
            db, EvidenceBundle(mappings=[mapping.model_copy(update=changes)])
        )
        # The affected group disappears, so selection must invalidate its old view.
        produce_assessments(db)
        for route in ("assessments", "support", "coverage"):
            current = client.get("/api/data/water-index/" + route, params=query)
            assert current.status_code == 200, current.text
            assert current.json()["rows"] == []
            assert current.json()["coverage"]["reason_codes"] == [
                "station_mapping_changed"
            ]
            historic = client.get(
                "/api/data/water-index/" + route,
                params={**query, "as_of": cutoff.isoformat()},
            )
            assert historic.status_code == 200, historic.text
            assert (
                "station_mapping_changed"
                not in historic.json()["coverage"]["reason_codes"]
            )
            if route != "coverage":
                assert historic.json()["rows"]
        with connect(db) as c:
            unchanged = c.execute(
                "SELECT payload FROM pongdang_data.water_index_assessment "
                "WHERE assessment_id=%s",
                [assessment["assessment_id"]],
            ).fetchone()[0]
            assert unchanged == original


def test_over_hundred_targets_paginate_without_synthetic_gaps(db):
    now = datetime.now(UTC)
    start = now + timedelta(hours=1)
    readings = []
    for n in range(101):
        readings.extend(
            batch(
                at=start + timedelta(hours=n),
                fetched=now - timedelta(seconds=1),
                source_id=f"fixture-hour-{n}",
                provider="kma_fixture",
            ).readings
        )
    # Contiguous hourly provider windows make the genuine coverage a single span.
    readings = [
        r.model_copy(update={"valid_until": r.observed_at + timedelta(hours=1)})
        for r in readings
    ]
    store_batch(
        db,
        SourceBatch(
            provider="kma_fixture",
            fetched_at=now - timedelta(seconds=1),
            readings=readings,
        ),
    )
    spot, _ = ids(db)
    assert project_forecasts(db) == 101
    assert produce_assessments(db) > 0
    with TestClient(create_app(db)) as client:
        query = params(spot, start, start + timedelta(hours=101))
        for endpoint in (
            "/api/data/water-forecast/forecasts",
            "/api/data/water-index/assessments",
        ):
            response = client.get(endpoint, params=query)
            assert response.status_code == 200, response.text
            assert (
                response.json()["total"] == 101 and len(response.json()["rows"]) == 100
            )
            second = client.get(endpoint, params={**query, "page": 2}).json()
            assert len(second["rows"]) == 1


def test_assessment_inputs_expired_during_a_pass_are_not_published(db):
    now = datetime.now(UTC)
    cutoff = now - timedelta(minutes=2)
    expired = batch(at=cutoff, fetched=cutoff, source_id="already-expired")
    current = batch(
        at=now + timedelta(hours=1), fetched=cutoff, source_id="still-current"
    )
    store_batch(db, expired)
    store_batch(db, current)
    assert produce_assessments(db, now=cutoff) > 0
    with connect(db) as c:
        targets = c.execute(
            "SELECT DISTINCT start_at FROM pongdang_data.water_index_target"
        ).fetchall()
        assert targets == [(current.readings[0].observed_at,)]


def test_expiry_race_rolls_back_only_expired_group_and_keeps_valid_publications(
    db, monkeypatch
):
    from psycopg.errors import CheckViolation

    import app.water_index.producer as producer

    now = datetime.now(UTC)
    cutoff = now - timedelta(minutes=2)
    current = batch(
        at=now + timedelta(hours=1),
        fetched=cutoff,
        provider="khoa_surfing",
    )
    expired = batch(at=cutoff, fetched=cutoff, provider="khoa_beach")
    store_batch(db, current)
    store_batch(db, expired)
    with connect(db) as c:
        expired_spot = c.execute(
            "SELECT spot_id FROM pongdang_data.collection_station "
            "WHERE provider='khoa_beach'"
        ).fetchone()[0]
    actual_store = producer.store_bundle_on_connection
    actual_clock = producer.publication_time
    crossed_expiry = False
    violations = []

    def clock(connection):
        # Model a short-lived source expiring between preflight and INSERT;
        # actual PostgreSQL clock_timestamp() remains authoritative at INSERT.
        return actual_clock(connection) if crossed_expiry else cutoff

    def store(connection, bundle, at):
        nonlocal crossed_expiry
        if bundle.read_manifests[0].spot_id == expired_spot:
            crossed_expiry = True
        try:
            return actual_store(connection, bundle, at)
        except CheckViolation as exc:
            violations.append(exc.diag.constraint_name)
            raise

    monkeypatch.setattr(producer, "publication_time", clock)
    monkeypatch.setattr(producer, "store_bundle_on_connection", store)
    assert produce_assessments(db, now=cutoff) > 0
    assert violations == ["water_index_read_manifest_check1"]
    with connect(db) as c:
        assert (
            c.execute(
                "SELECT count(*) FROM pongdang_data.water_index_production_run "
                "WHERE spot_id=%s",
                [expired_spot],
            ).fetchone()[0]
            == 0
        )
        assert (
            c.execute(
                "SELECT count(*) FROM pongdang_data.water_index_target "
                "WHERE spot_id=%s",
                [expired_spot],
            ).fetchone()[0]
            == 0
        )
        assert (
            c.execute(
                "SELECT count(*) FROM pongdang_data.water_index_production_run"
            ).fetchone()[0]
            == 1
        )


def test_unrelated_assessment_constraint_failure_is_not_swallowed(db, monkeypatch):
    from psycopg.errors import CheckViolation

    now = datetime.now(UTC)
    store_batch(db, batch(at=now + timedelta(hours=1), fetched=now))

    def invalid_target(connection, bundle, at):
        connection.execute(
            "INSERT INTO pongdang_data.water_index_target "
            "(target_id,spot_id,activity,profile_id,request_mode,"
            "start_at,payload,digest) VALUES "
            "('invalid-fixture',%s,'swim','general','invalid',%s,'{}','fixture')",
            [bundle.read_manifests[0].spot_id, at],
        )

    monkeypatch.setattr(
        "app.water_index.producer.store_bundle_on_connection", invalid_target
    )
    with pytest.raises(CheckViolation):
        produce_assessments(db)
    with connect(db) as c:
        assert (
            c.execute(
                "SELECT count(*) FROM pongdang_data.water_index_target"
            ).fetchone()[0]
            == 0
        )


def independent_forecast(station_id, *, height=34.0):
    now = datetime.now(UTC)
    source = batch(
        at=now.replace(minute=0, second=0, microsecond=0) + timedelta(hours=2),
        fetched=now,
        height=height,
        provider="khoa_surfing",
    )
    reading = source.readings[0]
    return source.model_copy(
        update={
            "readings": [
                reading.model_copy(
                    update={
                        "station": reading.station.model_copy(
                            update={"source_id": station_id}
                        )
                    }
                )
            ]
        }
    )


def one_group_per_batch(monkeypatch):
    import app.water_index.producer as producer

    elapsed = [0]
    actual_store = producer.store_bundle_on_connection

    def store(connection, bundle, at):
        result = actual_store(connection, bundle, at)
        elapsed[0] += 60
        return result

    monkeypatch.setattr(producer, "monotonic", lambda: elapsed[0])
    monkeypatch.setattr(producer, "store_bundle_on_connection", store)


def test_assessment_job_commits_bounded_groups_and_resumes_to_completion(
    db, monkeypatch
):
    from app.feature_jobs import feature_jobs

    store_batch(db, independent_forecast("first"))
    store_batch(db, independent_forecast("second"))
    one_group_per_batch(monkeypatch)
    job = next(j for j in feature_jobs(db) if j.name == "water_index_evaluation")
    assert job.interval_seconds == 600 and not job.external_collection
    first = job.process()
    assert first["state"] == "partial"
    assert first["error"] == "ASSESSMENT_BACKFILL_PENDING"
    assert first["next_run_seconds"] == 30
    assert first["received"] == first["inserted"] > 0
    with connect(db) as c:
        assert (
            c.execute(
                "SELECT count(*) FROM pongdang_data.water_index_production_run"
            ).fetchone()[0]
            == 1
        )
    second = job.process()
    assert second["state"] == "succeeded" and second["inserted"] > 0
    assert "next_run_seconds" not in second
    assert produce_assessments(db) == 0


def test_updated_first_source_cannot_starve_unprocessed_assessment_groups(
    db, monkeypatch
):
    from app.water_index.producer import produce_assessment_batch

    store_batch(db, independent_forecast("first"))
    store_batch(db, independent_forecast("second"))
    store_batch(db, independent_forecast("third"))
    one_group_per_batch(monkeypatch)
    assert produce_assessment_batch(db)["state"] == "partial"
    store_batch(db, independent_forecast("first", height=45))
    assert produce_assessment_batch(db)["state"] == "partial"
    with connect(db) as c:
        published = c.execute(
            "SELECT s.source_id FROM pongdang_data.water_index_production_run r "
            "JOIN pongdang_data.collection_station s ON s.spot_id=r.spot_id "
            "ORDER BY r.run_id"
        ).fetchall()
    assert published == [("first",), ("second",)]


def test_tide_adapter_upgrade_hides_old_identity_only_after_new_capture(db):
    now = datetime.now(UTC)
    at = now + timedelta(hours=2)
    store_batch(
        db,
        batch(
            at=at, fetched=now - timedelta(seconds=1), source_id="legacy-time-identity"
        ),
    )
    spot, _ = ids(db)
    assert project_forecasts(db) == 1
    with connect(db) as c:
        before_upgrade = c.execute("SELECT clock_timestamp()").fetchone()[0]
    upgraded = batch(
        at=at + timedelta(minutes=4),
        fetched=datetime.now(UTC),
        height=40.0,
        source_id="derived:FIXTURE_TIDE:day:extremum:high:1",
    )
    upgraded = upgraded.model_copy(update={"adapter_version": "tide-event-slots.2"})
    store_batch(db, upgraded)
    assert project_forecasts(db) == 1
    assert project_forecasts(db) == 0
    with TestClient(create_app(db)) as client:
        query = params(spot, at - timedelta(minutes=1), at + timedelta(minutes=6))
        current = client.get("/api/data/water-forecast/forecasts", params=query)
        assert current.status_code == 200, current.text
        assert current.json()["total"] == 1
        assert current.json()["rows"][0]["adapter_version"] == "tide-event-slots.2"
        assert current.json()["rows"][0]["inputs"][0]["numeric_value"] == 40.0
        historic = client.get(
            "/api/data/water-forecast/forecasts",
            params={**query, "as_of": before_upgrade.isoformat()},
        )
        assert historic.status_code == 200, historic.text
        assert historic.json()["total"] == 1
        assert historic.json()["rows"][0]["inputs"][0]["numeric_value"] == 34.0
    with connect(db) as c:
        assert (
            c.execute(
                "SELECT count(*) FROM pongdang_data.forecast_revision"
            ).fetchone()[0]
            == 2
        )
