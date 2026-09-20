"""활동 선택 규칙. 점수를 다시 매기지 않고 «왜 이 활동인가»만 정합니다.

`activity_score.py` 가 활동별 점수를 매기고, 이 모듈은 그 결과들을 **비교**해
하나를 고릅니다. 점수를 재계산하거나, 결측을 0으로 메우거나, 활동 간 공통
효용 척도를 만들지 않습니다 -- 고르는 근거는 전부 이미 계산된 component 값과
여기 적힌 규칙표입니다.

한국어 문장은 만들지 않습니다. 코드와 수치만 내리고, 문구는 프론트엔드의 사전
한 곳(`recommendationText.ts`)에 모읍니다. 같은 사유가 화면마다 다른 말로
보이지 않게 하려는 것입니다.

안전 판정이 아닙니다. 공식 통제(`safety_status="restricted"`)와 활동 미지원은
이 규칙보다 먼저 적용되며, 이 모듈이 그것을 뒤집지 않습니다.
"""

from typing import TYPE_CHECKING, Literal

from pydantic import Field

from app.water_index.activity_score import BEACH_AIR, SURF_WAVE, SWIM_WAVE, WATER
from app.water_index.models import RECOMMENDED_ACTIVITIES, Activity, Number, Record

if TYPE_CHECKING:
    from app.water_index.conditions import ConditionsEnvelope

CONTRACT = "water-recommendation.v1"
MODEL_ID = "pongdang-activity-recommendation"
MODEL_VERSION = "1.0.0"

#: 바다에 들어가는 활동. 물때·수온 규칙이 이 둘에만 적용됩니다.
SEA_ACTIVITIES: tuple[Activity, ...] = ("swim", "surf")

#: 물에 들어가는 활동. 이쪽이 가능하면 이쪽을 먼저 권합니다 -- 퐁당은 물놀이
#: 앱이고, 휴식·온천은 물에 못 들어갈 때의 답이기 때문입니다.
#:
#: 이 구분이 없으면 휴식이 거의 항상 1위가 됩니다. 휴식의 점수 항목은 기온 ·
#: 습도 · 바람 · 강수뿐이라 날씨만 좋으면 만점에 가깝고, 수영은 수온 · 파고까지
#: 보기 때문에 같은 날 늘 몇 점 낮습니다. 점수가 높은 쪽이 아니라 **물에
#: 들어갈 수 있으면 물**입니다.
WATER_ACTIVITIES: tuple[Activity, ...] = ("swim", "surf", "rafting", "mudflat")

#: 활동마다 «이것이 없으면 그 활동을 말할 수 없는» 지표. 각 묶음에서 하나
#: 이상이 실제로 점수화(`evaluated`)돼야 후보가 됩니다.
#:
#: 이 표가 없으면 해변에서 래프팅이 1위로 올라옵니다 -- 래프팅은 하천 수위 ·
#: 유량 곡선이 미설정이라 기상 항목만으로 부분 점수가 나오기 때문입니다
#: (activity_score.DEFAULT_CURVES). 기상만 좋으면 바다에서 래프팅을 권하는
#: 셈이므로, 활동을 정의하는 지표를 명시적으로 요구합니다.
ESSENTIAL_METRICS: dict[Activity, tuple[tuple[str, ...], ...]] = {
    "swim": (("water_temperature",), ("wave_height",)),
    "surf": (("water_temperature",), ("wave_height",)),
    "relax": (("air_temperature",),),
    "mudflat": (("air_temperature",),),
    "onsen": (("bath_water_temperature",),),
    "rafting": (("river_level", "river_flow"),),
}

#: 입수 가능 수온의 하한. WATER 곡선의 18°C 절점(40점)을 그대로 씁니다 --
#: 추천을 위해 새 숫자를 만들지 않기 위해서입니다.
IMMERSION_WATER_C = 18.0
#: 해변 방문 선호 기온의 하한. BEACH_AIR 곡선의 21°C 절점(0점)입니다. 이
#: 값만으로 활동을 빼지는 않고(아침 20°C 에 수온 24°C 인 날이 있습니다)
#: 문장에 함께 싣습니다.
BEACH_AIR_C = 21.0
#: 만조·간조 전후 몇 분을 «물때 구간»으로 볼지. **퐁당 제품 규칙이며 검증된
#: 기준이 아닙니다.** 공식 운영시간·안전 타이머가 아닙니다.
TIDE_MARGIN_MINUTES = 60

TidePhase = Literal["near_high", "near_low", "rising", "falling", "unknown"]
AlternativeKind = Literal["valley", "onsen", "meal", "visit"]


class Rule(Record):
    code: str
    text: str
    #: 임계값이 어디서 왔는지. 점수 곡선 절점(논문 참고 구간에서 유래)과
    #: 검증되지 않은 퐁당 제품 규칙을 구분합니다.
    basis: Literal["score_curve_knot", "pongdang_product_rule", "data_contract"]


RULES: tuple[Rule, ...] = (
    Rule(
        code="activity_blocked",
        text=(
            "공식 제한·활동 미지원이거나 점수를 낼 근거가 없는 활동은 "
            "후보에서 뺍니다. 점수가 낮은 것이 아니라 판단 자체를 하지 않습니다."
        ),
        basis="data_contract",
    ),
    Rule(
        code="essential_measurement_missing",
        text=(
            "활동을 정의하는 지표가 없으면 후보에서 뺍니다. 바다 수영·서핑은 "
            "수온과 파고, 온천은 시설 욕조 수온, 래프팅은 하천 수위 또는 유량이 "
            "있어야 합니다. 기상 자료만으로 그 활동을 권하지 않습니다."
        ),
        basis="data_contract",
    ),
    Rule(
        code="water_too_cold_for_immersion",
        text=(
            f"수온이 {IMMERSION_WATER_C:g}°C 아래면 바다 수영·서핑을 권하지 "
            "않습니다. 점수 곡선의 수온 절점을 그대로 쓴 값이며, 입수 허가 "
            "기준이 아닙니다."
        ),
        basis="score_curve_knot",
    ),
    Rule(
        code="air_below_beach_preference",
        text=(
            f"기온이 {BEACH_AIR_C:g}°C 아래면 해변 방문 선호 구간 밖입니다. "
            "이 사실만으로 활동을 빼지는 않고 근거 문장에 함께 싣습니다."
        ),
        basis="score_curve_knot",
    ),
    Rule(
        code="tide_phase_product_rule",
        text=(
            f"만조·간조 전후 {TIDE_MARGIN_MINUTES}분에는 바다 수영·서핑을 "
            "뒤로 미루고 계곡 같은 대안을 함께 제시합니다. **퐁당 자체 물때 "
            "기준이며 공식 운영시간·안전 판정이 아닙니다.** 조석 예측은 그 "
            "자체로 활동 가능 시간을 뜻하지 않습니다."
        ),
        basis="pongdang_product_rule",
    ),
    Rule(
        code="wave_favours_surf",
        text=(
            "수영과 서핑이 모두 가능하면 파고·파주기 항목 점수로 가릅니다. "
            "두 활동의 파고 기준이 서로 다르기 때문입니다."
        ),
        basis="score_curve_knot",
    ),
    Rule(
        code="water_activity_preferred",
        text=(
            "물에 들어갈 수 있으면 물 활동을 먼저 권합니다. 휴식·온천은 점수가 "
            "높아서가 아니라 물에 들어가기 어려울 때의 답입니다. 항목 수가 적은 "
            "활동이 자동으로 높은 점수를 받는 것을 그대로 순위로 쓰지 않습니다."
        ),
        basis="pongdang_product_rule",
    ),
    Rule(
        code="no_water_activity_today",
        text=(
            "물 활동이 하나도 남지 않으면 점수를 지어내지 않고 대안을 "
            "제시합니다. 대안은 등록된 실제 장소 목록에서만 고릅니다."
        ),
        basis="data_contract",
    ),
)

LIMITATIONS: tuple[str, ...] = (
    "활동 조건 참고 점수를 비교한 결과이며 안전 판정이 아닙니다.",
    "공식 제한·운영시간·현장 판단을 대체하지 않습니다.",
    "물때 규칙은 퐁당 자체 기준이며 검증된 활동 가능 시간이 아닙니다.",
    "대안 장소는 등록된 카탈로그 행이며 영업·개방 여부를 확인한 것이 아닙니다.",
)


class Reason(Record):
    """한 줄의 근거. 문장이 아니라 코드와 그 코드가 쓴 수치입니다."""

    code: str
    activity: Activity | None = None
    #: 비교 대상 활동. 「저쪽이 아니라 이쪽」을 말하는 사유에만 있습니다.
    rival: Activity | None = None
    metric: str | None = None
    label: str | None = None
    value: Number | None = None
    unit: str | None = None
    threshold: Number | None = None
    station_name: str | None = None
    relation: str | None = None
    distance_km: Number | None = None
    minutes: int | None = None


class Candidate(Record):
    activity: Activity
    score: Number | None
    status: str
    coverage: Number
    available_components: int
    total_components: int
    #: 후보에서 빠졌는지. 점수가 낮은 것과 다른 사실입니다.
    dropped: bool
    #: 후보로 남았지만 뒤로 미뤄졌는지(물때). 점수는 그대로입니다.
    demoted: bool
    rules_applied: tuple[str, ...]


class Choice(Record):
    activity: Activity
    score: Number
    status: str


class Tide(Record):
    """지금의 물때. 공식 조석 예측에서 읽은 사실이며 활동 가능 시간이 아닙니다."""

    status: str
    phase: TidePhase
    #: 다음 만조·간조까지 남은 분.
    minutes_to_high: int | None
    minutes_to_low: int | None
    #: 직전 만조·간조가 지난 지 몇 분. 「만조 20분 지남」을 말하려면 필요합니다.
    minutes_since_high: int | None = None
    minutes_since_low: int | None = None
    high_at: str | None
    low_at: str | None
    height: Number | None
    unit: str | None
    station_name: str | None
    spatial_relation: str | None
    distance_km: Number | None
    reason_codes: tuple[str, ...]

    def near_minutes(self) -> int | None:
        """물때 구간에서 그 극값까지의 분. 앞으로 남았으면 양수, 이미 지났으면
        음수입니다. 「만조 40분 전」과 「만조 지난 지 20분」은 다른 사실입니다."""
        ahead, behind = (
            (self.minutes_to_high, self.minutes_since_high)
            if self.phase == "near_high"
            else (self.minutes_to_low, self.minutes_since_low)
            if self.phase == "near_low"
            else (None, None)
        )
        if ahead is not None and ahead <= TIDE_MARGIN_MINUTES:
            return ahead
        return -behind if behind is not None else None


class Alternative(Record):
    kind: AlternativeKind
    spot_id: int = Field(gt=0)
    name: str
    distance_km: Number | None
    address: str | None = None
    region: str | None = None
    #: 계곡 대안 한 곳에 한해 그 장소의 추천 결과를 함께 싣습니다.
    best_activity: Activity | None = None
    score: Number | None = None


class Decision(Record):
    """순수 판단 결과. DB·시각·장소 조회가 없는 부분입니다."""

    choice: Choice | None
    ranked: tuple[Candidate, ...]
    reasons: tuple[Reason, ...]
    #: 어떤 종류의 대안을 찾아야 하는지. 실제 장소 조회는 API 층이 합니다.
    alternative_kinds: tuple[AlternativeKind, ...]
    reason_codes: tuple[str, ...]


def _component(evidence: ConditionsEnvelope, metric: str):
    """점수가 매겨진 항목만 돌려줍니다. 미평가 항목을 근거로 쓰면 «근거 없음»이
    «조건 나쁨»으로 둔갑합니다."""
    score = evidence.condition_score
    if score is None:
        return None
    return next(
        (
            c
            for c in score.components
            if c.metric == metric and c.status == "evaluated" and c.score is not None
        ),
        None,
    )


def _reason_from(code: str, activity: Activity, component, **extra) -> Reason:
    return Reason(
        code=code,
        activity=activity,
        metric=component.metric,
        label=component.label,
        value=component.value,
        unit=component.unit,
        station_name=component.station_name,
        relation=component.relation,
        distance_km=component.distance_km,
        **extra,
    )


def _essentials_present(evidence: ConditionsEnvelope) -> bool:
    groups = ESSENTIAL_METRICS.get(evidence.activity, ())
    return all(
        any(_component(evidence, metric) is not None for metric in group)
        for group in groups
    )


def decide(
    envelopes: dict[Activity, ConditionsEnvelope],
    *,
    place_kind: str | None = None,
    tide: Tide | None = None,
    order: tuple[Activity, ...] = RECOMMENDED_ACTIVITIES,
) -> Decision:
    """활동별 조건 응답을 비교해 하나를 고릅니다.

    `order` 는 동점일 때의 우선순위입니다. 점수가 같으면 앞선 활동이 이깁니다.
    """
    candidates: list[Candidate] = []
    reasons: list[Reason] = []
    sea_blocked_by_cold = False
    sea_blocked_by_tide = False

    for activity in order:
        evidence = envelopes.get(activity)
        if evidence is None:
            continue
        score = evidence.condition_score
        applied: list[str] = []
        dropped = False
        demoted = False

        if score is None or score.status in {"blocked", "unavailable"}:
            dropped = True
            applied.append("activity_blocked")
            reasons.append(
                Reason(
                    code="activity_blocked",
                    activity=activity,
                    metric=None,
                )
            )
        elif not _essentials_present(evidence):
            dropped = True
            applied.append("essential_measurement_missing")
            missing = [
                group[0]
                for group in ESSENTIAL_METRICS.get(activity, ())
                if not any(_component(evidence, name) is not None for name in group)
            ]
            for name in missing:
                reasons.append(
                    Reason(
                        code="essential_measurement_missing",
                        activity=activity,
                        metric=name,
                    )
                )

        if not dropped and activity in SEA_ACTIVITIES:
            water = _component(evidence, "water_temperature")
            air = _component(evidence, "air_temperature")
            if water is not None and water.value < IMMERSION_WATER_C:
                dropped = True
                sea_blocked_by_cold = True
                applied.append("water_too_cold_for_immersion")
                reasons.append(
                    _reason_from(
                        "water_too_cold_for_immersion",
                        activity,
                        water,
                        threshold=IMMERSION_WATER_C,
                    )
                )
                if air is not None and air.value < BEACH_AIR_C:
                    reasons.append(
                        _reason_from(
                            "air_below_beach_preference",
                            activity,
                            air,
                            threshold=BEACH_AIR_C,
                        )
                    )
            elif tide is not None and tide.phase in {"near_high", "near_low"}:
                demoted = True
                sea_blocked_by_tide = True
                applied.append("tide_phase_product_rule")
                reasons.append(
                    Reason(
                        code="tide_phase_product_rule",
                        activity=activity,
                        station_name=tide.station_name,
                        relation=tide.spatial_relation,
                        distance_km=tide.distance_km,
                        minutes=tide.near_minutes(),
                        threshold=float(TIDE_MARGIN_MINUTES),
                    )
                )

        candidates.append(
            Candidate(
                activity=activity,
                score=score.score if score else None,
                status=score.status if score else "unavailable",
                coverage=score.coverage if score else 0.0,
                available_components=score.available_components if score else 0,
                total_components=score.total_components if score else 0,
                dropped=dropped,
                demoted=demoted,
                rules_applied=tuple(applied),
            )
        )

    position = {activity: index for index, activity in enumerate(order)}
    live = [c for c in candidates if not c.dropped and c.score is not None]
    # 물때로 미뤄진 것이 가장 먼저, 그다음이 「물이면 물」, 그 안에서 점수,
    # 동점이면 `order` 순입니다. 점수만으로 줄을 세우지 않는 이유는
    # WATER_ACTIVITIES 주석에 있습니다.
    live.sort(
        key=lambda c: (
            c.demoted,
            c.activity not in WATER_ACTIVITIES,
            -c.score,
            position[c.activity],
        )
    )
    best = live[0] if live else None
    if best is not None and best.activity in WATER_ACTIVITIES:
        land = [c for c in live if c.activity not in WATER_ACTIVITIES]
        if land and land[0].score > best.score:
            # 뭍 활동이 점수로는 앞서지만 물에 들어갈 수 있어 물을 골랐다는
            # 사실을 남깁니다. 화면이 「왜 저쪽이 아닌가」를 말할 수 있어야 합니다.
            reasons.append(
                Reason(
                    code="water_activity_preferred",
                    activity=best.activity,
                    rival=land[0].activity,
                    value=best.score,
                    threshold=land[0].score,
                )
            )

    if best is not None and best.activity in SEA_ACTIVITIES:
        rival: Activity = "surf" if best.activity == "swim" else "swim"
        rival_live = any(c.activity == rival and not c.dropped for c in candidates)
        reasons.extend(_wave_reasons(envelopes, best.activity, rival, rival_live))
    if best is None:
        reasons.append(Reason(code="no_water_activity_today"))

    kinds: list[AlternativeKind] = []
    if sea_blocked_by_cold:
        kinds.extend(("onsen", "meal", "visit"))
    if sea_blocked_by_tide:
        kinds.insert(0, "valley")
    if best is None and not kinds:
        kinds.extend(("onsen", "meal", "visit"))
    if best is not None and best.activity == "relax" and "meal" not in kinds:
        # 「휴식」은 물에 들어가지 않는 하루입니다. 물가에 앉아 있으라는 말이
        # 되지 않도록 갈 곳을 함께 제시합니다.
        kinds.extend(("meal", "visit"))

    codes = ["provisional_product_defaults", "not_a_safety_score"]
    codes.extend(dict.fromkeys(reason.code for reason in reasons))
    if tide is not None:
        codes.extend(tide.reason_codes)
    if place_kind is None:
        codes.append("place_kind_unknown")

    return Decision(
        choice=Choice(activity=best.activity, score=best.score, status=best.status)
        if best
        else None,
        ranked=tuple(candidates),
        reasons=tuple(reasons),
        alternative_kinds=tuple(dict.fromkeys(kinds)),
        reason_codes=tuple(dict.fromkeys(codes)),
    )


def _wave_reasons(
    envelopes, chosen: Activity, rival: Activity, rival_live: bool
) -> list[Reason]:
    """수영·서핑이 **둘 다 가능할 때** 파도가 어느 쪽을 골랐는지.

    상대 활동이 애초에 후보가 아니었다면 파도가 고른 것이 아니므로 아무 말도
    하지 않습니다 -- 화면이 틀린 이유를 말하게 됩니다. 같은 이유로, 고른 쪽의
    파고 점수가 더 높을 때만 파도를 근거로 씁니다.
    """
    if not rival_live or rival not in envelopes:
        return []
    wave = _component(envelopes[chosen], "wave_height")
    other = _component(envelopes[rival], "wave_height")
    if wave is None or other is None or wave.score <= other.score:
        return []
    code = "wave_favours_surf" if chosen == "surf" else "wave_favours_swim"
    reasons = [_reason_from(code, chosen, wave, rival=rival, threshold=other.score)]
    period = _component(envelopes[chosen], "wave_period")
    if period is not None:
        reasons.append(_reason_from("wave_period_context", chosen, period))
    return reasons


#: 파고 곡선의 기준 문구. 화면이 «수영 기준»과 «서핑 기준»을 함께 보일 때 씁니다.
WAVE_CRITERIA = {
    "swim": SWIM_WAVE.criterion("m"),
    "surf": SURF_WAVE.criterion("m"),
}
CURVE_CRITERIA = {
    "water_temperature": WATER.criterion("°C"),
    "air_temperature": BEACH_AIR.criterion("°C"),
}
