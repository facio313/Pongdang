from typing import Literal

from pydantic import Field, SecretStr
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
    collector_poll_seconds: int = Field(default=30, ge=5, le=300)
    sso_proxy_secret: SecretStr = SecretStr("")
    sso_allowed_origins: str = ""
    notifications_provider: Literal["disabled", "resend"] = "disabled"
    notifications_resend_api_key: SecretStr = SecretStr("")
    notifications_from_email: str = ""
    notifications_delivery_enabled: bool = False
    livecam_allowed_hosts: str = ""
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
