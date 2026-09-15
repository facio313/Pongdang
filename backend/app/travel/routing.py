"""Explicit second-stage route recommendation over a bounded candidate set."""

import asyncio
import hashlib
import itertools
import json
import math
from datetime import UTC, date, datetime, timedelta

from fastapi import HTTPException
from pydantic import Field, model_validator

from app.travel import keywords, storage, tokens
from app.travel.catalog import KST, Catalog
from app.travel.directions import DirectionError, KakaoDirections
from app.travel.environment import EnvironmentReader
from app.travel.models import Record, TravelPreference, TravelRequest
from app.travel.recommend import rank_places


class RouteRecommendationInput(Record):
    selection_token: str = Field(min_length=1, max_length=16000)
    request: TravelRequest | None = None
    candidate_ranks: list[int] = Field(default_factory=list, max_length=5)
    stop_count: int | None = Field(default=None, ge=1, le=5)
    stay_minutes: int = Field(default=60, ge=5, le=240)
    day: date | None = None
    include_geometry: bool = True

    @model_validator(mode="after")
    def unique_ranks(self):
        if len(set(self.candidate_ranks)) != len(self.candidate_ranks) or any(
            type(r) is not int or r < 1 for r in self.candidate_ranks
        ):
            raise ValueError("invalid_candidate_ranks")
        return self


def base_result(request, now, status, reasons):
    return {
        "contract_version": "travel-route.v1",
        "stage": "route",
        "request": request.model_dump(mode="json"),
        "status": status,
        "reason_codes": reasons,
        "queried_at": now.isoformat(),
        "route": None,
        "alternatives": [],
        "route_calculated": False,
        "safety_status": "unknown",
        "saved": False,
    }


async def recommend_route(
    settings, owner, body, *, now=None, catalog=None, directions=None, environment=None
):
    now = now or datetime.now(UTC)
    selection = tokens.decode(settings, owner, body.selection_token, now)
    original = body.request or TravelRequest.model_validate(selection["request"])
    try:
        request = keywords.normalize(original)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from None
    ranks = body.candidate_ranks or list(
        range(1, min(len(selection["spot_ids"]), 5) + 1)
    )
    if any(rank > len(selection["spot_ids"]) for rank in ranks):
        raise HTTPException(422, "selected_rank_not_found")
    ids = [selection["spot_ids"][rank - 1] for rank in ranks]
    stop_count = body.stop_count or min(3, len(ids))
    required = set(request.must_include)
    if not required <= set(ids):
        return base_result(
            original, now, "conflict", ["must_include_not_in_selected_candidates"]
        )
    day = body.day or (request.dates[0] if len(request.dates) == 1 else None)
    if day is None or day not in request.dates:
        return base_result(original, now, "clarification", ["route_date_required"])
    if not request.origin or not request.departure_time:
        return base_result(
            original, now, "clarification", ["route_origin_and_departure_required"]
        )
    start = datetime.combine(day, request.departure_time, KST)
    if start < now - timedelta(minutes=5):
        return base_result(original, now, "clarification", ["route_departure_in_past"])
    if request.transport != "driving":
        return base_result(
            original, now, "unconfigured", ["route_transport_not_configured"]
        )
    catalog = catalog or Catalog(settings, now)
    places = await catalog.places(ids)
    origin = request.origin.model_dump()
    if request.origin.spot_id:
        origin = (await catalog.places([request.origin.spot_id]))[
            request.origin.spot_id
        ]
    if origin.get("latitude") is None or origin.get("longitude") is None:
        return base_result(
            original, now, "clarification", ["origin_coordinates_required"]
        )
    # Re-read the signed candidates, current profile and controls before routing.
    preference = (await asyncio.to_thread(storage.profile, settings, owner))[
        "preference"
    ]
    if selection.get("preference") is not None:
        preference = TravelPreference.model_validate(selection["preference"])
    if request.max_travel_minutes is None and not keywords.choices(request, "mobility"):
        limit = (
            request.mood.max_travel_minutes
            if request.mood and request.mood.confirmed
            else None
        )
        request = request.model_copy(
            update={"max_travel_minutes": limit or preference.max_travel_minutes}
        )
    signals = await asyncio.to_thread(storage.signals, settings, owner)
    single_day = request.model_copy(update={"dates": [day]})
    restrictions = await catalog.restrictions(ids, single_day)
    ranked, excluded = rank_places(
        list(places.values()), single_day, preference, signals, restrictions
    )
    ranked = [row for row in ranked if row[0]["spot_id"] not in request.exclude]
    ids = [row[0]["spot_id"] for row in ranked]
    if not required <= set(ids) or len(ids) < stop_count:
        result = base_result(
            original,
            now,
            "no_data",
            ["insufficient_verified_candidates_for_stop_count"],
        )
        result.update(excluded=excluded, available_count=len(ids))
        return result
    points = {row[0]["spot_id"]: sum(m.weight for m in row[1]) for row in ranked}
    directions = directions or KakaoDirections(settings, now)
    if directions.status != "configured":
        return base_result(
            original, now, directions.status, ["route_provider_" + directions.status]
        )
    environment = environment or EnvironmentReader(catalog)
    nodes = {0: origin, **{sid: places[sid] for sid in ids}}
    pairs = [(a, b) for a in nodes for b in nodes if a != b]
    matrix, failures = {}, []

    async def get_pair(a, b):
        try:
            matrix[a, b] = await directions.leg(nodes[a], nodes[b], start)
        except DirectionError as exc:
            failures.append(
                {
                    "from_spot_id": a or None,
                    "to_spot_id": b or None,
                    "reason": str(exc),
                }
            )

    await asyncio.gather(*(get_pair(a, b) for a, b in pairs))
    if directions.status == "authentication_failed":
        return base_result(
            original, now, "unconfigured", ["route_provider_authentication_failed"]
        )
    candidates, rejected = [], []
    considered = 0
    for order in itertools.permutations(ids, stop_count):
        if not required <= set(order):
            continue
        considered += 1
        cursor, previous, legs, items = start, 0, [], []
        reason = None
        for sid in (*order, 0):
            edge = matrix.get((previous, sid))
            if edge is None:
                reason = "route_edge_unavailable"
                break
            minutes = math.ceil(edge["duration_seconds"] / 60)
            if request.max_travel_minutes and minutes > request.max_travel_minutes:
                reason = "travel_tolerance_exceeded"
                break
            arrival = cursor + timedelta(minutes=minutes)
            legs.append(
                {
                    "from_spot_id": previous or None,
                    "to_spot_id": sid or None,
                    "departure_at": cursor.isoformat(),
                    "arrival_at": arrival.isoformat(),
                    "duration_minutes": minutes,
                    "evidence": edge,
                    "timing_status": "estimate_from_reference_departure_matrix",
                }
            )
            cursor = arrival
            if sid:
                end = cursor + timedelta(minutes=body.stay_minutes)
                match = await environment.compare(sid, request, cursor, end)
                items.append(
                    {
                        "spot_id": sid,
                        "name": places[sid]["name"],
                        "arrival_at": cursor.isoformat(),
                        "departure_at": end.isoformat(),
                        "stay_minutes": body.stay_minutes,
                        "activities": keywords.activity_options(request, places[sid]),
                        "preference_points": points[sid],
                        "environment_match": match,
                    }
                )
                cursor = end
            previous = sid
        if reason:
            rejected.append({"spot_ids": list(order), "reason": reason})
            continue
        if request.return_by and cursor > datetime.combine(day, request.return_by, KST):
            rejected.append(
                {"spot_ids": list(order), "reason": "return_deadline_exceeded"}
            )
            continue
        known_toll = sum(edge["evidence"]["toll_krw"] or 0 for edge in legs)
        budget = (
            request.budget.amount
            * (request.people if request.budget.basis == "per_person" else 1)
            if request.budget
            else None
        )
        if budget is not None and known_toll > budget:
            rejected.append(
                {"spot_ids": list(order), "reason": "known_toll_exceeds_budget"}
            )
            continue
        env_known = (
            all(i["environment_match"]["preference_points"] is not None for i in items)
            if request.environment_preferences
            else True
        )
        environmental = sum(
            i["environment_match"]["preference_points"] or 0 for i in items
        ) / len(items)
        travel = sum(edge["duration_minutes"] for edge in legs)
        preference_points = sum(points[sid] for sid in order) / len(order)
        utility = round(preference_points + environmental - travel * 0.25, 2)
        candidates.append(
            {
                "spot_ids": list(order),
                "items": items,
                "legs": legs,
                "return_at": cursor.isoformat(),
                "travel_minutes": travel,
                "objective_value": utility if env_known else None,
                "provisional_order_value": utility,
                "environment_complete": env_known,
                "cost": {
                    "known_toll_krw": known_toll,
                    "total_krw": None,
                    "budget_status": "unknown",
                },
            }
        )
    candidates.sort(
        key=lambda r: (
            not r["environment_complete"],
            -r["provisional_order_value"],
            r["spot_ids"],
        )
    )
    result = base_result(original, now, "partial", [])
    result.update(
        policy={
            "version": "preference-environment-route.v1",
            "formula": (
                "mean(place preference points) + mean(explicit"
                " environment range match points) - 0.25 * "
                "driving minutes"
            ),
            "environment_weight": 1,
            "travel_minute_penalty": 0.25,
            "meaning": "travel_preference_comparison_not_safety_score",
        },
        candidate_scope={
            "spot_ids": ids,
            "candidate_limit": 5,
            "requested_stop_count": stop_count,
            "orders_considered": considered,
            "orders_feasible": len(candidates),
            "reference_departure_at": start.isoformat(),
            "matrix_edges": len(matrix),
            "matrix_failures": failures,
            "search": "exhaustive_permutations_of_selected_candidates",
            "area_wide_optimum": False,
        },
        excluded=excluded,
        rejected_orders=rejected,
    )
    if not candidates:
        result.update(
            status="query_failed" if failures else "conflict",
            reason_codes=["no_verifiable_feasible_route"],
        )
        return result
    winner = candidates[0]
    complete = all(r["environment_complete"] for r in candidates) and not failures
    result.update(
        route=winner,
        route_calculated=True,
        optimality="best_under_reference_matrix_and_sampled_preferences"
        if complete
        else "provisional_missing_comparison_evidence",
        reason_codes=[
            "reference_time_matrix_estimate",
            "visit_support_and_total_cost_unverified",
        ],
    )
    if not complete:
        result["reason_codes"].append("environment_or_route_comparison_incomplete")
    # Detailed paths are fetched only after order selection and only on explicit
    # route requests. Reference departure stays the same as the comparison.
    if body.include_geometry:
        for leg in winner["legs"]:
            a, b = leg["from_spot_id"] or 0, leg["to_spot_id"] or 0
            try:
                detail = await directions.leg(nodes[a], nodes[b], start, geometry=True)
                leg["geometry"] = {
                    "polyline": detail["polyline"],
                    "source_record_id": detail["source_record_id"],
                    "fetched_at": detail["fetched_at"],
                    "independently_fetched": True,
                    "summary_may_differ": detail["duration_seconds"]
                    != leg["evidence"]["duration_seconds"],
                }
            except DirectionError:
                leg["geometry"] = {"polyline": [], "status": "unavailable"}
    result["alternatives"] = [
        {k: v for k, v in candidate.items() if k not in {"legs", "items"}}
        for candidate in candidates[1:4]
    ]
    result["plan_input"] = {
        "request": original.model_dump(mode="json"),
        "stops": [
            {
                "item_id": f"route-{index}-{item['spot_id']}",
                "spot_id": item["spot_id"],
                "day": day.isoformat(),
                "stay_minutes": item["stay_minutes"],
            }
            for index, item in enumerate(winner["items"])
        ],
    }
    digest = hashlib.sha256(json.dumps(result, sort_keys=True).encode()).hexdigest()[
        :16
    ]
    result["result_id"] = "route:" + digest
    return result


def render_route(result, locale="ko"):
    if not result.get("route"):
        if locale == "ko":
            reasons = {
                "route_date_required": "날짜를 선택해 주세요.",
                "route_origin_and_departure_required": "출발지와 시각이 필요해요.",
                "origin_coordinates_required": "지도에서 출발 위치를 선택해 주세요.",
                "route_departure_in_past": "새 출발 시각을 선택해요.",
                "route_provider_authentication_failed": "길찾기 인증 설정을 확인해요.",
                "route_provider_unconfigured": "길찾기 설정이 필요해요.",
                "route_provider_disabled": "길찾기가 비활성 상태예요.",
                "route_transport_not_configured": "자동차 이동을 선택해요.",
                "insufficient_verified_candidates_for_stop_count": "후보가 부족해요.",
                "no_verifiable_feasible_route": "조건에 맞는 경로를 못 찾았어요.",
                "must_include_not_in_selected_candidates": "필수 장소를 선택해요.",
            }
            return " ".join(
                reasons.get(code, "경로 계산 조건을 확인해 주세요.")
                for code in result["reason_codes"]
            )
        messages = {
            "ko": "경로 계산에 필요한 조건을 확인해 주세요. 현재 상태: ",
            "en": (
                "Check the selected places, origin coordinates"
                " and departure date/time. Route status: "
            ),
            "ja": "候補地点、出発座標と日時を確認してください。経路の状態：",
            "zh-CN": "请确认候选地点、出发坐标和时间。路线状态：",
            "zh-TW": "請確認候選地點、出發座標和時間。路線狀態：",
        }
        return messages[locale] + ", ".join(result["reason_codes"])
    route = result["route"]
    lines = [
        {
            "ko": (
                "취향·환경 선호와 이동시간을 비교했어요. "
                "이 순서로 방문하는 경로를 제안해요."
            ),
            "en": (
                "This visiting order compares your "
                "preferences, environmental data and travel "
                "times."
            ),
            "ja": "好み、環境情報と移動時間を比較した訪問順です。",
            "zh-CN": "根据您的偏好、环境资料和交通时间，建议以下到访顺序。",
            "zh-TW": "根據您的偏好、環境資料和交通時間，建議以下到訪順序。",
        }[locale]
    ]
    for index, item in enumerate(route["items"], 1):
        start = datetime.fromisoformat(item["arrival_at"]).astimezone(KST)
        end = datetime.fromisoformat(item["departure_at"]).astimezone(KST)
        lines.append(f"{index}. {item['name']} · {start:%H:%M}–{end:%H:%M} KST")
    lines.append(
        {
            "ko": (
                "시각은 출발 기준 경로 자료로 계산한 예상값이에요. "
                "활동 가능 여부와 총비용은 별도 확인이 필요해요."
            ),
            "en": (
                "Times are estimates using a departure-time "
                "route matrix. Activity availability and total"
                " costs still need checking."
            ),
            "ja": (
                "時刻は出発時点の経路情報による推定です。"
                "活動の可否と総費用は確認が必要です。"
            ),
            "zh-CN": "时间根据出发时的路线资料估算，活动开放情况及总费用仍需确认。",
            "zh-TW": "時間根據出發時的路線資料估算，活動開放情況及總費用仍需確認。",
        }[locale]
    )
    if result["optimality"].startswith("provisional"):
        lines.append(
            {
                "ko": (
                    "환경 또는 경로 비교 자료가 부족해요. "
                    "최적 경로로 확정할 수 없는 잠정 순서예요."
                ),
                "en": (
                    "The order is provisional because some "
                    "comparison evidence is missing."
                ),
                "ja": "比較資料が不足しているため、暫定的な順番です。",
                "zh-CN": "部分比较资料不足，因此顺序为暂定。",
                "zh-TW": "部分比較資料不足，因此順序為暫定。",
            }[locale]
        )
    return "\n\n".join(lines)
