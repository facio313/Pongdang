"""PostgreSQL accounting and short-lived admission leases, with no prompt storage.

Reservations are conservative and never refunded. Provider-reported usage is a
separate, idempotent observation, not evidence that an unknown attempt was free.
Every function closes its transaction before returning to a model caller.
"""

import hashlib
import hmac
from dataclasses import dataclass
from datetime import date
from ipaddress import ip_address
from uuid import uuid4


@dataclass(frozen=True)
class Reservation:
    attempt_id: str
    day: date
    tokens: int
    cost_microusd: int
    input_price: int
    output_price: int


@dataclass(frozen=True)
class Admission:
    lease_id: str | None
    reason_code: str | None = None


def migrate_ai(c):
    """Called only by app.schema's explicit, additive initialization path."""
    c.execute("""CREATE TABLE IF NOT EXISTS pongdang_data.ai_daily_budget (
        day date PRIMARY KEY, calls integer NOT NULL DEFAULT 0,
        reserved_tokens bigint NOT NULL DEFAULT 0,
        reserved_cost_microusd bigint NOT NULL DEFAULT 0)""")
    for column in (
        "observed_calls integer NOT NULL DEFAULT 0",
        "actual_input_tokens bigint NOT NULL DEFAULT 0",
        "actual_output_tokens bigint NOT NULL DEFAULT 0",
        "actual_cost_microusd bigint NOT NULL DEFAULT 0",
    ):
        c.execute(
            "ALTER TABLE pongdang_data.ai_daily_budget ADD COLUMN IF NOT EXISTS "
            + column
        )
    c.execute("""CREATE TABLE IF NOT EXISTS pongdang_data.ai_budget_attempts (
        attempt_id uuid PRIMARY KEY,
        day date NOT NULL REFERENCES pongdang_data.ai_daily_budget(day),
        usage_observed boolean NOT NULL DEFAULT false)""")
    c.execute("""CREATE TABLE IF NOT EXISTS pongdang_data.ai_request_leases (
        lease_id uuid PRIMARY KEY, expires_at timestamptz NOT NULL)""")
    c.execute("""CREATE TABLE IF NOT EXISTS pongdang_data.ai_principal_rate (
        principal_digest text NOT NULL, minute timestamptz NOT NULL,
        requests integer NOT NULL DEFAULT 0,
        PRIMARY KEY(principal_digest,minute))""")


def priced_cost(input_tokens, output_tokens, input_price, output_price):
    return (input_tokens * input_price + 999999) // 1000000 + (
        output_tokens * output_price + 999999
    ) // 1000000


def reserve_attempt(settings, input_size) -> Reservation | None:
    from app.schema import connect

    input_price = settings.ai_input_microusd_per_million_tokens
    output_price = settings.ai_output_microusd_per_million_tokens
    if (
        type(input_size) is not int
        or not 0 <= input_size <= settings.ai_max_input_bytes
        or not settings.ai_model
        or settings.ai_model != settings.ai_pricing_model
        or input_price is None
        or output_price is None
        or input_price <= 0
        or output_price <= 0
    ):
        return None
    # Full serialized body includes system instructions, strict schemas, history
    # and tool results. UTF-8 byte count plus protocol margin overestimates text
    # token usage; cached input discounts are never presumed.
    input_tokens = input_size + 1024
    tokens = input_tokens + settings.ai_max_output_tokens
    cost = max(
        settings.ai_reserved_call_microusd,
        priced_cost(
            input_tokens, settings.ai_max_output_tokens, input_price, output_price
        ),
    )
    attempt_id = str(uuid4())
    with connect(settings) as c:
        c.execute(
            "INSERT INTO pongdang_data.ai_daily_budget(day) "
            "VALUES((now() AT TIME ZONE 'UTC')::date) ON CONFLICT DO NOTHING"
        )
        result = c.execute(
            "UPDATE pongdang_data.ai_daily_budget SET calls=calls+1,"
            "reserved_tokens=reserved_tokens+%s,"
            "reserved_cost_microusd=reserved_cost_microusd+%s "
            "WHERE day=(now() AT TIME ZONE 'UTC')::date "
            "AND calls<%s AND reserved_tokens+%s<=%s "
            "AND reserved_cost_microusd+%s<=%s RETURNING day",
            [
                tokens,
                cost,
                settings.ai_max_daily_calls,
                tokens,
                settings.ai_max_daily_tokens,
                cost,
                settings.ai_daily_budget_microusd,
            ],
        ).fetchone()
        if not result:
            return None
        c.execute(
            "INSERT INTO pongdang_data.ai_budget_attempts(attempt_id,day) "
            "VALUES(%s,%s)",
            [attempt_id, result[0]],
        )
        c.execute(
            "DELETE FROM pongdang_data.ai_budget_attempts "
            "WHERE day < (now() AT TIME ZONE 'UTC')::date - 90"
        )
    return Reservation(attempt_id, result[0], tokens, cost, input_price, output_price)


def reserve(settings, input_size) -> bool:
    """Compatibility entry point for the existing explanation API."""
    return reserve_attempt(settings, input_size) is not None


def record_usage(settings, reservation, input_tokens, output_tokens) -> bool:
    """Record at the reserved UTC day once; never release unknown reservations."""
    from app.schema import connect

    if any(
        type(x) is not int or not 0 <= x <= 10000000
        for x in (input_tokens, output_tokens)
    ):
        return False
    actual_cost = priced_cost(
        input_tokens, output_tokens, reservation.input_price, reservation.output_price
    )
    # Unexpected provider overage tightens the next reservation, never hides it.
    over_tokens = max(0, input_tokens + output_tokens - reservation.tokens)
    over_cost = max(0, actual_cost - reservation.cost_microusd)
    with connect(settings) as c:
        claimed = c.execute(
            "UPDATE pongdang_data.ai_budget_attempts SET usage_observed=true "
            "WHERE attempt_id=%s AND day=%s AND usage_observed=false "
            "RETURNING attempt_id",
            [reservation.attempt_id, reservation.day],
        ).fetchone()
        if not claimed:
            return False
        c.execute(
            "UPDATE pongdang_data.ai_daily_budget SET "
            "observed_calls=observed_calls+1,"
            "actual_input_tokens=actual_input_tokens+%s,"
            "actual_output_tokens=actual_output_tokens+%s,"
            "actual_cost_microusd=actual_cost_microusd+%s,"
            "reserved_tokens=reserved_tokens+%s,"
            "reserved_cost_microusd=reserved_cost_microusd+%s WHERE day=%s",
            [
                input_tokens,
                output_tokens,
                actual_cost,
                over_tokens,
                over_cost,
                reservation.day,
            ],
        )
    return True


def acquire_request(settings, subject: str) -> Admission:
    """Global cross-process cap and per-principal UTC calendar-minute rate cap."""
    secret = settings.sso_proxy_secret.get_secret_value()
    if len(secret) < 32 or not subject or len(subject) > 255:
        return Admission(None, "ai_admission_not_configured")
    digest = hmac.new(secret.encode(), subject.encode(), hashlib.sha256).hexdigest()
    return _acquire_digest(settings, digest)


def operator_local_database(settings) -> bool:
    """The opt-in operator CLI is limited to the local Pongdang databases."""
    if settings.postgres_db not in {"pongdang", "pongdang_test"}:
        return False
    host = settings.postgres_host.lower()
    if host == "localhost":
        return True
    try:
        return ip_address(host).is_loopback
    except ValueError:
        return False


def acquire_operator_request(settings) -> Admission:
    """Admission for explicit local operator tools; never an SSO user principal.

    The CLI and separately authenticated local preview share one non-personal
    rate bucket and the same global
    concurrency leases as authenticated HTTP calls. No SSO secret is created.
    """
    if not operator_local_database(settings):
        return Admission(None, "ai_operator_local_required")
    digest = hashlib.sha256(b"pongdang-local-operator-smoke:v1").hexdigest()
    return _acquire_digest(settings, digest)


def _acquire_digest(settings, digest) -> Admission:
    from app.schema import connect

    lease_id = str(uuid4())
    with connect(settings) as c:
        # This transaction lasts milliseconds and is released before DB tools or
        # HTTP. No open PostgreSQL connection waits for the provider response.
        c.execute("SELECT pg_advisory_xact_lock(hashtext('pongdang-ai-admission'))")
        c.execute("DELETE FROM pongdang_data.ai_request_leases WHERE expires_at<=now()")
        c.execute(
            "DELETE FROM pongdang_data.ai_principal_rate "
            "WHERE minute < date_trunc('minute',now()) - interval '1 minute'"
        )
        active = c.execute(
            "SELECT count(*) FROM pongdang_data.ai_request_leases"
        ).fetchone()[0]
        if active >= settings.ai_max_concurrency:
            return Admission(None, "ai_concurrency_limit")
        minute = c.execute(
            "INSERT INTO pongdang_data.ai_principal_rate "
            "(principal_digest,minute,requests) "
            "VALUES(%s,date_trunc('minute',now()),1) "
            "ON CONFLICT(principal_digest,minute) DO UPDATE "
            "SET requests=ai_principal_rate.requests+1 "
            "WHERE ai_principal_rate.requests<%s RETURNING requests",
            [digest, settings.ai_principal_requests_per_minute],
        ).fetchone()
        if not minute:
            return Admission(None, "ai_rate_limit")
        c.execute(
            "INSERT INTO pongdang_data.ai_request_leases(lease_id,expires_at) "
            "VALUES(%s,now()+make_interval(secs => %s))",
            [lease_id, settings.ai_request_timeout_seconds + 5],
        )
    return Admission(lease_id)


def release_request(settings, lease_id: str) -> None:
    from app.schema import connect

    with connect(settings) as c:
        c.execute(
            "DELETE FROM pongdang_data.ai_request_leases WHERE lease_id=%s",
            [lease_id],
        )
