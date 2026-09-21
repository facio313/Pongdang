"""Explicit user range matching, separate from scientific environment assessment.

There are no default bounds or weights. An index describes only the criteria the
caller supplied, never swimming safety, scientific suitability or probability.
All values originate from the read-only collection adapter, not the public body.
"""

import hashlib
import json
from decimal import ROUND_HALF_UP, Decimal
from typing import Annotated, Literal

from pydantic import AwareDatetime, Field, StrictFloat, model_validator

from app.water_index.activity_score import ActivityScore
from app.water_index.models import Activity, Record

CONTRACT = "water-conditions.v1"
Finite = Annotated[StrictFloat, Field(allow_inf_nan=False)]
MetricName = Literal[
    "water_temperature",
    "bath_water_temperature",
    "air_temperature",
    "relative_humidity",
    "wind_speed",
    "wave_height",
    "maximum_wave_height",
    "maximum_wind_speed",
    "wave_period",
    "precipitation",
    "river_level",
    "river_flow",
]


class ConditionModel(Record):
    model_id: Literal["explicit-range-match"] = "explicit-range-match"
    model_version: Literal["1.0.0"] = "1.0.0"
    score_meaning: Literal["user_defined_condition_match"] = (
        "user_defined_condition_match"
    )
    scientific_validation: Literal["not_evaluated"] = "not_evaluated"
    formula: str = (
        "100 × Σ(중요도 × 범위 충족 여부[0 또는 1]) / Σ중요도; "
        "경계 포함, 소수 첫째 자리 반올림. 선택 조건 하나라도 미확보면 계산 보류."
    )


class MetricDefinition(Record):
    name: MetricName
    label: str
    unit: str
    description: str


METRICS = {
    name: MetricDefinition(name=name, label=label, unit=unit, description=description)
    for name, label, unit, description in (
        (
            "water_temperature",
            "수온",
            "°C",
            "관측소 수온. 해변 직접 측정·욕조 수온으로 전용하지 않습니다.",
        ),
        (
            "bath_water_temperature",
            "시설 욕조 수온",
            "°C",
            "시설 욕조를 직접 측정한 자료만 사용합니다. 해수·하천 수온 대체 불가.",
        ),
        (
            "air_temperature",
            "외부 기온",
            "°C",
            "연결된 기상 관측·예보의 기온. 실내 온도나 체감온도가 아닙니다.",
        ),
        ("relative_humidity", "상대습도", "%", "제공기관의 상대습도입니다."),
        ("wind_speed", "풍속", "m/s", "제공기관의 풍속. 돌풍과 구분합니다."),
        ("maximum_wind_speed", "최대 풍속", "m/s", "예보 구간의 최대 풍속입니다."),
        (
            "maximum_wave_height",
            "최대 파고",
            "m",
            "예보 구간의 최대 파고입니다. 유의파고와 구분합니다.",
        ),
        (
            "wave_height",
            "파고",
            "m",
            "제공기관 관측소의 파고. 해변 쇄파 높이·개인 숙련도 판단이 아닙니다.",
        ),
        ("wave_period", "파주기", "s", "제공기관 관측소의 파주기입니다."),
        (
            "precipitation",
            "1시간 강수량",
            "mm/1h",
            "수치로 제공된 1시간 강수만 사용합니다. 강수확률·일강수와 다릅니다.",
        ),
        (
            "river_level",
            "하천 수위",
            "m",
            "선택한 관측소의 기준면 수위. 다른 강·관측소와 같은 기준이 아닙니다.",
        ),
        (
            "river_flow",
            "하천 유량",
            "m³/s",
            "선택한 관측소의 유량. 구간별 운항 허용 유량은 별도 근거가 필요합니다.",
        ),
    )
}


class ActivityDefinition(Record):
    activity: Activity
    label: str
    description: str
    metrics: tuple[MetricDefinition, ...]
    required_evidence: tuple[str, ...]
    environment_model_status: Literal["unimplemented"] = "unimplemented"


_ACTIVITIES = (
    (
        "swim",
        "수영",
        "설정한 수영 관련 환경 조건의 일치 정도",
        ("water_temperature", "air_temperature", "wind_speed", "wave_height"),
        (
            "장소별 수영 지원·운영 구역",
            "입수·수질·기상·이안류 등 공식 제한",
            "노출·장비·대상자별 외부 검증",
        ),
    ),
    (
        "surf",
        "서핑",
        "설정한 서핑 관련 환경 조건의 일치 정도",
        (
            "water_temperature",
            "air_temperature",
            "wind_speed",
            "wave_height",
            "wave_period",
        ),
        (
            "서핑 구역·브레이크와 관측소 대표성",
            "공식 입수 제한·수질·해안 위험",
            "파향·풍향·숙련·장비별 현장 검증",
        ),
    ),
    (
        "relax",
        "휴식",
        "설정한 야외 휴식 기상 조건의 일치 정도",
        ("air_temperature", "relative_humidity", "wind_speed", "precipitation"),
        (
            "휴식·접근 가능 구역",
            "낙뢰·폭풍·해안 접근 통제",
            "활동·노출별 쾌적성/만족 표본 검증",
        ),
    ),
    (
        "mudflat",
        "갯벌",
        "설정한 갯벌 주변 기상 조건의 일치 정도",
        ("air_temperature", "wind_speed", "precipitation"),
        (
            "체험 구역·귀환 경로",
            "공식 운영창·조석·침수·안개 통제",
            "활동별 만족·참여 표본 검증",
        ),
    ),
    (
        "onsen",
        "온천",
        "설정한 시설 욕조·외부 기온 조건의 일치 정도",
        ("bath_water_temperature", "air_temperature"),
        (
            "시설 유형·실내외 구분",
            "시설 실측 욕조 수온·위생·이용 제한",
            "체류시간·대상자·노출별 외부 검증",
        ),
    ),
    (
        "rafting",
        "래프팅",
        "설정한 하천 관측소·기상 조건의 일치 정도",
        (
            "river_level",
            "river_flow",
            "water_temperature",
            "air_temperature",
            "wind_speed",
        ),
        (
            "승인 운항 구간·운영자",
            "상류 강우·방류·구간 통제",
            "관측소 수리 관계·장비·숙련별 현장 검증",
        ),
    ),
)
ACTIVITIES = {
    activity: ActivityDefinition(
        activity=activity,
        label=label,
        description=description,
        metrics=tuple(METRICS[m] for m in metrics),
        required_evidence=required,
    )
    for activity, label, description, metrics, required in _ACTIVITIES
}


class ActivityCatalog(Record):
    contract_version: Literal["water-conditions.v1"] = CONTRACT
    model: ConditionModel = Field(default_factory=ConditionModel)
    rows: tuple[ActivityDefinition, ...] = tuple(ACTIVITIES.values())


class Criterion(Record):
    metric: MetricName
    station_id: int = Field(strict=True, gt=0)
    minimum: Finite | None = None
    maximum: Finite | None = None
    weight: Annotated[Finite, Field(gt=0, le=1000)]

    @model_validator(mode="after")
    def explicit_range(self):
        if self.minimum is None and self.maximum is None:
            raise ValueError("An explicit bound is required")
        if (
            self.minimum is not None
            and self.maximum is not None
            and self.minimum > self.maximum
        ):
            raise ValueError("The lower bound cannot exceed the upper bound")
        return self


class SourceValue(Record):
    metric_id: int | None
    snapshot_id: int
    provider: str
    provider_record_id: str
    source_record_id: str | None
    name: str
    numeric_value: Finite | None
    text_value: str | None
    is_missing: bool
    unit: str | None
    mode: Literal["observation", "forecast"]
    observed_at: AwareDatetime
    issued_at: AwareDatetime | None
    fetched_at: AwareDatetime
    valid_from: AwareDatetime
    valid_until: AwareDatetime | None
    spatial_scope: str | None
    source_state: str | None
    metric_state: str | None


class ConditionMetric(Record):
    name: MetricName
    label: str
    unit: str
    value: Finite | None
    station_id: int
    station_name: str | None
    relation: Literal[
        "station_observation_point",
        "representative_station",
        "nearby_station_context",
        "containing_forecast_grid",
    ]
    distance_km: Annotated[Finite, Field(ge=0)] | None = None
    mapping_id: str | None
    spatial_scope: str | None
    status: Literal[
        "available",
        "missing",
        "stale",
        "unknown",
        "conflict",
        "unit_mismatch",
        "not_applicable",
    ]
    reason_codes: tuple[str, ...]
    evidence: Annotated[tuple[SourceValue, ...], Field(max_length=100)]

    @model_validator(mode="after")
    def available_evidence(self):
        source_units = {METRICS[self.name].unit}
        if METRICS[self.name].unit == "°C":
            source_units.add("degC")
        if METRICS[self.name].unit == "m³/s":
            source_units.add("m3/s")
        if self.status == "available" and (
            self.value is None
            or self.unit != METRICS[self.name].unit
            or len(self.evidence) != 1
            or self.evidence[0].metric_id is None
            or self.evidence[0].is_missing
            or self.evidence[0].numeric_value != self.value
            or self.evidence[0].unit not in source_units
        ):
            raise ValueError("Available values require one consistent source and unit")
        return self


class DisplayMetric(ConditionMetric):
    """Presentation value with explicit provisional or categorical provenance."""

    status: Literal["available", "provisional", "text"]
    text_value: str | None = None


class ConditionProjection(Record):
    generation_id: int | None
    source_revision: int
    computed_at: AwareDatetime | None
    refresh_after: AwareDatetime | None
    status: Literal["ready", "pending"]


class ConditionsEnvelope(Record):
    contract_version: Literal["water-conditions.v1"] = CONTRACT
    model: ConditionModel = Field(default_factory=ConditionModel)
    spot_id: int
    place_name: str | None
    activity: Activity
    mode: Literal["observation", "forecast"]
    at: AwareDatetime
    as_of: AwareDatetime
    support_status: Literal["supported", "unsupported", "unknown"]
    safety_status: Literal["restricted", "caution", "unknown"]
    restriction_refs: Annotated[tuple[str, ...], Field(max_length=100)]
    environment_score: None = None
    condition_score: ActivityScore | None = None
    projection: ConditionProjection | None = None
    metrics: Annotated[tuple[ConditionMetric, ...], Field(max_length=100)]
    context_metrics: Annotated[tuple[ConditionMetric, ...], Field(max_length=100)] = ()
    display_metrics: Annotated[tuple[DisplayMetric, ...], Field(max_length=100)] = ()
    missing_metrics: tuple[MetricName, ...]
    required_evidence: tuple[str, ...]
    reason_codes: tuple[str, ...]

    @model_validator(mode="after")
    def available_at_cutoff(self):
        if self.mode == "observation" and self.at > self.as_of:
            raise ValueError("An observation cannot establish future conditions")
        for metric in (*self.metrics, *self.context_metrics):
            if metric.status != "available":
                continue
            source = metric.evidence[0]
            if (
                source.mode != self.mode
                or source.fetched_at > self.as_of
                or (source.issued_at is not None and source.issued_at > self.as_of)
                or (source.mode == "forecast" and source.issued_at is None)
                or source.valid_until is None
                or not source.valid_from <= self.at < source.valid_until
                or source.observed_at > self.at
            ):
                raise ValueError(
                    "Available values must cover target and knowledge cutoff"
                )
        return self


SUMMARY_CONTRACT = "water-conditions-summary.v1"
#: 목록이 한 줄에 보여 주는 수치. 요약은 이것만 싣습니다 -- 근거 막대와 설명은
#: 전체 봉투가 필요하고, 그건 고른 지점 한 곳에서만 읽습니다.
SUMMARY_METRIC: MetricName = "water_temperature"


def summary_expiry(envelope: ConditionsEnvelope) -> AwareDatetime | None:
    """점수를 떠받치는 근거 중 **가장 먼저** 못 쓰게 되는 시각.

    화면(productData.ts 의 conditionScoreExpiry)이 전체 metric 트리를 훑어
    구하던 값을 서버가 대신 계산합니다. 요약에는 트리가 없으므로, 이게
    없으면 목록은 자기가 든 숫자가 언제 만료되는지 알 길이 없습니다 --
    만료를 모르면 「낡은 값을 계속 보여 주거나」 「쉬지 않고 다시 묻거나」
    둘 중 하나가 됩니다. 규칙은 화면 쪽과 같아야 합니다.
    """
    score = envelope.condition_score
    used = {
        (c.metric, c.station_id)
        for c in (score.components if score else ())
        if c.status == "evaluated" and c.score is not None
    }
    shown = {(d.name, d.station_id) for d in envelope.display_metrics}
    expiries = [
        source.valid_until
        for metric in (*envelope.metrics, *envelope.context_metrics)
        if (metric.name, metric.station_id) in used
        or (metric.name, metric.station_id) in shown
        for source in metric.evidence
        if source.valid_until is not None
    ]
    return min(expiries) if expiries else None


class ConditionSummary(Record):
    """한 지점의 목록용 요약. 전체 봉투에서 **뽑아낸** 것이며 따로 계산하지
    않습니다 -- 목록과 상세가 다른 숫자를 말하면 안 됩니다."""

    spot_id: int
    place_name: str | None
    support_status: Literal["supported", "unsupported", "unknown"]
    safety_status: Literal["restricted", "caution", "unknown"]
    condition_score: ActivityScore | None = None
    water_temperature: DisplayMetric | ConditionMetric | None = None
    expires_at: AwareDatetime | None


class ConditionSeries(Record):
    contract_version: Literal["water-conditions-series.v1"] = (
        "water-conditions-series.v1"
    )
    spot_id: int
    activity: Activity
    as_of: AwareDatetime
    rows: Annotated[tuple[ConditionsEnvelope, ...], Field(max_length=32)]


class SummaryFailure(Record):
    """읽지 못한 지점. **값이 없는 상태는 안전을 뜻하지 않으므로**, 조용히
    빼지 않고 못 읽었다는 사실과 사유를 그대로 싣습니다."""

    spot_id: int
    reason: str


class ConditionSummaries(Record):
    contract_version: Literal["water-conditions-summary.v1"] = SUMMARY_CONTRACT
    model: ConditionModel = Field(default_factory=ConditionModel)
    activity: Activity
    mode: Literal["observation"] = "observation"
    as_of: AwareDatetime
    rows: Annotated[tuple[ConditionSummary, ...], Field(max_length=100)]
    unavailable: Annotated[tuple[SummaryFailure, ...], Field(max_length=100)] = ()


def summarize_conditions(envelope: ConditionsEnvelope) -> ConditionSummary:
    """Pure projection of a full evidence bundle onto the list row fields."""
    shown = next(
        (
            metric
            for metric in envelope.display_metrics
            if metric.name == SUMMARY_METRIC
        ),
        None,
    ) or next(
        (
            metric
            for metric in (*envelope.metrics, *envelope.context_metrics)
            if metric.name == SUMMARY_METRIC and metric.status == "available"
        ),
        None,
    )
    return ConditionSummary(
        spot_id=envelope.spot_id,
        place_name=envelope.place_name,
        support_status=envelope.support_status,
        safety_status=envelope.safety_status,
        condition_score=envelope.condition_score,
        water_temperature=shown,
        expires_at=summary_expiry(envelope),
    )


class CriterionResult(Criterion):
    status: Literal["matched", "not_matched", "unavailable"]
    value: Finite | None
    unit: str
    matched: bool | None
    weighted_points: Finite | None
    reason_codes: tuple[str, ...]


class ScoreEnvelope(Record):
    contract_version: Literal["water-conditions.v1"] = CONTRACT
    model: ConditionModel = Field(default_factory=ConditionModel)
    evidence: ConditionsEnvelope
    criteria: Annotated[tuple[CriterionResult, ...], Field(min_length=1, max_length=8)]
    status: Literal["evaluated", "incomplete", "blocked"]
    score: Annotated[Finite, Field(ge=0, le=100)] | None
    score_label: Literal["종합 조건 일치 점수"] = "종합 조건 일치 점수"
    total_weight: Finite
    matched_weight: Finite | None
    reason_codes: tuple[str, ...]
    calculation_id: str


def validate_criteria(activity: Activity, criteria: tuple[Criterion, ...]):
    allowed = {m.name for m in ACTIVITIES[activity].metrics}
    if not 1 <= len(criteria) <= 8:
        raise ValueError("Between one and eight explicit criteria are required")
    names = [c.metric for c in criteria]
    if len(set(names)) != len(names) or not set(names) <= allowed:
        raise ValueError("Distinct metrics from the selected activity are required")


def calculate_conditions(
    evidence: ConditionsEnvelope, criteria: tuple[Criterion, ...]
) -> ScoreEnvelope:
    """Pure, deterministic range matching over an immutable evidence bundle."""
    evidence = ConditionsEnvelope.model_validate(evidence.model_dump())
    criteria = tuple(Criterion.model_validate(c.model_dump()) for c in criteria)
    validate_criteria(evidence.activity, criteria)
    results = []
    for criterion in criteria:
        candidates = [
            m
            for m in evidence.metrics
            if m.name == criterion.metric and m.station_id == criterion.station_id
        ]
        metric = candidates[0] if len(candidates) == 1 else None
        usable = (
            metric is not None
            and metric.status == "available"
            and metric.value is not None
        )
        matched = None
        if usable:
            value = Decimal(str(metric.value))
            matched = (
                criterion.minimum is None or value >= Decimal(str(criterion.minimum))
            ) and (
                criterion.maximum is None or value <= Decimal(str(criterion.maximum))
            )
        results.append(
            CriterionResult(
                **criterion.model_dump(),
                status="unavailable"
                if matched is None
                else "matched"
                if matched
                else "not_matched",
                value=metric.value if metric else None,
                unit=METRICS[criterion.metric].unit,
                matched=matched,
                weighted_points=None
                if matched is None
                else criterion.weight
                if matched
                else 0.0,
                reason_codes=(
                    metric.reason_codes
                    if metric
                    else ("selected_measurement_unavailable",)
                ),
            )
        )
    total = sum((Decimal(str(c.weight)) for c in criteria), Decimal(0))
    complete = all(r.matched is not None for r in results)
    blocked = (
        evidence.safety_status == "restricted"
        or evidence.support_status == "unsupported"
    )
    matched_weight = (
        sum((Decimal(str(r.weight)) for r in results if r.matched), Decimal(0))
        if complete
        else None
    )
    score = (
        float(
            (100 * matched_weight / total).quantize(
                Decimal("0.1"), rounding=ROUND_HALF_UP
            )
        )
        if complete and not blocked
        else None
    )
    reasons = ["user_defined_conditions_only", "not_a_safety_or_suitability_score"]
    reasons.extend(evidence.reason_codes)
    if not complete:
        reasons.append("selected_criteria_incomplete")
    if blocked:
        reasons.append("official_restriction_or_unsupported_activity")
    payload = dict(
        evidence=evidence.model_dump(mode="json"),
        criteria=[r.model_dump(mode="json") for r in results],
        model=ConditionModel().model_dump(mode="json"),
        status="blocked" if blocked else "evaluated" if complete else "incomplete",
        score=score,
        total_weight=float(total),
        matched_weight=float(matched_weight) if matched_weight is not None else None,
        reason_codes=tuple(dict.fromkeys(reasons)),
    )
    digest = hashlib.sha256(
        json.dumps(
            payload,
            sort_keys=True,
            ensure_ascii=False,
            separators=(",", ":"),
            allow_nan=False,
        ).encode()
    ).hexdigest()
    return ScoreEnvelope(**payload, calculation_id=f"condition:{digest}")
