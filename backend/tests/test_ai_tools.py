"""Isolated concierge projections. No external HTTP or database is contacted."""

import asyncio
import copy
import json
from contextlib import asynccontextmanager
from datetime import UTC, datetime, timedelta

import pytest
from fastapi import HTTPException

from app.ai import tools
from app.config import Settings
from app.water_index.engine import diagnostic_assessment
from app.water_index.models import Context, Target

NOW = datetime(2026, 1, 2, 14, 59, tzinfo=UTC)


def place(sid=1):
    return dict(
        spot_id=sid,
        name="경포해변" if sid == 1 else "강릉 여행장소",
        region="강릉",
        type="beach",
        lat=37.79,
        lng=128.92,
        address="강릉시",
        catalog_source="kto",
        catalog_verified_at=NOW - timedelta(hours=1),
        provider="kto",
        source_id=f"place-{sid}",
        source_url="https://korean.visitkorea.or.kr/place",
        category="beach",
        fetched_at=NOW - timedelta(hours=1),
        source_created_at=None,
        source_modified_at=None,
    )


def metric_record(*, unit="°C", state="recorded", missing=False):
    return dict(
        snapshot_id=10,
        station_id=11,
        provider="khoa_buoy",
        provider_record_id="revision-2",
        source_record_id="reading-1",
        ingestion_version="1",
        spatial_scope="reviewed regional station mapping",
        issued_at=None,
        metric_id=12,
        name="water_temperature",
        numeric_value=None if missing else 18.2,
        text_value=None,
        unit=unit,
        mode="observation",
        is_missing=missing,
        observed_at=NOW - timedelta(minutes=10),
        fetched_at=NOW - timedelta(minutes=5),
        valid_until=NOW + timedelta(hours=1),
        source_state=state,
        metric_state=state,
        valid_from=NOW - timedelta(minutes=10),
        revision_ambiguous=False,
    )


class Cursor:
    def __init__(self, rows):
        self.rows = copy.deepcopy(rows)

    async def fetchall(self):
        return self.rows

    async def fetchone(self):
        return self.rows[0] if self.rows else None


class FixtureReader:
    """SQL fixtures underneath actual read_conditions and Water Twin services."""

    def __init__(self, *, records=None, places=None):
        self.records = [metric_record()] if records is None else records
        self.places = [place()] if places is None else places
        self.queries = []
        self.open_connections = 0

    @asynccontextmanager
    async def connection(self):
        self.open_connections += 1
        try:
            yield self
        finally:
            self.open_connections -= 1

    async def execute(self, sql, params=None):
        self.queries.append((sql, params))
        if "JOIN pongdang_data.collection_place p" in sql:
            rows = self.places
            if "WHERE s.id=%s" in sql:
                rows = [r for r in rows if r["spot_id"] == params[0]]
            if "WITH candidates" in sql:
                rows = [
                    dict(r, distance_km=1.4) for r in rows if r["spot_id"] != params[3]
                ]
            return Cursor(rows)
        if "SELECT id,name,catalog_verified_at" in sql:
            return Cursor(
                [{"id": 1, "name": place()["name"], "catalog_verified_at": NOW}]
            )
        if "SELECT 1 FROM pongdang_data.spots_waterspot" in sql:
            return Cursor([{"one": 1}])
        if "SELECT id AS spot_id" in sql:
            return Cursor(
                [
                    {
                        k: v
                        for k, v in place().items()
                        if k
                        in (
                            "spot_id name type lat lng region "
                            "catalog_source catalog_verified_at"
                        ).split()
                    }
                ]
            )
        if "WITH known AS" in sql:
            return Cursor(self.records)
        if "WITH revisions AS" in sql:
            return Cursor(
                [
                    {
                        k: v
                        for k, v in r.items()
                        if k
                        in (
                            "snapshot_id station_id provider provider_record_id "
                            "source_record_id ingestion_version spatial_scope "
                            "issued_at metric_id name numeric_value text_value "
                            "unit mode is_missing "
                            "observed_at fetched_at valid_until"
                        ).split()
                    }
                    for r in self.records
                ]
            )
        if "water_index_authority_evidence" in sql or "collection_warning" in sql:
            return Cursor([])
        if "GROUP BY region" in sql:
            return Cursor(
                [
                    dict(
                        region="강릉",
                        places=1,
                        oldest_catalog_at=NOW,
                        latest_catalog_at=NOW,
                    )
                ]
            )
        if "oldest_observation_at" in sql:
            return Cursor(
                [
                    dict(
                        oldest_observation_at=NOW,
                        latest_observation_at=NOW,
                        latest_fetched_at=NOW,
                    )
                ]
            )
        raise AssertionError("Unexpected query: " + sql)

    async def summary(self):
        return dict(
            providers=[
                dict(provider="khoa_buoy", state="stale", count=1, latest_at=NOW)
            ],
            heartbeat=dict(effective_state="stale", last_seen_at=NOW, age_seconds=1000),
        )


def empty_projection():
    return dict(
        rows=[],
        total=0,
        coverage=dict(
            status="unknown",
            supported_windows=[],
            uncovered_windows=[],
            missing_targets=[],
            reason_codes=["target_manifest_unavailable"],
        ),
    )


def install_tool_services(monkeypatch):
    """Root orchestration tests can reuse these real-service storage fixtures."""

    async def links(_c, ids, _q, _at, _as_of):
        return [
            dict(
                station_id=11,
                spot_id=sid,
                provider="khoa_buoy",
                source_id="ST-1",
                name="강릉 관측소",
                kind="buoy",
                latitude=37.7,
                longitude=128.9,
                relation="representative_station",
                mapping_id="mapping-1",
                mapping=dict(
                    mapping_id="mapping-1",
                    spatial_scope="경포 대표 범위",
                    mapping_version="1",
                    evidence_ref="mapping-evidence",
                    source_url="https://khoa.go.kr/mapping",
                    authority="official",
                    valid_from=NOW - timedelta(days=1),
                    valid_until=NOW + timedelta(days=2),
                ),
                metadata_fetched_at=NOW - timedelta(hours=1),
                metadata_state="current_metadata",
            )
            for sid in ids
        ]

    async def projection(*_args, **_kwargs):
        return empty_projection()

    async def forecast(*_args, **_kwargs):
        return dict(
            rows=[],
            total=0,
            status="no_forecast_data",
            horizon_start_at=None,
            horizon_end_at=None,
            range_semantics="target_overlap",
        )

    monkeypatch.setattr("app.water_index.condition_api.station_links", links)
    monkeypatch.setattr("app.twin.api.station_links", links)
    monkeypatch.setattr("app.twin.api.read_projection", projection)
    monkeypatch.setattr("app.twin.api.select_forecasts", forecast)
    monkeypatch.setattr(tools, "read_projection", projection)
    monkeypatch.setattr(tools, "select_forecasts", forecast)


@pytest.fixture
def session(monkeypatch):
    install_tool_services(monkeypatch)
    return tools.ToolSession(
        Settings(
            _env_file=None, postgres_password="test-only", postgres_db="pongdang_test"
        ),
        NOW,
        reader=FixtureReader(),
    )


def run(awaitable):
    return asyncio.run(awaitable)


def test_schema_is_explicit_strict_and_does_not_offer_writes():
    schemas = tools.ToolSession.schemas()
    assert {s["name"] for s in schemas} == set(tools.TOOL_REGISTRY)
    assert len(schemas) == 10
    for schema in schemas:
        assert schema["type"] == "function" and schema["strict"] is True
        parameters = schema["parameters"]
        assert parameters["additionalProperties"] is False
        assert set(parameters["required"]) == set(parameters["properties"])
        assert not {"url", "sql", "table", "owner", "page", "cursor"} & set(
            parameters["properties"]
        )
    data = next(s for s in schemas if s["name"] == "place_conditions")
    assert {
        r.get("type") for r in data["parameters"]["properties"]["start"]["anyOf"]
    } == {"string", "null"}


@pytest.mark.parametrize(
    "name,args,code",
    [
        ("raw_sql", {"sql": "select 1"}, "unknown_tool"),
        ("quality", {"spot_id": True}, "invalid_tool_arguments"),
        ("quality", {"spot_id": "1"}, "invalid_tool_arguments"),
        ("quality", {"spot_id": 1, "owner": "someone"}, "invalid_tool_arguments"),
        ("search_places", {"query": "강릉", "page": 2}, "invalid_tool_arguments"),
        (
            "nearby_places",
            {"spot_id": 1, "radius_km": float("nan")},
            "invalid_tool_arguments",
        ),
        ("nearby_places", {"spot_id": 1, "radius_km": True}, "invalid_tool_arguments"),
        ("quality", '{"spot_id":1,"spot_id":2}', "invalid_tool_arguments"),
        ("place_conditions", {"spot_ids": [1, 2, 3, 4]}, "invalid_tool_arguments"),
        (
            "place_conditions",
            {"spot_ids": [1], "activity": "diving"},
            "invalid_tool_arguments",
        ),
        (
            "forecast_compare",
            {"spot_ids": [1], "when": "custom", "start": 123, "end": 124},
            "invalid_tool_arguments",
        ),
    ],
)
def test_invalid_arguments_never_reach_a_read(session, name, args, code):
    with pytest.raises(tools.ToolError, match=code):
        run(session.execute(name, args))
    assert session.reader.queries == []


def test_kst_midnight_tomorrow_afternoon_weekend_and_bounds():
    one = tools.normalize_time(tools.TimeArgs(when="today"), NOW)
    two = tools.normalize_time(tools.TimeArgs(when="today"), NOW + timedelta(minutes=2))
    assert one["from"].startswith("2026-01-02T00:00")
    assert two["from"].startswith("2026-01-03T00:00")
    tomorrow = tools.normalize_time(
        tools.TimeArgs(when="tomorrow", part_of_day="afternoon"), NOW
    )
    assert tomorrow["from"] == "2026-01-03T12:00:00+09:00"
    assert tomorrow["until"] == "2026-01-03T18:00:00+09:00"
    assert tomorrow["mode"] == "forecast"
    weekend = tools.normalize_time(tools.TimeArgs(when="this_weekend"), NOW)
    assert weekend["from"] == "2026-01-03T00:00:00+09:00"
    assert weekend["until"] == "2026-01-05T00:00:00+09:00"
    assert (
        tools.normalize_time(
            tools.TimeArgs(when="this_weekend"), NOW + timedelta(days=2)
        )["from"]
        == weekend["from"]
    )
    with pytest.raises(tools.ToolError, match="weekend_day_required"):
        tools.normalize_time(
            tools.TimeArgs(when="this_weekend", part_of_day="afternoon"), NOW
        )
    with pytest.raises(tools.ToolError, match="unsupported_time_range"):
        tools.normalize_time(
            tools.TimeArgs(
                when="custom",
                start=NOW + timedelta(days=32),
                end=NOW + timedelta(days=33),
            ),
            NOW,
        )
    with pytest.raises(tools.ToolError, match="invalid_time_range"):
        tools.normalize_time(
            tools.TimeArgs(when="custom", start=NOW, end=NOW + timedelta(days=8)), NOW
        )


def test_search_uses_parameterized_actual_travel_catalog_and_bounded_first_page(
    session,
):
    result = run(
        session.execute("search_places", {"query": "강릉' OR 1=1", "limit": 1})
    )
    sql, params = session.reader.queries[0]
    assert "JOIN pongdang_data.collection_place p" in sql
    assert "OR 1=1" not in sql and "OR 1=1" in params[0]
    assert params[-1] == 2
    assert result["candidates"][0]["candidate_id"] == "spot:1"
    assert result["scope"]["query"] == "강릉' OR 1=1"
    assert result["candidates"][0]["source"]["source_id"] == "place-1"
    assert all(
        "?spot_id=1" in link["href"] for link in result["candidates"][0]["links"]
    )


def test_real_conditions_and_twin_services_preserve_facts_and_release_connections(
    session,
):
    result = run(session.execute("place_conditions", {"spot_ids": [1]}))
    assert result["status"] == "available", result
    fact = next(
        f for f in result["facts"] if f["metadata"].get("name") == "water_temperature"
    )
    assert "18.2 °C" in fact["text"]
    assert fact["metadata"]["relation"] == "representative_station"
    assert fact["evidence_refs"] == ["metric:12:snapshot:10", "mapping:mapping-1"]
    evidence = fact["metadata"]["evidence"][0]
    assert evidence["provider_record_id"] == "revision-2"
    assert evidence["issued_at"] is None and evidence["unit"] == "°C"
    assert evidence["source_state"] == "recorded"
    assert session.reader.open_connections == 0
    assert any("WITH known AS" in sql for sql, _ in session.reader.queries)
    assert any("WITH revisions AS" in sql for sql, _ in session.reader.queries)
    warning = next(
        f for f in result["facts"] if "current_place_warning_status" in f["metadata"]
    )
    assert (
        warning["mandatory"]
        and warning["metadata"]["current_place_warning_status"] == "unknown"
    )
    safety = next(f for f in result["facts"] if "environment_score" in f["metadata"])
    assert safety["mandatory"] and safety["metadata"]["environment_score"] is None


@pytest.mark.parametrize(
    "change,status",
    [
        ({"is_missing": True, "numeric_value": None}, "missing"),
        ({"unit": None}, "unit_mismatch"),
        ({"valid_until": NOW}, "stale"),
        ({"valid_until": None}, "unknown"),
        ({"revision_ambiguous": True, "source_state": "superseded"}, "unknown"),
    ],
)
def test_missing_stale_unknown_units_and_revisions_are_not_confirmed(
    session, change, status
):
    session.reader.records = [dict(metric_record(), **change)]
    result = run(
        session.execute(
            "place_conditions", {"spot_ids": [1], "temperature_confirmed_only": True}
        )
    )
    assert result["status"] == "no_data", result
    assert not session.candidates
    fact = next(
        f for f in result["facts"] if f["metadata"].get("name") == "water_temperature"
    )
    assert fact["data_status"] == status
    assert fact["metadata"]["value"] is None


def test_station_is_never_a_travel_candidate_and_query_failure_is_not_empty(session):
    result = run(session.execute("place_conditions", {"spot_ids": [999]}))
    assert result["status"] == "query_failed"
    assert result["reason_codes"] == ["travel_place_not_found"]
    assert not result["candidates"]


def test_repeated_calls_and_call_limit_do_not_allow_database_traversal(session):
    run(session.execute("search_places", {"query": "강릉"}))
    with pytest.raises(tools.ToolError, match="repeated_tool_call"):
        run(session.execute("search_places", {"query": "강릉"}))
    for num in range(5):
        run(session.execute("search_places", {"query": str(num)}))
    with pytest.raises(tools.ToolError, match="tool_call_limit"):
        run(session.execute("search_places", {"query": "another"}))


def test_notifications_guide_has_no_owner_email_or_action(session):
    result = run(session.execute("notifications_guide", {}))
    assert result["status"] == "guide_only"
    assert session.reader.queries == []
    metadata = result["facts"][0]["metadata"]
    assert metadata["action_executed"] is False
    assert metadata["private_data_read"] is False


def test_capabilities_preserve_stale_collector_without_claiming_running(session):
    result = run(session.execute("capabilities", {"include_collection_status": True}))
    assert result["status"] == "available"
    fact = next(f for f in result["facts"] if "heartbeat" in f["metadata"])
    assert fact["metadata"]["heartbeat"]["effective_state"] == "stale"
    assert fact["metadata"]["providers"][0]["state"] == "stale"
    assert fact["metadata"]["regions"][0]["region"] == "강릉"


def test_assessment_support_and_forecast_empty_statuses_are_distinct(session):
    assessment = run(session.execute("assessment_support", {"spot_id": 1}))
    assert assessment["status"] == "unknown"
    assert assessment["facts"][0]["metadata"]["score"] is None
    forecast = run(
        session.execute(
            "forecast_compare",
            {"spot_ids": [1], "when": "tomorrow", "part_of_day": "afternoon"},
        )
    )
    assert forecast["status"] == "no_forecast_data"
    assert forecast["scope"]["mode"] == "forecast"


def test_public_assessment_validation_rejects_forged_score(session, monkeypatch):
    row = diagnostic_assessment(
        target_id="target",
        spot_id=1,
        activity="swim",
        target=Target(
            kind="interval",
            timezone="Asia/Seoul",
            start_at=NOW,
            end_at=NOW + timedelta(minutes=30),
        ),
        context=Context(),
    ).model_dump(mode="json")
    row["score"] = 99

    async def invalid(*_args, **_kwargs):
        return dict(empty_projection(), rows=[row], total=1)

    monkeypatch.setattr(tools, "read_projection", invalid)
    result = run(session.execute("assessment_support", {"spot_id": 1}))
    assert result["status"] == "query_failed"
    assert "99" not in json.dumps(result)


def test_database_failure_is_sanitized_and_rolls_back_partial_candidates(
    session, monkeypatch
):
    async def failure(*_args, **_kwargs):
        raise HTTPException(503, "credential-secret should never leave service")

    monkeypatch.setattr(tools, "read_conditions", failure)
    result = run(session.execute("place_conditions", {"spot_ids": [1]}))
    assert result["status"] == "query_failed"
    assert "credential-secret" not in json.dumps(result)
    assert session.candidates == {}
    assert session.reader.open_connections == 0


@pytest.mark.parametrize(
    "url",
    [
        "http://khoa.go.kr/cam",
        "https://evil.test/a",
        "https://khoa.go.kr/?key=private",
        "https://user:secret@khoa.go.kr/a",
        "https://khoa.go.kr:bad/a",
    ],
)
def test_source_links_reject_credentials_tokens_and_unapproved_hosts(url):
    assert tools._safe_url(url) is None


def test_nearby_uses_registered_origin_and_does_not_invent_facilities(session):
    session.reader.places.append(place(2))
    result = run(session.execute("nearby_places", {"spot_id": 1, "radius_km": 5}))
    assert result["status"] == "available", result
    candidate = result["candidates"][0]
    assert candidate["spot_id"] == 2 and candidate["distance_km"] == 1.4
    assert "parking" not in candidate
    sql, args = session.reader.queries[-1]
    assert "distance_km<=%s" in sql and args[:3] == [37.79, 37.79, 128.92]


def forecast_record():
    from app.forecast.models import ForecastView

    value = dict(
        input_id="metric:12",
        metric_id=12,
        snapshot_id=10,
        provider="khoa_tide_extrema",
        provider_record_id="tide-revision",
        source_record_id="source-slot",
        name="tide_level",
        numeric_value=None,
        unit=None,
        mode="forecast",
        state="missing",
        observed_at=NOW + timedelta(hours=1),
        issued_at=None,
        fetched_at=NOW - timedelta(minutes=5),
        valid_from=NOW + timedelta(hours=1),
        valid_until=NOW + timedelta(hours=2),
        time_role="forecast_target_start",
    )
    return ForecastView(
        source_key="source-key",
        spot_id=55,
        station_id=11,
        station_code="ST-1",
        station_name="강릉 관측소",
        provider="khoa_tide_extrema",
        source_record_id="source-slot",
        provider_record_id="tide-revision",
        snapshot_id=10,
        issued_at=None,
        fetched_at=NOW - timedelta(minutes=5),
        target_start_at=NOW + timedelta(hours=1),
        target_end_at=NOW + timedelta(hours=2),
        spatial_scope="reviewed mapping",
        inputs=(value,),
        revision_id=2,
        previous_revision_id=1,
        available_at=NOW - timedelta(minutes=1),
        requested_spot_id=1,
        mapping_evidence_ref="mapping-evidence",
        spatial_relation="representative_station",
        state="partial",
        reason_codes=("provider_issue_time_unknown",),
    ).model_dump(mode="json")


def test_forecast_and_tides_preserve_revision_target_station_and_missing_unit(
    session, monkeypatch
):
    async def forecasts(*_args, **_kwargs):
        return dict(
            rows=[forecast_record()],
            total=4,
            status="available",
            horizon_start_at=NOW,
            horizon_end_at=NOW + timedelta(days=2),
            range_semantics="target_overlap",
        )

    async def windows(*_args, **_kwargs):
        return dict(rows=[], total=0, status="no_official_operating_window")

    monkeypatch.setattr(tools, "select_forecasts", forecasts)
    monkeypatch.setattr(tools, "read_windows", windows)
    forecast = run(session.execute("forecast_compare", {"spot_ids": [1]}))
    assert forecast["status"] == "available", forecast
    row = next(f for f in forecast["facts"] if "source_key" in f["metadata"])
    assert row["metadata"]["spot_id"] == 55
    assert row["metadata"]["requested_spot_id"] == 1
    assert row["metadata"]["previous_revision_id"] == 1
    assert row["metadata"]["issued_at"] is None
    assert row["data_status"] == "partial"
    assert "forecast_page_limit" in forecast["reason_codes"]
    result = run(session.execute("tides", {"spot_id": 1}))
    assert result["status"] == "available", result
    tide = next(f for f in result["facts"] if "event_id" in f["metadata"])
    assert tide["metadata"]["source_spot_id"] == 55
    assert tide["metadata"]["unit"] is None
    assert "단위 미제공" in tide["text"] and "None" not in tide["text"]
    assert tide["metadata"]["kind"] == "unknown"


def test_livecam_is_registration_only_and_never_forwards_playback_or_terms_text(
    session, monkeypatch
):
    async def cameras(*_args, **_kwargs):
        return dict(
            contract_version="livecams.v1",
            rows=[
                dict(
                    camera_id="cam-1",
                    spot_id=1,
                    provider="official",
                    public_page="https://khoa.go.kr/camera",
                    playback_url=None,
                    media_kind="live",
                    playback_method="external_page",
                    embed_allowed=False,
                    usage_terms="untrusted registration prose",
                    terms_url="https://khoa.go.kr/terms",
                    location_evidence="private reviewer note excluded from model",
                    reviewed_at=NOW - timedelta(days=1),
                    review_valid_until=NOW + timedelta(days=1),
                    source_revision="source-1",
                    revision_id="camera-revision-1",
                    checked_at=None,
                    valid_until=None,
                    status="unverifiable",
                    reason_code="check_missing_or_expired",
                    live_verified=False,
                )
            ],
            page=1,
            page_size=3,
            has_more=False,
            as_of=NOW,
            status="available",
            reason_codes=[],
        )

    monkeypatch.setattr(tools, "read_cameras", cameras)
    result = run(session.execute("livecams", {"spot_id": 1}))
    assert result["status"] == "available", result
    row = next(f for f in result["facts"] if "camera_id" in f["metadata"])
    assert row["data_status"] == "unverifiable"
    assert row["metadata"]["live_verified"] is False
    serialized = json.dumps(result)
    assert "reviewer note" not in serialized and "registration prose" not in serialized
    assert "playback_url" not in row["metadata"]


def test_quality_analysis_keeps_freshness_and_no_private_review_identifiers(
    session, monkeypatch
):
    async def analyses(*_args, **_kwargs):
        row = dict(
            contract_version="water-quality.v1",
            analysis_version="quality-observation-rules.v1",
            comparison_version="quality-comparison.v1",
            spot_id=1,
            as_of=NOW - timedelta(hours=2),
            status="conflicting_observations",
            reason_codes=["conflicting_signals"],
            sample_count=2,
            comparable_review_count=0,
            independent_observer_count=2,
            duplicate_count=0,
            official_sample_count=0,
            latest_review_at=NOW - timedelta(hours=3),
            official_sources=[],
            review_evidence=[
                dict(
                    evidence_id="review-evidence",
                    review_id="private-review-reference",
                    revision=1,
                    kind="review",
                    observed_at=NOW - timedelta(hours=3),
                    observed_until=None,
                    received_at=NOW,
                    spatial_relation="at_spot",
                    source_record_id=None,
                )
            ],
            signals=[],
            measurement_comparisons=[],
            excluded_reviews=[],
            input_truncated=False,
            confidence_percent=None,
            official_grade_override=None,
            safety_status="unknown",
            model_validation_status="not_validated",
            analysis_id="analysis-1",
            available_at=NOW,
            freshness="stale",
            review_age_seconds=10800,
            **{"from": NOW - timedelta(days=1), "until": NOW},
        )
        return dict(
            contract_version="water-quality.v1",
            rows=[row],
            total=1,
            page=1,
            page_size=1,
            as_of=NOW,
            queried_at=NOW,
            status="available",
            reason_codes=[],
        )

    monkeypatch.setattr(tools, "read_analyses", analyses)
    result = run(session.execute("quality", {"spot_id": 1}))
    assert result["status"] == "available", result
    row = result["facts"][0]
    assert row["data_status"] == "stale" and row["mandatory"]
    assert row["metadata"]["status"] == "conflicting_observations"
    assert row["metadata"]["confidence_percent"] is None
    assert "private-review-reference" not in json.dumps(result)


def test_row_and_serialized_result_limits_are_explicit_not_full_traversal(session):
    session.reader.places = [place(i) for i in range(101)]
    result = run(session.execute("search_places", {"query": "강릉"}))
    assert result["status"] == "query_failed"
    assert result["reason_codes"] == ["evidence_row_limit"]
    assert session.candidates == {}


def test_optional_details_are_bounded_but_mandatory_restrictions_remain(session):
    session._active = "place_conditions"
    session._fact(
        "closure", status="restricted", mandatory=True, refs=["official-closure"]
    )
    for number in range(100):
        session._fact(str(number), metadata={"value": "X" * 1000})
    assert (
        len(
            json.dumps([session.facts, session.candidates], ensure_ascii=False).encode()
        )
        < tools.MAX_RESULT_BYTES
    )
    assert any(f["text"] == "closure" for f in session.facts.values())
    assert "tool_detail_limit" in session.reason_codes
