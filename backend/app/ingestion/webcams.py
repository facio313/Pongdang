"""Explicit normalized camera metadata contract; cameras are not observations."""

from datetime import UTC, datetime
from typing import Literal

from pydantic import AwareDatetime, Field, model_validator

from app.ingestion import Record
from app.livecams.urls import windy_url


class WebcamMetadata(Record):
    provider_camera_id: str = Field(pattern=r"^[1-9][0-9]{0,19}$")
    title: str = Field(min_length=1, max_length=500)
    latitude: float | None = Field(default=None, ge=-90, le=90, allow_inf_nan=False)
    longitude: float | None = Field(default=None, ge=-180, le=180, allow_inf_nan=False)
    country_code: str | None = Field(default=None, max_length=10)
    region: str | None = Field(default=None, max_length=200)
    city: str | None = Field(default=None, max_length=200)
    timezone: str | None = Field(default=None, max_length=100)
    description: str | None = Field(default=None, max_length=1000)
    categories: list[str] = Field(default_factory=list, max_length=30)
    provider_status: Literal["active", "inactive", "unknown"] = "unknown"
    provider_updated_at: AwareDatetime | None = None
    public_page: str | None = None
    live_player: str | None = None
    timelapse_player: str | None = None
    timelapse_period: Literal["day", "month", "year", "lifetime"] | None = None
    photo_available: bool = False

    @model_validator(mode="after")
    def public_urls(self):
        if self.public_page:
            windy_url(self.public_page, self.provider_camera_id)
        if self.live_player:
            windy_url(self.live_player, self.provider_camera_id, player_type="live")
        if bool(self.timelapse_player) != bool(self.timelapse_period):
            raise ValueError("Timelapse period and player must agree")
        if self.timelapse_player:
            windy_url(
                self.timelapse_player,
                self.provider_camera_id,
                player_type=self.timelapse_period,
            )
        if self.provider_updated_at and self.provider_updated_at > datetime.now(UTC):
            raise ValueError("Future provider update")
        return self


class WebcamSearch(Record):
    spot_id: int = Field(gt=0)
    latitude: float = Field(ge=-90, le=90, allow_inf_nan=False)
    longitude: float = Field(ge=-180, le=180, allow_inf_nan=False)
    radius_km: float = Field(gt=0, le=10)
    camera_ids: list[str] = Field(max_length=50)
    total: int = Field(ge=0)
    rejected: int = Field(default=0, ge=0)
    truncated: bool = False
    valid_until: AwareDatetime
