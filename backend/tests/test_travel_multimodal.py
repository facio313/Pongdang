"""Official Map REST contracts with local HTTP doubles; no DB/provider calls."""

import asyncio
import copy
from datetime import UTC, datetime, timedelta

import httpx
import pytest

from app.config import Settings
from app.travel import keywords
from app.travel.directions import DirectionError, KakaoDirections, parse_map
from app.travel.mobility import course_transport_advice, transport_advice
from app.travel.models import TravelRequest


def map_response(mode):
    route = {
        "properties": {"totalDistance": 4025, "totalTime": 3914},
        "steps": [{"path": {"points": [[127.11, 37.39], [127.12, 37.4]]}}],
    }
    if mode == "transit":
        route["properties"]["fare"] = {"value": 1500}
        slower = copy.deepcopy(route)
        slower["properties"]["totalTime"] = 7000
        return {"status": "OK", "routes": [slower, route]}
    route["legs"] = [{"steps": route.pop("steps")}]
    return {"status": "OK", "route": route}


@pytest.mark.parametrize(
    "mode,path",
    [("walking", "walk"), ("cycling", "bicycle"), ("transit", "publictraffic")],
)
def test_map_modes_use_official_contract_and_reuse_geometry(mode, path):
    now = datetime.now(UTC)
    departure = now + timedelta(days=1)
    calls = []

    def handler(request):
        calls.append(request)
        assert request.url.host == "dapi.kakao.com"
        assert request.url.path == "/v2/routing/" + path
        assert dict(request.url.params) == {
            "start_x": "127.11",
            "start_y": "37.39",
            "end_x": "127.12",
            "end_y": "37.4",
            "input_coord": "WGS84",
            "output_coord": "WGS84",
        }
        assert request.headers["Authorization"] == "KakaoAK test-map-key"
        return httpx.Response(200, json=map_response(mode))

    async def run():
        settings = Settings(
            _env_file=None,
            postgres_password="unused-unit-test",
            kakao_rest_api_key="test-map-key",
        )
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            directions = KakaoDirections(settings, now, mode=mode, client=client)
            origin, destination = (
                {"longitude": 127.11, "latitude": 37.39},
                {"longitude": 127.12, "latitude": 37.4},
            )
            summary = await directions.leg(origin, destination, departure)
            detail = await directions.leg(origin, destination, departure, geometry=True)
            assert summary["polyline"] == []
            assert detail["polyline"] == [origin, destination]
            assert detail["mode"] == mode
            assert detail["duration_seconds"] == 3914
            assert detail["distance_m"] == 4025
            assert detail["time_basis"] == "provider_estimate_without_departure_time"
            assert detail["source_record_id"] is None
            assert detail["toll_krw"] is None
            assert detail["fare_krw"] == (1500 if mode == "transit" else None)
            assert "test-map-key" not in str(detail)
            assert directions.calls == 1

    asyncio.run(run())
    assert len(calls) == 1


@pytest.mark.parametrize(
    "status", ["NO_RESULTS", "TOO_FAR_AWAY", "SAME_POINT", "INVALID_REQUEST"]
)
def test_non_success_map_result_never_fabricates_a_route(status):
    with pytest.raises(DirectionError, match="route_not_found"):
        parse_map({"status": status}, datetime.now(UTC), datetime.now(UTC), "walking")


@pytest.mark.parametrize("bad", [-1, None, True, "30"])
def test_map_measurements_must_have_valid_provider_units(bad):
    data = map_response("walking")
    data["route"]["properties"]["totalTime"] = bad
    with pytest.raises(DirectionError, match="invalid_route_measurements"):
        parse_map(data, datetime.now(UTC), datetime.now(UTC), "walking")


@pytest.mark.parametrize("status", [401, 403, 429])
def test_map_authentication_and_quota_failure_are_not_car_fallbacks(status):
    calls = []

    def handler(request):
        calls.append(request.url.path)
        return httpx.Response(status, json={"msg": "private provider error"})

    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            now = datetime.now(UTC)
            adapter = KakaoDirections(
                Settings(
                    _env_file=None,
                    postgres_password="unused-unit-test",
                    kakao_rest_api_key="test",
                ),
                now,
                client=client,
                mode="cycling",
            )
            with pytest.raises(DirectionError) as error:
                await adapter.leg(
                    {"longitude": 127, "latitude": 37},
                    {"longitude": 128, "latitude": 38},
                    now,
                )
            assert "private" not in str(error.value)
            assert str(error.value) == (
                "route_provider_quota_exceeded"
                if status == 429
                else "route_provider_authentication_failed"
            )

    asyncio.run(run())
    assert calls == ["/v2/routing/bicycle"]


def test_explicit_transport_keyword_and_distance_advice_do_not_claim_routes():
    request = keywords.normalize(
        TravelRequest(
            keyword_selection=[{"category": "transport", "values": ["cycling"]}]
        )
    )
    assert request.transport == "cycling"
    place = {"latitude": 37.1, "longitude": 127.1}
    assert transport_advice(request, place)["suggested_transport"] is None
    request = request.model_copy(
        update={
            "origin": TravelRequest(
                origin={"label": "Origin", "latitude": 37.101, "longitude": 127.101}
            ).origin
        }
    )
    advice = transport_advice(request, place)
    assert advice["suggested_transport"] == "walking"
    assert advice["route_verified"] is False
    assert advice["alternatives_compared"] is False
    assert advice["selected_transport"] == "cycling"
    assert (
        course_transport_advice(request, request.origin.model_dump(), [place])[
            "suggested_transport"
        ]
        == "walking"
    )


def test_incomplete_geometry_is_not_replaced_with_a_straight_line():
    data = map_response("walking")
    data["route"]["legs"][0]["steps"][0]["path"]["points"] = []
    with pytest.raises(DirectionError, match="route_geometry_missing"):
        parse_map(data, datetime.now(UTC), datetime.now(UTC), "walking")
