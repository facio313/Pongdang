"""Bounded Windy v3 adapter. Auth headers never reach public records or logs."""

import json
import math
from datetime import UTC, datetime, timedelta
from email.utils import parsedate_to_datetime
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, build_opener

from pydantic import BaseModel, Field

from app.ingestion.http import NoRedirect, ProviderError
from app.ingestion.webcams import WebcamMetadata, WebcamSearch
from app.livecams.urls import optional_windy_url


class WebcamDiscovery(BaseModel):
    webcams: list[WebcamMetadata] = Field(max_length=50)
    webcam_searches: list[WebcamSearch] = Field(max_length=1)


ENDPOINT = "https://api.windy.com/webcams/api/v3/webcams"


class WindyError(ProviderError):
    def __init__(self, code, retry_seconds=900):
        super().__init__(code)
        self.retry_seconds = max(60, min(604800, retry_seconds))


def retry_after(value):
    try:
        return max(900, int(value))
    except ValueError, TypeError:
        try:
            return max(
                900,
                int((parsedate_to_datetime(value) - datetime.now(UTC)).total_seconds()),
            )
        except ValueError, TypeError, OverflowError:
            return 900


class WindyClient:
    def __init__(self, settings, *, opener=None):
        self.key = settings.windy_webcams_api_key.get_secret_value()
        self.timeout = settings.windy_webcams_timeout_seconds
        self.opener = opener or build_opener(NoRedirect)

    def nearby(self, latitude, longitude, radius):
        # Keep integer-valued radii in the documented "2" spelling, not "2.0".
        return self._fetch(nearby=f"{latitude},{longitude},{radius:g}")

    def sample(self):
        """One bounded Korean page for an explicit implementation check."""
        return self._fetch(limit=10)

    def list_page(self, page=1, category=None):
        """A single requested Korean page, within the free API offset boundary."""
        return self._fetch(limit=25, offset=(page - 1) * 25, category=category)

    def _fetch(self, *, nearby=None, limit=50, offset=0, category=None):
        if not self.key:
            raise WindyError("WINDY_NOT_CONFIGURED", 86400)
        if any(ch in self.key for ch in "\r\n"):
            raise WindyError("WINDY_INVALID_KEY_FORMAT", 86400)
        params = dict(
            countries="KR",
            include="location,player,urls,categories,images",
            limit=limit,
            offset=offset,
            lang="ko",
        )
        if nearby is not None:
            params["nearby"] = nearby
        if category is not None:
            params["categories"] = category
        request = Request(
            ENDPOINT + "?" + urlencode(params),
            headers={
                "X-WINDY-API-KEY": self.key,
                "Accept": "application/json",
                "User-Agent": "Pongdang-webcams/1",
            },
        )
        try:
            with self.opener.open(request, timeout=self.timeout) as response:
                raw = response.read(1_000_001)
                if len(raw) > 1_000_000:
                    raise WindyError("WINDY_RESPONSE_TOO_LARGE")
                data = json.loads(raw)
        except HTTPError as exc:
            if exc.code == 429:
                raise WindyError(
                    "WINDY_HTTP_429", retry_after(exc.headers.get("Retry-After"))
                ) from None
            raise WindyError(
                f"WINDY_HTTP_{exc.code}", 86400 if exc.code in {401, 403} else 900
            ) from None
        except TimeoutError, URLError, OSError:
            raise WindyError("WINDY_NETWORK_ERROR") from None
        except ValueError, UnicodeError:
            raise WindyError("WINDY_INVALID_JSON") from None
        if (
            not isinstance(data, dict)
            or not isinstance(data.get("webcams"), list)
            or type(data.get("total")) is not int
            or data["total"] < 0
            or len(data["webcams"]) > limit
            or data["total"] < len(data["webcams"])
        ):
            raise WindyError("WINDY_INVALID_RESPONSE")
        return data


def distance_km(lat1, lon1, lat2, lon2):
    a, b = math.radians(lat1), math.radians(lat2)
    h = (
        math.sin((b - a) / 2) ** 2
        + math.cos(a) * math.cos(b) * math.sin(math.radians(lon2 - lon1) / 2) ** 2
    )
    return 6371.0088 * 2 * math.asin(min(1, math.sqrt(h)))


def normalize(row):
    """Only documented metadata; no raw body, signed image URL or provider URL."""
    try:
        if not isinstance(row, dict) or type(row.get("webcamId")) is not int:
            raise ValueError("Missing camera identity")
        camera_id = str(row["webcamId"])
        location, player, urls = (
            row.get(k) or {} for k in ("location", "player", "urls")
        )
        if not all(isinstance(v, dict) for v in (location, player, urls)):
            raise ValueError("Invalid metadata parts")
        period, timelapse = None, None
        for candidate in ("day", "month", "year", "lifetime"):
            value = optional_windy_url(
                player.get(candidate), camera_id, player_type=candidate
            )
            if value:
                period, timelapse = candidate, value
                break
        images = row.get("images") or {}
        current = images.get("current") or {} if isinstance(images, dict) else {}
        return WebcamMetadata(
            provider_camera_id=camera_id,
            title=row["title"],
            latitude=location.get("latitude"),
            longitude=location.get("longitude"),
            country_code=location.get("country_code"),
            region=location.get("region"),
            city=location.get("city"),
            # Current v3 schema supplies neither timezone nor operator description.
            timezone=None,
            description=None,
            categories=[
                c["id"]
                for c in (row.get("categories") or [])
                if isinstance(c, dict)
                and isinstance(c.get("id"), str)
                and len(c["id"]) <= 80
            ],
            provider_status=row.get("status") or "unknown",
            provider_updated_at=row.get("lastUpdatedOn"),
            public_page=optional_windy_url(urls.get("detail"), camera_id),
            live_player=optional_windy_url(
                player.get("live"), camera_id, player_type="live"
            ),
            timelapse_player=timelapse,
            timelapse_period=period,
            photo_available=isinstance(current, dict)
            and any(isinstance(v, str) and bool(v) for v in current.values()),
        )
    except ValueError, KeyError, TypeError:
        raise WindyError("WINDY_INVALID_CAMERA") from None


def discover(settings, place, *, client=None, reserve=lambda: None):
    client = client or WindyClient(settings)
    for radius in map(float, settings.windy_webcams_radii_km.split(",")):
        reserve()  # The caller enforces its request budget and pacing.
        data = client.nearby(place["lat"], place["lng"], radius)
        cameras, rejected = {}, 0
        for row in data["webcams"]:
            camera = normalize(row)
            if camera.country_code and camera.country_code != "KR":
                rejected += 1
                continue
            if (
                camera.latitude is not None
                and camera.longitude is not None
                and distance_km(
                    place["lat"], place["lng"], camera.latitude, camera.longitude
                )
                > radius
            ):
                rejected += 1
                continue
            old = cameras.setdefault(camera.provider_camera_id, camera)
            if old != camera:
                raise WindyError("WINDY_CONFLICTING_CAMERA")
        if cameras:
            break
    now = datetime.now(UTC)
    batch = WebcamDiscovery(
        webcams=list(cameras.values()),
        webcam_searches=[
            WebcamSearch(
                spot_id=place["id"],
                latitude=place["lat"],
                longitude=place["lng"],
                radius_km=radius,
                camera_ids=sorted(cameras),
                total=data["total"],
                rejected=rejected,
                truncated=data["total"] > len(data["webcams"]),
                valid_until=now + timedelta(hours=settings.windy_webcams_refresh_hours),
            )
        ],
    )
    key = settings.windy_webcams_api_key.get_secret_value()
    if key and key in batch.model_dump_json():
        raise WindyError("WINDY_PRIVATE_DATA_REJECTED")
    return batch
