"""Read validated mapped evidence and compare explicit wishes, never safety."""

import asyncio
from datetime import datetime, time, timedelta

from fastapi import HTTPException
from pydantic import ValidationError

from app.travel.catalog import KST
from app.travel.models import VISIT_TIME_WINDOWS
from app.water_index.activity_score import select_metric
from app.water_index.condition_api import ConditionQuery, read_conditions
from app.water_index.conditions import METRICS, ConditionMetric, ConditionsEnvelope
from app.water_index.recommendation import activity_eligibility

PREVIEW_LIMIT = 30
DISPLAY_METRICS = ("air_temperature", "precipitation", "wave_height", "wind_speed")


def preview_time(request, now):
    if not request.dates:
        return now, "current_observation_preview"
    if len(request.visit_intents) == 1:
        window = VISIT_TIME_WINDOWS.get(request.visit_intents[0].part_of_day)
        if window:
            return datetime.combine(request.dates[0], time(window[0]), KST), (
                "visit_time_window_preview"
            )
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

    @staticmethod
    def wanted_activities(request, exclude=()):
        """사용자가 고른 활동 전부. 비어 있으면 대표 활동 하나로 봅니다.

        `exclude` 는 호출자가 해당 장소에서 별도 근거로 뺀 활동입니다.
        개장 기간 정보는 이 인자로 전달하지 않으며 추천 순위를 바꾸지 않습니다.
        전부 빠지면 빼지 않습니다 -- 고른 것이 하나도 남지 않으면 그 장소를
        평가할 수 없고, 제외 판정은 부르는 쪽이 따로 내려야 합니다.
        """
        wanted = list(dict.fromkeys(request.activities or [request.activity]))
        kept = [a for a in wanted if a not in exclude]
        return kept or wanted

    @staticmethod
    def choose(samples):
        """고른 활동 가운데 **그 장소에서 가장 조건이 좋은 하나**.

        오늘 추천과 같은 필수 자료·지원·수온·물때 자격을 먼저 적용하고,
        사용자가 이미 고른 활동들 가운데 비교 가능한 점수가 가장 높은 것을
        찾습니다. 개장 기간의 확인 상태는 순위에 사용하지 않습니다.

        점수가 없는 활동은 셈에서 빠집니다 -- 결측을 0 으로 메우면 「근거 없음」이
        「조건 나쁨」으로 둔갑합니다. 전부 점수가 없으면 첫 번째를 그대로 둡니다.
        그 상태(미지원 · 조회 실패 · 예보 범위 밖)를 화면이 읽어야 합니다.
        """

        def priority(sample):
            eligibility = sample.get("activity_eligibility", {})
            score = sample.get("condition_score") or {}
            blocked = (
                sample.get("safety_status") == "restricted"
                or sample.get("support_status") == "unsupported"
                or bool(
                    set(eligibility.get("rules_applied", []))
                    & {
                        "water_too_cold_for_immersion",
                        "inland_swimming_authorization_unconfirmed",
                        "activity_not_offered_at_place",
                    }
                )
            )
            return (
                blocked,
                eligibility.get("dropped", False),
                eligibility.get("demoted", False),
                sample.get("retained", False),
                score.get("status") != "evaluated",
                score.get("score") is None,
                -(score.get("score") or 0),
            )

        best = min(samples, key=priority)
        # 어느 활동으로 뽑혔는지를 남깁니다. 화면이 「이곳은 서핑 기준으로
        # 뽑았어요」를 말할 수 있어야, 여러 활동을 고른 사용자가 그 순서를
        # 읽을 수 있습니다.
        return best | {"matched_activity": best.get("activity")}

    async def at(self, sid, request, target, exclude=()):
        """고른 활동 중 가장 조건이 좋은 것의 응답. 그 활동 이름이 함께 옵니다.

        예전에는 `request.activity` 하나만 봤습니다. 그래서 「서핑 + 휴식」을
        고르면 서핑 기준으로만 장소를 줄 세웠고, 서핑을 하지 않는 곳은 휴식으로
        좋을 수 있는데 그대로 빠졌습니다.
        """
        return self.choose(
            [
                await self._one(sid, request, target, activity)
                for activity in self.wanted_activities(request, exclude)
            ]
        )

    async def _one(self, sid, request, target, activity):
        key = (sid, activity, target.isoformat())
        if key not in self.cache:
            async with self.gate:
                try:
                    q = ConditionQuery(
                        spot_id=sid,
                        activity=activity,
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
                    sample = result.model_dump(mode="json")
                    candidate, reasons = activity_eligibility(result)
                    sample["activity_eligibility"] = candidate.model_dump(mode="json")
                    sample["eligibility_reasons"] = [
                        reason.model_dump(mode="json") for reason in reasons
                    ]
                    self.cache[key] = sample
                except ValueError:
                    self.cache[key] = {
                        "activity": activity,
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
                        "activity": activity,
                        "status": "query_failed",
                        "reason_codes": ["environment_query_failed"],
                        "metrics": [],
                    }
        return self.cache[key]

    async def compare(self, sid, request, start, until=None, exclude=()):
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
        samples = [await self.at(sid, request, at, exclude) for at in targets]
        return compare_samples(request.environment_preferences, samples, start, until)


WEATHER_GRID_METRICS = frozenset(
    {"air_temperature", "relative_humidity", "wind_speed", "precipitation"}
)


def preference_metrics(sample):
    """Retain primary evidence; add only absent weather fields from KMA grids."""
    rows = list(sample.get("metrics", []))
    present = {row["name"] for row in rows}
    rows.extend(
        row
        for row in sample.get("context_metrics", [])
        if row["name"] not in present
        and row["name"] in WEATHER_GRID_METRICS
        and row["relation"] == "containing_forecast_grid"
    )
    return rows


def _preference_value(row, sample):
    mapped = row["relation"] == "representative_station" and row.get("mapping_id")
    if mapped and row["status"] == "available":
        return row["value"]
    grid = (
        row["relation"] == "containing_forecast_grid"
        and row["name"] in WEATHER_GRID_METRICS
        and row.get("spatial_scope")
        and row.get("evidence")
        and all(source["provider"].startswith("kma_") for source in row["evidence"])
    )
    if not grid:
        return None
    try:
        envelope = ConditionsEnvelope.model_validate(
            {
                key: sample[key]
                for key in ConditionsEnvelope.model_fields
                if key in sample
            }
        )
        _, value, _ = select_metric([ConditionMetric.model_validate(row)], envelope)
    except ValidationError:
        return None
    return value


def compare_samples(criteria, samples, start, until):
    details = []
    for criterion in criteria:
        values, evidence, reasons = [], [], []
        for sample in samples:
            rows = [
                m
                for m in sample.get("preference_metrics", preference_metrics(sample))
                if m["name"] == criterion.metric
            ]
            value = (
                _preference_value(rows[0], sample)
                if len(rows) == 1 and not sample.get("retained")
                else None
            )
            if value is None:
                reasons.extend(sample.get("reason_codes", []))
                reasons.append("missing_stale_conflicting_or_unmapped_evidence")
                continue
            row = rows[0]
            values.append(value)
            reasons.extend(row.get("reason_codes", []))
            evidence.append(
                {
                    "mapping_id": row.get("mapping_id"),
                    "station_id": row["station_id"],
                    "relation": row["relation"],
                    "spatial_scope": row.get("spatial_scope"),
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
