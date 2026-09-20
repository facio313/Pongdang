from pathlib import Path
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
    # Route-only key, using the same environment name as Pilgrimage.
    kakao_rest_api_key: SecretStr = SecretStr("")
    travel_route_provider: Literal["disabled", "kakao"] = "kakao"
    hrfco_key: SecretStr = SecretStr("")
    collection_latitude: float = Field(default=37.8034055083, ge=-90, le=90)
    collection_longitude: float = Field(default=128.9102102476, ge=-180, le=180)
    collection_radius_m: int = Field(default=20000, ge=100, le=20000)
    tourism_collection_scope: Literal["local", "gangwon"] = "gangwon"
    tourism_pages_per_run: int = Field(default=5, ge=1, le=10)
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
    attachment_root: Path = Path(__file__).resolve().parents[2] / ".local/attachments"
    photo_collection_enabled: bool = True
    photo_collection_batch_size: int = Field(default=25, ge=1, le=100)
    photo_refresh_days: int = Field(default=7, ge=1, le=90)
    photo_max_bytes: int = Field(default=8 * 1024 * 1024, ge=1024, le=16 * 1024 * 1024)

    @field_validator("attachment_root")
    @classmethod
    def absolute_attachment_root(cls, value):
        if not value.is_absolute():
            raise ValueError("ATTACHMENT_ROOT must be an absolute path")
        return value

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

    ai_provider: Literal["auto", "disabled", "openai"] = "auto"
    ai_model: str = Field(default="gpt-5.6-luna", max_length=100)
    ai_pricing_model: str = Field(default="gpt-5.6-luna", max_length=100)
    # Official standard token prices verified 2026-09-15: USD 0.20 / 1.20
    # per million tokens. Cached-input discounts are deliberately not assumed.
    ai_input_microusd_per_million_tokens: int | None = Field(default=200000, ge=0)
    ai_output_microusd_per_million_tokens: int | None = Field(default=1200000, ge=0)
    ai_api_key: SecretStr = SecretStr("")
    ai_timeout_seconds: float = Field(default=20, ge=1, le=30)
    ai_max_input_bytes: int = Field(default=65536, ge=100, le=131072)
    ai_max_output_tokens: int = Field(default=2048, ge=64, le=4096)
    ai_max_daily_calls: int = Field(default=200, ge=0, le=1000)
    ai_max_daily_tokens: int = Field(default=4000000, ge=0, le=10000000)
    ai_reserved_call_microusd: int = Field(default=20000, ge=1)
    ai_daily_budget_microusd: int = Field(default=1000000, ge=0)
    ai_max_model_calls: int = Field(default=3, ge=1, le=3)
    ai_max_tool_calls: int = Field(default=6, ge=1, le=6)
    ai_request_timeout_seconds: float = Field(default=60, ge=5, le=60)
    ai_max_concurrency: int = Field(default=2, ge=1, le=4)
    ai_principal_requests_per_minute: int = Field(default=6, ge=1, le=30)

    @field_validator("ai_model", "ai_pricing_model", mode="before")
    @classmethod
    def default_empty_ai_model(cls, value):
        return "gpt-5.6-luna" if value is None or str(value).strip() == "" else value

    @field_validator("ai_provider", mode="before")
    @classmethod
    def default_empty_ai_provider(cls, value):
        return "auto" if value is None or str(value).strip() == "" else value

    @field_validator("ai_api_key", mode="before")
    @classmethod
    def trim_ai_key(cls, value):
        if isinstance(value, SecretStr):
            value = value.get_secret_value()
        return value.strip() if isinstance(value, str) else value

    @property
    def ai_effective_provider(self) -> Literal["disabled", "openai"]:
        if self.ai_provider == "disabled" or not self.ai_api_key.get_secret_value():
            return "disabled"
        return "openai"
