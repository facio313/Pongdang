from datetime import datetime
from types import SimpleNamespace

import pytest
from pydantic import SecretStr

from app.ingestion.http import ProviderError
from app.ingestion.marine import (
    KST,
    MarineProvider,
    RequestBudget,
    marine_jobs,
    source_time,
    unpack,
    value,
)

NOW = datetime(2025, 8, 20, 10, 5, tzinfo=KST)


def settings(**changes):
    return SimpleNamespace(
        data_go_kr_key=SecretStr("unit-test-key%2B"),
        collection_latitude=37.8,
        collection_longitude=128.9,
        collection_radius_m=20000,
        **changes,
    )


def response(rows, total=None):
    return {
        "response": {
            "header": {"resultCode": "00"},
            "body": {
                "totalCount": len(rows) if total is None else total,
                "items": {"item": rows},
            },
        }
    }


class FakeClient:
    def __init__(self, responses):
        self.responses = iter(responses)
        self.calls = []

    def get_json(self, url, params=None):
        self.calls.append((url, params))
        result = next(self.responses)
        if isinstance(result, Exception):
            raise result
        return result


def row(**changes):
    return {
        "obsvtrNm": "경포대해수욕장",
        "lat": 37.80897,
        "lot": 128.93188,
        "obsrvnDt": "2025-08-20 10:00",
        "wtem": 23.18,
        **changes,
    }


@pytest.mark.parametrize(
    ("kind", "unit"), [("tide_recent", "m/s"), ("buoy_recent", "cm/s")]
)
def test_provider_specific_current_units_and_no_source_relocation(kind, unit):
    client = FakeClient([response([row(crsp=19.9, lat=37.55, lot=129.11)])])
    batch = MarineProvider(settings(), client, lambda: NOW).fetch(kind)
    reading = batch.readings[0]
    metric = next(v for v in reading.values if v.name == "current_speed")
    assert metric.numeric_value == 19.9
    assert metric.unit == unit
    assert reading.station.latitude == 37.55
    assert reading.observed_at == source_time("2025-08-20 10:00")
    assert reading.valid_until == source_time("2025-08-20 10:30")
    assert client.calls[0][1]["serviceKey"] == "unit-test-key+"
    assert "unit-test-key" not in batch.model_dump_json()


def test_survey_splits_actual_and_predicted_tide_and_preserves_negative_level():
    client = FakeClient([response([row(bscTdlvHgt=-99, tdlvHgt=-88)])])
    batch = MarineProvider(settings(), client, lambda: NOW).fetch("tide_level")
    actual, predicted = batch.readings
    assert next(v for v in actual.values if v.name == "tide_level").numeric_value == -99
    assert predicted.values[0].mode == "forecast"
    assert predicted.values[0].numeric_value == -88
    assert predicted.issued_at is None
    assert predicted.source_id != actual.source_id


def test_future_actual_is_not_accepted_as_an_observation():
    client = FakeClient(
        [response([row(obsrvnDt="2025-08-20 11:00", bscTdlvHgt=3, tdlvHgt=7)])]
    )
    batch = MarineProvider(settings(), client, lambda: NOW).fetch("tide_level")
    assert len(batch.readings) == 1
    assert all(v.mode == "forecast" for v in batch.readings[0].values)


def test_midnight_fallback_keeps_old_observation_time_and_expiry():
    now = source_time("2025-08-20 00:01")
    client = FakeClient([response([]), response([row(obsrvnDt="2025-08-19 23:50")])])
    batch = MarineProvider(settings(), client, lambda: now).fetch("waves")
    assert [c[1]["reqDate"] for c in client.calls] == ["20250820", "20250819"]
    assert batch.readings[0].observed_at.day == 19
    assert batch.readings[0].valid_until == source_time("2025-08-20 00:20")


def test_activity_forecast_keeps_grade_skill_halfday_and_unknown_issue_time():
    client = FakeClient(
        [
            response(
                [
                    {
                        "surfPlcNm": "경포",
                        "lat": 37.8,
                        "lot": 128.9,
                        "predcYmd": "2025-08-21",
                        "predcNoonSeCd": "오후",
                        "grdCn": "초급",
                        "avgWtem": "-",
                        "totalIndex": "매우나쁨",
                    }
                ]
            )
        ]
    )
    batch = MarineProvider(settings(), client, lambda: NOW).fetch("surfing")
    r = batch.readings[0]
    metrics = {v.name: v for v in r.values}
    assert r.observed_at.hour == 12
    assert r.valid_until == source_time("2025-08-22")
    assert r.issued_at is None
    assert metrics["water_temperature"].numeric_value is None
    assert metrics["water_temperature"].text_value == "-"
    assert metrics["official_activity_grade"].text_value == "매우나쁨"
    assert all(v.mode == "forecast" for v in r.values)
    assert r.station.source_id.startswith("named-")


def test_activity_does_not_map_unknown_or_far_coordinates_to_collection_point():
    rows = [
        {
            "bbchNm": "다른 해변",
            "lat": 35.0,
            "lot": 126.5,
            "predcYmd": "2025-08-21",
            "totalIndex": "좋음",
        },
        {"bbchNm": "위치 없음", "predcYmd": "2025-08-21", "totalIndex": "좋음"},
    ]
    batch = MarineProvider(settings(), FakeClient([response(rows)]), lambda: NOW).fetch(
        "beach"
    )
    assert not batch.readings


def test_extrema_seven_days_are_forecast_events_with_original_codes():
    responses = [
        response(
            [
                {
                    "obsvtrNm": "묵호",
                    "lat": 37.55,
                    "lot": 129.11,
                    "predcDt": f"2025-08-{20 + i} 04:21",
                    "predcTdlvVl": 121,
                    "extrSe": "1",
                }
            ]
        )
        for i in range(7)
    ]
    client = FakeClient(responses)
    batch = MarineProvider(settings(), client, lambda: NOW).fetch("tide_extrema")
    assert len(client.calls) == len(batch.readings) == 7
    assert batch.readings[-1].observed_at.day == 26
    assert batch.readings[0].values[1].text_value == "1"
    assert batch.readings[0].issued_at is None


def test_pagination_is_complete_and_bounded():
    client = FakeClient(
        [response([row()], 2), response([row(obsrvnDt="2025-08-20 09:50")], 2)]
    )
    batch = MarineProvider(settings(), client, lambda: NOW).fetch("waves")
    assert len(batch.readings) == 2
    assert [c[1]["pageNo"] for c in client.calls] == [1, 2]
    client = FakeClient([response([row()], 99999)] * 10)
    with pytest.raises(ProviderError, match="REQUEST_BUDGET_EXCEEDED"):
        MarineProvider(settings(), client, lambda: NOW)._rows(
            "waves", {}, RequestBudget()
        )
    assert len(client.calls) == 10


def test_conflicting_duplicate_record_does_not_return_success_batch():
    client = FakeClient([response([row(), row(wtem=25)])])
    with pytest.raises(ProviderError, match="CONFLICTING_PROVIDER_RECORD"):
        MarineProvider(settings(), client, lambda: NOW).fetch("waves")


@pytest.mark.parametrize(
    "payload",
    [
        {"OpenAPI_ServiceResponse": {"cmmMsgHeader": {"returnReasonCode": "30"}}},
        {"header": {"resultCode": "10"}},
        {"body": {"items": []}},
    ],
)
def test_provider_failure_is_not_empty_success(payload):
    with pytest.raises(ProviderError):
        unpack(payload)


def test_only_verified_services_have_jobs_and_missing_key_disables_them():
    s = settings()
    s.data_go_kr_key = SecretStr("")
    jobs = marine_jobs(s)
    assert len(jobs) == 10
    assert not any(j.enabled for j in jobs)
    assert not any(
        any(word in j.name for word in ("hf_current", "roms", "tide_time"))
        for j in jobs
    )


def test_missing_numeric_preserves_evidence_and_nonfinite_never_serializes():
    for raw in (None, "", "-", "-9999", "NaN", "inf"):
        v = value("water_temperature", raw, "°C")
        assert v.numeric_value is None
        assert v.missing
    assert value("tide_level", -99).numeric_value == -99
    assert not value("official_activity_grade", "매우나쁨").missing


def test_tide_time_correction_uses_stable_official_event_slot():
    outputs = []
    for time in ("2025-08-20 11:00", "2025-08-20 11:04", "2025-08-20 11:00"):
        client = FakeClient(
            [
                response([row(predcDt=time, predcTdlvVl=34, extrSe=1)]),
                *[response([]) for _ in range(6)],
            ]
        )
        outputs.append(
            MarineProvider(settings(), client, lambda: NOW)
            .fetch("tide_extrema")
            .readings[0]
        )
    assert outputs[0].source_id == outputs[1].source_id == outputs[2].source_id
    assert outputs[0].observed_at != outputs[1].observed_at
    assert outputs[0] == outputs[2]


def test_two_official_afternoon_lows_remain_two_distinct_ordered_events():
    # Minimal isolated regression for an actual provider code boundary: both low
    # tides can occur after noon, so AM/PM code alone is not an event identifier.
    client = FakeClient(
        [
            response(
                [
                    row(predcDt="2025-08-20 23:51", predcTdlvVl=25, extrSe=4),
                    row(predcDt="2025-08-20 12:44", predcTdlvVl=30, extrSe=4),
                ]
            ),
            *[response([]) for _ in range(6)],
        ]
    )
    batch = MarineProvider(settings(), client, lambda: NOW).fetch("tide_extrema")
    assert len(batch.readings) == 2
    assert batch.adapter_version == "tide-event-slots.2"
    assert batch.readings[0].source_id.startswith("derived:")
    assert batch.readings[0].source_id.endswith(":low:1")
    assert batch.readings[1].source_id.endswith(":low:2")
    assert batch.readings[0].observed_at < batch.readings[1].observed_at
    assert [r.values[1].text_value for r in batch.readings] == ["4", "4"]
