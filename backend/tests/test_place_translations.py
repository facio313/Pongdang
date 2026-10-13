"""Disposable PostgreSQL storage and mocked Responses HTTP only; no paid calls."""

import asyncio
import json
from datetime import UTC, datetime

import httpx
import pytest
from pydantic import SecretStr

from app.ai.provider import ProviderError, ResponsesProvider
from app.config import Settings
from app.data_reader import DataReader
from app.ingestion.models import Place, SourceBatch
from app.ingestion.storage import store_batch
from app.place_translations.collector import (
    due_sources,
    translate_batch,
    translation_jobs,
)
from app.place_translations.service import (
    content_hash,
    read_place_translations,
    request_body,
    translated_text,
)
from app.schema import VERSION, connect, initialize


def response_text(**changes):
    return {
        "name": "Isolated Beach",
        "address": "Gangneung 123",
        "description": None,
    } | changes


def response_payload(text):
    return {
        "status": "completed",
        "output": [
            {
                "type": "message",
                "content": [{"type": "output_text", "text": json.dumps(text)}],
            }
        ],
        "usage": {"input_tokens": 120, "output_tokens": 45},
    }


@pytest.fixture
def translation_db():
    settings = Settings(_env_file=None, ai_api_key=SecretStr("mock-translation-key"))
    if settings.postgres_db != "pongdang_test" or settings.postgres_host != "127.0.0.1":
        pytest.fail("Requires own disposable loopback pongdang_test")
    initialize(settings)
    store_batch(
        settings,
        SourceBatch(
            provider="TOURAPI_KOREAN",
            fetched_at=datetime.now(UTC),
            places=[
                Place(
                    source_id="translation-beach",
                    name="격리 해변",
                    address="강릉 123",
                    kind="beach",
                    region="강릉",
                    category="12",
                    latitude=37.8,
                    longitude=128.9,
                )
            ],
        ),
    )
    with connect(settings) as c:
        sid = c.execute(
            "SELECT spot_id FROM pongdang_data.collection_place"
        ).fetchone()[0]
    yield settings, sid
    with connect(settings) as c:
        c.execute("DROP SCHEMA pongdang_data CASCADE")


async def run_batch(settings, calls, *, text=None, status=200, change=None):
    def handle(request):
        body = json.loads(request.content)
        calls.append(body)
        if change:
            change()
        payload = (
            response_payload(text or response_text())
            if status == 200
            else {"error": {}}
        )
        return httpx.Response(status, json=payload)

    provider = ResponsesProvider(settings, transport=httpx.MockTransport(handle))
    try:
        return await translate_batch(settings, provider=provider)
    finally:
        await provider.aclose()


async def read(settings, sid, locale="en"):
    async with DataReader(settings).connection() as c:
        await c.execute("SET TRANSACTION READ ONLY")
        return await read_place_translations(c, [sid], locale)


def test_stored_translation_uses_public_fields_and_shared_budget(translation_db):
    settings, sid = translation_db
    calls = []
    result = asyncio.run(run_batch(settings, calls))
    assert result["received"] == result["inserted"] == 1
    assert calls[0]["model"] == settings.ai_model
    assert calls[0]["store"] is False and calls[0]["tools"] == []
    assert calls[0]["text"]["format"]["strict"] is True
    assert set(json.loads(calls[0]["input"])) == {"name", "address", "description"}
    translated = asyncio.run(read(settings, sid))[sid]
    assert translated["name"] == "Isolated Beach"
    assert translated["original_name"] == "격리 해변"
    assert translated["translation_status"] == "machine_translated"
    assert translated["source_provider"] == "TOURAPI_KOREAN"
    assert translated["source_id"] == "translation-beach"
    assert translated["translation_model"] == settings.ai_model
    assert asyncio.run(read(settings, sid, "ko")) == {}
    assert asyncio.run(read(settings, sid, "zh-TW")) == {}
    with connect(settings) as c:
        assert c.execute(
            "SELECT calls,observed_calls FROM pongdang_data.ai_daily_budget"
        ).fetchone() == (1, 1)
        assert c.execute(
            "SELECT calls FROM pongdang_data.place_translation_budget"
        ).fetchone() == (1,)
        assert c.execute(
            "SELECT count(*) FROM pongdang_data.ai_request_leases"
        ).fetchone() == (0,)


def test_source_change_hides_old_result_and_requeues_current_hash(translation_db):
    settings, sid = translation_db
    calls = []
    asyncio.run(run_batch(settings, calls))
    with connect(settings) as c:
        c.execute("UPDATE pongdang_data.collection_place SET name='수정 해변'")
    assert asyncio.run(read(settings, sid)) == {}
    assert (
        asyncio.run(
            run_batch(settings, calls, text=response_text(name="Updated Beach"))
        )["inserted"]
        == 1
    )
    assert asyncio.run(read(settings, sid))[sid]["name"] == "Updated Beach"
    with connect(settings) as c:
        assert c.execute(
            "SELECT state FROM pongdang_data.place_translation "
            "ORDER BY translated_at NULLS FIRST"
        ).fetchall() == [("superseded",), ("ready",)]


def test_changed_source_during_model_call_cannot_publish_stale_translation(
    translation_db,
):
    settings, sid = translation_db

    def change():
        with connect(settings) as c:
            c.execute("UPDATE pongdang_data.collection_place SET address='강릉 456'")

    result = asyncio.run(run_batch(settings, [], change=change))
    assert result["inserted"] == 0
    assert asyncio.run(read(settings, sid)) == {}
    with connect(settings) as c:
        assert c.execute(
            "SELECT state,translated_text FROM pongdang_data.place_translation"
        ).fetchone() == ("superseded", None)


def test_provider_failure_keeps_fallback_and_backoff(translation_db):
    settings, sid = translation_db
    result = asyncio.run(run_batch(settings, [], status=429))
    assert result["state"] == "failed"
    assert result["error"] == "ai_rate_limited"
    assert asyncio.run(read(settings, sid)) == {}
    assert all(
        source["locale"] != "en" for source in due_sources(settings, datetime.now(UTC))
    )
    with connect(settings) as c:
        row = c.execute(
            "SELECT state,consecutive_failures,next_attempt_at>now() "
            "FROM pongdang_data.place_translation"
        ).fetchone()
        assert row == ("failed", 1, True)
        assert c.execute(
            "SELECT calls,observed_calls FROM pongdang_data.ai_daily_budget"
        ).fetchone() == (1, 0)


@pytest.mark.parametrize(
    "timeout_key", ["ai_timeout_seconds", "ai_request_timeout_seconds"]
)
def test_total_timeout_marks_failure_and_releases_global_lease(
    translation_db, timeout_key
):
    settings, sid = translation_db
    settings = settings.model_copy(update={timeout_key: 0.05})

    class SlowProvider:
        cancelled = False

        async def respond(self, body):
            try:
                await asyncio.sleep(60)
            except asyncio.CancelledError:
                self.cancelled = True
                raise

    provider = SlowProvider()
    result = asyncio.run(translate_batch(settings, provider=provider))
    assert provider.cancelled
    assert result["state"] == "failed"
    assert result["error"] == "ai_timeout"
    assert asyncio.run(read(settings, sid)) == {}
    with connect(settings) as c:
        assert c.execute(
            "SELECT count(*) FROM pongdang_data.ai_request_leases"
        ).fetchone() == (0,)
        assert c.execute(
            "SELECT state,error_code,next_attempt_at>now() "
            "FROM pongdang_data.place_translation"
        ).fetchone() == ("failed", "ai_timeout", True)
        assert c.execute(
            "SELECT calls,observed_calls FROM pongdang_data.ai_daily_budget"
        ).fetchone() == (1, 0)


def test_all_target_languages_share_the_same_small_daily_ceiling(translation_db):
    settings, sid = translation_db
    calls = []
    for locale in ("en", "ja", "zh-CN"):
        assert asyncio.run(run_batch(settings, calls))["inserted"] == 1
        assert asyncio.run(read(settings, sid, locale))[sid]["translation_status"] == (
            "machine_translated"
        )
    assert len(calls) == 3
    assert due_sources(settings, datetime.now(UTC)) == []
    with connect(settings) as c:
        assert c.execute(
            "SELECT calls FROM pongdang_data.place_translation_budget"
        ).fetchone() == (3,)


@pytest.mark.parametrize(
    ("changes", "reason", "expected_calls"),
    [
        ({"place_translation_daily_calls": 1}, "TRANSLATION_DAILY_BUDGET", 1),
        ({"ai_max_daily_calls": 1}, "AI_GLOBAL_BUDGET", 1),
        ({"place_translation_daily_budget_microusd": 1}, "TRANSLATION_DAILY_BUDGET", 0),
        ({"ai_daily_budget_microusd": 1}, "AI_GLOBAL_BUDGET", 0),
    ],
)
def test_separate_and_global_ceilings_both_stop_model_calls(
    translation_db, changes, reason, expected_calls
):
    settings, _ = translation_db
    settings = settings.model_copy(update=changes)
    calls = []
    first = asyncio.run(run_batch(settings, calls))
    result = asyncio.run(run_batch(settings, calls)) if expected_calls else first
    assert len(calls) == expected_calls
    assert result["error"] == reason
    assert result["next_run_seconds"] >= 600


def test_disabled_or_unconfigured_worker_does_not_read_or_call():
    for changes in (
        {"place_translation_enabled": False},
        {"ai_api_key": SecretStr("")},
    ):
        settings = Settings(_env_file=None).model_copy(update=changes)
        calls = []
        assert asyncio.run(run_batch(settings, calls))["received"] == 0
        assert calls == []
        assert not translation_jobs(settings)[0].enabled


@pytest.mark.parametrize(
    "text",
    [
        response_text(address="Gangneung 456"),
        response_text(description="Safe swimming"),
        response_text(extra="new fact"),
    ],
)
def test_invalid_facts_are_rejected(text):
    original = {"name": "격리 해변", "address": "강릉 123", "description": None}
    with pytest.raises(ProviderError):
        translated_text(response_payload(text), original)


def test_structured_refusal_and_tool_call_are_not_translations():
    original = {"name": "격리 해변", "address": "강릉 123", "description": None}
    for content in (
        [{"type": "refusal", "refusal": "No"}],
        [{"type": "output_text", "text": "not JSON"}],
    ):
        with pytest.raises(ProviderError):
            translated_text(
                {
                    "status": "completed",
                    "output": [{"type": "message", "content": content}],
                },
                original,
            )


def test_prompt_version_and_literal_hash_include_source_fields():
    source = {"name": "격리 해변", "address": "강릉 123", "description": None}
    assert content_hash(source) != content_hash(source | {"address": "강릉 124"})
    body = request_body(Settings(_env_file=None), source, "ja")
    assert "untrusted DATA" in body["instructions"]
    assert "official foreign name" in body["instructions"]


def test_v21_upgrade_preserves_catalogue_and_ai_budget(translation_db):
    settings, sid = translation_db
    asyncio.run(run_batch(settings, []))
    with connect(settings) as c:
        c.execute("DROP TABLE pongdang_data.place_translation")
        c.execute("DROP TABLE pongdang_data.place_translation_budget")
        c.execute("UPDATE pongdang_data.schema_version SET version=21")
    assert asyncio.run(read(settings, sid)) == {}
    assert initialize(settings) is True
    assert initialize(settings) is False
    with connect(settings) as c:
        assert c.execute(
            "SELECT version FROM pongdang_data.schema_version"
        ).fetchone() == (VERSION,)
        assert c.execute(
            "SELECT calls FROM pongdang_data.ai_daily_budget"
        ).fetchone() == (1,)
        assert c.execute(
            "SELECT spot_id FROM pongdang_data.collection_place"
        ).fetchone() == (sid,)
