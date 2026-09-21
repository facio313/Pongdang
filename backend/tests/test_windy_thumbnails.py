"""Immutable thumbnails use an isolated DB, local files and injected HTTP only."""

import io
import time
from types import SimpleNamespace

import pytest
from PIL import Image
from test_webcam_preview import Client, app_client, camera, config

from app import schema
from app.config import Settings
from app.ingestion.http import ProviderError
from app.livecams.catalog import CatalogStore
from app.livecams.preview import PreviewService
from app.livecams.thumbnails import (
    MAX_BYTES,
    ThumbnailStore,
    download,
    image_url,
    source_image,
)

URL = "https://images-webcams.windy.com/42/42/current/thumbnail/42.jpg?token=TEMPORARY"


def image_bytes(color="blue"):
    buffer = io.BytesIO()
    Image.new("RGB", (16, 9), color).save(buffer, format="JPEG")
    return buffer.getvalue()


@pytest.fixture(autouse=True)
def db():
    settings = Settings()
    if settings.postgres_db != "pongdang_test":
        pytest.fail("Requires disposable pongdang_test")
    schema.initialize(settings)
    with schema.connect(settings) as connection:
        connection.execute(
            "TRUNCATE pongdang_data.windy_catalog_revision, "
            "pongdang_data.windy_api_budget, pongdang_data.windy_thumbnail"
        )
    return settings


def service(tmp_path, *, downloader=None, provider=None, now=None, **updates):
    settings = config(windy_thumbnail_root=tmp_path / "thumbnails", **updates)
    clock = (lambda: now[0]) if now is not None else time.time
    store = ThumbnailStore(
        settings,
        clock=clock,
        downloader=downloader or (lambda *_: (image_bytes(), "image/jpeg", "jpg")),
    )
    return PreviewService(
        settings,
        clock=clock,
        client=provider or Client([camera(images={"current": {"thumbnail": URL}})]),
        catalog=CatalogStore(
            settings, thumbnails=store, clock=clock, sleep=lambda _: None
        ),
    )


def test_first_import_saves_one_file_and_survives_expiry_restart_and_no_key(
    tmp_path, db
):
    calls = []

    def fetch(camera_id, url):
        calls.append((camera_id, url))
        return image_bytes(), "image/jpeg", "jpg"

    now = [1_800_000_000.0]
    first = service(tmp_path, downloader=fetch, now=now)
    initial = first.query()
    assert calls == [("42", URL)]  # Five category pages share one camera identity.
    assert len(first.client.calls) == 5
    assert initial.rows[0].thumbnail_url == "/api/data/livecams/thumbnails/42"
    assert len(list((tmp_path / "thumbnails").rglob("*.jpg"))) == 1
    with schema.connect(db) as connection:
        records = connection.execute(
            "SELECT to_jsonb(t) FROM pongdang_data.windy_thumbnail t"
        ).fetchall()
        catalog = connection.execute(
            "SELECT cameras FROM pongdang_data.windy_catalog_revision"
        ).fetchall()
    for private in ("TEMPORARY", "images-webcams", "OFFLINE_SECRET"):
        assert private not in str(records) + str(catalog) + initial.model_dump_json()
    now[0] += 86400 * 365
    restarted = service(
        tmp_path,
        now=now,
        downloader=fetch,
        windy_webcams_api_key="",
        windy_webcams_daily_budget=0,
    )
    http = app_client(restarted)
    for _ in range(2):
        result = http.post("/api/data/livecams/preview", json={})
        assert result.status_code == 200
        assert result.json()["rows"][0]["thumbnail_saved_at"]
        photo = http.get(result.json()["rows"][0]["thumbnail_url"])
        assert photo.status_code == 200 and photo.content == image_bytes()
        assert photo.headers["content-type"] == "image/jpeg"
        assert photo.headers["x-content-type-options"] == "nosniff"
        assert "immutable" in photo.headers["cache-control"]
    assert len(calls) == 1 and restarted.client.calls == []


def test_manual_catalog_refresh_keeps_original_image(tmp_path):
    calls = []

    def fetch(*_):
        calls.append(1)
        return image_bytes("blue" if len(calls) == 1 else "red"), "image/jpeg", "jpg"

    s = service(tmp_path, downloader=fetch)
    original = s.query().rows[0]
    s.client.rows[0]["images"]["current"]["thumbnail"] = URL.replace("TEMPORARY", "NEW")
    refreshed = s.query(refresh=True).rows[0]
    assert refreshed.thumbnail_saved_at == original.thumbnail_saved_at
    assert len(calls) == 1
    assert app_client(s).get(original.thumbnail_url).content == image_bytes("blue")


@pytest.mark.parametrize("failure", ["download", "storage"])
def test_failure_is_recorded_once_and_never_retried_on_views_or_refresh(
    tmp_path, db, monkeypatch, failure
):
    calls = []

    def fetch(*_):
        calls.append(1)
        if failure == "download":
            raise ProviderError("THUMBNAIL_HTTP_ERROR")
        return image_bytes(), "image/jpeg", "jpg"

    if failure == "storage":

        def fail(*_):
            raise OSError("Disk unavailable")

        monkeypatch.setattr("app.livecams.thumbnails.save_file", fail)
    s = service(tmp_path, downloader=fetch)
    assert s.query().rows[0].thumbnail_url is None
    assert s.query().rows[0].thumbnail_url is None
    assert s.query(refresh=True).rows[0].thumbnail_url is None
    assert app_client(s).get("/api/data/livecams/thumbnails/42").status_code == 404
    assert calls == [1]
    with schema.connect(db) as connection:
        assert connection.execute(
            "SELECT status,storage_key FROM pongdang_data.windy_thumbnail"
        ).fetchone() == ("failed", None)


def test_missing_file_is_404_and_never_downloaded_again(tmp_path):
    calls = []

    def fetch(*_):
        calls.append(1)
        return image_bytes(), "image/jpeg", "jpg"

    s = service(tmp_path, downloader=fetch)
    row = s.query().rows[0]
    next((tmp_path / "thumbnails").rglob("*.jpg")).unlink()
    http = app_client(s)
    assert http.get(row.thumbnail_url).status_code == 404
    assert http.get("/api/data/livecams/thumbnails/not-a-camera").status_code == 404
    s.query(refresh=True)
    assert calls == [1]


def test_existing_catalog_requires_explicit_refresh_to_populate_images(tmp_path, db):
    s = service(tmp_path)
    original = s.query()
    with schema.connect(db) as connection:
        connection.execute("TRUNCATE pongdang_data.windy_thumbnail")
    assert s.query().rows[0].thumbnail_url is None
    assert len(s.client.calls) == 5
    assert s.query(refresh=True).rows[0].thumbnail_url
    assert original.rows[0].provider_camera_id == "42"


def test_v14_migration_preserves_catalog_and_never_downloads(tmp_path, db, monkeypatch):
    original = service(tmp_path).query()
    with schema.connect(db) as connection:
        connection.execute("DROP TABLE pongdang_data.windy_thumbnail")
        connection.execute("UPDATE pongdang_data.schema_version SET version=14")

    def forbidden(*args, **kwargs):
        raise AssertionError("Migration must never contact providers")

    monkeypatch.setattr("app.livecams.thumbnails.download", forbidden)
    monkeypatch.setattr("app.livecams.windy.WindyClient.list_page", forbidden)
    assert schema.initialize(db)
    assert not schema.initialize(db)
    with schema.connect(db) as connection:
        assert connection.execute(
            "SELECT count(*) FROM pongdang_data.windy_catalog_revision"
        ).fetchone() == (1,)
        assert connection.execute(
            "SELECT count(*) FROM pongdang_data.windy_thumbnail"
        ).fetchone() == (0,)
    assert (
        service(tmp_path, windy_webcams_api_key="").query().fetched_at
        == original.fetched_at
    )


@pytest.mark.parametrize(
    "url",
    [
        URL.replace("https:", "http:"),
        URL.replace("images-webcams.windy.com", "127.0.0.1"),
        URL.replace("images-webcams.windy.com", "images-webcams.windy.com.evil.test"),
        URL.replace("images-webcams.windy.com", "secret@images-webcams.windy.com"),
        URL.replace("images-webcams.windy.com", "images-webcams.windy.com:8443"),
        URL.replace("/thumbnail/", "/full/"),
        URL.replace("/42/current/", "/43/current/"),
        URL.replace("/42.jpg", "/43.jpg"),
        URL.replace("/thumbnail/", "/../thumbnail/"),
        URL + "#fragment",
    ],
)
def test_untrusted_image_sources_are_never_requested(url):
    with pytest.raises(ProviderError, match="THUMBNAIL_URL_NOT_ALLOWED"):
        image_url(url, "42")


def test_selection_keeps_signed_url_and_omits_secrets():
    row = camera(images={"current": {"thumbnail": URL}})
    assert source_image(row, "42") == URL
    assert source_image(row, "42", secret="TEMPORARY") is None


class Response(io.BytesIO):
    def __init__(self, body, status=200, content_type="image/jpeg", length=None):
        super().__init__(body)
        self.status = status
        self.headers = {
            "content-type": content_type,
            "content-length": str(length or len(body)),
        }


def opener(response, requests):
    def open_request(request, timeout):
        requests.append(request)
        assert timeout == 3
        return response

    return SimpleNamespace(open=open_request)


def test_download_uses_exact_api_url_without_auth_headers():
    requests = []
    assert download("42", URL, opener=opener(Response(image_bytes()), requests)) == (
        image_bytes(),
        "image/jpeg",
        "jpg",
    )
    assert requests[0].full_url == URL
    assert requests[0].get_header("X-windy-api-key") is None
    assert requests[0].get_header("Cookie") is None


@pytest.mark.parametrize(
    "response,code",
    [
        (lambda: Response(image_bytes(), status=302), "THUMBNAIL_HTTP_ERROR"),
        (lambda: Response(image_bytes(), status=401), "THUMBNAIL_HTTP_ERROR"),
        (lambda: Response(image_bytes(), length=MAX_BYTES + 1), "THUMBNAIL_TOO_LARGE"),
        (lambda: Response(b"x" * (MAX_BYTES + 1), length=1), "THUMBNAIL_TOO_LARGE"),
        (lambda: Response(b"<svg>not a raster</svg>"), "THUMBNAIL_INVALID_IMAGE"),
        (
            lambda: Response(image_bytes(), content_type="text/html"),
            "THUMBNAIL_CONTENT_TYPE_MISMATCH",
        ),
    ],
)
def test_download_rejects_bad_responses(response, code):
    with pytest.raises(ProviderError, match=code):
        download("42", URL, opener=opener(response(), []))


def test_large_decoded_image_is_rejected():
    buffer = io.BytesIO()
    Image.new("RGB", (1025, 1025)).save(buffer, format="PNG")
    with pytest.raises(ProviderError, match="THUMBNAIL_DIMENSIONS_NOT_ALLOWED"):
        download("42", URL, opener=opener(Response(buffer.getvalue()), []))
