"""Versioned A8 contracts. User observations never acquire official authority."""

from datetime import UTC, datetime, timedelta
from typing import Literal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import (
    AwareDatetime,
    BaseModel,
    ConfigDict,
    Field,
    field_validator,
    model_validator,
)

ANALYSIS_VERSION = "quality-observation-rules.v1"
COMPARISON_VERSION = "quality-comparison.v1"


class Record(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False, frozen=True)


class Measurement(Record):
    item: str = Field(min_length=1, max_length=80, pattern=r"^[a-z][a-z0-9_]*$")
    value: float | None
    unit: str | None = Field(default=None, max_length=40)
    method: str | None = Field(default=None, max_length=120)
    sampled_at: AwareDatetime
    sampled_until: AwareDatetime | None = None
    sample_precision: Literal["instant", "day", "interval", "unknown"] = "instant"
    scope: str | None = Field(default=None, max_length=200)

    @model_validator(mode="after")
    def valid_sample(self):
        if self.sampled_until is not None and self.sampled_until <= self.sampled_at:
            raise ValueError("Sampling interval must be positive")
        if self.sample_precision in {"day", "interval"} and not self.sampled_until:
            raise ValueError("Interval/day sampling requires sampled_until")
        return self


class ObservationInput(Record):
    review_id: str = Field(min_length=1, max_length=120, pattern=r"^[A-Za-z0-9_-]+$")
    revision: int = Field(ge=1, le=100000)
    spot_id: int = Field(gt=0)
    kind: Literal["review", "field_observation"] = "review"
    observed_at: AwareDatetime
    observed_until: AwareDatetime | None = None
    timezone: str = "Asia/Seoul"
    spatial_relation: Literal["at_spot", "nearby", "unknown"]
    text: str = Field(min_length=1, max_length=4000)
    source_record_id: str | None = Field(default=None, max_length=120)
    measurements: tuple[Measurement, ...] = Field(default=(), max_length=20)
    retracted: bool = False

    @field_validator("timezone")
    @classmethod
    def real_timezone(cls, value):
        try:
            ZoneInfo(value)
        except ZoneInfoNotFoundError:
            raise ValueError("Unknown timezone") from None
        return value

    @model_validator(mode="after")
    def valid_observation(self):
        if self.observed_until is not None and not (
            timedelta(0) < self.observed_until - self.observed_at <= timedelta(days=1)
        ):
            raise ValueError("An observation interval is bounded to one day")
        end = self.observed_until or self.observed_at
        for measurement in self.measurements:
            if not self.observed_at <= measurement.sampled_at <= end:
                raise ValueError("A measurement must be inside the observation period")
            if measurement.sampled_until and measurement.sampled_until > end:
                raise ValueError("A sample must fit the observation period")
        if self.revision == 1 and self.retracted:
            raise ValueError("Retraction requires a previous observation")
        return self

    def check_cutoff(self, now: datetime):
        if (self.observed_until or self.observed_at) > now.astimezone(UTC):
            raise ValueError("Future observation is not accepted")


class Signal(Record):
    category: Literal["turbidity", "odor", "debris", "clarity"]
    polarity: Literal["present", "absent", "ambiguous"]
    start: int = Field(ge=0)
    end: int = Field(gt=0)
    rule_id: str


class StoredObservation(Record):
    evidence_id: str
    owner_key: str
    received_at: AwareDatetime
    input: ObservationInput
    signals: tuple[Signal, ...]
    analysis_version: str = ANALYSIS_VERSION
    duplicate_fingerprint: str


class OfficialSample(Record):
    evidence_id: str
    spot_id: int = Field(gt=0)
    station_id: int | None = None
    provider: Literal["koem_water_quality", "nier_water_quality"]
    provider_record_id: str
    source_record_id: str | None
    observed_at: AwareDatetime
    sampled_until: AwareDatetime | None
    fetched_at: AwareDatetime
    issued_at: AwareDatetime | None
    valid_until: AwareDatetime
    spatial_scope: str | None
    revision_state: str
    measurements: tuple[Measurement, ...]
    official_grade: str | None = None
    source_spot_id: int | None = None
    place_relation: Literal["station_observation_point", "representative_station"] = (
        "station_observation_point"
    )
    mapping_ref: str | None = None
    mapping_version: str | None = None
    mapping_scope: str | None = None
    mapping_source_url: str | None = None


class ReviewReference(Record):
    evidence_id: str
    review_id: str
    revision: int
    kind: Literal["review", "field_observation"]
    observed_at: AwareDatetime
    observed_until: AwareDatetime | None
    received_at: AwareDatetime
    spatial_relation: Literal["at_spot", "nearby", "unknown"]
    source_record_id: str | None


class SignalReference(Signal):
    evidence_id: str
    analysis_version: str


class MeasurementComparison(Record):
    official_evidence_id: str
    review_evidence_id: str
    item: str
    status: Literal["comparable", "not_comparable"]
    reason_codes: list[str] = Field(max_length=100)
    official_value: float | None = None
    reported_value: float | None = None
    unit: str | None = None
    reported_unit: str | None = None
    official_method: str | None = None
    reported_method: str | None = None
    difference: float | None
    agreement: Literal["unknown"] = "unknown"


class ExcludedReview(Record):
    evidence_id: str
    reason_codes: list[str] = Field(max_length=100)


class ComparisonResult(Record):
    contract_version: Literal["water-quality.v1"]
    analysis_version: str
    comparison_version: str
    spot_id: int = Field(gt=0)
    as_of: AwareDatetime
    status: Literal[
        "no_review_data",
        "no_official_data",
        "not_comparable",
        "conflicting_observations",
        "measurements_compared",
        "observation_signals_present",
        "context_only",
    ]
    reason_codes: list[str] = Field(max_length=100)
    sample_count: int = Field(ge=0)
    comparable_review_count: int = Field(ge=0)
    independent_observer_count: int = Field(ge=0)
    duplicate_count: int = Field(ge=0)
    official_sample_count: int = Field(ge=0)
    latest_review_at: AwareDatetime | None
    official_sources: list[OfficialSample] = Field(max_length=100)
    review_evidence: list[ReviewReference] = Field(max_length=100)
    signals: list[SignalReference] = Field(max_length=100)
    measurement_comparisons: list[MeasurementComparison] = Field(max_length=100)
    excluded_reviews: list[ExcludedReview] = Field(max_length=100)
    input_truncated: bool
    confidence_percent: None = None
    official_grade_override: None = None
    safety_status: Literal["unknown"]
    model_validation_status: Literal["not_validated"]


class ComparisonRow(ComparisonResult):
    analysis_id: str
    available_at: AwareDatetime
    from_at: AwareDatetime = Field(alias="from")
    until_at: AwareDatetime = Field(alias="until")
    freshness: Literal["current", "stale"]
    review_age_seconds: float | None = Field(ge=0)


class ComparisonEnvelope(Record):
    contract_version: Literal["water-quality.v1"]
    rows: list[ComparisonRow] = Field(max_length=100)
    total: int = Field(ge=0)
    page: int = Field(ge=1, le=1000)
    page_size: int = Field(ge=1, le=100)
    as_of: AwareDatetime
    queried_at: AwareDatetime
    status: Literal["available", "analysis_pending"]
    reason_codes: list[str] = Field(max_length=100)


class ObservationReceipt(Record):
    evidence_id: str
    review_id: str
    revision: int
    created: bool
    received_at: AwareDatetime
    signals: tuple[Signal, ...] = Field(max_length=100)
    analysis_version: str
    status: Literal["retracted", "analysis_pending"]


class OwnerObservation(Record):
    evidence_id: str
    received_at: AwareDatetime
    input: ObservationInput
    signals: tuple[Signal, ...] = Field(max_length=100)
    analysis_version: str
    duplicate_fingerprint: str


class OwnerObservationEnvelope(Record):
    rows: list[OwnerObservation] = Field(max_length=100)
    total: int
    page: int
    page_size: int
