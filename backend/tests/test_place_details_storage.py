"""Permanent detail evidence and read-only access in disposable pongdang_test."""

import asyncio
from datetime import UTC, datetime, timedelta

import psycopg
import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.ingestion.models import Place, SourceBatch
from app.ingestion.storage import store_batch
from app.main import create_app
from app.place_details.models import DetailField, PlaceDetail
from app.schema import VERSION, connect, initialize
from app.travel.catalog import Catalog

BASE = "/api/data/place-details"
NOW = datetime.now(UTC) - timedelta(days=5)


@pytest.fixture
def database():
    settings = Settings(_env_file=None, ai_provider="disabled")
    if settings.postgres_db != "pongdang_test":
        pytest.fail("Place detail tests require disposable pongdang_test")
    with connect(settings) as c:
        c.execute("DROP SCHEMA IF EXISTS pongdang_data CASCADE")
    initialize(settings)
    yield settings
    with connect(settings) as c:
        c.execute("DROP SCHEMA IF EXISTS pongdang_data CASCADE")


def add_place(settings, source_id="100", provider="TOURAPI_KOREAN", category="12"):
    store_batch(
        settings,
        SourceBatch(
            provider=provider,
            fetched_at=NOW,
            places=[
                Place(
                    source_id=source_id,
                    name="격리 해변",
                    kind="beach",
                    latitude=37.8,
                    longitude=128.9,
                    category=category,
                    source_modified_at=NOW,
                )
            ],
        ),
    )
    with connect(settings) as c:
        return c.execute(
            "SELECT id,spot_id FROM pongdang_data.collection_place "
            "WHERE provider=%s AND source_id=%s",
            [provider, source_id],
        ).fetchone()


def detail(**updates):
    return PlaceDetail(
        **(
            {
                "source_id": "100",
                "content_type": "12",
                "name": "격리 해변",
                "source_created_at": NOW - timedelta(days=100),
                "source_modified_at": NOW,
                "catalog_modified_at": NOW,
                "opening_hours": "09:00~18:00",
                "rest_days": "월요일",
                "opening_period": "제공처가 명시한 계절",
                "opening_date": "2000-01-01",
                "parking": "주차장 있음",
                "facilities": "화장실",
                "contact": "033-000-0000",
                "homepage": "https://example.com/beach",
                "overview": "제공처가 등록한 소개",
                "details": [
                    DetailField(
                        section="intro",
                        key="usetime",
                        label="이용시간",
                        value="09:00~18:00",
                    )
                ],
            }
            | updates
        )
    )


def save(settings, record=None, *, now=NOW, provider="TOURAPI_KOREAN"):
    return store_batch(
        settings,
        SourceBatch(
            provider=provider,
            fetched_at=now,
            place_details=[record or detail()],
        ),
    )


def rows(settings, query, params=()):
    with connect(settings) as c:
        return c.execute(query, params).fetchall()


def attempt(settings, place_id, state, modified_at=NOW):
    with connect(settings) as c:
        c.execute(
            "INSERT INTO pongdang_data.place_detail_collection "
            "(place_id,state,content_type,catalog_modified_at,checked_at,"
            "last_success_at,next_attempt_at,consecutive_failures,error_code) "
            "VALUES (%s,%s,'12',%s,%s,%s,%s,%s,%s) "
            "ON CONFLICT(place_id) DO UPDATE SET state=excluded.state,"
            "checked_at=excluded.checked_at,next_attempt_at=excluded.next_attempt_at,"
            "consecutive_failures=excluded.consecutive_failures,"
            "error_code=excluded.error_code",
            [
                place_id,
                state,
                modified_at,
                NOW + timedelta(hours=1),
                NOW if state in {"available", "empty"} else None,
                NOW + timedelta(hours=2) if state == "failed" else None,
                1 if state == "failed" else 0,
                "UPSTREAM_ERROR" if state == "failed" else "",
            ],
        )


def test_storage_deduplicates_and_preserves_revisions_and_fetch_time(database):
    place_id, spot_id = add_place(database)
    assert save(database) == 1
    assert save(database, now=NOW + timedelta(days=1)) == 0
    first = rows(
        database,
        "SELECT id,place_id,spot_id,opening_hours,fetched_at,state,details "
        "FROM pongdang_data.place_detail ORDER BY id",
    )[0]
    assert first[1:6] == (place_id, spot_id, "09:00~18:00", NOW, "active")
    assert first[6][0]["key"] == "usetime"
    changed = detail(opening_hours="10:00~17:00")
    assert save(database, changed, now=NOW + timedelta(days=1)) == 1
    assert rows(
        database,
        "SELECT opening_hours,state FROM pongdang_data.place_detail ORDER BY id",
    ) == [("09:00~18:00", "superseded"), ("10:00~17:00", "active")]
    assert save(database, now=NOW + timedelta(days=2)) == 0
    assert rows(
        database,
        "SELECT opening_hours,state,fetched_at FROM pongdang_data.place_detail "
        "ORDER BY id",
    ) == [
        ("09:00~18:00", "active", NOW),
        ("10:00~17:00", "superseded", NOW + timedelta(days=1)),
    ]


def test_detail_batch_requires_parent_and_rolls_back_prior_revision(database):
    add_place(database)
    save(database)
    with pytest.raises(ValueError, match="place_detail_requires_collected_place"):
        store_batch(
            database,
            SourceBatch(
                provider="TOURAPI_KOREAN",
                fetched_at=NOW + timedelta(days=1),
                place_details=[
                    detail(opening_hours="새로운 시간"),
                    detail(source_id="999"),
                ],
            ),
        )
    assert rows(
        database,
        "SELECT opening_hours,state,fetched_at FROM pongdang_data.place_detail",
    ) == [("09:00~18:00", "active", NOW)]


def test_http_returns_stored_details_and_keeps_failed_refresh_evidence(database):
    place_id, spot_id = add_place(database)
    save(database)
    attempt(database, place_id, "available")
    attempt(database, place_id, "failed")
    before = rows(database, "SELECT * FROM pongdang_data.place_detail_collection")
    with TestClient(create_app(database)) as client:
        response = client.get(BASE, params={"spot_ids": f"{spot_id},{spot_id},999"})
        assert response.status_code == 200, response.text
        assert response.headers["cache-control"] == "no-store"
        assert len(response.json()["items"]) == 1
        item = response.json()["items"][0]
        assert item["status"] == "available"
        assert item["opening_hours"] == "09:00~18:00"
        assert item["parking"] == "주차장 있음"
        assert item["details"][0]["key"] == "usetime"
        assert datetime.fromisoformat(item["fetched_at"]) == NOW
        assert item["refresh_failed"] is True
        assert item["refresh_pending"] is True
        assert not {"evidence_hash", "photo_url", "error_code"} & item.keys()
        assert client.post(BASE, json={"spot_ids": [spot_id]}).status_code == 405
        for invalid in ("0", "-1", "1;DROP", "9" * 19, ",".join(["1"] * 101)):
            assert client.get(BASE, params={"spot_ids": invalid}).status_code == 422
    assert (
        rows(database, "SELECT * FROM pongdang_data.place_detail_collection") == before
    )


def test_empty_pending_failed_unsupported_and_unmatched_are_distinct(database):
    empty_id, empty_spot = add_place(database)
    _, pending_spot = add_place(database, "101")
    failed_id, failed_spot = add_place(database, "102")
    _, unsupported_spot = add_place(database, "103", category="999")
    _, unmatched_spot = add_place(database, "104", provider="KAKAO_LOCAL")
    save(
        database,
        PlaceDetail(
            source_id="100",
            content_type="12",
            name="격리 해변",
            availability="empty",
            catalog_modified_at=NOW,
        ),
    )
    attempt(database, empty_id, "empty")
    attempt(database, failed_id, "failed")
    with TestClient(create_app(database)) as client:
        result = client.get(
            BASE,
            params={
                "spot_ids": ",".join(
                    map(
                        str,
                        [
                            empty_spot,
                            pending_spot,
                            failed_spot,
                            unsupported_spot,
                            unmatched_spot,
                        ],
                    )
                )
            },
        )
    assert result.status_code == 200, result.text
    items = {row["spot_id"]: row for row in result.json()["items"]}
    assert {key: item["status"] for key, item in items.items()} == {
        empty_spot: "empty",
        pending_spot: "pending",
        failed_spot: "failed",
        unsupported_spot: "unsupported",
        unmatched_spot: "unmatched",
    }
    assert items[empty_spot]["opening_hours"] is None
    assert items[empty_spot]["details"] == []
    assert items[empty_spot]["refresh_pending"] is False
    assert items[unmatched_spot]["provider"] is None


def test_confirmed_link_and_catalog_revision_are_visible_without_network(database):
    place_id, source_spot = add_place(database)
    _, linked_spot = add_place(database, "104", provider="KAKAO_LOCAL")
    save(database)
    with connect(database) as c:
        c.execute(
            "INSERT INTO pongdang_data.place_detail_link "
            "(spot_id,place_id,match_method,linked_at) "
            "VALUES (%s,%s,'name_and_coordinates',%s)",
            [linked_spot, place_id, NOW],
        )
        c.execute(
            "UPDATE pongdang_data.collection_place SET source_modified_at=%s "
            "WHERE id=%s",
            [NOW + timedelta(days=1), place_id],
        )
    with TestClient(create_app(database)) as client:
        result = client.get(BASE, params={"spot_ids": f"{source_spot},{linked_spot}"})
    assert result.status_code == 200, result.text
    assert len(result.json()["items"]) == 2
    for item in result.json()["items"]:
        assert item["opening_hours"] == "09:00~18:00"
        assert item["provider"] == "TOURAPI_KOREAN"
        assert item["refresh_pending"] is True
        assert item["refresh_failed"] is False
    places = asyncio.run(
        Catalog(database, NOW + timedelta(days=2)).places([linked_spot])
    )
    assert places[linked_spot]["opening_hours"] == "09:00~18:00"


def test_v10_migration_preserves_catalogue_and_adds_constrained_tables(database):
    parent = add_place(database)
    with connect(database) as c:
        c.execute(
            "ALTER TABLE pongdang_data.attachment_collection "
            "DROP COLUMN source_detail_id"
        )
        for table in (
            "place_detail_link",
            "place_detail_collection",
            "place_detail_budget",
            "place_detail",
        ):
            c.execute(f"DROP TABLE pongdang_data.{table}")
        c.execute("UPDATE pongdang_data.schema_version SET version=10 WHERE id=1")
    assert initialize(database) is True
    assert initialize(database) is False
    assert rows(database, "SELECT version FROM pongdang_data.schema_version") == [
        (VERSION,)
    ]
    assert rows(database, "SELECT id,spot_id FROM pongdang_data.collection_place") == [
        parent
    ]
    assert save(database) == 1
    with pytest.raises(psycopg.errors.CheckViolation), connect(database) as c:
        c.execute(
            "INSERT INTO pongdang_data.place_detail_budget(service,day,calls) "
            "VALUES ('KorService2','2026-09-21',-1)"
        )
    with pytest.raises(psycopg.errors.ForeignKeyViolation), connect(database) as c:
        c.execute(
            "INSERT INTO pongdang_data.place_detail_link "
            "(spot_id,place_id,match_method,linked_at) "
            "VALUES (999,999,'provider_id',%s)",
            [NOW],
        )


def test_normalized_details_and_attempts_are_browsable_with_bounded_rows(database):
    place_id, _ = add_place(database)
    save(database)
    attempt(database, place_id, "available")
    with TestClient(create_app(database)) as client:
        for key in ("place-details", "place-detail-collection"):
            response = client.get("/api/data/datasets/" + key)
            assert response.status_code == 200, response.text
            assert response.json()["total"] == 1
            assert len(response.json()["rows"]) == 1
            assert "evidence_hash" not in response.json()["rows"][0]
            assert (
                client.get(
                    "/api/data/datasets/" + key, params={"page_size": 101}
                ).status_code
                == 422
            )
