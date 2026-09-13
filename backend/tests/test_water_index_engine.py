"""Pure contract cases, not field observations or scoring calibration data."""

import builtins
import hashlib
import json
import socket
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
from pydantic import ValidationError

from app.water_index.engine import diagnostic_assessment, evaluate, inspect_input
from app.water_index.models import (
    Aggregation,
    AssessmentDTO,
    EvaluationRequest,
    InputDTO,
    Quality,
    SafetyEvidence,
    SupportEvidence,
    Target,
)
from app.water_index.registry import (
    CONTEXT_PROFILES,
    DEFAULT_MODEL,
    EVIDENCE_IDS,
    PARAMETER_IDS,
    PROFILES,
    SOURCE_SHA256,
    InputPolicy,
    default_model,
    get_evidence,
    get_parameter,
    model_is_allowed,
    provenance_manifest,
)
from app.water_index.units import convert_exact

NOW = datetime(2026, 9, 14, 3, tzinfo=UTC)


def target(**changes):
    return Target(
        **{
            "kind": "instant",
            "start_at": NOW,
            "timezone": "Asia/Seoul",
            **changes,
        }
    )


def support(**changes):
    return SupportEvidence(
        **{
            "evidence_ref": "test:support:1",
            "provider": "test_authority",
            "provider_record_id": "support-record",
            "spot_id": 1,
            "activity": "swim",
            "authority": "test operator",
            "authoritative": True,
            "source_status": "active",
            "state": "current",
            "fetched_at": NOW,
            "issued_at": NOW - timedelta(minutes=10),
            "valid_from": NOW - timedelta(hours=1),
            "valid_until": NOW + timedelta(hours=1),
            "status": "supported",
            "scope": "approved test area",
            "mapping_version": "test-map-v1",
            **changes,
        }
    )


def safety(**changes):
    values = support().model_dump(exclude={"status", "mapping_version"})
    return SafetyEvidence(
        **{
            **values,
            "evidence_ref": "test:restriction:1",
            "provider_record_id": "restriction-record",
            "check_id": "operation",
            "rule_id": "official_operation_restriction",
            "effect": "restricted",
            "parameter_ids": ("PAR_SAFETY_NON_COMPENSATION",),
            "evidence_ids": ("SW08",),
            **changes,
        }
    )


def item(**changes):
    return InputDTO(
        **{
            "input_id": "test:input:1",
            "provider": "test_authority",
            "provider_record_id": "reading-record",
            "name": "wind_speed",
            "numeric_value": 3.0,
            "unit": "m/s",
            "mode": "observation",
            "state": "recorded",
            "observed_at": NOW - timedelta(minutes=5),
            "fetched_at": NOW,
            "valid_from": NOW - timedelta(minutes=5),
            "valid_until": NOW + timedelta(minutes=5),
            "time_role": "observation_time",
            "aggregation": Aggregation(method="instant"),
            "spatial_scope": "test-area",
            "mapping_version": "test-map-v1",
            **changes,
        }
    )


def request(**changes):
    return EvaluationRequest(
        **{
            "target_id": "test:target:1",
            "spot_id": 1,
            "activity": "swim",
            "target": target(),
            "as_of": NOW,
            "evaluated_at": NOW,
            "context": CONTEXT_PROFILES["general"],
            **changes,
        }
    )


def policy(**changes):
    # Test-only contract boundary, not a registered or scientifically valid TTL.
    return InputPolicy(
        **{
            "name": "wind_speed",
            "unit": "m/s",
            "aggregation_method": "instant",
            "spatial_scope": "test-area",
            "mapping_version": "test-map-v1",
            "max_observation_age_seconds": 300,
            "max_issue_age_seconds": 300,
            **changes,
        }
    )


def test_default_has_no_score_or_inferred_population():
    result = evaluate(request())
    assert result.score is result.environment.score is None
    assert result.model == DEFAULT_MODEL
    assert result.safety.status == "not_assessed"
    assert result.support.status == "unknown"
    assert result.assessment_status == "support_unknown"
    assert result.recommendation.message_code == "CHECK_ACTIVITY_SUPPORT"
    assert result.context.model_dump() == {
        "profile_id": "general",
        "equipment_profile_id": None,
        "skill_profile_id": None,
        "exposure_duration_minutes": None,
    }
    assert result.preference.score is result.preference.ranking is None
    assert result.data_quality.required_total is None


def test_diagnostic_has_only_caller_supplied_target_identity():
    result = diagnostic_assessment(
        target_id="persisted-target",
        spot_id=1,
        activity="swim",
        target=target(),
    )
    assert result.target_id == "persisted-target"
    assert result.assessment_id is result.input_manifest_id is None
    assert result.as_of is result.evaluated_at is result.queried_at is None
    assert result.inputs == ()
    assert AssessmentDTO.model_validate_json(result.model_dump_json()) == result


def test_reference_only_forecast_keeps_mode_none_and_unknown_issue():
    reading = item(mode="forecast", time_role="forecast_target_start", observed_at=NOW)
    result = evaluate(request(inputs=(reading,)))
    assert result.mode == "none"
    assert result.inputs[0].state == "recorded"
    assert result.inputs[0].issued_at is None
    assert result.inputs[0].used_by == ()
    assert result.data_quality.unknown_issue_input_ids == (reading.input_id,)


def test_support_does_not_approve_unresolved_safety():
    result = evaluate(request(support_evidence=(support(),)))
    assert result.support.status == "supported"
    assert result.safety.status == "unknown"
    assert not result.safety.required_checks_complete
    assert result.safety.missing_check_ids == ("PAR_SWIM_SAFETY_REQUIRED_CHECKS",)
    assert result.assessment_status == "withheld"
    assert result.environment.status == "withheld"
    assert result.model.status == "unimplemented"
    assert result.model.validation_status == "not_evaluated"


def test_explicit_restriction_overrides_missing_and_good_environment():
    result = evaluate(
        request(
            support_evidence=(support(),),
            safety_evidence=(safety(),),
            inputs=(item(numeric_value=0.0),),
        )
    )
    assert result.safety.status == "restricted"
    assert result.score is None
    assert result.safety.missing_check_ids
    assert result.recommendation.status == "do_not_proceed"
    assert result.recommendation.message_code == "ACTIVITY_RESTRICTED"
    assert "official_restriction" in result.reason_codes
    source = result.safety.restrictions[0]
    assert source.provider_record_id == "restriction-record"
    assert source.fetched_at == NOW
    assert source.issued_at == NOW - timedelta(minutes=10)
    assert result.support.source_evidence[0].provider_record_id == "support-record"
    assert source.evidence_ids == ("SW08",)


def test_caution_is_preserved_while_overall_safety_is_unknown():
    result = evaluate(
        request(
            support_evidence=(support(),),
            safety_evidence=(safety(effect="caution"),),
        )
    )
    assert result.safety.status == "unknown"
    assert len(result.safety.warnings) == 1
    assert result.recommendation.status == "check_required"


def test_clear_statement_does_not_complete_an_unapproved_checklist():
    result = evaluate(
        request(
            support_evidence=(support(),),
            safety_evidence=(safety(effect="clear"),),
        )
    )
    assert result.safety.status == "unknown"
    assert not result.safety.required_checks_complete


def test_support_unknown_retains_independent_official_warning():
    result = evaluate(request(safety_evidence=(safety(),)))
    assert result.safety.status == "not_assessed"
    assert result.safety.restrictions
    assert result.recommendation.status == "check_required"
    assert "official_restriction" in result.reason_codes


def test_unsupported_and_temporary_restriction_are_distinct():
    result = evaluate(
        request(
            support_evidence=(support(status="unsupported"),),
            safety_evidence=(safety(),),
        )
    )
    assert result.assessment_status == "unsupported"
    assert result.recommendation.status == "not_supported"
    assert result.safety.status == "not_assessed"


@pytest.mark.parametrize(
    "changes",
    [
        {"source_status": "bulletin"},
        {"source_status": "ended"},
        {"source_status": "unknown"},
        {"authoritative": False},
        {"state": "stale"},
        {"state": "conflict"},
        {"spot_id": 2},
        {"activity": "surf"},
        {"fetched_at": NOW + timedelta(seconds=1)},
        {"valid_until": NOW},
        {"valid_from": NOW + timedelta(seconds=1)},
    ],
)
def test_inapplicable_authority_is_not_an_active_restriction(changes):
    result = evaluate(
        request(
            support_evidence=(support(),),
            safety_evidence=(safety(**changes),),
        )
    )
    assert result.safety.status == "unknown"
    assert not result.safety.restrictions


def test_known_restriction_survives_conflicting_clear_with_same_reference():
    result = evaluate(
        request(
            support_evidence=(support(),),
            safety_evidence=(safety(), safety(effect="clear")),
        )
    )
    assert result.safety.status == "restricted"
    assert "input_conflict" in result.reason_codes


def test_conflicting_support_is_unknown_independent_of_order():
    records = (support(), support(status="unsupported"))
    left = evaluate(request(support_evidence=records))
    right = evaluate(request(support_evidence=records[::-1]))
    assert left == right
    assert left.support.status == "unknown"
    assert "input_conflict" in left.reason_codes


def test_duplicate_input_semantic_identity_preserves_conflict():
    records = (item(), item(input_id="test:input:2", numeric_value=9.0))
    result = evaluate(request(inputs=records))
    assert result.data_quality.conflicting_input_ids == tuple(
        i.input_id for i in records
    )
    assert result.mode == "none"


def test_age_boundary_is_inclusive_but_expiry_is_exclusive():
    current = item()
    assert inspect_input(current, as_of=NOW, target=target(), policy=policy()).usable
    assert (
        "input_stale"
        in inspect_input(
            current,
            as_of=NOW + timedelta(microseconds=1),
            target=target(),
            policy=policy(),
        ).reason_codes
    )
    at_expiry = inspect_input(
        current, as_of=NOW, target=target(start_at=current.valid_until), policy=policy()
    )
    assert not at_expiry.usable
    assert "input_stale" in at_expiry.reason_codes


def test_forecast_age_uses_issue_time_not_future_target_or_fetch():
    future = NOW + timedelta(minutes=10)
    reading = item(
        mode="forecast",
        time_role="forecast_target_start",
        observed_at=future,
        valid_from=future,
        valid_until=future + timedelta(minutes=10),
        issued_at=NOW - timedelta(minutes=6),
    )
    check = inspect_input(
        reading, as_of=NOW, target=target(start_at=future), policy=policy()
    )
    assert "input_stale" in check.reason_codes
    assert "input_not_known_at_as_of" not in check.reason_codes


def test_unknown_issue_is_not_replaced_by_fetch_time():
    reading = item(mode="forecast", time_role="forecast_target_start", observed_at=NOW)
    check = inspect_input(reading, as_of=NOW, target=target(), policy=policy())
    assert "issue_time_unknown" in check.reason_codes
    assert reading.issued_at is None


@pytest.mark.parametrize(
    "changes,reason",
    [
        ({"unit": None}, "input_unit_unknown"),
        ({"unit": "km/h"}, "input_unit_mismatch"),
        ({"aggregation": Aggregation()}, "input_aggregation_unknown"),
        ({"mapping_version": None}, "station_mapping_unverified"),
        ({"spatial_scope": "another-area"}, "station_mapping_unverified"),
        ({"numeric_value": None}, "input_missing"),
        ({"state": "superseded"}, "input_superseded"),
    ],
)
def test_input_definition_contract(changes, reason):
    check = inspect_input(item(**changes), as_of=NOW, target=target(), policy=policy())
    assert reason in check.reason_codes
    assert not check.usable


def test_zero_is_a_measurement_but_is_not_a_default_score():
    check = inspect_input(
        item(numeric_value=0.0), as_of=NOW, target=target(), policy=policy()
    )
    assert check.usable
    assert evaluate(request(inputs=(item(numeric_value=0.0),))).score is None


def test_unresolved_input_policies_cannot_be_filled_from_legacy():
    check = inspect_input(item(), as_of=NOW, target=target())
    assert not check.usable
    assert "parameter_unresolved" in check.reason_codes
    assert all(profile.input_policies == () for profile in PROFILES.values())
    assert all(profile.required_safety_checks is None for profile in PROFILES.values())


def test_future_daily_aggregate_is_not_historical_observation():
    reading = item(
        aggregation=Aggregation(
            start_at=NOW - timedelta(hours=2),
            end_at=NOW + timedelta(hours=2),
            method="daily_mean",
            recipe_id="test-recipe",
            coverage=1.0,
        )
    )
    check = inspect_input(
        reading,
        as_of=NOW,
        target=target(),
        policy=policy(
            aggregation_method="daily_mean",
            recipe_id="test-recipe",
            minimum_aggregation_coverage=1.0,
        ),
    )
    assert "input_not_known_at_as_of" in check.reason_codes


def test_aggregation_recipe_and_coverage_are_separate_from_validity():
    reading = item(
        aggregation=Aggregation(
            start_at=NOW - timedelta(hours=2),
            end_at=NOW,
            method="daily_mean",
            recipe_id="test-recipe",
            coverage=0.5,
        )
    )
    check = inspect_input(
        reading,
        as_of=NOW,
        target=target(),
        policy=policy(
            aggregation_method="daily_mean",
            recipe_id="test-recipe",
            minimum_aggregation_coverage=1.0,
        ),
    )
    assert "aggregation_coverage_insufficient" in check.reason_codes


def test_explicit_empty_forecast_coverage_is_not_unknown_coverage():
    common = dict(support_evidence=(support(),), requested_mode="forecast")
    outside = evaluate(request(**common, forecast_coverage=()))
    unknown = evaluate(request(**common))
    assert outside.assessment_status == "outside_forecast_horizon"
    assert outside.recommendation.status == "check_required"
    assert unknown.assessment_status == "withheld"
    assert "forecast_coverage_unknown" in unknown.reason_codes


def test_restriction_precedes_outside_forecast_but_both_reasons_remain():
    result = evaluate(
        request(
            support_evidence=(support(),),
            safety_evidence=(safety(),),
            requested_mode="forecast",
            forecast_coverage=(),
        )
    )
    assert result.assessment_status == "withheld"
    assert "outside_forecast_horizon" in result.reason_codes
    assert result.recommendation.status == "do_not_proceed"


def test_partial_interval_restriction_keeps_its_actual_scope():
    window = target(kind="interval", end_at=NOW + timedelta(hours=1))
    restriction = safety(
        valid_from=NOW + timedelta(minutes=15),
        valid_until=NOW + timedelta(minutes=30),
    )
    result = evaluate(
        request(
            target=window,
            support_evidence=(support(),),
            safety_evidence=(restriction,),
        )
    )
    assert result.target == window
    assert result.safety.status == "restricted"
    assert "partial_safety_coverage" in result.reason_codes
    assert result.safety.restrictions[0].valid_from == restriction.valid_from
    assert result.safety.restrictions[0].valid_until == restriction.valid_until
    assert result.valid_until == restriction.valid_until
    assert AssessmentDTO.model_validate_json(result.model_dump_json()) == result


def test_adjacent_restriction_does_not_overlap_half_open_target():
    window = target(kind="interval", end_at=NOW + timedelta(hours=1))
    restriction = safety(
        valid_from=window.end_at,
        valid_until=window.end_at + timedelta(minutes=30),
    )
    result = evaluate(
        request(
            target=window,
            support_evidence=(support(),),
            safety_evidence=(restriction,),
        )
    )
    assert result.safety.status == "unknown"
    assert not result.safety.restrictions


def test_partial_restriction_reference_needs_only_the_claimed_overlap():
    window = target(kind="interval", end_at=NOW + timedelta(hours=1))
    start, end = NOW + timedelta(minutes=15), NOW + timedelta(minutes=30)
    reading = item(
        mode="forecast",
        time_role="forecast_target_start",
        observed_at=start,
        valid_from=start,
        valid_until=end,
        issued_at=NOW,
    )
    result = evaluate(
        request(
            target=window,
            inputs=(reading,),
            support_evidence=(support(),),
            safety_evidence=(
                safety(
                    valid_from=start,
                    valid_until=end,
                    input_refs=(reading.input_id,),
                ),
            ),
        )
    )
    assert result.safety.status == "restricted"
    assert result.inputs[0].used_by == ("safety",)
    assert result.mode == "forecast"
    payload = result.model_dump(mode="json")
    payload["safety"]["restrictions"][0]["input_refs"] = ["missing-input"]
    with pytest.raises(ValidationError, match="reference"):
        AssessmentDTO.model_validate(payload)


def test_partial_restriction_reference_must_cover_the_same_overlap():
    window = target(kind="interval", end_at=NOW + timedelta(hours=1))
    start, end = NOW + timedelta(minutes=15), NOW + timedelta(minutes=30)
    other_start = NOW + timedelta(minutes=45)
    reading = item(
        mode="forecast",
        time_role="forecast_target_start",
        observed_at=other_start,
        valid_from=other_start,
        valid_until=window.end_at,
        issued_at=NOW,
    )
    result = evaluate(
        request(
            target=window,
            inputs=(reading,),
            support_evidence=(support(),),
            safety_evidence=(
                safety(
                    valid_from=start,
                    valid_until=end,
                    input_refs=(reading.input_id,),
                ),
            ),
        )
    )
    assert result.safety.status == "unknown"
    assert result.inputs[0].used_by == ()


def test_half_day_coverage_is_not_a_new_hourly_target():
    half_day = target(kind="interval", end_at=NOW + timedelta(hours=12))
    result = evaluate(
        request(
            support_evidence=(support(valid_until=NOW + timedelta(hours=12)),),
            target=half_day,
            requested_mode="forecast",
            forecast_coverage=(half_day,),
        )
    )
    assert result.target == half_day
    assert "outside_forecast_horizon" not in result.reason_codes
    assert result.score is None


def test_used_input_mode_and_provenance_are_retained():
    reading = item()
    result = evaluate(
        request(
            inputs=(reading,),
            support_evidence=(support(input_refs=(reading.input_id,)),),
            safety_evidence=(safety(input_refs=(reading.input_id,)),),
        )
    )
    assert result.inputs[0].used_by == ("safety", "support")
    assert result.mode == "observation"
    assert result.as_of == result.evaluated_at == NOW
    assert result.assessment_id is result.input_manifest_id is None


def test_evaluate_is_deterministic_and_performs_no_io(monkeypatch):
    readings = (item(), item(input_id="test:input:2", provider_record_id="other"))
    facts = (safety(), safety(effect="caution", evidence_ref="test:caution"))
    one = request(inputs=readings, support_evidence=(support(),), safety_evidence=facts)
    two = request(
        inputs=readings[::-1],
        support_evidence=(support(),),
        safety_evidence=facts[::-1],
    )

    def forbidden(*args, **kwargs):
        raise AssertionError("I/O is forbidden during evaluate")

    monkeypatch.setattr(builtins, "open", forbidden)
    monkeypatch.setattr(socket, "socket", forbidden)
    monkeypatch.setattr(Path, "read_bytes", forbidden)
    assert evaluate(one).model_dump_json() == evaluate(two).model_dump_json()
    assert evaluate(one).model_dump_json() == evaluate(one).model_dump_json()


@pytest.mark.parametrize("value", [True, "12", float("nan"), float("inf")])
def test_input_numeric_types_are_strict_and_finite(value):
    with pytest.raises(ValidationError):
        item(numeric_value=value)


def test_naive_times_extra_fields_and_wrong_time_roles_are_rejected():
    with pytest.raises(ValidationError):
        target(start_at=NOW.replace(tzinfo=None))
    with pytest.raises(ValidationError):
        target(extra="not-allowed")
    with pytest.raises(ValidationError):
        item(mode="forecast")
    with pytest.raises(ValidationError):
        request(spot_id=True)
    with pytest.raises(ValidationError):
        request(evaluated_at=NOW - timedelta(seconds=1))


def test_persisted_dto_cannot_override_safety_routing_or_numeric_score():
    result = evaluate(
        request(support_evidence=(support(),), safety_evidence=(safety(),))
    )
    for mutation in ["recommendation", "score", "source"]:
        payload = result.model_dump(mode="json")
        if mutation == "recommendation":
            payload["recommendation"]["status"] = "information_only"
        elif mutation == "score":
            payload["score"] = 0
        else:
            payload["safety"]["restrictions"][0]["source_status"] = "bulletin"
        with pytest.raises(ValidationError):
            AssessmentDTO.model_validate(payload)


def test_manual_complete_safety_cannot_bypass_unapproved_registry():
    payload = evaluate(request(support_evidence=(support(),))).model_dump(mode="json")
    payload["safety"].update(
        status="no_known_restriction",
        required_checks_complete=True,
        checked_rule_ids=["invented-check"],
        missing_check_ids=[],
    )
    payload.update(
        safety_status="no_known_restriction", assessment_status="model_unimplemented"
    )
    payload["environment"]["status"] = "model_unimplemented"
    payload["recommendation"]["status"] = "unavailable"
    with pytest.raises(ValidationError, match="unapproved"):
        AssessmentDTO.model_validate(payload)


def test_empty_required_list_is_not_sufficient_quality():
    with pytest.raises(ValidationError):
        Quality(status="sufficient", required_total=0, required_usable=0)


def test_bundled_provenance_is_complete_and_source_hashes_match():
    assert len(PARAMETER_IDS) == 166
    assert len(EVIDENCE_IDS) == 47
    assert get_parameter("PAR_HCI_COMPONENT_TABLE_TRANSCRIPTION")["value"] is None
    assert (
        get_parameter("PAR_LEGACY_ONSEN_WEIGHTS")["status"] == "retired_or_not_adopted"
    )
    assert get_evidence("SW12")["source_type"] == "official_guidance"
    repo = Path(__file__).resolve().parents[2]
    for name, folder in [
        ("parameter_evidence.csv", "design"),
        ("evidence_matrix.csv", "research"),
    ]:
        source = repo / "docs" / folder / "water-travel-index" / name
        assert hashlib.sha256(source.read_bytes()).hexdigest() == SOURCE_SHA256[name]
    assert json.dumps(provenance_manifest())


def test_mutating_returned_registry_copies_does_not_change_registry():
    parameter = get_parameter("PAR_HCI_WEIGHTS")
    parameter["value"]["TC"] = 999
    assert get_parameter("PAR_HCI_WEIGHTS")["value"]["TC"] == 2
    model = default_model()
    model.gate_results["G_SUPPORT"] = "pass"
    assert default_model().gate_results["G_SUPPORT"] == "pending"
    assert not model_is_allowed("hci-beach-reproduction", "0.1.0-experimental-draft")


@pytest.mark.parametrize(
    "value,source,dest,quantity,expected,ratio",
    [
        (3.0, "m/s", "km/h", "wind_speed", 10.8, (18, 5)),
        (36.0, "km/h", "m/s", "wind_speed", 10.0, (5, 18)),
        (30.0, "cm/s", "m/s", "current_speed", 0.3, (1, 100)),
        (26.0, "degC", "°C", "water_temperature", 26.0, (1, 1)),
    ],
)
def test_exact_unit_helper_preserves_source_and_ratio(
    value, source, dest, quantity, expected, ratio
):
    result = convert_exact(value, source, dest, quantity=quantity)
    assert result.value == pytest.approx(expected)
    assert result.source_value == value and result.source_unit == source
    assert (result.ratio_numerator, result.ratio_denominator) == ratio
    assert get_parameter(result.parameter_id)["status"] == "unresolved"


@pytest.mark.parametrize(
    "value,unit,quantity",
    [
        (True, "m/s", "wind_speed"),
        (float("nan"), "m/s", "wind_speed"),
        (1.0, "mm", "wind_speed"),
        (1.0, "m", "river_flow"),
        (30.0, "degC", "Humidex"),
    ],
)
def test_unit_helper_rejects_nonfinite_and_cross_dimension_inference(
    value, unit, quantity
):
    with pytest.raises(ValueError):
        convert_exact(value, unit, "m/s", quantity=quantity)
