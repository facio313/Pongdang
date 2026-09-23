"""Run every concierge read against real PostgreSQL, without HTTP or SQL doubles."""

import asyncio
from datetime import UTC, datetime, timedelta

import pytest
from psycopg import sql

from app.ai.tools import TOOL_REGISTRY, ToolError, ToolSession
from app.config import Settings
from app.ingestion.models import Place, Reading, SourceBatch, Station, Value
from app.ingestion.storage import store_batch
from app.schema import connect, initialize
from app.water_index.condition_producer import produce_conditions


def database_snapshot(settings):
    """Capture schema and all application rows to detect read-tool side effects."""
    with connect(settings) as c:
        c.execute("SET TRANSACTION READ ONLY")
        columns = c.execute(
            "SELECT table_name,column_name,data_type,is_nullable "
            "FROM information_schema.columns WHERE table_schema='pongdang_data' "
            "ORDER BY table_name,ordinal_position"
        ).fetchall()
        tables = sorted({row[0] for row in columns})
        rows = {
            table: c.execute(
                sql.SQL(
                    "SELECT to_jsonb(t) FROM {} t ORDER BY to_jsonb(t)::text"
                ).format(sql.Identifier("pongdang_data", table))
            ).fetchall()
            for table in tables
        }
    return columns, rows


@pytest.fixture(scope="module")
def real_tool_db():
    settings = Settings()
    if settings.postgres_db != "pongdang_test":
        pytest.fail("AI tool integration requires disposable pongdang_test")
    with connect(settings) as c:
        c.execute("DROP SCHEMA IF EXISTS pongdang_data CASCADE")
    initialize(settings)
    now = datetime.now(UTC) - timedelta(seconds=2)
    station = Station(
        source_id="isolated-ai-station",
        name="격리 테스트 관측 부이",
        kind="buoy",
        latitude=37.804,
        longitude=128.920,
        region="강릉",
    )
    store_batch(
        settings,
        SourceBatch(
            provider="AI_SQL_TEST",
            fetched_at=now - timedelta(minutes=1),
            places=[
                Place(
                    source_id="isolated-ai-gyeongpo",
                    name="격리 경포 여행장소",
                    kind="beach",
                    latitude=37.803,
                    longitude=128.910,
                    address="강릉 격리 테스트 주소",
                    region="강릉",
                    category="beach",
                    source_url="https://www.gn.go.kr/test-place",
                ),
                Place(
                    source_id="isolated-ai-nearby",
                    name="격리 강릉 주변 여행장소",
                    kind="beach",
                    latitude=37.802,
                    longitude=128.912,
                    region="강릉",
                ),
            ],
            readings=[
                Reading(
                    source_id="isolated-ai-temperature",
                    station=station,
                    observed_at=now - timedelta(minutes=10),
                    valid_until=now + timedelta(hours=1),
                    spatial_scope="isolated station point; no beach mapping",
                    values=[
                        Value(name="water_temperature", numeric_value=18.2, unit="°C")
                    ],
                )
            ],
        ),
    )
    with connect(settings) as c:
        places = dict(
            c.execute(
                "SELECT source_id,spot_id FROM pongdang_data.collection_place "
                "WHERE provider='AI_SQL_TEST'"
            ).fetchall()
        )
        station_spot = c.execute(
            "SELECT spot_id FROM pongdang_data.collection_station "
            "WHERE provider='AI_SQL_TEST'"
        ).fetchone()[0]
    assert produce_conditions(settings) > 0
    now = datetime.now(UTC)
    baseline = database_snapshot(settings)
    yield settings, now, places, station_spot
    assert database_snapshot(settings) == baseline
    with connect(settings) as c:
        c.execute("DROP SCHEMA pongdang_data CASCADE")


def arguments(tool, places):
    sid = places["isolated-ai-gyeongpo"]
    period = {
        "activity": "swim",
        "when": "today",
        "part_of_day": "all",
        "start": None,
        "end": None,
    }
    return {
        "capabilities": {"include_collection_status": True},
        "search_places": {"query": "강릉", "activity": "swim", "limit": 8},
        "place_conditions": {
            **period,
            "spot_ids": [sid],
            "temperature_confirmed_only": False,
        },
        "assessment_support": {**period, "spot_id": sid},
        "forecast_compare": {**period, "spot_ids": [sid]},
        "tides": {**period, "spot_id": sid},
        "quality": {"spot_id": sid},
        "livecams": {"spot_id": sid},
        "nearby_places": {"spot_id": sid, "radius_km": 5, "limit": 8},
        "notifications_guide": {},
    }[tool]


@pytest.mark.parametrize("tool", list(TOOL_REGISTRY))
def test_registered_tools_execute_real_read_services_without_writes(real_tool_db, tool):
    settings, now, places, station_spot = real_tool_db
    before = database_snapshot(settings)
    session = ToolSession(settings, now)
    result = asyncio.run(session.execute(tool, arguments(tool, places)))
    assert result["status"] != "query_failed", result
    assert all(f["data_status"] != "query_failed" for f in result["facts"]), result
    assert "query_failed" not in result["reason_codes"], result
    assert session.features == [tool]
    assert all(c["spot_id"] != station_spot for c in session.candidates.values())
    assert database_snapshot(settings) == before
    if tool == "search_places":
        assert {c["spot_id"] for c in result["candidates"]} == set(places.values())
    elif tool == "nearby_places":
        assert places["isolated-ai-nearby"] in {
            c["spot_id"] for c in result["candidates"]
        }
    elif tool in {"quality", "livecams", "forecast_compare", "tides"}:
        # These services genuinely have no published fixture records; SQL/DTO
        # errors must not be disguised as the expected missing-data outcome.
        assert result["facts"]
        assert result["status"] != "available", result


def test_unmapped_station_is_not_a_travel_place_or_beach_measurement(real_tool_db):
    settings, now, places, station_spot = real_tool_db
    session = ToolSession(settings, now)
    with pytest.raises(ToolError, match="travel_place_not_found"):
        asyncio.run(session._place(station_spot))
    result = asyncio.run(
        session.execute(
            "place_conditions",
            {
                **arguments("place_conditions", places),
                "temperature_confirmed_only": True,
            },
        )
    )
    assert result["status"] != "query_failed", result
    assert not session.candidates
    assert not any("18.2" in fact["text"] for fact in session.facts.values())


def test_ai_fixture_contains_observation_without_creating_successful_forecasts(
    real_tool_db,
):
    settings, _, _, _ = real_tool_db
    with connect(settings) as c:
        assert c.execute(
            "SELECT count(*) FROM pongdang_data.conditions_observationsnapshot"
        ).fetchone() == (1,)
        assert c.execute(
            "SELECT count(*) FROM pongdang_data.forecast_revision"
        ).fetchone() == (0,)
