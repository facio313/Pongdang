"""추천 조회를 실제 저장소로 확인합니다.

`test_recommendation.py` 는 규칙만(순수 판단) 봅니다. 이쪽은 규칙이 **실제
자료에 닿는 길** -- 조석 선택, 계곡·온천·맛집 대안 SQL, 거리 계산, 관측이
비었을 때의 예보 물러서기 -- 이 동작하는지 봅니다. 한랭·물때 경로는 수집
자료가 없으면 화면에서 한 번도 지나가지 않으므로, 그 자료를 여기서 만듭니다.

일회용 pongdang_test 에서만 돕니다.
"""

import asyncio
from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.forecast.storage import project_forecasts
from app.ingestion.models import Place, Reading, SourceBatch, Station, Value
from app.ingestion.storage import store_batch
from app.main import create_app
from app.schema import connect, initialize
from app.water_index import recommendation_api
from app.water_index.condition_producer import produce_conditions
from app.water_index.recommendation import IMMERSION_WATER_C, TIDE_MARGIN_MINUTES
from app.water_index.sources import EvidenceBundle, StationMapping, register_evidence

BASE = "/api/data/water-index"
ACTIVITIES = ("swim", "surf", "relax", "mudflat", "onsen", "rafting")
NOW = datetime.now(UTC) - timedelta(seconds=5)


@pytest.fixture
def db():
    settings = Settings()
    if settings.postgres_db != "pongdang_test":
        pytest.fail("Recommendation integration requires disposable pongdang_test")
    initialize(settings)
    yield settings
    with connect(settings) as c:
        c.execute("DROP SCHEMA pongdang_data CASCADE")


def places(settings):
    """해변 하나와 근처의 계곡 · 온천 · 카페. 전부 수집 경로로 들어갑니다."""
    store_batch(
        settings,
        SourceBatch(
            provider="TOURAPI_KOREAN",
            fetched_at=NOW,
            places=[
                Place(
                    source_id="0",
                    name="일회용 시험 해수욕장",
                    kind="beach",
                    category="해수욕장",
                    region="강릉",
                    latitude=37.80,
                    longitude=128.90,
                ),
                Place(
                    source_id="1",
                    name="일회용 시험 계곡",
                    kind="valley",
                    category="계곡",
                    region="강릉",
                    latitude=37.84,
                    longitude=128.94,
                ),
                Place(
                    source_id="2",
                    name="일회용 시험 온천",
                    kind="onsen",
                    category="온천",
                    region="강릉",
                    latitude=37.81,
                    longitude=128.91,
                ),
            ],
        ),
    )
    store_batch(
        settings,
        SourceBatch(
            provider="KAKAO_LOCAL",
            fetched_at=NOW,
            places=[
                Place(
                    source_id="cafe",
                    name="일회용 시험 카페",
                    kind="tourism",
                    category="음식점 > 카페",
                    region="강릉",
                    latitude=37.802,
                    longitude=128.902,
                )
            ],
        ),
    )
    with connect(settings) as c:
        rows = c.execute(
            "SELECT source_id,spot_id FROM pongdang_data.collection_place "
            "ORDER BY source_id"
        ).fetchall()
    return {source_id: spot_id for source_id, spot_id in rows}


def readings(settings, *, water, air, wave=0.4, period=7.0):
    station = Station(
        source_id="fixture-marine",
        name="일회용 시험 관측소",
        kind="marine_buoy",
        latitude=37.80,
        longitude=128.90,
    )
    store_batch(
        settings,
        SourceBatch(
            provider="khoa_buoy_recent",
            fetched_at=NOW,
            readings=[
                Reading(
                    source_id="fixture-marine-reading",
                    station=station,
                    observed_at=NOW - timedelta(minutes=5),
                    valid_until=NOW + timedelta(hours=2),
                    spatial_scope="Isolated software fixture station point",
                    values=[
                        Value(
                            name="water_temperature", numeric_value=water, unit="degC"
                        ),
                        Value(name="air_temperature", numeric_value=air, unit="degC"),
                        Value(name="wave_height", numeric_value=wave, unit="m"),
                        Value(name="wave_period", numeric_value=period, unit="s"),
                        Value(name="wind_speed", numeric_value=3.0, unit="m/s"),
                    ],
                )
            ],
        ),
    )
    with connect(settings) as c:
        return c.execute(
            "SELECT id FROM pongdang_data.collection_station WHERE source_id=%s",
            ["fixture-marine"],
        ).fetchone()[0]


def map_station(settings, spot_id, station_id, name="fixture"):
    register_evidence(
        settings,
        EvidenceBundle(
            mappings=[
                StationMapping(
                    mapping_id=f"recommendation-{name}",
                    spot_id=spot_id,
                    station_id=station_id,
                    spatial_scope="DISPOSABLE FIXTURE ONLY",
                    mapping_version="fixture.v1",
                    evidence_ref="disposable-fixture",
                    source_url="https://www.khoa.go.kr/fixture",
                    authority="disposable test",
                    reviewed_by="disposable test",
                    activities=ACTIVITIES,
                    valid_from=NOW - timedelta(days=1),
                    valid_until=NOW + timedelta(days=2),
                )
            ]
        ),
    )


def tide_events(settings, *, minutes_to_low):
    """직전 만조와 곧 올 간조. 코드 1=만조, 2=간조(service.EXTREMA)."""
    station = Station(
        source_id="FIXTURE_TIDE",
        name="일회용 조석 관측소",
        kind="tide_station",
        latitude=37.80,
        longitude=128.90,
    )
    events = [
        (NOW - timedelta(hours=6), "1", 120.0),
        (NOW + timedelta(minutes=minutes_to_low), "2", 20.0),
        (NOW + timedelta(hours=7), "1", 118.0),
    ]
    store_batch(
        settings,
        SourceBatch(
            provider="khoa_tide_extrema",
            fetched_at=NOW,
            readings=[
                Reading(
                    source_id=f"tide-{index}",
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
                for index, (at, code, height) in enumerate(events)
            ],
        ),
    )
    # 수집 배치는 예보 슬롯을 그대로 두고, 투영이 조석 사건을 만듭니다.
    project_forecasts(settings)
    with connect(settings) as c:
        return c.execute(
            "SELECT id FROM pongdang_data.collection_station WHERE source_id=%s",
            ["FIXTURE_TIDE"],
        ).fetchone()[0]


def recommendation(client, spot_id, **params):
    response = client.get(
        BASE + "/recommendation", params={"spot_id": spot_id, **params}
    )
    assert response.status_code == 200, response.text
    assert response.headers["cache-control"] == "no-store"
    return response.json()


def kinds(view):
    return [item["kind"] for item in view["alternatives"]]


def codes(view):
    return [reason["code"] for reason in view["reasons"]]


def test_a_warm_sea_is_chosen_and_carries_the_evidence_it_judged(db):
    spots = places(db)
    map_station(db, spots["0"], readings(db, water=24.0, air=27.0))
    # Fixture setup reproduces the worker pass; the following HTTP reads stay read-only.
    produce_conditions(db)
    with TestClient(create_app(db)) as client:
        view = recommendation(client, spots["0"])
    assert view["contract_version"] == "water-recommendation.v1"
    assert view["place_kind"] == "beach"
    assert view["choice"]["activity"] in {"swim", "surf"}
    # 판단에 쓴 조건 응답이 함께 옵니다. 화면이 같은 자료를 다시 묻지 않습니다.
    assert len(view["conditions"]) == 5
    chosen = next(
        item
        for item in view["conditions"]
        if item["activity"] == view["choice"]["activity"]
    )
    assert chosen["condition_score"]["score"] == view["choice"]["score"]
    assert [row["activity"] for row in view["ranked"]] == [
        "swim",
        "surf",
        "relax",
        "onsen",
        "rafting",
    ]
    # 해변에는 욕조 · 하천 관측소가 없습니다. 점수를 만들지 않고 빼는 쪽입니다.
    dropped = {row["activity"] for row in view["ranked"] if row["dropped"]}
    assert {"onsen", "rafting"} <= dropped


def test_cold_water_sends_the_day_to_an_onsen_and_a_cafe(db):
    spots = places(db)
    map_station(db, spots["0"], readings(db, water=IMMERSION_WATER_C - 6, air=8.0))
    # Fixture setup reproduces the worker pass; the following HTTP reads stay read-only.
    produce_conditions(db)
    with TestClient(create_app(db)) as client:
        view = recommendation(client, spots["0"])
    assert "water_too_cold_for_immersion" in codes(view)
    assert "air_below_beach_preference" in codes(view)
    for row in view["ranked"]:
        if row["activity"] in {"swim", "surf"}:
            assert row["dropped"]
    # 대안은 지어낸 이름이 아니라 등록된 장소입니다.
    assert "onsen" in kinds(view) and "meal" in kinds(view)
    names = {item["name"] for item in view["alternatives"]}
    assert "일회용 시험 온천" in names and "일회용 시험 카페" in names
    onsen = next(item for item in view["alternatives"] if item["kind"] == "onsen")
    assert 0 < onsen["distance_km"] < 5


def test_the_tide_window_defers_the_sea_and_offers_a_real_valley(db):
    spots = places(db)
    station_id = readings(db, water=24.0, air=27.0)
    map_station(db, spots["0"], station_id)
    map_station(db, spots["0"], tide_events(db, minutes_to_low=20), name="tide")
    # Fixture setup reproduces the worker pass; the following HTTP reads stay read-only.
    produce_conditions(db)
    with TestClient(create_app(db)) as client:
        view = recommendation(client, spots["0"])
    assert view["tide"]["phase"] == "near_low"
    assert view["tide"]["minutes_to_low"] <= TIDE_MARGIN_MINUTES
    assert "events_are_not_safe_activity_windows" in view["tide"]["reason_codes"]
    assert "tide_phase_product_rule" in codes(view)
    for row in view["ranked"]:
        if row["activity"] in {"swim", "surf"}:
            # 강등이지 제외가 아닙니다. 점수는 그대로 남습니다.
            assert row["demoted"] and not row["dropped"]
    valley = next(item for item in view["alternatives"] if item["kind"] == "valley")
    assert valley["name"] == "일회용 시험 계곡"
    assert 0 < valley["distance_km"] <= 10


def test_a_tide_far_from_its_extremes_only_says_which_way_the_water_goes(db):
    spots = places(db)
    map_station(db, spots["0"], readings(db, water=24.0, air=27.0))
    map_station(db, spots["0"], tide_events(db, minutes_to_low=200), name="tide")
    # Fixture setup reproduces the worker pass; the following HTTP reads stay read-only.
    produce_conditions(db)
    with TestClient(create_app(db)) as client:
        view = recommendation(client, spots["0"])
    assert view["tide"]["phase"] == "falling"
    assert "tide_phase_product_rule" not in codes(view)
    assert kinds(view) == []


def test_an_inland_place_reads_no_tide_and_never_invents_one(db):
    spots = places(db)
    # Fixture setup reproduces the worker pass; the following HTTP reads stay read-only.
    produce_conditions(db)
    with TestClient(create_app(db)) as client:
        view = recommendation(client, spots["1"])
    assert view["place_kind"] == "valley"
    assert view["tide"] is None
    assert "tide_phase_product_rule" not in codes(view)


@pytest.mark.parametrize("failure", ["statement_timeout", "lookup_budget"])
def test_tide_timeout_preserves_conditions_and_rolls_back_only_optional_lookup(
    db, monkeypatch, failure
):
    spots = places(db)
    map_station(db, spots["0"], readings(db, water=16.0, air=27.0))
    produce_conditions(db)

    async def timeout(c, *_args):
        if failure == "statement_timeout":
            await c.execute("SET LOCAL statement_timeout=10")
            await c.execute("SELECT pg_sleep(1)")
        else:
            await asyncio.sleep(1)

    monkeypatch.setattr(recommendation_api, "read_tide", timeout)
    monkeypatch.setattr(recommendation_api, "TIDE_LOOKUP_TIMEOUT", 0.1)
    with TestClient(create_app(db)) as client:
        view = recommendation(client, spots["0"])
    assert view["tide"] is None
    assert "tide_lookup_unavailable" in codes(view)
    assert "tide_lookup_unavailable" in view["reason_codes"]
    assert view["choice"]["score"] is not None
    assert "tide_phase_product_rule" not in codes(view)
    # A failed optional lookup must neither fabricate water safety nor leave
    # the transaction aborted for the subsequent real alternative queries.
    assert "water_too_cold_for_immersion" in codes(view)
    assert "onsen" in kinds(view) and "meal" in kinds(view)
    assert all(
        row["dropped"] for row in view["ranked"] if row["activity"] in {"swim", "surf"}
    )
    assert any(
        row["condition_score"]["score"] is not None for row in view["conditions"]
    )


def test_an_empty_observation_falls_back_to_the_published_forecast(db):
    """관측이 비어도 예보가 있으면 서버가 물러섭니다. 예전에는 화면이 활동마다
    한 번 더 왕복해 이 일을 했습니다."""
    spots = places(db)
    station = Station(
        source_id="fixture-forecast",
        name="일회용 예보 격자",
        kind="marine_forecast",
        latitude=37.80,
        longitude=128.90,
    )
    store_batch(
        db,
        SourceBatch(
            provider="khoa_beach",
            fetched_at=NOW,
            readings=[
                Reading(
                    source_id="fixture-forecast-slot",
                    station=station,
                    # 예보 슬롯의 대상 시각은 지금입니다. 앞으로의 슬롯은
                    # 지금 조회의 대상이 아니므로(조회 시각 <= 대상 시각 규칙)
                    # 물러설 자료가 되지 못합니다.
                    observed_at=NOW - timedelta(minutes=5),
                    issued_at=NOW - timedelta(hours=1),
                    valid_until=NOW + timedelta(hours=3),
                    spatial_scope="Isolated software fixture forecast area",
                    values=[
                        Value(
                            name="water_temperature",
                            numeric_value=24.0,
                            unit="degC",
                            mode="forecast",
                        ),
                        Value(
                            name="wave_height",
                            numeric_value=0.4,
                            unit="m",
                            mode="forecast",
                        ),
                    ],
                )
            ],
        ),
    )
    with connect(db) as c:
        forecast_station = c.execute(
            "SELECT id FROM pongdang_data.collection_station WHERE source_id=%s",
            ["fixture-forecast"],
        ).fetchone()[0]
    project_forecasts(db)
    map_station(db, spots["0"], forecast_station, name="forecast")
    # Fixture setup reproduces the worker pass; the following HTTP reads stay read-only.
    produce_conditions(db)
    with TestClient(create_app(db)) as client:
        view = recommendation(client, spots["0"])
    swim = next(item for item in view["conditions"] if item["activity"] == "swim")
    assert swim["mode"] == "forecast"
    assert swim["condition_score"]["score"] is not None
    assert view["choice"]["activity"] == "swim"


def test_the_query_stays_bounded_and_says_so_when_it_cannot(db):
    with TestClient(create_app(db)) as client:
        assert client.get(BASE + "/recommendation").status_code == 422
        assert (
            client.get(BASE + "/recommendation", params={"spot_id": 0}).status_code
            == 422
        )
        # 활동은 이 조회의 답이므로 받지 않습니다.
        assert (
            client.get(
                BASE + "/recommendation", params={"spot_id": 1, "activity": "swim"}
            ).status_code
            == 422
        )
        assert (
            client.get(
                BASE + "/recommendation",
                params={"spot_id": 1, "at": "2020-01-01T00:00:00+00:00"},
            ).status_code
            == 422
        )
        assert client.get(BASE + "/recommendation?spot_id=1").status_code == 404
