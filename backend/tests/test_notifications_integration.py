"""Disposable PostgreSQL 18 only: real storage → job → owner HTTP → retry."""

from datetime import UTC, datetime, timedelta

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import SecretStr

from app.auth import Principal
from app.config import Settings
from app.ingestion.models import Place, Reading, SourceBatch, Station, Value
from app.ingestion.storage import store_batch
from app.notifications.api import create_router
from app.notifications.delivery import deliver_due
from app.notifications.migrations import migrate
from app.notifications.models import SubscriptionInput
from app.notifications.provider import DeliveryError
from app.notifications.service import (
    cancel_subscription,
    evaluate_subscriptions,
    save_subscription,
)
from app.schema import connect, initialize
from app.water_index.sources import EvidenceBundle, StationMapping, register_evidence

OWNER = Principal(
    "sso-test-owner", frozenset({"access-pongdang"}), "owner@example.test"
)


@pytest.fixture
def db():
    settings = Settings()
    if settings.postgres_db != "pongdang_test":
        pytest.fail("Requires disposable pongdang_test")
    settings = settings.model_copy(
        update={
            "sso_proxy_secret": SecretStr("a-test-secret-at-least-32-characters"),
            "sso_allowed_origins": "https://example.test",
            "notifications_delivery_enabled": True,
            "notifications_provider": "resend",
            "notifications_resend_api_key": SecretStr("test-key-never-used"),
            "notifications_from_email": "pongdang@example.test",
        }
    )
    initialize(settings)
    with connect(settings) as c:
        migrate(c)
    yield settings
    with connect(settings) as c:
        c.execute("DROP SCHEMA pongdang_data CASCADE")


def batch(temperature=21, *, source_id="test-reading", observed_at=None):
    now = datetime.now(UTC) - timedelta(seconds=1)
    return SourceBatch(
        provider="TEST_OFFICIAL",
        fetched_at=now,
        readings=[
            Reading(
                source_id=source_id,
                station=Station(
                    source_id="test-temperature", name="Test only", kind="buoy"
                ),
                observed_at=observed_at or now - timedelta(minutes=1),
                valid_until=now + timedelta(hours=30),
                spatial_scope="test-station-only",
                values=[
                    Value(
                        name="water_temperature", numeric_value=temperature, unit="°C"
                    )
                ],
            )
        ],
    )


def subscription(db, channel="in_app"):
    store_batch(db, batch())
    now = datetime.now(UTC)
    store_batch(
        db,
        SourceBatch(
            provider="TEST_OFFICIAL",
            fetched_at=now,
            places=[
                Place(
                    source_id="test-beach",
                    name="OFFLINE TEST beach",
                    kind="beach",
                    latitude=37.8,
                    longitude=128.9,
                )
            ],
        ),
    )
    with connect(db) as c:
        spot = c.execute(
            "SELECT spot_id FROM pongdang_data.collection_place "
            "WHERE source_id='test-beach'"
        ).fetchone()[0]
        station = c.execute(
            "SELECT id FROM pongdang_data.collection_station"
        ).fetchone()[0]
    register_evidence(
        db,
        EvidenceBundle(
            mappings=[
                StationMapping(
                    mapping_id="notification-test-beach-buoy",
                    spot_id=spot,
                    station_id=station,
                    spatial_scope="OFFLINE TEST FIXTURE ONLY",
                    mapping_version="fixture.v1",
                    evidence_ref="offline-test-mapping",
                    source_url="https://www.weather.go.kr/fixture",
                    authority="offline test",
                    reviewed_by="offline test",
                    activities=("swim",),
                    valid_from=now - timedelta(days=2),
                    valid_until=now + timedelta(days=5),
                )
            ]
        ),
    )
    body = SubscriptionInput(
        spot_id=spot,
        year=datetime.now(UTC).year,
        minimum_temperature_c=20,
        channel=channel,
        destination=OWNER.email if channel == "email" else None,
    )
    return save_subscription(db, OWNER, body), body


def auth_headers(owner=OWNER.subject):
    return {
        "X-Pongdang-SSO-Token": "a-test-secret-at-least-32-characters",
        "X-Pongdang-SSO-Subject": owner,
        "X-Pongdang-SSO-Grants": "access-pongdang",
        "X-Pongdang-SSO-Email": OWNER.email,
        "Origin": "https://example.test",
    }


def client(db):
    app = FastAPI()
    app.include_router(create_router(db))
    return TestClient(app)


def test_subscription_place_year_filters_preserve_owner_scope_and_names(db):
    sub, _ = subscription(db)
    with client(db) as api:
        path = (
            f"/api/data/notifications/subscriptions?spot_id={sub.spot_id}"
            f"&year={sub.year}&limit=1&offset=0"
        )
        response = api.get(path, headers=auth_headers())
        assert response.status_code == 200
        assert response.headers["cache-control"] == "private, no-store"
        (row,) = response.json()["rows"]
        assert row["id"] == sub.id
        assert row["spot_name"] == "OFFLINE TEST beach"
        assert api.get(path, headers=auth_headers("other")).json()["rows"] == []
        assert (
            api.get(
                path.replace(f"year={sub.year}", f"year={sub.year + 1}"),
                headers=auth_headers(),
            ).json()["rows"]
            == []
        )
        assert (
            api.get(
                path.replace("offset=0", "offset=1"), headers=auth_headers()
            ).json()["rows"]
            == []
        )
        assert (
            api.get(
                path.replace(f"spot_id={sub.spot_id}", "spot_id=0"),
                headers=auth_headers(),
            ).status_code
            == 422
        )
    with connect(db) as c:
        assert (
            c.execute(
                "SELECT count(*) FROM pongdang_data.notification_evaluation"
            ).fetchone()[0]
            == 0
        )


def test_normalized_observation_persisted_event_owner_api_and_readonly_get(db):
    sub, body = subscription(db)
    assert save_subscription(db, OWNER, body).id == sub.id
    first = evaluate_subscriptions(db)
    assert first["inserted"] == 2
    assert evaluate_subscriptions(db)["inserted"] == 0
    with client(db) as api:
        unchanged = api.put(
            f"/api/data/notifications/subscriptions/{sub.id}?expected_revision=1",
            json=body.model_dump(),
            headers=auth_headers(),
        )
        assert unchanged.status_code == 200
        assert unchanged.json()["revision"] == 1
        page = api.get("/api/data/notifications/events", headers=auth_headers())
        assert page.status_code == 200
        event = page.json()["rows"][0]
        assert event["evidence"]["observation"]["numeric_value"] == 21
        assert event["evidence"]["observation"]["revision"]
        relationship = event["evidence"]["station_relationship"]
        assert relationship["relation"] == "representative_station"
        assert relationship["mapping_id"] == "notification-test-beach-buoy"
        assert event["evidence"]["first_in_year"] is None
        assert event["evidence"]["safety_status"] == "unknown"
        assert event["delivery_state"] == "available_in_app"
        assert "owner_subject" not in page.text and "test-key" not in page.text
        assert (
            api.get(
                "/api/data/notifications/events", headers=auth_headers("other")
            ).json()["rows"]
            == []
        )
        assert (
            api.delete(
                f"/api/data/notifications/subscriptions/{sub.id}",
                headers=auth_headers("other"),
            ).status_code
            == 404
        )
        for _ in range(2):
            assert (
                api.get(
                    "/api/data/notifications/subscriptions", headers=auth_headers()
                ).status_code
                == 200
            )
        with connect(db) as c:
            assert (
                c.execute(
                    "SELECT count(*) FROM pongdang_data.notification_evaluation"
                ).fetchone()[0]
                == 1
            )
            assert (
                c.execute(
                    "SELECT count(*) FROM pongdang_data.notification_event"
                ).fetchone()[0]
                == 1
            )


def test_only_classified_water_places_can_create_or_replace_subscriptions(db):
    sub, body = subscription(db)
    store_batch(
        db,
        SourceBatch(
            provider="KAKAO_LOCAL",
            fetched_at=datetime.now(UTC),
            places=[
                Place(
                    source_id=source_id,
                    name=name,
                    kind="beach_search_result",
                    category=category,
                    latitude=37.8,
                    longitude=128.9,
                )
                for source_id, name, category in [
                    ("water-beach", "TEST 해수욕장", "여행 > 관광,명소 > 해수욕장"),
                    ("water-valley", "TEST 계곡", "여행 > 관광,명소 > 계곡"),
                    ("restaurant", "TEST 해변 식당", "음식점 > 한식"),
                    ("unclassified", "TEST 해변", ""),
                ]
            ],
        ),
    )
    with connect(db) as c:
        spots = dict(
            c.execute(
                "SELECT source_id,spot_id FROM pongdang_data.collection_place "
                "WHERE provider='KAKAO_LOCAL'"
            ).fetchall()
        )
        buoy_spot = c.execute(
            "SELECT spot_id FROM pongdang_data.collection_station"
        ).fetchone()[0]
    with client(db) as api:
        for spot in [spots["restaurant"], spots["unclassified"], buoy_spot]:
            request = body.model_dump() | {"spot_id": spot}
            response = api.post(
                "/api/data/notifications/subscriptions",
                json=request,
                headers=auth_headers(),
            )
            assert response.status_code == 422
            assert response.json()["detail"] == "WATER_PLACE_REQUIRED"
            response = api.put(
                f"/api/data/notifications/subscriptions/{sub.id}?expected_revision=1",
                json=request,
                headers=auth_headers(),
            )
            assert response.status_code == 422
            assert response.json()["detail"] == "WATER_PLACE_REQUIRED"
        response = api.post(
            "/api/data/notifications/subscriptions",
            json=body.model_dump() | {"spot_id": 999999999},
            headers=auth_headers(),
        )
        assert response.status_code == 404
        assert response.json()["detail"] == "PLACE_NOT_FOUND"
        unchanged = api.get(
            "/api/data/notifications/subscriptions", headers=auth_headers()
        ).json()["rows"]
        assert len(unchanged) == 1
        assert unchanged[0]["spot_id"] == body.spot_id
        assert unchanged[0]["revision"] == 1
        for source_id in ["water-beach", "water-valley"]:
            response = api.post(
                "/api/data/notifications/subscriptions",
                json=body.model_dump() | {"spot_id": spots[source_id]},
                headers=auth_headers(),
            )
            assert response.status_code == 201, response.text
            assert response.json()["spot_id"] == spots[source_id]


class FakeProvider:
    def __init__(self, fail_first=False):
        self.calls = []
        self.fail_first = fail_first

    def send(self, identifier, message):
        self.calls.append((identifier, message))
        if self.fail_first and len(self.calls) == 1:
            raise DeliveryError("PROVIDER_HTTP_429", retryable=True)
        return "test-accepted-id"


def test_outbox_retry_restart_idempotency_and_accepted_is_not_delivered(db):
    subscription(db, "email")
    now = datetime.now(UTC)
    evaluate_subscriptions(db, now=now)
    provider = FakeProvider(fail_first=True)
    assert deliver_due(db, now=now, provider=provider)["attempted"] == 1
    assert deliver_due(db, now=now, provider=provider)["attempted"] == 0
    assert (
        deliver_due(db, now=now + timedelta(minutes=3), provider=provider)["accepted"]
        == 1
    )
    assert provider.calls[0] == provider.calls[1]
    assert (
        deliver_due(db, now=now + timedelta(minutes=4), provider=provider)["attempted"]
        == 0
    )
    with connect(db) as c:
        assert c.execute(
            "SELECT state,attempts FROM pongdang_data.notification_outbox"
        ).fetchone() == ("accepted", 2)
        assert (
            c.execute(
                "SELECT count(*) FROM pongdang_data.notification_delivery_attempt"
            ).fetchone()[0]
            == 2
        )


def test_condition_edit_cancel_and_provider_revision_never_send_old_event(db):
    sub, body = subscription(db, "email")
    evaluate_subscriptions(db)
    with client(db) as api:
        changed = body.model_copy(update={"minimum_temperature_c": 22})
        url = f"/api/data/notifications/subscriptions/{sub.id}?expected_revision=1"
        response = api.put(url, json=changed.model_dump(), headers=auth_headers())
        assert response.status_code == 200, response.text
        assert response.json()["revision"] == 2
        assert (
            api.put(url, json=changed.model_dump(), headers=auth_headers()).status_code
            == 409
        )
    provider = FakeProvider()
    assert deliver_due(db, provider=provider)["attempted"] == 0
    store_batch(db, batch(23))
    evaluate_subscriptions(db)
    store_batch(db, batch(18))
    evaluate_subscriptions(db)
    assert deliver_due(db, provider=provider)["cancelled"] == 1
    assert provider.calls == []
    cancel_subscription(db, OWNER.subject, sub.id)
    assert evaluate_subscriptions(db)["received"] == 0


def test_disabled_channel_and_expired_idempotency_window_remain_unsent(db):
    subscription(db, "email")
    now = datetime.now(UTC)
    evaluate_subscriptions(db, now=now)
    disabled = db.model_copy(update={"notifications_delivery_enabled": False})
    provider = FakeProvider()
    assert deliver_due(disabled, now=now, provider=provider)["not_configured"] == 1
    assert provider.calls == []
    with connect(db) as c:
        c.execute(
            "UPDATE pongdang_data.notification_outbox SET state='sending',"
            "first_attempt_at=%s,next_attempt_at=%s",
            [now - timedelta(hours=24), now],
        )
    assert deliver_due(db, now=now, provider=provider)["attempted"] == 0
    with connect(db) as c:
        assert (
            c.execute("SELECT state FROM pongdang_data.notification_outbox").fetchone()[
                0
            ]
            == "delivery_unknown"
        )


def test_prior_year_history_and_subscription_ownership_validation(db):
    sub, body = subscription(db)
    now = datetime.now(UTC)
    store_batch(db, batch(25, source_id="earlier", observed_at=now - timedelta(days=1)))
    evaluate_subscriptions(db)
    with client(db) as api:
        event = api.get(
            "/api/data/notifications/events", headers=auth_headers()
        ).json()["rows"][0]
        assert event["evidence"]["first_in_year"] is False
        assert event["evidence"]["first_in_observed_history"] is False
        malicious = body.model_dump() | {
            "channel": "email",
            "destination": "other@example.test",
        }
        response = api.put(
            f"/api/data/notifications/subscriptions/{sub.id}?expected_revision=1",
            json=malicious,
            headers=auth_headers(),
        )
        assert response.status_code == 403


def test_corrected_never_dispatched_event_does_not_consume_the_whole_year(db):
    subscription(db, "email")
    evaluate_subscriptions(db)
    # The original high observation is retracted before any external attempt.
    store_batch(db, batch(18))
    evaluate_subscriptions(db)
    provider = FakeProvider()
    assert deliver_due(db, provider=provider)["cancelled"] == 1
    assert provider.calls == []
    # A later, genuine matching observation is eligible in the same season.
    store_batch(db, batch(24, source_id="later-qualifying"))
    evaluate_subscriptions(db)
    assert evaluate_subscriptions(db)["inserted"] == 0
    assert deliver_due(db, provider=provider)["accepted"] == 1
    assert deliver_due(db, provider=provider)["attempted"] == 0
    assert len(provider.calls) == 1
    with connect(db) as c:
        history = c.execute(
            "SELECT e.state,o.state,e.payload->'observation'->>'numeric_value' "
            "FROM pongdang_data.notification_event e JOIN "
            "pongdang_data.notification_outbox o ON o.event_id=e.id "
            "ORDER BY e.created_at"
        ).fetchall()
        assert history == [
            ("superseded", "cancelled", "21.0"),
            ("active", "accepted", "24.0"),
        ]


@pytest.mark.parametrize("accepted", [True, False])
def test_dispatched_or_ambiguous_event_is_not_recreated_after_correction(db, accepted):
    subscription(db, "email")
    evaluate_subscriptions(db)
    provider = FakeProvider(fail_first=not accepted)
    assert deliver_due(db, provider=provider)["attempted"] == 1
    store_batch(db, batch(18))
    evaluate_subscriptions(db)
    store_batch(db, batch(24, source_id="later-qualifying"))
    evaluate_subscriptions(db)
    deliver_due(db, provider=provider)
    assert len(provider.calls) == 1
    with connect(db) as c:
        assert (
            c.execute(
                "SELECT count(*) FROM pongdang_data.notification_event"
            ).fetchone()[0]
            == 1
        )
