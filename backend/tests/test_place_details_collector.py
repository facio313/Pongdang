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
