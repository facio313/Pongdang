"""Backfill/new-place/revision behavior against an isolated database."""

from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from test_place_details_provider import Client
from test_place_details_storage import (
    add_place,
    rows,
)
from test_place_details_storage import (
    database as database,
)

from app.ingestion.http import ProviderError
from app.main import create_app
from app.place_details.collector import (
    MAX_BATCH_SECONDS,
    collect_details,
    due_places,
    link_places,
    reserve_request,
)
from app.place_details.provider import TourDetails
from app.schema import connect


def configured(settings):
    from pydantic import SecretStr

    return settings.model_copy(update={"data_go_kr_key": SecretStr("offline-key")})


def collect(settings, client, now=None):
    now = now or datetime.now(UTC)
    settings = configured(settings)
    return collect_details(
        settings,
        provider=TourDetails(
            settings,
            client=client,
            clock=lambda: now,
        ),
        clock=lambda: now,
    )


def test_existing_rows_backfill_once_new_rows_only_and_no_time_based_refresh(database):
    add_place(database)
    client = Client()
    assert collect(database, client)["inserted"] == 1
    assert len(client.calls) == 3
    now = datetime.now(UTC) + timedelta(days=30)
    # No upstream call is needed despite a later scheduling clock.
    assert collect(database, client, now)["received"] == 0
    assert len(client.calls) == 3
    add_place(database, "101")
    assert collect(database, client)["inserted"] == 1
    assert len(client.calls) == 6
    assert rows(database, "SELECT count(*) FROM pongdang_data.place_detail") == [(2,)]
    assert rows(
        database, "SELECT next_attempt_at FROM pongdang_data.place_detail_collection"
    ) == [(None,), (None,)]


def test_successful_absence_is_persisted_and_not_retried_each_worker_tick(database):
    add_place(database)
    client = Client(empty=True)
    assert collect(database, client)["inserted"] == 1
    assert collect(database, client)["received"] == 0
    assert len(client.calls) == 1
    assert rows(
        database, "SELECT state FROM pongdang_data.place_detail_collection"
    ) == [("empty",)]


def test_source_revision_rechecks_and_failed_fetch_preserves_success_with_backoff(
    database,
):
    place_id, spot_id = add_place(database)
    first = Client()
    collect(database, first)
    fetched = rows(database, "SELECT fetched_at FROM pongdang_data.place_detail")[0]
    with connect(database) as c:
        c.execute(
            "UPDATE pongdang_data.collection_place SET source_modified_at=now() "
            "WHERE id=%s",
            [place_id],
        )

    class Failed:
        def get_json(self, *_):
            raise ProviderError("NETWORK_ERROR")

    result = collect(database, Failed())
    assert result["state"] == "failed"
    assert collect(database, Failed())["received"] == 0
    assert rows(database, "SELECT fetched_at FROM pongdang_data.place_detail") == [
        fetched
    ]
    with TestClient(create_app(database)) as client:
        detail = client.get(f"/api/data/place-details?spot_ids={spot_id}").json()[
            "items"
        ][0]
        assert detail["status"] == "available" and detail["refresh_failed"]
        assert detail["opening_hours"].startswith("09:00")
    with connect(database) as c:
        c.execute(
            "UPDATE pongdang_data.place_detail_collection SET next_attempt_at=now()"
        )
    assert collect(database, Client(intro={"usetime": "10:00~17:00"}))["inserted"] == 1
    assert rows(
        database, "SELECT state FROM pongdang_data.place_detail ORDER BY id"
    ) == [
        ("superseded",),
        ("active",),
    ]


def test_quota_is_durable_per_service_and_calendar_day(database):
    settings = database.model_copy(update={"place_detail_daily_budget": 3})
    now = datetime.now(UTC)
    for _ in range(3):
        reserve_request(settings, "KorService2", now)
    with pytest.raises(ProviderError, match="DETAIL_DAILY_BUDGET_EXHAUSTED"):
        reserve_request(settings, "KorService2", now)
    reserve_request(settings, "EngService2", now)
    reserve_request(settings, "KorService2", now + timedelta(days=1))
    add_place(database)
    assert due_places(settings, now) == []
    assert len(due_places(settings, now, check_budget=False)) == 1


def test_bounded_backfill_stays_partial_until_remaining_places_are_collected(database):
    settings = database.model_copy(update={"place_detail_batch_size": 1})
    add_place(settings)
    add_place(settings, "101")
    first = collect(settings, Client())
    assert first["inserted"] == 1
    assert first["state"] == "partial"
    assert first["error"] == "DETAIL_BACKFILL_PENDING"
    second = collect(settings, Client())
    assert second["inserted"] == 1
    assert second["state"] == "succeeded" and second["error"] == ""
    assert collect(settings, Client())["received"] == 0


def test_canonical_water_place_details_precede_unrelated_name_matches(database):
    unrelated, unrelated_spot = add_place(database)
    priority, priority_spot = add_place(database, "101")
    link_places(database)
    with connect(database) as c:
        # A name suffix alone must not outrank a confirmed UI water place.
        c.execute(
            "UPDATE pongdang_data.spots_waterspot SET type='tourism' WHERE id=%s",
            [unrelated_spot],
        )
        c.execute(
            "UPDATE pongdang_data.collection_place SET category='39' WHERE id=%s",
            [unrelated],
        )
        c.execute(
            "UPDATE pongdang_data.collection_place SET name='우선 명소' WHERE id=%s",
            [priority],
        )
        c.execute(
            "UPDATE pongdang_data.spots_waterspot SET name='우선 명소' WHERE id=%s",
            [priority_spot],
        )
    settings = database.model_copy(update={"place_detail_batch_size": 1})
    assert [p["id"] for p in due_places(settings, datetime.now(UTC))] == [priority]


def test_batch_quota_exhaustion_preserves_pending_places_until_next_korean_day(
    database,
):
    settings = configured(database).model_copy(update={"place_detail_daily_budget": 3})
    first, _ = add_place(settings)
    second, _ = add_place(settings, "101")
    now = (datetime.now(UTC) - timedelta(days=2)).replace(
        hour=14, minute=30, second=0, microsecond=0
    )  # KST 23:30, with both test fetches in the past.
    client = Client()

    def run(at):
        return collect_details(
            settings,
            provider=TourDetails(
                settings,
                client=client,
                reserve=lambda service: reserve_request(settings, service, at),
                clock=lambda: at,
            ),
            clock=lambda: at,
        )

    result = run(now)
    assert result["received"] == result["inserted"] == 1
    assert result["state"] == "partial"
    assert result["error"] == "DETAIL_DAILY_BUDGET_EXHAUSTED"
    assert result["next_run_seconds"] == 1800
    assert len(client.calls) == 3
    assert rows(
        settings,
        "SELECT place_id,state FROM pongdang_data.place_detail_collection",
    ) == [(first, "available")]
    assert run(now)["received"] == 0
    assert len(client.calls) == 3
    result = run(now + timedelta(hours=1))
    assert result["state"] == "succeeded"
    assert result["inserted"] == 1 and len(client.calls) == 6
    assert rows(
        settings,
        "SELECT state FROM pongdang_data.place_detail_collection WHERE place_id=%s",
        [second],
    ) == [("available",)]


def test_slow_backfill_yields_after_current_place_and_resumes(database, monkeypatch):
    add_place(database)
    add_place(database, "101")
    times = iter([0, 0, MAX_BATCH_SECONDS])
    monkeypatch.setattr("app.place_details.collector.monotonic", lambda: next(times))
    result = collect(database, Client())
    assert result["received"] == result["inserted"] == 1
    assert result["state"] == "partial"
    assert result["error"] == "DETAIL_BACKFILL_PENDING"
    monkeypatch.setattr("app.place_details.collector.monotonic", lambda: 0)
    result = collect(database, Client())
    assert result["inserted"] == 1 and result["state"] == "succeeded"


def test_db_matching_is_conservative_and_late_catalogue_rows_are_resolved(database):
    with connect(database) as c:
        alias = c.execute(
            "INSERT INTO pongdang_data.spots_waterspot(name,type,lat,lng) "
            "VALUES ('격리해변','beach',37.8,128.9) RETURNING id",
        ).fetchone()[0]
    link_places(database)
    assert rows(database, "SELECT count(*) FROM pongdang_data.place_detail_link") == [
        (0,)
    ]
    place_id, _ = add_place(database)
    link_places(database)
    assert rows(
        database,
        "SELECT place_id FROM pongdang_data.place_detail_link WHERE spot_id=%s",
        [alias],
    ) == [(place_id,)]
    add_place(database, "101")
    link_places(database)
    assert (
        rows(
            database,
            "SELECT place_id FROM pongdang_data.place_detail_link WHERE spot_id=%s",
            [alias],
        )
        == []
    )


def test_offshore_or_distant_same_name_is_not_attached(database):
    add_place(database)
    with connect(database) as c:
        alias = c.execute(
            "INSERT INTO pongdang_data.spots_waterspot(name,type,lat,lng) "
            "VALUES ('격리해변','beach',37.8049,128.9099) RETURNING id",
        ).fetchone()[0]
    link_places(database)
    assert (
        rows(
            database,
            "SELECT place_id FROM pongdang_data.place_detail_link WHERE spot_id=%s",
            [alias],
        )
        == []
    )
