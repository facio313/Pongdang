"""Offline URL validation and disposable-database place matching."""

import asyncio

import pytest
from pydantic import SecretStr

from app.config import Settings
from app.data_reader import DataReader
from app.livecams.preview import PreviewCamera, read_catalog_matches
from app.livecams.urls import windy_url
from app.livecams.windy import normalize
from app.schema import connect, initialize


def api_row(camera_id=1179853135, **updates):
    row = dict(
        webcamId=camera_id,
        title="OFFLINE FIXTURE · 주변 산 도로",
        status="active",
        lastUpdatedOn=None,
        location=dict(
            latitude=37.8001,
            longitude=128.9,
            country_code="KR",
            city="Fixture city",
            region="Fixture region",
        ),
        player={
            kind: f"https://webcams.windy.com/webcams/public//player?webcamId={camera_id}&playerType={kind}"
            for kind in ("live", "day")
        },
        urls=dict(
            detail=f"https://webcams.windy.com/webcams/{camera_id}",
            provider="https://private.example/?key=PRIVATE_PROVIDER",
        ),
        images=dict(current=dict(icon="https://images.example/a?token=PRIVATE_IMAGE")),
    )
    row.update(updates)
    return row


def test_official_v3_normalization_and_redaction():
    camera = normalize(api_row())
    assert camera.provider_updated_at is None
    assert camera.timezone is None and camera.description is None
    assert camera.photo_available and camera.live_player and camera.timelapse_player
    assert camera.timelapse_period == "day"
    assert "PRIVATE" not in camera.model_dump_json()
    assert "images.example" not in camera.model_dump_json()
    changed = api_row(
        player={"day": "https://evil.test/?token=SECRET"},
        urls={"detail": "https://user:secret@webcams.windy.com/webcams/1179853135"},
    )
    assert normalize(changed).timelapse_player is None
    assert normalize(changed).public_page is None
    assert normalize(dict(webcamId=1, title="minimal")).provider_status == "unknown"


@pytest.mark.parametrize(
    "url",
    [
        "http://webcams.windy.com/webcams/1",
        "https://webcams.windy.com.evil.test/webcams/1",
        "https://webcams.windy.com:444/webcams/1",
        "https://127.0.0.1/webcams/1",
        "https://user:pass@webcams.windy.com/webcams/1",
        "https://webcams.windy.com/webcams/1?key=x",
        "https://webcams.windy.com/webcams/1#key=x",
        "https://webcams.windy.com/webcams/../1",
        "https://webcams.windy.com/webcams/%31",
        "https://webcams.windy.com/webcams/2",
        "https://webcams.windy.com\\evil.test/webcams/1",
        "https://webcams.windy.com/webcams/1\n",
    ],
)
def test_exact_public_url_boundary(url):
    with pytest.raises(ValueError):
        windy_url(url, "1")


def test_player_query_allowlist():
    url = "https://webcams.windy.com/webcams/public//player?webcamId=1&playerType=day"
    assert windy_url(url, "1", player_type="day") == url
    for suffix in (
        "&key=secret",
        "&webcamId=1",
        "&redirect=https://evil.test",
        "#secret",
    ):
        with pytest.raises(ValueError):
            windy_url(url + suffix, "1", player_type="day")
    with pytest.raises(ValueError):
        windy_url(url, "1", player_type="live")
    with pytest.raises(ValueError):
        windy_url(url.replace("public//", "public/"), "1", player_type="day")


def test_current_api_response_urls_survive_normalization():
    detail = "https://windy.com/webcams/1744175137"
    prefix = "https://webcams.windy.com/webcams/public/embed/player/1744175137/"
    camera = normalize(
        api_row(
            1744175137,
            urls={"detail": detail},
            player={kind: prefix + kind for kind in ("day", "month", "year")},
        )
    )
    assert camera.public_page == detail
    assert camera.timelapse_player == prefix + "day"
    assert camera.timelapse_period == "day"
    assert camera.live_player is None
    for url in (
        prefix + "day?token=private",
        prefix + "day#private",
        prefix.replace("1744175137", "1") + "day",
        prefix.replace("webcams.windy.com", "windy.com") + "day",
        prefix.replace("webcams.windy.com", "webcams.windy.com:443") + "day",
        prefix + "day/../live",
    ):
        with pytest.raises(ValueError):
            windy_url(url, "1744175137", player_type="day")
    with pytest.raises(ValueError):
        windy_url(prefix + "day", "1744175137", player_type="live")


@pytest.fixture
def db():
    s = Settings()
    if s.postgres_db != "pongdang_test" or s.postgres_host not in {"127.0.0.1", "db"}:
        pytest.fail("Only disposable pongdang_test is permitted")
    initialize(s)
    yield s.model_copy(update={"windy_webcams_api_key": SecretStr("OFFLINE_TEST_KEY")})
    with connect(s) as c:
        c.execute("DROP SCHEMA pongdang_data CASCADE")


def add_place(db, *, kind="valley", coordinate=True):
    with connect(db) as c:
        spot = c.execute(
            "INSERT INTO pongdang_data.spots_waterspot(name,type,lat,lng,region) "
            "VALUES(%s,%s,%s,%s,'Fixture region') RETURNING id",
            [
                "OFFLINE FIXTURE · 계곡"
                if kind == "valley"
                else "OFFLINE FIXTURE · 해수욕장",
                kind,
                37.8 if coordinate else None,
                128.9 if coordinate else None,
            ],
        ).fetchone()[0]
    return dict(
        id=spot, lat=37.8 if coordinate else None, lng=128.9 if coordinate else None
    )


def test_water_catalog_matches_nearest_real_place_without_first_page_bias(db):
    with connect(db) as c:
        c.execute("""INSERT INTO pongdang_data.spots_waterspot(name,type,lat,lng)
            SELECT 'OFFLINE FIXTURE far beach ' || n, 'beach', 35, 127
            FROM generate_series(1,110) n""")
        c.execute("""INSERT INTO pongdang_data.spots_waterspot(name,type,lat,lng)
            VALUES ('OFFLINE FIXTURE cafe','collection_place',37.8001,128.9),
                   ('OFFLINE FIXTURE missing','beach',NULL,NULL),
                   ('OFFLINE FIXTURE beyond 10km','beach',37.799,130)""")
        before = c.execute(
            "SELECT count(*) FROM pongdang_data.spots_waterspot"
        ).fetchone()[0]
    nearby = add_place(db)
    cameras = [
        PreviewCamera(**normalize(api_row(n, location=location)).model_dump())
        for n, location in (
            (1, dict(latitude=37.8001, longitude=128.9, country_code="KR")),
            (2, dict(latitude=37.7, longitude=130, country_code="KR")),
            (3, dict(country_code="KR")),
            (4, dict(latitude=0, longitude=0, country_code="KR")),
        )
    ]
    matches = asyncio.run(read_catalog_matches(DataReader(db), cameras))
    assert set(matches) == {"1"}
    assert matches["1"].id == nearby["id"]
    assert matches["1"].place_kind == "valley"
    assert 0.01 < matches["1"].distance_km < 0.02
    with connect(db) as c:
        assert (
            c.execute("SELECT count(*) FROM pongdang_data.spots_waterspot").fetchone()[
                0
            ]
            == before + 1
        )
