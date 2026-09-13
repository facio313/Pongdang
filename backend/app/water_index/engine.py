"""Pure support/restriction evaluation. No clock, DB, network or numeric model."""

from dataclasses import dataclass
from datetime import datetime

from .models import (
    Activity,
    AssessmentDTO,
    AuthorityEvidence,
    Context,
    DataQuality,
    EnvironmentDTO,
    EvaluationRequest,
    InputDTO,
    Quality,
    QualityLayers,
    RecommendationDTO,
    SafetyDTO,
    SafetyEvidence,
    SafetyNotice,
    SupportDTO,
    Target,
    recommendation_status,
)
from .registry import (
    CONTEXT_PROFILES,
    EVIDENCE_IDS,
    PARAMETER_IDS,
    PROFILES,
    InputPolicy,
    default_model,
)


def _codes(values) -> tuple[str, ...]:
    return tuple(sorted(set(values)))


def covers(start: datetime | None, end: datetime | None, target: Target) -> bool:
    """Contain the entire target in a half-open applicability window."""
    if start is None or end is None or not start <= target.start_at < end:
        return False
    return target.end_at is None or target.end_at <= end


def overlaps(start: datetime | None, end: datetime | None, target: Target) -> bool:
    """An official restriction during any part cannot disappear from an interval."""
    if target.kind == "instant":
        return covers(start, end, target)
    return (
        start is not None
        and end is not None
        and start < target.end_at
        and end > target.start_at
    )


@dataclass(frozen=True)
class InputInspection:
    usable: bool
    reason_codes: tuple[str, ...]


def inspect_input(
    item: InputDTO,
    *,
    as_of: datetime,
    target: Target,
    policy: InputPolicy | None = None,
) -> InputInspection:
    """Check a single declared contract without approving it or calculating score."""
    if as_of.tzinfo is None or as_of.utcoffset() is None:
        raise ValueError("as_of must include an offset")
    flags = list(item.quality_flags)
    state_reason = {
        "missing": "input_missing",
        "stale": "input_stale",
        "conflict": "input_conflict",
        "superseded": "input_superseded",
        "unknown": "input_state_unknown",
    }
    if item.state in state_reason:
        flags.append(state_reason[item.state])
    if all(
        v is None for v in (item.numeric_value, item.text_value, item.boolean_value)
    ):
        flags.append("input_missing")
    if (
        item.fetched_at > as_of
        or (item.issued_at is not None and item.issued_at > as_of)
        or (item.mode == "observation" and item.observed_at > as_of)
    ):
        flags.append("input_not_known_at_as_of")
    if not covers(item.valid_from, item.valid_until, target):
        flags.append("input_outside_validity")
    if item.valid_until is not None and item.valid_until <= target.start_at:
        flags.append("input_stale")
    if not item.unit:
        flags.append("input_unit_unknown")
    if item.mode == "forecast" and item.issued_at is None:
        flags.append("issue_time_unknown")
    if not item.aggregation.method:
        flags.append("input_aggregation_unknown")
    if not item.spatial_scope or not item.mapping_version:
        flags.append("station_mapping_unverified")
    if policy is None:
        flags.append("parameter_unresolved")
    else:
        if item.name != policy.name:
            flags.append("input_definition_mismatch")
        if item.unit != policy.unit:
            flags.append("input_unit_mismatch")
        if item.aggregation.method != policy.aggregation_method:
            flags.append("input_aggregation_mismatch")
        if (
            item.spatial_scope != policy.spatial_scope
            or item.mapping_version != policy.mapping_version
        ):
            flags.append("station_mapping_unverified")
        if policy.aggregation_method != "instant":
            if (
                item.aggregation.start_at is None
                or item.aggregation.recipe_id != policy.recipe_id
                or policy.recipe_id is None
            ):
                flags.append("input_aggregation_unknown")
            if policy.minimum_aggregation_coverage is None:
                flags.append("parameter_unresolved")
            elif (
                item.aggregation.coverage is None
                or item.aggregation.coverage < policy.minimum_aggregation_coverage
            ):
                flags.append("aggregation_coverage_insufficient")
            if (
                item.mode == "observation"
                and item.aggregation.end_at is not None
                and item.aggregation.end_at > as_of
            ):
                flags.append("input_not_known_at_as_of")
        origin = item.observed_at if item.mode == "observation" else item.issued_at
        max_age = (
            policy.max_observation_age_seconds
            if item.mode == "observation"
            else policy.max_issue_age_seconds
        )
        if max_age is None:
            flags.append("parameter_unresolved")
        elif origin is not None and (as_of - origin).total_seconds() > max_age:
            flags.append("input_stale")
    return InputInspection(not flags, _codes(flags))


def _intersection(records) -> tuple[datetime | None, datetime | None]:
    windows = [(r.valid_from, r.valid_until) for r in records]
    if not windows or any(a is None or b is None for a, b in windows):
        return None, None
    start = max(a for a, _ in windows)
    end = min(b for _, b in windows)
    return (start, end) if start < end else (None, None)


def _authority_usable(
    evidence: AuthorityEvidence,
    request: EvaluationRequest,
    inputs: dict,
    *,
    partial: bool = False,
) -> bool:
    applies = overlaps if partial else covers
    if not (
        evidence.authoritative
        and evidence.source_status == "active"
        and evidence.state == "current"
        and evidence.spot_id == request.spot_id
        and evidence.activity == request.activity
        and evidence.fetched_at <= request.as_of
        and (evidence.issued_at is None or evidence.issued_at <= request.as_of)
        and applies(evidence.valid_from, evidence.valid_until, request.target)
    ):
        return False
    # A direct authority statement has its own scope/validity contract. Referenced
    # raw data must still be known and current; unapproved numeric recipes do not
    # convert the statement into an environmental score.
    required_start = request.target.start_at
    required_end = request.target.end_at
    if partial and required_end is not None:
        required_start = max(required_start, evidence.valid_from)
        required_end = min(required_end, evidence.valid_until)
    for ref in evidence.input_refs:
        item = inputs[ref]
        reference_covers_claim = (
            item.valid_from is not None
            and item.valid_from <= required_start < item.valid_until
            and (required_end is None or required_end <= item.valid_until)
        )
        if (
            item.state not in {"current", "recorded"}
            or item.fetched_at > request.as_of
            or (item.issued_at is not None and item.issued_at > request.as_of)
            or (item.mode == "observation" and item.observed_at > request.as_of)
            or not reference_covers_claim
            or "input_conflict" in item.quality_flags
        ):
            return False
    return True


def _conflicting_refs(evidence) -> set[str]:
    groups = {}
    for item in evidence:
        groups.setdefault(item.evidence_ref, []).append(item)
    return {
        ref
        for ref, group in groups.items()
        if any(item != group[0] for item in group[1:])
    }


def _conflicting_inputs(items: tuple[InputDTO, ...]) -> set[str]:
    groups = {}
    for item in items:
        key = (
            item.provider,
            item.provider_record_id,
            item.name,
            item.mode,
            item.observed_at,
            item.issued_at,
        )
        groups.setdefault(key, []).append(item)
    result = set()
    for group in groups.values():
        signatures = {
            item.model_dump_json(
                exclude={
                    "input_id",
                    "snapshot_id",
                    "metric_id",
                    "fetched_at",
                    "quality_flags",
                    "used_by",
                }
            )
            for item in group
        }
        if len(signatures) > 1:
            result.update(item.input_id for item in group)
    return result


def _notice(evidence: SafetyEvidence) -> SafetyNotice:
    return SafetyNotice(
        **evidence.model_dump(),
        evidence_refs=(evidence.evidence_ref,),
    )


def _recommendation(
    activity: Activity,
    support: SupportDTO,
    safety: SafetyDTO,
    environment: EnvironmentDTO,
) -> RecommendationDTO:
    status = recommendation_status(support.status, safety.status, environment.status)
    messages = {
        "not_supported": ("ACTIVITY_NOT_SUPPORTED", ()),
        "check_required": (
            "CHECK_ACTIVITY_CONDITIONS",
            ("CHECK_OFFICIAL_INFORMATION",),
        ),
        "do_not_proceed": ("ACTIVITY_RESTRICTED", ("FOLLOW_OFFICIAL_RESTRICTION",)),
        "conditional_information": (
            "CONDITIONAL_ACTIVITY_INFORMATION",
            ("CHECK_OFFICIAL_INFORMATION",),
        ),
        "unavailable": ("ASSESSMENT_UNAVAILABLE", ()),
        "information_only": ("ENVIRONMENT_INDEX_INFORMATION", ()),
    }
    message, actions = messages[status]
    if support.status == "unknown":
        message = "CHECK_ACTIVITY_SUPPORT"
    return RecommendationDTO(
        status=status,
        message_code=message,
        activity=activity,
        reason_codes=_codes((*support.reason_codes, *safety.reason_codes)),
        action_codes=actions,
    )


def diagnostic_assessment(
    *,
    target_id: str,
    spot_id: int,
    activity: Activity,
    target: Target,
    context: Context | None = None,
) -> AssessmentDTO:
    """Describe an existing target lacking an assessment; never evaluate evidence.

    No ID, clock, input manifest or model output is created. The caller supplies
    an already persisted target ID. Stored restrictions/results take precedence.
    """
    support = SupportDTO(reason_codes=("activity_support_unknown",))
    safety = SafetyDTO(reason_codes=("activity_support_unknown",))
    environment = EnvironmentDTO(
        status="not_applicable", reason_codes=("model_unimplemented",)
    )
    return AssessmentDTO(
        target_id=target_id,
        spot_id=spot_id,
        activity=activity,
        context=context or Context(),
        target=target,
        assessment_status="support_unknown",
        safety_status=safety.status,
        reason_codes=("activity_support_unknown", "model_unimplemented"),
        support=support,
        safety=safety,
        environment=environment,
        recommendation=_recommendation(activity, support, safety, environment),
        model=default_model(),
    )


def evaluate(request: EvaluationRequest) -> AssessmentDTO:
    """Evaluate explicit trusted evidence without I/O or inventing model values."""
    if not isinstance(request, EvaluationRequest):
        raise TypeError("evaluate requires a validated EvaluationRequest")
    profile = PROFILES[request.activity]
    reasons = ["model_unimplemented", "parameter_unresolved"]
    conflicting_inputs = _conflicting_inputs(request.inputs)
    input_map = {
        item.input_id: item.model_copy(
            update={"quality_flags": _codes((*item.quality_flags, "input_conflict"))}
        )
        if item.input_id in conflicting_inputs
        else item
        for item in request.inputs
    }
    inspections = {
        item.input_id: inspect_input(item, as_of=request.as_of, target=request.target)
        for item in input_map.values()
    }
    support_conflicts = _conflicting_refs(request.support_evidence)
    safety_conflicts = _conflicting_refs(request.safety_evidence)
    conflicts = support_conflicts | safety_conflicts
    if conflicts:
        reasons.append("input_conflict")
    support_records = tuple(
        sorted(
            {
                e.evidence_ref: e
                for e in request.support_evidence
                if e.evidence_ref not in support_conflicts
                and _authority_usable(e, request, input_map)
            }.values(),
            key=lambda e: e.evidence_ref,
        )
    )
    statuses = {e.status for e in support_records}
    support_reasons = []
    if statuses == {"supported"}:
        support_status = "supported"
    elif statuses == {"unsupported"}:
        support_status = "unsupported"
        support_reasons.append("activity_unsupported")
    else:
        support_status = "unknown"
        support_reasons.append("activity_support_unknown")
        if len(statuses) > 1:
            support_reasons.append("input_conflict")
    start, end = (
        _intersection(support_records) if support_status != "unknown" else (None, None)
    )
    support = SupportDTO(
        status=support_status,
        reason_codes=_codes(support_reasons),
        evidence_refs=_codes(e.evidence_ref for e in support_records),
        source_evidence=support_records,
        valid_from=start,
        valid_until=end,
    )
    # Only explicit authoritative restrictions are executable. Numeric safety
    # drafts (30min/40C/etc.) and generic grade mappings are not enabled.
    safety_records = tuple(
        sorted(
            {
                e.model_dump_json(): e
                for e in request.safety_evidence
                if _authority_usable(e, request, input_map, partial=e.effect != "clear")
                and set(e.parameter_ids).issubset(PARAMETER_IDS)
                and set(e.evidence_ids).issubset(EVIDENCE_IDS)
            }.values(),
            key=lambda e: (e.evidence_ref, e.effect, e.model_dump_json()),
        )
    )
    warnings = tuple(_notice(e) for e in safety_records if e.effect == "caution")
    restrictions = tuple(_notice(e) for e in safety_records if e.effect == "restricted")
    safety_reasons = []
    missing = ()
    if support.status != "supported":
        safety_status = "not_assessed"
        safety_reasons.append(
            "activity_support_unknown"
            if support.status == "unknown"
            else "activity_unsupported"
        )
    else:
        # Every current profile has an unapproved required list. Clear statements
        # are not aggregated into safety completion or no_known_restriction.
        missing = (profile.parameter_ids[0],)
        safety_reasons.extend(("required_safety_check_missing", "parameter_unresolved"))
        safety_status = "restricted" if restrictions else "unknown"
    if restrictions:
        safety_reasons.append("official_restriction")
    if warnings:
        safety_reasons.append("official_caution_active")
    if any(
        e.effect != "clear" and not covers(e.valid_from, e.valid_until, request.target)
        for e in safety_records
    ):
        safety_reasons.append("partial_safety_coverage")
    if conflicts:
        safety_reasons.append("input_conflict")
    safety_start, safety_end = (
        _intersection(safety_records)
        if (safety_status == "restricted")
        else (None, None)
    )
    safety = SafetyDTO(
        status=safety_status,
        required_checks_complete=False,
        checked_rule_ids=_codes(e.rule_id for e in safety_records)
        if support.status == "supported"
        else (),
        missing_check_ids=missing,
        warnings=warnings,
        restrictions=restrictions,
        reason_codes=_codes(safety_reasons),
        valid_from=safety_start,
        valid_until=safety_end,
    )
    forecast_requested = (
        request.requested_mode in {"forecast", "mixed"}
        or request.target.start_at > request.as_of
    )
    outside = False
    if forecast_requested:
        if request.forecast_coverage is None:
            reasons.append("forecast_coverage_unknown")
        else:
            outside = not any(
                (window.kind == "instant" and request.target == window)
                or (
                    window.kind == "interval"
                    and covers(window.start_at, window.end_at, request.target)
                )
                for window in request.forecast_coverage
            )
            if outside:
                reasons.append("outside_forecast_horizon")
    if request.context.profile_id not in {None, *CONTEXT_PROFILES} or any(
        [
            request.context.equipment_profile_id is not None,
            request.context.skill_profile_id is not None,
            request.context.exposure_duration_minutes is not None,
        ]
    ):
        reasons.append("model_outside_validated_scope")
    if support.status == "unsupported":
        status = "unsupported"
    elif support.status == "unknown":
        status = "support_unknown"
    elif safety.status == "restricted":
        status = "withheld"
    elif outside:
        status = "outside_forecast_horizon"
    else:
        status = "withheld"
    environment = EnvironmentDTO(
        status="withheld" if support.status == "supported" else "not_applicable",
        reason_codes=_codes((*reasons, *safety.reason_codes)),
    )
    used_by = {item.input_id: set() for item in request.inputs}
    if support.status != "unknown":
        for e in support_records:
            for ref in e.input_refs:
                used_by[ref].add("support")
    if support.status == "supported":
        for e in safety_records:
            if e.effect != "clear":
                for ref in e.input_refs:
                    used_by[ref].add("safety")
    output_inputs = tuple(
        item.model_copy(
            update={
                "quality_flags": inspections[item.input_id].reason_codes,
                "used_by": _codes(used_by[item.input_id]),
            }
        )
        for item in sorted(request.inputs, key=lambda i: i.input_id)
    )
    modes = {item.mode for item in output_inputs if item.used_by}
    mode = "none" if not modes else "mixed" if len(modes) == 2 else next(iter(modes))
    flags_by_id = {key: set(value.reason_codes) for key, value in inspections.items()}
    for value in inspections.values():
        reasons.extend(value.reason_codes)
    quality_fields = {
        "missing_input_ids": _codes(
            k for k, v in flags_by_id.items() if "input_missing" in v
        ),
        "stale_input_ids": _codes(
            k for k, v in flags_by_id.items() if "input_stale" in v
        ),
        "conflicting_input_ids": _codes(
            k for k, v in flags_by_id.items() if "input_conflict" in v
        ),
        "unknown_issue_input_ids": _codes(
            k for k, v in flags_by_id.items() if "issue_time_unknown" in v
        ),
    }
    quality = DataQuality(
        **quality_fields,
        by_layer=QualityLayers(
            support=Quality(status="unknown"),
            safety=Quality(status="unknown"),
            environment=Quality(**quality_fields),
        ),
    )
    overall_start, overall_end = (
        _intersection((support, safety))
        if (safety.status == "restricted")
        else (None, None)
    )
    return AssessmentDTO(
        target_id=request.target_id,
        assessment_id=request.assessment_id,
        input_manifest_id=request.input_manifest_id,
        spot_id=request.spot_id,
        activity=request.activity,
        context=request.context,
        target=request.target,
        as_of=request.as_of,
        evaluated_at=request.evaluated_at,
        valid_from=overall_start,
        valid_until=overall_end,
        mode=mode,
        availability="unsupported"
        if support.status == "unsupported"
        else (
            "partial"
            if output_inputs or safety_records or support_records
            else "unknown"
        ),
        assessment_status=status,
        reason_codes=_codes((*reasons, *support.reason_codes, *safety.reason_codes)),
        safety_status=safety.status,
        support=support,
        safety=safety,
        environment=environment,
        recommendation=_recommendation(request.activity, support, safety, environment),
        data_quality=quality,
        model=default_model(),
        inputs=output_inputs,
    )
