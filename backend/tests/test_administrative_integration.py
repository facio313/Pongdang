import pytest
from test_administrative import Client, legal, response, settings

from app.config import Settings
from app.ingestion.administrative import ENDPOINT, collect_place_regions
from app.ingestion.http import ProviderError
from app.livecams.places import PLACE_SELECT
from app.schema import connect, initialize


@pytest.fixture
def database():
    config = Settings()
    if config.postgres_db != "pongdang_test":
        pytest.fail("Requires disposable pongdang_test database")
    initialize(config)
    yield config.model_copy(update={"kakao_rest_key": settings().kakao_rest_key})
    with connect(config) as connection:
        connection.execute("DROP SCHEMA pongdang_data CASCADE")


def add_place(database, *, address="", region="", kind="beach", lat=37.8, lng=128.9):
    with connect(database) as connection:
        return connection.execute(
            "INSERT INTO pongdang_data.spots_waterspot "
            "(name,type,address,region,lat,lng) VALUES ('원천 해변명',%s,%s,%s,%s,%s) "
            "RETURNING id",
            [kind, address, region, lat, lng],
        ).fetchone()[0]


def test_only_empty_address_region_water_places_receive_separate_evidence(database):
    unknown = add_place(database)
    addressed = add_place(database, address="강원특별자치도 강릉시")
    regional = add_place(database, region="51:150")
    facility = add_place(database, kind="facility")
    no_position = add_place(database, lat=None)
    client = Client(response(legal()))
    assert collect_place_regions(database, client=client) == {
        "state": "succeeded",
        "received": 1,
        "inserted": 1,
        "error": "",
    }
    assert len(client.calls) == 1
    with connect(database) as connection:
        raw = connection.execute(
            "SELECT name,type,address,region,lat,lng "
            "FROM pongdang_data.spots_waterspot "
            "WHERE id=%s",
            [unknown],
        ).fetchone()
        assert raw == ("원천 해변명", "beach", "", "", 37.8, 128.9)
        assert connection.execute(
            "SELECT spot_id,province_code,district_code,provider,provider_region_code,"
            "source_url FROM pongdang_data.collection_place_region"
        ).fetchall() == [
            (
                unknown,
                "gangwon",
                "gangneung",
                "KAKAO_LOCAL_REGIONS",
                "5115010100",
                ENDPOINT,
            )
        ]
        assert (
            connection.execute(
                "SELECT count(*) FROM pongdang_data.spots_waterspot WHERE id=ANY(%s)",
                [[addressed, regional, facility, no_position]],
            ).fetchone()[0]
            == 4
        )
    # Already verified places don't consume another provider call.
    assert collect_place_regions(database, client=Client())["received"] == 0


def test_unknown_response_stores_no_assignment(database):
    add_place(database)
    assert collect_place_regions(database, client=Client(response())) == {
        "state": "no_data",
        "received": 1,
        "inserted": 0,
        "error": "",
    }
    with connect(database) as connection:
        assert (
            connection.execute(
                "SELECT count(*) FROM pongdang_data.collection_place_region"
            ).fetchone()[0]
            == 0
        )


def test_second_provider_failure_does_not_commit_first_assignment(database):
    add_place(database)
    add_place(database)
    client = Client(response(legal()), ProviderError("HTTP_503"))
    with pytest.raises(ProviderError, match="HTTP_503"):
        collect_place_regions(database, client=client)
    with connect(database) as connection:
        assert (
            connection.execute(
                "SELECT count(*) FROM pongdang_data.collection_place_region"
            ).fetchone()[0]
            == 0
        )


@pytest.mark.parametrize(
    "change", ["lat=37.7", "address='새 원천 주소'", "region='51:110'"]
)
def test_changed_source_while_resolving_is_not_counted_as_inserted(database, change):
    identity = add_place(database)

    def mutate_source():
        with connect(database) as connection:
            connection.execute(
                "UPDATE pongdang_data.spots_waterspot SET " + change + " WHERE id=%s",
                [identity],
            )

    client = Client(response(legal()), callback=mutate_source)
    result = collect_place_regions(database, client=client)
    assert result["inserted"] == 0 and result["state"] == "no_data"
    with connect(database) as connection:
        assert (
            connection.execute(
                "SELECT count(*) FROM pongdang_data.collection_place_region"
            ).fetchone()[0]
            == 0
        )


def test_coordinate_change_invalidates_old_evidence_and_can_be_refreshed(database):
    identity = add_place(database)
    collect_place_regions(database, client=Client(response(legal())))
    with connect(database) as connection:
        assert (
            connection.execute(
                "SELECT verified_province_code FROM ("
                + PLACE_SELECT
                + ") p WHERE id=%s",
                [identity],
            ).fetchone()[0]
            == "gangwon"
        )
        connection.execute(
            "UPDATE pongdang_data.spots_waterspot SET lat=37.7 WHERE id=%s", [identity]
        )
        assert (
            connection.execute(
                "SELECT verified_province_code FROM ("
                + PLACE_SELECT
                + ") p WHERE id=%s",
                [identity],
            ).fetchone()[0]
            is None
        )
    result = collect_place_regions(
        database, client=Client(response(legal("5111010100")))
    )
    assert result["inserted"] == 1
    with connect(database) as connection:
        assert connection.execute(
            "SELECT district_code,latitude FROM pongdang_data.collection_place_region "
            "WHERE spot_id=%s",
            [identity],
        ).fetchone() == ("chuncheon", 37.7)
