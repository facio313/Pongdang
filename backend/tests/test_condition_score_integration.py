"""Condition matching on disposable fixtures, not empirical activity validation."""

from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.ingestion.models import Reading, SourceBatch, Station, Value
from app.ingestion.storage import store_batch
from app.main import create_app
from app.schema import connect, initialize
from app.water_index.models import SafetyEvidence, SupportEvidence
from app.water_index.sources import (
    AuthorityRecord,
    EvidenceBundle,
    StationMapping,
    register_evidence,
)

BASE = "/api/data/water-index"
ACTIVITIES = ("swim", "surf", "relax", "mudflat", "onsen", "rafting")


@pytest.fixture
def database():
    settings = Settings()
    if settings.postgres_db != "pongdang_test":
        pytest.fail("Condition score integration requires disposable pongdang_test")
    initialize(settings)
    yield settings
    with connect(settings) as c:
        c.execute("DROP SCHEMA pongdang_data CASCADE")


def source(
    *,
    values=None,
    observed_at=None,
    fetched_at=None,
    valid_until=None,
    source_id="fixture-reading",
    station_id="fixture-weather",
    kind="weather_station",
    mode="observation",
    issued_at=None,
    provider="kma_aws",
):
    fetched_at = fetched_at or datetime.now(UTC)
    observed_at = observed_at or fetched_at - timedelta(minutes=5)
    values = values or [Value(name="air_temperature", numeric_value=22, unit="degC")]
    return SourceBatch(
        provider=provider,
        fetched_at=fetched_at,
        readings=[
            Reading(
                source_id=source_id,
                station=Station(
                    source_id=station_id,
                    name="Disposable condition fixture station",
                    kind=kind,
                    latitude=37.5,
                    longitude=129,
                ),
                observed_at=observed_at,
                issued_at=issued_at,
                valid_until=valid_until or observed_at + timedelta(hours=2),
                spatial_scope="Isolated software fixture station point",
                values=[v.model_copy(update={"mode": mode}) for v in values],
            )
        ],
    )


def station(settings, source_id="fixture-weather"):
    with connect(settings) as c:
        return c.execute(
            "SELECT id,spot_id FROM pongdang_data.collection_station "
            "WHERE source_id=%s",
            [source_id],
        ).fetchone()


def counts(settings):
    with connect(settings) as c:
        return tuple(
            c.execute(f"SELECT count(*) FROM pongdang_data.{table}").fetchone()[0]
            for table in (
                "conditions_observationsnapshot",
                "conditions_observationmetric",
                "water_index_assessment",
                "water_index_production_run",
            )
        )


def criterion(station_id, *, metric="air_temperature", low=20, high=25, weight=1):
    return {
        "metric": metric,
        "station_id": station_id,
        "minimum": low,
        "maximum": high,
        "weight": weight,
    }


def conditions(client, spot_id, activity="swim", **params):
    response = client.get(
        BASE + "/conditions",
        params={
            "spot_id": spot_id,
            "activity": activity,
            "mode": "observation",
            **params,
        },
    )
    assert response.status_code == 200, response.text
    assert response.headers["cache-control"] == "no-store"
    return response.json()


def score(client, spot_id, criteria, activity="swim", **params):
    response = client.post(
        BASE + "/condition-score",
        json={
            "spot_id": spot_id,
            "activity": activity,
            "mode": "observation",
            "criteria": criteria,
            **params,
        },
    )
    assert response.status_code == 200, response.text
    assert response.headers["cache-control"] == "no-store"
    return response.json()


def metric(view, name):
    return next(item for item in view["metrics"] if item["name"] == name)


def test_six_activity_selection_and_condition_scores_read_real_storage(database):
    store_batch(database, source())
    sid, spot = station(database)
    before = counts(database)
    with TestClient(create_app(database)) as client:
        response = client.get(BASE + "/activities")
        assert response.status_code == 200, response.text
        assert {row["activity"] for row in response.json()["rows"]} == set(ACTIVITIES)
        assert response.json()["contract_version"] == "water-conditions.v1"
        for activity in ACTIVITIES:
            view = conditions(client, spot, activity)
            assert view["activity"] == activity
            assert view["environment_score"] is None
            assert view["safety_status"] in {"unknown", "not_assessed"}
            air = metric(view, "air_temperature")
            assert air["status"] == "available"
            assert air["value"] == 22
            assert air["station_id"] == sid
            assert air["evidence"][0]["source_record_id"] == "fixture-reading"
            result = score(client, spot, [criterion(sid)], activity)
            assert result["status"] == "evaluated"
            assert result["score"] == 100
            assert result["score_label"] == "종합 조건 일치 점수"
            assert result["evidence"]["activity"] == activity
            assert result["evidence"]["environment_score"] is None
            assert result["calculation_id"]
            rejected = score(client, spot, [criterion(sid, low=23, high=25)], activity)
            assert rejected["score"] == 0
            assert rejected["criteria"][0]["status"] == "not_matched"
    assert counts(database) == before


def test_explicit_weights_zero_values_and_inclusive_bounds(database):
    store_batch(
        database,
        source(
            values=[
                Value(name="air_temperature", numeric_value=22, unit="degC"),
                Value(name="precipitation", numeric_value=0, unit="mm/1h"),
            ]
        ),
    )
    sid, spot = station(database)
    with TestClient(create_app(database)) as client:
        result = score(
            client,
            spot,
            [
                criterion(sid, low=23, high=25, weight=3),
                criterion(sid, metric="precipitation", low=0, high=0, weight=1),
            ],
            "relax",
        )
        assert result["status"] == "evaluated"
        assert result["score"] == 25
        assert result["total_weight"] == 4
        assert result["matched_weight"] == 1
        assert result["criteria"][1]["value"] == 0
        assert result["criteria"][1]["matched"] is True
        assert result["evidence"]["support_status"] == "unknown"


def test_latest_missing_revision_never_falls_back_and_historical_cutoff_survives(
    database,
):
    original = source()
    store_batch(database, original)
    sid, spot = station(database)
    with TestClient(create_app(database)) as client:
        before = conditions(client, spot)
        cutoff = before["as_of"]
        replacement = source(
            observed_at=original.readings[0].observed_at,
            valid_until=original.readings[0].valid_until,
            values=[Value(name="air_temperature", missing=True, unit="degC")],
        )
        store_batch(database, replacement)
        after = conditions(client, spot)
        assert metric(after, "air_temperature")["status"] == "missing"
        assert metric(after, "air_temperature")["value"] is None
        result = score(client, spot, [criterion(sid)])
        assert result["status"] == "incomplete"
        assert result["score"] is None
        historical = conditions(client, spot, as_of=cutoff, at=cutoff)
        assert metric(historical, "air_temperature")["value"] == 22
        historical_result = score(
            client, spot, [criterion(sid)], as_of=cutoff, at=cutoff
        )
        assert historical_result["score"] == 100


def test_omitted_metric_correction_does_not_reuse_an_older_source_reading(database):
    now = datetime.now(UTC)
    store_batch(
        database,
        source(source_id="older-reading", observed_at=now - timedelta(minutes=10)),
    )
    current = source(
        source_id="corrected-reading",
        observed_at=now - timedelta(minutes=5),
        values=[
            Value(name="air_temperature", numeric_value=24, unit="degC"),
            Value(name="wind_speed", numeric_value=3, unit="m/s"),
        ],
    )
    store_batch(database, current)
    sid, spot = station(database)
    with TestClient(create_app(database)) as client:
        assert metric(conditions(client, spot), "air_temperature")["value"] == 24
        store_batch(
            database,
            source(
                source_id=current.readings[0].source_id,
                observed_at=current.readings[0].observed_at,
                valid_until=current.readings[0].valid_until,
                values=[Value(name="wind_speed", numeric_value=3, unit="m/s")],
            ),
        )
        result = score(client, spot, [criterion(sid)])
        assert result["score"] is None
        assert result["status"] == "incomplete"
        air_rows = [
            item
            for item in result["evidence"]["metrics"]
            if item["name"] == "air_temperature"
        ]
        assert all(item["value"] is None for item in air_rows)


def test_reactivated_old_revision_cannot_guess_unrecorded_reactivation_history(
    database,
):
    original = source(
        values=[Value(name="air_temperature", numeric_value=25, unit="degC")]
    )
    store_batch(database, original)
    sid, spot = station(database)
    with TestClient(create_app(database)) as client:
        assert score(client, spot, [criterion(sid)])["score"] == 100
        replacement = source(
            observed_at=original.readings[0].observed_at,
            valid_until=original.readings[0].valid_until,
            values=[Value(name="air_temperature", numeric_value=10, unit="degC")],
        )
        store_batch(database, replacement)
        changed = score(client, spot, [criterion(sid)])
        assert changed["score"] == 0
        cutoff = changed["evidence"]["as_of"]
        store_batch(
            database,
            original.model_copy(update={"fetched_at": datetime.now(UTC)}),
        )
        for params in ({}, {"as_of": cutoff, "at": cutoff}):
            result = score(client, spot, [criterion(sid)], **params)
            assert result["status"] == "incomplete"
            assert result["score"] is None
            air = metric(result["evidence"], "air_temperature")
            assert air["status"] == "unknown"
            assert air["value"] is None
            assert "revision_reactivation_history_unavailable" in air["reason_codes"]


def test_conflicting_same_time_records_are_unavailable(database):
    now = datetime.now(UTC)
    for identity, value in (("fixture-a", 20), ("fixture-b", 25)):
        store_batch(
            database,
            source(
                source_id=identity,
                observed_at=now - timedelta(minutes=5),
                values=[
                    Value(name="air_temperature", numeric_value=value, unit="degC")
                ],
            ),
        )
    sid, spot = station(database)
    with TestClient(create_app(database)) as client:
        view = conditions(client, spot)
        air = metric(view, "air_temperature")
        assert air["status"] == "conflict"
        assert air["value"] is None
        assert len(air["evidence"]) == 2
        result = score(client, spot, [criterion(sid)])
        assert result["status"] == "incomplete"
        assert result["score"] is None


@pytest.mark.parametrize("failure", ("stale", "unit_mismatch"))
def test_stale_or_unknown_unit_cannot_produce_a_score(database, failure):
    now = datetime.now(UTC)
    store_batch(
        database,
        source(
            observed_at=now - timedelta(hours=2),
            valid_until=now - timedelta(hours=1)
            if failure == "stale"
            else now + timedelta(hours=1),
            values=[
                Value(
                    name="air_temperature",
                    numeric_value=22,
                    unit="degC" if failure == "stale" else "",
                )
            ],
        ),
    )
    sid, spot = station(database)
    with TestClient(create_app(database)) as client:
        view = conditions(client, spot)
        assert metric(view, "air_temperature")["status"] == failure
        result = score(client, spot, [criterion(sid)])
        assert result["status"] == "incomplete"
        assert result["score"] is None


def test_mapping_activity_correction_respects_historical_knowledge(database):
    original = source()
    store_batch(database, original)
    sid, _ = station(database)
    with connect(database) as c:
        c.execute(
            "INSERT INTO pongdang_data.spots_waterspot(id,name) "
            "VALUES(9301,'Disposable mapped place')"
        )
    mapping = StationMapping(
        mapping_id="condition-mapping-v1",
        spot_id=9301,
        station_id=sid,
        spatial_scope="Isolated software fixture place scope",
        mapping_version="fixture.v1",
        evidence_ref="fixture-only-source",
        source_url="https://www.weather.go.kr/fixture-evidence",
        authority="Isolated software fixture authority",
        reviewed_by="fixture reviewer",
        activities=ACTIVITIES,
        valid_from=original.readings[0].observed_at - timedelta(hours=1),
        valid_until=original.readings[0].valid_until + timedelta(hours=1),
    )
    register_evidence(database, EvidenceBundle(mappings=[mapping]))
    with TestClient(create_app(database)) as client:
        before = conditions(client, 9301)
        cutoff = before["as_of"]
        assert metric(before, "air_temperature")["mapping_id"] == mapping.mapping_id
        assert score(client, 9301, [criterion(sid)])["score"] == 100
        changed = mapping.model_copy(
            update={
                "mapping_id": "condition-mapping-v2",
                "mapping_version": "fixture.v2",
                "supersedes_id": mapping.mapping_id,
                "activities": ("surf",),
            }
        )
        register_evidence(database, EvidenceBundle(mappings=[changed]))
        assert score(client, 9301, [criterion(sid)])["score"] is None
        historical = conditions(client, 9301, as_of=cutoff, at=cutoff)
        assert metric(historical, "air_temperature")["mapping_id"] == mapping.mapping_id
        assert score(client, 9301, [criterion(sid)], "surf")["score"] == 100


@pytest.mark.parametrize("effect", ("unsupported", "restricted", "caution"))
def test_authoritative_status_is_preserved_in_condition_score(database, effect):
    original = source()
    store_batch(database, original)
    sid, spot = station(database)
    now = datetime.now(UTC) - timedelta(milliseconds=1)
    common = {
        "evidence_ref": "fixture-authority-condition",
        "provider": "TEST_OFFICIAL",
        "provider_record_id": "fixture-condition-control",
        "spot_id": spot,
        "activity": "swim",
        "authority": "Isolated software fixture authority",
        "authoritative": True,
        "source_status": "active",
        "state": "current",
        "issued_at": now - timedelta(minutes=1),
        "fetched_at": now,
        "valid_from": original.readings[0].observed_at,
        "valid_until": original.readings[0].valid_until,
        "scope": "Fixture station point",
    }
    evidence = (
        SupportEvidence(**common, status="unsupported", mapping_version="fixture.v1")
        if effect == "unsupported"
        else SafetyEvidence(
            **common,
            check_id="fixture-operation",
            rule_id="fixture-official-control",
            effect=effect,
            parameter_ids=("PAR_SAFETY_NON_COMPENSATION",),
        )
    )
    register_evidence(
        database,
        EvidenceBundle(
            authorities=[
                AuthorityRecord(
                    evidence_id="fixture-condition-authority",
                    source_url="https://www.weather.go.kr/fixture-control",
                    reviewed_by="fixture reviewer",
                    evidence=evidence,
                )
            ]
        ),
    )
    with TestClient(create_app(database)) as client:
        result = score(client, spot, [criterion(sid)])
        if effect == "caution":
            assert result["status"] == "evaluated"
            assert result["score"] == 100
            assert "official_caution_present" in result["evidence"]["reason_codes"]
            assert result["evidence"]["safety_status"] == "unknown"
        else:
            assert result["status"] == "blocked"
            assert result["score"] is None
            assert (
                result["evidence"][
                    "support_status" if effect == "unsupported" else "safety_status"
                ]
                == effect
            )


def test_sea_temperature_is_neither_bath_nor_river_temperature(database):
    store_batch(
        database,
        source(
            kind="buoy",
            values=[Value(name="water_temperature", numeric_value=24, unit="°C")],
        ),
    )
    sid, spot = station(database)
    with TestClient(create_app(database)) as client:
        bath = conditions(client, spot, "onsen")
        assert "bath_water_temperature" in bath["missing_metrics"]
        assert all(item["name"] != "water_temperature" for item in bath["metrics"])
        result = score(
            client,
            spot,
            [criterion(sid, metric="bath_water_temperature", low=20, high=30)],
            "onsen",
        )
        assert result["score"] is None
        river = conditions(client, spot, "rafting")
        assert metric(river, "water_temperature")["status"] != "available"


def test_river_measurements_keep_flow_unit_and_do_not_derive_from_level(database):
    store_batch(
        database,
        source(
            kind="river_level",
            values=[
                Value(name="river_level", numeric_value=2.5, unit="m"),
                Value(name="river_flow", numeric_value=80, unit="m³/s"),
            ],
        ),
    )
    sid, spot = station(database)
    with TestClient(create_app(database)) as client:
        view = conditions(client, spot, "rafting")
        assert metric(view, "river_flow")["value"] == 80
        assert metric(view, "river_flow")["unit"] == "m³/s"
        result = score(
            client,
            spot,
            [criterion(sid, metric="river_flow", low=60, high=90)],
            "rafting",
        )
        assert result["score"] == 100


@pytest.mark.parametrize("known_issue", (False, True))
def test_forecast_target_and_unknown_issue_remain_explicit(database, known_issue):
    now = datetime.now(UTC) - timedelta(seconds=1)
    target = now + timedelta(hours=1)
    store_batch(
        database,
        source(
            mode="forecast",
            fetched_at=now,
            observed_at=target,
            issued_at=now - timedelta(minutes=5) if known_issue else None,
            provider="kma_short_forecast",
        ),
    )
    sid, spot = station(database)
    with TestClient(create_app(database)) as client:
        result = score(
            client,
            spot,
            [criterion(sid)],
            mode="forecast",
            at=target.isoformat(),
        )
        air = metric(result["evidence"], "air_temperature")
        assert air["evidence"][0]["mode"] == "forecast"
        assert datetime.fromisoformat(air["evidence"][0]["observed_at"]) == target
        if known_issue:
            assert result["status"] == "evaluated"
            assert result["score"] == 100
        else:
            assert air["evidence"][0]["issued_at"] is None
            assert result["status"] == "incomplete"
            assert result["score"] is None


def test_weekly_forecasts_remain_readable_with_accumulated_issue_history(database):
    """A real-sized history must fit the API's unchanged 3-second SQL budget."""
    now = datetime.now(UTC) - timedelta(seconds=1)
    batch = source(
        mode="forecast",
        fetched_at=now,
        observed_at=now,
        issued_at=now - timedelta(hours=1),
        provider="kma_short_forecast",
        values=[
            Value(name="air_temperature", numeric_value=24, unit="degC"),
            Value(name="wind_speed", numeric_value=3, unit="m/s"),
            Value(name="wave_height", numeric_value=0.5, unit="m"),
            Value(name="precipitation", numeric_value=0, unit="mm/1h"),
        ],
    )
    reading = batch.readings[0]
    store_batch(
        database,
        batch.model_copy(
            update={
                "readings": [
                    reading.model_copy(
                        update={
                            "source_id": f"issue-{issue}:target-{hour}",
                            "issued_at": now - timedelta(hours=1 + issue * 3),
                            "observed_at": now + timedelta(hours=hour),
                            "valid_until": now + timedelta(hours=hour + 1),
                        }
                    )
                    for issue in range(28)
                    for hour in range(168)
                ]
            }
        ),
    )
    _, spot = station(database)
    with TestClient(create_app(database)) as client:
        for day in range(7):
            target = now + timedelta(days=day, hours=12)
            result = conditions(client, spot, mode="forecast", at=target.isoformat())
            air = metric(result, "air_temperature")
            assert air["value"] == 24
            assert air["status"] == "available"
            assert datetime.fromisoformat(air["evidence"][0]["issued_at"]) == (
                now - timedelta(hours=1)
            )
            assert datetime.fromisoformat(air["evidence"][0]["observed_at"]) == target
            assert result["condition_score"]["score"] is not None
            assert result["safety_status"] == "unknown"


def test_provider_activity_product_cannot_be_scored_as_another_activity(database):
    now = datetime.now(UTC) - timedelta(seconds=1)
    target = now + timedelta(hours=1)
    store_batch(
        database,
        source(
            mode="forecast",
            fetched_at=now,
            observed_at=target,
            issued_at=now - timedelta(minutes=5),
            provider="khoa_surfing",
            kind="surfing",
        ),
    )
    sid, spot = station(database)
    with TestClient(create_app(database)) as client:
        surf = score(
            client,
            spot,
            [criterion(sid)],
            "surf",
            mode="forecast",
            at=target.isoformat(),
        )
        assert surf["score"] == 100
        swim = score(
            client,
            spot,
            [criterion(sid)],
            "swim",
            mode="forecast",
            at=target.isoformat(),
        )
        assert swim["score"] is None
        assert swim["status"] == "incomplete"


def summary(client, spot_ids, activity="swim", **params):
    response = client.get(
        BASE + "/conditions/summary",
        params={
            "spot_ids": ",".join(str(i) for i in spot_ids),
            "activity": activity,
            **params,
        },
    )
    assert response.status_code == 200, response.text
    assert response.headers["cache-control"] == "no-store"
    return response.json()


def test_summary_rows_agree_with_the_single_spot_reading(database):
    """목록과 상세가 다른 숫자를 말하면 안 됩니다 -- 요약은 같은 봉투에서
    뽑아낸 것이지 따로 계산한 값이 아닙니다."""
    store_batch(
        database,
        source(
            values=[
                Value(name="air_temperature", numeric_value=22, unit="degC"),
                Value(name="water_temperature", numeric_value=19.5, unit="degC"),
            ]
        ),
    )
    _, spot = station(database)
    with TestClient(create_app(database)) as client:
        view = conditions(client, spot)
        rows = summary(client, [spot])["rows"]
        assert len(rows) == 1
        row = rows[0]
        assert row["spot_id"] == spot
        assert row["place_name"] == view["place_name"]
        assert row["support_status"] == view["support_status"]
        assert row["safety_status"] == view["safety_status"]
        assert row["condition_score"] == view["condition_score"]
        assert row["water_temperature"]["value"] == 19.5
        assert row["expires_at"] is not None


def test_summary_reports_unreadable_spots_instead_of_dropping_them(database):
    """값이 없는 상태는 안전을 뜻하지 않습니다. 못 읽은 지점은 조용히 빠지지
    않고 사유와 함께 남아야 합니다."""
    store_batch(database, source())
    _, spot = station(database)
    missing = spot + 9999
    with TestClient(create_app(database)) as client:
        payload = summary(client, [spot, missing])
        assert [row["spot_id"] for row in payload["rows"]] == [spot]
        assert payload["unavailable"] == [
            {"spot_id": missing, "reason": "place_not_found"}
        ]
        assert payload["contract_version"] == "water-conditions-summary.v1"
        assert payload["mode"] == "observation"


@pytest.mark.parametrize(
    "spot_ids",
    [
        ",".join(str(i) for i in range(1, 27)),  # 상한 초과
        "1,1",  # 중복
        "1,-2",  # 음수
        "1,x",  # 비정수
        "1, 2",  # 공백
        "",  # 빈 값
    ],
)
def test_summary_rejects_unclear_id_lists(database, spot_ids):
    store_batch(database, source())
    with TestClient(create_app(database)) as client:
        response = client.get(
            BASE + "/conditions/summary",
            params={"spot_ids": spot_ids, "activity": "swim"},
        )
        assert response.status_code == 422, response.text


def test_summary_rejects_duplicate_query_parameters(database):
    store_batch(database, source())
    _, spot = station(database)
    with TestClient(create_app(database)) as client:
        response = client.get(
            BASE + f"/conditions/summary?spot_ids={spot}&spot_ids={spot}"
            "&activity=swim"
        )
        assert response.status_code == 422, response.text


def test_summary_reads_many_spots_on_one_connection(database):
    """연결 슬롯은 네 개뿐입니다(DataReader). 지점마다 따로 물으면 목록이
    스스로를 굶겼습니다. 한 요청이 여러 지점을 답해야 합니다."""
    store_batch(database, source())
    store_batch(
        database,
        source(source_id="fixture-reading-b", station_id="fixture-weather-b"),
    )
    with connect(database) as c:
        spots = [
            row[0]
            for row in c.execute(
                "SELECT DISTINCT spot_id FROM pongdang_data.collection_station "
                "WHERE spot_id IS NOT NULL ORDER BY spot_id"
            ).fetchall()
        ]
    assert len(spots) >= 2
    before = counts(database)
    with TestClient(create_app(database)) as client:
        payload = summary(client, spots)
        assert [row["spot_id"] for row in payload["rows"]] == spots
    assert counts(database) == before
