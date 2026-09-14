from datetime import datetime, timedelta
from types import SimpleNamespace
from xml.etree.ElementTree import Element, SubElement, tostring

import pytest
from pydantic import SecretStr

from app.ingestion.http import ProviderError
from app.ingestion.marine import KST, RequestBudget
from app.ingestion.water_tour_extra import (
    LANGUAGES,
    VISITORS,
    WEMO_FIELDS,
    WEMO_INFO,
    WEMO_WATER,
    WaterTourExtraProvider,
    normalized,
    tourism_time,
    water_tour_extra_jobs,
)

NOW = datetime(2025, 9, 14, 10, tzinfo=KST)


def settings(**changes):
    return SimpleNamespace(
        **{
            "data_go_kr_key": SecretStr("fake-water-tour"),
            "collection_latitude": 37.8,
            "collection_longitude": 128.9,
            "collection_radius_m": 20000,
            "water_quality_station_name": "인천강화",
            "visitor_statistics_lag_days": 60,
            "visitor_region_code": "",
            "tourism_traditional_enabled": False,
            "dam_release_enabled": False,
            **changes,
        }
    )


def response(rows=(), total=None):
    return {
        "response": {
            "header": {"resultCode": "00"},
            "body": {
                "items": {"item": list(rows)},
                "totalCount": len(rows) if total is None else total,
            },
        }
    }


def xml_response(rows=(), total=None):
    root = Element("response")
    SubElement(SubElement(root, "header"), "resultCode").text = "0000"
    body = SubElement(root, "body")
    SubElement(body, "totalCount").text = str(len(rows) if total is None else total)
    items = SubElement(body, "items")
    for row in rows:
        item = SubElement(items, "item")
        for key, val in row.items():
            SubElement(item, key).text = str(val)
    return tostring(root, encoding="unicode")


class Client:
    def __init__(self, payloads=()):
        self.payloads = iter(payloads)
        self.calls = []

    def get_json(self, url, params):
        self.calls.append((url, params))
        result = next(self.payloads)
        if isinstance(result, Exception):
            raise result
        return result

    get_text = get_json


def provider(payloads=(), **changes):
    return WaterTourExtraProvider(settings(**changes), Client(payloads), lambda: NOW)


def station(**changes):
    return {
        "stnpnt_code": "110",
        "stnpnt_korean_nm": "인천강화",
        "ocean_nm": "서해",
        "lat": "37.73079",
        "lon": "126.526079",
        **changes,
    }


def water_row(**changes):
    return {
        "stnpntCode": "110",
        "obsrDate": "2025-09-13 10:00",
        "wtrtmp": "21.4",
        "phDnsty": "7.8",
        "doxy": "-",
        **changes,
    }


def place(**changes):
    return {
        "contentid": "00014",
        "title": "Gyeongpo",
        "contenttypeid": "76",
        "mapx": "128.9",
        "mapy": "37.8",
        "addr1": "강릉",
        "addr2": "경포",
        "areacode": "32",
        "sigungucode": "1",
        "createdtime": "20210503140000",
        "modifiedtime": "20240523142523",
        **changes,
    }


def visitor(**changes):
    return {
        "signguCode": "42150",
        "signguNm": "강릉시",
        "baseYmd": "20250716",
        "touDivCd": "1",
        "touDivNm": "외지인",
        "touNum": "123.45",
        "daywkDivCd": "4",
        "daywkDivNm": "수요일",
        **changes,
    }


def test_jobs_are_daily_bounded_and_unapproved_services_stay_disabled():
    jobs = {j.name: j for j in water_tour_extra_jobs(settings())}
    assert len(jobs) == 8
    assert all(
        j.enabled
        for k, j in jobs.items()
        if k not in {"tourapi_chinese_traditional", "kwater_dam_release"}
    )
    assert not jobs["tourapi_chinese_traditional"].enabled
    assert (
        jobs["tourapi_chinese_traditional"].disabled_reason
        == "SERVICE_APPROVAL_UNCONFIRMED"
    )
    assert jobs["kwater_dam_release"].fetch is None
    assert jobs["kwater_dam_release"].disabled_reason == "APPROVAL_PENDING"
    assert all(j.interval_seconds == 86400 for j in jobs.values() if j.enabled)
    assert all(
        not j.enabled
        for j in water_tour_extra_jobs(settings(data_go_kr_key=SecretStr("")))
    )
    assert all(
        j.disabled_reason == "KEY_NOT_CONFIGURED"
        for j in water_tour_extra_jobs(settings(data_go_kr_key=SecretStr("")))
    )
    assert next(
        j
        for j in water_tour_extra_jobs(settings(tourism_traditional_enabled=True))
        if j.name == "tourapi_chinese_traditional"
    ).enabled


def test_wemo_station_catalog_uses_verified_snake_case_and_own_station_scope():
    p = provider([response([station()])])
    batch = p.wemo_catalog()
    assert batch.catalog_only
    assert batch.provider == "koem_wemo_catalog"
    assert batch.stations[0].source_id == "110"
    assert batch.stations[0].name == "인천강화"
    assert batch.stations[0].longitude == 126.526079
    assert p.client.calls[0][0] == WEMO_INFO
    assert "fake-water-tour" not in batch.model_dump_json()


def test_wemo_named_envelope_and_camel_case_catalog_are_supported():
    data = {
        "getOceansWemoInfo": {
            "header": {"code": "00"},
            "item": {"stnpntCode": "110", "stnpntKoreanNm": "인천강화"},
            "totalCount": 1,
        }
    }
    batch = provider([data]).wemo_catalog()
    assert batch.stations[0].latitude is None


def test_wemo_observation_preserves_time_null_issue_all_known_values_unknown_units():
    all_fields = {key: "1.25" for key in WEMO_FIELDS}
    row = {
        "stnpnt_code": "110",
        "obsr_date": "2025-09-13 10:00",
        **all_fields,
        "provider_secret": "not stored",
    }
    p = provider([response([station()]), response([row])])
    batch = p.wemo_water_quality()
    reading = batch.readings[0]
    assert reading.source_id == "110:2025-09-13T10:00:00+09:00"
    assert reading.issued_at is None
    assert reading.valid_until == reading.observed_at + timedelta(minutes=1)
    assert reading.valid_until < NOW
    assert all(v.unit == "" for v in reading.values)
    assert len(reading.values) == len(WEMO_FIELDS)
    assert all(v.numeric_value == 1.25 for v in reading.values)
    assert "provider_secret" not in batch.model_dump_json()
    assert p.client.calls[1][0] == WEMO_WATER
    assert p.client.calls[1][1]["sdate"] == p.client.calls[1][1]["edate"] == "20250913"
    assert p.client.calls[1][1]["STNPNT_KOREAN_NM"] == "인천강화"


def test_wemo_empty_keeps_station_and_no_data_without_synthetic_values_or_fallback():
    p = provider([response([station()]), response()])
    batch = p.wemo_water_quality()
    assert batch.stations and not batch.readings
    assert not batch.catalog_only
    assert len(p.client.calls) == 2


def test_wemo_missing_and_zero_are_distinct():
    batch = provider(
        [response([station()]), response([water_row(wtrtmp="0")])]
    ).wemo_water_quality()
    vals = {v.name: v for v in batch.readings[0].values}
    assert vals["water_temperature"].numeric_value == 0
    assert not vals["water_temperature"].missing
    assert vals["dissolved_oxygen"].missing
    assert vals["dissolved_oxygen"].text_value == "-"


@pytest.mark.parametrize(
    "changes,code",
    [
        ({"stnpntCode": "other"}, "UNEXPECTED_STATION"),
        ({"obsrDate": "2025-09-12 10:00"}, "UNEXPECTED_OBSERVATION_DATE"),
        ({"obsrDate": "2025-09-15 10:00"}, "UNEXPECTED_OBSERVATION_DATE"),
        ({"obsrDate": None}, "MISSING_SOURCE_TIME"),
        ({"wtrtmp": {}}, "INVALID_SOURCE_VALUE"),
        ({"wtrtmp": "x" * 501}, "INVALID_SOURCE_VALUE"),
        ({"ph_dnsty": "8.9"}, "CONFLICTING_FIELD_ALIAS"),
    ],
)
def test_wemo_invalid_evidence_fails_entire_fetch(changes, code):
    with pytest.raises(ProviderError, match=code):
        provider(
            [response([station()]), response([water_row(**changes)])]
        ).wemo_water_quality()


def test_wemo_conflicting_revision_is_not_chosen_or_overwritten():
    with pytest.raises(ProviderError, match="CONFLICTING_PROVIDER_RECORD"):
        provider(
            [response([station()]), response([water_row(), water_row(wtrtmp="22")])]
        ).wemo_water_quality()


def test_wemo_removed_measurement_fields_are_rejected_and_never_make_success():
    with pytest.raises(ProviderError, match="MISSING_MEASUREMENT_FIELDS"):
        provider(
            [
                response([station()]),
                response([{"stnpntCode": "110", "obsrDate": "2025-09-13"}]),
            ]
        ).wemo_water_quality()


def test_wemo_configured_station_is_explicit_and_empty_name_uses_actual_radius():
    with pytest.raises(ProviderError, match="CONFIGURED_STATION_NOT_FOUND"):
        provider(
            [response([station()])], water_quality_station_name="missing"
        ).wemo_water_quality()
    p = provider([response([station()])], water_quality_station_name="")
    assert not p.wemo_water_quality().readings
    assert len(p.client.calls) == 1


@pytest.mark.parametrize("language", LANGUAGES)
def test_every_tourism_language_is_isolated_and_preserves_original_id_times(language):
    p = provider([response([place()])])
    batch = p.tourism_places(language)
    assert batch.provider == "tourapi_" + language
    assert batch.coverage == "bounded"
    assert batch.catalog_only
    assert batch.places[0].source_id == "00014"
    assert batch.places[0].latitude == 37.8
    assert batch.places[0].address == "강릉 경포"
    assert batch.places[0].region == "32:1"
    assert batch.places[0].source_created_at == tourism_time("20210503140000")
    assert batch.places[0].source_modified_at == tourism_time("20240523142523")
    assert not batch.readings and not batch.stations
    assert LANGUAGES[language] in p.client.calls[0][0]
    assert p.client.calls[0][1]["radius"] == 20000
    assert "fake-water-tour" not in batch.model_dump_json()


@pytest.mark.parametrize(
    "coords",
    [{"mapx": ""}, {"mapy": "-999"}, {"mapx": "0"}, {"mapx": "126"}, {"mapy": "nan"}],
)
def test_tourism_missing_or_outside_coords_are_never_invented(coords):
    batch = provider([response([place(**coords)])]).tourism_places("english")
    assert not batch.places and not batch.readings


def test_tourism_empty_and_no_modification_timestamp_do_not_invent_timestamps():
    assert not provider([response()]).tourism_places("english").places
    batch = provider(
        [response([place(modifiedtime="", createdtime="")])]
    ).tourism_places("english")
    assert batch.places and not batch.readings


@pytest.mark.parametrize(
    "changes,code",
    [
        ({"contentid": ""}, "MISSING_SOURCE_IDENTITY"),
        ({"modifiedtime": "invalid"}, "INVALID_SOURCE_TIME"),
        ({"modifiedtime": "20260101000000"}, "FUTURE_SOURCE_MODIFICATION"),
        ({"createdtime": "20250101000000"}, "INVALID_SOURCE_CHRONOLOGY"),
    ],
)
def test_tourism_invalid_source_data_fails_atomic_fetch(changes, code):
    with pytest.raises(ProviderError, match=code):
        provider([response([place(**changes)])]).tourism_places("english")


def test_tourism_different_same_id_place_fails_and_cap_is_bounded_500_records():
    with pytest.raises(ProviderError, match="CONFLICTING_PLACE"):
        provider([response([place(), place(title="other")])]).tourism_places("english")
    with pytest.raises(ProviderError, match="CONFLICTING_PLACE"):
        provider([response([place(), place(mapx="")])]).tourism_places("english")
    pages = [
        response(
            [
                place(contentid=str(n), modifiedtime="", createdtime="")
                for n in range(i * 100, (i + 1) * 100)
            ],
            501,
        )
        for i in range(5)
    ]
    p = provider(pages)
    batch = p.tourism_places("english")
    assert len(batch.places) == 500
    assert batch.coverage == "bounded"
    assert len(p.client.calls) == 5


def test_daily_visitors_retain_region_type_date_and_never_assign_beach_coordinates():
    p = provider(
        [
            xml_response(
                [visitor(), visitor(touDivCd="2", touDivNm="외국인", touNum="0")]
            )
        ]
    )
    batch = p.visitor_statistics()
    assert batch.provider == "tourapi_daily_visitors"
    assert batch.stations[0].latitude is None
    assert batch.stations[0].longitude is None
    assert batch.stations[0].source_id == "42150"
    first, second = batch.readings
    assert first.source_id == "42150:20250716:1"
    assert first.observed_at == datetime(2025, 7, 16, tzinfo=KST)
    assert first.valid_until == datetime(2025, 7, 17, tzinfo=KST)
    assert first.issued_at is None
    assert first.values[0].numeric_value == 123.45
    assert first.values[0].unit == "명"
    assert second.values[0].numeric_value == 0
    assert "실시간 해변 혼잡도 아님" in first.spatial_scope
    assert p.client.calls[0][0] == VISITORS
    assert p.client.calls[0][1]["startYmd"] == "20250716"
    assert p.client.calls[0][1]["numOfRows"] == 1000


def test_daily_visitor_filter_and_missing_data_do_not_sum_or_invent():
    batch = provider(
        [
            xml_response(
                [visitor(), visitor(signguCode="11", signguNm="서울", touNum="-")]
            )
        ],
        visitor_region_code="11",
    ).visitor_statistics()
    assert len(batch.readings) == 1
    assert batch.readings[0].station.name == "서울"
    assert batch.readings[0].values[0].missing
    assert not provider([xml_response()]).visitor_statistics().readings


@pytest.mark.parametrize(
    "changes,code",
    [
        ({"baseYmd": "20250914"}, "UNEXPECTED_OBSERVATION_DATE"),
        ({"touDivCd": ""}, "MISSING_SOURCE_IDENTITY"),
        ({"touNum": "-1"}, "INVALID_VISITOR_COUNT"),
        ({"touNum": "not-a-count"}, "INVALID_VISITOR_COUNT"),
    ],
)
def test_visitor_invalid_data_fails(changes, code):
    with pytest.raises(ProviderError, match=code):
        provider([xml_response([visitor(**changes)])]).visitor_statistics()


@pytest.mark.parametrize("raw", ["", "-", "--", "null", "-999", "-9999"])
def test_visitor_explicit_missing_counts_stay_missing(raw):
    reading = (
        provider([xml_response([visitor(touNum=raw)])]).visitor_statistics().readings[0]
    )
    assert reading.values[0].numeric_value is None
    assert reading.values[0].missing
    assert reading.values[0].text_value == raw


def test_visitor_conflicting_records_and_metadata_cannot_overwrite():
    with pytest.raises(ProviderError, match="CONFLICTING_PROVIDER_RECORD"):
        provider([xml_response([visitor(), visitor(touNum="88")])]).visitor_statistics()
    with pytest.raises(ProviderError, match="CONFLICTING_STATION"):
        provider(
            [xml_response([visitor(), visitor(signguNm="다른 지역", touDivCd="2")])]
        ).visitor_statistics()


@pytest.mark.parametrize(
    "payload,code",
    [
        (response([], 5001), "RECORD_LIMIT_EXCEEDED"),
        (response([], 1), "INCOMPLETE_PAGINATION"),
        (response([], -1), "INVALID_TOTAL_COUNT"),
        ({"response": {"header": {"resultCode": "30"}}}, "PROVIDER_30"),
        ({"wrong": "shape"}, "PROVIDER_MISSING_STATUS"),
        ([], "INVALID_RESPONSE"),
    ],
)
def test_error_and_malformed_responses_do_not_become_empty_success(payload, code):
    with pytest.raises(ProviderError, match=code):
        provider([payload]).wemo_catalog()


def test_page_change_budget_and_oversized_page_fail_without_returning_partial_batch():
    p = provider([response([station()], 2), response([station()], 3)])
    with pytest.raises(ProviderError, match="PAGINATION_TOTAL_CHANGED"):
        p.wemo_catalog()
    p = provider([response([station()], 2), response([station()], 2)])
    with pytest.raises(ProviderError, match="PAGINATION_REPEATED_RECORD"):
        p.wemo_catalog()
    p = provider([response([station()] * 1001)])
    with pytest.raises(ProviderError, match="RECORD_LIMIT_EXCEEDED"):
        p.wemo_catalog()
    budget = RequestBudget()
    budget.used = 10
    with pytest.raises(ProviderError, match="REQUEST_BUDGET_EXCEEDED"):
        provider()._paged(WEMO_INFO, {}, budget)


def test_missing_key_network_and_alias_conflicts_are_safe_errors():
    with pytest.raises(ProviderError, match="MISSING_CREDENTIAL"):
        provider(data_go_kr_key=SecretStr("")).wemo_catalog()
    with pytest.raises(ProviderError, match="HTTP_403"):
        provider([ProviderError("HTTP_403")]).wemo_catalog()
    with pytest.raises(ProviderError, match="CONFLICTING_FIELD_ALIAS"):
        normalized({"stnpnt_code": "1", "stnpntCode": "2"})
    with pytest.raises(ProviderError, match="UNSUPPORTED_LANGUAGE"):
        provider().tourism_places("unknown")


@pytest.mark.parametrize("xml", [False, True])
def test_cumulative_page_count_cannot_exceed_provider_total(xml):
    pack = xml_response if xml else response
    p = provider(
        [
            pack([station(stnpnt_code="1"), station(stnpnt_code="2")], 3),
            pack([station(stnpnt_code="3"), station(stnpnt_code="4")], 3),
        ]
    )
    with pytest.raises(ProviderError, match="INVALID_TOTAL_COUNT"):
        p._paged(WEMO_INFO, {}, RequestBudget(), page_size=2, xml=xml)
    assert len(p.client.calls) == 2


def test_exact_total_across_partial_final_page_is_complete():
    p = provider(
        [
            response([station(stnpnt_code="1"), station(stnpnt_code="2")], 3),
            response([station(stnpnt_code="3")], 3),
        ]
    )
    rows, bounded = p._paged(WEMO_INFO, {}, RequestBudget(), page_size=2)
    assert len(rows) == 3
    assert not bounded
