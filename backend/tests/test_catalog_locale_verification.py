"""Official language/category boundaries and fresh catalogue evidence."""

import asyncio
from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb
from test_place_identity_integration import identity_db as identity_db

from app.ingestion.models import SourceBatch
from app.ingestion.storage import store_batch
from app.ingestion.water_tour_extra import tourism_place
from app.livecams.places import PLACE_SELECT
from app.main import create_app
from app.place_details.models import DetailField, PlaceDetail
from app.place_translations.migrations import migrate_place_translations
from app.place_translations.service import PROMPT_VERSION, content_hash
from app.schema import connect
from app.travel.catalog import Catalog, matches_visit_intent, place_view
from app.travel.models import TravelRequest


def source(*, source_id="official-1", content_type="76", code="NA020900"):
    return {
        "contentid": source_id,
        "contenttypeid": content_type,
        "title": "Official source title",
        "mapx": "128.9",
        "mapy": "37.8",
        "lDongRegnCd": "51",
        "lDongSignguCd": "150",
        "lclsSystm3": code,
    }


@pytest.mark.parametrize("content_type", ["12", "76"])
@pytest.mark.parametrize(
    ("code", "kind"),
    [
        ("NA020900", "beach"),
        ("NA010400", "valley"),
        ("NA020100", "river"),
        ("NA020200", "lake"),
        ("NA020300", "reservoir"),
    ],
)
def test_official_new_classification_preserves_foreign_water_types(
    content_type, code, kind
):
    now = datetime.now(UTC)
    item = tourism_place(source(content_type=content_type, code=code), now)
    assert item.kind == kind
    assert item.category == content_type
    assert item.source_id == "official-1"
    row = place_view(
        {
            "spot_id": 1,
            "name": item.name,
            "type": item.kind,
            "provider": "tourapi_english",
            "source_id": item.source_id,
            "category": item.category,
            "fetched_at": now,
        },
        now,
    )
    assert matches_visit_intent(
        TravelRequest(locale="en", visit_intents=[{"place_type": kind}]), row
    )


@pytest.mark.parametrize("content_type", ["39", "82"])
def test_official_cafe_code_is_specific_not_any_food_service(content_type):
    now = datetime.now(UTC)
    assert (
        tourism_place(source(content_type=content_type, code="FD050100"), now).kind
        == "cafe"
    )
    assert (
        tourism_place(source(content_type=content_type, code="FD010100"), now).kind
        == "tourism"
    )
    assert (
        tourism_place(source(content_type="76", code="FD050100"), now).kind == "tourism"
    )
    # The official grouping includes saunas/spas; it does not establish onsen.
    assert tourism_place(source(code="EX050100"), now).kind == "tourism"


def collect(
    settings,
    *,
    provider="tourapi_english",
    code="NA020900",
    content_type="76",
    source_id="official-1",
    fetched=None,
):
    fetched = fetched or datetime.now(UTC) - timedelta(minutes=2)
    item = tourism_place(
        source(source_id=source_id, code=code, content_type=content_type), fetched
    )
    store_batch(
        settings,
        SourceBatch(
            provider=provider, fetched_at=fetched, places=[item], catalog_only=True
        ),
    )
    with connect(settings) as c:
        sid = c.execute(
            "SELECT spot_id FROM pongdang_data.collection_place "
            "WHERE provider=%s AND source_id=%s",
            [provider, source_id],
        ).fetchone()[0]
    return sid


def test_real_adapter_categories_reach_foreign_recommendation_queries(identity_db):
    for locale, provider in (
        ("en", "tourapi_english"),
        ("ja", "tourapi_japanese"),
        ("zh-CN", "tourapi_chinese_simplified"),
    ):
        beach = collect(identity_db, provider=provider, source_id="beach")
        cafe = collect(
            identity_db,
            provider=provider,
            code="FD050100",
            content_type="82",
            source_id="cafe",
        )
        catalog = Catalog(identity_db, datetime.now(UTC))
        for kind, role, wanted in (("beach", "visit", beach), ("cafe", "meal", cafe)):
            rows, scope = asyncio.run(
                catalog.search(
                    TravelRequest(
                        locale=locale,
                        region="강릉",
                        place_role=role,
                        visit_intents=[{"place_type": kind}],
                    )
                )
            )
            assert [row["spot_id"] for row in rows] == [wanted]
            assert rows[0]["catalog_locale"] == locale
            assert rows[0]["translation_status"] == "original"
            assert scope["language_fallback"] is None
        restaurants, _ = asyncio.run(
            catalog.search(
                TravelRequest(
                    locale=locale,
                    region="강릉",
                    place_role="meal",
                    visit_intents=[{"place_type": "restaurant"}],
                )
            )
        )
        assert restaurants == []


def test_stored_official_detail_classifies_old_foreign_records_without_recollecting(
    identity_db,
):
    now = datetime.now(UTC) - timedelta(minutes=2)
    sid = collect(identity_db, source_id="1234", code="", fetched=now)
    detail = PlaceDetail(
        source_id="1234",
        content_type="76",
        name="Official source title",
        details=[
            DetailField(
                section="common", key="lclsSystm3", label="분류체계", value="NA020900"
            )
        ],
    )
    store_batch(
        identity_db,
        SourceBatch(provider="tourapi_english", fetched_at=now, place_details=[detail]),
    )
    catalog = Catalog(identity_db, datetime.now(UTC))
    rows, _ = asyncio.run(
        catalog.search(
            TravelRequest(locale="en", visit_intents=[{"place_type": "beach"}])
        )
    )
    assert [row["spot_id"] for row in rows] == [sid]
    page = TestClient(create_app(identity_db)).get(
        "/api/data/places", params={"kind": "beach"}
    )
    assert [row["id"] for row in page.json()["rows"]] == [sid]


def test_foreign_empty_catalog_falls_back_to_labeled_korean_original(identity_db):
    sid = collect(
        identity_db, provider="TOURAPI_KOREAN", content_type="39", code="FD050100"
    )
    catalog = Catalog(identity_db, datetime.now(UTC))
    rows, scope = asyncio.run(
        catalog.search(
            TravelRequest(
                locale="en", place_role="meal", visit_intents=[{"place_type": "cafe"}]
            )
        )
    )
    assert [row["spot_id"] for row in rows] == [sid]
    assert rows[0]["source_locale"] == rows[0]["catalog_locale"] == "ko"
    assert rows[0]["translation_status"] == "source_fallback"
    assert scope["locale"] == "en"
    assert scope["language_fallback"] == "korean_original"
    assert scope["providers"] == ["TOURAPI_KOREAN", "KAKAO_LOCAL"]


def test_recent_badge_requires_complete_success_and_actual_item_fetch(identity_db):
    now = datetime.now(UTC)
    fetched = now - timedelta(minutes=2)
    sid = collect(identity_db, fetched=fetched)
    with connect(identity_db) as c:
        c.execute(
            "INSERT INTO pongdang_data.collection_job(task_name,state,interval_seconds,"
            "started_at,finished_at,last_success_at) "
            "VALUES(%s,'succeeded',86400,%s,%s,%s)",
            [
                "tourism_gangwon_english_150",
                now - timedelta(minutes=3),
                now - timedelta(minutes=1),
                now - timedelta(minutes=1),
            ],
        )

    def row():
        with connect(identity_db) as c, c.cursor(row_factory=dict_row) as cursor:
            return cursor.execute(PLACE_SELECT + " WHERE s.id=%s", [sid]).fetchone()

    assert row()["catalog_recently_verified"] is True
    assert row()["catalog_verified_at"] == fetched
    travel = asyncio.run(Catalog(identity_db, now).places([sid]))[sid]
    assert travel["catalog_recently_verified"] is True
    assert travel["catalog_verified_at"] == fetched
    with TestClient(create_app(identity_db)) as client:
        for path in (
            "/api/data/places",
            f"/api/data/livecams/preview/places?spot_id={sid}",
        ):
            response = client.get(path)
            assert response.status_code == 200, response.text
            values = response.json()
            values = values if isinstance(values, list) else values["rows"]
            assert values[0]["catalog_recently_verified"] is True
            assert values[0]["catalog_verified_at"]
    for state in ("failed", "partial", "running", "pending", "no_data", "disabled"):
        with connect(identity_db) as c:
            c.execute("UPDATE pongdang_data.collection_job SET state=%s", [state])
        assert row()["catalog_recently_verified"] is False
        assert row()["catalog_verified_at"] is None
    with connect(identity_db) as c:
        c.execute("UPDATE pongdang_data.collection_job SET state='succeeded'")
    for item_time in (now - timedelta(hours=49), now + timedelta(minutes=1)):
        with connect(identity_db) as c:
            c.execute(
                "UPDATE pongdang_data.collection_place SET fetched_at=%s "
                "WHERE spot_id=%s",
                [item_time, sid],
            )
        assert row()["catalog_recently_verified"] is False
    with connect(identity_db) as c:
        c.execute(
            "UPDATE pongdang_data.collection_place SET fetched_at=%s WHERE spot_id=%s",
            [fetched, sid],
        )
        c.execute(
            "UPDATE pongdang_data.collection_job SET finished_at=%s",
            [now + timedelta(minutes=1)],
        )
    assert row()["catalog_recently_verified"] is False


def test_recommendation_badge_uses_same_verified_read_contract(identity_db):
    sid = collect(identity_db)
    rows = asyncio.run(Catalog(identity_db, datetime.now(UTC)).places([sid]))
    assert rows[sid]["catalog_recently_verified"] is False
    assert rows[sid]["catalog_verified_at"] is None


def test_only_current_exact_source_cache_translates_recommendations_and_details(
    identity_db,
):
    now = datetime.now(UTC) - timedelta(minutes=2)
    sid = collect(
        identity_db,
        provider="TOURAPI_KOREAN",
        content_type="12",
        source_id="100",
        fetched=now,
    )
    detail = PlaceDetail(
        source_id="100",
        content_type="12",
        name="Official source title",
        overview="강릉의 바다 소개",
        opening_hours="09:00~18:00",
    )
    store_batch(
        identity_db,
        SourceBatch(provider="TOURAPI_KOREAN", fetched_at=now, place_details=[detail]),
    )
    original = {
        "name": "Official source title",
        "address": "",
        "description": "강릉의 바다 소개",
    }
    translated = {
        "name": "Translated beach",
        "address": "",
        "description": "About the sea in Gangneung",
    }
    with connect(identity_db) as c:
        migrate_place_translations(c)
        c.execute(
            "INSERT INTO pongdang_data.place_translation "
            "(provider,source_id,source_hash,locale,model_version,model,source_text,"
            "translated_text,state,translated_at) "
            "VALUES ('TOURAPI_KOREAN','100',%s,'en',%s,'offline-test',"
            "%s,%s,'ready',%s)",
            [
                content_hash(original),
                PROMPT_VERSION + ":offline-test",
                Jsonb(original),
                Jsonb(translated),
                now,
            ],
        )
    request = TravelRequest(locale="en", visit_intents=[{"place_type": "beach"}])
    rows, scope = asyncio.run(Catalog(identity_db, datetime.now(UTC)).search(request))
    assert len(rows) == 1 and rows[0]["spot_id"] == sid
    assert rows[0]["name"] == translated["name"]
    assert rows[0]["translation_status"] == "machine_translated"
    assert rows[0]["catalog_locale"] == rows[0]["source_locale"] == "ko"
    assert rows[0]["display_locale"] == "en"
    assert scope["translated_count"] == 1
    with TestClient(create_app(identity_db)) as client:
        item = client.get(
            "/api/data/place-details", params={"spot_ids": sid, "locale": "en"}
        ).json()["items"][0]
        assert item["name"] == translated["name"]
        assert item["overview"] == translated["description"]
        assert item["original_overview"] == original["description"]
        assert item["opening_hours"] == "09:00~18:00"
        assert item["translation_status"] == "machine_translated"
        untranslated = client.get(
            "/api/data/place-details", params={"spot_ids": sid, "locale": "ja"}
        ).json()["items"][0]
        assert untranslated["translation_status"] == "source_fallback"
        assert untranslated["overview"] == original["description"]
    # A source edit invalidates the old cached text without any model call/write.
    with connect(identity_db) as c:
        c.execute(
            "UPDATE pongdang_data.place_detail SET overview='수정된 소개' "
            "WHERE source_id='100'"
        )
    rows, scope = asyncio.run(Catalog(identity_db, datetime.now(UTC)).search(request))
    assert rows[0]["name"] == original["name"]
    assert rows[0]["translation_status"] == "source_fallback"
    assert scope["translated_count"] == 0
    with TestClient(create_app(identity_db)) as client:
        item = client.get(
            "/api/data/place-details", params={"spot_ids": sid, "locale": "en"}
        ).json()["items"][0]
        assert item["translation_status"] == "source_fallback"
        assert item["overview"] == "수정된 소개"
