"""Language filtering happens before paging and preserves real photo/detail IDs."""

from fastapi.testclient import TestClient
from test_attachments_integration import add_place, save
from test_attachments_integration import database as database

from app.main import create_app
from app.schema import connect


def test_korean_catalog_is_not_displaced_by_foreign_names_and_keeps_photos(database):
    place = add_place(database)
    save(database, place)
    with connect(database) as c:
        c.execute(
            "UPDATE pongdang_data.spots_waterspot SET name='안목해변',"
            "catalog_source='TOURAPI_KOREAN',region='51:150',"
            "address='강원특별자치도 강릉시' WHERE id=1"
        )
        c.execute(
            "INSERT INTO pongdang_data.spots_waterspot"
            "(id,name,type,catalog_source,region,lat,lng) "
            "SELECT 1000+n,'Anmok Beach '||n||' (안목해변)','beach',"
            "'tourapi_english','51:150',37.805,128.909 "
            "FROM generate_series(1,105) AS n"
        )
        c.execute(
            "INSERT INTO pongdang_data.spots_waterspot"
            "(id,name,type,catalog_source,region,lat,lng) VALUES "
            "(2000,'安木海辺（안목해변）','beach','tourapi_japanese',"
            "'51:150',37.805,128.909)"
        )

    with TestClient(create_app(database)) as client:
        params = {"province": "gangwon", "kind": "beach", "page_size": 100}
        for extra in ({}, {"locale": "ko"}, {"locale": "ko", "q": "안목"}):
            response = client.get("/api/data/places", params={**params, **extra})
            assert response.status_code == 200, response.text
            page = response.json()
            assert page["total"] == 1
            assert not page["has_more"]
            assert [(r["id"], r["name"]) for r in page["rows"]] == [(1, "안목해변")]

        photos = client.get("/api/data/attachments", params={"spot_ids": "1"}).json()
        assert len(photos["items"]) == 1
        photo = photos["items"][0]
        assert photo["spot_id"] == 1
        image = client.get(photo["url"])
        assert image.status_code == 200
        assert image.headers["content-type"] == "image/png"

        english = client.get(
            "/api/data/places", params={**params, "locale": "en", "page": 2}
        ).json()
        assert english["total"] == 105
        assert len(english["rows"]) == 5
        assert not english["has_more"]
        assert all(row["name"].startswith("Anmok Beach") for row in english["rows"])
        japanese = client.get(
            "/api/data/places", params={**params, "locale": "ja"}
        ).json()
        assert [row["id"] for row in japanese["rows"]] == [2000]
        # Saved foreign-source IDs remain readable in details, not renamed or deleted.
        detail = client.get("/api/data/livecams/preview/places?spot_id=1001").json()
        assert detail[0]["name"] == "Anmok Beach 1 (안목해변)"
        assert client.get("/api/data/places?locale=invalid").status_code == 422
