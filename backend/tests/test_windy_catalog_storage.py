"""Persistence and concurrency on a disposable DB, without Windy network access."""

import threading
from concurrent.futures import ThreadPoolExecutor

import psycopg
import pytest
from fastapi import HTTPException
from test_webcam_preview import Client, app_client, camera, config

from app import schema
from app.config import Settings
from app.livecams.preview import PreviewService
from app.livecams.windy import WindyError


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


def service(client=None, *, now=None, **settings):
    kwargs = {"clock": lambda: now[0]} if now is not None else {}
    return PreviewService(
        config(**settings), client=client or Client(), sleep=lambda _: None, **kwargs
    )


def test_restart_missing_key_and_exhausted_budget_still_serve_saved_metadata(db):
    now = [1_800_000_000.0]
    original = service(now=now).query()
    now[0] += 86400 * 365
    provider = Client()
    provider.error = AssertionError("Stored catalog must never contact Windy")
    restarted = service(
        provider, now=now, windy_webcams_api_key="", windy_webcams_daily_budget=0
    )
    http = app_client(restarted)
    for body in ({}, {"category": "coast"}, {"shuffle_seed": 77}, {"page": 2}):
        response = http.post("/api/data/livecams/preview", json=body)
        assert response.status_code == 200
        assert response.json()["fetched_at"] == original.fetched_at.isoformat().replace(
            "+00:00", "Z"
        )
        assert response.json()["valid_until"] is None
        assert response.json()["storage"] == "database"
        assert response.json()["cached"]
    assert provider.calls == []
    with schema.connect(db) as connection:
        assert connection.execute(
            "SELECT calls FROM pongdang_data.windy_api_budget"
        ).fetchone() == (5,)


def test_successful_empty_catalog_is_initialized_once():
    first = service(Client([])).query()
    assert first.rows == []
    restarted = service(windy_webcams_api_key="")
    assert restarted.query().rows == []
    assert restarted.query().fetched_at == first.fetched_at
    assert not restarted.client.calls


def test_explicit_refresh_preserves_prior_revision_and_redacts_saved_payload(db):
    first = service().query()
    changed = service(Client([camera(title="Changed official metadata")]))
    assert changed.query().rows == first.rows
    refreshed = changed.query(refresh=True)
    assert refreshed.rows[0].title == "Changed official metadata"
    with schema.connect(db) as connection:
        revisions = connection.execute(
            "SELECT state,cameras FROM pongdang_data.windy_catalog_revision ORDER BY id"
        ).fetchall()
    assert [row[0] for row in revisions] == ["superseded", "recorded"]
    assert revisions[0][1][0]["title"] == first.rows[0].title
    assert not any(secret in str(revisions) for secret in ("SECRET", "private.test"))
    assert len(changed.client.calls) == 5


def test_partial_refresh_never_replaces_saved_revision(db):
    original = service().query()

    class Incomplete(Client):
        def list_page(self, page=1, category=None):
            if category == "lake":
                raise WindyError("WINDY_HTTP_503")
            return super().list_page(page, category)

    s = service(Incomplete([camera(title="Incomplete new metadata")]))
    with pytest.raises(WindyError, match="WINDY_HTTP_503"):
        s.query(refresh=True)
    assert s.query().rows == original.rows
    assert s.query().fetched_at == original.fetched_at
    with schema.connect(db) as connection:
        assert connection.execute(
            "SELECT count(*) FROM pongdang_data.windy_catalog_revision"
        ).fetchone() == (1,)


def test_simultaneous_initial_requests_import_only_once():
    entered, release = threading.Event(), threading.Event()

    class Waiting(Client):
        def list_page(self, page=1, category=None):
            if not self.calls:
                entered.set()
                assert release.wait(5)
            return super().list_page(page, category)

    first, second = service(Waiting()), service()
    with ThreadPoolExecutor(max_workers=1) as executor:
        result = executor.submit(first.query)
        try:
            assert entered.wait(5)
            with pytest.raises(HTTPException) as error:
                second.query()
            assert error.value.status_code == 429
            assert error.value.detail == "WEBCAM_REQUEST_IN_PROGRESS"
            assert not second.client.calls
        finally:
            release.set()
        stored = result.result(timeout=5)
        assert second.query().rows == stored.rows
    assert len(first.client.calls) == 5 and not second.client.calls


def test_reads_remain_available_during_manual_refresh():
    original = service().query()
    entered, release = threading.Event(), threading.Event()

    class Waiting(Client):
        def list_page(self, page=1, category=None):
            if not self.calls:
                entered.set()
                assert release.wait(5)
            return super().list_page(page, category)

    refresher = service(Waiting([camera(title="Refreshed")]))
    reader = service(windy_webcams_api_key="")
    with ThreadPoolExecutor(max_workers=1) as executor:
        result = executor.submit(refresher.query, refresh=True)
        try:
            assert entered.wait(5)
            assert reader.query().rows == original.rows
        finally:
            release.set()
        result.result(timeout=5)
    assert reader.query().rows[0].title == "Refreshed"
    assert not reader.client.calls


def test_rate_limit_backoff_and_spent_calls_survive_restart(db):
    now = [1_800_000_000.0]
    provider = Client()
    provider.error = WindyError("WINDY_HTTP_429", 900)
    first = service(provider, now=now)
    with pytest.raises(WindyError, match="WINDY_HTTP_429"):
        first.query()
    restarted = service(now=now)
    with pytest.raises(WindyError, match="WINDY_BACKOFF") as error:
        restarted.query()
    assert error.value.cause_code == "WINDY_HTTP_429"
    assert not restarted.client.calls
    now[0] += 901
    assert restarted.query().total == 1
    with schema.connect(db) as connection:
        assert connection.execute(
            "SELECT calls FROM pongdang_data.windy_api_budget"
        ).fetchone() == (6,)


def test_database_failure_never_falls_back_to_provider(monkeypatch):
    s = service()

    def unavailable(*args):
        raise psycopg.OperationalError("sensitive connection details")

    monkeypatch.setattr(schema, "connect", unavailable)
    response = app_client(s).post("/api/data/livecams/preview", json={})
    assert response.status_code == 503
    assert response.json() == {"detail": "WEBCAM_CATALOG_UNAVAILABLE"}
    assert not s.client.calls


def test_v11_upgrade_is_additive_idempotent_and_never_fetches(db, monkeypatch):
    with schema.connect(db) as connection:
        connection.execute("DROP TABLE pongdang_data.windy_catalog_revision")
        connection.execute("DROP TABLE pongdang_data.windy_api_budget")
        connection.execute("UPDATE pongdang_data.schema_version SET version=11")
        before = connection.execute(
            "SELECT count(*) FROM pongdang_data.collection_place"
        ).fetchone()

    def forbidden(*args, **kwargs):
        raise AssertionError("Schema initialization must never contact Windy")

    monkeypatch.setattr("app.livecams.windy.WindyClient.list_page", forbidden)
    assert schema.initialize(db)
    assert not schema.initialize(db)
    with schema.connect(db) as connection:
        assert connection.execute(
            "SELECT version FROM pongdang_data.schema_version"
        ).fetchone() == (schema.VERSION,)
        assert (
            connection.execute(
                "SELECT count(*) FROM pongdang_data.collection_place"
            ).fetchone()
            == before
        )
        assert connection.execute(
            "SELECT count(*) FROM pongdang_data.windy_catalog_revision"
        ).fetchone() == (0,)
