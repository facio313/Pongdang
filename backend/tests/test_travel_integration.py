"""Group B against an explicitly disposable PostgreSQL 18 pongdang_test."""

from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from psycopg.types.json import Jsonb
from pydantic import SecretStr

from app.config import Settings
from app.ingestion.models import Place, SourceBatch, Station
from app.ingestion.storage import store_batch
from app.main import create_app
from app.schema import connect, initialize

SECRET = "isolated-travel-sso-secret-at-least-32-characters"
HEADERS = {
    "x-pongdang-sso-token": SECRET,
    "x-pongdang-sso-subject": "traveller-a",
    "x-pongdang-sso-grants": "access-pongdang",
    "origin": "https://travel.test",
}
BASE = "/api/data/travel"


@pytest.fixture
def travel_db():
    settings = Settings(
        _env_file=None,
        ai_provider="disabled",
        sso_proxy_secret=SECRET,
        sso_allowed_origins="https://travel.test",
    )
    if settings.postgres_db != "pongdang_test":
        pytest.fail("Group B tests require disposable pongdang_test")
    with connect(settings) as c:
        c.execute("DROP SCHEMA IF EXISTS pongdang_data CASCADE")
    initialize(settings)
    now = datetime.now(UTC) - timedelta(minutes=1)
    store_batch(
        settings,
        SourceBatch(
            provider="TOURAPI_KOREAN",
            fetched_at=now,
            places=[
                Place(
                    source_id="isolated-beach",
                    name="격리 해변",
                    kind="beach",
                    region="격리",
                    latitude=37.8,
                    longitude=128.9,
                    category="해수욕장",
                ),
                Place(
                    source_id="isolated-onsen",
                    name="격리 온천",
                    kind="onsen",
                    region="격리",
                    latitude=37.7,
                    longitude=128.8,
                    category="온천",
                ),
            ],
            stations=[
                Station(
                    source_id="isolated-station",
                    name="격리 관측소",
                    kind="buoy",
                    latitude=37.8,
                    longitude=128.9,
                )
            ],
        ),
    )
    store_batch(
        settings,
        SourceBatch(
            provider="tourapi_english",
            fetched_at=now,
            places=[
                Place(
                    source_id="isolated-english",
                    name="Isolated registered beach",
                    kind="beach",
                    region="Isolated",
                    latitude=37.8,
                    longitude=128.9,
                ),
            ],
        ),
    )
    with connect(settings) as c:
        places = dict(
            c.execute(
                "SELECT source_id,spot_id FROM pongdang_data.collection_place"
            ).fetchall()
        )
        station = c.execute(
            "SELECT spot_id FROM pongdang_data.collection_station LIMIT 1"
        ).fetchone()[0]
    with TestClient(create_app(settings), headers=HEADERS) as client:
        yield settings, client, places, station
    with connect(settings) as c:
        c.execute("DROP SCHEMA IF EXISTS pongdang_data CASCADE")


def trip_request():
    from zoneinfo import ZoneInfo

    return {
        "region": "격리",
        "dates": [datetime.now(ZoneInfo("Asia/Seoul")).date().isoformat()],
        "origin": {"label": "사용자 출발지"},
        "departure_time": "09:00",
        "return_by": "20:00",
    }


@pytest.mark.parametrize("kind", ["beach", "valley"])
def test_explicit_water_station_selection_preserves_source_without_catalogue(
    travel_db, kind
):
    import asyncio

    from app.travel.catalog import Catalog

    settings, client, _, buoy = travel_db
    now = datetime.now(UTC) - timedelta(minutes=1)
    valid_until = now + timedelta(days=1)
    store_batch(
        settings,
        SourceBatch(
            provider="khoa_beach",
            fetched_at=now,
            stations=[
                Station(
                    source_id="isolated-water-place",
                    name="격리 관측 물놀이 장소",
                    kind=kind,
                    latitude=37.8,
                    longitude=128.9,
                    source_valid_from=now,
                    source_valid_until=valid_until,
                )
            ],
        ),
    )
    with connect(settings) as c:
        spot_id = c.execute(
            "SELECT spot_id FROM pongdang_data.collection_station "
            "WHERE provider='khoa_beach' AND source_id='isolated-water-place'"
        ).fetchone()[0]
        catalogue_count = c.execute(
            "SELECT count(*) FROM pongdang_data.collection_place"
        ).fetchone()[0]
    selected = asyncio.run(Catalog(settings, now).places([spot_id]))[spot_id]
    assert selected["region"] == ""
    assert selected["kind"] == kind
    assert selected["catalog_role"] == "visit"
    assert selected["evidence"].provider == "khoa_beach"
    assert selected["evidence"].source_record_id == "isolated-water-place"
    assert selected["evidence"].fetched_at == now
    assert selected["evidence"].valid_from == now
    assert selected["evidence"].valid_until == valid_until
    assert selected["evidence"].source_url is None
    assert selected["evidence"].issued_at is None
    request = trip_request() | {"region": None}
    for candidate_id, expected in ((spot_id, 200), (buoy, 404), (999999999, 404)):
        draft = client.post(
            BASE + "/plans/draft",
            json={
                "request": request,
                "stops": [
                    {
                        "item_id": "selected",
                        "spot_id": candidate_id,
                        "day": request["dates"][0],
                    }
                ],
            },
        )
        assert draft.status_code == expected, draft.text
        if expected == 200:
            assert draft.json()["input_stops"][0]["spot_id"] == spot_id
        signal = client.post(
            BASE + "/signals",
            json={"kind": "favorite", "action": "like", "spot_id": candidate_id},
        )
        assert signal.status_code == (201 if expected == 200 else expected), signal.text
    favorites = client.get(BASE + f"/signals?spot_id={spot_id}&kind=favorite").json()[
        "rows"
    ]
    assert len(favorites) == 1
    assert favorites[0]["payload"]["spot_id"] == spot_id
    with connect(settings) as c:
        assert (
            c.execute("SELECT count(*) FROM pongdang_data.collection_place").fetchone()[
                0
            ]
            == catalogue_count
        )
        assert (
            c.execute(
                "SELECT count(*) FROM pongdang_data.conditions_conditionscore"
            ).fetchone()[0]
            == 0
        )


def test_first_visit_preference_reordering_and_strict_unknown_conditions(travel_db):
    _, client, places, station = travel_db
    initial = client.get(BASE + "/preferences")
    assert initial.status_code == 200
    assert initial.json()["revision"] == 0
    one = client.post(
        BASE + "/recommendations",
        json={"request": trip_request(), "preference": {"tags": ["온천"]}},
    )
    assert one.status_code == 200, one.text
    result = one.json()
    assert result["recommendations"][0]["spot_id"] == places["isolated-onsen"]
    assert (
        result["recommendations"][0]["matched_preferences"][0]["source"] == "explicit"
    )
    assert station not in [r["spot_id"] for r in result["recommendations"]]
    assert result["candidate_scope"]["scanned_count"] == 2
    assert result["candidate_scope"]["area_wide_optimum"] is False
    two = client.post(
        BASE + "/recommendations",
        json={"request": trip_request(), "preference": {"tags": ["해변"]}},
    ).json()
    assert two["recommendations"][0]["spot_id"] == places["isolated-beach"]
    required = trip_request() | {
        "required": [{"attribute": "shallow_water", "value": "true"}]
    }
    unavailable = client.post(
        BASE + "/recommendations", json={"request": required}
    ).json()
    assert unavailable["status"] == "no_data"
    assert not unavailable["recommendations"]
    assert unavailable["relaxation_proposals"][0]["requires_user_confirmation"] is True


def test_personal_profile_signals_revision_reset_and_ownership(travel_db):
    _, client, places, _ = travel_db
    saved = client.put(
        BASE + "/preferences",
        json={"expected_revision": 0, "preference": {"tags": ["온천"]}},
    )
    assert saved.status_code == 200
    assert saved.json()["revision"] == 1
    assert (
        client.put(
            BASE + "/preferences", json={"expected_revision": 0, "preference": {}}
        ).status_code
        == 409
    )
    visit = {
        "kind": "visit",
        "action": "confirm",
        "spot_id": places["isolated-beach"],
        "visited_on": trip_request()["dates"][0],
    }
    created = client.post(BASE + "/signals", json=visit)
    assert created.status_code == 201, created.text
    sid = created.json()["id"]
    assert (
        client.post(BASE + "/signals", json=visit | {"action": "like"}).status_code
        == 422
    )
    other = HEADERS | {"x-pongdang-sso-subject": "traveller-b"}
    assert client.get(BASE + "/signals", headers=other).json()["rows"] == []
    assert client.get(BASE + "/preferences", headers=other).json()["revision"] == 0
    assert client.delete(BASE + "/signals/" + sid, headers=other).status_code == 404
    assert client.delete(BASE + "/signals/" + sid).status_code == 204
    card = client.post(
        BASE + "/signals", json={"kind": "card", "action": "like", "tags": ["해변"]}
    )
    assert card.status_code == 201
    assert client.delete(BASE + "/history?reset_profile=true").status_code == 204
    profile = client.get(BASE + "/preferences").json()
    assert profile["preference"]["tags"] == []
    assert profile["revision"] == 2
    assert client.get(BASE + "/signals").json()["rows"] == []


def test_signal_filters_find_favorite_beyond_latest_page_and_keep_owner_scope(
    travel_db,
):
    settings, client, places, _ = travel_db
    beach = places["isolated-beach"]
    favorite = {"kind": "favorite", "action": "like", "spot_id": beach}
    created = client.post(BASE + "/signals", json=favorite)
    assert created.status_code == 201, created.text
    favorite_id = created.json()["id"]
    onsen = client.post(
        BASE + "/signals",
        json=favorite | {"spot_id": places["isolated-onsen"]},
    )
    assert onsen.status_code == 201, onsen.text
    other = HEADERS | {"x-pongdang-sso-subject": "traveller-b"}
    other_favorite = client.post(BASE + "/signals", json=favorite, headers=other)
    assert other_favorite.status_code == 201, other_favorite.text

    # More recent signals for the same place must not hide its saved state.
    card = {"kind": "card", "action": "like", "spot_id": beach, "tags": ["해변"]}
    with connect(settings) as c:
        with c.cursor() as cursor:
            cursor.executemany(
                "INSERT INTO pongdang_data.travel_signal(id,owner_subject,payload) "
                "VALUES(%s,%s,%s)",
                [(uuid4().hex, "traveller-a", Jsonb(card)) for _ in range(101)],
            )

    all_signals = client.get(BASE + "/signals")
    assert all_signals.status_code == 200
    assert all_signals.json()["limit"] == 100
    assert all_signals.json()["offset"] == 0
    assert len(all_signals.json()["rows"]) == 100
    assert all(row["payload"]["kind"] == "card" for row in all_signals.json()["rows"])

    query = {"spot_id": beach, "kind": "favorite"}
    filtered = client.get(BASE + "/signals", params=query)
    assert filtered.status_code == 200
    assert [row["id"] for row in filtered.json()["rows"]] == [favorite_id]
    other_filtered = client.get(BASE + "/signals", params=query, headers=other)
    assert [row["id"] for row in other_filtered.json()["rows"]] == [
        other_favorite.json()["id"]
    ]
    empty = client.get(BASE + "/signals", params=query | {"spot_id": 2**53 - 1})
    assert empty.status_code == 200
    assert empty.json()["rows"] == []
    page = client.get(
        BASE + "/signals", params={"spot_id": beach, "limit": 1, "offset": 100}
    )
    assert page.status_code == 200
    assert len(page.json()["rows"]) == 1
    assert page.json()["rows"][0]["payload"]["kind"] == "card"
    assert client.get(BASE + "/signals", params={"limit": 101}).status_code == 422
    assert client.get(BASE + "/signals", params={"spot_id": 0}).status_code == 422
    assert client.get(BASE + "/signals", params={"kind": "unknown"}).status_code == 422


def test_second_candidate_chat_to_saved_plan_and_session_without_ai(travel_db):
    _, client, places, _ = travel_db
    request = trip_request()
    recommendations = client.post(
        BASE + "/recommendations", json={"request": request}
    ).json()
    expected = recommendations["recommendations"][1]["spot_id"]
    token = recommendations["selection_token"]
    reply = client.post(
        "/api/data/ai/chat",
        json={
            "message": "두 번째 장소로 일정 만들어줘",
            "travel": {"request": request, "selection_token": token},
        },
    )
    assert reply.status_code == 200, reply.text
    response = reply.json()
    assert response["fallback"] is True
    assert "draft_plan" in response["travel_results"], response
    draft = response["travel_results"]["draft_plan"]
    assert draft["input_stops"][0]["spot_id"] == expected
    assert draft["days"][0]["items"][0]["arrival_at"] is None
    assert draft["days"][0]["return_at"] is None
    assert draft["cost"]["total_krw"] is None
    assert draft["cost"]["budget_status"] == "unknown"
    assert draft["route_status"] == "unconfigured"
    body = {
        "request": draft["request"],
        "stops": draft["input_stops"],
        "selection_token": token,
        "selected_ranks": [2],
    }
    save = client.post(BASE + "/plans", json=body)
    assert save.status_code == 201, save.text
    plan = save.json()
    pid = plan["plan_id"]
    other = HEADERS | {"x-pongdang-sso-subject": "traveller-b"}
    assert client.get(BASE + "/plans/" + pid, headers=other).status_code == 404
    assert (
        client.put(
            BASE + "/plans/" + pid, headers=other, json=body | {"expected_revision": 1}
        ).status_code
        == 404
    )
    update = client.put(
        BASE + "/plans/" + pid,
        json=body
        | {
            "expected_revision": 1,
            "request": draft["request"]
            | {"transport": "walking", "budget": {"amount": 10000}},
        },
    )
    assert update.status_code == 200, update.text
    assert update.json()["legs"][0]["mode"] == "walking"
    assert update.json()["cost"]["budget_krw"] == 10000
    assert (
        client.put(
            BASE + "/plans/" + pid, json=body | {"expected_revision": 1}
        ).status_code
        == 409
    )
    start = client.post(
        BASE + "/sessions",
        json={"plan_id": pid, "plan_revision": 2, "location_status": "denied"},
    )
    assert start.status_code == 201, start.text
    session_id = start.json()["session_id"]
    assert start.json()["monitoring"] is False
    refresh = client.post(
        BASE + f"/sessions/{session_id}/refresh",
        json={"current_spot_id": expected, "location_status": "denied"},
    )
    assert refresh.status_code == 200, refresh.text
    assert refresh.json()["session"]["location_status"] == "denied"
    assert refresh.json()["session"]["snapshot"]["route_status"] == "unconfigured"
    assert (
        client.get(BASE + "/sessions/" + session_id, headers=other).status_code == 404
    )
    chat_body = {
        "message": "여행 중 최신 안내를 알려줘",
        "travel": {"session_id": session_id, "request": request},
    }
    before_read = client.get(BASE + "/sessions/" + session_id).json()
    companion_chat = client.post("/api/data/ai/chat", json=chat_body)
    assert companion_chat.status_code == 200, companion_chat.text
    checked = companion_chat.json()["travel_results"]["companion"]
    assert datetime.fromisoformat(checked["last_refresh_at"]) == datetime.fromisoformat(
        before_read["last_refresh_at"]
    )
    assert checked["route_status"] == "unconfigured"
    assert client.get(BASE + "/sessions/" + session_id).json() == before_read
    assert (
        client.post("/api/data/ai/chat", json=chat_body, headers=other).status_code
        == 404
    )
    from app.ai.chat import ChatRequest
    from app.travel.chat import TravelToolSession

    read_tool = TravelToolSession(
        travel_db[0],
        datetime.now(UTC),
        body=ChatRequest.model_validate(chat_body),
        owner="traveller-a",
    )
    import asyncio
    import json

    tool_result = asyncio.run(read_tool.execute("travel_companion", {}))
    assert session_id not in json.dumps(tool_result)
    assert "current_item_id" not in tool_result["result"]
    end = client.post(BASE + f"/sessions/{session_id}/end")
    assert end.status_code == 200
    assert end.json()["state"] == "ended"
    assert end.json()["current_spot_id"] is None
    assert end.json()["monitoring"] is False
    ended_chat = client.post("/api/data/ai/chat", json=chat_body).json()
    assert ended_chat["travel_results"]["companion"]["connection_status"] == "ended"
    assert ended_chat["travel_results"]["companion"]["monitoring"] is False
    assert "종료한 여행" in ended_chat["answer"]
    assert (
        client.post(BASE + f"/sessions/{session_id}/refresh", json={}).status_code
        == 409
    )


def test_token_tampering_and_cross_owner_selection_rejected(travel_db):
    _, client, _, _ = travel_db
    result = client.post(
        BASE + "/recommendations", json={"request": trip_request()}
    ).json()
    token = result["selection_token"]
    other = HEADERS | {"x-pongdang-sso-subject": "traveller-b"}
    for bad, headers in ((token + "a", HEADERS), (token, other)):
        assert (
            client.post(
                BASE + "/compare",
                headers=headers,
                json={"selection_token": bad, "ranks": [1]},
            ).status_code
            == 422
        )
    assert (
        client.post(
            BASE + "/compare", json={"selection_token": token, "ranks": [3]}
        ).status_code
        == 422
    )
    compared = client.post(
        BASE + "/compare", json={"selection_token": token, "ranks": [2, 1]}
    )
    assert compared.status_code == 200, compared.text
    assert [r["original_rank"] for r in compared.json()["rows"]] == [2, 1]


def test_multilingual_catalog_and_mood_confirmation_are_explicit(travel_db):
    _, client, _, _ = travel_db
    result = client.post(
        BASE + "/recommendations", json={"request": {"locale": "en"}}
    ).json()
    assert result["recommendations"][0]["name"] == "Isolated registered beach"
    assert result["recommendations"][0]["catalog_locale"] == "en"
    no_chinese = client.post(
        BASE + "/recommendations", json={"request": {"locale": "zh-TW"}}
    ).json()
    assert no_chinese["status"] == "no_data"
    mood = client.post(
        BASE + "/mood/proposal", json={"text": "요즘 너무 지친다"}
    ).json()
    assert mood["mood"]["confirmed"] is False
    assert "서핑" not in mood["mood"]["tags"]
    assert (
        client.post(
            BASE + "/mood/profile", json={"mood": mood["mood"], "expected_revision": 0}
        ).status_code
        == 422
    )
    promoted = client.post(
        BASE + "/mood/profile",
        json={"mood": mood["mood"] | {"confirmed": True}, "expected_revision": 0},
    )
    assert promoted.status_code == 200
    assert "조용한 휴식" in promoted.json()["preference"]["tags"]


def test_auth_and_private_catalog_boundary(travel_db):
    _, client, _, _ = travel_db
    assert (
        client.get(
            BASE + "/preferences", headers={"x-pongdang-sso-token": "bad"}
        ).status_code
        == 401
    )
    assert (
        client.post(
            BASE + "/recommendations", headers={"origin": "https://evil.test"}, json={}
        ).status_code
        == 403
    )
    from app.data_reader import CATALOG

    assert not any(row["table"].startswith("travel_") for row in CATALOG)
    response = client.get(BASE + "/preferences")
    assert response.headers["cache-control"] == "private, no-store"


def test_event_deduplication_corrections_ack_and_end_race_use_real_transactions(
    travel_db,
):
    from app.travel.companion import (
        _persist_refresh,
        acknowledge,
        change_session,
        events,
        get_session,
        start_session,
    )
    from app.travel.models import SessionRefresh, SessionStart

    settings, client, places, _ = travel_db
    day = trip_request()["dates"][0]
    sid = places["isolated-beach"]
    saved = client.post(
        BASE + "/plans",
        json={
            "request": trip_request(),
            "stops": [{"item_id": "first", "spot_id": sid, "day": day}],
        },
    ).json()
    now = datetime.now(UTC)
    session = start_session(
        settings,
        "traveller-a",
        SessionStart(plan_id=saved["plan_id"], plan_revision=1),
        now=now,
    )
    body = SessionRefresh(current_spot_id=sid, location_status="denied")
    proposal = {
        "kind": "official_restriction",
        "spot_id": sid,
        "target_at": now,
        "valid_until": now + timedelta(hours=1),
        "key": "restriction:one",
        "previous_key": None,
        "evidence": [{"evidence_id": "one"}],
        "message": "공식 제한",
    }
    first = _persist_refresh(
        settings, "traveller-a", session, body, session.snapshot, [proposal], now, True
    )
    assert len(first["new_notifications"]) == 1
    eid = first["new_notifications"][0].event_id
    current = get_session(settings, "traveller-a", session.session_id, now=now)
    second = _persist_refresh(
        settings, "traveller-a", current, body, current.snapshot, [proposal], now, True
    )
    assert second["new_notifications"] == []
    assert len(events(settings, "traveller-a", session.session_id, now=now)) == 1
    acknowledged = acknowledge(
        settings, "traveller-a", session.session_id, eid, now=now
    )
    assert acknowledged.acknowledged_at == now
    from fastapi import HTTPException

    with pytest.raises(HTTPException) as denied:
        acknowledge(settings, "traveller-b", session.session_id, eid, now=now)
    assert denied.value.status_code == 404
    current = get_session(settings, "traveller-a", session.session_id, now=now)
    corrected = proposal | {"key": "restriction:two", "previous_key": "restriction:one"}
    third = _persist_refresh(
        settings, "traveller-a", current, body, current.snapshot, [corrected], now, True
    )
    assert third["new_notifications"] == []  # Frequency limit still applies.
    rows = events(settings, "traveller-a", session.session_id, now=now)
    assert len(rows) == 2
    assert any(row.corrects_event_id == eid for row in rows)
    assert next(row for row in rows if row.event_id == eid).status == "superseded"
    stale_read = get_session(settings, "traveller-a", session.session_id, now=now)
    change_session(settings, "traveller-a", session.session_id, end=True, now=now)
    with pytest.raises(HTTPException) as ended:
        _persist_refresh(
            settings,
            "traveller-a",
            stale_read,
            body,
            stale_read.snapshot,
            [proposal],
            now,
            True,
        )
    assert ended.value.status_code == 409


def test_official_operating_closure_filters_recommendation_and_conflicts_plan(
    travel_db,
):
    from zoneinfo import ZoneInfo

    from app.tides.service import OperatingWindow
    from app.tides.storage import register_window

    settings, client, places, _ = travel_db
    now = datetime.now(UTC) - timedelta(seconds=1)
    start = datetime.now(ZoneInfo("Asia/Seoul")).replace(
        hour=0, minute=0, second=0, microsecond=0
    )
    sid = places["isolated-onsen"]
    register_window(
        settings,
        OperatingWindow(
            window_id="isolated-closed",
            source_key="isolated-operation",
            spot_id=sid,
            activity="relax",
            start_at=start,
            end_at=start + timedelta(days=1),
            provider="ISOLATED_OFFICIAL",
            provider_record_id="closure-1",
            source_url="https://www.example.go.kr/closed",
            fetched_at=now,
            valid_until=now + timedelta(days=1),
            operating_status="closed",
            controls_status="restricted",
            scope="isolated registered place",
            reviewed_by="isolated-reviewer",
        ),
    )
    result = client.post(
        BASE + "/recommendations",
        json={"request": trip_request(), "preference": {"tags": ["온천"]}},
    ).json()
    assert sid not in [r["spot_id"] for r in result["recommendations"]]
    assert any(x["reason"] == "official_restriction" for x in result["excluded"])
    plan = client.post(
        BASE + "/plans/draft",
        json={
            "request": trip_request(),
            "stops": [
                {"item_id": "closed", "spot_id": sid, "day": trip_request()["dates"][0]}
            ],
        },
    ).json()
    assert plan["status"] == "conflict"
    assert any(c["code"] == "official_restriction" for c in plan["conflicts"])


def test_provider_tool_result_contract_uses_server_order_and_minimal_context(travel_db):
    import asyncio
    import json
    from types import SimpleNamespace

    from app.ai.budget import Admission
    from app.ai.chat import ChatRequest, converse
    from app.travel.chat import TravelToolSession

    settings, _, places, _ = travel_db
    settings = settings.model_copy(
        update={
            "ai_provider": "openai",
            "ai_api_key": SecretStr("isolated-provider-test-key"),
        }
    )
    body = ChatRequest(
        message="격리 지역에서 온천 추천해줘",
        travel={
            "request": trip_request()
            | {
                "origin": {
                    "label": "private-home",
                    "latitude": 37.123456789,
                    "longitude": 127.987654321,
                }
            },
            "preference": {"tags": ["온천"]},
        },
    )

    class Budget:
        acquire_request = staticmethod(lambda *args: Admission("test-lease"))
        reserve_attempt = staticmethod(
            lambda *args: SimpleNamespace(attempt_id="test-attempt")
        )
        record_usage = staticmethod(lambda *args: None)
        release_request = staticmethod(lambda *args: None)

    class Provider:
        calls = 0

        async def respond(self, payload):
            self.calls += 1
            serialized = json.dumps(payload)
            assert "private-home" not in serialized
            assert "37.123456789" not in serialized
            assert "traveller-a" not in serialized
            assert len(serialized.encode()) < settings.ai_max_input_bytes
            if self.calls == 1:
                return {
                    "status": "completed",
                    "output": [
                        {
                            "type": "function_call",
                            "call_id": "call-1",
                            "name": "travel_recommend",
                            "arguments": json.dumps({"changes": {}, "limit": 2}),
                        }
                    ],
                }
            output = next(
                x
                for x in reversed(payload["input"])
                if x.get("type") == "function_call_output"
            )
            result_id = json.loads(output["output"])["structured_id"]
            plan = {
                "intent": "explain",
                "clarification": None,
                "sections": [
                    {
                        "title": "recommendations",
                        "fact_ids": [],
                        "candidate_ids": [],
                        "structured_ids": [result_id],
                    }
                ],
            }
            return {
                "status": "completed",
                "output": [
                    {
                        "type": "message",
                        "content": [{"type": "output_text", "text": json.dumps(plan)}],
                    }
                ],
            }

    provider = Provider()
    response = asyncio.run(
        converse(
            settings,
            body,
            "traveller-a",
            provider,
            session_factory=lambda s, n: TravelToolSession(
                s, n, body=body, owner="traveller-a"
            ),
            budget_api=Budget,
        )
    )
    assert provider.calls == 2, response.reason_codes
    assert response.provider == "openai", response.reason_codes
    assert (
        response.travel_results["recommendations"]["recommendations"][0]["spot_id"]
        == places["isolated-onsen"]
    )
    assert "격리 온천" in response.answer


def test_keyword_search_hit_is_not_a_confirmed_beach(travel_db):
    settings, client, _, _ = travel_db
    store_batch(
        settings,
        SourceBatch(
            provider="KAKAO_LOCAL",
            fetched_at=datetime.now(UTC),
            places=[
                Place(
                    source_id="isolated-coffee",
                    name="격리 해수욕장점 카페",
                    kind="beach_search_result",
                    latitude=37.8,
                    longitude=128.9,
                    category="음식점 > 카페 > 커피전문점",
                    region="격리",
                ),
            ],
        ),
    )
    visit = client.post(
        BASE + "/recommendations", json={"request": trip_request()}
    ).json()
    assert not any("카페" in row["name"] for row in visit["recommendations"])
    meals = client.post(
        BASE + "/recommendations",
        json={"request": trip_request() | {"place_role": "meal"}},
    ).json()
    assert len(meals["recommendations"]) == 1
    assert meals["recommendations"][0]["confirmed"]["catalog_role"] == "meal"
    assert "해변" not in meals["recommendations"][0]["confirmed"]["catalog_tags"]


def test_candidate_scope_is_bounded_before_explainable_ranking(travel_db):
    settings, client, _, _ = travel_db
    store_batch(
        settings,
        SourceBatch(
            provider="TOURAPI_KOREAN",
            fetched_at=datetime.now(UTC),
            places=[
                Place(
                    source_id=f"bounded-{i}",
                    name=f"격리 범위 {i}",
                    kind="beach",
                    region="bounded-scope",
                    latitude=37.8,
                    longitude=128.9,
                )
                for i in range(350)
            ],
        ),
    )
    response = client.post(
        BASE + "/recommendations", json={"request": {"region": "bounded-scope"}}
    )
    assert response.status_code == 200, response.text
    result = response.json()
    scope = result["candidate_scope"]
    assert scope["matched_count"] == 350
    assert scope["scanned_count"] == scope["candidate_limit"] == 300
    assert scope["truncated"] is True
    assert scope["sql_page_size"] == 100
    assert len(result["recommendations"]) == 5


def test_v7_additive_travel_migration_preserves_real_collection_rows(travel_db):
    from app.schema import VERSION

    settings, _, _, _ = travel_db
    with connect(settings) as c:
        before = c.execute(
            "SELECT to_jsonb(p) FROM pongdang_data.collection_place p ORDER BY id"
        ).fetchall()
        for table in ("event", "session", "plan", "signal", "preference"):
            c.execute(f"DROP TABLE pongdang_data.travel_{table}")
        c.execute("UPDATE pongdang_data.schema_version SET version=7 WHERE id=1")
    assert initialize(settings)
    assert not initialize(settings)
    with connect(settings) as c:
        c.execute("SET TRANSACTION READ ONLY")
        assert (
            c.execute(
                "SELECT to_jsonb(p) FROM pongdang_data.collection_place p ORDER BY id"
            ).fetchall()
            == before
        )
        assert c.execute(
            "SELECT version FROM pongdang_data.schema_version"
        ).fetchone() == (VERSION,)
        assert c.execute(
            "SELECT count(*) FROM pongdang_data.travel_preference"
        ).fetchone() == (0,)


def test_saved_plan_chat_recalculates_without_implicit_save(travel_db):
    _, client, places, _ = travel_db
    request = trip_request()
    saved = client.post(
        BASE + "/plans",
        json={
            "request": request,
            "stops": [
                {
                    "item_id": "visit",
                    "spot_id": places["isolated-beach"],
                    "day": request["dates"][0],
                }
            ],
        },
    ).json()
    reply = client.post(
        "/api/data/ai/chat",
        json={
            "message": "내일 아이도 함께 가",
            "travel": {"plan_id": saved["plan_id"]},
        },
    )
    assert reply.status_code == 200, reply.text
    result = reply.json()["travel_results"]
    draft = result["draft_plan"]
    assert draft["request"]["companion_type"] == "children"
    assert draft["request"]["dates"] != saved["request"]["dates"]
    assert draft["input_stops"][0]["day"] == draft["request"]["dates"][0]
    assert draft["input_stops"][0]["spot_id"] == places["isolated-beach"]
    assert result["draft_base"]["saved"] is False
    assert client.get(BASE + "/plans/" + saved["plan_id"]).json() == saved


def test_data_query_failure_does_not_become_successful_empty_recommendations(
    travel_db, monkeypatch
):
    from fastapi import HTTPException

    from app.travel.catalog import Catalog

    _, client, _, _ = travel_db

    async def failed(*args):
        raise HTTPException(503, "isolated failure")

    monkeypatch.setattr(Catalog, "search", failed)
    response = client.post(BASE + "/recommendations", json={"request": trip_request()})
    assert response.status_code == 200
    assert response.json()["status"] == "query_failed"
    assert response.json()["selection_token"] is None


def test_future_trip_and_favorite_idempotency(travel_db):
    _, client, places, _ = travel_db
    request = trip_request()
    from datetime import date

    request["dates"] = [
        (date.fromisoformat(request["dates"][0]) + timedelta(days=60)).isoformat()
    ]
    result = client.post(BASE + "/recommendations", json={"request": request}).json()
    assert all(
        r["conditions"]["forecast_status"] == "outside_forecast_horizon"
        for r in result["recommendations"]
    )
    favorite = {
        "kind": "favorite",
        "action": "like",
        "spot_id": places["isolated-beach"],
    }
    first = client.post(BASE + "/signals", json=favorite).json()
    second = client.post(BASE + "/signals", json=favorite).json()
    assert first["id"] == second["id"]
    assert len(client.get(BASE + "/signals").json()["rows"]) == 1
