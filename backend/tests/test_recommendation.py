"""규칙표의 소프트웨어 검증. 사람 대상 결과 검증이 아닙니다.

`decide` 는 DB·시각 조회 없이 활동별 조건 응답만 받습니다. 그래서 규칙 한 줄당
한 케이스를 그대로 적을 수 있습니다.
"""

from datetime import timedelta

import pytest
from test_condition_score import NOW, envelope, metric

from app.water_index.activity_score import calculate_activity_score
from app.water_index.conditions import ConditionsEnvelope
from app.water_index.models import RECOMMENDED_ACTIVITIES
from app.water_index.recommendation import (
    BEACH_AIR_C,
    IMMERSION_WATER_C,
    MODEL_VERSION,
    RULES,
    TIDE_MARGIN_MINUTES,
    Season,
    SeasonWindow,
    Tide,
    decide,
)
from app.water_index.recommendation_api import (
    Recommendation,
    RecommendationQuery,
    season_view,
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
    """여름 해변의 추천 후보 전부. 필요한 활동만 덮어씁니다.

    래프팅은 없습니다 -- 하천 수위·유량 자료가 없어 어떤 날도 점수가 나오지
    않으므로 후보 집합(models.RECOMMENDED_ACTIVITIES)에서 빠졌습니다. 필수 지표
    표(ESSENTIAL_METRICS)는 그대로 남아 있어, 호출자가 래프팅을 직접 넣어도
    기상만으로는 권하지 않습니다.
    """
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
        # 해변에는 시설 욕조 수온이 없습니다. 그것이 현실입니다.
        "onsen": scored("onsen", air_temperature=27.0),
        "rafting": scored("rafting", air_temperature=27.0, wind_speed=3.0),
        "walk": scored("walk", air_temperature=27.0),
    }
    return data | overrides


def codes(decision):
    return [reason.code for reason in decision.reasons]


def test_autumn_weather_can_choose_a_beach_walk_instead_of_swimming():
    data = beach(
        swim=scored(
            "swim",
            water_temperature=21.3,
            air_temperature=22.9,
            wind_speed=2.8,
            wave_height=0.3,
        ),
        walk=scored(
            "walk",
            air_temperature=22.9,
            relative_humidity=55.0,
            wind_speed=2.8,
            precipitation=0.0,
        ),
    )
    decision = decide(data, place_kind="beach", season=season("unconfirmed"))
    assert decision.choice.activity == "walk"
    assert decision.choice.score == 97.5
    assert candidate(decision, "swim").score == 75.6
    assert candidate(decision, "swim").needs_confirmation
    assert not candidate(decision, "swim").demoted
    assert "walking_weather_only" in codes(decision)


@pytest.mark.parametrize("missing", ["air_temperature", "wind_speed", "precipitation"])
def test_walking_never_treats_missing_weather_as_favourable(missing):
    values = {"air_temperature": 20.0, "wind_speed": 2.0, "precipitation": 0.0}
    del values[missing]
    decision = decide({"walk": scored("walk", **values)}, place_kind="valley")
    assert decision.choice is None
    assert candidate(decision, "walk").dropped
    assert any(r.metric == missing for r in decision.reasons)


def test_walks_do_not_inherit_swimming_permission_or_override_a_walking_closure():
    walking = scored("walk", air_temperature=20.0, wind_speed=2.0, precipitation=0.0)
    assert decide({"walk": walking}, place_kind="valley").choice.activity == "walk"
    blocked = with_score(walking.model_copy(update={"safety_status": "restricted"}))
    assert decide({"walk": blocked}, place_kind="valley").choice is None


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


def test_a_beach_never_recommends_onsen_or_legacy_rafting_on_weather_alone():
    decision = decide(beach())
    assert "rafting" not in {c.activity for c in decision.ranked}
    decision = decide(beach(), order=("onsen", "rafting"))
    assert decision.choice is None
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
    decision = decide(surfable, order=("swim", "surf"))
    assert decision.choice.activity == "surf"
    wave = next(r for r in decision.reasons if r.code == "wave_favours_surf")
    assert wave.value == 1.1 and wave.unit == "m"
    period = next(r for r in decision.reasons if r.code == "wave_period_context")
    assert period.value == 9.0


def test_calm_water_keeps_swimming_and_does_not_blame_the_waves():
    decision = decide(beach(), order=("swim", "surf"))
    assert decision.choice.activity == "swim"
    assert "wave_favours_swim" in codes(decision)
    assert "wave_favours_surf" not in codes(decision)


def test_a_higher_scoring_rest_can_outrank_a_swimmable_sea():
    decision = decide(beach())
    rest = candidate(decision, "relax")
    swim = candidate(decision, "swim")
    # 물 활동을 고정 우선하지 않고, 필수 근거가 있는 활동을 비교합니다.
    assert rest.score > swim.score
    assert decision.choice.activity == "relax"
    assert "condition_score_preferred" in codes(decision)
    assert "water_activity_preferred" not in codes(decision)


@pytest.mark.parametrize("phase,minutes", [("near_high", 40), ("near_low", -20)])
def test_the_tide_rule_defers_sea_activities_and_offers_a_valley(phase, minutes):
    """**휴식을 후보 집합에서 지우지 마세요.**

    휴식은 화면의 「활동별 점수」 목록에서 빠졌습니다
    (frontend aiApi.listedActivities) -- 점수 항목이 적어 거의 항상 1위인데
    위에서는 수영을 권해 모순으로 읽혔기 때문입니다. 그래도 고르기 경쟁에는
    남아 있어야 합니다. 여기서 휴식이 없으면 미뤄진 수영이 그대로 1위가 되고,
    히어로가 물때 구간 한가운데에서 「오늘 가장 좋은 활동 = 수영」을 말합니다.
    """
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
    assert decision.choice == decide(beach(), place_kind="beach").choice
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


def season(status, **overrides):
    """개장 기간 판정. 구간은 2024년 7~8월(지난 연도 표기)을 기본으로 둡니다."""
    return Season(
        status=status,
        windows=()
        if status == "unconfirmed"
        else (
            SeasonWindow(
                start_month=7,
                start_day=12,
                end_month=8,
                end_day=18,
                precision="day",
                year=2024,
            ),
        ),
        source_field=None if status == "unconfirmed" else "opening_period",
        raw=None if status == "unconfirmed" else "2024.07.12~2024.08.18",
        evaluated_on="2026-10-02",
        year_basis=None if status == "unconfirmed" else "past_year",
        stale_years=None if status == "unconfirmed" else 2,
        reason_codes=("opening_period_unparsed",)
        if status == "unconfirmed"
        else (
            "opening_period_is_not_an_official_schedule",
            "opening_period_from_past_year",
        ),
        **overrides,
    )


def test_a_beach_outside_its_opening_period_does_not_lead_with_swimming():
    closed = decide(beach(), place_kind="beach", season=season("out_of_season"))
    assert closed.choice is not None
    # 수영만 미루며, 남은 활동은 물 활동 우선 없이 점수로 비교합니다.
    assert closed.choice.activity == "relax"
    swim = candidate(closed, "swim")
    assert swim.demoted is True
    # **후보에서 지우지 않습니다** -- 수온·파고 점수와 그 근거는 계속 보입니다.
    assert swim.dropped is False
    assert swim.score is not None
    assert "beach_closed_season_product_rule" in swim.rules_applied
    assert "beach_closed_season_product_rule" in closed.reason_codes
    assert candidate(closed, "surf").demoted is False
    # 지난 연도 표기였다는 사실이 사유 코드로 함께 옵니다.
    assert "opening_period_from_past_year" in closed.reason_codes
    # 미뤄진 수영은 가장 뒤로 갑니다.
    order = [c.activity for c in closed.ranked]
    assert order  # ranked 는 조회 순서를 그대로 둡니다
    assert closed.choice.activity != "swim"


def test_a_closed_beach_without_surfing_rests_and_offers_somewhere_to_go():
    # 파고 자료가 없으면 서핑은 필수 지표 부족으로 빠집니다.
    no_waves = beach(
        surf=scored("surf", water_temperature=WARM, air_temperature=27.0),
    )
    closed = decide(no_waves, place_kind="beach", season=season("out_of_season"))
    assert closed.choice is not None
    assert closed.choice.activity == "relax"
    assert candidate(closed, "swim").demoted is True
    assert set(closed.alternative_kinds) >= {"meal", "visit"}
    # 계절이 닫힌 날에 계곡을 권하지 않습니다 -- 계곡도 같은 계절을 지납니다.
    assert "valley" not in closed.alternative_kinds


def test_being_inside_the_opening_period_changes_nothing():
    inside = decide(beach(), place_kind="beach", season=season("in_season"))
    plain = decide(beach(), place_kind="beach")
    assert inside.choice == plain.choice
    assert [c.model_dump() for c in inside.ranked] == [
        c.model_dump() for c in plain.ranked
    ]
    assert "beach_closed_season_product_rule" not in inside.reason_codes


def test_an_unconfirmed_opening_period_defers_swimming_but_keeps_its_score():
    """미확인은 폐장 판정이 아니지만 수영을 1순위로 권할 근거도 아닙니다."""
    unknown = decide(beach(), place_kind="beach", season=season("unconfirmed"))
    plain = decide(beach(), place_kind="beach")
    assert unknown.choice == plain.choice
    swim = candidate(unknown, "swim")
    assert swim.demoted is False
    assert swim.needs_confirmation is True
    assert swim.score == candidate(plain, "swim").score
    assert not swim.dropped
    assert "beach_season_unconfirmed" in swim.rules_applied
    assert "beach_season_unconfirmed" in unknown.reason_codes


def test_year_round_beach_access_does_not_confirm_a_swimming_season():
    row = {"opening_period": "연중", "opening_date": None}
    view = season_view(row, NOW, place_kind="beach")
    assert view.status == "unconfirmed"
    assert view.windows == ()
    assert "beach_year_round_wording_is_not_an_opening_season" in view.reason_codes
    assert season_view(row, NOW).status == "in_season"


def test_no_season_evidence_applies_no_season_rule():
    plain = decide(beach(), place_kind="beach", season=None)
    assert candidate(plain, "swim").demoted is False
    assert not [c for c in codes(plain) if c.startswith("beach_")]


def test_cold_water_drops_swimming_rather_than_merely_deferring_it():
    cold = beach(
        swim=scored(
            "swim",
            water_temperature=COLD,
            air_temperature=15.0,
            wave_height=0.2,
            wind_speed=3.0,
        ),
    )
    closed = decide(cold, place_kind="beach", season=season("out_of_season"))
    swim = candidate(closed, "swim")
    # 수온으로 이미 빠진 활동에 계절 규칙을 덧붙이지 않습니다. 빠진 것과
    # 미뤄진 것은 다른 사실이고, 두 사유가 겹쳐 보이면 어느 쪽인지 흐려집니다.
    assert swim.dropped is True
    assert "water_too_cold_for_immersion" in swim.rules_applied
    assert "beach_closed_season_product_rule" not in swim.rules_applied


def test_a_tide_window_and_a_closed_season_both_stay_on_the_record():
    closed = decide(
        beach(),
        place_kind="beach",
        tide=tide("near_high", 10),
        season=season("out_of_season"),
    )
    swim = candidate(closed, "swim")
    assert swim.demoted is True
    assert "tide_phase_product_rule" in swim.rules_applied
    assert "beach_closed_season_product_rule" in swim.rules_applied
    # 물때 대안(계곡)은 물때 규칙이 넣은 것이므로 그대로 남습니다.
    assert "valley" in closed.alternative_kinds


def test_surfing_is_untouched_by_the_beach_opening_period():
    closed = decide(beach(), place_kind="beach", season=season("out_of_season"))
    surf = candidate(closed, "surf")
    assert surf.demoted is False
    assert not [rule for rule in surf.rules_applied if rule.startswith("beach_")]


def test_a_season_deferred_swim_is_not_what_the_waves_chose():
    """파도는 아무것도 고르지 않았고 달력이 골랐습니다."""
    closed = decide(
        beach(),
        place_kind="beach",
        season=season("out_of_season"),
        order=("swim", "surf"),
    )
    assert closed.choice is not None and closed.choice.activity == "surf"
    assert "wave_favours_surf" not in codes(closed)


def test_an_inland_place_ignores_a_beach_opening_period():
    inland = {
        "swim": scored(
            "swim",
            water_temperature=WARM,
            air_temperature=27.0,
            wave_height=0.2,
            wind_speed=3.0,
        ).model_copy(update={"place_kind": "valley", "support_status": "supported"}),
        "relax": scored(
            "relax", air_temperature=27.0, relative_humidity=50.0, wind_speed=3.0
        ),
    }
    decision = decide(inland, place_kind="valley", season=season("out_of_season"))
    assert candidate(decision, "swim").demoted is False
    assert "beach_closed_season_product_rule" not in decision.reason_codes


def test_the_response_contract_serialises_with_the_current_model_version():
    """응답 모델까지 조립해 봅니다.

    예전에는 `MODEL_VERSION` 만 «1.1.0» 으로 올라가고 응답 모델의
    `Literal["1.0.0"]` 이 그대로 남아, `Record` 의 `validate_default=True` 가
    기본값을 검사하면서 **추천 응답이 통째로 500** 이었습니다. 이 파일의 다른
    테스트는 `decide()` 만 보기 때문에 전부 통과하면서 그 결함을 놓쳤습니다.
    """
    envelopes = beach()
    decision = decide(envelopes, place_kind="beach")
    response = Recommendation(
        spot_id=1,
        place_name="Software fixture",
        place_kind="beach",
        at=NOW,
        as_of=NOW,
        mode="observation",
        choice=decision.choice,
        ranked=decision.ranked,
        reasons=decision.reasons,
        tide=None,
        alternatives=(),
        conditions=tuple(envelopes[a] for a in RECOMMENDED_ACTIVITIES),
        reason_codes=decision.reason_codes,
    )
    dumped = response.model_dump()
    assert dumped["model_version"] == MODEL_VERSION
    assert dumped["contract_version"] == "water-recommendation.v1"
    assert dumped["scientific_validation"] == "not_evaluated"


def test_the_query_rejects_an_activity_because_the_answer_is_the_activity():
    with pytest.raises(ValueError):
        RecommendationQuery(spot_id=1, activity="swim")
    assert RecommendationQuery(spot_id=1).mode == "observation"
    assert RecommendationQuery(spot_id=1).for_activity("surf").activity == "surf"
    with pytest.raises(ValueError):
        RecommendationQuery(spot_id=1, at="2026-01-02T00:00:00+00:00").times(
            NOW - timedelta(days=40)
        )
