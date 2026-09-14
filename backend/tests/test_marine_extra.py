from datetime import timedelta
from types import SimpleNamespace

import pytest
from pydantic import SecretStr

from app.ingestion.http import ProviderError
from app.ingestion.marine import source_time
from app.ingestion.marine_extra import (
    MAX_REQUESTS,
    Budget,
    MarineExtraProvider,
    grid_box,
    marine_extra_jobs,
)

NOW = source_time("2025-08-20 12:36")


def settings(**changes):
    values = {
        "data_go_kr_key": SecretStr("unit-test-key%2B"),
        "collection_latitude": 37.804,
        "collection_longitude": 128.908,
        "collection_radius_m": 20000,
        "khoa_tide_station_code": "DT_0006",
        "khoa_current_station_code": "HF_0076",
        "khoa_current_forecast_code": "16LTC10",
    }
    return SimpleNamespace(**(values | changes))


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

    def get_json(self, url, params):
        self.calls.append((url, params))
        result = next(self.responses)
        if isinstance(result, Exception):
            raise result
        return result


def current_row(**changes):
    return {
        "obsvtrNm": "군산항",
        "lot": 126.43002,
        "lat": 36.18873,
        "obsrvnDt": "2025-08-20 10:00",
        "crdir": 232.3,
        "crsp": 76.18,
    } | changes


def tide_rows(**changes):
    return [
        response(
            [
                {
                    "obsvtrNm": "묵호",
                    "lot": 129.11,
                    "lat": 37.55,
                    "predcDt": f"2025-08-{20 + i} 00:00",
                    "tdlvHgt": -23,
                    "crdir": "동",
                    "crsp": 40.07,
                }
                | changes
            ]
        )
        for i in range(7)
    ]


def roms_row(**changes):
    return {
        "predcDt": "2025-08-20 13:00:00",
        "lat": 37.82431,
        "lot": 128.92418,
        "crdir": 38.67,
        "crsp": 0.12,
        "wtem": 21.36,
    } | changes


@pytest.mark.parametrize("kind", ["tide_timeseries", "current_timeseries"])
def test_time_series_seven_explicit_days_preserve_units_and_source_location(kind):
    client = FakeClient(tide_rows())
    batch = MarineExtraProvider(settings(), client, lambda: NOW).fetch(kind)
    assert len(batch.readings) == len(client.calls) == 7
    assert [x[1]["reqDate"] for x in client.calls] == [
        f"202508{20 + i}" for i in range(7)
    ]
    assert all(x[1]["min"] == 60 for x in client.calls)
    assert all(x[1]["numOfRows"] == 100 for x in client.calls)
    assert all(
        x[0].startswith("https://apis.data.go.kr/1192136/") for x in client.calls
    )
    reading = batch.readings[0]
    assert reading.observed_at == source_time("2025-08-20")
    assert reading.valid_until == source_time("2025-08-20 01:00")
    assert reading.issued_at is None
    assert reading.station.latitude == 37.55
    assert reading.station.longitude == 129.11
    assert all(v.mode == "forecast" for r in batch.readings for v in r.values)
    metrics = {v.name: v for v in reading.values}
    if kind == "tide_timeseries":
        assert metrics["tide_level"].unit == "cm"
        assert metrics["tide_level"].numeric_value == -23
        assert reading.station.source_id == "DT_0006"
    else:
        assert metrics["current_speed"].unit == "cm/s"
        assert metrics["current_speed"].numeric_value == 40.07
        assert metrics["current_direction"].unit == "16-point"
        assert metrics["current_direction"].text_value == "동"
        assert metrics["current_direction"].numeric_value is None
        assert reading.station.source_id == "16LTC10"
    assert "unit-test-key" not in batch.model_dump_json()
    assert client.calls[0][1]["serviceKey"] == "unit-test-key+"


def test_time_series_midnight_and_year_rollover_use_target_identity():
    now = source_time("2025-12-31 23:59")
    days = [(now + timedelta(days=i)).date() for i in range(7)]
    client = FakeClient(
        [
            response(
                [{"predcDt": f"{day} 00:00", "lat": 37.55, "lot": 129.11, "tdlvHgt": 1}]
            )
            for day in days
        ]
    )
    batch = MarineExtraProvider(settings(), client, lambda: now).fetch(
        "tide_timeseries"
    )
    assert "2026-01-01T00:00:00+09:00" in batch.readings[1].source_id
    assert client.calls[-1][1]["reqDate"] == "20260106"


def test_tidal_direction_is_never_interpreted_as_degrees():
    batch = MarineExtraProvider(
        settings(), FakeClient(tide_rows(crdir="0")), lambda: NOW
    ).fetch("current_timeseries")
    direction = batch.readings[0].values[1]
    assert direction.numeric_value is None
    assert direction.text_value == "0"
    assert direction.unit == "16-point"


def test_current_discovers_then_pins_actual_time_and_preserves_each_grid_cell():
    row1, row2 = current_row(), current_row(lat=36.199)
    client = FakeClient([response([row1], 2), response([row1, row2])])
    batch = MarineExtraProvider(settings(), client, lambda: NOW).fetch("hf_current")
    assert client.calls[0][1]["numOfRows"] == 1
    assert "reqDate" not in client.calls[0][1]
    assert client.calls[1][1]["reqDate"] == "2025082010"
    assert len(batch.stations) == 2
    assert batch.stations[0].source_id.startswith("derived:HF_0076:grid:")
    assert batch.stations[0].source_id != batch.stations[1].source_id
    assert all(r.observed_at == source_time("2025-08-20 10:00") for r in batch.readings)
    assert all(r.valid_until == source_time("2025-08-20 11:00") for r in batch.readings)
    assert batch.readings[0].values[0].unit == "cm/s"
    assert batch.readings[0].values[1].unit == "degree"
    assert all(v.mode == "observation" for r in batch.readings for v in r.values)


def test_current_provider_revision_keeps_source_identity_without_extending_expiry():
    original, changed = current_row(), current_row(crsp="-9999")
    first = MarineExtraProvider(
        settings(),
        FakeClient([response([original]), response([original])]),
        lambda: NOW,
    ).fetch("hf_current")
    second = MarineExtraProvider(
        settings(),
        FakeClient([response([changed]), response([changed])]),
        lambda: NOW + timedelta(minutes=5),
    ).fetch("hf_current")
    a, b = first.readings[0], second.readings[0]
    assert a.source_id == b.source_id
    assert a.valid_until == b.valid_until
    assert a != b
    assert b.values[0].missing and b.values[0].numeric_value is None
    assert b.values[0].text_value == "-9999"


@pytest.mark.parametrize("raw", [None, "-", "-9999", "NaN", "inf"])
def test_roms_missing_numeric_fields_remain_missing_with_provenance(raw):
    batch = MarineExtraProvider(
        settings(), FakeClient([response([roms_row(wtem=raw)])]), lambda: NOW
    ).fetch("roms")
    metric = batch.readings[0].values[-1]
    assert metric.missing and metric.numeric_value is None
    assert metric.unit == "°C"
    assert batch.readings[0].issued_at is None


def test_roms_units_point_identity_and_bounded_area_from_official_contract():
    client = FakeClient([response([roms_row()])])
    batch = MarineExtraProvider(settings(), client, lambda: NOW).fetch("roms")
    reading = batch.readings[0]
    assert reading.station.source_id == "derived:ROMS:grid:37.82431:128.92418"
    assert reading.station.latitude == 37.82431
    assert [v.unit for v in reading.values] == ["degree", "m/s", "°C"]
    assert all(v.mode == "forecast" for v in reading.values)
    assert reading.valid_until == source_time("2025-08-20 14:00")
    assert reading.issued_at is None
    params = client.calls[0][1]
    assert float(params["ymax"]) - float(params["ymin"]) == pytest.approx(0.1, abs=2e-5)
    assert float(params["xmax"]) - float(params["xmin"]) == pytest.approx(0.1, abs=2e-5)
    small = grid_box(settings(collection_radius_m=100))
    assert small["ymax"] - small["ymin"] < 0.002


def test_roms_request_bounds_do_not_serialize_binary_float_tails():
    client = FakeClient([response([roms_row()])])
    config = settings(
        collection_latitude=37.8034055083,
        collection_longitude=128.9102102476,
    )
    MarineExtraProvider(config, client, lambda: NOW).fetch("roms")
    params = client.calls[0][1]
    assert {k: params[k] for k in ("ymin", "ymax", "xmin", "xmax")} == {
        "ymin": "37.75341",
        "ymax": "37.85340",
        "xmin": "128.86022",
        "xmax": "128.96021",
    }
    assert float(params["ymin"]) >= config.collection_latitude - 0.05
    assert float(params["ymax"]) <= config.collection_latitude + 0.05
    assert float(params["xmin"]) >= config.collection_longitude - 0.05
    assert float(params["xmax"]) <= config.collection_longitude + 0.05


@pytest.mark.parametrize(
    "kind", ["hf_current", "roms", "tide_timeseries", "current_timeseries"]
)
def test_empty_provider_data_never_generates_readings(kind):
    count = 7 if kind.endswith("timeseries") else 1
    batch = MarineExtraProvider(
        settings(), FakeClient([response([])] * count), lambda: NOW
    ).fetch(kind)
    assert not batch.readings and not batch.stations


@pytest.mark.parametrize(
    ("rows", "code"),
    [
        ([roms_row(lat=None)], "MISSING_OR_INVALID_COORDINATE"),
        ([roms_row(lat=999)], "MISSING_OR_INVALID_COORDINATE"),
        ([roms_row(lat=35)], "OUTSIDE_REQUESTED_GRID"),
        ([roms_row(predcDt=None)], "MISSING_SOURCE_TIME"),
        ([roms_row(), roms_row(crsp=9)], "CONFLICTING_PROVIDER_RECORD"),
    ],
)
def test_invalid_or_conflicting_roms_source_fails_the_batch(rows, code):
    with pytest.raises(ProviderError, match=code):
        MarineExtraProvider(
            settings(), FakeClient([response(rows)]), lambda: NOW
        ).fetch("roms")


@pytest.mark.parametrize(
    ("responses", "code"),
    [
        ([response([current_row(obsrvnDt="2025-08-20 13:00")])], "FUTURE_OBSERVATION"),
        ([response([current_row()]), response([])], "INCOMPLETE_SNAPSHOT"),
        (
            [
                response([current_row()]),
                response([current_row(obsrvnDt="2025-08-20 11:00")]),
            ],
            "UNEXPECTED_OBSERVATION_TIME",
        ),
    ],
)
def test_current_snapshot_must_be_consistent(responses, code):
    with pytest.raises(ProviderError, match=code):
        MarineExtraProvider(settings(), FakeClient(responses), lambda: NOW).fetch(
            "hf_current"
        )


def test_time_series_rejects_provider_date_that_does_not_match_requested_date():
    with pytest.raises(ProviderError, match="UNEXPECTED_TARGET_DATE"):
        MarineExtraProvider(
            settings(), FakeClient(tide_rows(predcDt="2025-08-19 00:00")), lambda: NOW
        ).fetch("tide_timeseries")


def test_bounded_pagination_returns_only_5000_rows_and_reports_partial_coverage():
    responses = [
        response(
            [
                roms_row(predcDt=(NOW + timedelta(hours=i * 100 + j)).isoformat())
                for j in range(100)
            ],
            5100,
        )
        for i in range(50)
    ]
    client = FakeClient(responses)
    rows, coverage = MarineExtraProvider(settings(), client)._rows(
        "roms", grid_box(settings()), Budget()
    )
    assert len(rows) == 5000 and coverage == "bounded"
    assert len(client.calls) == 50
    assert client.calls[-1][1]["pageNo"] == 50


@pytest.mark.parametrize(
    "failure", ["unstable", "repeated", "short", "oversize", "empty"]
)
def test_pagination_never_claims_success_with_inconsistent_pages(failure):
    part = [
        roms_row(predcDt=(NOW + timedelta(hours=i)).isoformat()) for i in range(100)
    ]
    scenarios = {
        "unstable": ([response(part, 201), response(part, 200)], "UNSTABLE_PAGINATION"),
        "repeated": ([response(part, 201), response(part, 201)], "REPEATED_PAGE"),
        "short": ([response(part[:1], 201)], "INCOMPLETE_PAGINATION"),
        "oversize": ([response(part + part[:1])], "PAGE_LIMIT_EXCEEDED"),
        "empty": ([response([], 201)], "INCOMPLETE_PAGINATION"),
    }
    responses, code = scenarios[failure]
    with pytest.raises(ProviderError, match=code):
        MarineExtraProvider(settings(), FakeClient(responses))._rows(
            "roms", {}, Budget()
        )


def test_provider_errors_and_missing_credentials_do_not_create_empty_success():
    with pytest.raises(ProviderError, match="PROVIDER_30"):
        MarineExtraProvider(
            settings(), FakeClient([{"response": {"header": {"resultCode": "30"}}}])
        ).fetch("roms")
    with pytest.raises(ProviderError, match="NETWORK_ERROR"):
        MarineExtraProvider(
            settings(), FakeClient([ProviderError("NETWORK_ERROR")])
        ).fetch("roms")
    with pytest.raises(ProviderError, match="MISSING_CREDENTIAL"):
        MarineExtraProvider(
            settings(data_go_kr_key=SecretStr("")), FakeClient([])
        ).fetch("roms")


def test_scheduler_jobs_are_separate_and_respect_missing_key():
    jobs = marine_extra_jobs(settings())
    assert {j.name for j in jobs} == {
        "khoa_tide_timeseries",
        "khoa_hf_current",
        "khoa_current_timeseries",
        "khoa_roms",
    }
    assert all(j.enabled and j.fetch and j.process is None for j in jobs)
    assert next(j for j in jobs if j.name == "khoa_hf_current").interval_seconds == 3600
    assert not any(
        j.enabled for j in marine_extra_jobs(settings(data_go_kr_key=SecretStr("")))
    )
    budget = Budget()
    for _ in range(MAX_REQUESTS):
        budget.take()
    with pytest.raises(ProviderError, match="REQUEST_BUDGET_EXCEEDED"):
        budget.take()


def test_unknown_service_is_never_used_as_an_arbitrary_endpoint():
    with pytest.raises(ProviderError, match="UNSUPPORTED_SERVICE"):
        MarineExtraProvider(settings(), FakeClient([])).fetch("https://example.com")
