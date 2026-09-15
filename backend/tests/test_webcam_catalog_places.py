"""Offline provider URL validation for the location-independent camera catalog."""

import pytest

from app.livecams.urls import windy_url
from app.livecams.windy import normalize


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
