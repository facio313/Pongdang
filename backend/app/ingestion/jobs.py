from collections.abc import Callable
from dataclasses import dataclass

from app.ingestion.models import SourceBatch


@dataclass(frozen=True)
class Job:
    name: str
    interval_seconds: int
    fetch: Callable[[], SourceBatch]
    enabled: bool = True
