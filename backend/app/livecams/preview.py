"""Explicit on-demand Windy reads; temporary cache only, no schema or DB writes."""

import logging
import math
import re
import threading
import time
from collections import OrderedDict
from datetime import UTC, datetime, timedelta
from typing import Literal
from urllib.parse import urlsplit

from fastapi import APIRouter, HTTPException, Query, Request, Response
from psycopg.types.json import Jsonb
from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, model_validator
from starlette.concurrency import run_in_threadpool

from app.data_reader import DataReader
from app.ingestion.webcams import WebcamMetadata
from app.livecams.places import PLACE_SELECT
from app.livecams.windy import WindyClient, WindyError, discover, distance_km, normalize

Category = Literal["beach", "coast", "port", "lake", "river"]
WATER_CATEGORIES = ("beach", "coast", "port", "lake", "river")


def water_camera(camera):
    # Some airport views are tagged coast by the provider; omit explicit airports.
    return bool(set(camera.categories) & set(WATER_CATEGORIES)) and not (
        "airport" in camera.categories
        or re.search(r"\bairport\b|공항", camera.title, re.IGNORECASE)
    )


class PreviewRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    # Omitted selects the water catalog; no raw URL or arbitrary offset.
    spot_id: int | None = Field(default=None, gt=0, le=2**53 - 1)
    page: int = Field(default=1, ge=1, le=5)
    category: Category | None = None

    @model_validator(mode="after")
    def separate_scopes(self):
        if self.spot_id is not None and (self.page != 1 or self.category is not None):
            raise ValueError("Place queries do not support catalog paging or filters")
        return self


class PreviewPlace(BaseModel):
    id: int
    name: str
    place_kind: Literal["beach", "valley"]
    address: str | None
    region: str | None
    lat: float | None
    lng: float | None


class NearbyPlace(BaseModel):
    id: int
    name: str
    place_kind: Literal["beach", "valley"]
    distance_km: float = Field(ge=0, le=10)


class PreviewCamera(WebcamMetadata):
    distance_km: float | None = None
    relationship: Literal["nearby", "unknown"] = "unknown"
    playback_verified: Literal[False] = False
    nearby_place: NearbyPlace | None = None


class PreviewSnapshot(BaseModel):
    contract_version: Literal["livecams.preview.v1"] = "livecams.preview.v1"
    scope: Literal["korea_list", "place"]
    place: PreviewPlace | None = None
    # Internal union: at most five provider pages of 25. HTTP pages stay <= 50.
    rows: list[PreviewCamera] = Field(max_length=125)
    total: int
    truncated: bool
    radius_km: float | None
    fetched_at: AwareDatetime
    valid_until: AwareDatetime
    cached: bool = False


class PreviewResult(PreviewSnapshot):
    rows: list[PreviewCamera] = Field(max_length=50)
    page: int = 1
    page_size: int = 25
    has_more: bool = False
    category: Category | None = None
    matched_total: int = 0
    matching_status: Literal["available", "unavailable"] = "available"


async def read_preview_places(reader, *, q="", spot_id=None):
    async with reader.connection() as c:
        return await (
            await c.execute(
                f"SELECT id,name,place_kind,address,region,lat,lng FROM "
                f"({PLACE_SELECT}) p WHERE place_kind IS NOT NULL "
                "AND (%s::bigint IS NULL OR id=%s) "
                "AND concat_ws(' ',name,address,region) ILIKE %s "
                "ORDER BY id LIMIT 100",
                [spot_id, spot_id, f"%{q}%"],
            )
        ).fetchall()


async def read_catalog_matches(reader, cameras):
    """Nearest real beach/valley within 10 km, with at most 100 output rows/query."""
    located = [
        dict(camera_id=c.provider_camera_id, lat=c.latitude, lng=c.longitude)
        for c in cameras
        if c.latitude is not None
        and c.longitude is not None
        and (c.latitude, c.longitude) != (0, 0)
    ]
    matches = {}
    if not located:
        return matches
    async with reader.connection() as connection:
        for start in range(0, len(located), 100):
            rows = await (
                await connection.execute(
                    f"""WITH places AS MATERIALIZED ({PLACE_SELECT})
                    SELECT c.camera_id, nearest.*
                    FROM jsonb_to_recordset(%s) AS c(
                        camera_id text, lat double precision, lng double precision)
                    JOIN LATERAL (
                        SELECT p.id,p.name,p.place_kind,
                            6371.0088 * 2 * asin(least(1.0, sqrt(
                                power(sin(radians(p.lat-c.lat)/2),2)
                                + cos(radians(c.lat))*cos(radians(p.lat))
                                * power(sin(radians(p.lng-c.lng)/2),2)
                            ))) AS distance_km
                        FROM places p WHERE p.place_kind IS NOT NULL
                        AND p.lat BETWEEN -90 AND 90
                        AND p.lng BETWEEN -180 AND 180
                        AND (p.lat != 0 OR p.lng != 0)
                        AND p.lat BETWEEN c.lat-0.1 AND c.lat+0.1
                        AND p.lng BETWEEN c.lng-0.2 AND c.lng+0.2
                        ORDER BY distance_km,p.id LIMIT 1
                    ) nearest ON nearest.distance_km <= 10
                    LIMIT 100""",
                    [Jsonb(located[start : start + 100])],
                )
            ).fetchall()
            for row in rows:
                matches[row["camera_id"]] = NearbyPlace.model_validate(row)
    return matches


def catalog_page(
    snapshot, matches, *, page=1, category=None, matching_status="available"
):
    rows = [
        camera.model_copy(
            update={"nearby_place": matches.get(camera.provider_camera_id)}
        )
        for camera in snapshot.rows
        if category is None or category in camera.categories
    ]
    rows.sort(
        key=lambda c: (
            c.nearby_place is None,
            c.nearby_place.distance_km if c.nearby_place else float("inf"),
            c.region or "",
            c.title,
            c.provider_camera_id,
        )
    )
    return PreviewResult(
        **snapshot.model_dump(exclude={"rows", "total"}),
        rows=rows[(page - 1) * 25 : page * 25],
        total=len(rows),
        page=page,
        category=category,
        has_more=page * 25 < len(rows),
        matched_total=sum(c.nearby_place is not None for c in rows),
        matching_status=matching_status,
    )


class PreviewService:
    """Single-process preview limits; restarts clear cache, counters and backoff."""

    def __init__(self, settings, *, client=None, clock=time.time, sleep=time.sleep):
        self.settings = settings
        self.client = client or WindyClient(settings)
        self.clock, self.sleep = clock, sleep
        self.lock = threading.Lock()
        self.cache = OrderedDict()
        self.day, self.calls, self.last_call, self.blocked_until = None, 0, None, 0

    def reserve(self):
        now = self.clock()
        day = datetime.fromtimestamp(now, UTC).date()
        if self.day != day:
            self.day, self.calls = day, 0
        if now < self.blocked_until:
            raise WindyError("WINDY_BACKOFF", math.ceil(self.blocked_until - now))
        if self.calls >= self.settings.windy_webcams_daily_budget:
            raise WindyError("WINDY_DAILY_BUDGET", 86400)
        if self.last_call is not None:
            self.sleep(max(0, 2 - (now - self.last_call)))
        self.calls += 1
        self.last_call = self.clock()

    def query(self, place=None):
        if not self.settings.windy_webcams_api_key.get_secret_value():
            raise WindyError("WINDY_NOT_CONFIGURED", 86400)
        if place and not all(
            isinstance(place[k], (int, float))
            and math.isfinite(place[k])
            and lo <= place[k] <= hi
            for k, lo, hi in (("lat", -90, 90), ("lng", -180, 180))
        ):
            raise HTTPException(422, "WEBCAM_COORDINATES_MISSING")
        if place and (place["lat"], place["lng"]) == (0, 0):
            raise HTTPException(422, "WEBCAM_COORDINATES_MISSING")
        key = (place["id"], place["lat"], place["lng"]) if place else ("water",)
        if not self.lock.acquire(blocking=False):
            raise HTTPException(429, "WEBCAM_REQUEST_IN_PROGRESS", {"Retry-After": "2"})
        try:
            cached = self.cache.get(key)
            if cached and cached.valid_until.timestamp() > self.clock():
                self.cache.move_to_end(key)
                return cached.model_copy(update={"cached": True})
            if place:
                batch = discover(
                    self.settings, place, client=self.client, reserve=self.reserve
                )
                cameras = batch.webcams
                search = batch.webcam_searches[0]
                truncated, radius = search.truncated, search.radius_km
            else:
                seen = {}
                truncated = False
                for category in WATER_CATEGORIES:
                    self.reserve()
                    data = self.client.list_page(1, category)
                    truncated |= data["total"] > len(data["webcams"])
                    for row in data["webcams"]:
                        camera = normalize(row)
                        if camera.country_code != "KR" or not water_camera(camera):
                            continue
                        old = seen.setdefault(camera.provider_camera_id, camera)
                        if old != camera:
                            raise WindyError("WINDY_CONFLICTING_CAMERA")
                cameras = list(seen.values())
                radius = None
            now = datetime.fromtimestamp(self.clock(), UTC)
            rows = []
            for camera in cameras:
                if not water_camera(camera):
                    continue
                distance = None
                if (
                    place
                    and camera.latitude is not None
                    and camera.longitude is not None
                ):
                    distance = distance_km(
                        place["lat"], place["lng"], camera.latitude, camera.longitude
                    )
                rows.append(
                    PreviewCamera(
                        **camera.model_dump(),
                        distance_km=distance,
                        relationship="nearby"
                        if distance is not None and camera.country_code == "KR"
                        else "unknown",
                    )
                )
            result = PreviewSnapshot(
                scope="place" if place else "korea_list",
                place=place,
                rows=rows,
                total=len(rows),
                truncated=truncated,
                radius_km=radius,
                fetched_at=now,
                valid_until=now + timedelta(minutes=10),
            )
            if (
                self.settings.windy_webcams_api_key.get_secret_value()
                in result.model_dump_json()
            ):
                raise WindyError("WINDY_PRIVATE_DATA_REJECTED")
            self.cache[key] = result
            self.cache.move_to_end(key)
            while len(self.cache) > 32:
                self.cache.popitem(last=False)
            return result
        except WindyError as exc:
            if exc.code not in {"WINDY_BACKOFF", "WINDY_DAILY_BUDGET"}:
                self.blocked_until = self.clock() + exc.retry_seconds
            raise
        finally:
            self.lock.release()


def create_preview_router(
    settings,
    *,
    service=None,
    read_places=read_preview_places,
    read_matches=read_catalog_matches,
):
    router = APIRouter(prefix="/api/data/livecams/preview", tags=["livecam preview"])
    service = service or PreviewService(settings)
    reader = DataReader(settings)

    @router.get("/places", response_model=list[PreviewPlace])
    async def places(q: str = Query("", max_length=100)):
        return await read_places(reader, q=q)

    @router.post("", response_model=PreviewResult)
    async def preview(body: PreviewRequest, request: Request, response: Response):
        if request.headers.get("content-type", "").split(";")[0] != "application/json":
            raise HTTPException(415, "JSON_REQUIRED")
        origin = request.headers.get("origin")
        if (
            origin and urlsplit(origin).netloc != request.headers.get("host")
        ) or request.headers.get("sec-fetch-site") not in {None, "same-origin", "none"}:
            raise HTTPException(403, "SAME_ORIGIN_REQUIRED")
        place = None
        if body.spot_id is not None:
            found = await read_places(reader, spot_id=body.spot_id)
            if not found:
                raise HTTPException(404, "WEBCAM_PLACE_NOT_FOUND")
            place = found[0]
        response.headers["Cache-Control"] = "no-store"
        try:
            snapshot = await run_in_threadpool(service.query, place)
            if place:
                return PreviewResult(**snapshot.model_dump(), page_size=50)
            try:
                matches = await read_matches(reader, snapshot.rows)
                matching_status = "available"
            except HTTPException as exc:
                if exc.status_code != 503:
                    raise
                matches, matching_status = {}, "unavailable"
            return catalog_page(
                snapshot,
                matches,
                page=body.page,
                category=body.category,
                matching_status=matching_status,
            )
        except WindyError as exc:
            logging.getLogger(__name__).warning("Webcam preview: %s", exc.code)
            status = (
                429
                if exc.code in {"WINDY_HTTP_429", "WINDY_BACKOFF", "WINDY_DAILY_BUDGET"}
                else 503
                if exc.code == "WINDY_NOT_CONFIGURED"
                else 502
            )
            raise HTTPException(
                status, exc.code, {"Retry-After": str(exc.retry_seconds)}
            ) from None

    return router
