from datetime import date
from typing import Literal

from pydantic import AwareDatetime, Field

from app.tides.service import OperatingWindow
from app.water_index.models import Record


class TideEvent(Record):
    event_id: str
    source_key: str
    revision_id: int = Field(gt=0)
    previous_revision_id: int | None
    spot_id: int = Field(gt=0)
    source_spot_id: int = Field(gt=0)
    station_id: int = Field(gt=0)
    station_code: str
    station_name: str
    spatial_relation: Literal[
        "station_observation_point", "representative_station", "nearby_station_context"
    ]
    distance_km: float | None = Field(default=None, ge=0, le=50)
    mapping_evidence_ref: str | None = Field(default=None, max_length=200)
    spatial_scope: str
    provider: str
    provider_record_id: str
    source_record_id: str
    kind: Literal["high", "low", "unknown"]
    provider_extremum_code: str | None
    event_at: AwareDatetime
    local_date: date
    timezone: Literal["Asia/Seoul"]
    height: float | None
    unit: str | None
    issued_at: AwareDatetime | None
    fetched_at: AwareDatetime
    valid_until: AwareDatetime
    reference_at: AwareDatetime
    seconds_until: int = Field(ge=0)
    state: Literal["available", "partial", "stale"]
    data_kind: Literal["official_forecast"]
    reason_codes: tuple[str, ...] = Field(max_length=100)


class TideEnvelope(Record):
    contract_version: Literal["tide-timer.v1"]
    as_of: AwareDatetime
    queried_at: AwareDatetime
    reference_at: AwareDatetime
    page: int = Field(ge=1, le=1000)
    page_size: int = Field(ge=1, le=100)
    total: int = Field(ge=0)
    rows: list[TideEvent] = Field(max_length=100)
    next_high: TideEvent | None
    next_low: TideEvent | None
    status: Literal[
        "available",
        "no_forecast_data",
        "outside_forecast_horizon",
        "missing_within_horizon",
    ]
    reason_codes: tuple[str, ...] = Field(max_length=100)
    next_event_scope: Literal["requested_interval"]
    horizon_start_at: AwareDatetime | None
    horizon_end_at: AwareDatetime | None


class PublicOperatingWindow(OperatingWindow):
    reviewed_by: str | None = Field(default=None, exclude=True)
    state: Literal["expired", "restricted", "official_operating_window", "unknown"]
    reason_codes: tuple[str, ...] = Field(max_length=100)


class WindowEnvelope(Record):
    contract_version: Literal["tide-operating-window.v1"]
    as_of: AwareDatetime
    queried_at: AwareDatetime
    page: int = Field(ge=1, le=1000)
    page_size: int = Field(ge=1, le=100)
    total: int = Field(ge=0)
    rows: list[PublicOperatingWindow] = Field(max_length=100)
    status: Literal["available", "no_official_operating_window"]
