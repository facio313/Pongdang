from typing import Literal

from pydantic import AwareDatetime, Field, model_validator

from app.water_index.models import InputDTO, Record


class ForecastRecord(Record):
    contract_version: Literal["water-forecast.v1"] = "water-forecast.v1"
    source_key: str = Field(min_length=1, max_length=200)
    adapter_version: str = Field(default="1", min_length=1, max_length=200)
    spot_id: int = Field(gt=0)
    station_id: int = Field(gt=0)
    station_code: str = Field(min_length=1, max_length=200)
    station_name: str = Field(min_length=1, max_length=500)
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    provider: str = Field(min_length=1, max_length=200)
    source_record_id: str = Field(min_length=1, max_length=500)
    provider_record_id: str = Field(min_length=1, max_length=200)
    snapshot_id: int = Field(gt=0)
    issued_at: AwareDatetime | None
    fetched_at: AwareDatetime
    target_start_at: AwareDatetime
    target_end_at: AwareDatetime
    timezone: Literal["Asia/Seoul"] = "Asia/Seoul"
    data_kind: Literal["official_forecast"] = "official_forecast"
    spatial_relation: Literal["station_observation_point"] = "station_observation_point"
    spatial_scope: str = Field(min_length=1, max_length=500)
    inputs: tuple[InputDTO, ...] = Field(min_length=1, max_length=100)

    @model_validator(mode="after")
    def consistent(self):
        if self.target_end_at <= self.target_start_at:
            raise ValueError("A positive provider target interval is required")
        if any(
            i.mode != "forecast" or i.snapshot_id != self.snapshot_id
            for i in self.inputs
        ):
            raise ValueError(
                "Forecasts must retain forecast-only inputs of one snapshot"
            )
        if self.issued_at and self.issued_at > self.fetched_at:
            raise ValueError("Issue time cannot follow fetch time")
        return self


class ForecastView(ForecastRecord):
    revision_id: int = Field(gt=0)
    previous_revision_id: int | None = Field(default=None, gt=0)
    available_at: AwareDatetime
    requested_spot_id: int = Field(gt=0)
    mapping_evidence_ref: str | None = Field(default=None, max_length=200)
    spatial_relation: Literal["station_observation_point", "representative_station"]
    state: Literal["stale", "partial", "available"]
    reason_codes: tuple[str, ...] = Field(max_length=100)


class ForecastEnvelope(Record):
    contract_version: Literal["water-forecast.v1"] = "water-forecast.v1"
    as_of: AwareDatetime
    queried_at: AwareDatetime
    page: int = Field(ge=1, le=1000)
    page_size: int = Field(ge=1, le=100)
    total: int = Field(ge=0)
    rows: list[ForecastView] = Field(max_length=100)
    status: Literal[
        "available",
        "no_forecast_data",
        "outside_forecast_horizon",
        "missing_within_horizon",
    ]
    horizon_start_at: AwareDatetime | None
    horizon_end_at: AwareDatetime | None
    range_semantics: str
    assessment_endpoint: Literal["/api/data/water-index/assessments"]
    recommendation_status: Literal["unavailable"]
    recommendation_reason: Literal["model_not_validated"]
