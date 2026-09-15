"""Real disposable-PostgreSQL tests; no provider traffic or production data."""

from concurrent.futures import ThreadPoolExecutor

import pytest

from app.ai import budget
from app.config import Settings
from app.schema import VERSION, connect, initialize


@pytest.fixture
def budget_db():
    settings = Settings()
    if settings.postgres_db != "pongdang_test":
        pytest.fail("AI budget tests require disposable pongdang_test")
    initialize(settings)
    with connect(settings) as c:
        budget.migrate_ai(c)
        for table in (
            "ai_budget_attempts",
            "ai_daily_budget",
            "ai_request_leases",
            "ai_principal_rate",
        ):
            c.execute("DELETE FROM pongdang_data." + table)
    yield settings.model_copy(
        update={
            "sso_proxy_secret": settings.sso_proxy_secret.__class__(
                "isolated-admission-test-secret-32-characters"
            )
        }
    )
    with connect(settings) as c:
        c.execute("DROP SCHEMA pongdang_data CASCADE")


def test_default_chat_budget_admits_three_full_attempts(budget_db):
    reservations = [
        budget.reserve_attempt(budget_db, budget_db.ai_max_input_bytes)
        for _ in range(3)
    ]
    assert all(reservations)
    with connect(budget_db) as c:
        row = c.execute(
            "SELECT calls,reserved_tokens,reserved_cost_microusd,observed_calls "
            "FROM pongdang_data.ai_daily_budget"
        ).fetchone()
    assert row == (3, 3 * (65536 + 1024 + 2048), 60000, 0)


def test_usage_is_separate_idempotent_and_unknown_cost_is_never_refunded(budget_db):
    first = budget.reserve_attempt(budget_db, 1000)
    second = budget.reserve_attempt(budget_db, 1000)
    assert first and second
    with ThreadPoolExecutor(max_workers=4) as pool:
        results = list(
            pool.map(lambda _: budget.record_usage(budget_db, first, 100, 20), range(8))
        )
    assert sum(results) == 1
    with connect(budget_db) as c:
        assert c.execute(
            "SELECT calls,observed_calls,reserved_cost_microusd,"
            "actual_input_tokens,actual_output_tokens,actual_cost_microusd "
            "FROM pongdang_data.ai_daily_budget"
        ).fetchone() == (2, 1, 40000, 100, 20, 44)


def test_observed_overage_tightens_next_budget_without_a_refund(budget_db):
    reservation = budget.reserve_attempt(budget_db, 100)
    assert reservation
    assert budget.record_usage(budget_db, reservation, 100000, 100000)
    with connect(budget_db) as c:
        assert c.execute(
            "SELECT reserved_tokens,reserved_cost_microusd "
            "FROM pongdang_data.ai_daily_budget"
        ).fetchone() == (200000, 140000)


def test_global_concurrency_is_atomic_across_independent_connections(budget_db):
    with ThreadPoolExecutor(max_workers=8) as pool:
        results = list(
            pool.map(
                lambda i: budget.acquire_request(budget_db, f"private-person-{i}"),
                range(12),
            )
        )
    admitted = [result for result in results if result.lease_id]
    assert len(admitted) == 2
    assert all(
        result.reason_code == "ai_concurrency_limit"
        for result in results
        if not result.lease_id
    )
    budget.release_request(budget_db, admitted[0].lease_id)
    assert budget.acquire_request(budget_db, "another-person").lease_id
    with connect(budget_db) as c:
        digests = c.execute(
            "SELECT principal_digest FROM pongdang_data.ai_principal_rate"
        ).fetchall()
    assert all(
        len(digest[0]) == 64 and "private" not in digest[0] for digest in digests
    )


def test_per_principal_rate_survives_release_and_expired_leases_recover(budget_db):
    settings = budget_db.model_copy(update={"ai_principal_requests_per_minute": 2})
    first = budget.acquire_request(settings, "owner")
    assert first.lease_id
    budget.release_request(settings, first.lease_id)
    second = budget.acquire_request(settings, "owner")
    assert second.lease_id
    budget.release_request(settings, second.lease_id)
    assert budget.acquire_request(settings, "owner").reason_code == "ai_rate_limit"
    assert budget.acquire_request(settings, "different-owner").lease_id
    assert budget.acquire_request(settings, "third-owner").lease_id
    with connect(settings) as c:
        c.execute(
            "UPDATE pongdang_data.ai_request_leases "
            "SET expires_at=now()-interval '1 second'"
        )
    assert budget.acquire_request(settings, "fourth-owner").lease_id


def test_migration_preserves_existing_reservations_and_repeats_safely(budget_db):
    assert budget.reserve(budget_db, 100)
    with connect(budget_db) as c:
        before = c.execute("SELECT * FROM pongdang_data.ai_daily_budget").fetchall()
        budget.migrate_ai(c)
        budget.migrate_ai(c)
        assert (
            c.execute("SELECT * FROM pongdang_data.ai_daily_budget").fetchall()
            == before
        )


def test_explicit_initialize_upgrades_existing_v6_budget_without_reset(budget_db):
    with connect(budget_db) as c:
        c.execute("DROP TABLE pongdang_data.ai_budget_attempts")
        c.execute("DROP TABLE pongdang_data.ai_request_leases")
        c.execute("DROP TABLE pongdang_data.ai_principal_rate")
        c.execute(
            "ALTER TABLE pongdang_data.ai_daily_budget "
            "DROP COLUMN observed_calls, DROP COLUMN actual_input_tokens, "
            "DROP COLUMN actual_output_tokens, DROP COLUMN actual_cost_microusd"
        )
        c.execute(
            "INSERT INTO pongdang_data.ai_daily_budget "
            "VALUES((now() AT TIME ZONE 'UTC')::date,2,1000,40000)"
        )
        c.execute("UPDATE pongdang_data.schema_version SET version=6 WHERE id=1")
    assert initialize(budget_db) is True
    assert initialize(budget_db) is False
    with connect(budget_db) as c:
        assert c.execute(
            "SELECT calls,reserved_tokens,reserved_cost_microusd,observed_calls "
            "FROM pongdang_data.ai_daily_budget"
        ).fetchone() == (2, 1000, 40000, 0)
        assert c.execute(
            "SELECT version FROM pongdang_data.schema_version WHERE id=1"
        ).fetchone() == (VERSION,)
    assert budget.acquire_request(budget_db, "upgraded-owner").lease_id


@pytest.mark.parametrize(
    "changes",
    [
        {"ai_input_microusd_per_million_tokens": 0},
        {"ai_output_microusd_per_million_tokens": None},
        {"ai_pricing_model": "mismatched-model"},
    ],
)
def test_invalid_prices_do_not_create_zero_cost_calls(budget_db, changes):
    assert budget.reserve_attempt(budget_db.model_copy(update=changes), 100) is None
    with connect(budget_db) as c:
        assert c.execute(
            "SELECT count(*) FROM pongdang_data.ai_daily_budget"
        ).fetchone() == (0,)
