"""On-demand preview checks use injected provider responses, never live API keys."""

import io
import json
from urllib.parse import parse_qs, urlsplit

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

from app.config import Settings
from app.livecams.preview import (
    WATER_CATEGORIES,
    NearbyPlace,
    PreviewService,
    create_preview_router,
)
from app.livecams.windy import WindyClient, WindyError


def config(**updates):
    return Settings(
        _env_file=None,
        postgres_password="test-only",
        windy_webcams_api_key=updates.pop("windy_webcams_api_key", "OFFLINE_SECRET"),
        **updates,
    )


def camera(**updates):
    row = dict(
        webcamId=42,
        title="Offline contract fixture",
        status="active",
        categories=[{"id": "coast"}],
        location=dict(latitude=37.8, longitude=128.9, country_code="KR"),
        urls={
            "detail": "https://windy.com/webcams/42",
            "provider": "https://private.test/?key=SECRET",
        },
        player={"day": "https://webcams.windy.com/webcams/public/embed/player/42/day"},
        images={"current": {"icon": "https://private.test/?token=SECRET"}},
    )
    return row | updates


class Client:
    def __init__(self, rows=None):
        self.rows = [camera()] if rows is None else rows
        self.calls = []
        self.error = None

    def sample(self):
        self.calls.append("sample")
        if self.error:
            raise self.error
        return dict(total=len(self.rows), webcams=self.rows)

    def list_page(self, page=1, category=None):
        return self.sample()

    def nearby(self, lat, lng, radius):
        self.calls.append((lat, lng, radius))
        if self.error:
            raise self.error
        return dict(total=len(self.rows), webcams=self.rows)


def place(**updates):
    return (
        dict(
            id=7,
            name="Offline place fixture",
            place_kind="beach",
            address=None,
            region=None,
            lat=37.8,
            lng=128.9,
        )
        | updates
    )


def service(client=None, **settings):
    return PreviewService(
        config(**settings), client=client or Client(), sleep=lambda _: None
    )


def app_client(s, read_places=None, read_matches=None):
    async def forbidden(*args, **kwargs):
        raise AssertionError("Catalog must not read the place picker")

    async def no_matches(*args):
        return {}

    app = FastAPI()
    app.include_router(
        create_preview_router(
            s.settings,
            service=s,
            read_places=read_places or forbidden,
            read_matches=read_matches or no_matches,
        )
    )
    return TestClient(app)


def test_country_preview_works_without_webcam_schema_and_redacts_payloads():
    s = service()
    http = app_client(s)
    first = http.post("/api/data/livecams/preview", json={})
    assert first.status_code == 200
    row = first.json()["rows"][0]
    assert row["timelapse_player"].endswith("/42/day")
    assert row["relationship"] == "unknown" and row["playback_verified"] is False
    assert row["live_player"] is None and row["photo_available"]
    assert not any(
        secret in first.text for secret in ("SECRET", "private.test", "token=")
    )
    second = http.post("/api/data/livecams/preview", json={})
    assert second.json()["cached"] is True
    assert second.json()["fetched_at"] == first.json()["fetched_at"]
    assert second.json()["valid_until"] == first.json()["valid_until"]
    assert s.client.calls == ["sample"] * 5
    assert first.headers["cache-control"] == "no-store"


def test_expired_success_is_not_extended_or_returned_after_failure():
    now = [1_800_000_000.0]
    client = Client()
    s = PreviewService(
        config(), client=client, clock=lambda: now[0], sleep=lambda _: None
    )
    first = s.query()
    now[0] += 601
    client.error = WindyError("WINDY_HTTP_503")
    with pytest.raises(WindyError, match="WINDY_HTTP_503"):
        s.query()
    with pytest.raises(WindyError, match="WINDY_BACKOFF"):
        s.query()
    assert len(client.calls) == 6
    assert s.cache[("water",)].valid_until == first.valid_until


@pytest.mark.parametrize(
    "code,status",
    [
        ("WINDY_HTTP_401", 502),
        ("WINDY_HTTP_403", 502),
        ("WINDY_HTTP_429", 429),
        ("WINDY_NETWORK_ERROR", 502),
        ("WINDY_INVALID_RESPONSE", 502),
    ],
)
def test_provider_failures_are_explicit_and_backed_off(code, status):
    s = service()
    s.client.error = WindyError(code)
    http = app_client(s)
    response = http.post("/api/data/livecams/preview", json={})
    assert response.status_code == status and response.json()["detail"] == code
    assert int(response.headers["retry-after"]) >= 60
    assert not s.cache
    assert http.post("/api/data/livecams/preview", json={}).status_code == 429
    assert len(s.client.calls) == 1


def test_missing_key_budget_and_inflight_requests_never_call_provider():
    for settings, status in [
        ({"windy_webcams_api_key": ""}, 503),
        ({"windy_webcams_daily_budget": 0}, 429),
    ]:
        s = service(**settings)
        assert (
            app_client(s).post("/api/data/livecams/preview", json={}).status_code
            == status
        )
        assert not s.client.calls
    s = service()
    with s.lock:
        assert (
            app_client(s).post("/api/data/livecams/preview", json={}).status_code == 429
        )
    assert not s.client.calls


def test_place_lookup_uses_collected_coordinates_and_only_nearby_relationship():
    reads = []

    async def read(_reader, **kwargs):
        reads.append(kwargs)
        return [place()]

    s = service()
    response = app_client(s, read).post(
        "/api/data/livecams/preview", json={"spot_id": 7}
    )
    assert response.status_code == 200
    assert reads == [{"spot_id": 7}]
    assert s.client.calls == [(37.8, 128.9, 2.0)]
    assert response.json()["rows"][0]["relationship"] == "nearby"
    assert response.json()["place"]["id"] == 7


def test_empty_nearby_expands_only_three_radii_and_caches_empty_success():
    s = service(Client([]))
    result = s.query(place())
    assert result.rows == [] and result.radius_km == 10
    assert [item[2] for item in s.client.calls] == [2, 5, 10]
    assert s.query(place()).cached
    assert len(s.client.calls) == 3


@pytest.mark.parametrize(
    "values", [{"lat": None}, {"lng": float("nan")}, {"lat": 0, "lng": 0}]
)
def test_missing_coordinates_never_call_windy(values):
    s = service()
    with pytest.raises(HTTPException) as exc:
        s.query(place(**values))
    assert exc.value.detail == "WEBCAM_COORDINATES_MISSING"
    assert not s.client.calls


def test_get_and_arbitrary_queries_do_not_trigger_provider():
    s = service()
    http = app_client(s)
    assert http.get("/api/data/livecams/preview").status_code == 405
    for body in (
        {"url": "https://private.test"},
        {"spot_id": -1},
        {"offset": 10},
        {"page": 41},
        {"page": 0},
        {"category": "unknown"},
        {"category": "city"},
        {"category": "traffic"},
        {"category": "landscape"},
        {"page": 6},
        {"spot_id": 7, "page": 2},
    ):
        assert http.post("/api/data/livecams/preview", json=body).status_code == 422
    assert (
        http.post(
            "/api/data/livecams/preview",
            json={},
            headers={"Origin": "https://evil.test"},
        ).status_code
        == 403
    )
    assert not s.client.calls


def test_country_scope_filters_foreign_records_and_rejects_conflicts_and_secrets():
    s = service(
        Client(
            [camera(), camera(), camera(webcamId=43, location={"country_code": "JP"})]
        )
    )
    assert len(s.query().rows) == 1
    for rows, code in [
        ([camera(), camera(title="Conflicting")], "WINDY_CONFLICTING_CAMERA"),
        ([camera(title="OFFLINE_SECRET")], "WINDY_PRIVATE_DATA_REJECTED"),
    ]:
        with pytest.raises(WindyError, match=code):
            service(Client(rows)).query()


def test_sample_adapter_has_fixed_country_limit_and_header_only_credentials():
    class Opener:
        def open(self, request, timeout):
            params = parse_qs(urlsplit(request.full_url).query)
            assert params["limit"] == ["10"] and params["countries"] == ["KR"]
            assert params["offset"] == ["0"] and "nearby" not in params
            assert "OFFLINE_SECRET" not in request.full_url
            assert request.get_header("X-windy-api-key") == "OFFLINE_SECRET"
            return io.BytesIO(json.dumps(dict(total=0, webcams=[])).encode())

    assert WindyClient(config(), opener=Opener()).sample() == dict(total=0, webcams=[])


def test_discovery_float_radius_is_serialized_without_trailing_decimal():
    class Opener:
        def open(self, request, timeout):
            params = parse_qs(urlsplit(request.full_url).query)
            assert params["nearby"] == ["37.8,128.9,2"]
            return io.BytesIO(b'{"total":0,"webcams":[]}')

    WindyClient(config(), opener=Opener()).nearby(37.8, 128.9, 2.0)


def test_water_union_deduplicates_and_pages_and_filters_share_cache():
    class Catalog(Client):
        def list_page(self, page=1, category=None):
            self.calls.append((page, category))
            rows = [
                camera(webcamId=n, categories=[{"id": category}])
                for n in range(
                    WATER_CATEGORIES.index(category) * 25 + 100,
                    WATER_CATEGORIES.index(category) * 25 + 125,
                )
            ]
            return dict(total=60, webcams=rows)

    s = service(Catalog())
    http = app_client(s)
    result = http.post("/api/data/livecams/preview", json={"page": 2}).json()
    assert result["scope"] == "korea_list" and result["page_size"] == 25
    assert result["page"] == 2 and result["has_more"]
    assert result["total"] == 125 and result["truncated"]
    assert len(result["rows"]) == 25
    assert s.client.calls == [(1, category) for category in WATER_CATEGORIES]
    assert http.post("/api/data/livecams/preview", json={"page": 2}).json()["cached"]
    last = http.post("/api/data/livecams/preview", json={"page": 5}).json()
    assert last["has_more"] is False
    coast = http.post(
        "/api/data/livecams/preview", json={"page": 1, "category": "coast"}
    ).json()
    assert coast["category"] == "coast" and coast["cached"] is True
    assert coast["total"] == 25 and not coast["has_more"]
    assert all("coast" in row["categories"] for row in coast["rows"])
    assert len(s.client.calls) == 5


def test_only_water_categories_survive_including_mixed_port_but_not_airport():
    s = service(
        Client(
            [
                camera(webcamId=1, categories=[{"id": "city"}, {"id": "traffic"}]),
                camera(webcamId=2, categories=[]),
                camera(webcamId=3, title="Jeju International Airport"),
                camera(webcamId=4, categories=[{"id": "coast"}, {"id": "airport"}]),
                camera(webcamId=5, categories=[{"id": "port"}, {"id": "traffic"}]),
                camera(webcamId=5, categories=[{"id": "port"}, {"id": "traffic"}]),
            ]
        )
    )
    assert [c.provider_camera_id for c in s.query().rows] == ["5"]
    assert [c.provider_camera_id for c in s.query(place()).rows] == ["5"]


def test_nearby_collected_places_rank_before_unmatched_and_failure_stays_explicit():
    s = service(Client([camera(webcamId=n) for n in range(1, 31)]))

    async def matches(*args):
        return {
            "30": NearbyPlace(
                id=99, name="Existing beach", place_kind="beach", distance_km=2
            )
        }

    result = (
        app_client(s, read_matches=matches)
        .post("/api/data/livecams/preview", json={})
        .json()
    )
    assert result["rows"][0]["provider_camera_id"] == "30"
    assert result["rows"][0]["nearby_place"]["id"] == 99
    assert result["rows"][0]["relationship"] == "unknown"
    assert result["matched_total"] == 1 and result["matching_status"] == "available"

    async def unavailable(*args):
        raise HTTPException(503, "Database unavailable")

    failed = (
        app_client(s, read_matches=unavailable)
        .post("/api/data/livecams/preview", json={})
        .json()
    )
    assert failed["matching_status"] == "unavailable" and failed["total"] == 30
    assert failed["matched_total"] == 0 and failed["cached"]


def test_partial_water_fetch_failure_never_caches_incomplete_success():
    class Failing(Client):
        def list_page(self, page=1, category=None):
            if category == "lake":
                raise WindyError("WINDY_HTTP_503")
            return super().list_page(page, category)

    s = service(Failing())
    with pytest.raises(WindyError, match="WINDY_HTTP_503"):
        s.query()
    assert not s.cache


def test_catalog_adapter_sends_bounded_offset_and_approved_category():
    class Opener:
        def open(self, request, timeout):
            params = parse_qs(urlsplit(request.full_url).query)
            assert params["limit"] == ["25"] and params["offset"] == ["25"]
            assert params["countries"] == ["KR"] and params["categories"] == ["coast"]
            return io.BytesIO(b'{"total":0,"webcams":[]}')

    WindyClient(config(), opener=Opener()).list_page(2, "coast")
