"""Strict assessment DTOs and trusted producer inputs, without implicit clocks."""

from typing import Annotated, Literal, Self
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import (
    AwareDatetime,
    BaseModel,
    ConfigDict,
    Field,
    StrictBool,
    StrictFloat,
    StringConstraints,
    model_validator,
)

Text = Annotated[str, StringConstraints(strict=True, min_length=1, max_length=500)]
Identifier = Annotated[
    str, StringConstraints(strict=True, min_length=1, max_length=200)
]
PositiveId = Annotated[int, Field(strict=True, gt=0)]
Count = Annotated[int, Field(strict=True, ge=0)]
Number = Annotated[StrictFloat, Field(allow_inf_nan=False)]
Activity = Literal["swim", "surf", "relax", "mudflat", "onsen", "rafting"]
# 지원하는 활동과 「추천 후보로 제시하는 활동」은 다릅니다. 강릉을 포함한
# 동해안은 서해안·남해안 같은 갯벌 지형이 발달하지 않아 mudflat 을 먼저
# 제안하지 않습니다. API 로 activity=mudflat 을 직접 물으면 여전히 평가합니다
# -- 지원 범위가 줄어든 것이 아니라 권하지 않을 뿐입니다.
RECOMMENDED_ACTIVITIES: tuple[Activity, ...] = (
    "swim",
    "surf",
    "relax",
    "onsen",
    "rafting",
)
Mode = Literal["observation", "forecast", "mixed", "none"]
InputMode = Literal["observation", "forecast"]
SafetyStatus = Literal[
    "restricted", "unknown", "caution", "no_known_restriction", "not_assessed"
]
Codes = Annotated[tuple[Identifier, ...], Field(max_length=100)]
GateId = Literal[
    "G_SUPPORT",
    "G_INPUT_CONTRACT",
    "G_PARAMETER_TRACE",
    "G_RULE_VERIFICATION",
    "G_EXTERNAL_VALIDATION",
    "G_FE_RELEASE",
    "G_OPERATIONS",
]
GateStatus = Literal["pass", "fail", "pending", "not_applicable"]


class Record(BaseModel):
    model_config = ConfigDict(
        extra="forbid", frozen=True, validate_default=True, allow_inf_nan=False
    )


class Target(Record):
    kind: Literal["instant", "interval"]
    start_at: AwareDatetime
    end_at: AwareDatetime | None = None
    timezone: Identifier

    @model_validator(mode="after")
    def validate_target(self) -> Self:
        if self.kind == "instant" and self.end_at is not None:
            raise ValueError("An instant has no end_at")
        if self.kind == "interval" and (
            self.end_at is None or self.end_at <= self.start_at
        ):
            raise ValueError("An interval requires start_at < end_at")
        try:
            ZoneInfo(self.timezone)
        except (ZoneInfoNotFoundError, ValueError) as exc:
            raise ValueError("A known IANA timezone is required") from exc
        return self


class Context(Record):
    profile_id: Identifier | None = None
    equipment_profile_id: Identifier | None = None
    skill_profile_id: Identifier | None = None
    exposure_duration_minutes: Annotated[Number, Field(gt=0)] | None = None


class Window(Record):
    valid_from: AwareDatetime | None = None
    valid_until: AwareDatetime | None = None

    @model_validator(mode="after")
    def validate_window(self) -> Self:
        if (self.valid_from is None) != (self.valid_until is None):
            raise ValueError("Both applicability endpoints or neither are required")
        if self.valid_from is not None and self.valid_until <= self.valid_from:
            raise ValueError("Applicability is a nonempty half-open interval")
        return self


class Aggregation(Record):
    start_at: AwareDatetime | None = None
    end_at: AwareDatetime | None = None
    method: Identifier | None = None
    recipe_id: Identifier | None = None
    coverage: Annotated[Number, Field(ge=0, le=1)] | None = None

    @model_validator(mode="after")
    def validate_aggregation(self) -> Self:
        if (self.start_at is None) != (self.end_at is None):
            raise ValueError("Aggregation requires both endpoints or neither")
        if self.start_at is not None and self.end_at <= self.start_at:
            raise ValueError("Aggregation start_at must precede end_at")
        return self


class InputDTO(Window):
    input_id: Identifier
    snapshot_id: PositiveId | None = None
    metric_id: PositiveId | None = None
    provider: Identifier
    provider_record_id: Identifier
    source_record_id: Identifier | None = None
    station_id: Identifier | None = None
    snapshot_station_id: PositiveId | None = None
    spot_id: PositiveId | None = None
    name: Identifier
    numeric_value: Number | None = None
    text_value: (
        Annotated[str, StringConstraints(strict=True, max_length=2000)] | None
    ) = None
    boolean_value: StrictBool | None = None
    unit: Annotated[str, StringConstraints(strict=True, max_length=80)] | None = None
    mode: InputMode
    state: Literal[
        "recorded", "current", "missing", "stale", "conflict", "superseded", "unknown"
    ]
    observed_at: AwareDatetime
    issued_at: AwareDatetime | None = None
    fetched_at: AwareDatetime
    time_role: Literal["observation_time", "forecast_target_start"]
    aggregation: Aggregation = Field(default_factory=Aggregation)
    spatial_scope: Text | None = None
    mapping_version: Identifier | None = None
    mapping_evidence_ref: Identifier | None = None
    quality_flags: Codes = ()
    used_by: Codes = ()

    @model_validator(mode="after")
    def validate_role(self) -> Self:
        expected = (
            "observation_time"
            if self.mode == "observation"
            else "forecast_target_start"
        )
        if self.time_role != expected:
            raise ValueError("time_role must preserve observation/forecast meaning")
        if self.mode == "observation" and self.observed_at > self.fetched_at:
            raise ValueError("Observation cannot follow its fetch time")
        if self.issued_at is not None and self.issued_at > self.fetched_at:
            raise ValueError("Issue time cannot follow its fetch time")
        return self


class AuthorityEvidence(Window):
    """Internal trusted-producer attestation, never a public request body."""

    evidence_ref: Identifier
    provider: Identifier
    provider_record_id: Identifier
    spot_id: PositiveId
    activity: Activity
    authority: Text
    authoritative: StrictBool = False
    source_status: Literal["active", "bulletin", "ended", "unknown"] = "unknown"
    state: Literal["current", "missing", "stale", "conflict", "superseded", "unknown"]
    fetched_at: AwareDatetime
    issued_at: AwareDatetime | None = None
    input_refs: Codes = ()

    @model_validator(mode="after")
    def validate_issue(self) -> Self:
        if self.issued_at is not None and self.issued_at > self.fetched_at:
            raise ValueError("Authority issue time cannot follow its fetch time")
        return self


class SupportEvidence(AuthorityEvidence):
    status: Literal["supported", "unsupported", "unknown"]
    scope: Text
    mapping_version: Identifier


class SafetyEvidence(AuthorityEvidence):
    check_id: Identifier
    rule_id: Identifier
    effect: Literal["restricted", "caution", "clear"]
    scope: Text
    parameter_ids: Codes = ()
    evidence_ids: Codes = ()


class Quality(Record):
    status: Literal["sufficient", "partial", "insufficient", "unknown"] = "unknown"
    required_total: Count | None = None
    required_usable: Count | None = None
    optional_total: Count | None = None
    optional_usable: Count | None = None
    missing_input_ids: Codes = ()
    stale_input_ids: Codes = ()
    conflicting_input_ids: Codes = ()
    unknown_issue_input_ids: Codes = ()

    @model_validator(mode="after")
    def validate_counts(self) -> Self:
        for total, usable in [
            (self.required_total, self.required_usable),
            (self.optional_total, self.optional_usable),
        ]:
            if (total is None) != (usable is None):
                raise ValueError("Unknown requirements require unknown usable counts")
            if total is not None and usable > total:
                raise ValueError("Usable cannot exceed total")
        if self.status == "sufficient" and (
            self.required_total is None
            or self.required_total == 0
            or self.required_usable != self.required_total
        ):
            raise ValueError("Sufficient needs a nonempty complete required list")
        return self


class QualityLayers(Record):
    support: Quality = Field(default_factory=Quality)
    safety: Quality = Field(default_factory=Quality)
    environment: Quality = Field(default_factory=Quality)


class DataQuality(Quality):
    by_layer: QualityLayers = Field(default_factory=QualityLayers)


class SupportDTO(Window):
    status: Literal["supported", "unsupported", "unknown"] = "unknown"
    reason_codes: Codes = ()
    evidence_refs: Codes = ()
    source_evidence: Annotated[tuple[SupportEvidence, ...], Field(max_length=100)] = ()

    @model_validator(mode="after")
    def validate_evidence(self) -> Self:
        if self.status != "unknown" and (
            not self.evidence_refs
            or not self.source_evidence
            or self.valid_from is None
        ):
            raise ValueError("Known support needs explicit evidence and applicability")
        if set(self.evidence_refs) != {e.evidence_ref for e in self.source_evidence}:
            raise ValueError("Support references must resolve in source_evidence")
        if self.status != "unknown" and any(
            e.status != self.status for e in self.source_evidence
        ):
            raise ValueError("Conflicting support evidence cannot confirm support")
        return self


class SafetyNotice(SafetyEvidence):
    """A displayed authority notice retains the full source attestation."""

    effect: Literal["restricted", "caution"]
    evidence_refs: Annotated[
        tuple[Identifier, ...], Field(min_length=1, max_length=100)
    ]


class SafetyDTO(Window):
    status: SafetyStatus = "not_assessed"
    required_checks_complete: StrictBool = False
    checked_rule_ids: Codes = ()
    missing_check_ids: Codes = ()
    warnings: Annotated[tuple[SafetyNotice, ...], Field(max_length=100)] = ()
    restrictions: Annotated[tuple[SafetyNotice, ...], Field(max_length=100)] = ()
    reason_codes: Codes = ()

    @model_validator(mode="after")
    def validate_completed(self) -> Self:
        if self.status in {"caution", "no_known_restriction"} and (
            not self.required_checks_complete
            or not self.checked_rule_ids
            or self.missing_check_ids
        ):
            raise ValueError("Completed safety requires nonempty complete checks")
        if self.status == "restricted" and not self.restrictions:
            raise ValueError("Restricted requires explicit restriction evidence")
        if self.status == "no_known_restriction" and (
            self.warnings or self.restrictions
        ):
            raise ValueError("A known warning/restriction cannot be cleared")
        return self


class Component(Record):
    input_refs: Codes = ()
    parameter_ids: Codes = ()
    evidence_ids: Codes = ()
    explanation_codes: Codes = ()
    contribution: Number | None = None
    contribution_unit: Identifier | None = None
    direction: Literal["positive", "negative", "neutral", "unknown", "not_scored"] = (
        "not_scored"
    )


class EnvironmentDTO(Window):
    status: Literal[
        "evaluated",
        "not_evaluable",
        "withheld",
        "not_applicable",
        "model_unimplemented",
    ] = "model_unimplemented"
    score: Annotated[Number, Field(ge=0, le=100)] | None = None
    score_scale: Literal["index_0_100"] | None = None
    score_semantics: Text | None = None
    components: Annotated[tuple[Component, ...], Field(max_length=100)] = ()
    reason_codes: Codes = ()

    @model_validator(mode="after")
    def validate_score(self) -> Self:
        if self.score is not None and (
            self.status != "evaluated" or self.score_scale != "index_0_100"
        ):
            raise ValueError("A number requires an evaluated, defined scale")
        if self.status == "evaluated" and self.score is None:
            raise ValueError("Evaluated environment needs a numeric result")
        return self


class PreferenceDTO(Record):
    status: Literal["not_modelled"] = "not_modelled"
    score: None = None
    ranking: None = None
    comparison_scope: None = None
    reason_codes: Codes = ("preference_not_modelled",)


class RecommendationDTO(Record):
    status: Literal[
        "not_supported",
        "unavailable",
        "do_not_proceed",
        "check_required",
        "conditional_information",
        "information_only",
    ]
    message_code: Identifier
    reason_codes: Codes = ()
    activity: Activity
    action_codes: Codes = ()
    ranking: None = None


class ModelDTO(Record):
    model_id: Identifier
    model_version: Identifier
    ruleset_version: Identifier
    parameter_set_version: Identifier
    evidence_version: Identifier
    status: Literal[
        "unimplemented", "experimental", "candidate", "validated", "retired"
    ]
    validation_status: Literal[
        "not_evaluated", "internal_only", "external_validation_passed"
    ]
    evidence_level: Literal["direct", "indirect", "mixed", "insufficient"]
    validated_scope: Text | None = None
    gate_results: dict[GateId, GateStatus] = Field(max_length=7)

    @model_validator(mode="after")
    def validate_gate_keys(self) -> Self:
        if len(self.gate_results) != 7:
            raise ValueError("All seven release gates must be explicit")
        return self


def recommendation_status(
    support_status: str, safety_status: str, environment_status: str
) -> str:
    """Shared routing invariant for evaluation and persisted DTO validation."""
    if support_status == "unsupported":
        return "not_supported"
    if support_status == "unknown":
        return "check_required"
    if safety_status == "restricted":
        return "do_not_proceed"
    if safety_status in {"unknown", "not_assessed"}:
        return "check_required"
    if safety_status == "caution":
        return "conditional_information"
    if environment_status != "evaluated":
        return "unavailable"
    return "information_only"


class EvaluationRequest(Record):
    """Trusted offline producer input; never accepted by a GET endpoint."""

    target_id: Identifier
    spot_id: PositiveId
    activity: Activity
    target: Target
    as_of: AwareDatetime
    evaluated_at: AwareDatetime
    context: Context = Field(default_factory=Context)
    assessment_id: Identifier | None = None
    input_manifest_id: Identifier | None = None
    inputs: Annotated[tuple[InputDTO, ...], Field(max_length=100)] = ()
    support_evidence: Annotated[tuple[SupportEvidence, ...], Field(max_length=100)] = ()
    safety_evidence: Annotated[tuple[SafetyEvidence, ...], Field(max_length=100)] = ()
    forecast_coverage: Annotated[tuple[Target, ...], Field(max_length=100)] | None = (
        None
    )
    requested_mode: Mode = "none"

    @model_validator(mode="after")
    def validate_request(self) -> Self:
        if self.evaluated_at < self.as_of:
            raise ValueError("Evaluation cannot precede its knowledge cutoff")
        if len({i.input_id for i in self.inputs}) != len(self.inputs):
            raise ValueError("Duplicate input_id")
        refs = {i.input_id for i in self.inputs}
        for e in (*self.support_evidence, *self.safety_evidence):
            if not set(e.input_refs).issubset(refs):
                raise ValueError("Authority input_refs must resolve in inputs")
        return self


class AssessmentDTO(Window):
    contract_version: Literal["water-assessment.v1-draft"] = "water-assessment.v1-draft"
    target_id: Identifier
    assessment_id: Identifier | None = None
    input_manifest_id: Identifier | None = None
    spot_id: PositiveId
    activity: Activity
    context: Context = Field(default_factory=Context)
    target: Target
    as_of: AwareDatetime | None = None
    evaluated_at: AwareDatetime | None = None
    queried_at: AwareDatetime | None = None
    mode: Mode = "none"
    score: Annotated[Number, Field(ge=0, le=100)] | None = None
    availability: Literal[
        "available", "partial", "unavailable", "unsupported", "unknown"
    ] = "unknown"
    assessment_status: Literal[
        "evaluated",
        "not_evaluable",
        "withheld",
        "unsupported",
        "support_unknown",
        "outside_forecast_horizon",
        "model_unimplemented",
    ]
    reason_codes: Codes = ()
    safety_status: SafetyStatus
    support: SupportDTO
    safety: SafetyDTO
    environment: EnvironmentDTO
    preference: PreferenceDTO = Field(default_factory=PreferenceDTO)
    recommendation: RecommendationDTO
    data_quality: DataQuality = Field(default_factory=DataQuality)
    model: ModelDTO
    inputs: Annotated[tuple[InputDTO, ...], Field(max_length=100)] = ()

    @model_validator(mode="after")
    def validate_consistency(self) -> Self:
        if self.safety.status in {"caution", "no_known_restriction"}:
            raise ValueError("Current safety requirement lists are unapproved")
        if self.score != self.environment.score:
            raise ValueError("score must equal environment.score")
        if self.safety_status != self.safety.status:
            raise ValueError("safety_status must equal safety.status")
        if self.recommendation.activity != self.activity:
            raise ValueError("Recommendation activity must match the assessment")
        expected_recommendation = recommendation_status(
            self.support.status, self.safety.status, self.environment.status
        )
        if self.recommendation.status != expected_recommendation:
            raise ValueError("Recommendation must preserve support/safety precedence")
        if self.support.status != "supported" and self.safety.status != "not_assessed":
            raise ValueError("Unconfirmed/unsupported activity safety is not_assessed")
        if self.support.status == "supported" and self.safety.status == "not_assessed":
            raise ValueError("Supported activity must retain missing safety checks")
        expected_status = None
        if self.support.status == "unsupported":
            expected_status = "unsupported"
        elif self.support.status == "unknown":
            expected_status = "support_unknown"
        elif self.safety.status == "restricted":
            expected_status = "withheld"
        elif self.assessment_status == "outside_forecast_horizon":
            expected_status = "outside_forecast_horizon"
        elif self.safety.status == "unknown":
            expected_status = "withheld"
        elif self.model.status == "unimplemented":
            expected_status = "model_unimplemented"
        if expected_status and self.assessment_status != expected_status:
            raise ValueError("Assessment status violates layer precedence")
        if self.support.status != "supported":
            if self.environment.status != "not_applicable":
                raise ValueError("Unconfirmed support makes environment not_applicable")
        elif self.safety.status in {"restricted", "unknown"}:
            if self.environment.status != "withheld":
                raise ValueError("Public environment must be withheld")
        if self.as_of is None and (
            self.support.status != "unknown" or any(i.used_by for i in self.inputs)
        ):
            raise ValueError("A target-only diagnostic has no evaluated evidence")
        if len({i.input_id for i in self.inputs}) != len(self.inputs):
            raise ValueError("Duplicate input_id")
        if self.evaluated_at is not None and (
            self.as_of is None or self.evaluated_at < self.as_of
        ):
            raise ValueError("Evaluation requires an earlier knowledge cutoff")
        for evidence in (
            *self.support.source_evidence,
            *self.safety.warnings,
            *self.safety.restrictions,
        ):
            applies = False
            if evidence.valid_from is not None:
                if (
                    isinstance(evidence, SafetyNotice)
                    and self.target.end_at is not None
                ):
                    applies = (
                        evidence.valid_from < self.target.end_at
                        and evidence.valid_until > self.target.start_at
                    )
                else:
                    applies = (
                        evidence.valid_from
                        <= self.target.start_at
                        < evidence.valid_until
                        and (
                            self.target.end_at is None
                            or self.target.end_at <= evidence.valid_until
                        )
                    )
            if (
                self.as_of is None
                or not evidence.authoritative
                or evidence.source_status != "active"
                or evidence.state != "current"
                or evidence.spot_id != self.spot_id
                or evidence.activity != self.activity
                or evidence.fetched_at > self.as_of
                or (evidence.issued_at is not None and evidence.issued_at > self.as_of)
                or not applies
            ):
                raise ValueError(
                    "Displayed authority evidence must apply at the cutoff"
                )
            referenced_inputs = {item.input_id: item for item in self.inputs}
            required_start = self.target.start_at
            required_end = self.target.end_at
            if isinstance(evidence, SafetyNotice) and required_end is not None:
                required_start = max(required_start, evidence.valid_from)
                required_end = min(required_end, evidence.valid_until)
            for ref in evidence.input_refs:
                item = referenced_inputs.get(ref)
                if (
                    item is None
                    or item.state not in {"recorded", "current"}
                    or item.fetched_at > self.as_of
                    or (item.issued_at is not None and item.issued_at > self.as_of)
                    or (item.mode == "observation" and item.observed_at > self.as_of)
                    or item.valid_from is None
                    or not item.valid_from <= required_start < item.valid_until
                    or (required_end is not None and required_end > item.valid_until)
                    or "input_conflict" in item.quality_flags
                ):
                    raise ValueError(
                        "Authority input reference does not cover its claim"
                    )
        used = [i for i in self.inputs if i.used_by]
        if used and self.as_of is None:
            raise ValueError("Used inputs require an immutable as_of")
        for i in used:
            if (
                i.fetched_at > self.as_of
                or (i.issued_at is not None and i.issued_at > self.as_of)
                or (i.mode == "observation" and i.observed_at > self.as_of)
            ):
                raise ValueError("Used input was not known at assessment as_of")
        modes = {i.mode for i in used}
        expected_mode = (
            "none" if not modes else "mixed" if len(modes) > 1 else next(iter(modes))
        )
        if self.mode != expected_mode:
            raise ValueError("Assessment mode must describe actually used inputs")
        if self.score is not None:
            # Numeric models are deliberately unavailable in this registry/version.
            raise ValueError("Numeric public scoring is not implemented")
        if self.assessment_status == "evaluated":
            raise ValueError("This version has no evaluated numeric model")
        return self
