"""Recommendation previews read the worker's completed, bounded result set."""

from datetime import timedelta

from fastapi import HTTPException

from app.travel.environment import EnvironmentReader
from app.water_index.condition_api import ConditionQuery
from app.water_index.condition_storage import read_condition_set
from app.water_index.conditions import ACTIVITIES


class PublishedEnvironmentReader(EnvironmentReader):
    async def prefetch(self, ids, request, target):
        """One database read, with the same current-forecast fallback as details.

        No provider call, score calculation or write occurs when data is absent.
        The entire shortlist sees one publication rather than 30 different reads.
        """
        ids = list(dict.fromkeys(ids))
        if not ids:
            return
        mode = "forecast" if target > self.catalog.now else "observation"
        fallback = target == self.catalog.now and mode == "observation"
        # 고른 활동마다 하나씩 표본을 만듭니다. 어느 것을 쓸지는 `at` 이
        # `choose` 로 정합니다 -- 여기서는 **전부** 읽어 두는 일만 합니다.
        wanted = self.wanted_activities(request)
        # 선택 범위 선호(바람 · 강수 등)가 고른 활동들의 지표에 없으면 그 값을
        # 빌려 오는 활동. 후보가 아니라 **지표 출처**이므로 따로 둡니다.
        borrowed = []
        missing = {item.metric for item in request.environment_preferences} - {
            metric.name
            for activity in wanted
            for metric in ACTIVITIES[activity].metrics
        }
        for activity in ("surf", "relax"):
            names = {metric.name for metric in ACTIVITIES[activity].metrics}
            if missing & names and activity not in wanted:
                borrowed.append(activity)
                missing -= names
        activities = wanted + borrowed
        modes = [mode, "forecast"] if fallback else [mode]
        queries = [
            ConditionQuery(
                spot_id=sid,
                activity=activity,
                mode=source_mode,
                at=target,
                as_of=self.catalog.now,
            )
            for source_mode in modes
            for sid in ids
            for activity in activities
        ]
        try:
            rows = await read_condition_set(
                self.catalog.reader, queries, now=self.catalog.now
            )
        except (ValueError, HTTPException) as exc:
            if isinstance(exc, HTTPException) and exc.status_code != 503:
                raise
            status = "query_failed" if isinstance(exc, HTTPException) else "unknown"
            rows = []
            failure = {
                "status": status,
                "forecast_status": "outside_forecast_horizon"
                if abs(target - self.catalog.now) > timedelta(days=31)
                else "unknown",
                "reason_codes": [
                    "environment_query_failed"
                    if status == "query_failed"
                    else "outside_forecast_horizon_or_invalid_evidence"
                ],
                "metrics": [],
            }
        indexed = {
            (q.spot_id, q.activity, q.mode): row
            for q, row in zip(queries, rows, strict=bool(rows))
        }
        for sid, primary in ((sid, a) for sid in ids for a in wanted):
            current = indexed.get((sid, primary, mode))
            predicted = indexed.get((sid, primary, "forecast"))
            if not rows:
                sample = failure | {"activity": primary}
            elif isinstance(current, HTTPException):
                sample = {
                    "activity": primary,
                    "status": "query_failed",
                    "reason_codes": ["published_condition_unavailable"],
                    "metrics": [],
                }
            else:
                sample = current.model_dump(mode="json")
                score = sample.get("condition_score") or {}
                if (
                    fallback
                    and score.get("score") is None
                    and score.get("status") != "blocked"
                    and sample["safety_status"] != "restricted"
                    and sample["support_status"] != "unsupported"
                    and not isinstance(predicted, HTTPException)
                ):
                    predicted = predicted.model_dump(mode="json")
                    if (predicted.get("condition_score") or {}).get(
                        "score"
                    ) is not None:
                        sample = predicted
                extra_metrics = list(sample.get("metrics", []))
                present = {metric["name"] for metric in extra_metrics}
                mappings = {metric.get("mapping_id") for metric in extra_metrics}
                mappings.discard(None)
                for activity in borrowed:
                    extra = indexed.get((sid, activity, sample["mode"]))
                    if isinstance(extra, HTTPException) or extra is None:
                        continue
                    if extra.support_status == "unsupported" or extra.retained:
                        continue
                    extra_metrics.extend(
                        metric.model_dump(mode="json")
                        for metric in extra.metrics
                        if metric.name not in present and metric.mapping_id in mappings
                    )
                    present.update(metric["name"] for metric in extra_metrics)
                sample["preference_metrics"] = extra_metrics
            self.cache[(sid, primary, target.isoformat())] = sample

    async def at(self, sid, request, target, exclude=()):
        wanted = self.wanted_activities(request, exclude)
        keys = [(sid, activity, target.isoformat()) for activity in wanted]
        if any(key not in self.cache for key in keys):
            async with self.gate:
                if any(key not in self.cache for key in keys):
                    await self.prefetch([sid], request, target)
        return self.choose([self.cache[key] for key in keys])


def preview_sample(match):
    return next(iter(match.get("samples", [])), {})


def ranking_score(match):
    """Compare complete same-activity scores; missing/retained is never zero."""
    sample = preview_sample(match)
    score = sample.get("condition_score") or {}
    if (
        sample.get("retained")
        or sample.get("safety_status") == "restricted"
        or sample.get("support_status") == "unsupported"
        or score.get("status") != "evaluated"
    ):
        return None
    return score.get("score")


def condition_summary(match):
    sample = preview_sample(match)
    score = ranking_score(match)
    return {
        "status": "query_failed"
        if sample.get("status") == "query_failed"
        else "available"
        if score is not None
        else "partial",
        "source": "published_condition_result",
        "ranking_score": score,
        "facts": [],
        "forecast_status": sample.get("forecast_status", sample.get("mode", "unknown")),
        "reason_codes": sample.get("reason_codes", []),
        "published_condition": sample,
    }


def describe_score(match, locale, *, comparable=True):
    score = ranking_score(match)
    if score is None:
        return {
            "ko": "저장된 조건 자료가 부족하거나 이전 자료여서 점수 비교는 보류했어요.",
            "en": "Stored conditions are incomplete or retained; "
            "score comparison is pending.",
            "ja": "保存された条件資料が不足または過去のため、"
            "点数比較は保留しています。",
            "zh-CN": "已保存的条件资料不足或为旧资料，暂不比较分数。",
            "zh-TW": "已儲存的條件資料不足或為舊資料，暫不比較分數。",
        }[locale]
    if not comparable:
        return {
            "ko": "장소별 점수 항목이 달라 총점으로 순위를 비교하지 않았어요.",
            "en": "Scoring profiles differ; totals did not set the order.",
            "ja": "地点ごとに点数項目が異なるため、合計点で順位を比較していません。",
            "zh-CN": "地点的评分项目不同，因此未按总分排序。",
            "zh-TW": "地點的評分項目不同，因此未按總分排序。",
        }[locale]
    return {
        "ko": f"같은 활동의 저장된 조건 참고 점수 {score:g}점을 비교했어요. "
        "입수 안전 판정은 아니에요.",
        "en": f"Compared the stored {score:g}-point score for the same activity; "
        "this is not a safety judgment.",
        "ja": f"同じ活動の保存済み条件参考点数{score:g}点を比較しました。"
        "入水の安全判定ではありません。",
        "zh-CN": f"比较了同一活动已保存的条件参考分数{score:g}分。这不是入水安全判断。",
        "zh-TW": f"比較了同一活動已儲存的條件參考分數{score:g}分。這不是入水安全判斷。",
    }[locale]
