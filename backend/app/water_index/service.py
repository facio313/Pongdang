"""Explicit offline orchestration; never registered as an HTTP/collector job."""

import hashlib
import json
from datetime import UTC, datetime

from app.config import Settings

from .engine import diagnostic_assessment, evaluate
from .models import AssessmentDTO, EvaluationRequest
from .registry import CONTEXT_PROFILES, provenance_manifest
from .storage import InputManifest, StorageBundle, TargetRecord, store_bundle


def _canonical(value):
    if isinstance(value, datetime):
        return value.astimezone(UTC).isoformat()
    if isinstance(value, dict):
        return {key: _canonical(item) for key, item in sorted(value.items())}
    if isinstance(value, tuple | list):
        return [_canonical(item) for item in value]
    return value


def prepare_evaluation(request: EvaluationRequest) -> EvaluationRequest:
    """Validate and assign stable artifact IDs; no time, I/O or randomness."""
    request = EvaluationRequest.model_validate(request.model_dump(mode="json"))
    if request.requested_mode not in {"observation", "forecast"}:
        raise ValueError("Persisted targets need an explicit requested mode")
    if request.context != CONTEXT_PROFILES.get(request.context.profile_id):
        raise ValueError("Only the registered non-personal context can be persisted")
    value = _canonical(request.model_dump())
    for key in ("assessment_id", "input_manifest_id"):
        value.pop(key)
    for key in ("inputs", "support_evidence", "safety_evidence", "forecast_coverage"):
        if value[key] is not None:
            value[key] = sorted(
                value[key], key=lambda item: json.dumps(item, sort_keys=True)
            )
    # Every field changing a decision, including participant context, target,
    # cutoff, revisions and parameter/evidence bundle, participates in identity.
    identity = hashlib.sha256(
        json.dumps(
            {"request": value, "provenance": provenance_manifest()},
            sort_keys=True,
            separators=(",", ":"),
            allow_nan=False,
        ).encode()
    ).hexdigest()
    prepared = request.model_dump(mode="json")
    prepared["assessment_id"] = request.assessment_id or "assessment:" + identity
    prepared["input_manifest_id"] = request.input_manifest_id or "inputs:" + identity
    return EvaluationRequest.model_validate(prepared)


def evaluate_and_store(settings: Settings, request: EvaluationRequest) -> AssessmentDTO:
    """Evaluate prepared evidence and atomically persist its immutable lineage.

    This explicit internal entry point neither fetches provider data nor publishes
    a read view. A separately reviewed producer must supply source evidence and
    an explicit bounded ReadManifest through store_bundle to expose that view.
    No startup/request hook or automatically enabled scheduler calls this function.
    """
    prepared = prepare_evaluation(request)
    result = evaluate(prepared)
    target = diagnostic_assessment(
        target_id=prepared.target_id,
        spot_id=prepared.spot_id,
        activity=prepared.activity,
        target=prepared.target,
        context=prepared.context,
    )
    store_bundle(
        settings,
        StorageBundle(
            targets=[TargetRecord(target, prepared.requested_mode)],
            input_manifests=[
                InputManifest(
                    manifest_id=prepared.input_manifest_id,
                    inputs=[item.model_dump(mode="json") for item in result.inputs],
                    evaluation_request=prepared.model_dump(mode="json"),
                    provenance=provenance_manifest(),
                )
            ],
            assessments=[result],
        ),
    )
    return result
