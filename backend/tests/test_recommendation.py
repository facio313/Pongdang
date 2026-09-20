"""규칙표의 소프트웨어 검증. 사람 대상 결과 검증이 아닙니다.

`decide` 는 DB·시각 조회 없이 활동별 조건 응답만 받습니다. 그래서 규칙 한 줄당
한 케이스를 그대로 적을 수 있습니다.
"""

from datetime import timedelta

import pytest
from test_condition_score import NOW, envelope, metric

from app.water_index.activity_score import calculate_activity_score
from app.water_index.conditions import ConditionsEnvelope
from app.water_index.recommendation import (
    BEACH_AIR_C,
    IMMERSION_WATER_C,
    RULES,
    TIDE_MARGIN_MINUTES,
    Tide,
    decide,
)
from app.water_index.recommendation_api import (
    RecommendationQuery,
    tide_view,
)

WARM = 24.0
COLD = 12.0


def with_score(evidence: ConditionsEnvelope) -> ConditionsEnvelope:
    return evidence.model_copy(
        update={"condition_score": calculate_activity_score(evidence)}
    )


def scored(activity, **values) -> ConditionsEnvelope:
    """실제 계산 경로로 만든 조건 응답. 점수를 손으로 적지 않습니다."""
    metrics = tuple(metric(name, value) for name, value in values.items())
    return with_score(envelope(activity, metrics=metrics))


def beach(**overrides):
    """여름 해변의 다섯 활동. 필요한 활동만 덮어씁니다."""
    data = {
        "swim": scored(
            "swim",
            water_temperature=WARM,
            air_temperature=27.0,
            wave_height=0.2,
            wind_speed=3.0,
        ),
        "surf": scored(
            "surf",
            water_temperature=WARM,
            air_temperature=27.0,
            wave_height=0.2,
            wave_period=6.0,
            wind_speed=3.0,
        ),
        "relax": scored(
            "relax", air_temperature=27.0, relative_humidity=50.0, wind_speed=3.0
        ),
        # 해변에는 시설 욕조 수온도, 하천 관측소도 없습니다. 그것이 현실입니다.
        "onsen": scored("onsen", air_temperature=27.0),
        "rafting": scored("rafting", air_temperature=27.0, wind_speed=3.0),
    }
    return data | overrides


def codes(decision):
    return [reason.code for reason in decision.reasons]


def candidate(decision, activity):
    return next(c for c in decision.ranked if c.activity == activity)


def tide(phase, minutes):
    ahead = minutes >= 0
    return Tide(
        status="available",
        phase=phase,
        minutes_to_high=minutes if phase == "near_high" and ahead else 380,
        minutes_to_low=minutes if phase == "near_low" and ahead else 380,
        minutes_since_high=None if ahead else -minutes,
        minutes_since_low=None if ahead else -minutes,
        high_at=None,
        low_at=None,
        height=1.2,
        unit="m",
        station_name="Software fixture",
        spatial_relation="nearby_station_context",
        distance_km=2.0,
        reason_codes=("events_are_not_safe_activity_windows",),
    )


def test_every_rule_declares_where_its_threshold_came_from():
    assert {rule.basis for rule in RULES} <= {
        "score_curve_knot",
        "pongdang_product_rule",
        "data_contract",
    }
    tide_rule = next(rule for rule in RULES if rule.code == "tide_phase_product_rule")
    assert tide_rule.basis == "pongdang_product_rule"
    assert "안전 판정이 아닙니다" in tide_rule.text


def test_a_beach_never_recommends_rafting_or_onsen_on_weather_alone():
    decision = decide(beach())
    assert decision.choice.activity in {"swim", "surf"}
    for activity in ("rafting", "onsen"):
        entry = candidate(decision, activity)
        assert entry.dropped
        assert "essential_measurement_missing" in entry.rules_applied
    missing = [r.metric for r in decision.reasons if r.activity == "rafting"]
    assert "river_level" in missing


def test_cold_water_drops_sea_activities_and_asks_for_onsen_and_tourism():
    cold = beach(
        swim=scored(
            "swim",
            water_temperature=COLD,
            air_temperature=9.0,
            wave_height=0.2,
            wind_speed=3.0,
        ),
        surf=scored(
            "surf",
            water_temperature=COLD,
            air_temperature=9.0,
            wave_height=0.2,
            wave_period=6.0,
            wind_speed=3.0,
        ),
        relax=scored(
            "relax", air_temperature=9.0, relative_humidity=50.0, wind_speed=3.0
        ),
    )
    decision = decide(cold)
    assert candidate(decision, "swim").dropped
    assert candidate(decision, "surf").dropped
    cold_reason = next(
        r for r in decision.reasons if r.code == "water_too_cold_for_immersion"
    )
    assert cold_reason.value == COLD and cold_reason.threshold == IMMERSION_WATER_C
    air_reason = next(
        r for r in decision.reasons if r.code == "air_below_beach_preference"
    )
    assert air_reason.value == 9.0 and air_reason.threshold == BEACH_AIR_C
    assert decision.alternative_kinds[:3] == ("onsen", "meal", "visit")


def test_waves_choose_surfing_over_swimming_and_say_so():
    surfable = beach(
        swim=scored(
            "swim",
            water_temperature=WARM,
            air_temperature=27.0,
            wave_height=1.1,
            wind_speed=3.0,
        ),
        surf=scored(
            "surf",
            water_temperature=WARM,
            air_temperature=27.0,
            wave_height=1.1,
            wave_period=9.0,
            wind_speed=3.0,
        ),
    )
    decision = decide(surfable)
    assert decision.choice.activity == "surf"
    wave = next(r for r in decision.reasons if r.code == "wave_favours_surf")
    assert wave.value == 1.1 and wave.unit == "m"
    period = next(r for r in decision.reasons if r.code == "wave_period_context")
    assert period.value == 9.0


def test_calm_water_keeps_swimming_and_does_not_blame_the_waves():
    decision = decide(beach())
    assert decision.choice.activity == "swim"
    assert "wave_favours_swim" in codes(decision)
    assert "wave_favours_surf" not in codes(decision)


def test_a_higher_scoring_rest_does_not_outrank_a_swimmable_sea():
    decision = decide(beach())
    rest = candidate(decision, "relax")
    swim = candidate(decision, "swim")
    # 휴식은 보는 항목이 적어 점수가 더 높게 나옵니다. 그래도 1위가 아닙니다.
    assert rest.score > swim.score
    assert decision.choice.activity == "swim"
    preferred = next(
        r for r in decision.reasons if r.code == "water_activity_preferred"
    )
    assert preferred.activity == "swim" and preferred.rival == "relax"
    assert preferred.value == swim.score and preferred.threshold == rest.score


@pytest.mark.parametrize("phase,minutes", [("near_high", 40), ("near_low", -20)])
def test_the_tide_rule_defers_sea_activities_and_offers_a_valley(phase, minutes):
    decision = decide(beach(), place_kind="beach", tide=tide(phase, minutes))
    assert candidate(decision, "swim").demoted
    assert candidate(decision, "surf").demoted
    # 강등은 제외가 아닙니다. 점수는 그대로 남습니다.
    assert candidate(decision, "swim").score is not None
    assert not candidate(decision, "swim").dropped
    assert decision.choice.activity == "relax"
    reason = next(r for r in decision.reasons if r.code == "tide_phase_product_rule")
    assert reason.minutes == minutes
    assert reason.threshold == float(TIDE_MARGIN_MINUTES)
    assert "valley" in decision.alternative_kinds
    assert "events_are_not_safe_activity_windows" in decision.reason_codes


def test_a_tide_outside_the_margin_changes_nothing():
    decision = decide(beach(), place_kind="beach", tide=tide("rising", 200))
    assert decision.choice.activity == "swim"
    assert not candidate(decision, "swim").demoted
    assert "tide_phase_product_rule" not in codes(decision)


def test_an_official_restriction_produces_no_choice_and_no_recommendation():
    blocked = {
        activity: with_score(
            evidence.model_copy(update={"safety_status": "restricted"})
        )
        for activity, evidence in beach().items()
    }
    decision = decide(blocked)
    assert decision.choice is None
    assert all(c.dropped for c in decision.ranked)
    assert "no_water_activity_today" in codes(decision)


def test_resting_carries_somewhere_to_go_rather_than_sitting_by_the_water():
    only_relax = beach(
        swim=scored("swim", air_temperature=27.0),
        surf=scored("surf", air_temperature=27.0),
    )
    decision = decide(only_relax)
    assert decision.choice.activity == "relax"
    assert decision.alternative_kinds == ("meal", "visit")


def test_no_tide_evidence_means_no_tide_rule_not_a_favourable_default():
    assert tide_view([], NOW) is None
    assert tide_view([_event("high", 0, state="stale")], NOW) is None
    decision = decide(beach(), place_kind="beach", tide=None)
    assert "tide_phase_product_rule" not in codes(decision)


def _event(kind, minutes, state="available"):
    return {
        "kind": kind,
        "event_at": NOW + timedelta(minutes=minutes),
        "state": state,
        "height": 1.0,
        "unit": "m",
        "station_name": "Software fixture",
        "spatial_relation": "station_observation_point",
        "distance_km": None,
    }


def test_the_phase_reads_the_official_events_without_inventing_a_window():
    events = [
        _event("high", -380),
        _event("low", -20),
        _event("high", 340),
        _event("low", 700),
    ]
    view = tide_view(events, NOW)
    assert view.phase == "near_low"
    assert view.minutes_since_low == 20 and view.minutes_to_high == 340
    assert view.near_minutes() == -20
    assert "events_are_not_safe_activity_windows" in view.reason_codes
    # 극값에서 멀면 올라가는 중·내려가는 중까지만 말합니다.
    assert tide_view(events[:1] + events[2:], NOW).phase == "rising"


def test_the_query_rejects_an_activity_because_the_answer_is_the_activity():
    with pytest.raises(ValueError):
        RecommendationQuery(spot_id=1, activity="swim")
    assert RecommendationQuery(spot_id=1).mode == "observation"
    assert RecommendationQuery(spot_id=1).for_activity("surf").activity == "surf"
    with pytest.raises(ValueError):
        RecommendationQuery(spot_id=1, at="2026-01-02T00:00:00+00:00").times(
            NOW - timedelta(days=40)
        )
