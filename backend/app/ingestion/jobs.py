from collections.abc import Callable
from dataclasses import dataclass

from app.ingestion.models import SourceBatch


@dataclass(frozen=True)
class Job:
    name: str
    interval_seconds: int
    fetch: Callable[[], SourceBatch] | None = None
    enabled: bool = True
    process: Callable[[], dict] | None = None
    disabled_reason: str = "KEY_NOT_CONFIGURED"
