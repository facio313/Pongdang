from collections.abc import Callable
from dataclasses import dataclass

from app.ingestion.models import SourceBatch

FORECAST_JOBS = frozenset(
    {
        "kma_ultra_forecast",
        "kma_short_forecast",
        "kma_mid_forecast",
        "kma_uv_forecast",
        "khoa_beach",
        "khoa_surfing",
        "khoa_mudflat",
        "khoa_tide_extrema",
        "khoa_tide_timeseries",
        "khoa_current_timeseries",
        "khoa_roms",
    }
)


@dataclass(frozen=True)
class Job:
    name: str
    interval_seconds: int
    fetch: Callable[[], SourceBatch] | None = None
    enabled: bool = True
    process: Callable[[], dict] | None = None
    disabled_reason: str = "KEY_NOT_CONFIGURED"
    external_collection: bool = False


def scheduled_interval(job: Job) -> int:
    """Check forecasts every 30 minutes; retain faster observation schedules."""
    if job.external_collection or job.fetch is not None:
        interval = job.interval_seconds
        if job.name in FORECAST_JOBS:
            interval = min(1800, interval)
        return max(600, interval)
    return job.interval_seconds
