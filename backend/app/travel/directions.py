"""Pongdang-owned Kakao Mobility adapter, matching Pilgrimage's official provider.

https://developers.kakaomobility.com/guide/navi-api/directions
https://developers.kakaomobility.com/guide/navi-api/future
No Pilgrimage service, database, module or credential dependency.
"""

import asyncio
import json
import math
from datetime import UTC, datetime, timedelta

import httpx

from app.travel.catalog import KST

ENDPOINT = "https://apis-navi.kakaomobility.com/v1/"
DOCS = "https://developers.kakaomobility.com/guide/navi-api/"
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
    def __init__(self, settings, now, *, client=None):
        self.settings, self.now = settings, now
        self.status = availability(settings)
        self.client = client
        self.calls = 0
        self.gate = asyncio.Semaphore(3)

    async def leg(self, origin, destination, departure, *, geometry=False):
        if self.status != "configured":
            raise DirectionError("route_provider_" + self.status)
        if self.calls >= MAX_CALLS:
            raise DirectionError("route_request_call_limit")
        self.calls += 1
        origin_text, destination_text = coordinate(origin), coordinate(destination)
        if departure < self.now - timedelta(minutes=5):
            raise DirectionError("route_departure_in_past")
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
        headers = {"Authorization": "KakaoAK " + _route_key(self.settings)}
        async with self.gate:
            try:
                if self.status != "configured":
                    raise DirectionError("route_provider_" + self.status)
                if self.client:
                    data = await self._read(self.client, path, params, headers)
                else:
                    async with httpx.AsyncClient(
                        timeout=5, follow_redirects=False, trust_env=False
                    ) as client:
                        data = await self._read(client, path, params, headers)
                return parse(data, departure, datetime.now(UTC), future, geometry)
            except DirectionError:
                raise
            except httpx.HTTPError, ValueError, KeyError, TypeError, IndexError:
                raise DirectionError("route_upstream_unavailable_or_invalid") from None

    async def _read(self, client, path, params, headers):
        async with client.stream(
            "GET", ENDPOINT + path, params=params, headers=headers
        ) as response:
            if response.status_code in {401, 403}:
                self.status = "authentication_failed"
                raise DirectionError("route_provider_authentication_failed")
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
