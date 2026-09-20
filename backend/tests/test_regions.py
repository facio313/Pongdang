"""Region aliases never rewrite provider text or infer boundaries from proximity."""

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.config import Settings
from app.livecams.places import create_places_router
from app.regions import (
    DISTRICTS,
    LEGACY_DISTRICT_CODES,
    LEGAL_DISTRICT_CODES,
    administrative_codes,
    place_search_predicate,
    region_query,
    search_aliases,
)


@pytest.mark.parametrize(
    "query", ["강원", "강원도", "강원특별자치도", "Gangwon", "Gangwon-do", "江原道"]
)
def test_province_aliases_are_one_scope(query):
    assert region_query(query) == ("gangwon", None)
    assert search_aliases(query) == ["강원", "gangwon", "江原"]


@pytest.mark.parametrize("code,label", DISTRICTS)
def test_confirmed_legal_codes_and_explicit_address_match(code, label):
    assert administrative_codes(region="51:" + LEGAL_DISTRICT_CODES[code]) == (
        "gangwon",
        code,
    )
    assert administrative_codes(address="강원특별자치도 " + label + " 시험길 12") == (
        "gangwon",
        code,
    )
    assert region_query("강원도 " + label) == ("gangwon", code)
    assert administrative_codes(region="32:" + LEGACY_DISTRICT_CODES[code]) == (
        "gangwon",
        code,
    )


@pytest.mark.parametrize(
    "address,region,expected",
    [
        ("Gangneung-si, Gangwon-do, Korea", None, ("gangwon", "gangneung")),
        (None, "강릉", ("gangwon", "gangneung")),
        (None, None, (None, None)),
        ("고성군 시험길 12", None, (None, None)),
        ("경상남도 고성군 시험길 12", None, (None, None)),
        ("강원도 고성군 시험길 12", None, ("gangwon", "goseong")),
        ("동해", None, (None, None)),
        ("동해시", None, ("gangwon", "donghae")),
        ("경기도 평택시 강원도길 12", None, (None, None)),
        ("강릉로 12", None, (None, None)),
        (None, "51:999", (None, None)),
        (
            "강원특별자치도 횡성군 강림면 부곡리 산 145",
            "51:750",
            ("gangwon", None),
        ),
    ],
)
def test_unknown_and_ambiguous_regions_remain_unknown(address, region, expected):
    assert administrative_codes(address, region) == expected


def test_unknown_query_is_literal_and_sql_never_contains_user_text():
    query = "%' OR 1=1 --"
    predicate, params = place_search_predicate(query)
    assert query not in predicate
    assert params == [query]
    assert "position(lower(%s)" in predicate
    assert region_query("고성") is None


class ForbiddenReader:
    def connection(self):
        raise AssertionError("Invalid filters and region options must not read DB")


def test_region_options_and_api_query_bounds():
    app = FastAPI()
    app.include_router(
        create_places_router(
            Settings(_env_file=None, postgres_password="offline"),
            reader=ForbiddenReader(),
        )
    )
    client = TestClient(app)
    options = client.get("/api/data/regions")
    assert options.status_code == 200
    assert len(options.json()["provinces"][0]["districts"]) == 18
    for params in [
        {"page": 0},
        {"page": 10001},
        {"page_size": 101},
        {"page_size": 0},
        {"province": "gyeongnam"},
        {"district": "unsafe"},
        {"kind": "arbitrary"},
    ]:
        assert client.get("/api/data/places", params=params).status_code == 422
