"""Attachment persistence and reads against a disposable pongdang_test database."""

from datetime import UTC, datetime, timedelta

import psycopg
import pytest
from fastapi.testclient import TestClient
from test_attachments import PNG, URL, JsonClient, png, provider_row

from app.attachments.collector import TourPhotos, collect_photos, due_places, persist
from app.attachments.files import file_path
from app.config import Settings
from app.ingestion.http import ProviderError
from app.main import create_app
from app.schema import connect, initialize

BASE = "/api/data/attachments"


@pytest.fixture
def database(tmp_path):
    settings = Settings(
        _env_file=None,
        attachment_root=tmp_path / "attachments",
        data_go_kr_key="offline-fixture-key",
        ai_provider="disabled",
    )
    if settings.postgres_db != "pongdang_test":
        pytest.fail("Attachment integration requires disposable pongdang_test")
    initialize(settings)
    yield settings
    with connect(settings) as c:
        c.execute("DROP SCHEMA pongdang_data CASCADE")


def add_place(settings, identity=1, kind="beach"):
    with connect(settings) as c:
        c.execute(
            "INSERT INTO pongdang_data.spots_waterspot(id,name,type,lat,lng) "
            "VALUES (%s,'경포해수욕장',%s,37.805,128.909)",
            [identity, kind],
        )
    return {"id": identity, "name": "경포해수욕장", "lat": 37.805, "lng": 128.909}


def photo():
    return {
        "source_record_id": "1234",
        "name": "경포해변",
        "original_url": URL.replace("https:", "http:"),
        "source_url": URL,
        "license": "Type1",
        "attribution": "한국관광공사 TourAPI · 경포해변 · 공공누리 1유형",
        "source_modified_at": None,
    }


def save(settings, place, *, payload=PNG, metadata=None, now=None):
    return persist(
        settings,
        place,
        metadata or photo(),
        "name_and_coordinates",
        payload,
        "image/png",
        "png",
        now or datetime.now(UTC),
    )


def fetch(settings, query, params=()):
    with connect(settings) as c:
        return c.execute(query, params).fetchall()


def make_due(settings):
    with connect(settings) as c:
        c.execute(
            "UPDATE pongdang_data.attachment_collection "
            "SET next_attempt_at=now()-interval '1 second'"
        )


def test_collect_downloads_real_bytes_and_deduplicates_on_refresh(database):
    add_place(database)
    calls = []

    def image(url, max_bytes):
        calls.append((url, max_bytes))
        return PNG, "image/png", "png"

    def provider():
        return TourPhotos(database, JsonClient([provider_row()]))

    result = collect_photos(database, provider=provider(), fetch_image=image)
    assert result == {"received": 1, "inserted": 1, "state": "succeeded", "error": ""}
    assert calls == [(URL, database.photo_max_bytes)]
    rows = fetch(
        database,
        "SELECT storage_key,byte_size,fetched_at,source_modified_at "
        "FROM pongdang_data.attachment",
    )
    key, size, fetched_at, source_modified_at = rows[0]
    assert file_path(database.attachment_root, key).read_bytes() == PNG
    assert size == len(PNG)
    assert source_modified_at is None
    assert (
        collect_photos(database, provider=provider(), fetch_image=image)["received"]
        == 0
    )
    make_due(database)
    assert (
        collect_photos(database, provider=provider(), fetch_image=image)["inserted"]
        == 0
    )
    assert fetch(database, "SELECT fetched_at FROM pongdang_data.attachment") == [
        (fetched_at,)
    ]
    assert len(list(database.attachment_root.rglob("*.png"))) == 1


def test_revisions_preserve_prior_evidence_and_update_confirmed_links(database):
    first, second = add_place(database), add_place(database, 2)
    assert save(database, first) == 1
    assert save(database, second) == 0
    old_id, old_key = fetch(
        database, "SELECT id,storage_key FROM pongdang_data.attachment"
    )[0]
    changed = png(b"\x00\xff\x00")
    assert save(database, first, payload=changed) == 1
    rows = fetch(
        database,
        "SELECT id,storage_key,status FROM pongdang_data.attachment ORDER BY id",
    )
    assert len(rows) == 2
    assert rows[0] == (old_id, old_key, "superseded")
    assert rows[1][2] == "active"
    assert file_path(database.attachment_root, old_key).read_bytes() == PNG
    assert file_path(database.attachment_root, rows[1][1]).read_bytes() == changed
    assert fetch(
        database,
        "SELECT spot_id,attachment_id FROM pongdang_data.place_attachment "
        "ORDER BY spot_id",
    ) == [(1, rows[1][0]), (2, rows[1][0])]
    assert save(database, first) == 0
    assert fetch(
        database, "SELECT id,status FROM pongdang_data.attachment ORDER BY id"
    ) == [(old_id, "active"), (rows[1][0], "superseded")]


def test_failed_link_transaction_does_not_publish_attachment_metadata(database):
    with pytest.raises(psycopg.errors.ForeignKeyViolation):
        save(database, {"id": 999})
    for table in ("attachment", "place_attachment", "attachment_collection"):
        assert fetch(database, f"SELECT count(*) FROM pongdang_data.{table}") == [(0,)]
    # Bytes may safely survive the failed transaction for reuse on retry.
    assert len(list(database.attachment_root.rglob("*.png"))) == 1
    assert save(database, add_place(database, 999)) == 1


def test_failure_keeps_previous_photo_and_success_time_with_persisted_backoff(database):
    now = datetime.now(UTC) - timedelta(days=1)
    save(database, add_place(database), now=now)
    make_due(database)

    class Failure:
        def find(self, place):
            raise ProviderError("IMAGE_NETWORK_ERROR")

    for failures, minutes in ((1, 30), (2, 60)):
        result = collect_photos(database, provider=Failure())
        assert result["state"] == "failed"
        state, success, count, checked, due, error = fetch(
            database,
            "SELECT state,last_success_at,consecutive_failures,checked_at,"
            "next_attempt_at,error_code FROM pongdang_data.attachment_collection",
        )[0]
        assert (state, success, count, error) == (
            "failed",
            now,
            failures,
            "IMAGE_NETWORK_ERROR",
        )
        assert due - checked == timedelta(minutes=minutes)
        assert fetch(
            database, "SELECT count(*) FROM pongdang_data.place_attachment"
        ) == [(1,)]
        make_due(database)


@pytest.mark.parametrize("state", ["no_image", "no_match", "ambiguous", "restricted"])
def test_confirmed_missing_or_restricted_photo_removes_link_but_preserves_evidence(
    database, state
):
    save(database, add_place(database))
    make_due(database)

    class Missing:
        def find(self, place):
            return None, state, "name_and_coordinates"

    result = collect_photos(database, provider=Missing())
    assert result["state"] == "no_data"
    assert fetch(database, "SELECT count(*) FROM pongdang_data.place_attachment") == [
        (0,)
    ]
    assert fetch(database, "SELECT count(*) FROM pongdang_data.attachment") == [(1,)]
    checked_state, checked, due = fetch(
        database,
        "SELECT state,checked_at,next_attempt_at "
        "FROM pongdang_data.attachment_collection",
    )[0]
    assert checked_state == state
    assert due - checked == timedelta(days=database.photo_refresh_days)
    with TestClient(create_app(database)) as client:
        assert client.get(BASE, params={"spot_ids": "1"}).json() == {"items": []}
        assert client.get(BASE + "/1/file").status_code == 404


def test_storage_failure_has_no_success_record_or_metadata(database, monkeypatch):
    add_place(database)
    provider = TourPhotos(database, JsonClient([provider_row()]))

    def broken_store(*args):
        raise OSError("private storage path")

    monkeypatch.setattr("app.attachments.collector.save_file", broken_store)
    result = collect_photos(
        database, provider=provider, fetch_image=lambda *args: (PNG, "image/png", "png")
    )
    assert result["state"] == "failed"
    assert fetch(database, "SELECT count(*) FROM pongdang_data.attachment") == [(0,)]
    assert fetch(
        database,
        "SELECT last_success_at,error_code FROM pongdang_data.attachment_collection",
    ) == [(None, "PHOTO_STORAGE_ERROR")]


def test_due_selection_is_bounded_and_only_water_places(database):
    for identity, kind in ((1, "beach"), (2, "valley"), (3, "beach"), (4, "other")):
        add_place(database, identity, kind)
    save(database, {"id": 1})
    limited = database.model_copy(update={"photo_collection_batch_size": 1})
    assert [row["id"] for row in due_places(limited)] == [2]
    assert [row["id"] for row in due_places(database)] == [2, 3]


def test_http_reads_only_public_metadata_and_bounded_local_files(database):
    save(database, add_place(database))
    before = fetch(database, "SELECT * FROM pongdang_data.attachment_collection")
    with TestClient(create_app(database)) as client:
        response = client.get(BASE, params={"spot_ids": "1,1,2"})
        assert response.status_code == 200, response.text
        assert response.headers["cache-control"] == "no-store"
        assert len(response.json()["items"]) == 1
        item = response.json()["items"][0]
        assert item["spot_id"] == 1
        assert item["source_url"] == URL
        assert item["license"] == "Type1"
        assert item["attribution"].startswith("한국관광공사")
        assert (
            not {"storage_key", "sha256", "evidence_hash", "original_url"} & item.keys()
        )
        assert str(database.attachment_root) not in response.text
        assert item["url"] == BASE + f"/{item['id']}/file"
        image = client.get(item["url"])
        assert image.status_code == 200
        assert image.content == PNG
        assert image.headers["content-type"] == "image/png"
        assert image.headers["x-content-type-options"] == "nosniff"
        for ids in ("0", "-1", "1;DROP", "9" * 19, ",".join(["1"] * 101)):
            assert client.get(BASE, params={"spot_ids": ids}).status_code == 422
        for identity in (0, -1, 2**63, 999):
            assert client.get(BASE + f"/{identity}/file").status_code == 404
        assert client.post(BASE, json={"spot_id": 1}).status_code == 405
    assert (
        fetch(database, "SELECT * FROM pongdang_data.attachment_collection") == before
    )


def test_missing_or_truncated_stored_file_returns_404(database):
    save(database, add_place(database))
    identity, key = fetch(
        database, "SELECT id,storage_key FROM pongdang_data.attachment"
    )[0]
    path = file_path(database.attachment_root, key)
    with TestClient(create_app(database)) as client:
        path.write_bytes(PNG[:8])
        assert client.get(BASE + f"/{identity}/file").status_code == 404
        path.unlink()
        assert client.get(BASE + f"/{identity}/file").status_code == 404
        assert client.get(BASE, params={"spot_ids": "1"}).json() == {"items": []}


def test_additive_v8_migration_preserves_existing_places_and_is_idempotent(database):
    add_place(database)
    with connect(database) as c:
        c.execute("DROP TABLE pongdang_data.place_attachment")
        c.execute("DROP TABLE pongdang_data.attachment_collection")
        c.execute("DROP TABLE pongdang_data.attachment")
        c.execute("UPDATE pongdang_data.schema_version SET version=8 WHERE id=1")
    assert initialize(database)
    assert fetch(database, "SELECT id,name FROM pongdang_data.spots_waterspot") == [
        (1, "경포해수욕장")
    ]
    from app.schema import VERSION

    assert fetch(database, "SELECT version FROM pongdang_data.schema_version") == [
        (VERSION,)
    ]
    assert not initialize(database)
    assert fetch(database, "SELECT count(*) FROM pongdang_data.attachment") == [(0,)]
