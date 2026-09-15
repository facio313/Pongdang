from typing import Literal

from pydantic import Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", extra="ignore", env_parse_none_str="null"
    )

    postgres_host: str = "127.0.0.1"
    postgres_port: int = Field(default=5432, ge=1, le=65535)
    postgres_db: str = "pongdang"
    postgres_user: str = "pongdang"
    postgres_password: SecretStr = Field(min_length=1)
    api_root_path: str = ""
    data_go_kr_key: SecretStr = SecretStr("")
    kma_api_hub_key: SecretStr = SecretStr("")
    kakao_rest_key: SecretStr = SecretStr("")
    hrfco_key: SecretStr = SecretStr("")
    collection_latitude: float = Field(default=37.8034055083, ge=-90, le=90)
    collection_longitude: float = Field(default=128.9102102476, ge=-180, le=180)
    collection_radius_m: int = Field(default=20000, ge=100, le=20000)
    aws_stations: str = "516"
    khoa_tide_station_code: str = "DT_0006"
    khoa_buoy_station_code: str = "TW_0089"
    khoa_rip_beach_code: str = "GYEONGPO"
    # Explicit provider scopes; these are not representative mappings to Gyeongpo.
    khoa_current_station_code: str = Field(default="HF_0076", pattern=r"^HF_[0-9]+$")
    khoa_current_forecast_code: str = Field(
        default="16LTC10", pattern=r"^[A-Za-z0-9_-]{1,40}$"
    )
    air_quality_station_names: str = Field(
        default="종로구", min_length=1, max_length=200
    )
    astronomy_location: str = Field(default="서울", min_length=1, max_length=100)
    uv_area_code: str = Field(default="1100000000", pattern=r"^[0-9]{10}$")
    forecast_zone_code: str = Field(default="11A00101", pattern=r"^[A-Za-z0-9]{1,20}$")
    water_quality_station_name: str = Field(
        default="인천강화", min_length=1, max_length=100
    )
    visitor_statistics_lag_days: int = Field(default=60, ge=1, le=365)
    visitor_region_code: str = Field(default="", pattern=r"^[0-9]{0,10}$")
    tourism_traditional_enabled: bool = False
    dam_release_enabled: bool = False
    collector_poll_seconds: int = Field(default=30, ge=5, le=300)
    sso_proxy_secret: SecretStr = SecretStr("")
    sso_allowed_origins: str = ""
    notifications_provider: Literal["disabled", "resend"] = "disabled"
    notifications_resend_api_key: SecretStr = SecretStr("")
    notifications_from_email: str = ""
    notifications_delivery_enabled: bool = False
    livecam_allowed_hosts: str = ""
    windy_webcams_api_key: SecretStr = SecretStr("")
    windy_webcams_radii_km: str = "2,5,10"
    windy_webcams_daily_budget: int = Field(default=30, ge=0, le=100)
    windy_webcams_refresh_hours: int = Field(default=24, ge=6, le=168)
    windy_webcams_timeout_seconds: float = Field(default=8, ge=1, le=15)

    @field_validator("windy_webcams_radii_km")
    @classmethod
    def validate_windy_radii(cls, value):
        radii = [float(r) for r in value.split(",")]
        if (
            not 1 <= len(radii) <= 3
            or radii != sorted(set(radii))
            or any(not 0 < r <= 10 for r in radii)
        ):
            raise ValueError("Use one to three increasing radii, at most 10 km")
        return value

    @field_validator("windy_webcams_api_key", mode="before")
    @classmethod
    def trim_windy_key(cls, value):
        if isinstance(value, SecretStr):
            value = value.get_secret_value()
        return value.strip() if isinstance(value, str) else value

    ai_provider: Literal["disabled", "openai"] = "disabled"
    ai_model: str = Field(default="", max_length=100)
    ai_pricing_model: str = Field(default="", max_length=100)
    ai_input_microusd_per_million_tokens: int | None = Field(default=None, ge=0)
    ai_output_microusd_per_million_tokens: int | None = Field(default=None, ge=0)
    ai_api_key: SecretStr = SecretStr("")
    ai_timeout_seconds: float = Field(default=8, ge=1, le=30)
    ai_max_input_bytes: int = Field(default=8000, ge=100, le=16000)
    ai_max_output_tokens: int = Field(default=256, ge=64, le=1024)
    ai_max_daily_calls: int = Field(default=20, ge=0, le=1000)
    ai_max_daily_tokens: int = Field(default=20000, ge=0, le=1000000)
    ai_reserved_call_microusd: int = Field(default=100000, ge=1)
    ai_daily_budget_microusd: int = Field(default=1000000, ge=0)
