"""Offline photo provider and file boundary checks; no live provider calls."""

import hashlib
import io
import math
import struct
import zlib
from datetime import UTC, datetime

import httpx
import pytest
from PIL import Image
from pydantic import ValidationError

from app.attachments.collector import TourPhotos, attachment_jobs, distance
from app.attachments.files import download, file_path, image_url, raster_type, save_file
from app.config import Settings
from app.ingestion.http import ProviderError

URL = "https://tong.visitkorea.or.kr/cms/resource/11/123411_image2_1.png"


def test_official_jpg_content_type_is_accepted_only_for_decoded_jpeg():
    buffer = io.BytesIO()
    Image.new("RGB", (1, 1)).save(buffer, format="JPEG")
    payload = buffer.getvalue()
    client = httpx.Client(
        transport=httpx.MockTransport(
            lambda request: httpx.Response(
                200, headers={"Content-Type": "image/jpg"}, content=payload
            )
        )
    )
    with client:
        assert download(URL, 1024, client=client) == (payload, "image/jpeg", "jpg")


def png(pixel=b"\xff\x00\x00"):
    def chunk(kind, value):
        return (
            struct.pack(">I", len(value))
            + kind
            + value
            + struct.pack(">I", zlib.crc32(kind + value))
        )

    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", 1, 1, 8, 2, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(b"\x00" + pixel))
        + chunk(b"IEND", b"")
    )


PNG = png()
PLACE = {"id": 1, "name": "경포 해수욕장", "lat": 37.805, "lng": 128.909}


def settings(tmp_path, **kwargs):
    return Settings(
        _env_file=None,
        postgres_password="offline-fixture",
        data_go_kr_key="offline-provider-key",
        attachment_root=tmp_path,
        **kwargs,
    )


def provider_row(**kwargs):
    return {
        "contentid": "1234",
        "title": "경포해변",
        "mapy": "37.805",
        "mapx": "128.909",
        "firstimage": URL.replace("https:", "http:"),
        "cpyrhtDivCd": "Type1",
        **kwargs,
    }


class JsonClient:
    def __init__(self, *responses):
        self.responses = iter(responses)
        self.calls = []

    def get_json(self, url, params):
        self.calls.append((url, params))
        rows = next(self.responses)
        return {
            "response": {
                "header": {"resultCode": "0000", "resultMsg": "OK"},
                "body": {"items": {"item": rows}},
            }
        }


@pytest.mark.parametrize("scheme", ["http", "https"])
def test_only_official_image_urls_are_upgraded_to_https(scheme):
    assert image_url(URL.replace("https:", scheme + ":")) == URL


@pytest.mark.parametrize(
    "url",
    [
        "https://example.com/cms/resource/photo.png",
        "https://tong.visitkorea.or.kr.evil.test/cms/resource/photo.png",
        "https://127.0.0.1/cms/resource/photo.png",
        "https://user:password@tong.visitkorea.or.kr/cms/resource/photo.png",
        "https://tong.visitkorea.or.kr:8080/cms/resource/photo.png",
        "file:///cms/resource/photo.png",
        URL + "?serviceKey=private",
        URL + "#fragment",
        "https://tong.visitkorea.or.kr/cms/resource/../../secret",
        "https://tong.visitkorea.or.kr/cms/resource/%2e%2e/secret",
        "https://tong.visitkorea.or.kr/other/photo.png",
        None,
    ],
)
def test_image_url_rejects_unapproved_hosts_paths_and_credentials(url):
    with pytest.raises(ProviderError, match="IMAGE_URL_NOT_ALLOWED"):
        image_url(url)


def test_download_validates_bytes_and_preserves_original_file():
    calls = []

    def handle(request):
        calls.append(request)
        return httpx.Response(200, content=PNG, headers={"Content-Type": "image/png"})

    with httpx.Client(transport=httpx.MockTransport(handle)) as client:
        data, mime, extension = download(URL, 1024, client=client)
    assert (data, mime, extension) == (PNG, "image/png", "png")
    assert len(calls) == 1
    assert str(calls[0].url) == URL


@pytest.mark.parametrize(
    ("status", "headers", "body", "limit", "error"),
    [
        (302, {"Location": "http://127.0.0.1/private"}, b"", 1024, "IMAGE_HTTP_ERROR"),
        (500, {}, b"failure", 1024, "IMAGE_HTTP_ERROR"),
        (200, {"Content-Length": "9999"}, PNG, 1024, "IMAGE_TOO_LARGE"),
        (200, {"Content-Length": "0"}, PNG, 16, "IMAGE_TOO_LARGE"),
        (200, {"Content-Type": "text/html"}, PNG, 1024, "IMAGE_CONTENT_TYPE_MISMATCH"),
        (200, {"Content-Type": "image/jpeg"}, PNG, 1024, "IMAGE_CONTENT_TYPE_MISMATCH"),
        (
            200,
            {"Content-Type": "image/svg+xml"},
            b"<svg/>",
            1024,
            "INVALID_RASTER_IMAGE",
        ),
        (200, {"Content-Type": "image/png"}, PNG[:-12], 1024, "INVALID_RASTER_IMAGE"),
    ],
)
def test_download_bounds_redirects_sizes_and_content(
    status, headers, body, limit, error
):
    calls = []

    def handle(request):
        calls.append(request)
        return httpx.Response(status, headers=headers, content=body)

    with httpx.Client(transport=httpx.MockTransport(handle)) as client:
        with pytest.raises(ProviderError, match=error):
            download(URL, limit, client=client)
    assert len(calls) == 1


def test_download_network_failure_is_sanitized():
    def handle(request):
        raise httpx.ReadTimeout("private provider response", request=request)

    with httpx.Client(transport=httpx.MockTransport(handle)) as client:
        with pytest.raises(ProviderError, match="^IMAGE_NETWORK_ERROR$"):
            download(URL, 1024, client=client)


def test_download_overall_deadline_is_bounded(monkeypatch):
    clock = iter([0, 31])
    monkeypatch.setattr("app.attachments.files.time.monotonic", lambda: next(clock))
    transport = httpx.MockTransport(
        lambda request: httpx.Response(
            200, content=PNG, headers={"Content-Type": "image/png"}
        )
    )
    with httpx.Client(transport=transport) as client:
        with pytest.raises(ProviderError, match="IMAGE_TIMEOUT"):
            download(URL, 1024, client=client)


@pytest.mark.parametrize(
    ("format_name", "mime", "extension"),
    [("JPEG", "image/jpeg", "jpg"), ("WEBP", "image/webp", "webp")],
)
def test_other_supported_raster_formats_are_decoded(format_name, mime, extension):
    out = io.BytesIO()
    Image.new("RGB", (1, 1), "red").save(out, format=format_name)
    assert raster_type(out.getvalue()) == (mime, extension)


@pytest.mark.parametrize(
    "data", [b"\xff\xd8\xffnot-a-jpeg\xff\xd9", PNG[:8] + PNG[-12:]]
)
def test_magic_bytes_without_valid_raster_structure_are_rejected(data):
    with pytest.raises(ProviderError, match="INVALID_RASTER_IMAGE"):
        raster_type(data)


def test_animated_png_is_not_stored_as_a_representative_still():
    out = io.BytesIO()
    Image.new("RGB", (1, 1), "red").save(
        out,
        format="PNG",
        save_all=True,
        append_images=[Image.new("RGB", (1, 1), "blue")],
        duration=100,
    )
    with pytest.raises(ProviderError, match="IMAGE_DIMENSIONS_NOT_ALLOWED"):
        raster_type(out.getvalue())


def test_raster_content_and_atomic_content_hash_storage(tmp_path):
    assert raster_type(PNG) == ("image/png", "png")
    sha, key = save_file(tmp_path, PNG, "png")
    assert sha == hashlib.sha256(PNG).hexdigest()
    assert file_path(tmp_path, key).read_bytes() == PNG
    assert save_file(tmp_path, PNG, "png") == (sha, key)
    file_path(tmp_path, key).write_bytes(b"damaged stored file")
    assert save_file(tmp_path, PNG, "png") == (sha, key)
    assert file_path(tmp_path, key).read_bytes() == PNG
    assert list(tmp_path.rglob(".pending-*")) == []
    assert len(list(tmp_path.rglob("*.png"))) == 1


def test_storage_key_cannot_escape_root_or_follow_outside_symlink(tmp_path):
    with pytest.raises(ValueError):
        file_path(tmp_path, "../../secret.png")
    root = tmp_path / "attachments"
    root.mkdir()
    (root / "ab").symlink_to(tmp_path, target_is_directory=True)
    with pytest.raises(ValueError):
        file_path(root, "ab/" + "a" * 64 + ".png")


def test_provider_match_requires_equivalent_name_and_nearby_coordinates(tmp_path):
    client = JsonClient(
        [
            provider_row(contentid="1", title="경포해변 식당"),
            provider_row(contentid="2", mapy="38.805"),
            provider_row(contentid="3", mapx="nan"),
            provider_row(contentid="4"),
        ]
    )
    photo, state, method = TourPhotos(settings(tmp_path), client).find(PLACE)
    assert (state, method) == ("available", "name_and_coordinates")
    assert photo["source_record_id"] == "4"
    assert photo["source_url"] == URL
    assert photo["original_url"].startswith("http:")
    assert photo["source_modified_at"] is None
    assert client.calls[0][1]["numOfRows"] == 20
    assert client.calls[0][1]["pageNo"] == 1


@pytest.mark.parametrize(
    ("rows", "state"),
    [([], "no_match"), ([provider_row(), provider_row(contentid="5678")], "ambiguous")],
)
def test_no_or_ambiguous_match_does_not_guess_a_photo(tmp_path, rows, state):
    assert TourPhotos(settings(tmp_path), JsonClient(rows)).find(PLACE) == (
        None,
        state,
        "name_and_coordinates",
    )


@pytest.mark.parametrize("license_code", ["Type2", "Type4", "", None])
def test_restricted_or_unknown_license_does_not_return_photo(tmp_path, license_code):
    result = TourPhotos(
        settings(tmp_path), JsonClient([provider_row(cpyrhtDivCd=license_code)])
    ).find(PLACE)
    assert result == (None, "restricted", "name_and_coordinates")


def test_detail_fallback_preserves_type3_and_provider_time(tmp_path):
    client = JsonClient(
        [provider_row(firstimage="", modifiedtime="20200102030405")],
        [
            {"contentid": "1234", "originimgurl": URL, "cpyrhtDivCd": "Type4"},
            {"contentid": "1234", "originimgurl": URL, "cpyrhtDivCd": "Type3"},
        ],
    )
    photo, state, method = TourPhotos(settings(tmp_path), client).find(
        {**PLACE, "source_id": "1234"}
    )
    assert (state, method, photo["license"]) == ("available", "provider_id", "Type3")
    assert photo["source_modified_at"].astimezone(UTC) == datetime(
        2020, 1, 1, 18, 4, 5, tzinfo=UTC
    )
    assert "공공누리 3유형" in photo["attribution"]
    assert [url.rsplit("/", 1)[1] for url, _ in client.calls] == [
        "detailCommon2",
        "detailImage2",
    ]
    assert client.calls[1][1]["numOfRows"] == 10


def test_missing_images_remain_explicit(tmp_path):
    client = JsonClient([provider_row(firstimage="")], [])
    assert TourPhotos(settings(tmp_path), client).find(PLACE) == (
        None,
        "no_image",
        "name_and_coordinates",
    )


def test_provider_identity_mismatch_and_oversized_rows_fail(tmp_path):
    provider = TourPhotos(settings(tmp_path), JsonClient([provider_row(contentid="9")]))
    with pytest.raises(ProviderError, match="PHOTO_ID_MISMATCH"):
        provider.find({**PLACE, "source_id": "1234"})
    provider = TourPhotos(settings(tmp_path), JsonClient([provider_row()] * 21))
    with pytest.raises(ProviderError, match="INVALID_PHOTO_RESPONSE"):
        provider.find(PLACE)


@pytest.mark.parametrize("value", ["not-a-date", "29990101000000"])
def test_unknown_source_timestamp_is_not_invented(tmp_path, value):
    provider = TourPhotos(
        settings(tmp_path), JsonClient([provider_row(modifiedtime=value)])
    )
    with pytest.raises(ProviderError, match="PHOTO_SOURCE_TIME"):
        provider.find(PLACE)


def test_invalid_matching_coordinates_are_not_accepted():
    assert distance(PLACE, {"mapy": None, "mapx": 128.9}) == math.inf
    assert distance(PLACE, {"mapy": 91, "mapx": 128.9}) == math.inf


def test_photo_collection_requires_key_and_absolute_storage(tmp_path):
    enabled = settings(tmp_path)
    assert attachment_jobs(enabled)[0].enabled
    assert not attachment_jobs(
        enabled.model_copy(update={"photo_collection_enabled": False})
    )[0].enabled
    no_key = Settings(
        _env_file=None,
        postgres_password="fixture",
        data_go_kr_key="",
        attachment_root=tmp_path,
    )
    assert not attachment_jobs(no_key)[0].enabled
    with pytest.raises(ValidationError, match="absolute path"):
        Settings(
            _env_file=None, postgres_password="fixture", attachment_root="relative"
        )
