"""Recommendation previews read the worker's completed, bounded result set."""

from datetime import timedelta

from fastapi import HTTPException

from app.travel.environment import EnvironmentReader, preference_metrics
from app.water_index.condition_api import ConditionQuery
from app.water_index.condition_storage import read_condition_set
from app.water_index.conditions import ACTIVITIES, ConditionsEnvelope
from app.water_index.recommendation import SEA_ACTIVITIES, activity_eligibility


class PublishedEnvironmentReader(EnvironmentReader):
    async def prefetch(self, ids, request, target):
        """One score-publication read and the same forecast fallback as details.

        No provider call, score calculation or write occurs when data is absent.
        The entire shortlist sees one publication rather than 30 different reads.
        Eligible beach water activities additionally read bounded tide context.
        """
        ids = list(dict.fromkeys(ids))
        if not ids:
            return
        mode = "forecast" if target > self.catalog.now else "observation"
        fallback = target == self.catalog.now and mode == "observation"
        activities = [request.activity]
        missing = {item.metric for item in request.environment_preferences} - {
            metric.name for metric in ACTIVITIES[request.activity].metrics
        }
        for activity in ("surf", "relax"):
            names = {metric.name for metric in ACTIVITIES[activity].metrics}
            if missing & names:
                activities.append(activity)
                missing -= names
        modes = [mode, "forecast"] if fallback else [mode]
        queries = [
            ConditionQuery(
                spot_id=sid,
                activity=activity,
                mode=source_mode,
                at=target,
                as_of=None if target > self.catalog.now else self.catalog.now,
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
        for sid in ids:
            current = indexed.get((sid, request.activity, mode))
            predicted = indexed.get((sid, request.activity, "forecast"))
            if not rows:
                sample = failure.copy()
            elif isinstance(current, HTTPException):
                sample = {
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
                extra_metrics = preference_metrics(sample)
                present = {metric["name"] for metric in extra_metrics}
                mappings = {metric.get("mapping_id") for metric in extra_metrics}
                mappings.discard(None)
                for activity in activities[1:]:
                    extra = indexed.get((sid, activity, sample["mode"]))
                    if isinstance(extra, HTTPException) or extra is None:
                        continue
                    if extra.support_status == "unsupported" or extra.retained:
                        continue
                    extra_metrics.extend(
                        metric.model_dump(mode="json")
                        for metric in (*extra.metrics, *extra.context_metrics)
                        if metric.name not in present
                        and (
                            metric.mapping_id in mappings
                            or metric.relation == "containing_forecast_grid"
                        )
                    )
                    present.update(metric["name"] for metric in extra_metrics)
                sample["preference_metrics"] = extra_metrics
                attach_eligibility(sample)
            self.cache[(sid, request.activity, target.isoformat())] = sample
        if request.activity in SEA_ACTIVITIES:
            await self._attach_tides(ids, request, target)

    async def _attach_tides(self, ids, request, target):
        """Reuse today's bounded, read-only tide context for eligible beach visits."""
        from app.water_index.recommendation_api import (
            RECOMMENDATION_CONTEXT_TIMEOUT,
            TIDE_LOOKUP_TIMEOUT,
            optional_lookup,
            read_tide,
        )

        samples = [
            self.cache[(sid, request.activity, target.isoformat())] for sid in ids
        ]
        samples = [
            sample
            for sample in samples
            if sample.get("place_kind") == "beach"
            and sample.get("activity_eligibility", {}).get("dropped") is False
            and not sample.get("retained")
        ]
        if not samples:
            return
        failures = []
        for sample in samples:
            sample["tide_lookup_status"] = "unavailable"
        async with optional_lookup(
            failures,
            "recommendation_context_unavailable",
            samples[0]["spot_id"],
            timeout=RECOMMENDATION_CONTEXT_TIMEOUT,
        ):
            async with self.catalog.reader.connection() as connection:
                for sample in samples:
                    async with optional_lookup(
                        failures,
                        "tide_lookup_unavailable",
                        sample["spot_id"],
                        connection=connection,
                        timeout=TIDE_LOOKUP_TIMEOUT,
                    ):
                        tide = await read_tide(
                            connection, sample["spot_id"], target, self.catalog.now
                        )
                        attach_eligibility(sample, tide=tide)
                        sample["tide"] = tide.model_dump(mode="json") if tide else None
                        sample["tide_lookup_status"] = (
                            "available" if tide else "no_data"
                        )
        for sample in samples:
            if sample["tide_lookup_status"] == "unavailable":
                sample["reason_codes"] = list(
                    dict.fromkeys([*sample.get("reason_codes", []), *failures])
                )

    async def at(self, sid, request, target):
        key = (sid, request.activity, target.isoformat())
        if key not in self.cache:
            async with self.gate:
                if key not in self.cache:
                    await self.prefetch([sid], request, target)
        return self.cache[key]


def preview_sample(match):
    return next(iter(match.get("samples", [])), {})


def attach_eligibility(sample, *, tide=None):
    evidence = ConditionsEnvelope.model_validate(
        {key: sample[key] for key in ConditionsEnvelope.model_fields if key in sample}
    )
    candidate, reasons = activity_eligibility(evidence, tide=tide)
    sample["activity_eligibility"] = candidate.model_dump(mode="json")
    sample["eligibility_reasons"] = [
        reason.model_dump(mode="json") for reason in reasons
    ]


def ranking_score(match):
    """Compare complete same-activity scores; missing/retained is never zero."""
    sample = preview_sample(match)
    score = sample.get("condition_score") or {}
    if (
        sample.get("retained")
        or sample.get("safety_status") == "restricted"
        or sample.get("support_status") == "unsupported"
        or sample.get("activity_eligibility", {}).get("dropped")
        or sample.get("activity_eligibility", {}).get("demoted")
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
        "activity_eligibility": sample.get("activity_eligibility"),
        "eligibility_reasons": sample.get("eligibility_reasons", []),
        "tide": sample.get("tide"),
        "published_condition": sample,
    }


def describe_score(match, locale, *, comparable=True):
    eligibility = preview_sample(match).get("activity_eligibility", {})
    if eligibility.get("dropped") or eligibility.get("demoted"):
        return {
            "ko": "오늘 활동 추천과 같은 필수 자료·수온·물때 기준에 따라 "
            "선택한 활동의 점수 비교를 보류했어요. 장소 후보와 활동 추천은 구분합니다.",
            "en": "The same evidence, water-temperature and tide rules as today's "
            "activity recommendation withhold this activity's score comparison. "
            "A place candidate is not an activity recommendation.",
            "ja": "今日の活動提案と同じ必須資料・水温・潮汐の基準で"
            "点数比較を保留しました。"
            "場所の候補と活動の推奨は区別します。",
            "zh-CN": "按与今日活动推荐相同的必要资料、水温和潮汐规则，"
            "暂不比较所选活动分数。"
            "地点候选不代表活动推荐。",
            "zh-TW": "依今日活動推薦相同的必要資料、水溫及潮汐規則，"
            "暫不比較所選活動分數。"
            "地點候選不代表活動推薦。",
        }[locale]
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
