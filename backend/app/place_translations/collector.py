"""Opt-out bounded background translation under shared and separate AI ceilings."""

import asyncio
import hashlib
from datetime import UTC, datetime, timedelta
from math import ceil
from time import monotonic

from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

from app.ai import budget
from app.ai.provider import ProviderError, ResponsesProvider, encode_body
from app.ingestion.jobs import Job
from app.place_translations.service import (
    LOCALES,
    SOURCE_FROM,
    SOURCE_TEXT,
    SOURCE_WHERE,
    content_hash,
    model_version,
    request_body,
    translated_text,
)
from app.schema import connect

MAX_BATCH_SECONDS = 30


def due_sources(settings, now):
    with connect(settings) as c, c.cursor(row_factory=dict_row) as cursor:
        return cursor.execute(
            f"SELECT p.id,p.provider,p.source_id,{SOURCE_TEXT} AS source_text,"
            "target.locale FROM "
            f"{SOURCE_FROM} CROSS JOIN unnest(%s::text[]) AS target(locale) "
            "LEFT JOIN pongdang_data.place_translation t ON t.provider=p.provider "
            "AND t.source_id=p.source_id AND t.locale=target.locale "
            f"AND t.source_text={SOURCE_TEXT} AND t.model_version=%s "
            f"WHERE {SOURCE_WHERE} AND (t.state IS NULL OR t.state='superseded' OR "
            "(t.state IN ('pending','failed') AND t.next_attempt_at<=%s)) "
            "ORDER BY t.next_attempt_at NULLS FIRST,p.id,target.locale LIMIT %s",
            [
                list(LOCALES),
                model_version(settings),
                now,
                settings.place_translation_batch_size,
            ],
        ).fetchall()


def prepare_source(settings, source):
    """Invalidate prior text/model revisions only in the background worker."""
    with connect(settings) as c:
        c.execute(
            "UPDATE pongdang_data.place_translation SET state='superseded',"
            "translated_text=NULL WHERE provider=%s AND source_id=%s AND locale=%s "
            "AND (source_hash<>%s OR model_version<>%s) AND state<>'superseded'",
            [
                source["provider"],
                source["source_id"],
                source["locale"],
                content_hash(source["source_text"]),
                model_version(settings),
            ],
        )
        c.execute(
            "INSERT INTO pongdang_data.place_translation "
            "(provider,source_id,source_hash,locale,model_version,model,"
            "source_text,state) "
            "VALUES(%s,%s,%s,%s,%s,%s,%s,'pending') ON CONFLICT "
            "(provider,source_id,source_hash,locale,model_version) DO UPDATE "
            "SET state='pending',translated_text=NULL",
            [
                source["provider"],
                source["source_id"],
                content_hash(source["source_text"]),
                source["locale"],
                model_version(settings),
                settings.ai_model,
                Jsonb(source["source_text"]),
            ],
        )


def reserve_translation(settings, size, now):
    """Conservative local ceiling is additional to, never instead of, AI budget."""
    input_price = settings.ai_input_microusd_per_million_tokens
    output_price = settings.ai_output_microusd_per_million_tokens
    if not input_price or not output_price:
        return None
    cost = max(
        settings.ai_reserved_call_microusd,
        budget.priced_cost(
            size + 1024, settings.ai_max_output_tokens, input_price, output_price
        ),
    )
    with connect(settings) as c:
        c.execute(
            "INSERT INTO pongdang_data.place_translation_budget(day) VALUES(%s) "
            "ON CONFLICT DO NOTHING",
            [now.date()],
        )
        reserved = c.execute(
            "UPDATE pongdang_data.place_translation_budget SET calls=calls+1,"
            "reserved_cost_microusd=reserved_cost_microusd+%s WHERE day=%s "
            "AND calls<%s AND reserved_cost_microusd+%s<=%s RETURNING day",
            [
                cost,
                now.date(),
                settings.place_translation_daily_calls,
                cost,
                settings.place_translation_daily_budget_microusd,
            ],
        ).fetchone()
    return cost if reserved else None


def finish_source(settings, source, now, result=None, error=""):
    with connect(settings) as c:
        current = c.execute(
            f"SELECT {SOURCE_TEXT} FROM {SOURCE_FROM} WHERE p.id=%s FOR SHARE OF p",
            [source["id"]],
        ).fetchone()
        changed = not current or current[0] != source["source_text"]
        state = "superseded" if changed else "failed" if error else "ready"
        c.execute(
            "UPDATE pongdang_data.place_translation SET state=%s,"
            "translated_text=%s,translated_at=%s,error_code=%s,"
            "next_attempt_at=%s+least(86400,3600*power(2,"
            "least(consecutive_failures,4))) "
            "* interval '1 second',"
            "consecutive_failures=CASE WHEN %s='failed' THEN consecutive_failures+1 "
            "ELSE 0 END WHERE provider=%s AND source_id=%s AND source_hash=%s "
            "AND locale=%s AND model_version=%s",
            [
                state,
                Jsonb(result) if state == "ready" else None,
                now if state == "ready" else None,
                error,
                now,
                state,
                source["provider"],
                source["source_id"],
                content_hash(source["source_text"]),
                source["locale"],
                model_version(settings),
            ],
        )
    return state == "ready"


async def translate_batch(settings, *, provider=None, now=None):
    now = (now or datetime.now(UTC)).astimezone(UTC)
    if (
        not settings.place_translation_enabled
        or settings.ai_effective_provider != "openai"
    ):
        return dict(
            received=0, inserted=0, state="no_data", error="TRANSLATION_DISABLED"
        )
    sources = await asyncio.to_thread(due_sources, settings, now)
    received = inserted = 0
    failures, wait_reason = [], ""
    owned_provider = provider is None
    provider = provider or ResponsesProvider(settings)
    batch_deadline = monotonic() + MAX_BATCH_SECONDS
    try:
        for source in sources:
            if monotonic() >= batch_deadline:
                wait_reason = "TRANSLATION_BATCH_TIME_LIMIT"
                break
            body = request_body(settings, source["source_text"], source["locale"])
            size = len(encode_body(body))
            if size > settings.ai_max_input_bytes:
                wait_reason = "TRANSLATION_INPUT_LIMIT"
                break
            # Same cross-process global admission lease as foreground AI, with
            # a stable non-personal background identity and no SSO credentials.
            admission = await asyncio.to_thread(
                budget._acquire_digest,
                settings,
                hashlib.sha256(b"pongdang-public-place-translation.v1").hexdigest(),
            )
            if admission.lease_id is None:
                wait_reason = admission.reason_code
                break
            # Admission expires at request_timeout + 5 seconds. Start the
            # deadline before reservations so DB time cannot extend model work
            # past the lease, even when the HTTP timeout is configured longer.
            call_deadline = min(
                batch_deadline,
                monotonic()
                + min(settings.ai_timeout_seconds, settings.ai_request_timeout_seconds),
            )
            try:
                reserved = await asyncio.to_thread(
                    reserve_translation, settings, size, now
                )
                if reserved is None:
                    wait_reason = "TRANSLATION_DAILY_BUDGET"
                    break
                reservation = await asyncio.to_thread(
                    budget.reserve_attempt, settings, size
                )
                if reservation is None:
                    wait_reason = "AI_GLOBAL_BUDGET"
                    break
                await asyncio.to_thread(prepare_source, settings, source)
                received += 1
                try:
                    try:
                        remaining = call_deadline - monotonic()
                        if remaining <= 0:
                            raise TimeoutError
                        async with asyncio.timeout(remaining):
                            raw = await provider.respond(body)
                    except TimeoutError:
                        raise ProviderError("ai_timeout") from None
                    usage = raw.get("usage", {})
                    input_tokens, output_tokens = (
                        usage.get("input_tokens"),
                        usage.get("output_tokens"),
                    )
                    if all(
                        type(value) is int and 0 <= value <= 10000000
                        for value in (input_tokens, output_tokens)
                    ):
                        await asyncio.to_thread(
                            budget.record_usage,
                            settings,
                            reservation,
                            input_tokens,
                            output_tokens,
                        )
                        actual = budget.priced_cost(
                            input_tokens,
                            output_tokens,
                            reservation.input_price,
                            reservation.output_price,
                        )
                        if actual > reserved:
                            await asyncio.to_thread(
                                record_overage, settings, now.date(), actual - reserved
                            )
                    result = translated_text(raw, source["source_text"])
                    inserted += await asyncio.to_thread(
                        finish_source, settings, source, now, result
                    )
                except ProviderError as exc:
                    failures.append(exc.code)
                    await asyncio.to_thread(
                        finish_source, settings, source, now, error=exc.code
                    )
            finally:
                await asyncio.to_thread(
                    budget.release_request, settings, admission.lease_id
                )
    finally:
        if owned_provider:
            await provider.aclose()
    result = dict(
        received=received,
        inserted=inserted,
        state="failed"
        if failures and not inserted
        else "partial"
        if failures or wait_reason
        else "succeeded",
        error=failures[0] if failures else wait_reason,
    )
    if wait_reason in {"TRANSLATION_DAILY_BUDGET", "AI_GLOBAL_BUDGET"}:
        tomorrow = now.replace(hour=0, minute=0, second=0, microsecond=0) + timedelta(
            days=1
        )
        result["next_run_seconds"] = max(600, ceil((tomorrow - now).total_seconds()))
    return result


def record_overage(settings, day, amount):
    with connect(settings) as c:
        c.execute(
            "UPDATE pongdang_data.place_translation_budget "
            "SET reserved_cost_microusd=reserved_cost_microusd+%s WHERE day=%s",
            [amount, day],
        )


def translation_jobs(settings):
    return [
        Job(
            "place_translations",
            3600,
            process=lambda: asyncio.run(translate_batch(settings)),
            enabled=settings.place_translation_enabled
            and settings.ai_effective_provider == "openai"
            and settings.place_translation_daily_calls > 0
            and settings.place_translation_daily_budget_microusd > 0,
            disabled_reason="TRANSLATION_DISABLED_OR_AI_UNCONFIGURED",
            external_collection=True,
        )
    ]
