"""Preserve KMA's categorical precipitation; never turn a range into a number."""

import re

from app.water_index.conditions import DisplayMetric

PRECIPITATION = re.compile(
    r"(?:PCP|RN1)=(강수없음|[0-9]+(?:\.[0-9]+)?"
    r"(?:~[0-9]+(?:\.[0-9]+)?)?mm(?: 미만| 이상)?)"
)


def select_precipitation_text(metrics, envelope):
    latest = max((s.observed_at for m in metrics for s in m.evidence), default=None)
    candidates = [
        m for m in metrics if any(s.observed_at == latest for s in m.evidence)
    ]
    grids = [m for m in candidates if m.relation == "containing_forecast_grid"]
    if grids:
        candidates = grids
    values = []
    for metric in candidates:
        if (
            metric.status != "missing"
            or metric.reason_codes != ("numeric_measurement_missing",)
            or len(metric.evidence) != 1
        ):
            return None
        source = metric.evidence[0]
        if (
            source.is_missing
            or source.numeric_value is not None
            or source.unit != "mm/1h"
            or source.provider not in {"kma_short_forecast", "kma_ultra_forecast"}
            or source.mode != envelope.mode
            or source.mode != "forecast"
            or source.fetched_at > envelope.as_of
            or source.issued_at is None
            or source.issued_at > envelope.as_of
            or source.valid_until is None
            or not source.valid_from <= envelope.at < source.valid_until
            or not source.spatial_scope
        ):
            return None
        match = PRECIPITATION.fullmatch(source.text_value or "")
        if match is None:
            return None
        values.append(match[1])
    if not candidates or len(set(values)) != 1:
        return None
    selected = min(candidates, key=lambda m: m.station_id)
    return DisplayMetric(
        **{
            **selected.model_dump(),
            "status": "text",
            "value": None,
            "text_value": values[0],
            "reason_codes": ("provider_precipitation_category",),
        }
    )
