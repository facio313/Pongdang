"""Versioned, provisional activity preferences over real collection evidence.

Published beach air ranges and wind ratings are adapted with their original
scope disclosed. Other knots, equal weights and partial aggregation are explicit
Pongdang product assumptions, not empirical coefficient estimates.
This model never alters the separate scientific assessment or safety status.
"""

from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal
from typing import TYPE_CHECKING, Annotated, Literal

from pydantic import Field, StrictFloat

from app.water_index.models import Record

if TYPE_CHECKING:
    from app.water_index.conditions import ConditionMetric, ConditionsEnvelope

Number = Annotated[StrictFloat, Field(allow_inf_nan=False)]
Points = Annotated[Number, Field(ge=0, le=100)]


class ScoreSource(Record):
    id: str
    title: str
    url: str
    usage: str


SOURCES = {
    source.id: source
    for source in (
        ScoreSource(
            id="beach-preferences-2016",
            title="Rutty & Scott (2016), Domestic and international beach holidays",
            url="https://doi.org/10.3390/atmos7020030",
            usage=(
                "4.2절 캐나다 국내 해변 여행 응답의 선호 기온 25–30°C, "
                "추위 21°C·더위 33°C 경계를 참고. 0/100점·선형 보간과 한국 "
                "시간별 방문 조건으로의 전이는 제품 가정이며 입수 수온 기준 아님."
            ),
        ),
        ScoreSource(
            id="beach-climate-2020",
            title="Rutty et al. (2020), HCI:Beach and Canadian tourism arrivals",
            url="https://doi.org/10.3390/atmos11040412",
            usage=(
                "Table 6 풍속 구간·평점을 10배하고 음수는 0으로 제한. "
                "일평균 풍속을 시간별 자료에 적용하는 것은 미검증 전이입니다. "
                "습도·강수는 변수 선택만 참고하며 HCI 총점을 재현하지 않습니다."
            ),
        ),
        ScoreSource(
            id="immersion-comfort-2015",
            title="Guéritée et al. (2015), Thermal comfort following immersion",
            url="https://doi.org/10.1016/j.physbeh.2014.12.016",
            usage=(
                "수온·바람·입수/퇴수 상태를 구분할 근거. 실험의 28°C를 보편 최적 "
                "수온으로 채택하지 않으며, 수온 점수 곡선은 제품 가정."
            ),
        ),
        ScoreSource(
            id="surf-climate-2022",
            title="Boqué-Ciurana et al. (2022), Climatic potential of Somo's surf spot",
            url="https://doi.org/10.3390/su14148496",
            usage=(
                "서핑 파고·주기·바람과 숙련 차이를 구분할 근거. 현장 쇄파·풍향·숙련 "
                "검증 없는 관측소 수치이므로 아래 일반 참고 곡선은 제품 가정."
            ),
        ),
        ScoreSource(
            id="bathing-thermal-2019",
            title="Masuda et al. (2019), Thermal responses during hot-water bathing",
            url="https://doi.org/10.1016/j.jtherbio.2019.03.014",
            usage=(
                "시설 욕조 수온과 외부/실내 기온의 의미를 분리할 근거. 소규모 성인 "
                "실험이며 욕조 곡선·외부 방문 기상 점수는 제품 가정입니다. "
                "이용 허가 기준이 아닙니다."
            ),
        ),
    )
}


class ScoreComponent(Record):
    metric: str
    label: str
    value: Number | None
    unit: str
    score: Points | None
    weight: Number = 1.0
    station_id: int | None
    station_name: str | None
    relation: str | None
    distance_km: Number | None
    status: Literal["evaluated", "unavailable", "unconfigured"]
    reason_codes: tuple[str, ...]
    criterion: str
    source_ids: tuple[str, ...]


class ActivityScore(Record):
    model_id: Literal["pongdang-activity-conditions"] = "pongdang-activity-conditions"
    model_version: Literal["1.0.0"] = "1.0.0"
    label: Literal["활동 조건 참고 점수"] = "활동 조건 참고 점수"
    scientific_validation: Literal["not_evaluated"] = "not_evaluated"
    status: Literal["evaluated", "partial", "unavailable", "blocked"]
    score: Points | None
    coverage: Annotated[Number, Field(ge=0, le=1)]
    available_components: int
    total_components: int
    components: tuple[ScoreComponent, ...]
    reason_codes: tuple[str, ...]
    methodology: str = (
        "해변 방문 기온은 논문의 선호 범위, 풍속은 HCI:Beach 구간 평점을 "
        "참고합니다. 나머지 곡선·동일 가중치는 Pongdang의 미보정 기본값입니다. "
        "풍속은 구간 평점, 나머지 항목은 공개된 절점 사이를 선형 보간하고 "
        "범위 밖은 끝점 점수를 사용합니다. 총점=확보한 항목 점수의 산술평균 "
        "(소수 첫째 자리 반올림). 결측·만료·충돌·지역 기준 미설정 항목은 "
        "점수를 만들지 않고 확보율을 함께 표시합니다. 부분 점수는 같은 확보 "
        "항목끼리만 비교하세요. 안전·운영 가능성·활동 간 공통 효용 척도가 아닙니다."
    )
    sources: tuple[ScoreSource, ...]


@dataclass(frozen=True)
class Curve:
    knots: tuple[tuple[float, float], ...]
    source_ids: tuple[str, ...]
    description: str
    method: Literal["linear", "step"] = "linear"
    multiplier: float = 1.0
    input_unit: str | None = None
    basis: str = "제품 기본값"

    def criterion(self, unit: str) -> str:
        points = ", ".join(
            f"{value:g}{self.input_unit or unit}→{score:g}점"
            for value, score in self.knots
        )
        method = (
            "각 하한 이상 구간 적용" if self.method == "step" else "절점 사이 선형 보간"
        )
        return f"{self.basis} · {self.description} · {points} · {method}"

    def score(self, value: float) -> float:
        converted = Decimal(str(value)) * Decimal(str(self.multiplier))
        if self.method == "step":
            # Original wind ratings are stated to 0.1 km/h precision.
            converted = converted.quantize(Decimal("0.1"), rounding=ROUND_HALF_UP)
            return float(
                next(
                    score
                    for low, score in reversed(self.knots)
                    if converted >= Decimal(str(low))
                )
            )
        return interpolate(float(converted), self.knots)


# Curve.basis distinguishes numerical adaptations from product-only defaults.
# Equal weights are an explicit baseline, not estimated variable importance.
BEACH_AIR = Curve(
    ((21, 0), (25, 100), (30, 100), (33, 0)),
    ("beach-preferences-2016",),
    "캐나다 국내 해변 방문 선호 구간을 시간별 참고값으로 전이; 입수 쾌적성 아님",
    basis="논문 범위 참고 + 0/100 환산·보간 제품 가정",
)
OUTDOOR_AIR = Curve(
    ((5, 0), (15, 60), (20, 100), (27, 100), (32, 50), (38, 0)),
    ("beach-climate-2020",),
    "야외 방문 기온 참고; 체감온도·실내 온도 아님",
)
WATER = Curve(
    ((10, 0), (18, 40), (24, 85), (27, 100), (30, 80), (35, 0)),
    ("immersion-comfort-2015",),
    "일반 수온 선호 가정; 장비·노출시간·개인차 미반영",
)
WIND = Curve(
    ((0, 80), (0.6, 100), (10, 90), (20, 80), (30, 60), (40, 30), (50, 0)),
    ("beach-climate-2020",),
    "HCI:Beach Table 6 풍속 평점×10, 음수 0 제한; 시간별 전이는 미검증",
    method="step",
    multiplier=3.6,
    input_unit="km/h",
    basis="논문 구간 평점 참고",
)
RAIN = Curve(
    ((0, 100), (0.5, 90), (2, 60), (5, 20), (10, 0)),
    ("beach-climate-2020",),
    "1시간 강수 불편 가정; 일강수·강수확률 변환 아님",
)
HUMIDITY = Curve(
    ((0, 40), (30, 85), (40, 100), (65, 100), (85, 50), (100, 20)),
    ("beach-climate-2020",),
    "상대습도 선호 가정; PET·UTCI·Humidex 계산 아님",
)
SWIM_WAVE = Curve(
    ((0, 100), (0.3, 100), (0.8, 70), (1.5, 20), (2, 0)),
    ("surf-climate-2022",),
    "작은 파도 선호 가정; 입수 허용 기준 아님",
)
SURF_WAVE = Curve(
    ((0, 0), (0.3, 30), (0.6, 80), (1, 100), (1.5, 80), (2, 40), (3, 0)),
    ("surf-climate-2022",),
    "일반 참고 파고 가정; 초보·숙련자 맞춤 또는 쇄파 높이 아님",
)
SURF_PERIOD = Curve(
    ((3, 0), (5, 30), (8, 80), (10, 100), (15, 100), (20, 70)),
    ("surf-climate-2022",),
    "파주기 참고 가정; 해변별 파랑 변형 미반영",
)
BATH = Curve(
    ((30, 0), (36, 70), (38, 100), (40, 50), (42, 0)),
    ("bathing-thermal-2019",),
    "시설 실측 욕조 선호 가정; 의학적 안전선 아님",
)
DEFAULT_CURVES = {
    "swim": {
        "water_temperature": WATER,
        "air_temperature": BEACH_AIR,
        "wind_speed": WIND,
        "wave_height": SWIM_WAVE,
    },
    "surf": {
        "water_temperature": WATER,
        "air_temperature": BEACH_AIR,
        "wind_speed": WIND,
        "wave_height": SURF_WAVE,
        "wave_period": SURF_PERIOD,
    },
    "relax": {
        "air_temperature": BEACH_AIR,
        "relative_humidity": HUMIDITY,
        "wind_speed": WIND,
        "precipitation": RAIN,
    },
    "mudflat": {
        "air_temperature": OUTDOOR_AIR,
        "wind_speed": WIND,
        "precipitation": RAIN,
    },
    "onsen": {"bath_water_temperature": BATH, "air_temperature": OUTDOOR_AIR},
    "rafting": {
        "river_level": None,
        "river_flow": None,
        "water_temperature": WATER,
        "air_temperature": OUTDOOR_AIR,
        "wind_speed": WIND,
    },
}


def _round(value: Decimal) -> float:
    return float(value.quantize(Decimal("0.1"), rounding=ROUND_HALF_UP))


def interpolate(value: float, knots: tuple[tuple[float, float], ...]) -> float:
    number = Decimal(str(value))
    if number <= Decimal(str(knots[0][0])):
        return float(knots[0][1])
    for (left, low), (right, high) in zip(knots, knots[1:], strict=False):
        a, b = Decimal(str(left)), Decimal(str(right))
        if number <= b:
            return _round(
                Decimal(str(low)) + (number - a) * Decimal(str(high - low)) / (b - a)
            )
    return float(knots[-1][1])


def _provisional_value(metric: ConditionMetric, evidence: ConditionsEnvelope):
    """Admit unknown issue time and identical variants without changing evidence."""
    from app.water_index.conditions import METRICS

    if metric.status != "available" and metric.reason_codes not in {
        ("provider_issue_time_unknown",),
        ("conflicting_measurement_evidence",),
    }:
        return None, metric.reason_codes or ("measurement_" + metric.status,)
    sources = metric.evidence
    unit = METRICS[metric.name].unit
    units = (
        {unit, "degC"} if unit == "°C" else {unit, "m3/s"} if unit == "m³/s" else {unit}
    )
    names = {metric.name}
    if metric.name == "water_temperature":
        names.add("sea_water_temperature")
    if not sources or any(
        source.metric_id is None
        or source.is_missing
        or source.numeric_value is None
        or source.unit not in units
        or source.mode != evidence.mode
        or source.fetched_at > evidence.as_of
        or source.observed_at > evidence.at
        or (source.issued_at is not None and source.issued_at > evidence.as_of)
        or source.valid_until is None
        or not source.valid_from <= evidence.at < source.valid_until
        or not source.spatial_scope
        or source.name not in names
        for source in sources
    ):
        return None, ("measurement_contract_incomplete",)
    if (
        len(
            {
                (s.numeric_value, s.observed_at, s.valid_until, s.spatial_scope)
                for s in sources
            }
        )
        != 1
    ):
        return None, ("conflicting_measurement_evidence",)
    value = sources[0].numeric_value
    if (
        metric.name
        in {
            "wind_speed",
            "wave_height",
            "maximum_wind_speed",
            "maximum_wave_height",
            "wave_period",
            "precipitation",
        }
        and value < 0
    ):
        return None, ("measurement_out_of_domain",)
    if metric.name == "relative_humidity" and not 0 <= value <= 100:
        return None, ("measurement_out_of_domain",)
    warnings = []
    if evidence.mode == "forecast" and any(s.issued_at is None for s in sources):
        warnings.append("provider_issue_time_unknown")
    if len(sources) > 1:
        warnings.append("identical_provider_variants")
    if metric.relation in {"nearby_station_context", "containing_forecast_grid"}:
        warnings.append(metric.relation)
    return value, tuple(warnings)


def select_metric(metrics: list[ConditionMetric], evidence: ConditionsEnvelope):
    """Freshest known target across mapped stations; never pick a favourable tie.

    Include missing/conflicting revisions when selecting target time, so an older
    available station does not hide newer evidence. Ties must agree, otherwise
    the component is withheld. Equal ties select lowest station id for provenance.
    """
    if not metrics:
        return None, None, ("measurement_not_collected",)
    # Meteorological grid and marine-station timestamps describe different
    # products. Choose the established weather source before ranking revisions;
    # a newer, expired buoy reading must not suppress valid KMA air/wind data.
    # Within the chosen source class, newer missing/conflicting evidence still
    # takes precedence: never revive an older favourable measurement.
    weather = {"air_temperature", "relative_humidity", "wind_speed", "precipitation"}
    grids = [m for m in metrics if m.relation == "containing_forecast_grid"]
    if grids and metrics[0].name in weather:
        metrics = grids
    latest = max((s.observed_at for m in metrics for s in m.evidence), default=None)
    candidates = [
        m for m in metrics if any(s.observed_at == latest for s in m.evidence)
    ]
    if not candidates:
        return None, None, ("measurement_evidence_unavailable",)
    if all(m.relation == "nearby_station_context" for m in candidates):
        distance = min(m.distance_km for m in candidates)
        candidates = [m for m in candidates if m.distance_km == distance]
    values = [(m, *_provisional_value(m, evidence)) for m in candidates]
    if len({value for _, value, _ in values}) > 1:
        return None, None, ("conflicting_station_measurements",)
    metric = min(candidates, key=lambda item: item.station_id)
    value, reasons = _provisional_value(metric, evidence)
    return metric, value, reasons


def calculate_activity_score(evidence: ConditionsEnvelope) -> ActivityScore:
    from app.water_index.conditions import ACTIVITIES, ConditionsEnvelope

    # Retain the strict time/unit/source validation for all invocation paths.
    evidence = ConditionsEnvelope.model_validate(evidence.model_dump())
    components = []
    for definition in ACTIVITIES[evidence.activity].metrics:
        name = definition.name
        curve = DEFAULT_CURVES[evidence.activity][name]
        metric, value, reasons = select_metric(
            [
                m
                for m in (*evidence.metrics, *evidence.context_metrics)
                if m.name == name
            ],
            evidence,
        )
        if curve is None:
            reasons = tuple(dict.fromkeys((*reasons, "local_operating_range_required")))
        score = curve.score(value) if curve is not None and value is not None else None
        components.append(
            ScoreComponent(
                metric=name,
                label=definition.label,
                value=value,
                unit=definition.unit,
                score=score,
                station_id=metric.station_id if metric else None,
                station_name=metric.station_name if metric else None,
                relation=metric.relation if metric else None,
                distance_km=metric.distance_km if metric else None,
                status="unconfigured"
                if curve is None
                else "evaluated"
                if score is not None
                else "unavailable",
                reason_codes=reasons,
                criterion=curve.criterion(definition.unit)
                if curve
                else "장소·관측소별 운영 범위가 필요합니다. 전국 공통 수치는 미적용.",
                source_ids=curve.source_ids if curve else (),
            )
        )
    available = [c for c in components if c.score is not None]
    blocked = (
        evidence.safety_status == "restricted"
        or evidence.support_status == "unsupported"
    )
    reasons = ["provisional_product_defaults", "not_a_safety_score"]
    reasons.extend(dict.fromkeys(code for c in available for code in c.reason_codes))
    if evidence.support_status == "unknown":
        reasons.append("activity_support_unknown")
    if blocked:
        reasons.append("official_restriction_or_unsupported_activity")
    if len(available) < len(components):
        reasons.append("partial_components" if available else "no_available_components")
    if evidence.activity in {"onsen", "mudflat", "rafting"}:
        reasons.append("operating_conditions_require_separate_confirmation")
    return ActivityScore(
        status="blocked"
        if blocked
        else "unavailable"
        if not available
        else "evaluated"
        if len(available) == len(components)
        else "partial",
        score=_round(
            sum((Decimal(str(c.score)) for c in available), Decimal(0)) / len(available)
        )
        if available and not blocked
        else None,
        coverage=len(available) / len(components),
        available_components=len(available),
        total_components=len(components),
        components=tuple(components),
        reason_codes=tuple(reasons),
        sources=tuple(
            SOURCES[key]
            for key in sorted({s for c in components for s in c.source_ids})
        ),
    )
