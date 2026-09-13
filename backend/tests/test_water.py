from datetime import datetime
from types import SimpleNamespace

import pytest
from pydantic import SecretStr

from app.ingestion.http import ProviderError
from app.ingestion.marine import KST, source_time
from app.ingestion.water import (
    WaterProvider,
    dms,
    month_windows,
    nier_coordinate,
    nier_rows,
    water_jobs,
    xml_rows,
)

NOW = datetime(2025, 9, 2, 10, 5, tzinfo=KST)


def settings():
    return SimpleNamespace(
        data_go_kr_key=SecretStr("fake-portal"),
        hrfco_key=SecretStr("fake-hydro"),
        collection_latitude=37.8,
        collection_longitude=128.9,
        collection_radius_m=20000,
    )


class FakeClient:
    def __init__(self, jsons=(), texts=()):
        self.jsons, self.texts = iter(jsons), iter(texts)
        self.calls = []

    def get_json(self, url, params=None):
        self.calls.append((url, params))
        return next(self.jsons)

    def get_text(self, url, params=None):
        self.calls.append((url, params))
        return next(self.texts)


def koem_info():
    return {
        "response": {
            "header": {"resultCode": "00"},
            "body": {
                "totalCount": 1,
                "items": {
                    "item": [
                        {
                            "stnpnt_code": "012345",
                            "mre_msnt_sta_korn_nm": "경포 정점",
                            "ocean_nm": "동해",
                            "lat": "37.8",
                            "lon": "128.9",
                        }
                    ]
                },
            },
        }
    }


def koem_xml(items="", total=0):
    return (
        "<response><header><resultCode>00</resultCode></header>"
        f"<body><items>{items}</items><totalCount>{total}</totalCount>"
        "</body></response>"
    )


def nier_response(rows):
    return {
        "getWaterMeasuringList": {
            "header": {"code": "00"},
            "item": rows,
            "totalCount": len(rows),
        }
    }


def nier_row(**changes):
    return {
        "PT_NO": "12345A",
        "PT_NM": "남대천",
        "LAT_DGR": "37",
        "LAT_MIN": "48",
        "LAT_SEC": "0",
        "LON_DGR": "128",
        "LON_MIN": "54",
        "LON_SEC": "0",
        "WMCYMD": "2025.08.19",
        "WMWK": "1회차",
        "ITEM_PH": " 7.7",
        "ITEM_BOD": "불검출",
        **changes,
    }


def test_koem_joins_provider_station_and_preserves_layers_historical_date_and_units():
    measurement = """<item><stnpntCode>012345</stnpntCode><obsrDe>2025-08-22</obsrDe>
    <wtrtmpSfclyr>28.488</wtrtmpSfclyr><wtrtmpBtmlyr>21.5</wtrtmpBtmlyr>
    <doxySfclyr>8.508</doxySfclyr><doxyBtmlyr>-</doxyBtmlyr>
    <eclgyZoneAreaScore>21</eclgyZoneAreaScore><eclgyZoneAreaGrad>1</eclgyZoneAreaGrad></item>"""
    client = FakeClient([koem_info()], [koem_xml(), koem_xml(measurement, 1)])
    batch = WaterProvider(settings(), client, lambda: NOW).koem()
    assert len(client.calls) == 3
    assert client.calls[1][1]["sdate"] == "20250901"
    assert client.calls[2][1]["edate"] == "20250831"
    surface, bottom = batch.readings
    vals = {v.name: v for v in surface.values}
    assert surface.station.source_id == "012345"
    assert surface.station.latitude == 37.8
    assert surface.observed_at == source_time("2025-08-22")
    assert surface.valid_until < NOW
    assert vals["dissolved_oxygen"].unit == ""
    assert vals["dissolved_oxygen"].numeric_value == 8.508
    assert vals["water_layer"].text_value == "surface"
    assert (
        next(v for v in bottom.values if v.name == "dissolved_oxygen").numeric_value
        is None
    )
    assert "fake-portal" not in batch.model_dump_json()


def test_koem_empty_month_search_is_bounded_and_does_not_fabricate_readings():
    client = FakeClient([koem_info()], [koem_xml()] * 7)
    batch = WaterProvider(settings(), client, lambda: NOW).koem()
    assert len(client.calls) == 8
    assert client.calls[-1][1]["sdate"] == "20240101"
    assert client.calls[-1][1]["edate"] == "20241231"
    assert not batch.readings


def test_koem_actual_named_envelope_and_hrfco_nested_info_records():
    old = koem_info()["response"]["body"]
    payload = {
        "getOceansNemoInfo": {
            "header": {"code": "00"},
            "item": old["items"]["item"],
            "totalCount": 1,
        }
    }
    batch = WaterProvider(settings(), FakeClient([payload]), lambda: NOW).koem_catalog()
    assert batch.catalog_only
    assert batch.stations[0].source_id == "012345"
    rows, total = xml_rows(
        "<entities><content><WaterlevelInfo><wlobscd>12345</wlobscd>"
        "<obsnm>정점</obsnm></WaterlevelInfo></content></entities>",
        require_header=False,
    )
    assert total == 1
    assert rows[0]["wlobscd"] == "12345"


def test_koem_previous_calendar_year_fallback_remains_stale_evidence():
    historical = koem_xml(
        "<item><stnpntCode>012345</stnpntCode><obsrDe>2024-08-22</obsrDe>"
        "<wtrtmpSfclyr>24.5</wtrtmpSfclyr></item>",
        1,
    )
    client = FakeClient([koem_info()], [koem_xml()] * 6 + [historical])
    batch = WaterProvider(settings(), client, lambda: NOW).koem()
    assert len(client.calls) == 8
    assert len(batch.readings) == 1
    assert batch.readings[0].observed_at == source_time("2024-08-22")
    assert batch.readings[0].valid_until < NOW


def test_nier_nested_envelope_dms_and_non_numeric_lab_result_are_preserved():
    client = FakeClient([nier_response([]), nier_response([nier_row()])])
    batch = WaterProvider(settings(), client, lambda: NOW).nier()
    reading = batch.readings[0]
    assert len(client.calls) == 2
    assert client.calls[1][1]["wmyrList"] == "2025"
    assert client.calls[1][1]["wmodList"] == "08"
    assert reading.station.latitude == 37.8
    assert reading.station.longitude == 128.9
    assert reading.valid_until == source_time("2025-08-20")
    assert (
        next(
            v for v in reading.values if v.name == "biochemical_oxygen_demand"
        ).text_value
        == "불검출"
    )
    assert next(v for v in reading.values if v.name == "ph").numeric_value == 7.7


def test_nier_missing_coordinate_not_replaced_by_collection_center():
    assert nier_coordinate(nier_row(LAT_SEC=None), "LAT") is None
    assert nier_coordinate(nier_row(LAT_MIN="60"), "LAT") is None


def test_hrfco_keeps_station_datum_exact_time_and_flow_unit():
    info = """<entities><content><wlobscd>1234567</wlobscd><obsnm>강릉시 관측소</obsnm>
    <lat>037-48-00</lat><lon>128-54-00</lon><gdt>2.5</gdt></content></entities>"""
    data = """<entities><content><wlobscd>1234567</wlobscd><ymdhm>202509021000</ymdhm>
    <wl>1.78</wl><fw>695.66</fw></content></entities>"""
    client = FakeClient(texts=[info, data])
    batch = WaterProvider(settings(), client, lambda: NOW).hrfco()
    reading = batch.readings[0]
    assert reading.station.datum == "관측소 수위표 영점표고 2.5 EL.m"
    assert reading.values[1].unit == "m³/s"
    assert reading.values[0].numeric_value == 1.78
    assert reading.observed_at == source_time("2025-09-02 10:00")
    assert len(client.calls) == 2
    assert "fake-hydro" not in batch.model_dump_json()


def test_dms_bounds_and_unknown_coordinates():
    assert dms("037-48-00") == 37.8
    assert dms("128-54-00", False) == 128.9
    assert dms("37-80-01") is None
    assert dms("999-00-00") is None
    assert dms(None) is None


def test_month_scan_crosses_year_without_hard_coded_historical_sample_dates():
    months = list(month_windows(source_time("2025-01-02"), 3))
    assert months == [(2025, 1, 31), (2024, 12, 31), (2024, 11, 30)]


@pytest.mark.parametrize(
    "payload",
    [
        {"getWaterMeasuringList": {"header": {"code": "30"}}},
        {"getWaterMeasuringList": {"item": []}},
    ],
)
def test_nier_auth_or_missing_status_is_failure(payload):
    with pytest.raises(ProviderError):
        nier_rows(payload)


def test_xml_auth_failure_and_wrong_root_are_not_success():
    with pytest.raises(ProviderError, match="PROVIDER_30"):
        xml_rows(
            "<OpenAPI_ServiceResponse><cmmMsgHeader><returnReasonCode>30</returnReasonCode></cmmMsgHeader></OpenAPI_ServiceResponse>"
        )
    with pytest.raises(ProviderError, match="INVALID_RESPONSE_ROOT"):
        xml_rows("<error>denied</error>", require_header=False)


def test_only_verified_water_services_are_registered_and_disabled_without_keys():
    s = settings()
    s.data_go_kr_key, s.hrfco_key = SecretStr(""), SecretStr("")
    jobs = water_jobs(s)
    assert {j.name for j in jobs} == {
        "koem_catalog",
        "koem_water_quality",
        "nier_water_quality",
        "hrfco_waterlevel",
    }
    assert not any(j.enabled for j in jobs)
