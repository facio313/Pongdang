"""Pure, loss-aware projection of existing normalized collection records."""

from collections.abc import Mapping
from datetime import datetime
from typing import Any

from .models import Aggregation, InputDTO


def _same_time(first: Any, second: Any) -> bool:
    def parse(value):
        return datetime.fromisoformat(value) if isinstance(value, str) else value

    return parse(first) == parse(second)


def input_from_records(
    snapshot: Mapping[str, Any],
    metric: Mapping[str, Any],
    *,
    input_id: str,
    mapping_version: str | None = None,
    aggregation: Aggregation | None = None,
) -> InputDTO:
    """Preserve IDs, values, units and declared times; perform no DB lookup.

    The caller supplies rows read from Pongdang's allowlisted collection tables.
    Unknown aggregation/mapping remains unknown. This function does not authorize
    use, infer activity support, assign safety, or turn a provider grade into score.
    """
    if metric.get("snapshot_id") != snapshot.get("id"):
        raise ValueError("Metric and snapshot references do not match")
    for key in ("observed_at", "fetched_at", "valid_from", "valid_until"):
        if metric.get(key) is not None and not _same_time(
            metric[key], snapshot.get(key)
        ):
            raise ValueError("Conflicting metric and snapshot timing")
    mode = metric.get("mode")
    if mode not in {"observation", "forecast"}:
        raise ValueError("An explicit observation/forecast mode is required")
    return InputDTO(
        input_id=input_id,
        snapshot_id=snapshot.get("id"),
        metric_id=metric.get("id"),
        provider=snapshot.get("provider"),
        provider_record_id=snapshot.get("provider_record_id"),
        source_record_id=snapshot.get("source_record_id"),
        station_id=metric.get("station_id"),
        snapshot_station_id=snapshot.get("station_id"),
        spot_id=snapshot.get("spot_id"),
        name=metric.get("name"),
        numeric_value=metric.get("numeric_value"),
        text_value=metric.get("text_value"),
        boolean_value=metric.get("boolean_value"),
        unit=metric.get("unit"),
        mode=mode,
        state=metric.get("state"),
        observed_at=snapshot.get("observed_at"),
        issued_at=snapshot.get("issued_at"),
        fetched_at=snapshot.get("fetched_at"),
        valid_from=snapshot.get("valid_from"),
        valid_until=snapshot.get("valid_until"),
        time_role="observation_time"
        if mode == "observation"
        else "forecast_target_start",
        aggregation=aggregation or Aggregation(),
        spatial_scope=snapshot.get("spatial_scope"),
        mapping_version=mapping_version,
        quality_flags=("input_missing",) if metric.get("is_missing") is True else (),
        used_by=(),
    )
