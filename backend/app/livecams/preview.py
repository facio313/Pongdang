"""Explicit on-demand Windy reads; temporary cache only, no schema or DB writes."""

import hashlib
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
from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, model_validator
from starlette.concurrency import run_in_threadpool

from app.data_reader import DataReader
from app.ingestion.webcams import WebcamMetadata
from app.livecams.places import PLACE_SELECT, PreviewPlace
from app.livecams.windy import WindyClient, WindyError, discover, distance_km, normalize
from app.regions import place_search_predicate

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
    shuffle_seed: int = Field(default=0, ge=0, le=2**32 - 1, strict=True)

    @model_validator(mode="after")
    def separate_scopes(self):
        if self.spot_id is not None and (
            self.page != 1 or self.category is not None or self.shuffle_seed != 0
        ):
            raise ValueError("Place queries do not support catalog options")
        return self


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
    matching_status: Literal["available", "unavailable", "not_requested"] = "available"
    ordering: Literal["random"] | None = None
    shuffle_seed: int | None = Field(default=None, ge=0, le=2**32 - 1)


async def read_preview_places(reader, *, q="", spot_id=None):
    search, params = place_search_predicate(q, alias="p")
    async with reader.connection() as c:
        return await (
            await c.execute(
                f"SELECT id,name,place_kind,address,region,lat,lng FROM "
                f"({PLACE_SELECT}) p WHERE place_kind IS NOT NULL "
                "AND (%s::bigint IS NULL OR id=%s) "
                "AND " + search + " ORDER BY id LIMIT 100",
                [spot_id, spot_id, *params],
            )
        ).fetchall()


def catalog_page(snapshot, *, page=1, category=None, shuffle_seed=0):
    """Stable session order across cache refreshes, with no location read."""
    rows = [
        camera.model_copy(
            update={
                "nearby_place": None,
                "distance_km": None,
                "relationship": "unknown",
            }
        )
        for camera in snapshot.rows
        if category is None or category in camera.categories
    ]
    rows.sort(
        key=lambda c: (
            hashlib.sha256(f"{shuffle_seed}:{c.provider_camera_id}".encode()).digest(),
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
        matched_total=0,
        matching_status="not_requested",
        ordering="random",
        shuffle_seed=shuffle_seed,
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
        self.blocked_reason = None

    def reserve(self):
        now = self.clock()
        day = datetime.fromtimestamp(now, UTC).date()
        if self.day != day:
            self.day, self.calls = day, 0
        if now < self.blocked_until:
            raise WindyError(
                "WINDY_BACKOFF",
                math.ceil(self.blocked_until - now),
                cause_code=self.blocked_reason,
            )
        if self.calls >= self.settings.windy_webcams_daily_budget:
            midnight = datetime.combine(
                day + timedelta(days=1), datetime.min.time(), UTC
            )
            raise WindyError(
                "WINDY_DAILY_BUDGET", math.ceil(midnight.timestamp() - now)
            )
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
                    self.settings,
                    place,
                    client=self.client,
                    reserve=self.reserve,
                    accept=water_camera,
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
                self.blocked_reason = exc.code
            raise
        finally:
            self.lock.release()


def create_preview_router(
    settings,
    *,
    service=None,
    read_places=read_preview_places,
):
    router = APIRouter(prefix="/api/data/livecams/preview", tags=["livecam preview"])
    service = service or PreviewService(settings)
    reader = DataReader(settings)

    @router.get("/places", response_model=list[PreviewPlace])
    async def places(
        q: str = Query("", max_length=100),
        spot_id: int | None = Query(None, ge=1, le=9223372036854775807),
    ):
        if spot_id is not None:
            return await read_places(reader, q=q, spot_id=spot_id)
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
            return catalog_page(
                snapshot,
                page=body.page,
                category=body.category,
                shuffle_seed=body.shuffle_seed,
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
            headers = {"Retry-After": str(exc.retry_seconds)}
            if exc.cause_code:
                headers["X-Webcam-Failure-Code"] = exc.cause_code
            raise HTTPException(status, exc.code, headers) from None

    return router
