"""Published recommendation evidence, ordering and bounded database reads."""

import asyncio
from datetime import timedelta

import pytest
from fastapi import HTTPException
from test_condition_score import NOW, envelope, metric
from test_travel_rules import place

from app.config import Settings
from app.travel import published, storage
from app.travel.models import RecommendationInput, TravelPreference, TravelRequest
from app.travel.recommend import recommend
from app.water_index.activity_score import ActivityScore


def scored(sid, points, **changes):
    return envelope(
        spot_id=sid,
        condition_score=ActivityScore(
            status="evaluated",
            score=float(points),
            coverage=1.0,
            available_components=1,
            total_components=1,
            components=(),
            reason_codes=(),
            sources=(),
        ),
        **changes,
    )


class Catalog:
    def __init__(self, count=3):
        self.now = NOW
        self.reader = object()
        self.rows = [
            dict(place(sid), catalog_locale="ko", latitude=37.8, longitude=128.9)
            for sid in range(1, count + 1)
        ]

    async def search(self, request):
        return self.rows, {}

    async def restrictions(self, ids, request):
        return {sid: [] for sid in ids}

    async def conditions(self, *_):
        pytest.fail("Recommendations must not recalculate each candidate")


def settings():
    return Settings(
        _env_file=None,
        postgres_password="offline-test",
        sso_proxy_secret="offline-test-secret-more-than-32-characters",
    )


def run_recommend(monkeypatch, rows, *, request=None, preference=None, count=3):
    calls = []

    async def read(reader, queries, *, now):
        calls.append(queries)
        return [rows.get(q.spot_id, envelope(spot_id=q.spot_id)) for q in queries]

    monkeypatch.setattr(published, "read_condition_set", read)
    monkeypatch.setattr(storage, "signals", lambda *_: [])
    result = asyncio.run(
        recommend(
            settings(),
            "offline-owner",
            RecommendationInput(
                request=request or TravelRequest(),
                preference=preference or TravelPreference(),
            ),
            now=NOW,
            catalog=Catalog(count),
        )
    )
    return result, calls


def test_saved_scores_change_candidate_order_without_keyword_or_provider_calls(
    monkeypatch,
):
    result, calls = run_recommend(monkeypatch, {1: scored(1, 10), 2: scored(2, 90)})
    assert [r.spot_id for r in result.recommendations] == [2, 1, 3]
    assert len(calls) == 1 and len(calls[0]) == 6
    assert result.candidate_scope["ranking"]["model_used"] is False
    assert result.recommendations[0].conditions["ranking_score"] == 90
    assert "90" in result.recommendations[0].reason
    assert result.policy_version == "published-evidence.v3"


def test_mandatory_place_and_explicit_preferences_precede_score(monkeypatch):
    result, _ = run_recommend(
        monkeypatch,
        {1: scored(1, 0), 2: scored(2, 100)},
        request=TravelRequest(must_include=[1]),
    )
    assert result.recommendations[0].spot_id == 1
    assert result.recommendations[0].conditions["ranking_score"] == 0


def test_missing_partial_retained_not_ranked_as_zero_and_restriction_excludes(
    monkeypatch,
):
    partial = scored(1, 100)
    partial = partial.model_copy(
        update={
            "condition_score": partial.condition_score.model_copy(
                update={"status": "partial"}
            )
        }
    )
    retained = scored(2, 99, retained=True, retained_at=NOW)
    restricted = scored(
        3, 100, safety_status="restricted", restriction_refs=("closure:3",)
    )
    result, _ = run_recommend(monkeypatch, {1: partial, 2: retained, 3: restricted})
    assert [r.spot_id for r in result.recommendations] == [1, 2]
    assert all(r.conditions["ranking_score"] is None for r in result.recommendations)
    assert result.excluded[0]["reason"] == "official_restriction"
    assert result.excluded[0]["evidence"] == ["closure:3"]


def test_all_shortlist_reads_share_one_bounded_publication(monkeypatch):
    _, calls = run_recommend(monkeypatch, {}, count=80)
    assert len(calls) == 1 and len(calls[0]) == 60
    assert len({q.spot_id for q in calls[0]}) == 30


def test_forecast_date_does_not_use_current_observation(monkeypatch):
    calls = []

    async def read(_, queries, *, now):
        calls.extend(queries)
        return [
            envelope(spot_id=q.spot_id, mode="forecast", metrics=(), at=q.at)
            for q in queries
        ]

    monkeypatch.setattr(published, "read_condition_set", read)
    reader = published.PublishedEnvironmentReader(Catalog())
    target = NOW + timedelta(days=1)
    result = asyncio.run(reader.compare(1, TravelRequest(), target))
    assert len(calls) == 1 and calls[0].mode == "forecast"
    assert result["samples"][0]["at"] == target.isoformat().replace("+00:00", "Z")


def test_retained_measurements_do_not_claim_user_weather_match(monkeypatch):
    saved = envelope(
        metrics=(metric(relation="representative_station", mapping_id="reviewed"),),
        retained=True,
        retained_at=NOW,
    )

    async def read(_, queries, *, now):
        return [saved for _ in queries]

    monkeypatch.setattr(published, "read_condition_set", read)
    result = asyncio.run(
        published.PublishedEnvironmentReader(Catalog()).compare(
            1,
            TravelRequest(
                environment_preferences=[{"metric": "air_temperature", "minimum": 20}]
            ),
            NOW,
        )
    )
    assert result["preference_points"] is None
    assert result["criteria"][0]["status"] == "unknown"


def test_database_failure_remains_visible_without_raw_fallback(monkeypatch):
    async def read(*_, **__):
        raise HTTPException(503, "data_query_failed")

    monkeypatch.setattr(published, "read_condition_set", read)
    result = asyncio.run(
        published.PublishedEnvironmentReader(Catalog()).compare(1, TravelRequest(), NOW)
    )
    assert published.condition_summary(result)["status"] == "query_failed"
    assert published.ranking_score(result) is None


@pytest.mark.parametrize(
    "text, expected",
    [
        ("도보로 경로 추천해줘", "walking"),
        ("자전거로 경로 추천해줘", "cycling"),
        ("대중교통으로 추천해줘", "transit"),
        ("자동차로 추천해줘", "driving"),
        ("도보 말고 자전거", None),
        ("도보는 원하지 않아", None),
    ],
)
def test_explicit_chat_transport_does_not_guess_between_alternatives(text, expected):
    from app.travel.chat import explicit_transport

    assert explicit_transport(text) == expected


def test_chat_transport_patch_updates_old_keyword_selection():
    from app.travel.chat import RequestPatch, apply_patch
    from app.travel.keywords import normalize

    old = TravelRequest(
        transport="cycling",
        keyword_selection=[
            {"category": "transport", "values": ["cycling"]},
            {"category": "weather", "values": ["dry"]},
        ],
    )
    updated = apply_patch(old, RequestPatch(transport="walking"))
    assert normalize(updated).transport == "walking"
    assert old.keyword_selection[0].values == ["cycling"]
    assert updated.keyword_selection[1] == old.keyword_selection[1]
