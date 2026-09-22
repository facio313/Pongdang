"""Default selection uses actual stored evidence, not a local fixture spot ID."""

from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient
from test_condition_score_integration import counts, source
from test_condition_score_integration import database as database

from app.ingestion.storage import store_batch
from app.main import create_app
from app.schema import connect
from app.water_index.condition_producer import produce_conditions


def beach(settings, name, *, stale=False, missing=False):
    now = datetime.now(UTC)
    batch = source(
        provider="khoa_beach",
        kind="beach",
        mode="forecast",
        station_id=name,
        source_id=name,
        observed_at=now - timedelta(hours=2),
        valid_until=now + timedelta(hours=-1 if stale else 10),
    )
    reading = batch.readings[0]
    station = reading.station.model_copy(update={"name": name, "region": ""})
    values = (
        [
            v.model_copy(update={"numeric_value": None, "is_missing": True})
            for v in reading.values
        ]
        if missing
        else reading.values
    )
    batch = batch.model_copy(
        update={
            "readings": [
                reading.model_copy(update={"station": station, "values": values})
            ]
        }
    )
    store_batch(settings, batch)
    with connect(settings) as c:
        return c.execute(
            "SELECT spot_id FROM pongdang_data.collection_station WHERE source_id=%s",
            [name],
        ).fetchone()[0]


def test_gyeongpo_without_region_or_place_catalog_is_selected_with_forecast(database):
    spot = beach(database, "경포")
    # Fixture setup reproduces the worker pass; the following HTTP reads stay read-only.
    produce_conditions(database)
    before = counts(database)
    with TestClient(create_app(database)) as client:
        assert (
            client.get("/api/data/livecams/preview/places", params={"q": "강릉"}).json()
            == []
        )
        response = client.get("/api/data/water-index/default-place")
        assert response.status_code == 200
        result = response.json()
        assert result["status"] == "preferred"
        assert result["place"]["id"] == spot
        assert result["place"]["name"] == "경포"
        assert result["display_name"] == "강릉 경포대 해수욕장"
        score = client.get(
            "/api/data/water-index/conditions",
            params={"spot_id": spot, "activity": "swim", "mode": "forecast"},
        ).json()
        assert score["condition_score"]["score"] is not None
        assert response.headers["cache-control"] == "no-store"
    assert counts(database) == before


def test_gyeongpo_aliases_collapse_without_other_beaches(database):
    canonical = beach(database, "경포해수욕장")
    beach(database, "송정해변")
    beach(database, "주문진해수욕장")
    with connect(database) as c:
        for _ in range(2):
            alias = c.execute(
                "INSERT INTO pongdang_data.spots_waterspot(name,type) "
                "VALUES('경포해수욕장','beach') RETURNING id"
            ).fetchone()[0]
            c.execute(
                "INSERT INTO pongdang_data.place_alias(spot_id,canonical_spot_id) "
                "VALUES(%s,%s)",
                [alias, canonical],
            )
    produce_conditions(database)
    with TestClient(create_app(database)) as client:
        result = client.get("/api/data/water-index/default-place").json()
    assert result["place"]["id"] == canonical
    assert [row["id"] for row in result["rows"]] == [canonical]
    assert result["candidates_checked"] == 1


def test_stale_gyeongpo_stays_selected_when_another_beach_has_data(database):
    spot = beach(database, "경포", stale=True)
    beach(database, "해운대해수욕장")
    produce_conditions(database)
    with TestClient(create_app(database)) as client:
        result = client.get("/api/data/water-index/default-place").json()
        assert result["status"] == "no_current_data"
        assert result["place"]["id"] == spot
        assert result["display_name"] == "강릉 경포대 해수욕장"
        assert [row["id"] for row in result["rows"]] == [spot]


def test_missing_gyeongpo_evidence_does_not_switch_to_another_beach(database):
    spot = beach(database, "경포", missing=True)
    beach(database, "대천해수욕장")
    produce_conditions(database)
    with TestClient(create_app(database)) as client:
        result = client.get("/api/data/water-index/default-place").json()
        assert result["status"] == "no_current_data"
        assert result["place"]["id"] == spot
        assert [row["id"] for row in result["rows"]] == [spot]


def test_empty_database_returns_explicit_no_data_without_inventing_a_place(database):
    before = counts(database)
    with TestClient(create_app(database)) as client:
        result = client.get("/api/data/water-index/default-place").json()
        assert result["status"] == "no_places"
        assert result["place"] is None and result["rows"] == []
        assert result["display_name"] == "강릉 경포대 해수욕장"
        assert "수집된 해수욕장이 없습니다" in result["message"]
    assert counts(database) == before


def test_all_stale_keeps_preferred_name_but_does_not_claim_available_data(database):
    spot = beach(database, "경포", stale=True)
    beach(database, "해운대해수욕장", stale=True)
    produce_conditions(database)
    with TestClient(create_app(database)) as client:
        result = client.get("/api/data/water-index/default-place").json()
        assert result["status"] == "no_current_data"
        assert result["place"]["id"] == spot
