from app.place_identity import aliases_for, normalized_name


def place(sid, **changes):
    return dict(
        {
            "id": sid,
            "name": "경포해수욕장",
            "place_kind": "beach",
            "address": "강원도 강릉시 창해로 514",
            "region": "",
            "lat": 37.8034,
            "lng": 128.9102,
            "catalog_source": "KAKAO_LOCAL",
        },
        **changes,
    )


def test_normalization_keeps_distinct_qualifiers():
    assert normalized_name(" 송정 해수욕장 ") == normalized_name("송정해변")
    assert normalized_name("송정해변(남쪽)") != normalized_name("송정해변(북쪽)")


def test_cross_provider_group_keeps_oldest_catalogue_id():
    rows = [
        place(1, catalog_source="khoa_beach", lat=37.803),
        place(7),
        place(77, catalog_source="TOURAPI_KOREAN"),
    ]
    assert aliases_for(rows) == {1: 7, 77: 7}
    assert aliases_for(list(reversed(rows))) == {1: 7, 77: 7}


def test_same_name_is_insufficient_without_kind_region_and_coordinates():
    original = place(1)
    for changed in (
        {"lat": 37.9},
        {"lat": None},
        {"lng": float("nan")},
        {"lat": 0, "lng": 0},
        {"address": "", "region": ""},
        {"address": "강원도 속초시"},
        {"address": "강원도 강릉시", "region": "51:210"},
        {"place_kind": "valley"},
        {"place_kind": None},
        {"name": "경포해변(북쪽)"},
    ):
        assert aliases_for([original, place(2, **changed)]) == {}, changed


def test_verified_district_can_link_an_addressless_station():
    station = place(
        2,
        address=None,
        verified_province_code="gangwon",
        verified_district_code="gangneung",
    )
    assert aliases_for([place(1), station]) == {2: 1}
    station["verified_district_code"] = None
    assert aliases_for([place(1), station]) == {}


def test_nearby_chain_does_not_join_distant_endpoints():
    # Each neighbouring pair is ~333 m apart, but the endpoints are ~667 m apart.
    assert aliases_for([place(1), place(2, lat=37.8064), place(3, lat=37.8094)]) == {}
    assert aliases_for([place(1), place(2, lat=37.8064)]) == {2: 1}
