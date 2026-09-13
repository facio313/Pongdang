from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

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
