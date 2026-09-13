"""Isolated software fixtures: no real reviews, safety or model validation claimed."""

from datetime import UTC, datetime, timedelta

import pytest
from pydantic import ValidationError

from app.quality.engine import (
    compare,
    compare_measurements,
    extract_signals,
    fingerprint,
)
from app.quality.models import (
    Measurement,
    ObservationInput,
    OfficialSample,
    StoredObservation,
)

NOW = datetime(2026, 9, 14, 12, tzinfo=UTC)
SAMPLE = NOW.replace(hour=0)


def observation(**overrides):
    return ObservationInput.model_validate(
        {
            "review_id": "review-1",
            "revision": 1,
            "spot_id": 1,
            "observed_at": SAMPLE + timedelta(hours=3),
            "spatial_relation": "at_spot",
            "text": "물이 탁했다.",
            **overrides,
        }
    )


def saved(**overrides):
    inp = observation(**overrides.pop("input", {}))
    return StoredObservation.model_validate(
        {
            "evidence_id": f"review:{inp.review_id}:{inp.revision}",
            "owner_key": "owner-a",
            "received_at": NOW - timedelta(hours=1),
            "input": inp,
            "signals": extract_signals(inp.text),
            "duplicate_fingerprint": fingerprint(inp),
            **overrides,
        }
    )


def metric(**overrides):
    return Measurement.model_validate(
        {
            "item": "turbidity",
            "value": 1,
            "unit": "NTU",
            "method": "fixture-method",
            "sampled_at": SAMPLE,
            "sampled_until": SAMPLE + timedelta(days=1),
            "sample_precision": "day",
            "scope": "fixture-station-surface",
            **overrides,
        }
    )


def official(**overrides):
    return OfficialSample.model_validate(
        {
            "evidence_id": "collection-snapshot:1",
            "spot_id": 1,
            "provider": "koem_water_quality",
            "provider_record_id": "revision-1",
            "source_record_id": "station:sample:surface",
            "observed_at": SAMPLE,
            "sampled_until": SAMPLE + timedelta(days=1),
            "fetched_at": NOW - timedelta(hours=2),
            "issued_at": None,
            "valid_until": SAMPLE + timedelta(days=1),
            "spatial_scope": "fixture-station",
            "revision_state": "recorded",
            "measurements": [metric()],
            "official_grade": "1",
            **overrides,
        }
    )


@pytest.mark.parametrize(
    ("text", "category", "polarity"),
    [
        ("물이 탁했다", "turbidity", "present"),
        ("물이 탁하지 않았다", "turbidity", "absent"),
        ("냄새가 나지 않았다", "odor", "absent"),
        ("악취는 없었다", "odor", "absent"),
        ("물이 탁한 것 같다", "turbidity", "ambiguous"),
        ("No odor", "odor", "absent"),
        ("Water was not murky", "turbidity", "absent"),
        ("냄새가 없지는 않았다", "odor", "ambiguous"),
    ],
)
def test_explicit_and_negated_signals(text, category, polarity):
    signals = extract_signals(text)
    assert any(s.category == category and s.polarity == polarity for s in signals)
    assert all(0 <= s.start < s.end <= len(text) for s in signals)


def test_negation_does_not_cross_clauses_and_conflict_is_retained():
    signals = extract_signals("냄새는 없고 물이 탁했다. 맑았지만 쓰레기가 있었다.")
    assert {(s.category, s.polarity) for s in signals} == {
        ("odor", "absent"),
        ("turbidity", "present"),
        ("clarity", "present"),
        ("debris", "present"),
    }
    assert extract_signals("unclear operation signs") == ()


def test_no_review_is_explicit_not_a_grade_or_safety():
    result = compare(1, [official()], [], NOW)
    assert result["status"] == "no_review_data"
    assert result["sample_count"] == 0 and result["official_sample_count"] == 1
    assert result["confidence_percent"] is None
    assert result["official_grade_override"] is None
    assert result["safety_status"] == "unknown"


def test_distinct_qualitative_evidence_does_not_overwrite_grade():
    result = compare(1, [official()], [saved()], NOW)
    assert result["status"] == "observation_signals_present"
    assert result["official_sources"][0]["official_grade"] == "1"
    assert "insufficient_independent_observers" in result["reason_codes"]
    assert result["measurement_comparisons"] == []
    assert "owner_key" not in str(result)
    assert "물이 탁했다" not in str(result)


def test_duplicate_normalized_reviews_do_not_inflate_sample_count():
    first = saved()
    other = saved(
        owner_key="owner-b", input={"review_id": "review-2", "text": "물이  탁했다!!"}
    )
    result = compare(1, [official()], [first, other], NOW)
    assert result["sample_count"] == 1 and result["duplicate_count"] == 1
    assert result["independent_observer_count"] == 1


def test_conflicting_observations_and_revisions():
    negative = saved()
    clear = saved(
        owner_key="owner-b", input={"review_id": "review-2", "text": "물은 맑았다"}
    )
    result = compare(1, [official()], [negative, clear], NOW)
    assert result["status"] == "conflicting_observations"
    revision = saved(input={"revision": 2, "text": "물이 탁하지 않았다"})
    revised = compare(1, [official()], [negative, revision], NOW)
    assert revised["sample_count"] == 1
    assert revised["status"] == "context_only"
    retracted = saved(input={"revision": 3, "retracted": True})
    assert (
        compare(1, [official()], [negative, revision, retracted], NOW)["status"]
        == "no_review_data"
    )


@pytest.mark.parametrize(
    ("change", "reason"),
    [
        ({"spatial_relation": "nearby"}, "review_spatial_scope_unverified"),
        (
            {"observed_at": SAMPLE - timedelta(hours=1)},
            "no_overlapping_official_sample",
        ),
    ],
)
def test_place_and_sampling_period_must_match(change, reason):
    result = compare(1, [official()], [saved(input=change)], NOW)
    assert result["status"] == "not_comparable"
    assert reason in result["excluded_reviews"][0]["reason_codes"]


def test_future_fetch_issued_observation_revision_and_wrong_place_do_not_leak():
    for change in (
        {"fetched_at": NOW + timedelta(seconds=1)},
        {"issued_at": NOW + timedelta(seconds=1)},
        {"observed_at": NOW + timedelta(seconds=1)},
        {"spot_id": 2},
        {"revision_state": "superseded"},
    ):
        assert (
            compare(1, [official(**change)], [saved()], NOW)["status"]
            == "no_official_data"
        )
    future_review = saved(received_at=NOW + timedelta(seconds=1))
    assert compare(1, [official()], [future_review], NOW)["status"] == "no_review_data"


def test_historical_sample_is_context_and_never_current_certification():
    result = compare(
        1, [official(valid_until=NOW - timedelta(seconds=1))], [saved()], NOW
    )
    assert (
        "historical_official_samples_not_current_certification"
        in result["reason_codes"]
    )
    assert result["safety_status"] == "unknown"


@pytest.mark.parametrize(
    ("change", "reason"),
    [
        ({"item": "ph"}, "different_item"),
        ({"unit": None}, "unknown_unit"),
        ({"unit": "mg/L"}, "different_unit"),
        ({"method": None}, "unknown_measurement_method"),
        ({"method": "different"}, "different_measurement_method"),
        ({"scope": None}, "unknown_sample_scope"),
        ({"scope": "other-depth"}, "different_sample_scope"),
        ({"value": None}, "missing_measurement_value"),
        ({"sample_precision": "unknown"}, "unknown_sample_time_precision"),
        (
            {
                "sampled_at": SAMPLE - timedelta(days=2),
                "sampled_until": SAMPLE - timedelta(days=1),
            },
            "different_sampling_period",
        ),
    ],
)
def test_numeric_comparability_failures_are_explicit(change, reason):
    result = compare_measurements(metric(), metric(**change))
    assert result["status"] == "not_comparable"
    assert reason in result["reason_codes"] and result["difference"] is None


def test_comparable_measurements_compute_real_delta_without_invented_tolerance():
    result = compare_measurements(metric(), metric(value=2.5))
    assert result["status"] == "comparable"
    assert result["difference"] == 1.5
    assert result["agreement"] == "unknown"
    measured = metric(
        value=2.5,
        sampled_at=SAMPLE + timedelta(hours=3),
        sampled_until=None,
        sample_precision="instant",
    )
    review = saved(input={"measurements": [measured]})
    result = compare(1, [official()], [review], NOW)
    assert result["status"] == "measurements_compared"
    assert result["measurement_comparisons"][0]["difference"] == 1.5


@pytest.mark.parametrize(
    "change",
    [
        {"observed_at": "2026-09-14T00:00:00"},
        {"timezone": "Invented/Zone"},
        {"observed_until": SAMPLE + timedelta(days=3)},
        {"official_grade": "1"},
        {"text": ""},
        {"revision": 0},
        {"measurements": [metric()]},
    ],
)
def test_invalid_input_rejected(change):
    with pytest.raises(ValidationError):
        observation(**change)


def test_input_future_and_numeric_nonfinite_rejected():
    with pytest.raises(ValueError):
        observation(observed_at=NOW + timedelta(seconds=1)).check_cutoff(NOW)
    with pytest.raises(ValidationError):
        metric(value=float("nan"))


def test_numeric_overflow_does_not_serialize_infinite_difference():
    result = compare_measurements(metric(value=-1e308), metric(value=1e308))
    assert result["difference"] is None
    assert result["status"] == "not_comparable"
    assert result["reason_codes"] == ["nonfinite_difference"]


def test_historical_language_is_not_silently_a_current_observation():
    signals = extract_signals("어제 물이 탁했다")
    assert signals and all(s.polarity == "ambiguous" for s in signals)
