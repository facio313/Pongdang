"""One immutable representative image per camera; reads never contact Windy."""

import io
import re
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import ProxyHandler, Request, build_opener

from fastapi import HTTPException
from fastapi.responses import FileResponse
from PIL import Image

from app import schema
from app.attachments.files import file_path, raster_type, save_file
from app.ingestion.http import NoRedirect, ProviderError

MAX_BYTES = 512 * 1024
CAMERA_ID = r"[1-9][0-9]{0,19}"
HOST = "images-webcams.windy.com"


def migrate_thumbnails(connection):
    connection.execute(
        "CREATE TABLE IF NOT EXISTS pongdang_data.windy_thumbnail ("
        "camera_id text PRIMARY KEY CHECK (camera_id ~ '^[1-9][0-9]{0,19}$'), "
        "status text NOT NULL CHECK (status IN "
        "('pending','saved','failed','unavailable')), "
        "attempted_at timestamptz NOT NULL, saved_at timestamptz, "
        "source_updated_at timestamptz, storage_key text, media_type text, "
        "sha256 text, byte_size integer, failure_code text, "
        "CHECK ((status='saved' AND saved_at IS NOT NULL "
        "AND storage_key IS NOT NULL AND media_type IS NOT NULL AND media_type IN "
        "('image/jpeg','image/png','image/webp') AND sha256 ~ '^[0-9a-f]{64}$' "
        "AND sha256 IS NOT NULL AND byte_size IS NOT NULL "
        "AND byte_size BETWEEN 1 AND 524288) OR "
        "(status<>'saved' AND saved_at IS NULL AND storage_key IS NULL "
        "AND media_type IS NULL AND sha256 IS NULL AND byte_size IS NULL)))"
    )


def image_url(value, camera_id):
    """Accept the API's small image URL verbatim; never guess unsigned URLs."""
    try:
        p = urlsplit(value)
        if (
            not isinstance(value, str)
            or len(value) > 4096
            or not re.fullmatch(CAMERA_ID, camera_id)
            or any(ord(ch) < 33 for ch in value)
            or p.scheme != "https"
            or p.hostname != HOST
            or p.port not in (None, 443)
            or p.username
            or p.password
            or p.fragment
            or not re.fullmatch(
                rf"/[0-9]{{2}}/{camera_id}/(?:current|daylight)/"
                rf"(?:thumbnail|preview|icon)/{camera_id}\.(?:jpg|png|webp)",
                p.path,
            )
        ):
            raise ValueError
    except ValueError, TypeError, AttributeError:
        raise ProviderError("THUMBNAIL_URL_NOT_ALLOWED") from None
    return value


def source_image(row, camera_id, *, secret=""):
    """Signed URLs live only in the import's memory, never the DB or HTTP JSON."""
    images = row.get("images")
    if not isinstance(images, dict):
        return None
    for period in ("current", "daylight"):
        versions = images.get(period)
        if not isinstance(versions, dict):
            continue
        for size in ("thumbnail", "preview", "icon"):
            value = versions.get(size)
            if not isinstance(value, str) or (secret and secret in value):
                continue
            try:
                return image_url(value, camera_id)
            except ProviderError:
                continue
    return None


def download(camera_id, url, *, opener=None):
    url = image_url(url, camera_id)
    # No API key, cookies, environment proxy, redirect or retry on image requests.
    opener = opener or build_opener(NoRedirect, ProxyHandler({}))
    started = time.monotonic()
    try:
        request = Request(url, headers={"Accept": "image/jpeg,image/png,image/webp"})
        with opener.open(request, timeout=3) as response:
            if response.status != 200:
                raise ProviderError("THUMBNAIL_HTTP_ERROR")
            length = response.headers.get("content-length", "0")
            if length.isdigit() and int(length) > MAX_BYTES:
                raise ProviderError("THUMBNAIL_TOO_LARGE")
            data = bytearray()
            while chunk := response.read1(65536):
                if len(data) + len(chunk) > MAX_BYTES:
                    raise ProviderError("THUMBNAIL_TOO_LARGE")
                if time.monotonic() - started > 6:
                    raise ProviderError("THUMBNAIL_TIMEOUT")
                data.extend(chunk)
            # Bound decoded memory before reusing the existing raster verifier.
            with Image.open(io.BytesIO(data), formats=["JPEG", "PNG", "WEBP"]) as img:
                if img.width * img.height > 1_048_576:
                    raise ProviderError("THUMBNAIL_DIMENSIONS_NOT_ALLOWED")
            media_type, extension = raster_type(data)
            declared = response.headers.get("content-type", "").split(";")[0].lower()
            if declared == "image/jpg":
                declared = "image/jpeg"
            if declared not in {media_type, "application/octet-stream"}:
                raise ProviderError("THUMBNAIL_CONTENT_TYPE_MISMATCH")
            return bytes(data), media_type, extension
    except HTTPError:
        raise ProviderError("THUMBNAIL_HTTP_ERROR") from None
    except URLError, TimeoutError:
        raise ProviderError("THUMBNAIL_NETWORK_ERROR") from None
    except OSError, ValueError, Image.DecompressionBombError:
        raise ProviderError("THUMBNAIL_INVALID_IMAGE") from None


class ThumbnailStore:
    def __init__(self, settings, *, downloader=download, clock=time.time):
        self.settings, self.downloader, self.clock = settings, downloader, clock

    def capture(self, cameras, sources):
        """Persist admission before I/O: failures and interrupted attempts stay put."""
        now = datetime.fromtimestamp(self.clock(), UTC)
        pending = []
        with schema.connect(self.settings) as connection:
            for camera in cameras:
                camera_id = camera.provider_camera_id
                source = sources.get(camera_id)
                row = connection.execute(
                    "INSERT INTO pongdang_data.windy_thumbnail "
                    "(camera_id,status,attempted_at,source_updated_at) "
                    "VALUES (%s,%s,%s,%s) ON CONFLICT (camera_id) DO NOTHING "
                    "RETURNING camera_id",
                    [
                        camera_id,
                        "pending" if source else "unavailable",
                        now,
                        camera.provider_updated_at,
                    ],
                ).fetchone()
                if row and source:
                    pending.append((camera_id, source))
        if not pending:
            return
        with ThreadPoolExecutor(max_workers=8) as executor:
            for camera_id, saved, failure in executor.map(self._capture, pending):
                with schema.connect(self.settings) as connection:
                    if saved:
                        sha, key, media_type, size = saved
                        connection.execute(
                            "UPDATE pongdang_data.windy_thumbnail SET status='saved', "
                            "saved_at=%s,sha256=%s,storage_key=%s,media_type=%s, "
                            "byte_size=%s WHERE camera_id=%s AND status='pending'",
                            [
                                datetime.fromtimestamp(self.clock(), UTC),
                                sha,
                                key,
                                media_type,
                                size,
                                camera_id,
                            ],
                        )
                    else:
                        connection.execute(
                            "UPDATE pongdang_data.windy_thumbnail SET status='failed', "
                            "failure_code=%s WHERE camera_id=%s AND status='pending'",
                            [failure, camera_id],
                        )

    def _capture(self, item):
        camera_id, url = item
        try:
            data, media_type, extension = self.downloader(camera_id, url)
            sha, key = save_file(self.settings.windy_thumbnail_root, data, extension)
            return camera_id, (sha, key, media_type, len(data)), None
        except ProviderError as exc:
            return camera_id, None, exc.code
        except OSError, ValueError:
            return camera_id, None, "THUMBNAIL_STORAGE_ERROR"

    def metadata(self, camera_ids):
        if not camera_ids:
            return {}
        with schema.connect(self.settings) as connection:
            connection.execute("SET TRANSACTION READ ONLY")
            rows = connection.execute(
                "SELECT camera_id,saved_at FROM pongdang_data.windy_thumbnail "
                "WHERE camera_id=ANY(%s) AND status='saved' LIMIT 125",
                [camera_ids],
            ).fetchall()
        return {
            camera_id: {
                "thumbnail_url": f"/api/data/livecams/thumbnails/{camera_id}",
                "thumbnail_saved_at": saved_at.astimezone(UTC),
            }
            for camera_id, saved_at in rows
        }

    def response(self, camera_id):
        if not re.fullmatch(CAMERA_ID, camera_id):
            raise HTTPException(404, "WEBCAM_THUMBNAIL_UNAVAILABLE")
        with schema.connect(self.settings) as connection:
            connection.execute("SET TRANSACTION READ ONLY")
            row = connection.execute(
                "SELECT storage_key,media_type,sha256,byte_size "
                "FROM pongdang_data.windy_thumbnail "
                "WHERE camera_id=%s AND status='saved' LIMIT 1",
                [camera_id],
            ).fetchone()
        if row:
            try:
                path = file_path(self.settings.windy_thumbnail_root, row[0])
                if path.is_file() and path.stat().st_size == row[3]:
                    return FileResponse(
                        path,
                        media_type=row[1],
                        headers={
                            "Cache-Control": "private, max-age=86400, immutable",
                            "ETag": f'"{row[2]}"',
                            "X-Content-Type-Options": "nosniff",
                            "Content-Security-Policy": "default-src 'none'; sandbox",
                        },
                    )
            except OSError, ValueError:
                pass
        raise HTTPException(404, "WEBCAM_THUMBNAIL_UNAVAILABLE")
