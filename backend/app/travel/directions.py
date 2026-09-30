"""Pongdang-owned adapters for official Kakao driving and map routes.

https://developers.kakaomobility.com/guide/navi-api/directions
https://developers.kakaomobility.com/guide/navi-api/future
https://developers.kakao.com/docs/ko/kakaomap/rest-api
"""

import asyncio
import json
import math
from datetime import UTC, datetime, timedelta

import httpx

from app.travel.catalog import KST

ENDPOINT = "https://apis-navi.kakaomobility.com/v1/"
DOCS = "https://developers.kakaomobility.com/guide/navi-api/"
MAP_ENDPOINT = "https://dapi.kakao.com/v2/routing/"
MAP_DOCS = "https://developers.kakao.com/docs/ko/kakaomap/rest-api"
MAP_PATHS = {"walking": "walk", "cycling": "bicycle", "transit": "publictraffic"}
MAX_CALLS = 36


def _route_key(settings):
    # Keep the collection key independent. Existing installations can continue
    # using it until a dedicated KAKAO_REST_API_KEY is configured for routing.
    return (
        settings.kakao_rest_api_key.get_secret_value().strip()
        or settings.kakao_rest_key.get_secret_value().strip()
    )


def availability(settings):
    if settings.travel_route_provider == "disabled":
        return "disabled"
    return "configured" if _route_key(settings) else "unconfigured"


class DirectionError(ValueError):
    pass


def coordinate(value):
    lat, lng = value["latitude"], value["longitude"]
    if any(
        type(v) not in {int, float} or not math.isfinite(v) for v in (lat, lng)
    ) or not (-90 <= lat <= 90 and -180 <= lng <= 180):
        raise DirectionError("invalid_route_coordinates")
    return f"{lng},{lat}"


class KakaoDirections:
    def __init__(self, settings, now, *, client=None, mode="driving"):
        if mode not in {"driving", *MAP_PATHS}:
            raise DirectionError("route_transport_not_configured")
        self.settings, self.now = settings, now
        self.mode = mode
        self.status = availability(settings)
        self.client = client
        self.calls = 0
        self.gate = asyncio.Semaphore(3)
        # Map REST always returns geometry: reuse the same provider response
        # for the selected path instead of calling it again after ranking.
        self.map_results = {}

    async def leg(self, origin, destination, departure, *, geometry=False):
        if self.status != "configured":
            raise DirectionError("route_provider_" + self.status)
        origin_text, destination_text = coordinate(origin), coordinate(destination)
        if departure < self.now - timedelta(minutes=5):
            raise DirectionError("route_departure_in_past")
        cache_key = (origin_text, destination_text)
        if self.mode in MAP_PATHS and cache_key in self.map_results:
            result = self.map_results[cache_key]
            return result if geometry else {**result, "polyline": []}
        if self.calls >= MAX_CALLS:
            raise DirectionError("route_request_call_limit")
        self.calls += 1
        future = departure.replace(second=0, microsecond=0) > self.now
        path = "future/directions" if future else "directions"
        params = {
            "origin": origin_text,
            "destination": destination_text,
            "priority": "TIME",
            "summary": "false" if geometry else "true",
            "alternatives": "false",
            "roadevent": "0",
        }
        if future:
            params["departure_time"] = departure.astimezone(KST).strftime("%Y%m%d%H%M")
        endpoint = ENDPOINT + path
        if self.mode in MAP_PATHS:
            endpoint = MAP_ENDPOINT + MAP_PATHS[self.mode]
            params = {
                "start_x": str(origin["longitude"]),
                "start_y": str(origin["latitude"]),
                "end_x": str(destination["longitude"]),
                "end_y": str(destination["latitude"]),
                "input_coord": "WGS84",
                "output_coord": "WGS84",
            }
        headers = {"Authorization": "KakaoAK " + _route_key(self.settings)}
        async with self.gate:
            try:
                if self.status != "configured":
                    raise DirectionError("route_provider_" + self.status)
                if self.client:
                    data = await self._read(self.client, endpoint, params, headers)
                else:
                    async with httpx.AsyncClient(
                        timeout=5, follow_redirects=False, trust_env=False
                    ) as client:
                        data = await self._read(client, endpoint, params, headers)
                fetched = datetime.now(UTC)
                if self.mode in MAP_PATHS:
                    result = parse_map(data, departure, fetched, self.mode)
                    self.map_results[cache_key] = result
                    return result if geometry else {**result, "polyline": []}
                return parse(data, departure, fetched, future, geometry)
            except DirectionError:
                raise
            except httpx.HTTPError, ValueError, KeyError, TypeError, IndexError:
                raise DirectionError("route_upstream_unavailable_or_invalid") from None

    async def _read(self, client, endpoint, params, headers):
        async with client.stream(
            "GET", endpoint, params=params, headers=headers
        ) as response:
            if response.status_code in {401, 403}:
                self.status = "authentication_failed"
                raise DirectionError("route_provider_authentication_failed")
            if response.status_code == 429:
                self.status = "quota_exceeded"
                raise DirectionError("route_provider_quota_exceeded")
            if response.status_code != 200:
                raise DirectionError("route_upstream_failed")
            raw = bytearray()
            async for chunk in response.aiter_bytes():
                raw.extend(chunk)
                if len(raw) > 1_000_000:
                    raise DirectionError("route_response_too_large")
            return json.loads(raw)


def parse(data, departure, fetched, future, geometry):
    route = data["routes"][0]
    if type(route.get("result_code")) is not int or route["result_code"] != 0:
        raise DirectionError("route_not_found")
    summary = route["summary"]
    distance, duration = summary["distance"], summary["duration"]
    if (
        type(distance) is not int
        or type(duration) is not int
        or not (0 < distance < 1_500_000 and 0 < duration <= 86400)
    ):
        raise DirectionError("invalid_route_measurements")
    source_id = data["trans_id"]
    if not isinstance(source_id, str) or not 1 <= len(source_id) <= 200:
        raise DirectionError("route_source_id_missing")
    toll = summary.get("fare", {}).get("toll")
    if toll is not None and (type(toll) is not int or toll < 0):
        raise DirectionError("invalid_toll")
    polyline = []
    if geometry:
        for section in route.get("sections", []):
            for road in section.get("roads", []):
                vertices = road.get("vertexes", [])
                if len(vertices) % 2:
                    raise DirectionError("invalid_route_geometry")
                for index in range(0, len(vertices), 2):
                    point = {
                        "longitude": vertices[index],
                        "latitude": vertices[index + 1],
                    }
                    coordinate(point)
                    if not polyline or point != polyline[-1]:
                        polyline.append(point)
                    if len(polyline) > 20000:
                        raise DirectionError("route_geometry_too_large")
        if not polyline:
            raise DirectionError("route_geometry_missing")
    return {
        "provider": "kakao_mobility",
        "mode": "driving",
        "source_record_id": source_id,
        "source_url": DOCS + ("future" if future else "directions"),
        "reference_departure_at": departure.isoformat(),
        "fetched_at": fetched.isoformat(),
        "valid_until": (fetched + timedelta(minutes=5)).isoformat(),
        "duration_seconds": duration,
        "distance_m": distance,
        "toll_krw": toll,
        "time_basis": "provider_future_estimate"
        if future
        else "provider_current_traffic_estimate",
        "polyline": polyline,
    }


def parse_map(data, departure, fetched, mode):
    """Keep the API's measurements; it accepts no requested departure time.

    There is no provider record ID in this contract. Do not invent one, or
    turn an unavailable public-transit fare into a free journey.
    """
    if data.get("status") != "OK":
        raise DirectionError("route_not_found")
    if mode == "transit":
        routes = data["routes"]
        if not isinstance(routes, list) or not routes or len(routes) > 100:
            raise DirectionError("route_not_found")
        for route in routes:
            _map_measurements(route["properties"])
        route = min(routes, key=lambda row: row["properties"]["totalTime"])
        steps = route["steps"]
    else:
        route = data["route"]
        steps = [step for leg in route["legs"] for step in leg["steps"]]
    distance, duration = _map_measurements(route["properties"])
    fare = route["properties"].get("fare", {}).get("value")
    if fare is not None and (type(fare) is not int or fare < 0):
        raise DirectionError("invalid_fare")
    polyline = []
    for step in steps:
        for pair in step["path"]["points"]:
            if not isinstance(pair, list) or len(pair) != 2:
                raise DirectionError("invalid_route_geometry")
            point = {"longitude": pair[0], "latitude": pair[1]}
            coordinate(point)
            if not polyline or point != polyline[-1]:
                polyline.append(point)
            if len(polyline) > 20000:
                raise DirectionError("route_geometry_too_large")
    if len(polyline) < 2:
        raise DirectionError("route_geometry_missing")
    return {
        "provider": "kakao_map",
        "mode": mode,
        "source_record_id": None,
        "source_url": MAP_DOCS,
        "reference_departure_at": departure.isoformat(),
        "fetched_at": fetched.isoformat(),
        "valid_until": (fetched + timedelta(minutes=5)).isoformat(),
        "duration_seconds": duration,
        "distance_m": distance,
        "toll_krw": None,
        "fare_krw": fare if mode == "transit" else None,
        "time_basis": "provider_estimate_without_departure_time",
        "polyline": polyline,
    }


def _map_measurements(properties):
    distance, duration = properties["totalDistance"], properties["totalTime"]
    if (
        type(distance) is not int
        or type(duration) is not int
        or not (0 < distance < 1_500_000 and 0 < duration <= 86400)
    ):
        raise DirectionError("invalid_route_measurements")
    return distance, duration
