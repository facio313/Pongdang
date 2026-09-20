"""Region filtering, bounded pages and verified metadata on disposable PG only."""

import asyncio
from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient

from app.ai.tools import SearchArgs, ToolSession
from app.config import Settings
from app.data_reader import DataReader
from app.ingestion.models import Place, SourceBatch
from app.ingestion.storage import store_batch
from app.main import create_app
from app.schema import connect, initialize
from app.travel.catalog import Catalog
from app.travel.models import TravelRequest


@pytest.fixture
def region_db():
    settings = Settings(_env_file=None, ai_provider="disabled")
    if settings.postgres_db != "pongdang_test":
        pytest.fail("Region tests require disposable pongdang_test")
    with connect(settings) as connection:
        connection.execute("DROP SCHEMA IF EXISTS pongdang_data CASCADE")
    initialize(settings)
    now = datetime.now(UTC) - timedelta(minutes=1)
    records = [
        ("gangneung", "강원도 강릉시", "", "beach"),
        ("sokcho", "강원특별자치도 속초시", "", "beach"),
        ("goseong-north", "강원 고성군", "", "beach"),
        ("goseong-south", "경상남도 고성군", "", "beach"),
        ("goseong-unknown", "고성군", "", "beach"),
        ("known-station", None, "", "beach"),
        ("unknown-station", None, "", "beach"),
        ("literal-100%", "강원도 양양군", "", "beach"),
        ("valley", "강원도 홍천군", "", "valley"),
        ("code-korean", None, "51:150", "beach"),
    ]
    store_batch(
        settings,
        SourceBatch(
            provider="TOURAPI_KOREAN",
            fetched_at=now,
            places=[
                Place(
                    source_id=source_id,
                    name=source_id,
                    address=address or "",
                    region=region,
                    kind=kind,
                    latitude=37.8,
                    longitude=128.9,
                    category="12",
                )
                for source_id, address, region, kind in records
            ],
        ),
    )
    store_batch(
        settings,
        SourceBatch(
            provider="tourapi_english",
            fetched_at=now,
            places=[
                Place(
                    source_id="code-english",
                    name="English registered beach",
                    region="51:150",
                    kind="beach",
                    category="75",
                    latitude=37.8,
                    longitude=128.9,
                ),
                Place(
                    source_id="code-legacy",
                    name="Legacy registered beach",
                    region="32:1",
                    kind="beach",
                    category="75",
                    latitude=37.8,
                    longitude=128.9,
                ),
            ],
        ),
    )
    with connect(settings) as connection:
        ids = dict(
            connection.execute(
                "SELECT source_id,spot_id FROM pongdang_data.collection_place"
            ).fetchall()
        )
        connection.execute(
            "UPDATE pongdang_data.spots_waterspot SET address=NULL WHERE id=%s",
            [ids["known-station"]],
        )
        connection.execute(
            "INSERT INTO pongdang_data.collection_place_region "
            "(spot_id,province_code,district_code,provider,provider_region_code,"
            "source_url,verified_at,latitude,longitude) "
            "VALUES (%s,'gangwon','gangneung','OFFLINE_TEST','5115000000',"
            "'https://dapi.kakao.com/v2/local/geo/coord2regioncode.json',%s,37.8,128.9)",
            [ids["known-station"], now],
        )
    with TestClient(create_app(settings)) as client:
        yield settings, client, ids, now
    with connect(settings) as connection:
        connection.execute("DROP SCHEMA IF EXISTS pongdang_data CASCADE")


def test_aliases_districts_literal_query_and_legacy_contract(region_db):
    _, client, ids, _ = region_db
    expected = set(ids.values()) - {
        ids["goseong-south"],
        ids["goseong-unknown"],
        ids["unknown-station"],
    }
    for alias in ["강원", "강원도", "강원특별자치도", "Gangwon", "Gangwon-do"]:
        response = client.get("/api/data/places", params={"q": alias})
        assert response.status_code == 200, response.text
        assert {r["id"] for r in response.json()["rows"]} == expected
    response = client.get(
        "/api/data/places", params={"province": "gangwon", "district": "goseong"}
    )
    assert [r["id"] for r in response.json()["rows"]] == [ids["goseong-north"]]
    response = client.get("/api/data/places", params={"q": "%"})
    assert [r["id"] for r in response.json()["rows"]] == [ids["literal-100%"]]
    response = client.get("/api/data/livecams/preview/places", params={"q": "강원도"})
    assert isinstance(response.json(), list)
    assert {r["id"] for r in response.json()} == expected
    response = client.get("/api/data/places", params={"kind": "valley"})
    assert [r["id"] for r in response.json()["rows"]] == [ids["valley"]]


def test_page_101_and_counts_use_same_filters(region_db):
    settings, client, _, now = region_db
    store_batch(
        settings,
        SourceBatch(
            provider="TOURAPI_KOREAN",
            fetched_at=now,
            places=[
                Place(
                    source_id=f"page-{index:03}",
                    name=f"페이지 {index:03}",
                    kind="beach",
                    region="강원특별자치도 양양군",
                    latitude=37.8,
                    longitude=128.9,
                )
                for index in range(101)
            ],
        ),
    )
    params = {"q": "페이지", "district": "yangyang", "page_size": 100}
    first = client.get("/api/data/places", params=params).json()
    second = client.get("/api/data/places", params=params | {"page": 2}).json()
    assert first["total"] == second["total"] == 101
    assert len(first["rows"]) == 100 and first["has_more"] is True
    assert len(second["rows"]) == 1 and second["has_more"] is False
    assert first["page"] == 1 and second["page"] == 2
    assert not ({r["id"] for r in first["rows"]} & {r["id"] for r in second["rows"]})
    assert first["rows"][0]["name"] == "페이지 000"
    assert second["rows"][0]["name"] == "페이지 100"


@pytest.mark.parametrize("source_region", ["51:750", "32:8", "강원도 영월군"])
def test_conflicting_district_evidence_stays_in_province_without_double_counting(
    region_db, source_region
):
    settings, client, _, now = region_db
    address = "강원특별자치도 횡성군 강림면 부곡리 산 145"
    store_batch(
        settings,
        SourceBatch(
            provider="TOURAPI_KOREAN",
            fetched_at=now,
            places=[
                Place(
                    source_id="conflicting-provider-district",
                    name="원천 지역 상충 계곡",
                    address=address,
                    region=source_region,
                    kind="valley",
                    category="12",
                    latitude=37.3,
                    longitude=128.1,
                )
            ],
        ),
    )
    province = client.get(
        "/api/data/places", params={"province": "gangwon", "q": "원천 지역 상충"}
    ).json()
    assert province["total"] == 1
    record = province["rows"][0]
    assert record["province_code"] == "gangwon"
    assert record["district_code"] is None
    assert record["address"] == address and record["region"] == source_region
    for district, query in [("hoengseong", "횡성군"), ("yeongwol", "영월군")]:
        page = client.get(
            "/api/data/places", params={"district": district, "q": "원천 지역 상충"}
        ).json()
        assert page["total"] == 0 and page["rows"] == []
        # Free-text administrative aliases and the legacy preview endpoint use
        # the same predicate, so they must not reintroduce the conflicting row.
        legacy = client.get(
            "/api/data/livecams/preview/places", params={"q": query}
        ).json()
        assert record["id"] not in {row["id"] for row in legacy}

    async def check_catalog():
        catalog = Catalog(settings, now + timedelta(minutes=1))
        rows, _ = await catalog.search(TravelRequest(region="강원도"))
        assert record["id"] in {row["spot_id"] for row in rows}
        for district in ("횡성군", "영월군"):
            rows, _ = await catalog.search(TravelRequest(region=district))
            assert record["id"] not in {row["spot_id"] for row in rows}

    asyncio.run(check_catalog())


def test_verified_metadata_never_rewrites_raw_and_coordinate_change_invalidates(
    region_db,
):
    settings, client, ids, _ = region_db
    rows = client.get("/api/data/places", params={"district": "gangneung"}).json()[
        "rows"
    ]
    verified = next(r for r in rows if r["id"] == ids["known-station"])
    assert verified["province_code"] == "gangwon"
    assert verified["district_code"] == "gangneung"
    assert verified["region"] == "" and verified["address"] is None
    assert ids["unknown-station"] not in {r["id"] for r in rows}
    with connect(settings) as connection:
        connection.execute(
            "UPDATE pongdang_data.spots_waterspot SET lat=37.9 WHERE id=%s",
            [ids["known-station"]],
        )
    rows = client.get("/api/data/places", params={"province": "gangwon"}).json()["rows"]
    assert ids["known-station"] not in {r["id"] for r in rows}


def test_travel_and_ai_apply_same_alias_scope_before_limit(region_db):
    settings, _, ids, now = region_db

    async def check():
        catalog = Catalog(settings, now + timedelta(minutes=1))
        for alias in ["강원도", "gangwon"]:
            rows, _ = await catalog.search(TravelRequest(region=alias))
            found = {r["spot_id"] for r in rows}
            assert ids["goseong-north"] in found
            assert ids["goseong-south"] not in found
            assert ids["unknown-station"] not in found
        rows, _ = await catalog.search(TravelRequest(region="gangwon", locale="en"))
        assert {r["spot_id"] for r in rows} == {ids["code-english"], ids["code-legacy"]}
        session = ToolSession(settings, now + timedelta(minutes=1))
        await session._search_places(SearchArgs(query="강원도 고성군"), {})
        assert {row["spot_id"] for row in session.candidates.values()} == {
            ids["goseong-north"]
        }

    asyncio.run(check())


def test_raw_dataset_search_accepts_province_alias_without_rewriting(region_db):
    settings, client, ids, _ = region_db
    response = client.get("/api/data/datasets/spots", params={"q": "강원도"})
    assert response.status_code == 200
    found = {r["id"] for r in response.json()["rows"]}
    assert ids["gangneung"] in found and ids["sokcho"] in found
    assert DataReader(settings).normalize_search("raw") == "raw"


def test_province_candidates_include_later_districts_before_300_limit(region_db):
    settings, _, _, now = region_db
    # Insertion order intentionally concentrates low IDs in Gangneung.
    for district, count, region in [
        ("gangneung", 310, "51:150"),
        ("sokcho", 30, "51:210"),
        ("yangyang", 30, "51:830"),
        ("unknown", 10, "강원도"),
    ]:
        store_batch(
            settings,
            SourceBatch(
                provider="TOURAPI_KOREAN",
                fetched_at=now,
                places=[
                    Place(
                        source_id=f"balanced-{district}-{index}",
                        name=f"분산 {district} {index}",
                        region=region,
                        kind="beach",
                        latitude=37.8,
                        longitude=128.9,
                    )
                    for index in range(count)
                ],
            ),
        )

    async def check():
        catalog = Catalog(settings, now + timedelta(minutes=1))
        rows, scope = await catalog.search(TravelRequest(region="강원도"))
        assert scope["matched_count"] > 300
        assert len(rows) == 300 and scope["truncated"] is True
        assert scope["scan_order"] == "round_robin_district_then_spot_id"
        found = {r["region"] for r in rows}
        assert {"51:210", "51:830", "강원도"} <= found
        # Unknown district rows retain their own group, rather than being
        # assigned to Gangneung simply because their coordinates match it.
        first_round = rows[:6]
        assert any(r["region"] == "강원도" for r in first_round)
        single, single_scope = await catalog.search(TravelRequest(region="강릉시"))
        assert single_scope["scan_order"] == "stable_spot_id"
        assert len(single) == 300
        assert [r["spot_id"] for r in single] == sorted(r["spot_id"] for r in single)
        assert not any(r["region"] in {"51:210", "51:830", "강원도"} for r in single)

    asyncio.run(check())
