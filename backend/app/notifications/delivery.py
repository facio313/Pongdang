"""Durable delivery intents and bounded retries under subscription session locks."""

from datetime import UTC, datetime, timedelta

from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

from app.notifications.provider import (
    DeliveryError,
    ResendProvider,
    configuration_state,
)
from app.notifications.service import evaluate_condition, evaluate_subscriptions
from app.schema import connect


def _message(settings, row):
    observation = row["payload"]["observation"]
    relation = row["payload"]["station_relationship"]["relation"]
    return {
        "from": settings.notifications_from_email,
        "to": [row["destination"]],
        "subject": "Pongdang: 설정한 수온 조건이 충족되었습니다",
        "text": (
            f"구독 장소 ID {row['spot_id']}의 {relation} 수온 관측이 "
            f"설정한 선호 조건 {row['minimum_temperature_c']} °C 이상입니다.\n"
            f"관측: {observation['numeric_value']} °C, "
            f"측정 시각: {observation['observed_at']}.\n"
            "수온 조건은 입수 가능·안전 판정이 아닙니다. "
            "연간 완전한 관측 이력이 확인되지 않아 올해 최초라고 단정하지 않습니다."
        ),
    }


def _update(
    settings, event_id, state, now, *, error=None, next_at=None, message_id=None
):
    with connect(settings) as c:
        c.execute(
            "UPDATE pongdang_data.notification_outbox SET state=%s,last_error=%s,"
            "next_attempt_at=COALESCE(%s,next_attempt_at),updated_at=%s,"
            "provider_message_id=COALESCE(%s,provider_message_id) WHERE event_id=%s",
            [state, error, next_at, now, message_id, event_id],
        )


def deliver_due(settings, *, now=None, provider=None, limit=100):
    now = now or datetime.now(UTC)
    provider = provider or ResendProvider(settings)
    counts = {
        "attempted": 0,
        "accepted": 0,
        "not_configured": 0,
        "cancelled": 0,
        "failed": 0,
        "retry": 0,
        "delivery_unknown": 0,
    }
    with connect(settings) as c:
        due = c.execute(
            "SELECT o.event_id,e.subscription_id FROM "
            "pongdang_data.notification_outbox o JOIN "
            "pongdang_data.notification_event e ON e.id=o.event_id "
            "WHERE o.state IN ('pending','retry','sending','not_configured') "
            "AND o.next_attempt_at<=%s ORDER BY o.next_attempt_at,o.event_id LIMIT %s",
            [now, min(max(limit, 1), 100)],
        ).fetchall()
    for event_id, subscription_id in due:
        with connect(settings) as guard:
            guard.autocommit = True
            key = "pongdang-notification/" + subscription_id
            if not guard.execute(
                "SELECT pg_try_advisory_lock(hashtext(%s))", [key]
            ).fetchone()[0]:
                continue
            try:
                with connect(settings) as c:
                    c.row_factory = dict_row
                    row = c.execute(
                        "SELECT o.*,e.state AS event_state,e.payload,"
                        "e.subscription_revision,s.active,s.revision,s.spot_id,"
                        "s.season_year,s.timezone,s.minimum_temperature_c,"
                        "s.destination,s.channel FROM "
                        "pongdang_data.notification_outbox o JOIN "
                        "pongdang_data.notification_event e ON e.id=o.event_id JOIN "
                        "pongdang_data.notification_subscription s "
                        "ON s.id=e.subscription_id WHERE o.event_id=%s",
                        [event_id],
                    ).fetchone()
                    if (
                        row["state"]
                        not in {"pending", "retry", "sending", "not_configured"}
                        or row["next_attempt_at"] > now
                    ):
                        continue
                    observed = row["payload"].get("observation", {})
                    expiry = observed.get("valid_until")
                    current_state = c.execute(
                        "SELECT state FROM "
                        "pongdang_data.conditions_observationsnapshot "
                        "WHERE id=%s",
                        [observed.get("snapshot_id")],
                    ).fetchone()
                    usable = (
                        row["active"]
                        and row["revision"] == row["subscription_revision"]
                        and row["event_state"] == "active"
                        and expiry
                        and datetime.fromisoformat(expiry) > now
                        and current_state
                        and current_state["state"] != "superseded"
                    )
                    if usable:
                        usable = (
                            evaluate_condition(c, row, now)["condition_state"] == "met"
                        )
                if not usable:
                    state = (
                        "delivery_unknown" if row["first_attempt_at"] else "cancelled"
                    )
                    _update(
                        settings,
                        event_id,
                        state,
                        now,
                        error="CONDITION_CHANGED_OR_EXPIRED",
                    )
                    counts[state] += 1
                    continue
                # Never reuse a possibly accepted request beyond provider key retention.
                if row["first_attempt_at"] and now >= row[
                    "first_attempt_at"
                ] + timedelta(hours=23):
                    _update(
                        settings,
                        event_id,
                        "delivery_unknown",
                        now,
                        error="IDEMPOTENCY_WINDOW_EXPIRED",
                    )
                    counts["delivery_unknown"] += 1
                    continue
                if configuration_state(settings) != "configured":
                    _update(
                        settings,
                        event_id,
                        "not_configured",
                        now,
                        error="PROVIDER_NOT_CONFIGURED",
                        next_at=now + timedelta(minutes=5),
                    )
                    counts["not_configured"] += 1
                    continue
                message = row["message_payload"] or _message(settings, row)
                attempt = row["attempts"] + 1
                with connect(settings) as c:
                    # Commit intent before I/O. A crash retries the same key/body.
                    c.execute(
                        "UPDATE pongdang_data.notification_outbox SET state='sending',"
                        "attempts=%s,first_attempt_at=COALESCE(first_attempt_at,%s),"
                        "next_attempt_at=%s,message_payload=%s,updated_at=%s "
                        "WHERE event_id=%s",
                        [
                            attempt,
                            now,
                            now + timedelta(minutes=2),
                            Jsonb(message),
                            now,
                            event_id,
                        ],
                    )
                    c.execute(
                        "INSERT INTO pongdang_data.notification_delivery_attempt "
                        "(event_id,attempt,attempted_at,state) "
                        "VALUES (%s,%s,%s,'sending')",
                        [event_id, attempt, now],
                    )
                counts["attempted"] += 1
                try:
                    message_id = provider.send(event_id, message)
                    state, error, next_at = "accepted", None, None
                    counts["accepted"] += 1
                except DeliveryError as exc:
                    state = "retry" if exc.retryable and attempt < 8 else "failed"
                    error, message_id = exc.code, None
                    next_at = now + timedelta(seconds=min(3600, 60 * 2**attempt))
                except Exception:
                    state, error, message_id = (
                        "retry",
                        "PROVIDER_UNEXPECTED_ERROR",
                        None,
                    )
                    next_at = now + timedelta(minutes=5)
                    if attempt >= 8:
                        state = "failed"
                _update(
                    settings,
                    event_id,
                    state,
                    now,
                    error=error,
                    next_at=next_at,
                    message_id=message_id,
                )
                if state in {"retry", "failed"}:
                    counts[state] += 1
                with connect(settings) as c:
                    c.execute(
                        "UPDATE pongdang_data.notification_delivery_attempt "
                        "SET state=%s,error_code=%s WHERE event_id=%s AND attempt=%s",
                        [state, error, event_id, attempt],
                    )
            finally:
                guard.execute("SELECT pg_advisory_unlock(hashtext(%s))", [key])
    return counts


def run_notifications(settings, now=None):
    result = evaluate_subscriptions(settings, now=now)
    delivery = deliver_due(settings, now=now)
    state, error = "succeeded" if result["received"] else "no_data", ""
    if delivery["failed"] or delivery["retry"] or delivery["delivery_unknown"]:
        state, error = "failed", "NOTIFICATION_DELIVERY_UNCONFIRMED"
    elif delivery["not_configured"]:
        state, error = "partial", "NOTIFICATION_DELIVERY_NOT_CONFIGURED"
    return {
        **result,
        "state": state,
        "error": error,
        "delivery": delivery,
    }
