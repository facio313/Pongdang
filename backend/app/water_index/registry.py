"""Bundled provenance and immutable allowlists; no runtime docs/legacy imports."""

import hashlib
import json
from copy import deepcopy
from dataclasses import dataclass
from importlib.resources import files
from types import MappingProxyType
from typing import Literal

from .models import Activity, Context, ModelDTO

MODEL_ID = "pongdang-water-assessment"
MODEL_VERSION = "0.1.0-draft"
RULESET_VERSION = "safety-support.0.1.0-draft"
PARAMETER_SET_VERSION = "params.0.1.0-draft"
EVIDENCE_VERSION = "water-evidence.2026-09-14.1"
GATES = (
    "G_SUPPORT",
    "G_INPUT_CONTRACT",
    "G_PARAMETER_TRACE",
    "G_RULE_VERIFICATION",
    "G_EXTERNAL_VALIDATION",
    "G_FE_RELEASE",
    "G_OPERATIONS",
)

# Read once at package import. evaluate() performs no resource access.
_bundled_bytes = files(__package__).joinpath("parameters.json").read_bytes()
BUNDLE_SHA256 = hashlib.sha256(_bundled_bytes).hexdigest()
_bundle = json.loads(_bundled_bytes)
if (
    _bundle["parameter_set_version"] != PARAMETER_SET_VERSION
    or _bundle["evidence_version"] != EVIDENCE_VERSION
):
    raise ValueError("Bundled parameter/evidence version mismatch")
_parameters = {p["parameter_id"]: p for p in _bundle["parameters"]}
_evidence = {e["evidence_id"]: e for e in _bundle["evidence"]}
if len(_parameters) != len(_bundle["parameters"]) or len(_evidence) != len(
    _bundle["evidence"]
):
    raise ValueError("Duplicate provenance identifier")
for _parameter in _parameters.values():
    if _parameter["status"] == "unresolved" and _parameter["value"] is not None:
        raise ValueError("Unresolved parameter has an executable value")
    if any(
        eid not in _evidence
        for eid in filter(None, _parameter["evidence_ids"].split(";"))
    ):
        raise ValueError("Unresolved evidence reference")
SOURCE_SHA256 = MappingProxyType(_bundle["source_sha256"])
PARAMETER_IDS = frozenset(_parameters)
EVIDENCE_IDS = frozenset(_evidence)

DEFAULT_MODEL = ModelDTO(
    model_id=MODEL_ID,
    model_version=MODEL_VERSION,
    ruleset_version=RULESET_VERSION,
    parameter_set_version=PARAMETER_SET_VERSION,
    evidence_version=EVIDENCE_VERSION,
    status="unimplemented",
    validation_status="not_evaluated",
    evidence_level="insufficient",
    validated_scope=None,
    gate_results=dict.fromkeys(GATES, "pending"),
)


@dataclass(frozen=True)
class InputPolicy:
    """A verified recipe contract; none is approved in the current registry.

    It supports deterministic contract checks in isolation. Constructing this
    type does not register, approve, or enable a model or a safety rule.
    """

    name: str
    unit: str
    aggregation_method: str
    spatial_scope: str
    mapping_version: str
    max_observation_age_seconds: int | None = None
    max_issue_age_seconds: int | None = None
    minimum_aggregation_coverage: float | None = None
    recipe_id: str | None = None

    def __post_init__(self):
        for age in [self.max_observation_age_seconds, self.max_issue_age_seconds]:
            if age is not None and (type(age) is not int or age < 0):
                raise ValueError("An approved age must be nonnegative integer seconds")
        coverage = self.minimum_aggregation_coverage
        if coverage is not None and (
            type(coverage) not in {int, float} or not 0 < coverage <= 1
        ):
            raise ValueError("Coverage must be finite and in (0,1]")


@dataclass(frozen=True)
class ActivityProfile:
    activity: Activity
    required_safety_checks: tuple[str, ...] | None
    required_environment_inputs: tuple[str, ...] | None
    input_policies: tuple[InputPolicy, ...]
    parameter_ids: tuple[str, ...]
    status: Literal["unapproved"] = "unapproved"


PROFILES = MappingProxyType(
    {
        activity: ActivityProfile(
            activity=activity,
            required_safety_checks=None,
            required_environment_inputs=None,
            input_policies=(),
            parameter_ids=tuple(
                f"PAR_{activity.upper()}_{suffix}"
                for suffix in [
                    "SAFETY_REQUIRED_CHECKS",
                    "DATA_MAX_AGE",
                    "SPATIAL_TOLERANCE",
                    "ENVIRONMENT_REQUIRED_INPUTS",
                    "RESPONSE_FUNCTION",
                ]
            ),
        )
        for activity in ("swim", "surf", "relax", "mudflat", "onsen", "rafting")
    }
)
# A routing label only: no inferred age, supervision, equipment or skill.
CONTEXT_PROFILES = MappingProxyType({"general": Context(profile_id="general")})


def get_parameter(parameter_id: str) -> dict:
    """Return an isolated provenance copy, never an executable model parameter."""
    return deepcopy(_parameters[parameter_id])


def get_evidence(evidence_id: str) -> dict:
    return deepcopy(_evidence[evidence_id])


def default_model() -> ModelDTO:
    return DEFAULT_MODEL.model_copy(deep=True)


def model_is_allowed(model_id: str, model_version: str) -> bool:
    return (model_id, model_version) == (MODEL_ID, MODEL_VERSION)


def provenance_manifest() -> dict:
    return {
        "parameter_set_version": PARAMETER_SET_VERSION,
        "evidence_version": EVIDENCE_VERSION,
        "bundle_sha256": BUNDLE_SHA256,
        "source_sha256": dict(SOURCE_SHA256),
        "parameter_ids": sorted(PARAMETER_IDS),
        "evidence_ids": sorted(EVIDENCE_IDS),
    }
