"""Compact, reconstructible published condition rows.

The public envelope has fixed model text and contract fields. Store those in
code once while keeping every measured value, explanation and source reference
in its original result row.
"""

import hashlib
import json
from datetime import UTC, datetime

DETAIL_FIELDS = (
    "restriction_refs",
    "metrics",
    "context_metrics",
    "display_metrics",
    "missing_metrics",
    "required_evidence",
    "reason_codes",
    "projection",
)
RESULT_COLUMNS = (
    "generation_id,spot_id,activity,mode,"
    "target_start,target_end,content_digest,"
    "place_name,evidence_at,evidence_as_of,support_status,safety_status,"
    "condition_score,retained,retained_at,water_temperature,expires_at,detail"
)


def _json_default(value):
    if isinstance(value, datetime):
        return value.astimezone(UTC).isoformat().replace("+00:00", "Z")
    raise TypeError(f"Unsupported digest value: {type(value).__name__}")


def content_digest(payload):
    """Compare stored display content, excluding query clocks and fixed defaults."""
    content = {
        key: value
        for key, value in payload.items()
        if key not in {"at", "as_of", "contract_version", "model", "environment_score"}
    }
    encoded = json.dumps(
        content,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
        default=_json_default,
    ).encode("utf-8")
    return hashlib.sha256(encoded).digest()


def summary_fields(payload):
    """Extract the list fields using the same selection as ConditionsSummary."""
    display = payload["display_metrics"]
    metrics = (*payload["metrics"], *payload["context_metrics"])
    water = next((m for m in display if m["name"] == "water_temperature"), None)
    if water is None:
        water = next(
            (
                m
                for m in metrics
                if m["name"] == "water_temperature" and m["status"] == "available"
            ),
            None,
        )
    score = payload.get("condition_score") or {}
    used = {
        (component["metric"], component["station_id"])
        for component in score.get("components", ())
        if component["status"] == "evaluated" and component["score"] is not None
    }
    shown = {(metric["name"], metric["station_id"]) for metric in display}
    expiries = [
        datetime.fromisoformat(source["valid_until"])
        for metric in metrics
        if (metric["name"], metric["station_id"]) in used | shown
        for source in metric["evidence"]
        if source["valid_until"] is not None
    ]
    return water, min(expiries) if expiries else None


def detail_fields(payload):
    """Pack cold response fields together while leaving list fields selectable."""
    return {key: payload[key] for key in DETAIL_FIELDS}


def result_payload(row):
    """Rebuild the detailed response and retention evidence from one SQL row."""
    detail = row["detail"]
    return {
        "contract_version": "water-conditions.v1",
        "spot_id": row["spot_id"],
        "place_name": row["place_name"],
        "activity": row["activity"],
        "mode": row["mode"],
        "at": row["evidence_at"],
        "as_of": row["evidence_as_of"],
        "support_status": row["support_status"],
        "safety_status": row["safety_status"],
        "condition_score": row["condition_score"],
        "retained": row["retained"],
        "retained_at": row["retained_at"].astimezone(UTC)
        if row["retained_at"] is not None
        else None,
        **{key: detail[key] for key in DETAIL_FIELDS},
    }
