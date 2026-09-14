"""Contract fixtures use documented shapes; no real credentials or upstream."""

from copy import deepcopy
from datetime import datetime, timedelta
from types import SimpleNamespace
from xml.etree import ElementTree

import pytest
from pydantic import SecretStr, ValidationError

from app.ingestion import environment as env
from app.ingestion.http import ProviderError

NOW = datetime(2024, 9, 14, 12, 30, tzinfo=env.KST)


def settings(**overrides):
    return SimpleNamespace(
        **{
            "data_go_kr_key": SecretStr("test%2Bkey%3D"),
            "air_quality_station_names": "종로구",
            "astronomy_location": "서울",
            "uv_area_code": "1100000000",
            "forecast_zone_code": "11A00101",
            **overrides,
        }
    )


def job(name, config=None):
    return next(j for j in env.environment_jobs(config or settings()) if j.name == name)


def payload(rows, count=None):
    return {
        "response": {
            "header": {"resultCode": "00"},
            "body": {
                "items": rows,
                "totalCount": len(rows) if count is None else count,
            },
        }
    }


def station(name="종로구", **overrides):
    return {
        "stationName": name,
        "addr": "서울 종로구",
        "dmX": "37.572025",
        "dmY": "127.005028",
        "year": "1997",
        "mangName": "도시대기",
        "item": "SO2, CO, O3, NO2, PM10, PM2.5",
        **overrides,
    }


def observation(**overrides):
    return {
        "dataTime": "2024-09-14 12:00",
        "so2Value": "0.007",
        "coValue": "0.4",
        "o3Value": "0.043",
        "no2Value": "0.024",
        "pm10Value": "0",
        "pm25Value": "-",
        "pm10Value24": "12",
        "pm25Value24": "-",
        "pm25Flag": "장비점검",
        "khaiValue": "75",
        "khaiGrade": "2",
        "mangName": "도시대기",
        **overrides,
    }


def uv(**overrides):
    return {
        "areaNo": "1100000000",
        "date": "2024091409",
        "code": "A07",
        **{f"h{h}": "0" if h == 0 else "3" for h in range(0, 76, 3)},
        **overrides,
    }


def astronomy(**overrides):
    return {
        "location": "서울",
        "locdate": "20240914",
        "latitude": "3734",
        "longitude": "12658",
        "latitudeNum": "37.566666",
        "longitudeNum": "126.966666",
        **{k: "0613" for k in env.EVENTS},
        "sunset": "1842",
        "moonset": "----",
        **overrides,
    }


def xml_payload(rows):
    root = ElementTree.Element("response")
    header = ElementTree.SubElement(root, "header")
    ElementTree.SubElement(header, "resultCode").text = "00"
    body = ElementTree.SubElement(root, "body")
    ElementTree.SubElement(body, "totalCount").text = str(len(rows))
    items = ElementTree.SubElement(body, "items")
    for row in rows:
        item = ElementTree.SubElement(items, "item")
        for key, value in row.items():
            ElementTree.SubElement(item, key).text = value
    return ElementTree.tostring(root, encoding="unicode")


@pytest.fixture(autouse=True)
def clock(monkeypatch):
    monkeypatch.setattr(env, "_now", lambda: NOW)


def mock_json(monkeypatch, answers):
    calls = []
    iterator = iter(answers)

    def get_json(self, url, params=None, headers=None):
        calls.append((url, params))
        result = next(iterator)
        if isinstance(result, Exception):
            raise result
        return result

    monkeypatch.setattr(env.Client, "get_json", get_json)
    return calls


def test_jobs_are_quota_bounded_and_construct_without_fetch(monkeypatch):
    def unexpected(*args, **kwargs):
        pytest.fail("network invoked during job construction")

    monkeypatch.setattr(env.Client, "get_json", unexpected)
    jobs = env.environment_jobs(settings(data_go_kr_key=SecretStr("")))
    assert len(jobs) == 5 and all(not j.enabled for j in jobs)
    assert job("airkorea_observations").interval_seconds == 3600
    assert 86400 // job("airkorea_observations").interval_seconds * 10 < 500
    with pytest.raises(ProviderError, match="MISSING_CREDENTIAL"):
        jobs[0].fetch()


def test_air_catalog_keeps_identity_coordinates_without_fake_observation(monkeypatch):
    calls = mock_json(monkeypatch, [payload([station()])])
    result = job("airkorea_stations").fetch()
    assert result.catalog_only and result.readings == []
    assert result.provider == "AIRKOREA"
    assert result.stations[0].source_id == "종로구"
    assert result.stations[0].latitude == 37.572025
    assert result.stations[0].longitude == 127.005028
    assert result.stations[0].kind == "air_quality_station"
    assert result.stations[0].datum == "WGS84"
    assert calls[0][1]["serviceKey"] == "test+key="


def test_air_values_units_flags_forecast_distinction_and_hourly_expiry(monkeypatch):
    calls = mock_json(monkeypatch, [payload([station()]), payload([observation()])])
    result = job("airkorea_observations").fetch()
    r = result.readings[0]
    assert r.station == result.stations[0]
    assert r.source_id == "종로구/2024-09-14 12:00"
    assert r.observed_at == NOW.replace(minute=0)
    assert r.issued_at is None
    assert r.valid_until == NOW.replace(hour=13, minute=0)
    assert r.spatial_scope == "airkorea:stationName=종로구"
    values = {v.name: v for v in r.values}
    assert values["pm10"].numeric_value == 0 and not values["pm10"].missing
    assert values["pm10"].unit == "ug/m3"
    assert values["ozone"].numeric_value == 0.043
    assert values["ozone"].unit == "ppm"
    assert values["pm25"].missing and values["pm25"].numeric_value is None
    assert "장비점검" in values["pm25"].text_value
    assert values["pm10_24h_predicted_moving"].mode == "forecast"
    assert values["pm10"].mode == "observation"
    assert calls[1][1]["dataTerm"] == "DAILY"


def test_air_flag_invalidates_even_numeric_measurement(monkeypatch):
    mock_json(
        monkeypatch,
        [
            payload([station()]),
            payload([observation(pm10Value="12", pm10Flag="자료이상")]),
        ],
    )
    values = job("airkorea_observations").fetch().readings[0].values
    value = next(v for v in values if v.name == "pm10")
    assert value.numeric_value is None and value.missing
    assert value.text_value == "pm10Value=12; flag=자료이상"


def test_air_midnight_and_stale_values_do_not_extend_to_fetch(monkeypatch):
    mock_json(
        monkeypatch,
        [payload([station()]), payload([observation(dataTime="2024-09-13 24:00")])],
    )
    r = job("airkorea_observations").fetch().readings[0]
    assert r.observed_at == NOW.replace(hour=0, minute=0)
    assert r.valid_until < NOW


@pytest.mark.parametrize(
    "change, message",
    [
        ({"dataTime": "yesterday"}, "INVALID_SOURCE_TIME"),
        ({"pm10Value": "NaN"}, "INVALID_SOURCE_NUMBER"),
        ({"pm10Value": "many"}, "INVALID_SOURCE_NUMBER"),
        ({"pm10Value": -1}, "INVALID_SOURCE_NUMBER"),
        ({"stationName": "제주"}, "SOURCE_SCOPE_MISMATCH"),
    ],
)
def test_air_malformed_records_fail_atomic_batch(monkeypatch, change, message):
    mock_json(
        monkeypatch,
        [payload([station()]), payload([observation(), observation(**change)])],
    )
    with pytest.raises(ProviderError, match=message):
        job("airkorea_observations").fetch()


def test_air_future_observation_rejected(monkeypatch):
    mock_json(
        monkeypatch,
        [payload([station()]), payload([observation(dataTime="2024-09-15 01:00")])],
    )
    with pytest.raises(ValidationError, match="Observed time cannot be in the future"):
        job("airkorea_observations").fetch()


@pytest.mark.parametrize(
    "names", ["", "종로구,", "종로구,종로구", ",".join(str(n) for n in range(11))]
)
def test_air_rejects_empty_duplicate_or_quota_exceeding_scope(names):
    with pytest.raises(ProviderError, match="INVALID_AIR_STATION_SCOPE"):
        job("airkorea_stations", settings(air_quality_station_names=names)).fetch()


def test_catalog_missing_measurement_station_fails_instead_of_inventing_metadata(
    monkeypatch,
):
    mock_json(monkeypatch, [payload([station("종로1가")])])
    with pytest.raises(ProviderError, match="AIR_STATION_NOT_FOUND"):
        job("airkorea_observations").fetch()


def test_air_ambiguous_station_name_fails(monkeypatch):
    mock_json(monkeypatch, [payload([station(), station(addr="다른 주소")])])
    with pytest.raises(ProviderError, match="AMBIGUOUS_AIR_STATION"):
        job("airkorea_stations").fetch()


def test_air_conflicting_source_records_rejected(monkeypatch):
    mock_json(
        monkeypatch,
        [payload([station()]), payload([observation(), observation(pm10Value="30")])],
    )
    with pytest.raises(ValidationError, match="Conflicting source record"):
        job("airkorea_observations").fetch()


@pytest.mark.parametrize(
    "bad", [payload([], 2), payload([{}], "broken"), {"response": {}}, payload("wrong")]
)
def test_incomplete_or_malformed_pages_fail(bad):
    with pytest.raises(ProviderError):
        env._items(bad)


def test_item_dict_and_empty_data_are_valid():
    assert env._items(payload({"item": {"code": "a"}}, 1)) == [{"code": "a"}]
    assert env._items(payload([])) == []
    assert env._items({"response": {"header": {"resultCode": "03"}}}) == []


def test_no_data_code_cannot_hide_returned_records():
    bad = payload([{"code": "a"}])
    bad["response"]["header"]["resultCode"] = "03"
    with pytest.raises(ProviderError, match="INCONSISTENT_SOURCE_COUNT"):
        env._items(bad)


def test_nested_empty_no_data_is_valid():
    empty = payload({"item": []}, 0)
    empty["response"]["header"]["resultCode"] = "03"
    assert env._items(empty) == []


def test_provider_failure_propagates_without_returning_catalog_as_success(monkeypatch):
    mock_json(monkeypatch, [payload([station()]), ProviderError("HTTP_403")])
    with pytest.raises(ProviderError, match="HTTP_403"):
        job("airkorea_observations").fetch()


@pytest.mark.parametrize("coords", [{"lat": 37.966099, "lon": 124.630447}, {}])
def test_forecast_zone_catalog_never_fabricates_observation(monkeypatch, coords):
    mock_json(
        monkeypatch,
        [
            payload(
                [
                    {
                        "regId": "11A00101",
                        "regName": "백령도",
                        "regUp": "11A00000",
                        **coords,
                    }
                ]
            )
        ],
    )
    batch = job("kma_forecast_zones").fetch()
    assert batch.catalog_only and batch.readings == []
    assert batch.stations[0].source_id == "11A00101"
    assert batch.stations[0].latitude == coords.get("lat")
    assert batch.stations[0].name == "백령도"


def test_forecast_zone_wrong_scope_rejected(monkeypatch):
    mock_json(monkeypatch, [payload([{"regId": "11B10101", "regName": "서울"}])])
    with pytest.raises(ProviderError, match="SOURCE_SCOPE_MISMATCH"):
        job("kma_forecast_zones").fetch()


def test_forecast_zone_preserves_source_applicability_without_reading(monkeypatch):
    mock_json(
        monkeypatch,
        [
            payload(
                [
                    {
                        "regId": "11A00101",
                        "regName": "백령도",
                        "tmSt": "201004300900",
                        "tmEd": "210012310900",
                    }
                ]
            )
        ],
    )
    batch = job("kma_forecast_zones").fetch()
    assert batch.readings == []
    assert batch.stations[0].source_valid_from == datetime(
        2010, 4, 30, 9, tzinfo=env.KST
    )
    assert batch.stations[0].source_valid_until == datetime(
        2100, 12, 31, 9, tzinfo=env.KST
    )


def test_forecast_zone_bad_source_time_fails(monkeypatch):
    mock_json(
        monkeypatch,
        [payload([{"regId": "11A00101", "regName": "백령도", "tmSt": "201013300900"}])],
    )
    with pytest.raises(ProviderError, match="INVALID_SOURCE_TIME"):
        job("kma_forecast_zones").fetch()


def test_forecast_zone_reversed_source_validity_fails(monkeypatch):
    mock_json(
        monkeypatch,
        [
            payload(
                [
                    {
                        "regId": "11A00101",
                        "regName": "백령도",
                        "tmSt": "202401010000",
                        "tmEd": "201001010000",
                    }
                ]
            )
        ],
    )
    with pytest.raises(ProviderError, match="INVALID_SOURCE_TIME"):
        job("kma_forecast_zones").fetch()


def test_uv_preserves_actual_issue_zero_missing_and_75h_horizon(monkeypatch):
    calls = mock_json(monkeypatch, [payload({"item": [uv(h3="")]}, 1)])
    result = job("kma_uv_forecast").fetch()
    assert len(result.readings) == 26
    first, last = result.readings[0], result.readings[-1]
    assert first.issued_at == NOW.replace(hour=9, minute=0)
    assert first.observed_at == first.issued_at
    assert first.values[0].numeric_value == 0
    assert not first.values[0].missing
    assert result.readings[1].values[0].missing
    assert last.observed_at - last.issued_at == timedelta(hours=75)
    assert last.valid_until - last.observed_at == timedelta(hours=3)
    assert all(v.mode == "forecast" for r in result.readings for v in r.values)
    assert first.station.latitude is None
    assert calls[0][1]["time"] == "2024091409"


def test_uv_issue_delay_crosses_midnight():
    assert env._uv_issue(NOW.replace(hour=0, minute=30)) == datetime(
        2024, 9, 13, 21, tzinfo=env.KST
    )


@pytest.mark.parametrize("change", [{"areaNo": "2600000000"}, {"date": "2024091406"}])
def test_uv_scope_or_issue_mismatch_rejected(monkeypatch, change):
    mock_json(monkeypatch, [payload([uv(**change)])])
    with pytest.raises(ProviderError, match="SOURCE_SCOPE_MISMATCH"):
        job("kma_uv_forecast").fetch()


def test_uv_incomplete_forecast_is_not_replaced_with_zero(monkeypatch):
    row = uv()
    del row["h75"]
    mock_json(monkeypatch, [payload([row])])
    with pytest.raises(ProviderError, match="INCOMPLETE_UV_FORECAST"):
        job("kma_uv_forecast").fetch()


def test_astronomy_is_daily_prediction_with_actual_event_times_and_unknown_issue(
    monkeypatch,
):
    calls = []

    def get_text(self, url, params=None):
        calls.append(params)
        return xml_payload([astronomy()])

    monkeypatch.setattr(env.Client, "get_text", get_text)
    batch = job("kasi_rise_set").fetch()
    r = batch.readings[0]
    assert r.issued_at is None
    assert r.observed_at == NOW.replace(hour=0, minute=0)
    assert r.valid_until == r.observed_at + timedelta(days=1)
    assert r.station.kind == "astronomy_location"
    assert r.station.latitude == 37.566666
    values = {v.name: v for v in r.values}
    assert (
        values["sunset"].text_value == "sunset=1842; event_at=2024-09-14T18:42:00+09:00"
    )
    assert values["moonset"].missing
    assert all(v.numeric_value is None and v.mode == "forecast" for v in r.values)
    assert calls[0]["locdate"] == "20240914"


def test_astronomy_missing_decimal_coordinates_do_not_use_degree_minute_as_decimal(
    monkeypatch,
):
    row = astronomy()
    del row["latitudeNum"], row["longitudeNum"]
    monkeypatch.setattr(env.Client, "get_text", lambda *a, **kw: xml_payload([row]))
    assert job("kasi_rise_set").fetch().readings[0].station.latitude is None


@pytest.mark.parametrize(
    "change, message",
    [
        ({"sunrise": "2567"}, "INVALID_ASTRONOMY_EVENT"),
        ({"location": "부산"}, "SOURCE_SCOPE_MISMATCH"),
        ({"locdate": "20240913"}, "SOURCE_SCOPE_MISMATCH"),
    ],
)
def test_astronomy_rejects_invalid_time_or_scope(monkeypatch, change, message):
    monkeypatch.setattr(
        env.Client, "get_text", lambda *a, **kw: xml_payload([astronomy(**change)])
    )
    with pytest.raises(ProviderError, match=message):
        job("kasi_rise_set").fetch()


def test_astronomy_midnight_seconds_and_no_data(monkeypatch):
    monkeypatch.setattr(
        env.Client,
        "get_text",
        lambda *a, **kw: xml_payload([astronomy(sunrise="060301", moonrise="2400")]),
    )
    values = {v.name: v for v in job("kasi_rise_set").fetch().readings[0].values}
    assert "06:03:01+09:00" in values["sunrise"].text_value
    assert "2024-09-15T00:00:00+09:00" in values["moonrise"].text_value
    monkeypatch.setattr(env.Client, "get_text", lambda *a, **kw: xml_payload([]))
    assert job("kasi_rise_set").fetch().readings == []


def test_astronomy_missing_event_key_fails_incomplete_response(monkeypatch):
    row = astronomy()
    del row["sunset"]
    monkeypatch.setattr(env.Client, "get_text", lambda *a, **kw: xml_payload([row]))
    with pytest.raises(ProviderError, match="INCOMPLETE_ASTRONOMY_EVENTS"):
        job("kasi_rise_set").fetch()


@pytest.mark.parametrize(
    "body",
    [
        "<response>",
        "<response><header><resultCode>30</resultCode></header></response>",
        xml_payload([astronomy()]).replace(
            "</sunset>", "</sunset><sunset>1900</sunset>"
        ),
    ],
)
def test_astronomy_bad_xml_and_duplicate_fields_fail(body):
    with pytest.raises(ProviderError):
        env._xml_items(body)


def test_air_source_fixture_not_mutated(monkeypatch):
    source = observation()
    previous = deepcopy(source)
    mock_json(monkeypatch, [payload([station()]), payload([source])])
    job("airkorea_observations").fetch()
    assert source == previous
