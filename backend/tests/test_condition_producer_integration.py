"""Worker/read parity against real disposable PostgreSQL evidence selection."""

import asyncio
from contextlib import contextmanager
from datetime import UTC, datetime, timedelta

import pytest

from app.config import Settings
from app.data_reader import DataReader
from app.ingestion.models import Reading, SourceBatch, Station, Value
from app.ingestion.storage import store_batch
from app.ingestion.weather import grid_coordinates
from app.schema import connect, initialize
from app.water_index.condition_api import ConditionQuery, read_conditions
from app.water_index.condition_producer import KST, _load_inputs, produce_conditions
from app.water_index.condition_storage import read_condition_set
from app.water_index.conditions import ACTIVITIES, ConditionsEnvelope
from app.water_index.models import SafetyEvidence
from app.water_index.sources import (
    AuthorityRecord,
    EvidenceBundle,
    StationMapping,
    register_evidence,
)


@pytest.fixture
def database():
    settings = Settings(_env_file=None, ai_provider="disabled")
    if settings.postgres_db != "pongdang_test":
        pytest.fail("Condition projection requires disposable pongdang_test")
    initialize(settings)
    yield settings
    with connect(settings) as c:
        c.execute("DROP SCHEMA pongdang_data CASCADE")


def put(
    settings,
    *,
    provider="kma_aws",
    station="fixture-aws",
    identity="fixture-reading",
    observed,
    fetched,
    values,
    issued=None,
    until=None,
    mode="observation",
    kind="weather_station",
    latitude=37.5,
    longitude=129,
):
    store_batch(
        settings,
        SourceBatch(
            provider=provider,
            fetched_at=fetched,
            readings=[
                Reading(
                    source_id=identity,
                    station=Station(
                        source_id=station,
                        name=f"Fixture {station}",
                        kind=kind,
                        latitude=latitude,
                        longitude=longitude,
                    ),
                    observed_at=observed,
                    issued_at=issued,
                    valid_until=until or observed + timedelta(hours=4),
                    spatial_scope="Disposable software fixture station",
                    values=[v.model_copy(update={"mode": mode}) for v in values],
                )
            ],
        ),
    )


def ids(settings, station):
    with connect(settings) as c:
        return c.execute(
            "SELECT id,spot_id FROM pongdang_data.collection_station "
            "WHERE source_id=%s",
            [station],
        ).fetchone()


def inputs(settings, now):
    start = now.astimezone(KST).replace(hour=0, minute=0, second=0, microsecond=0)
    end = start + timedelta(days=32)
    with connect(settings) as c:
        c.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY")
        return _load_inputs(c, now, start, end), start, end


def assert_parity(settings, loaded, q, at, cutoff):
    place = next(p for p in loaded.places if p["id"] == q.spot_id)
    raw = asyncio.run(
        read_conditions(
            DataReader(settings), q.model_copy(update={"at": at}), now=cutoff
        )
    )
    projected = loaded.envelope(place, q, at, cutoff)
    assert projected.model_dump() == raw.model_dump()
    return projected


def test_bulk_selection_preserves_missing_revisions_conflicts_units_and_context(
    database,
):
    base = datetime.now(UTC) - timedelta(hours=1)
    air = Value(name="air_temperature", numeric_value=22, unit="degC")
    wind = Value(name="wind_speed", numeric_value=3, unit="m/s")
    put(database, observed=base, fetched=base, values=[air, wind])
    # An omitted metric in a correction must stay explicitly missing.
    put(
        database,
        observed=base,
        fetched=base + timedelta(minutes=1),
        values=[wind],
    )
    for identity, value in (("conflict-a", 20), ("conflict-b", 24)):
        put(
            database,
            station="fixture-conflict",
            identity=identity,
            observed=base,
            fetched=base,
            values=[air.model_copy(update={"numeric_value": value})],
        )
    put(
        database,
        provider="khoa_water_temperature",
        station="fixture-sea",
        observed=base,
        fetched=base,
        values=[Value(name="sea_water_temperature", numeric_value=23, unit="degC")],
        kind="sea_water_temperature",
    )
    put(
        database,
        station="fixture-stale",
        observed=base,
        fetched=base,
        until=base + timedelta(minutes=30),
        values=[wind.model_copy(update={"unit": "km/h"})],
    )
    nx, ny = grid_coordinates(37.5, 129)
    put(
        database,
        provider="kma_nowcast",
        station=f"kma-grid-{nx}-{ny}",
        observed=base,
        fetched=base,
        kind="weather_forecast_grid",
        values=[air.model_copy(update={"numeric_value": 27})],
    )
    now = datetime.now(UTC)
    loaded, _, _ = inputs(database, now)
    for place in loaded.places:
        for activity in ACTIVITIES:
            result = assert_parity(
                database,
                loaded,
                ConditionQuery(
                    spot_id=place["id"], activity=activity, mode="observation"
                ),
                now,
                now,
            )
            if place["id"] == ids(database, "fixture-aws")[1]:
                air_metric = next(
                    m for m in result.metrics if m.name == "air_temperature"
                )
                assert air_metric.status == "missing"


@pytest.mark.parametrize(
    ("previous_state", "same_fetch", "ambiguous"),
    [("current", False, True), ("superseded", False, False), ("current", True, False)],
)
def test_bulk_revision_conflict_aggregation_matches_raw_reader(
    database, previous_state, same_fetch, ambiguous
):
    base = datetime.now(UTC) - timedelta(hours=1)
    for minute, temperature in ((0, 20), (1, 22)):
        put(
            database,
            observed=base,
            fetched=base + timedelta(minutes=minute),
            values=[
                Value(name="air_temperature", numeric_value=temperature, unit="degC")
            ],
        )
    sid, spot = ids(database, "fixture-aws")
    # Reproduce an older revision that was not superseded. An active revision
    # fetched at the exact same time is not an earlier conflicting revision.
    with connect(database) as c:
        c.execute(
            "UPDATE pongdang_data.conditions_observationsnapshot "
            "SET state=%s,fetched_at=%s WHERE station_id=%s "
            "AND id=(SELECT min(id) FROM "
            "pongdang_data.conditions_observationsnapshot WHERE station_id=%s)",
            [
                previous_state,
                base + timedelta(minutes=1) if same_fetch else base,
                sid,
                sid,
            ],
        )
    now = datetime.now(UTC)
    loaded, _, _ = inputs(database, now)
    assert {row["revision_ambiguous"] for row in loaded.rows[(sid, "observation")]} == {
        ambiguous
    }
    assert_parity(
        database,
        loaded,
        ConditionQuery(spot_id=spot, activity="relax", mode="observation"),
        now,
        now,
    )


@pytest.mark.parametrize("second_latitude", [37.54, 37.5])
def test_shared_envelopes_preserve_place_distances_nearest_ties_and_expiry(
    database, monkeypatch, second_latitude
):
    import app.water_index.condition_producer as producer

    base = datetime.now(UTC) - timedelta(hours=1)
    for name, latitude, temperature in (
        ("fixture-west", 37.5, 22),
        ("fixture-east", second_latitude, 28),
    ):
        put(
            database,
            station=name,
            observed=base,
            fetched=base,
            latitude=latitude,
            values=[
                Value(name="air_temperature", numeric_value=temperature, unit="degC")
            ],
        )
    with connect(database) as c:
        spots = [
            c.execute(
                "INSERT INTO pongdang_data.spots_waterspot "
                "(name,type,lat,lng,catalog_verified_at) "
                "VALUES(%s,'beach',%s,129,%s) RETURNING id",
                [f"Disposable nearby place {index}", latitude, base],
            ).fetchone()[0]
            for index, latitude in enumerate((37.505, 37.51, 37.535, 37.505))
        ]
    register_evidence(
        database,
        EvidenceBundle(
            authorities=[
                AuthorityRecord(
                    evidence_id="fixture-nearby-restriction",
                    source_url="https://www.weather.go.kr/fixture",
                    reviewed_by="Fixture review",
                    evidence=SafetyEvidence(
                        evidence_ref="fixture-nearby-restriction-ref",
                        spot_id=spots[-1],
                        activity="relax",
                        provider="fixture-official",
                        provider_record_id="fixture-nearby-restriction",
                        authority="Fixture authority",
                        fetched_at=base,
                        issued_at=base,
                        valid_from=base,
                        valid_until=base + timedelta(hours=4),
                        authoritative=True,
                        source_status="active",
                        state="current",
                        scope="Disposable nearby place restriction",
                        effect="restricted",
                        check_id="fixture-check",
                        rule_id="fixture-rule",
                    ),
                )
            ]
        ),
    )
    now = datetime.now(UTC)
    loaded, _, _ = inputs(database, now)
    calls = 0
    assemble = producer.assemble_conditions

    def counted(**kwargs):
        nonlocal calls
        calls += 1
        return assemble(**kwargs)

    monkeypatch.setattr(producer, "assemble_conditions", counted)
    results = []
    first_payload = None
    for spot in spots:
        results.append(
            assert_parity(
                database,
                loaded,
                ConditionQuery(spot_id=spot, activity="relax", mode="observation"),
                now,
                now,
            )
        )
        if first_payload is None:
            first_payload = results[0].model_dump()
    assert results[0].model_dump() == first_payload
    # The first two places share source selection but have different distances.
    # The third reverses nearest station order unless both stations coincide.
    assert calls == (3 if second_latitude == 37.54 else 2)
    assert results[0].context_metrics[0].distance_km != (
        results[1].context_metrics[0].distance_km
    )
    assert [result.spot_id for result in results] == spots
    assert results[-1].safety_status == "restricted"
    assert results[-1].condition_score.status == "blocked"
    if second_latitude == 37.54:
        assert results[0].display_metrics[0].station_id != (
            results[2].display_metrics[0].station_id
        )
    else:
        assert all(result.condition_score.score is None for result in results)
    for spot in spots:
        expired = assert_parity(
            database,
            loaded,
            ConditionQuery(spot_id=spot, activity="relax", mode="observation"),
            base + timedelta(hours=4),
            base + timedelta(hours=4),
        )
        assert expired.condition_score.score is None


def test_forecast_intervals_match_arbitrary_targets_and_latest_kma_issue(database):
    base = datetime.now(UTC) - timedelta(hours=1)
    target = base + timedelta(hours=2)
    for issue, temperature in ((base - timedelta(hours=3), 18), (base, 24)):
        for offset in (0, 2):
            put(
                database,
                provider="kma_short_forecast",
                station="fixture-forecast",
                identity=f"{issue.isoformat()}:{offset}",
                observed=target + timedelta(hours=offset),
                fetched=base,
                issued=issue,
                until=target + timedelta(hours=offset + 1),
                values=[
                    Value(
                        name="air_temperature", numeric_value=temperature, unit="degC"
                    ),
                    Value(name="precipitation", numeric_value=0, unit="mm/1h"),
                ],
                mode="forecast",
            )
    now = datetime.now(UTC)
    loaded, start, end = inputs(database, now)
    _, spot_id = ids(database, "fixture-forecast")
    records = loaded.records(now, start, end)
    for offset in (0, 0.5, 1, 1.5, 2, 2.999):
        at = target + timedelta(hours=offset)
        q = ConditionQuery(spot_id=spot_id, activity="relax", mode="forecast")
        expected = assert_parity(database, loaded, q, at, now)
        record = next(
            r
            for r in records
            if r["spot_id"] == spot_id
            and r["activity"] == "relax"
            and r["mode"] == "forecast"
            and r["target_start"] <= at < r["target_end"]
        )
        payload = {**record["payload"], "at": at.isoformat(), "as_of": now.isoformat()}
        assert (
            ConditionsEnvelope.model_validate(payload).model_dump()
            == expected.model_dump()
        )
        metric = next(m for m in expected.metrics if m.name == "air_temperature")
        assert metric.status == ("stale" if 1 <= offset < 2 else "available")
        assert metric.evidence[0].issued_at == base


def test_mapping_authority_and_expiry_boundaries_publish_same_condition_set(database):
    base = datetime.now(UTC) - timedelta(hours=1)
    put(
        database,
        observed=base,
        fetched=base,
        values=[Value(name="air_temperature", numeric_value=22, unit="degC")],
    )
    put(
        database,
        station="fixture-target",
        observed=base,
        fetched=base,
        values=[Value(name="wind_speed", numeric_value=2, unit="m/s")],
    )
    sid, _ = ids(database, "fixture-aws")
    _, spot = ids(database, "fixture-target")
    boundary = datetime.now(UTC) + timedelta(minutes=3)
    register_evidence(
        database,
        EvidenceBundle(
            mappings=[
                StationMapping(
                    mapping_id="fixture-mapping",
                    spot_id=spot,
                    station_id=sid,
                    spatial_scope="Disposable target place mapping",
                    mapping_version="fixture.1",
                    evidence_ref="fixture-reference",
                    source_url="https://www.weather.go.kr/fixture",
                    authority="Fixture authority",
                    reviewed_by="Fixture review",
                    activities=("swim",),
                    valid_from=base,
                    valid_until=boundary,
                )
            ],
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
                        valid_until=boundary,
                        authoritative=True,
                        source_status="active",
                        state="current",
                        scope="Disposable target place restriction",
                        effect="restricted",
                        check_id="fixture-check",
                        rule_id="fixture-rule",
                    ),
                )
            ],
        ),
    )
    now = datetime.now(UTC)
    loaded, _, _ = inputs(database, now)
    q = ConditionQuery(spot_id=spot, activity="swim", mode="observation")
    for at in (now, boundary, boundary + timedelta(minutes=2)):
        expected = assert_parity(database, loaded, q, at, at)
        assert expected.safety_status == ("restricted" if at < boundary else "unknown")
    assert produce_conditions(database, now=now) > 0
    assert produce_conditions(database, now=now) == 0
    assert produce_conditions(database, now=datetime.now(UTC)) == 0
    for at in (now, boundary, base + timedelta(hours=4)):
        stored = asyncio.run(read_condition_set(DataReader(database), [q], now=at))[0]
        expected = assert_parity(database, loaded, q, at, at)
        assert stored.model_dump(exclude={"projection"}) == expected.model_dump(
            exclude={"projection"}
        )
    forecast = q.model_copy(
        update={"mode": "forecast", "at": boundary - timedelta(seconds=1)}
    )
    stored = asyncio.run(read_condition_set(DataReader(database), [forecast], now=now))[
        0
    ]
    assert stored.safety_status == "restricted"
    assert stored.condition_score.status == "blocked"
    assert stored.metrics == ()


def test_saved_forecasts_preserve_31_day_query_window_and_real_evidence(database):
    base = datetime.now(UTC) - timedelta(seconds=1)
    start = base.astimezone(KST).replace(hour=0, minute=0, second=0, microsecond=0)
    targets = (
        base + timedelta(days=10),
        base + timedelta(days=31),
        start + timedelta(days=31, hours=23),
    )
    for index, target in enumerate(targets):
        put(
            database,
            provider="kma_short_forecast",
            station="fixture-month-forecast",
            identity=f"fixture-month-target-{index}",
            observed=target,
            fetched=base,
            issued=base - timedelta(hours=1),
            until=target + timedelta(hours=1),
            values=[
                Value(name="air_temperature", numeric_value=22 + index, unit="degC")
            ],
            mode="forecast",
        )
    put(
        database,
        observed=base,
        fetched=base,
        values=[Value(name="air_temperature", numeric_value=22, unit="degC")],
    )
    now = datetime.now(UTC)
    assert produce_conditions(database, now=now) > 0
    loaded, _, _ = inputs(database, now)
    _, spot = ids(database, "fixture-month-forecast")
    late_cutoff = start + timedelta(days=1) - timedelta(microseconds=1)
    for at, cutoff, has_score in (
        (targets[0] + timedelta(minutes=30), now, True),
        (now + timedelta(days=31), now, True),
        (late_cutoff + timedelta(days=31), late_cutoff, True),
        (targets[0] - timedelta(seconds=1), now, False),
        (targets[0] + timedelta(hours=1), now, False),
        (base + timedelta(days=15), now, False),
    ):
        q = ConditionQuery(spot_id=spot, activity="relax", mode="forecast", at=at)
        expected = assert_parity(database, loaded, q, at, cutoff)
        stored = asyncio.run(read_condition_set(DataReader(database), [q], now=cutoff))[
            0
        ]
        assert stored.model_dump(exclude={"projection"}) == expected.model_dump(
            exclude={"projection"}
        )
        assert (stored.condition_score.score is not None) is has_score
    with connect(database) as c:
        latest_observation_end = c.execute(
            "SELECT max(target_end) FROM pongdang_data.condition_snapshot "
            "WHERE mode='observation'"
        ).fetchone()[0]
    assert latest_observation_end == start + timedelta(days=7)


def test_week_of_forecasts_collapses_issue_history_with_constant_bulk_queries(database):
    base = datetime.now(UTC) - timedelta(minutes=1)
    values = [
        Value(name="air_temperature", numeric_value=24, unit="degC", mode="forecast"),
        Value(name="wind_speed", numeric_value=3, unit="m/s", mode="forecast"),
    ]
    store_batch(
        database,
        SourceBatch(
            provider="kma_short_forecast",
            fetched_at=base,
            readings=[
                Reading(
                    source_id=f"fixture-issue-{issue}:target-{hour}",
                    station=Station(
                        source_id="fixture-week",
                        name="Disposable weekly forecast fixture",
                        kind="weather_forecast_grid",
                        latitude=37.5,
                        longitude=129,
                    ),
                    observed_at=base + timedelta(hours=hour),
                    issued_at=base - timedelta(hours=1 + issue * 3),
                    valid_until=base + timedelta(hours=hour + 1),
                    spatial_scope="Disposable weekly forecast fixture",
                    values=values,
                )
                for issue in range(28)
                for hour in range(168)
            ],
        ),
    )
    calls = []

    class CountingCursor:
        def __init__(self, cursor):
            self.cursor = cursor

        def execute(self, query, params):
            calls.append(query)
            return self.cursor.execute(query, params)

    class CountingConnection:
        def __init__(self, connection):
            self.connection = connection

        @contextmanager
        def cursor(self, **kwargs):
            with self.connection.cursor(**kwargs) as cursor:
                yield CountingCursor(cursor)

    now = datetime.now(UTC)
    start = now.astimezone(KST).replace(hour=0, minute=0, second=0, microsecond=0)
    end = start + timedelta(days=7)
    with connect(database) as c:
        loaded = _load_inputs(CountingConnection(c), now, start, end)
    records = loaded.records(now, start, end)
    assert len(calls) <= 8
    assert len(records) > 500
    # Only latest-issue evidence for each target survives, not 28 issue histories.
    assert sum(len(rows) for rows in loaded.rows.values()) <= 168 * len(values)
    _, spot = ids(database, "fixture-week")
    for day in range(7):
        at = base + timedelta(days=day, hours=1, minutes=30)
        if at >= end:
            continue
        result = assert_parity(
            database,
            loaded,
            ConditionQuery(spot_id=spot, activity="swim", mode="forecast"),
            at,
            now,
        )
        assert result.condition_score.score is not None
        assert all(
            m.evidence[0].issued_at == base - timedelta(hours=1) for m in result.metrics
        )
