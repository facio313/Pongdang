"""Read validated mapped evidence and compare explicit wishes, never safety."""

import asyncio
from datetime import datetime, time, timedelta

from fastapi import HTTPException

from app.travel.catalog import KST
from app.water_index.condition_api import ConditionQuery, read_conditions
from app.water_index.conditions import METRICS

PREVIEW_LIMIT = 30
DISPLAY_METRICS = ("air_temperature", "precipitation", "wave_height", "wind_speed")


def preview_time(request, now):
    if not request.dates:
        return now, "current_observation_preview"
    return datetime.combine(
        request.dates[0], request.departure_time or time(12), KST
    ), (
        "departure_time_preview"
        if request.departure_time
        else "noon_preview_time_not_selected"
    )


class EnvironmentReader:
    def __init__(self, catalog):
        self.catalog = catalog
        self.cache = {}
        self.gate = asyncio.Semaphore(4)

    async def at(self, sid, request, target):
        key = (sid, request.activity, target.isoformat())
        if key not in self.cache:
            async with self.gate:
                try:
                    q = ConditionQuery(
                        spot_id=sid,
                        activity=request.activity,
                        mode="forecast" if target > self.catalog.now else "observation",
                        at=target,
                        as_of=self.catalog.now,
                    )
                    result = await read_conditions(
                        self.catalog.reader,
                        q,
                        now=self.catalog.now,
                        metric_names=list(
                            dict.fromkeys(
                                [
                                    *DISPLAY_METRICS,
                                    *(
                                        p.metric
                                        for p in request.environment_preferences
                                    ),
                                ]
                            )
                        ),
                    )
                    self.cache[key] = result.model_dump(mode="json")
                except ValueError:
                    self.cache[key] = {
                        "status": "unknown",
                        "reason_codes": [
                            "outside_forecast_horizon_or_invalid_evidence"
                        ],
                        "metrics": [],
                    }
                except HTTPException as exc:
                    if exc.status_code not in {422, 503}:
                        raise
                    self.cache[key] = {
                        "status": "query_failed",
                        "reason_codes": ["environment_query_failed"],
                        "metrics": [],
                    }
        return self.cache[key]

    async def compare(self, sid, request, start, until=None):
        # At most five hourly samples, including the final instant. No daily
        # forecast is treated as proof of an hourly visit condition.
        until = until or start
        targets = [start]
        cursor = start + timedelta(hours=1)
        while cursor < until:
            targets.append(cursor)
            cursor += timedelta(hours=1)
        if until > start:
            targets.append(until - timedelta(microseconds=1))
        if len(targets) > 6:
            raise HTTPException(422, "environment_visit_window_too_large")
        samples = [await self.at(sid, request, at) for at in targets]
        return compare_samples(request.environment_preferences, samples, start, until)


def compare_samples(criteria, samples, start, until):
    details = []
    for criterion in criteria:
        values, evidence, reasons = [], [], []
        for sample in samples:
            rows = [
                m for m in sample.get("metrics", []) if m["name"] == criterion.metric
            ]
            valid = [
                m
                for m in rows
                if m["status"] == "available"
                and m["relation"] == "representative_station"
                and m.get("mapping_id")
            ]
            if len(rows) != 1 or len(valid) != 1:
                reasons.extend(sample.get("reason_codes", []))
                reasons.append("missing_stale_conflicting_or_unmapped_evidence")
                continue
            row = valid[0]
            values.append(row["value"])
            evidence.append(
                {
                    "mapping_id": row["mapping_id"],
                    "station_id": row["station_id"],
                    "sources": row["evidence"],
                }
            )
        complete = len(values) == len(samples)
        matched = (
            all(
                (criterion.minimum is None or v >= criterion.minimum)
                and (criterion.maximum is None or v <= criterion.maximum)
                for v in values
            )
            if complete
            else None
        )
        details.append(
            {
                **criterion.model_dump(),
                "unit": METRICS[criterion.metric].unit,
                "status": "matched"
                if matched
                else "not_matched"
                if matched is False
                else "unknown",
                "values": values,
                "matched": matched,
                "evidence": evidence,
                "reason_codes": sorted(set(reasons)),
            }
        )
    total = sum(c.weight for c in criteria)
    complete = bool(criteria) and all(d["matched"] is not None for d in details)
    points = (
        round(100 * sum(d["weight"] for d in details if d["matched"]) / total, 1)
        if complete
        else None
    )
    return {
        "policy": "explicit-environment-preferences.v1",
        "meaning": "selected_range_match_not_safety_or_scientific_suitability",
        "status": "evaluated"
        if complete
        else "not_selected"
        if not criteria
        else "incomplete",
        "preference_points": points,
        "criteria": details,
        "target_start_at": start.isoformat(),
        "target_end_at": until.isoformat(),
        "sampling": "hourly_and_endpoints" if until > start else "instant_preview",
        "continuous_coverage_verified": False,
        "samples": samples,
        "safety_status": "unknown",
    }


def describe_match(result, locale):
    if not result or result["status"] == "not_selected":
        return ""
    if result["status"] != "evaluated":
        return {
            "ko": "선택한 환경 조건은 자료가 부족해 아직 비교를 마치지 못했어요.",
            "en": "Some selected environmental preferences lack evidence.",
            "ja": "選んだ環境条件を比較する資料が不足しています。",
            "zh-CN": "所选环境偏好的比较资料仍不完整。",
            "zh-TW": "所選環境偏好的比較資料仍不完整。",
        }[locale]
    from app.water_index.conditions import METRICS

    values = []
    for criterion in result["criteria"]:
        name = (
            METRICS[criterion["metric"]].label
            if locale == "ko"
            else criterion["metric"]
        )
        values.append(
            f"{name} {', '.join(str(v) for v in criterion['values'])} "
            f"{criterion['unit']}"
        )
    prefix = {
        "ko": "선택한 환경 범위와 비교한 자료: ",
        "en": "Evidence compared with your selected ranges: ",
        "ja": "選んだ範囲と比較した資料：",
        "zh-CN": "用于比较所选范围的资料：",
        "zh-TW": "用於比較所選範圍的資料：",
    }[locale]
    return prefix + "; ".join(values)
