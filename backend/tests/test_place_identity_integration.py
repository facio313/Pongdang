"""Identity backfill, read contracts and collection updates on disposable PG."""

from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient
from psycopg import sql
from psycopg.types.json import Jsonb

from app.config import Settings
from app.ingestion.models import Place, SourceBatch, Station
from app.ingestion.storage import store_batch
from app.main import create_app
from app.place_identity import reconcile_place_identities
from app.schema import VERSION, connect, initialize, reconcile_places


def test_identity_only_backfill_does_not_advance_other_migrations(identity_db):
    a = collect(identity_db, "KAKAO_LOCAL", "a", "경포해수욕장")
    b = collect(identity_db, "TOURAPI_KOREAN", "b", "경포해수욕장")
    with connect(identity_db) as c:
        c.execute("DROP TABLE pongdang_data.place_alias")
        c.execute("UPDATE pongdang_data.schema_version SET version=10 WHERE id=1")
    assert reconcile_places(identity_db) == 1
    assert reconcile_places(identity_db) == 1
    with connect(identity_db) as c:
        assert c.execute(
            "SELECT version FROM pongdang_data.schema_version"
        ).fetchone() == (10,)
        assert c.execute(
            "SELECT spot_id,canonical_spot_id FROM pongdang_data.place_alias"
        ).fetchall() == [(b, a)]
    # A later full initialization still applies every remaining migration once.
    assert initialize(identity_db)
    assert not initialize(identity_db)


@pytest.fixture
def identity_db():
    settings = Settings(_env_file=None, ai_provider="disabled")
    if settings.postgres_db != "pongdang_test":
        pytest.fail("Identity tests require disposable pongdang_test")
    with connect(settings) as c:
        c.execute("DROP SCHEMA IF EXISTS pongdang_data CASCADE")
    initialize(settings)
    try:
        yield settings
    finally:
        with connect(settings) as c:
            c.execute("DROP SCHEMA IF EXISTS pongdang_data CASCADE")


def collect(settings, provider, source_id, name, **updates):
    value = dict(
        source_id=source_id,
        name=name,
        kind="tourism" if provider == "TOURAPI_KOREAN" else "beach_search_result",
        latitude=37.8034,
        longitude=128.9102,
        address="강원특별자치도 강릉시 창해로 514",
        category="12"
        if provider == "TOURAPI_KOREAN"
        else "여행 > 관광,명소 > 해수욕장",
    )
    value.update(updates)
    store_batch(
        settings,
        SourceBatch(
            provider=provider, fetched_at=datetime.now(UTC), places=[Place(**value)]
        ),
    )
    with connect(settings) as c:
        return c.execute(
            "SELECT spot_id FROM pongdang_data.collection_place "
            "WHERE provider=%s AND source_id=%s",
            [provider, source_id],
        ).fetchone()[0]


def test_filtered_count_paging_and_original_detail_links(identity_db):
    a = collect(identity_db, "KAKAO_LOCAL", "a", "경포해수욕장")
    b = collect(
        identity_db, "TOURAPI_KOREAN", "b", "경포해변", address="강릉시 별도주소"
    )
    other = collect(identity_db, "KAKAO_LOCAL", "c", "강문해변")
    collect(identity_db, "TOURAPI_KOREAN", "d", "강문해변", latitude=37.8035)
    with TestClient(create_app(identity_db)) as client:
        first = client.get("/api/data/places", params={"page_size": 1}).json()
        second = client.get(
            "/api/data/places", params={"page_size": 1, "page": 2}
        ).json()
        assert first["total"] == second["total"] == 2
        assert first["has_more"] and not second["has_more"]
        assert {first["rows"][0]["id"], second["rows"][0]["id"]} == {a, other}
        for q in ("경포", "경포해변", "별도주소"):
            page = client.get(
                "/api/data/places",
                params={"q": q, "district": "gangneung", "kind": "beach"},
            ).json()
            assert page["total"] == 1 and page["rows"][0]["id"] == a
            assert page["rows"][0]["alias_ids"] == [b]
        legacy = client.get(
            "/api/data/livecams/preview/places", params={"q": "경포해변"}
        ).json()
        assert [r["id"] for r in legacy] == [a]
        for sid in (a, b):
            response = client.get(
                "/api/data/livecams/preview/places", params={"spot_id": sid}
            )
            assert response.status_code == 200
            assert response.json()[0]["id"] == sid


def test_recollection_is_idempotent_and_changed_metadata_unlinks(identity_db):
    a = collect(identity_db, "KAKAO_LOCAL", "a", "경포해수욕장")
    b = collect(identity_db, "TOURAPI_KOREAN", "b", "경포해수욕장")
    collect(identity_db, "TOURAPI_KOREAN", "b", "경포해수욕장")
    with connect(identity_db) as c:
        assert c.execute(
            "SELECT spot_id,canonical_spot_id FROM pongdang_data.place_alias"
        ).fetchall() == [(b, a)]
        assert (
            c.execute("SELECT count(*) FROM pongdang_data.spots_waterspot").fetchone()[
                0
            ]
            == 2
        )
    collect(identity_db, "TOURAPI_KOREAN", "b", "경포해수욕장", latitude=38.8)
    with connect(identity_db) as c:
        assert (
            c.execute("SELECT count(*) FROM pongdang_data.place_alias").fetchone()[0]
            == 0
        )
    collect(identity_db, "TOURAPI_KOREAN", "b", "경포해수욕장")
    collect(identity_db, "TOURAPI_KOREAN", "b", "경포해변(별도구역)")
    with connect(identity_db) as c:
        assert (
            c.execute("SELECT count(*) FROM pongdang_data.place_alias").fetchone()[0]
            == 0
        )


def test_backfill_preserves_original_records_and_saved_references(identity_db):
    a = collect(identity_db, "KAKAO_LOCAL", "a", "경포해수욕장")
    b = collect(identity_db, "TOURAPI_KOREAN", "b", "경포해수욕장")
    store_batch(
        identity_db,
        SourceBatch(
            provider="khoa_beach",
            fetched_at=datetime.now(UTC),
            stations=[
                Station(
                    source_id="station",
                    name="경포해수욕장",
                    kind="beach",
                    region="51:150",
                    latitude=37.803,
                    longitude=128.91,
                )
            ],
        ),
    )
    with connect(identity_db) as c:
        c.execute(
            "INSERT INTO pongdang_data.travel_signal(id,owner_subject,payload) "
            "VALUES('saved-alias','identity-test',%s)",
            [Jsonb({"kind": "favorite", "action": "like", "spot_id": b})],
        )
        c.execute("DROP TABLE pongdang_data.place_alias")
        c.execute("UPDATE pongdang_data.schema_version SET version=13 WHERE id=1")

    def originals():
        with connect(identity_db) as c:
            return {
                table: c.execute(
                    sql.SQL("SELECT to_jsonb(t) FROM {} t ORDER BY id").format(
                        sql.Identifier("pongdang_data", table)
                    )
                ).fetchall()
                for table in (
                    "spots_waterspot",
                    "collection_place",
                    "collection_station",
                    "travel_signal",
                )
            }

    before = originals()
    assert initialize(identity_db)
    assert not initialize(identity_db)
    assert originals() == before
    with connect(identity_db) as c:
        assert c.execute(
            "SELECT version FROM pongdang_data.schema_version"
        ).fetchone() == (VERSION,)
        assert (
            c.execute(
                "SELECT count(*) FROM pongdang_data.place_alias "
                "WHERE canonical_spot_id=%s",
                [a],
            ).fetchone()[0]
            == 2
        )
        assert reconcile_place_identities(c) == 2


def test_reconciliation_failure_rolls_back_new_place(identity_db, monkeypatch):
    collect(identity_db, "KAKAO_LOCAL", "a", "경포해수욕장")

    def failed(_):
        raise ValueError("identity reconciliation failed")

    monkeypatch.setattr("app.place_identity.reconcile_place_identities", failed)
    with pytest.raises(ValueError, match="identity reconciliation failed"):
        collect(identity_db, "TOURAPI_KOREAN", "b", "경포해수욕장")
    with connect(identity_db) as c:
        assert (
            c.execute("SELECT count(*) FROM pongdang_data.spots_waterspot").fetchone()[
                0
            ]
            == 1
        )
        assert (
            c.execute("SELECT count(*) FROM pongdang_data.collection_place").fetchone()[
                0
            ]
            == 1
        )
