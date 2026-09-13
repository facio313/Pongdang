from datetime import datetime, timedelta
from types import SimpleNamespace

import pytest
from pydantic import SecretStr

from app.ingestion import weather
from app.ingestion.http import ProviderError

NOW = datetime(2024, 9, 13, 23, 57, tzinfo=weather.KST)


def settings(public="test-public", hub="test-hub", stations="516"):
    return SimpleNamespace(
        data_go_kr_key=SecretStr(public),
        kma_api_hub_key=SecretStr(hub),
        collection_latitude=37.5665,
        collection_longitude=126.978,
        aws_stations=stations,
    )


def payload(items, total=None):
    return {
        "response": {
            "header": {"resultCode": "00"},
            "body": {
                "totalCount": len(items) if total is None else total,
                "items": {"item": items},
            },
        }
    }


@pytest.fixture
def clock(monkeypatch):
    monkeypatch.setattr(weather, "_now", lambda: NOW)


def mock_json(monkeypatch, answers):
    calls = []
    answers = iter(answers)

    def get_json(self, url, params=None, headers=None):
        calls.append((url, params))
        answer = next(answers)
        if isinstance(answer, Exception):
            raise answer
        return answer

    monkeypatch.setattr(weather.Client, "get_json", get_json)
    return calls


def job(name, config=None):
    return next(j for j in weather.weather_jobs(config or settings()) if j.name == name)


def test_grid_matches_kma_seoul_reference():
    assert weather.grid_coordinates(37.5665, 126.978) == (60, 127)


def test_issue_time_crosses_kst_date_with_publication_delay():
    early = datetime(2024, 9, 14, 0, 20, tzinfo=weather.KST)
    assert weather._issue(early, "short_forecast") == datetime(
        2024, 9, 13, 23, tzinfo=weather.KST
    )
    assert weather._issue(early, "ultra_forecast") == datetime(
        2024, 9, 13, 22, 30, tzinfo=weather.KST
    )
    assert weather._issue(early, "mid_forecast") == datetime(
        2024, 9, 13, 18, tzinfo=weather.KST
    )


def test_missing_keys_keep_disabled_jobs_and_do_not_fetch(monkeypatch):
    def unexpected(*args, **kwargs):
        pytest.fail("HTTP called while constructing disabled jobs")

    monkeypatch.setattr(weather.Client, "get_json", unexpected)
    jobs = weather.weather_jobs(settings(public="", hub=""))
    assert len(jobs) == 7
    assert all(not j.enabled for j in jobs)
    with pytest.raises(ProviderError, match="MISSING_CREDENTIAL"):
        jobs[0].fetch()


def test_forecast_preserves_issue_target_range_and_missing(clock, monkeypatch):
    base = {
        "baseDate": "20240913",
        "baseTime": "2000",
        "fcstDate": "20240914",
        "fcstTime": "0100",
        "nx": 60,
        "ny": 127,
    }
    calls = mock_json(
        monkeypatch,
        [
            payload(
                [
                    {**base, "category": "TMP", "fcstValue": "-999"},
                    {**base, "category": "PCP", "fcstValue": "1.0mm 미만"},
                    {**base, "category": "WSD", "fcstValue": "2.4"},
                ]
            )
        ],
    )
    batch = job("kma_short_forecast", settings(public="a%2Bb%3D")).fetch()
    reading = batch.readings[0]
    assert reading.issued_at == datetime(2024, 9, 13, 20, tzinfo=weather.KST)
    assert reading.observed_at == datetime(2024, 9, 14, 1, tzinfo=weather.KST)
    assert reading.valid_until == reading.observed_at + timedelta(hours=1)
    values = {v.name: v for v in reading.values}
    assert values["air_temperature"].numeric_value is None
    assert values["air_temperature"].text_value == "TMP=-999"
    assert values["air_temperature"].missing
    assert values["precipitation"].numeric_value is None
    assert values["precipitation"].text_value == "PCP=1.0mm 미만"
    assert not values["precipitation"].missing
    assert values["wind_speed"].numeric_value == 2.4
    assert all(v.mode == "forecast" for v in reading.values)
    assert calls[0][1]["serviceKey"] == "a+b="
    assert calls[0][1]["base_time"] == "2000"
    assert reading.station.latitude is None


def test_nowcast_validity_uses_observation_not_fetch(clock, monkeypatch):
    mock_json(
        monkeypatch,
        [
            payload(
                [
                    {
                        "baseDate": "20240913",
                        "baseTime": "1800",
                        "nx": 60,
                        "ny": 127,
                        "category": "T1H",
                        "obsrValue": "18.5",
                    }
                ]
            )
        ],
    )
    reading = job("kma_nowcast").fetch().readings[0]
    assert reading.valid_until < NOW
    assert reading.issued_at is None
    assert reading.values[0].mode == "observation"


def test_duplicate_source_metric_rejected(clock, monkeypatch):
    row = {
        "baseDate": "20240913",
        "baseTime": "2100",
        "nx": 60,
        "ny": 127,
        "category": "T1H",
        "obsrValue": "18",
    }
    mock_json(monkeypatch, [payload([row, {**row, "obsrValue": "19"}])])
    with pytest.raises(ProviderError, match="DUPLICATE_SOURCE_METRIC"):
        job("kma_nowcast").fetch()


def test_provider_failure_propagates_without_batch(clock, monkeypatch):
    mock_json(monkeypatch, [ProviderError("HTTP_403")])
    with pytest.raises(ProviderError, match="HTTP_403"):
        job("kma_nowcast").fetch()


def test_pagination_finishes_and_rejects_silent_truncation(monkeypatch):
    calls = mock_json(monkeypatch, [payload([{"n": 1}], 2), payload([{"n": 2}], 2)])
    result = weather._paged(weather.Client(), "test", {}, page_size=1, max_pages=2)
    assert result == [{"n": 1}, {"n": 2}]
    assert [p["pageNo"] for _, p in calls] == [1, 2]
    mock_json(monkeypatch, [payload([{"n": 1}], 2)])
    with pytest.raises(ProviderError, match="PAGINATION_LIMIT"):
        weather._paged(weather.Client(), "test", {}, page_size=1, max_pages=1)


def test_empty_success_is_empty_evidence(clock, monkeypatch):
    mock_json(monkeypatch, [payload([])])
    assert job("kma_nowcast").fetch().readings == []


def test_mid_outlook_text_is_preserved_without_invented_daily_forecasts(
    clock, monkeypatch
):
    text = "기상 전망 자료 " * 90
    calls = mock_json(monkeypatch, [payload([{"wfSv": text}])])
    batch = job("kma_mid_forecast").fetch()
    reading = batch.readings[0]
    assert "".join(v.text_value for v in reading.values) == text.strip()
    assert all(v.numeric_value is None and v.mode == "forecast" for v in reading.values)
    assert reading.issued_at == datetime(2024, 9, 13, 18, tzinfo=weather.KST)
    assert calls[0][1]["tmFc"] == "202409131800"


def test_historical_warning_is_bulletin_not_active(clock, monkeypatch):
    mock_json(
        monkeypatch,
        [
            payload(
                [
                    {
                        "title": "풍랑주의보 해제",
                        "stnId": "108",
                        "tmSeq": 77,
                        "tmFc": 202409110600,
                    }
                ]
            )
        ],
    )
    warning = job("kma_warnings").fetch().warnings[0]
    assert warning.title == "풍랑주의보 해제"
    assert warning.issued_at == datetime(2024, 9, 11, 6, tzinfo=weather.KST)
    assert warning.status == "bulletin"
    assert warning.effective_at is None
    assert ":202409:77:" in warning.source_id


AWS = """#START7777
# YYMMDDHHMI STN WD1 WS1 TA RE HM
# KST ID deg m/s C 1 %
202409132357 516 109.0 0.6 18.0 -99.9 82.1
#7777END
"""


def test_aws_current_query_preserves_missing_and_station_scope(clock, monkeypatch):
    calls = []

    def get_text(self, url, params=None, headers=None):
        calls.append((url, params))
        return AWS

    monkeypatch.setattr(weather.Client, "get_text", get_text)
    batch = job("kma_aws").fetch()
    reading = batch.readings[0]
    values = {v.name: v for v in reading.values}
    assert calls[0][1]["tm2"] == 0
    assert calls[0][1]["stn"] == "516"
    assert values["air_temperature"].numeric_value == 18.0
    assert values["precipitation_detection"].numeric_value is None
    assert values["precipitation_detection"].text_value == "RE=-99.9"
    assert values["precipitation_detection"].missing
    assert reading.valid_until == NOW + timedelta(minutes=20)
    assert reading.station.latitude is None


@pytest.mark.parametrize("text", ["#START7777\n", AWS.replace(" 18.0", "")])
def test_partial_hub_response_cannot_create_success_batch(clock, monkeypatch, text):
    monkeypatch.setattr(weather.Client, "get_text", lambda *a, **kw: text)
    with pytest.raises(ProviderError):
        job("kma_aws").fetch()


def test_hub_rejects_unrequested_station(clock, monkeypatch):
    monkeypatch.setattr(weather.Client, "get_text", lambda *a, **kw: AWS)
    with pytest.raises(ProviderError, match="UNEXPECTED_HUB_STATION"):
        job("kma_aws", settings(stations="517")).fetch()


def test_station_configuration_bounds_network_requests(clock, monkeypatch):
    def unexpected(*args, **kwargs):
        pytest.fail("Invalid station configuration must fail before HTTP")

    monkeypatch.setattr(weather.Client, "get_text", unexpected)
    with pytest.raises(ProviderError, match="INVALID_STATION_CONFIGURATION"):
        job(
            "kma_aws", settings(stations=",".join(str(n) for n in range(100, 111)))
        ).fetch()


def test_buoy_preserves_original_measurement_time_and_wave_units(clock, monkeypatch):
    text = """#START7777
# YYMMDDHHMI STN WD1 WS1 TA TW WH_SIG WP WO
# KST ID deg m/s C C m sec deg
202409132130 22105 196 3.3 19.5 22.1 0.7 6.2 42
#7777END
"""
    monkeypatch.setattr(weather.Client, "get_text", lambda *a, **kw: text)
    reading = job("kma_buoy").fetch().readings[0]
    values = {v.name: v for v in reading.values}
    assert reading.station.source_id == "22105"
    assert values["wave_height"].numeric_value == 0.7
    assert values["wave_height"].unit == "m"
    assert values["wave_period"].unit == "s"
    assert reading.valid_until == datetime(2024, 9, 13, 23, tzinfo=weather.KST)


@pytest.mark.parametrize("raw", [None, "", " ", "-999", "-998", "-9999", "NaN"])
def test_missing_source_values_remain_explicit_even_with_raw_text(raw):
    value = weather._value("TMP", raw, weather.CATEGORIES, "forecast")
    assert value.missing
    assert value.numeric_value is None
    assert value.text_value.startswith("TMP=")


@pytest.mark.parametrize("raw", ["강수없음", "1.0mm 미만", "30.0~50.0mm", "0"])
def test_valid_precipitation_text_is_not_marked_missing(raw):
    value = weather._value("PCP", raw, weather.CATEGORIES, "forecast")
    assert not value.missing
    assert value.text_value == "PCP=" + raw


def test_buoy_repeated_display_headers_preserve_each_wind_and_wave(clock, monkeypatch):
    text = """#START7777
# YYMMDDHHMI STN WD1 WS1 WS1 WD2 WS2 WS2 PA HM TA TW WH WH WH WP WO
# KST ID deg m/s GST deg m/s GST hPa % C C MAX SIG AVE sec deg
202409132130 22105 196 3.3 4.1 195 3.2 4.0 1010 82 19.5 22.1 1.0 0.7 0.5 6.2 42
#7777END
"""
    monkeypatch.setattr(weather.Client, "get_text", lambda *a, **kw: text)
    values = {v.name: v for v in job("kma_buoy").fetch().readings[0].values}
    assert values["wind_speed"].numeric_value == 3.3
    assert values["gust_speed"].numeric_value == 4.1
    assert values["wind_speed_sensor2"].numeric_value == 3.2
    assert values["gust_speed_sensor2"].numeric_value == 4.0
    assert values["maximum_wave_height"].numeric_value == 1.0
    assert values["wave_height"].numeric_value == 0.7
    assert values["average_wave_height"].numeric_value == 0.5


def test_unknown_duplicate_header_cannot_silently_overwrite_values():
    text = "#START7777\n# YYMMDDHHMI STN TA TA\n202409132130 516 18 20\n#7777END\n"
    with pytest.raises(ProviderError, match="AMBIGUOUS_HUB_COLUMNS"):
        weather._hub_rows(text)
