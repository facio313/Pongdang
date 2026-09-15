"""Two-stage contract, actual normalized SQL evidence and bounded route optimizer."""

import asyncio
import copy
from datetime import UTC, datetime, timedelta

import httpx
import pytest
from pydantic import ValidationError
from test_travel_integration import BASE, HEADERS
from test_travel_integration import travel_db as _travel_db

from app.ai.chat import ChatRequest
from app.ai.tools import ToolError
from app.config import Settings
from app.travel import keywords, storage, tokens
from app.travel.catalog import KST, Catalog
from app.travel.chat import TravelToolSession, explicit_route
from app.travel.directions import DirectionError, KakaoDirections, parse
from app.travel.environment import EnvironmentReader
from app.travel.models import TravelRequest
from app.travel.routing import RouteRecommendationInput, recommend_route

travel_db = _travel_db


def settings():
    return Settings(
        _env_file=None,
        postgres_password="isolated",
        sso_proxy_secret="isolated-route-secret-at-least-32-characters",
        kakao_rest_key="isolated-key",
    )


@pytest.mark.parametrize(
    "selection",
    [
        [{"category": "fake", "values": ["anything"]}],
        [{"category": "weather", "values": ["safe"]}],
        [{"category": "companion", "values": ["solo", "children"]}],
        [{"category": "activity", "values": ["surf", "surf"]}],
        [{"category": "weather", "values": ["dry"]}] * 2,
    ],
)
def test_keyword_contract_rejects_unknown_ambiguous_selections(selection):
    with pytest.raises(ValidationError):
        TravelRequest(keyword_selection=selection)


def test_presets_are_visible_explicit_bounds_and_do_not_mutate_form():
    body = TravelRequest(
        keyword_selection=[
            {"category": "weather", "values": ["dry", "mild"]},
            {"category": "companion", "values": ["children"]},
        ]
    )
    normalized = keywords.normalize(body)
    assert normalized.companion_type == "children"
    assert [(p.metric, p.maximum) for p in normalized.environment_preferences] == [
        ("precipitation", 0),
        ("air_temperature", 26),
    ]
    assert body.environment_preferences == []
    assert body.preferred_tags == []
    changed = body.model_copy(update={"keyword_selection": []})
    assert keywords.normalize(changed).environment_preferences == []
    assert keywords.catalogue()["environment_meaning"].endswith("not_safety_thresholds")


@pytest.mark.parametrize(
    "message, action, allowed",
    [
        ("장소와 활동 추천해줘", "conversation", False),
        ("경로 말고 장소 목록만", "conversation", False),
        ("경로는 나중에", "conversation", False),
        ("이제 경로 추천해줘", "conversation", True),
        ("선택 후보를 보여줘", "route", True),
        ("경로 추천", "recommend", False),
    ],
)
def test_route_stage_requires_explicit_user_request(message, action, allowed):
    body = ChatRequest(message=message, travel={"action": action})
    assert explicit_route(body) is allowed
    if not allowed:
        session = TravelToolSession(settings(), datetime.now(UTC), body=body, owner="a")
        with pytest.raises(ToolError, match="route_requires_separate_explicit_request"):
            asyncio.run(session.execute("travel_route", {}))


def provider_data():
    return {
        "trans_id": "isolated-route-id",
        "routes": [
            {
                "result_code": 0,
                "summary": {"distance": 1000, "duration": 600, "fare": {"toll": 0}},
                "sections": [
                    {"roads": [{"vertexes": [128, 37, 128.1, 37.1, 128, 37]}]}
                ],
            }
        ],
    }


def test_official_adapter_future_time_units_geometry_and_private_headers():
    now = datetime.now(UTC)
    departure = now + timedelta(hours=1)

    async def handler(request):
        assert request.url.host == "apis-navi.kakaomobility.com"
        assert request.url.path == "/v1/future/directions"
        assert request.url.params["origin"] == "128,37"
        assert request.url.params["departure_time"] == departure.astimezone(
            KST
        ).strftime("%Y%m%d%H%M")
        assert request.headers["Authorization"] == "KakaoAK isolated-key"
        return httpx.Response(200, json=provider_data())

    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            adapter = KakaoDirections(settings(), now, client=client)
            return await adapter.leg(
                {"longitude": 128, "latitude": 37},
                {"longitude": 128.1, "latitude": 37.1},
                departure,
                geometry=True,
            )

    result = asyncio.run(run())
    assert result["duration_seconds"] == 600
    assert len(result["polyline"]) == 3  # A looping road must not lose repeated points.
    assert result["toll_krw"] == 0
    assert "isolated-key" not in str(result)


@pytest.mark.parametrize(
    "change",
    ["failure", "missing_duration", "negative_duration", "missing_id", "odd_geometry"],
)
def test_adapter_rejects_missing_or_invalid_evidence(change):
    data = provider_data()
    if change == "failure":
        data["routes"][0]["result_code"] = 1
    if change == "missing_duration":
        del data["routes"][0]["summary"]["duration"]
    if change == "negative_duration":
        data["routes"][0]["summary"]["duration"] = -1
    if change == "missing_id":
        del data["trans_id"]
    if change == "odd_geometry":
        data["routes"][0]["sections"][0]["roads"][0]["vertexes"].append(128)
    with pytest.raises((DirectionError, KeyError)):
        parse(data, datetime.now(UTC), datetime.now(UTC), True, True)


def test_adapter_stops_after_authentication_failure_and_does_not_echo_body():
    calls = []

    async def handler(request):
        calls.append(request)
        return httpx.Response(401, json={"msg": "private upstream text"})

    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            adapter = KakaoDirections(settings(), datetime.now(UTC), client=client)
            for _ in range(2):
                with pytest.raises(
                    DirectionError, match="authentication_failed"
                ) as failure:
                    await adapter.leg(
                        {"longitude": 128, "latitude": 37},
                        {"longitude": 129, "latitude": 38},
                        datetime.now(UTC),
                    )
                assert "private upstream text" not in str(failure.value)

    asyncio.run(run())
    assert len(calls) == 1


def add_weather(settings, place_ids, *, future=False):
    from test_condition_score_integration import source

    from app.ingestion.models import Value
    from app.ingestion.storage import store_batch
    from app.schema import connect
    from app.water_index.sources import (
        EvidenceBundle,
        StationMapping,
        register_evidence,
    )

    now = datetime.now(UTC)
    at = (
        (now + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
        if future
        else now - timedelta(minutes=10)
    )
    for index, sid in enumerate(place_ids):
        station_code = f"weather-for-{sid}"
        store_batch(
            settings,
            source(
                source_id=f"reading-for-{sid}",
                station_id=station_code,
                observed_at=at,
                fetched_at=now,
                issued_at=now - timedelta(minutes=1) if future else None,
                valid_until=at + timedelta(hours=12),
                mode="forecast" if future else "observation",
                values=[
                    Value(
                        name="air_temperature",
                        numeric_value=22 if index == 1 else 34,
                        unit="degC",
                    ),
                    Value(
                        name="precipitation",
                        numeric_value=0 if index == 1 else 8,
                        unit="mm/1h",
                    ),
                    Value(
                        name="wave_height",
                        numeric_value=0.2 if index == 1 else 2,
                        unit="m",
                    ),
                ],
            ),
        )
        with connect(settings) as c:
            station = c.execute(
                "SELECT id FROM pongdang_data.collection_station WHERE source_id=%s",
                [station_code],
            ).fetchone()[0]
        register_evidence(
            settings,
            EvidenceBundle(
                mappings=[
                    StationMapping(
                        mapping_id=f"isolated-map-{sid}",
                        spot_id=sid,
                        station_id=station,
                        spatial_scope="Isolated test mapping only",
                        mapping_version="test",
                        evidence_ref="test-evidence",
                        source_url="https://www.weather.go.kr/test",
                        authority="test authority",
                        reviewed_by="test",
                        activities=("relax",),
                        valid_from=now - timedelta(hours=1),
                        valid_until=at + timedelta(hours=13),
                    )
                ]
            ),
        )
    return at


def test_keyword_recommendation_uses_actual_sql_weather_before_ranking(
    travel_db, monkeypatch
):
    s, client, places, _ = travel_db
    ids = [places["isolated-beach"], places["isolated-onsen"]]
    add_weather(s, ids)

    async def forbid_routes(*args, **kwargs):
        pytest.fail("Stage one must not call directions")

    monkeypatch.setattr(KakaoDirections, "leg", forbid_routes)
    request = {
        "keyword_selection": [
            {"category": "weather", "values": ["mild", "dry", "small_waves"]}
        ]
    }
    response = client.post(BASE + "/recommendations", json={"request": request})
    assert response.status_code == 200, response.text
    result = response.json()
    assert result["stage"] == "places_activities"
    assert result["route_calculated"] is False
    assert result["recommendations"][0]["spot_id"] == ids[1]
    assert result["recommendations"][0]["environment_match"]["preference_points"] == 100
    assert result["recommendations"][1]["environment_match"]["preference_points"] == 0
    assert result["recommendations"][0]["activities"][0]["status"] == "unverified"
    assert result["request"]["environment_preferences"] == []
    changed = copy.deepcopy(request)
    changed["keyword_selection"] = []
    again = client.post(BASE + "/recommendations", json={"request": changed}).json()
    assert again["recommendations"][0]["spot_id"] == min(ids)
    assert client.get(BASE + "/keywords").json()["version"] == "travel-keywords.v1"


def test_future_environment_uses_forecast_and_never_current_observation(travel_db):
    s, _, places, _ = travel_db
    ids = [places["isolated-beach"], places["isolated-onsen"]]
    at = add_weather(s, ids, future=True)
    request = keywords.normalize(
        TravelRequest(
            keyword_selection=[
                {"category": "weather", "values": ["mild", "dry", "small_waves"]}
            ]
        )
    )
    reader = EnvironmentReader(Catalog(s, datetime.now(UTC)))
    result = asyncio.run(
        reader.compare(
            ids[1], request, at + timedelta(minutes=20), at + timedelta(minutes=50)
        )
    )
    assert result["preference_points"] == 100
    assert all(sample["mode"] == "forecast" for sample in result["samples"])
    expired = asyncio.run(reader.compare(ids[1], request, at + timedelta(days=60)))
    assert expired["preference_points"] is None


class RoutesFixture:
    status = "configured"

    def __init__(self):
        self.calls = []

    async def leg(self, origin, destination, departure, *, geometry=False):
        self.calls.append((origin["latitude"], destination["latitude"], geometry))
        return {
            "duration_seconds": 600,
            "distance_m": 1000,
            "toll_krw": 0,
            "polyline": [],
            "source_record_id": "test-route",
            "fetched_at": departure.isoformat(),
        }


class EnvironmentFixture:
    def __init__(self, preferred_id, *, missing=False):
        self.preferred_id, self.missing = preferred_id, missing

    async def compare(self, sid, request, start, until=None):
        points = (
            100 if sid == self.preferred_id and start.astimezone(KST).hour < 10 else 0
        )
        return {
            "preference_points": None if self.missing else points,
            "status": "incomplete" if self.missing else "evaluated",
        }


def test_route_optimizer_changes_order_with_arrival_weather_and_preserves_owner(
    travel_db,
):
    s, client, places, _ = travel_db
    ids = [places["isolated-beach"], places["isolated-onsen"]]
    now = datetime.now(UTC)
    day = (now.astimezone(KST) + timedelta(days=1)).date()
    request = TravelRequest(
        dates=[day],
        origin={"label": "private home", "latitude": 37.5, "longitude": 128.5},
        departure_time="09:00",
        return_by="18:00",
        environment_preferences=[
            {"metric": "air_temperature", "minimum": 18, "maximum": 26}
        ],
    )
    token = tokens.encode(s, "traveller-a", request, ids, now)
    body = RouteRecommendationInput(
        selection_token=token, stop_count=2, include_geometry=False
    )
    routes = RoutesFixture()
    result = asyncio.run(
        recommend_route(
            s,
            "traveller-a",
            body,
            now=now,
            directions=routes,
            environment=EnvironmentFixture(ids[1]),
        )
    )
    assert result["route"]["spot_ids"] == [ids[1], ids[0]]
    assert result["route"]["travel_minutes"] == 30
    assert result["candidate_scope"]["orders_considered"] == 2
    assert len(routes.calls) == 6
    assert result["saved"] is False
    missing = asyncio.run(
        recommend_route(
            s,
            "traveller-a",
            body,
            now=now,
            directions=RoutesFixture(),
            environment=EnvironmentFixture(ids[1], missing=True),
        )
    )
    assert missing["route"]["objective_value"] is None
    assert missing["optimality"].startswith("provisional")
    other = HEADERS | {"x-pongdang-sso-subject": "traveller-b"}
    assert (
        client.post(
            BASE + "/routes/recommend", headers=other, json=body.model_dump(mode="json")
        ).status_code
        == 422
    )
    assert storage.plans(s, "traveller-a") == []


def test_public_two_stage_chat_route_and_unconfigured_state(travel_db, monkeypatch):
    s, client, places, _ = travel_db
    day = (datetime.now(KST) + timedelta(days=1)).date()
    request = {
        "dates": [day.isoformat()],
        "origin": {"label": "home", "latitude": 37.5, "longitude": 128.5},
        "departure_time": "09:00",
    }
    first = client.post(BASE + "/recommendations", json={"request": request}).json()
    assert first["route_calculated"] is False
    from app.travel import routing

    monkeypatch.setattr(routing, "KakaoDirections", lambda *args: RoutesFixture())
    chat = client.post(
        "/api/data/ai/chat",
        json={
            "message": "이제 경로 추천해줘",
            "travel": {
                "request": request,
                "selection_token": first["selection_token"],
                "action": "route",
            },
        },
    )
    assert chat.status_code == 200, chat.text
    result = chat.json()["travel_results"]["route_recommendation"]
    assert result["route_calculated"] is True
    assert set(result["route"]["spot_ids"]) == {
        places["isolated-beach"],
        places["isolated-onsen"],
    }
    assert "예상값" in chat.json()["answer"]
    s.travel_route_provider = "disabled"
    monkeypatch.setattr(routing, "KakaoDirections", KakaoDirections)
    direct = client.post(
        BASE + "/routes/recommend", json={"selection_token": first["selection_token"]}
    ).json()
    assert direct["route_calculated"] is False
    assert direct["status"] == "disabled"


def test_initial_list_cannot_expand_to_route_or_itinerary_in_same_model_turn():
    body = ChatRequest(message="경로도 추천해줘", travel={})
    session = TravelToolSession(settings(), datetime.now(UTC), body=body, owner="a")
    session.travel_context.selection_token = "token-created-during-this-turn"
    with pytest.raises(ToolError, match="recommendation_selection_required"):
        asyncio.run(session.execute("travel_route", {}))
    body = ChatRequest(message="추천 목록", travel={"action": "recommend"})
    session = TravelToolSession(settings(), datetime.now(UTC), body=body, owner="a")
    with pytest.raises(ToolError, match="itinerary_requires_explicit_request"):
        asyncio.run(session.execute("travel_draft", {"rank": 1}))


def test_selected_place_category_filters_before_candidate_cap(travel_db):
    from app.ingestion.models import Place, SourceBatch
    from app.ingestion.storage import store_batch

    s, client, _, _ = travel_db
    now = datetime.now(UTC) - timedelta(seconds=1)
    places = [
        Place(
            source_id=f"cap-beach-{i}",
            name=f"Beach {i}",
            kind="beach",
            region="cap-test",
            latitude=37.5,
            longitude=128.5,
        )
        for i in range(350)
    ]
    places.append(
        Place(
            source_id="late-onsen",
            name="Late registered onsen",
            kind="onsen",
            region="cap-test",
            latitude=37.5,
            longitude=128.5,
        )
    )
    store_batch(
        s, SourceBatch(provider="TOURAPI_KOREAN", fetched_at=now, places=places)
    )
    response = client.post(
        BASE + "/recommendations",
        json={
            "request": {
                "region": "cap-test",
                "keyword_selection": [
                    {"category": "place_type", "values": ["hot_spring"]}
                ],
            }
        },
    )
    assert response.status_code == 200, response.text
    result = response.json()
    assert result["recommendations"][0]["name"] == "Late registered onsen"
    assert result["candidate_scope"]["matched_count"] == 1
