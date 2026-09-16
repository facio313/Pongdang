from datetime import datetime, timedelta
from typing import Literal
from zoneinfo import ZoneInfo

from pydantic import AwareDatetime, Field, field_validator, model_validator

from app.water_index.models import Activity, Record
from app.water_index.sources import StationMapping

KST = ZoneInfo("Asia/Seoul")
# data.go.kr 15156018, official Swagger checked 2026-09-14:
# 1 morning high, 2 morning low, 3 afternoon high, 4 afternoon low.
EXTREMA = {"1": "high", "2": "low", "3": "high", "4": "low"}
RULE_VERSION = "official-operating-window.v1"


class OperatingWindow(Record):
    window_id: str = Field(min_length=1, max_length=200)
    source_key: str = Field(min_length=1, max_length=200)
    spot_id: int = Field(gt=0)
    station_id: int | None = Field(default=None, gt=0)
    activity: Activity = "mudflat"
    start_at: AwareDatetime
    end_at: AwareDatetime
    timezone: Literal["Asia/Seoul"] = "Asia/Seoul"
    provider: str = Field(min_length=1, max_length=200)
    provider_record_id: str = Field(min_length=1, max_length=200)
    source_url: str = Field(min_length=1, max_length=1000)
    fetched_at: AwareDatetime
    issued_at: AwareDatetime | None = None
    valid_until: AwareDatetime
    operating_status: Literal["open", "closed", "unknown"]
    controls_status: Literal["confirmed", "restricted", "unknown"]
    control_evidence_refs: tuple[str, ...] = Field(default=(), max_length=100)
    scope: str = Field(min_length=1, max_length=500)
    reviewed_by: str = Field(min_length=1, max_length=200)
    rule_version: Literal["official-operating-window.v1"] = RULE_VERSION

    _url = field_validator("source_url")(StationMapping.official_public_url.__func__)

    @model_validator(mode="after")
    def explicit_applicability(self):
        if self.end_at <= self.start_at or self.end_at - self.start_at > timedelta(
            days=1
        ):
            raise ValueError(
                "Operating windows must be positive and at most one day, including "
                "midnight crossing"
            )
        if (
            self.valid_until <= self.fetched_at
            or self.issued_at
            and self.issued_at > self.fetched_at
        ):
            raise ValueError("Invalid evidence timing")
        if self.controls_status == "confirmed" and not self.control_evidence_refs:
            raise ValueError("Confirmed control checks require evidence references")
        return self


def tide_event(forecast, reference_at):
    metrics = {i["name"]: i for i in forecast["inputs"]}
    raw = metrics.get("tide_extremum_code", {}).get("text_value")
    level = metrics.get("tide_level", {})
    at = datetime.fromisoformat(forecast["target_start_at"])
    reasons = list(forecast["reason_codes"])
    kind = EXTREMA.get(raw, "unknown")
    if kind == "unknown":
        reasons.append("unknown_extremum_code")
    return {
        "event_id": f"tide:{forecast['source_key']}:{forecast['revision_id']}",
        "source_key": forecast["source_key"],
        "revision_id": forecast["revision_id"],
        "previous_revision_id": forecast["previous_revision_id"],
        "spot_id": forecast["requested_spot_id"],
        "source_spot_id": forecast["spot_id"],
        "station_id": forecast["station_id"],
        "station_code": forecast["station_code"],
        "station_name": forecast["station_name"],
        "spatial_relation": forecast["spatial_relation"],
        "distance_km": forecast.get("distance_km"),
        "mapping_evidence_ref": forecast.get("mapping_evidence_ref"),
        "spatial_scope": forecast["spatial_scope"],
        "provider": forecast["provider"],
        "provider_record_id": forecast["provider_record_id"],
        "source_record_id": forecast["source_record_id"],
        "kind": kind,
        "provider_extremum_code": raw,
        "event_at": at,
        "local_date": at.astimezone(KST).date(),
        "timezone": "Asia/Seoul",
        "height": level.get("numeric_value"),
        "unit": level.get("unit"),
        "issued_at": forecast["issued_at"],
        "fetched_at": forecast["fetched_at"],
        "valid_until": forecast["target_end_at"],
        "reference_at": reference_at,
        "seconds_until": max(0, int((at - reference_at).total_seconds())),
        "state": forecast["state"],
        "data_kind": "official_forecast",
        "reason_codes": reasons,
    }


def window_state(window: OperatingWindow, as_of):
    if window.valid_until <= as_of or window.end_at <= as_of:
        return "expired", ["operating_evidence_expired"]
    if window.operating_status == "closed" or window.controls_status == "restricted":
        return "restricted", ["official_operation_closed_or_restricted"]
    if window.operating_status == "open" and window.controls_status == "confirmed":
        return "official_operating_window", [
            "operator_window_not_swimming_safety_assessment"
        ]
    return "unknown", ["operating_or_control_evidence_incomplete"]
