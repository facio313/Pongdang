"""Pure/domain tests; these records are isolated software fixtures."""

from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.config import Settings
from app.forecast.api import create_forecast_router
from app.forecast.storage import forecast_from_normalized
from app.tides.api import create_tides_router
from app.tides.service import OperatingWindow, tide_event, window_state
from app.water_index.engine import evaluate
from app.water_index.models import SupportEvidence
from app.water_index.producer import _merge_windows, build_request
from app.water_index.sources import AuthorityRecord, StationMapping

NOW = datetime(2026, 1, 1, 14, tzinfo=UTC)


def normalized(
    *,
    provider="khoa_tide_extrema",
    time=NOW + timedelta(hours=1),
    code="4",
    height=34.0,
    snapshot_id=1,
):
    end = time + timedelta(minutes=1)
    snapshot = {
        "id": snapshot_id,
        "spot_id": 1,
        "provider": provider,
        "state": "recorded",
        "observed_at": time.isoformat(),
        "fetched_at": NOW.isoformat(),
        "valid_from": time.isoformat(),
        "valid_until": end.isoformat(),
        "spatial_scope": "Fixture station point, not beach measurement",
        "provider_record_id": f"fixture-revision-{snapshot_id}",
        "source_record_id": f"FIXTURE_DT:2026-01-02:extremum:{code}:1",
        "station_id": 1,
        "issued_at": None,
    }
    metrics = []
    for n, (name, numeric, text, unit) in enumerate(
        [
            ("tide_level", height, str(height) if height is not None else None, "cm"),
            ("tide_extremum_code", float(code) if code.isnumeric() else None, code, ""),
        ]
    ):
        metrics.append(
            {
                "id": snapshot_id * 10 + n,
                "snapshot_id": snapshot_id,
                "name": name,
                "numeric_value": numeric,
                "text_value": text,
                "unit": unit,
                "mode": "forecast",
                "state": "missing" if text is None else "recorded",
                "observed_at": time.isoformat(),
                "fetched_at": NOW.isoformat(),
                "valid_until": end.isoformat(),
                "station_id": "FIXTURE_DT",
                "is_missing": text is None,
            }
        )
    return {
        "snapshot": snapshot,
        "metrics": metrics,
        "station": {
            "id": 1,
            "spot_id": 1,
            "source_id": "FIXTURE_DT",
            "name": "Fixture tide station",
            "latitude": 37.0,
            "longitude": 128.0,
        },
    }


def mapping(**changes):
    return StationMapping(
        **{
            "mapping_id": "fixture-mapping",
            "spot_id": 2,
            "station_id": 1,
            "spatial_scope": "Fixture coast area",
            "mapping_version": "fixture-v1",
            "evidence_ref": "fixture-record",
            "source_url": "https://www.khoa.go.kr/",
            "authority": "Fixture operator",
            "reviewed_by": "fixture",
            "activities": ["mudflat"],
            "valid_from": NOW - timedelta(days=1),
            "valid_until": NOW + timedelta(days=2),
            **changes,
        }
    )


def operating(**changes):
    return OperatingWindow(
        **{
            "window_id": "fixture-window",
            "source_key": "fixture-day",
            "spot_id": 1,
            "start_at": NOW + timedelta(minutes=30),
            "end_at": NOW + timedelta(hours=3),
            "provider": "fixture_operator",
            "provider_record_id": "fixture-operation",
            "source_url": "https://www.khoa.go.kr/",
            "fetched_at": NOW,
            "valid_until": NOW + timedelta(hours=4),
            "operating_status": "open",
            "controls_status": "confirmed",
            "control_evidence_refs": ["fixture-control"],
            "scope": "Fixture boundary",
            "reviewed_by": "fixture",
            **changes,
        }
    )


def test_corrected_event_keeps_identity_and_original_revision():
    first = forecast_from_normalized(normalized(time=NOW + timedelta(hours=2)))
    second = forecast_from_normalized(
        normalized(time=NOW + timedelta(hours=2, minutes=5), snapshot_id=2)
    )
    assert first.source_key == second.source_key
    assert first.source_record_id == second.source_record_id
    assert first.provider_record_id != second.provider_record_id
    assert second.issued_at is None


def test_kma_issue_cycles_keep_target_identity():
    first = normalized(provider="kma_fixture")
    second = normalized(provider="kma_fixture", snapshot_id=2)
    second["snapshot"]["source_record_id"] = "different-issue-cycle"
    assert (
        forecast_from_normalized(first).source_key
        == forecast_from_normalized(second).source_key
    )


def test_observation_is_not_forecast_and_missing_stays_null():
    source = normalized(height=None)
    record = forecast_from_normalized(source)
    assert (
        record.inputs[0].numeric_value is None and record.inputs[0].state == "missing"
    )
    for metric in source["metrics"]:
        metric["mode"] = "observation"
    assert forecast_from_normalized(source) is None


@pytest.mark.parametrize(
    "code,kind",
    [("1", "high"), ("2", "low"), ("3", "high"), ("4", "low"), ("X", "unknown")],
)
def test_official_extrema_and_midnight(code, kind):
    forecast = {
        **forecast_from_normalized(normalized(code=code)).model_dump(mode="json"),
        "revision_id": 1,
        "previous_revision_id": None,
        "requested_spot_id": 1,
        "reason_codes": [],
        "state": "available",
    }
    event = tide_event(forecast, NOW)
    assert event["kind"] == kind
    assert str(event["local_date"]) == "2026-01-02"
    assert event["seconds_until"] == 3600
    assert event["height"] == 34.0 and event["unit"] == "cm"


def test_cross_midnight_operating_window_requires_evidence():
    window = operating()
    assert window.start_at.astimezone(ZoneInfo("Asia/Seoul")).day == 1
    assert window.end_at.astimezone(ZoneInfo("Asia/Seoul")).day == 2
    assert window_state(window, NOW)[0] == "official_operating_window"
    assert window_state(window, NOW + timedelta(hours=5))[0] == "expired"
    assert window_state(operating(controls_status="unknown"), NOW)[0] == "unknown"
    assert window_state(operating(operating_status="closed"), NOW)[0] == "restricted"
    with pytest.raises(ValidationError):
        operating(control_evidence_refs=[])


def test_evaluation_retains_mapping_lineage_and_rejects_bad_join():
    request = build_request(
        normalized(),
        spot_id=2,
        activity="mudflat",
        mode="forecast",
        now=NOW,
        mapping=mapping(),
    )
    result = evaluate(request)
    assert result.spot_id == 2 and result.inputs[0].spot_id == 1
    assert result.inputs[0].mapping_evidence_ref == "fixture-mapping"
    assert result.score is None and result.assessment_status == "support_unknown"
    with pytest.raises(ValueError, match="requires a reviewed"):
        build_request(
            normalized(), spot_id=2, activity="mudflat", mode="forecast", now=NOW
        )
    with pytest.raises(ValueError, match="Mapping does not cover"):
        build_request(
            normalized(),
            spot_id=2,
            activity="swim",
            mode="forecast",
            now=NOW,
            mapping=mapping(),
        )


def test_reviewed_support_runs_engine_without_promoting_model():
    evidence = SupportEvidence(
        evidence_ref="fixture-support",
        provider="fixture_operator",
        provider_record_id="fixture-open",
        spot_id=1,
        activity="mudflat",
        authority="fixture",
        authoritative=True,
        source_status="active",
        state="current",
        fetched_at=NOW,
        valid_from=NOW,
        valid_until=NOW + timedelta(hours=3),
        status="supported",
        scope="Fixture area",
        mapping_version="fixture-v1",
    )
    authority = AuthorityRecord(
        evidence_id="fixture-authority",
        source_url="https://www.khoa.go.kr/",
        reviewed_by="fixture",
        evidence=evidence,
    )
    result = evaluate(
        build_request(
            normalized(),
            spot_id=1,
            activity="mudflat",
            mode="forecast",
            now=NOW,
            authorities=(authority,),
        )
    )
    assert result.support.status == "supported" and result.safety_status == "unknown"
    assert result.score is None and result.model.validation_status == "not_evaluated"


@pytest.mark.parametrize(
    "url",
    [
        "http://www.khoa.go.kr/",
        "https://evil.example/",
        "https://user:key@www.khoa.go.kr/",
        "https://www.khoa.go.kr/?serviceKey=secret",
    ],
)
def test_unapproved_or_credential_url_is_rejected(url):
    with pytest.raises(ValidationError):
        mapping(source_url=url)


def test_coverage_merges_only_existing_intervals():
    rows = _merge_windows(
        [
            (NOW, NOW + timedelta(hours=1)),
            (NOW + timedelta(minutes=30), NOW + timedelta(hours=2)),
            (NOW + timedelta(hours=3), NOW + timedelta(hours=4)),
        ]
    )
    assert len(rows) == 2 and datetime.fromisoformat(
        rows[0]["end_at"]
    ) == NOW + timedelta(hours=2)


@pytest.mark.parametrize(
    "path",
    [
        "/api/data/water-forecast/forecasts",
        "/api/data/tides/events",
        "/api/data/tides/windows",
    ],
)
def test_invalid_query_rejects_before_database(path):
    app = FastAPI()
    settings = Settings(postgres_password="fixture-only")
    app.include_router(create_forecast_router(settings))
    app.include_router(create_tides_router(settings))
    with TestClient(app) as client:
        query = {
            "spot_id": 1,
            "activity": "mudflat",
            "from": NOW.isoformat(),
            "until": (NOW + timedelta(days=32)).isoformat(),
            "page_size": 101,
        }
        assert client.get(path, params=query).status_code == 422
        assert client.post(path, json={}).status_code == 405


@pytest.mark.parametrize("route", ["assessments", "support", "coverage"])
def test_read_selection_blocks_corrected_mapping_without_evaluation_or_write(route):
    import asyncio
    from unittest.mock import AsyncMock

    from app.water_index.storage import read_projection

    class Cursor:
        def __init__(self, value):
            self.value = value

        async def fetchone(self):
            return self.value

    cutoff = NOW + timedelta(minutes=1)
    manifest = {
        "manifest_id": "fixture-read",
        "payload": {},
        "scope_start_at": NOW,
        "scope_end_at": NOW + timedelta(days=1),
        "read_valid_until": NOW + timedelta(days=1),
    }
    connection = type("ReadOnlyConnection", (), {})()
    connection.execute = AsyncMock(
        side_effect=[Cursor({"id": 1}), Cursor(manifest), Cursor({"changed": True})]
    )
    result = asyncio.run(
        read_projection(
            connection,
            spot_id=1,
            activity="mudflat",
            profile_id="general",
            mode="forecast",
            from_at=NOW,
            until_at=NOW + timedelta(hours=1),
            as_of=cutoff,
            route=route,
        )
    )
    assert result["rows"] == []
    assert result["coverage"]["reason_codes"] == ["station_mapping_changed"]
    calls = connection.execute.await_args_list
    assert all(call.args[0].startswith("SELECT") for call in calls)
    assert calls[-1].args[1] == ["fixture-read", cutoff]
    assert "newer.available_at<=%s" in calls[-1].args[0]
