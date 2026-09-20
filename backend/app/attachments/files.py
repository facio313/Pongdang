"""Bounded official raster downloads and atomic, content-addressed local storage."""

import hashlib
import io
import os
import re
import tempfile
import time
import warnings
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

import httpx
from PIL import Image, UnidentifiedImageError

from app.ingestion.http import ProviderError

HOST = "tong.visitkorea.or.kr"
KEY = re.compile(r"[0-9a-f]{2}/[0-9a-f]{64}\.(?:jpg|png|webp)")


def image_url(value):
    try:
        p = urlsplit(value)
        if (
            p.scheme not in {"http", "https"}
            or p.hostname != HOST
            or p.username
            or p.password
            or p.port not in (None, 443)
            or p.query
            or p.fragment
            or not re.fullmatch(r"/cms/resource/[A-Za-z0-9_./-]{1,450}", p.path)
            or ".." in p.path
        ):
            raise ValueError
    except ValueError, TypeError:
        raise ProviderError("IMAGE_URL_NOT_ALLOWED") from None
    # TourAPI still returns http URLs; only this official host is upgraded.
    return urlunsplit(("https", HOST, p.path, "", ""))


def raster_type(data):
    formats = {
        "JPEG": ("image/jpeg", "jpg"),
        "PNG": ("image/png", "png"),
        "WEBP": ("image/webp", "webp"),
    }
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(data), formats=list(formats)) as img:
                if (
                    img.width * img.height > 20_000_000
                    or getattr(img, "n_frames", 1) != 1
                ):
                    raise ProviderError("IMAGE_DIMENSIONS_NOT_ALLOWED")
                result = formats[img.format]
                img.verify()
            # Decode as well: verify() alone does not detect truncated JPEG data.
            with Image.open(io.BytesIO(data), formats=list(formats)) as img:
                img.load()
        return result
    except (
        OSError,
        ValueError,
        SyntaxError,
        UnidentifiedImageError,
        Image.DecompressionBombError,
        Image.DecompressionBombWarning,
    ):
        raise ProviderError("INVALID_RASTER_IMAGE") from None


def download(url, max_bytes, *, client=None):
    url = image_url(url)
    owned = client is None
    client = client or httpx.Client(timeout=15, follow_redirects=False)
    started = time.monotonic()
    try:
        with client.stream(
            "GET", url, headers={"Accept": "image/jpeg,image/png,image/webp"}
        ) as response:
            if response.status_code != 200:
                raise ProviderError("IMAGE_HTTP_ERROR")
            if (
                response.headers.get("content-length", "0").isdigit()
                and int(response.headers.get("content-length", "0")) > max_bytes
            ):
                raise ProviderError("IMAGE_TOO_LARGE")
            data = bytearray()
            for chunk in response.iter_bytes(65536):
                if len(data) + len(chunk) > max_bytes:
                    raise ProviderError("IMAGE_TOO_LARGE")
                if time.monotonic() - started > 30:
                    raise ProviderError("IMAGE_TIMEOUT")
                data.extend(chunk)
            media_type, extension = raster_type(data)
            declared = response.headers.get("content-type", "").split(";")[0].lower()
            # The official TourAPI image host uses image/jpg for JPEG originals.
            if declared == "image/jpg":
                declared = "image/jpeg"
            if declared not in {media_type, "application/octet-stream"}:
                raise ProviderError("IMAGE_CONTENT_TYPE_MISMATCH")
            return bytes(data), media_type, extension
    except httpx.HTTPError:
        raise ProviderError("IMAGE_NETWORK_ERROR") from None
    finally:
        if owned:
            client.close()


def file_path(root: Path, key: str):
    if not KEY.fullmatch(key):
        raise ValueError("Invalid stored file key")
    root = root.resolve()
    path = (root / key).resolve()
    if not path.is_relative_to(root):
        raise ValueError("Stored file escaped attachment root")
    return path


def save_file(root, data, extension):
    sha = hashlib.sha256(data).hexdigest()
    key = f"{sha[:2]}/{sha}.{extension}"
    path = file_path(root, key)
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists() and hashlib.sha256(path.read_bytes()).hexdigest() == sha:
        return sha, key
    temp = None
    try:
        with tempfile.NamedTemporaryFile(
            dir=path.parent, prefix=".pending-", delete=False
        ) as out:
            temp = Path(out.name)
            out.write(data)
            out.flush()
            os.fsync(out.fileno())
            os.fchmod(out.fileno(), 0o644)
        os.replace(temp, path)
        directory = os.open(path.parent, os.O_RDONLY)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)
    finally:
        if temp:
            temp.unlink(missing_ok=True)
    return sha, key
