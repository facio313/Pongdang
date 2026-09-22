"""Nearest comparison candidates use real catalogue identity and coordinates."""

import pytest
from fastapi.testclient import TestClient
from test_place_identity_integration import identity_db as identity_db

from app.main import create_app
from app.schema import connect


def place(c, name, kind="beach", lat=37.8, lng=128.9):
    return c.execute(
        "INSERT INTO pongdang_data.spots_waterspot(name,type,lat,lng) "
        "VALUES(%s,%s,%s,%s) RETURNING id",
        [name, kind, lat, lng],
    ).fetchone()[0]


def alias(c, alias_id, canonical):
    c.execute(
        "INSERT INTO pongdang_data.place_alias(spot_id,canonical_spot_id) "
        "VALUES(%s,%s)",
        [alias_id, canonical],
    )


@pytest.mark.parametrize("kind", ["beach", "valley"])
def test_nearest_same_kind_across_whole_catalog_excludes_all_aliases(identity_db, kind):
    with connect(identity_db) as c:
        reference = place(c, "기준", kind)
        reference_alias = place(c, "기준 제공처 중복", kind)
        alias(c, reference_alias, reference)
        for index in range(105):
            place(c, f"AAA 먼 장소 {index}", kind, lat=36)
        place(c, "다른 유형", "valley" if kind == "beach" else "beach")
        place(c, "좌표 없음", kind, lat=None)
        place(c, "유효하지 않은 좌표", kind, lat=100)
        place(c, "영점 좌표", kind, lat=0, lng=0)
        second = place(c, "두 번째 거리", kind, lat=37.82)
        closest = place(c, "가장 가까움", kind, lat=37.801)
        duplicate = place(c, "가까운 장소 제공처 중복", kind, lat=37.801)
        alias(c, duplicate, closest)
        before = c.execute(
            "SELECT count(*) FROM pongdang_data.spots_waterspot"
        ).fetchone()
    with TestClient(create_app(identity_db)) as client:
        for selected in (reference, reference_alias):
            response = client.get(
                "/api/data/places/nearby", params={"spot_id": selected}
            )
            assert response.status_code == 200, response.text
            body = response.json()
            assert body["status"] == "ready"
            assert [row["id"] for row in body["rows"]] == [closest, second]
            assert {row["place_kind"] for row in body["rows"]} == {kind}
    with connect(identity_db) as c:
        assert (
            c.execute("SELECT count(*) FROM pongdang_data.spots_waterspot").fetchone()
            == before
        )


@pytest.mark.parametrize(
    "coordinates", [(None, 128.9), (37.8, None), (0, 0), (91, 128.9)]
)
def test_missing_reference_coordinates_never_invent_neighbours(
    identity_db, coordinates
):
    with connect(identity_db) as c:
        reference = place(c, "좌표 없는 기준", lat=coordinates[0], lng=coordinates[1])
        place(c, "다른 장소")
    with TestClient(create_app(identity_db)) as client:
        body = client.get(
            "/api/data/places/nearby", params={"spot_id": reference}
        ).json()
    assert body == {"rows": [], "status": "coordinates_unavailable"}


def test_short_catalog_and_distance_ties_are_stable(identity_db):
    with connect(identity_db) as c:
        reference = place(c, "기준")
    with TestClient(create_app(identity_db)) as client:

        def ids():
            return [
                r["id"]
                for r in client.get(
                    "/api/data/places/nearby", params={"spot_id": reference}
                ).json()["rows"]
            ]

        assert ids() == []
        with connect(identity_db) as c:
            first = place(c, "동거리 첫 장소", lat=37.81)
        assert ids() == [first]
        with connect(identity_db) as c:
            second = place(c, "동거리 다음 장소", lat=37.81)
            place(c, "동거리 세 번째 장소", lat=37.81)
        assert ids() == [first, second]
        assert (
            client.get(
                "/api/data/places/nearby", params={"spot_id": 999999}
            ).status_code
            == 404
        )
        assert (
            client.get("/api/data/places/nearby", params={"spot_id": 0}).status_code
            == 422
        )
