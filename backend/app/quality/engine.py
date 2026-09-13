"""Deterministic, conservative signal extraction and evidence comparisons.

Rules are a software baseline, not a validated NLP model or a probability model.
Only like-for-like numeric samples produce deltas. Subjective signals remain
contextual observations and cannot confirm or refute a laboratory grade.
"""

import hashlib
import json
import math
import re
import unicodedata
from datetime import datetime
from zoneinfo import ZoneInfo

from app.quality.models import (
    ANALYSIS_VERSION,
    COMPARISON_VERSION,
    Measurement,
    OfficialSample,
    Signal,
    StoredObservation,
)

_PATTERNS = {
    "turbidity": (
        r"탁(?:했|하|한|해|함|도)|흐[리렸린림]|뿌[옇연]"
        r"|\bmuddy\b|\bturbid\b|\bmurky\b"
    ),
    "odor": r"냄새|악취|비린내|\bodor\b|\bodour\b|\bsmell\b",
    "debris": r"쓰레기|부유물|오물|\btrash\b|\bdebris\b|\blitter\b",
    "clarity": r"맑(?:았|은|다|아|음)|투명|깨끗|\bclear\b|\bclean\b",
}
_NEGATIVE = re.compile(r"없|않|아니|안\s|못\s|별로|not\b|no\b|without\b|never\b", re.I)
_UNCERTAIN = re.compile(
    r"모르|듯|같[다았아]|추측|아마|maybe|perhaps|unsure|모호"
    r"|어제|그제|지난|작년|예전|yesterday|last\s+(?:week|month|year)",
    re.I,
)


def extract_signals(text: str) -> tuple[Signal, ...]:
    """Offsets reference the stored text; do not expose unrelated review content."""
    result = []
    # Contrast and sentence boundaries keep negation local to each clause.
    for clause in re.finditer(r"[^.!?\n,;]+", text):
        for fragment in re.finditer(
            r"(?:(?!지만|그런데|그러나|but\b).)+?(?:고|(?=지만|그런데|그러나|but\b)|$)",
            clause[0],
            re.I,
        ):
            value = fragment[0]
            for category, pattern in _PATTERNS.items():
                for match in re.finditer(pattern, value, re.I):
                    # Restrict negation to nearby text; mixed signals are retained.
                    context = value[max(0, match.start() - 12) : match.end() + 14]
                    negatives = len(_NEGATIVE.findall(context))
                    polarity = (
                        "ambiguous"
                        if _UNCERTAIN.search(context) or negatives > 1
                        else "absent"
                        if negatives
                        else "present"
                    )
                    start = clause.start() + fragment.start() + match.start()
                    result.append(
                        Signal(
                            category=category,
                            polarity=polarity,
                            start=start,
                            end=start + len(match[0]),
                            rule_id=f"{category}.{polarity}.v1",
                        )
                    )
    return tuple(result[:100])


def fingerprint(observation) -> str:
    normalized = "".join(
        c
        for c in unicodedata.normalize("NFKC", observation.text).casefold()
        if c.isalnum()
    )
    payload = {
        "spot_id": observation.spot_id,
        "date": observation.observed_at.astimezone(ZoneInfo(observation.timezone))
        .date()
        .isoformat(),
        "text": normalized,
        "measurements": [m.model_dump(mode="json") for m in observation.measurements],
    }
    return digest(payload)


def digest(value) -> str:
    return hashlib.sha256(
        json.dumps(
            value, sort_keys=True, ensure_ascii=False, separators=(",", ":")
        ).encode()
    ).hexdigest()


def overlaps(a, a_end, b, b_end):
    if a_end is None and b_end is None:
        return a == b
    if a_end is None:
        return b <= a < b_end
    if b_end is None:
        return a <= b < a_end
    return a < b_end and b < a_end


def compare_measurements(official: Measurement, reported: Measurement) -> dict:
    reasons = []
    if official.item != reported.item:
        reasons.append("different_item")
    if not official.unit or not reported.unit:
        reasons.append("unknown_unit")
    elif official.unit != reported.unit:
        reasons.append("different_unit")
    if not official.method or not reported.method:
        reasons.append("unknown_measurement_method")
    elif official.method != reported.method:
        reasons.append("different_measurement_method")
    if not official.scope or not reported.scope:
        reasons.append("unknown_sample_scope")
    elif official.scope != reported.scope:
        reasons.append("different_sample_scope")
    if "unknown" in {official.sample_precision, reported.sample_precision}:
        reasons.append("unknown_sample_time_precision")
    if not overlaps(
        official.sampled_at,
        official.sampled_until,
        reported.sampled_at,
        reported.sampled_until,
    ):
        reasons.append("different_sampling_period")
    if official.value is None or reported.value is None:
        reasons.append("missing_measurement_value")
    difference = None if reasons else reported.value - official.value
    if difference is not None and not math.isfinite(difference):
        reasons.append("nonfinite_difference")
        difference = None
    return {
        "item": official.item,
        "status": "not_comparable" if reasons else "comparable",
        "reason_codes": reasons,
        "official_value": official.value,
        "reported_value": reported.value,
        "unit": official.unit,
        "reported_unit": reported.unit,
        "official_method": official.method,
        "reported_method": reported.method,
        "difference": difference,
        "agreement": "unknown",  # No validated tolerance/uncertainty model exists.
    }


def compare(
    spot_id: int,
    official: list[OfficialSample],
    reviews: list[StoredObservation],
    as_of: datetime,
    *,
    input_truncated: bool = False,
) -> dict:
    """Build an immutable analysis using only evidence available by the cutoff."""
    officials = [
        sample
        for sample in official
        if sample.spot_id == spot_id
        and sample.fetched_at <= as_of
        and sample.observed_at <= as_of
        and (sample.issued_at is None or sample.issued_at <= as_of)
        and sample.revision_state != "superseded"
    ]
    latest = {}
    for review in reviews:
        if review.received_at > as_of or review.input.observed_at > as_of:
            continue
        key = (review.owner_key, review.input.review_id)
        if key not in latest or review.input.revision > latest[key].input.revision:
            latest[key] = review
    active = [
        r
        for r in latest.values()
        if not r.input.retracted and r.input.spot_id == spot_id
    ]
    unique, duplicates, seen = [], 0, set()
    for review in sorted(active, key=lambda r: (r.received_at, r.evidence_id)):
        if review.duplicate_fingerprint in seen:
            duplicates += 1
        else:
            seen.add(review.duplicate_fingerprint)
            unique.append(review)
    eligible, excluded = [], []
    for review in unique:
        reasons = []
        observation = review.input
        if observation.spatial_relation != "at_spot":
            reasons.append("review_spatial_scope_unverified")
        candidates = [
            sample
            for sample in officials
            if overlaps(
                sample.observed_at,
                sample.sampled_until,
                observation.observed_at,
                observation.observed_until,
            )
        ]
        if not candidates:
            reasons.append("no_overlapping_official_sample")
        if reasons:
            excluded.append(
                {"evidence_id": review.evidence_id, "reason_codes": reasons}
            )
        else:
            eligible.append((review, candidates))
    signals = []
    comparisons = []
    for review, candidates in eligible:
        for signal in review.signals:
            signals.append(
                {
                    "evidence_id": review.evidence_id,
                    "analysis_version": review.analysis_version,
                    **signal.model_dump(),
                }
            )
        for sample in candidates:
            if len(comparisons) > 100:
                break
            for measured in review.input.measurements:
                if len(comparisons) > 100:
                    break
                matching = [m for m in sample.measurements if m.item == measured.item]
                for m in matching:
                    comparisons.append(
                        {
                            "official_evidence_id": sample.evidence_id,
                            "review_evidence_id": review.evidence_id,
                            **compare_measurements(m, measured),
                        }
                    )
                if not matching:
                    comparisons.append(
                        {
                            "official_evidence_id": sample.evidence_id,
                            "review_evidence_id": review.evidence_id,
                            "item": measured.item,
                            "status": "not_comparable",
                            "difference": None,
                            "reason_codes": ["no_matching_official_item"],
                        }
                    )
    input_truncated = (
        input_truncated
        or len(signals) > 100
        or len(comparisons) > 100
        or any(len(r.signals) >= 100 for r in unique)
    )
    present = {s["category"] for s in signals if s["polarity"] == "present"}
    absent = {s["category"] for s in signals if s["polarity"] == "absent"}
    conflict = bool(present & absent or {"clarity", "turbidity"} <= present)
    reasons = ["subjective_observations_are_not_laboratory_measurements"]
    if any(s.place_relation == "representative_station" for s in officials):
        reasons.append("representative_station_not_direct_place_measurement")
    if len({r.owner_key for r, _ in eligible}) < 2:
        reasons.append("insufficient_independent_observers")
    if duplicates:
        reasons.append("duplicate_reviews_excluded")
    if any(s["polarity"] == "ambiguous" for s in signals):
        reasons.append("ambiguous_language")
    if eligible and not signals:
        reasons.append("no_supported_observation_signals")
    if conflict:
        reasons.append("conflicting_observations")
    if any(s.valid_until <= as_of for s in officials):
        reasons.append("historical_official_samples_not_current_certification")
    if input_truncated:
        reasons.append("input_scope_truncated")
    if not unique:
        status = "no_review_data"
    elif not officials:
        status = "no_official_data"
    elif not eligible:
        status = "not_comparable"
    elif conflict:
        status = "conflicting_observations"
    elif any(c["status"] == "comparable" for c in comparisons):
        status = "measurements_compared"
    elif present & {"turbidity", "odor", "debris"}:
        status = "observation_signals_present"
    else:
        status = "context_only"
    return {
        "contract_version": "water-quality.v1",
        "analysis_version": ANALYSIS_VERSION,
        "comparison_version": COMPARISON_VERSION,
        "spot_id": spot_id,
        "as_of": as_of.isoformat(),
        "status": status,
        "reason_codes": reasons,
        "sample_count": len(unique),
        "comparable_review_count": len(eligible),
        "independent_observer_count": len({r.owner_key for r, _ in eligible}),
        "duplicate_count": duplicates,
        "official_sample_count": len(officials),
        "latest_review_at": max((r.input.observed_at for r in unique), default=None),
        "official_sources": [s.model_dump(mode="json") for s in officials[:100]],
        "review_evidence": [
            {
                "evidence_id": r.evidence_id,
                "review_id": r.input.review_id,
                "revision": r.input.revision,
                "kind": r.input.kind,
                "observed_at": r.input.observed_at.isoformat(),
                "observed_until": r.input.observed_until.isoformat()
                if r.input.observed_until
                else None,
                "received_at": r.received_at.isoformat(),
                "spatial_relation": r.input.spatial_relation,
                "source_record_id": r.input.source_record_id,
            }
            for r in unique[:100]
        ],
        "signals": signals[:100],
        "measurement_comparisons": comparisons[:100],
        "excluded_reviews": excluded[:100],
        "input_truncated": input_truncated
        or len(signals) > 100
        or len(comparisons) > 100,
        "confidence_percent": None,
        "official_grade_override": None,
        "safety_status": "unknown",
        "model_validation_status": "not_validated",
    }
