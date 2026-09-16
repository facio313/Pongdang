"""Korean ecological seawater WQI, independent of bathing-water safety.

Use the provider's published grade or classify its published integer WQI.
Do not reconstruct WQI from unknown concentration units or incomplete layers.
Research, thresholds and scope: docs/water-quality-grading.md.
"""

import math
import unicodedata
from typing import Literal

from pydantic import AwareDatetime, Field

from app.quality.models import Record

METHOD_VERSION = "korean-marine-wqi.v1"
STANDARD_URL = "https://www.meis.go.kr/mei/wqi/introduce.do"
PAPER_URL = "https://www.jkosmee.or.kr/_PR/view/?aidx=18375&bidx=1417"
GRADE_LABELS = {1: "매우 좋음", 2: "좋음", 3: "보통", 4: "나쁨", 5: "아주 나쁨"}


def parse_grade(value):
    if value is None or isinstance(value, bool):
        return None
    normalized = unicodedata.normalize("NFKC", str(value)).strip().upper()
    roman = {"I": 1, "II": 2, "III": 3, "IV": 4, "V": 5}
    if normalized in roman:
        return roman[normalized]
    try:
        number = float(normalized)
    except ValueError:
        return None
    return int(number) if math.isfinite(number) and number in GRADE_LABELS else None


def grade_from_wqi(value):
    # The five component scores and official weights yield integers, 20–100.
    # Reject fractional/invalid values instead of inventing a rounding rule.
    if value is None or isinstance(value, bool):
        return None
    try:
        score = float(value)
    except ValueError, TypeError:
        return None
    if not math.isfinite(score) or not score.is_integer() or not 20 <= score <= 100:
        return None
    return next(
        grade for grade, limit in enumerate((23, 33, 46, 59, 100), 1) if score <= limit
    )


def resolve_grade(metrics):
    """Duplicate surface/bottom grades must agree; never choose a favourable one."""
    grades, indices, invalid = set(), set(), False
    for metric in metrics:
        name = metric["name"]
        if name not in {"official_wqi_grade", "official_wqi_index"}:
            continue
        if metric["is_missing"]:
            continue
        values = [metric.get("numeric_value"), metric.get("text_value")]
        values = [value for value in values if value is not None and str(value).strip()]
        parser = parse_grade if name == "official_wqi_grade" else grade_from_wqi
        for value in values:
            grade = parser(value)
            if grade is None:
                invalid = True
            elif name == "official_wqi_grade":
                grades.add(grade)
            else:
                indices.add(float(value))
    index_grades = {grade_from_wqi(value) for value in indices}
    if invalid or len(grades | index_grades) > 1 or len(indices) > 1:
        return None, None, "none", ["conflicting_or_invalid_wqi"]
    if grades:
        return grades.pop(), next(iter(indices), None), "official_grade", []
    if indices:
        index = indices.pop()
        return grade_from_wqi(index), index, "official_wqi_index", []
    return None, None, "none", ["official_wqi_not_provided"]


class GradeMeasurement(Record):
    item: str
    value: float | None
    unit: str | None
    layer: str | None
    is_missing: bool


class GradeSource(Record):
    snapshot_id: int
    provider_record_id: str
    source_record_id: str | None
    observed_at: AwareDatetime
    fetched_at: AwareDatetime
    issued_at: AwareDatetime | None
    valid_until: AwareDatetime | None
    spatial_scope: str | None


class QualityGradeEnvelope(Record):
    contract_version: Literal["water-quality-grade.v1"] = "water-quality-grade.v1"
    method_version: str = METHOD_VERSION
    standard_url: str = STANDARD_URL
    research_url: str = PAPER_URL
    spot_id: int
    queried_at: AwareDatetime
    status: Literal["available", "historical", "no_data", "conflict", "unsupported"]
    grade: int | None = Field(default=None, ge=1, le=5)
    label: str | None = None
    wqi: float | None = None
    basis: Literal["official_grade", "official_wqi_index", "none"] = "none"
    provider: Literal["koem_water_quality"] | None = None
    station_id: int | None = None
    station_name: str | None = None
    source_spot_id: int | None = None
    relation: Literal["station_observation_point", "nearby_station_context"] | None = (
        None
    )
    distance_km: float | None = Field(default=None, ge=0, le=10)
    observed_at: AwareDatetime | None = None
    age_days: int | None = Field(default=None, ge=0)
    current_beach_grade: None = None
    safety_status: Literal["unknown"] = "unknown"
    reason_codes: tuple[str, ...] = ()
    measurements: tuple[GradeMeasurement, ...] = Field(default=(), max_length=100)
    sources: tuple[GradeSource, ...] = Field(default=(), max_length=100)
