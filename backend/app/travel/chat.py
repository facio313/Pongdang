"""Extend existing budgeted chat with read-only travel computation tools."""

import asyncio
import hashlib
import json
import re
from datetime import datetime, timedelta
from typing import Annotated

from fastapi import HTTPException
from pydantic import Field, create_model

from app.ai.tools import EmptyArgs, ToolError, ToolSession, _strict_schema
from app.travel import companion, storage, tokens
from app.travel.api import mood_proposal
from app.travel.catalog import KST, Catalog
from app.travel.models import (
    PlanInput,
    PlanStopInput,
    RecommendationInput,
    Record,
    TravelContext,
    TravelRequest,
)
from app.travel.plans import draft_plan
from app.travel.recommend import recommend

PATCH_FIELDS = (
    "dates region place_role origin transport departure_time return_by "
    "day_trip people companion_type budget required preferred_tags avoid "
    "activity activity_intensity max_travel_minutes mood purpose "
    "meal_preference rest_preference locale"
).split()
RequestPatch = create_model(
    "TravelRequestPatch",
    __base__=Record,
    **{
        name: (
            Annotated[
                TravelRequest.model_fields[name].annotation | None,
                *TravelRequest.model_fields[name].metadata,
                Field(),
            ],
            None,
        )
        for name in PATCH_FIELDS
    },
)


class RecommendArgs(Record):
    changes: RequestPatch = Field(default_factory=RequestPatch)
    limit: int = Field(default=3, ge=1, le=5)


class DraftArgs(Record):
    rank: int = Field(ge=1, le=10)
    stay_minutes: int = Field(default=60, ge=5, le=720)
    changes: RequestPatch = Field(default_factory=RequestPatch)


class RouteArgs(Record):
    changes: RequestPatch = Field(default_factory=RequestPatch)
    candidate_ranks: list[int] = Field(default_factory=list, max_length=5)
    stop_count: int | None = Field(default=None, ge=1, le=5)
    stay_minutes: int = Field(default=60, ge=5, le=240)


TRAVEL_TOOLS = {
    "travel_route": (
        RouteArgs,
        "사용자가 별도로 경로·동선을 요청한 경우만 호출한다. "
        "이전 추천 후보의 취향·환경과 실제 경로를 비교해 "
        "방문 순서를 계산한다.",
    ),
    "travel_recommend": (
        RecommendArgs,
        (
            "사용자가 말한 여행 조건 변경만 추출한다. "
            "서버가 실제 장소를 검색하고 취향 순서를 만든다. "
            "기분은 확인 전 제안이며 수영을 추정하지 않는다."
        ),
    ),
    "travel_draft": (
        DraftArgs,
        "서버가 발행한 추천 후보의 rank를 선택해 일정 초안을 계산한다. "
        "장소 ID를 생성하지 않으며 저장/예약/여행 시작은 실행하지 않는다.",
    ),
    "travel_companion": (
        EmptyArgs,
        "본인 여행 세션의 마지막 갱신 상태와 검증된 이벤트를 읽는다. "
        "갱신·여행 시작·종료·알림 전송은 실행하지 않는다.",
    ),
}
INSTRUCTIONS = """
First return places and activities using travel_recommend. Never calculate a route
as part of that first list. Only call travel_route when the user separately asks
for a route/visiting order and a previous recommendation selection is present.
Keyword selections are explicit form state; never invent environmental bounds.
Travel B1/B3/B5 use travel_recommend and B2 uses travel_draft. The server ranks
actual catalogue candidates and returns structured result IDs. Never reorder or
invent recommendations, dates, route times, costs or plan entries. Extract ONLY
the user's changed wishes into changes; null means keep existing field. Arrays
replace an entire preference field, so preserve wishes not changed by the user.
Use the current travel_request provided below as the same state used by the form.
Looking at water/driving to see water is relax, not swimming. If user says this
weekend but not a day, ask the date instead of selecting Saturday automatically.
Mood is an editable proposal: never confirm it or persist it on behalf of the user.
For 'second place' call travel_draft rank=2; server binds the previous candidate
order. It is only a draft. Origin, dates and budget changes require recomputation.
Your final sections may reference current structured_ids and candidate_id values
from the tool output (spot:{id}). Never cite recommendation:{rank}:{id}. After
travel_recommend returns places and travel_request.region is already set, use
intent=explain and clarification=null. The server renders sections
in its own validated order and user's locale. No private IDs, location coordinates,
selection tokens, stored history or raw reviews may be sent to the model.
Use travel_companion for the supplied session's current status and events.
This only reads the last foreground refresh; expired/disconnected is not monitoring.
"""


def wants_travel(body):
    return body.travel is not None or bool(
        re.search(
            r"여행|추천|드라이브|물\s*보|쉬고|기분|지친|일정|경로|동선|route|"
            r"두\s*번째|아이도|더\s*가까|예산|"
            r"recommend|itinerary|trip|travel|second place|tired|"
            r"予算|おすすめ|旅行|推荐",
            body.message,
            re.I,
        )
    )


def explicit_route(body):
    if body.travel and body.travel.action != "conversation":
        return body.travel.action == "route"
    text = body.message.lower()
    if re.search(
        r"(?:경로|동선).{0,8}(?:말고|나중|하지\s*마|제외)|(?:no|without|later).{0,12}route",
        text,
    ):
        return False
    return bool(re.search(r"경로|동선|route|訪問順|路线|路線", text))


def apply_patch(request, patch):
    changes = patch.model_dump(mode="json", exclude_none=True)
    if "required" in changes:
        old = {(c.attribute, c.value) for c in request.required}
        new = {(c["attribute"], c["value"]) for c in changes["required"]}
        if not old <= new:
            raise ToolError("required_relaxation_needs_explicit_form_change")
    if "mood" in changes:
        # Model-produced emotional interpretations always require a form action.
        changes["mood"]["confirmed"] = False
    return TravelRequest.model_validate(request.model_dump(mode="json") | changes)


class TravelToolSession(ToolSession):
    def __init__(self, settings, now, *, body, owner, catalog=None):
        super().__init__(settings, now)
        self.owner, self.body = owner, body
        self.travel_context = body.travel or TravelContext()
        self.travel_context = self.travel_context.model_copy(deep=True)
        if body.travel is None:
            self.travel_context.request.region = body.context.region
            if body.context.activity:
                self.travel_context.request.activity = body.context.activity
        self.catalog = catalog or Catalog(settings, now, reader=self.reader)
        self.structured = {}
        self.travel_results = {}
        self.travel_question = None
        self.travel_instructions = INSTRUCTIONS

    def model_context(self):
        from app.ai.chat import private_text

        request = self.travel_context.request.model_dump(mode="json")
        if request.get("origin"):
            request["origin"] = {"label": "user_supplied_origin", "available": True}
        if request.get("mood"):
            request["mood"].pop("text", None)
        # Origin coordinates, SSO subjects, signed tokens, private signal IDs,
        # review notes and saved plan IDs never enter the provider body.
        return json.loads(private_text(json.dumps(request, ensure_ascii=False)))

    def schemas(self):
        return super().schemas() + [
            {
                "type": "function",
                "name": name,
                "description": description,
                "strict": True,
                "parameters": _strict_schema(model.model_json_schema()),
            }
            for name, (model, description) in TRAVEL_TOOLS.items()
        ]

    async def execute(self, name, arguments):
        if name not in TRAVEL_TOOLS:
            return await super().execute(name, arguments)
        if self._calls >= 6:
            raise ToolError("tool_call_limit")
        try:
            args = TRAVEL_TOOLS[name][0].model_validate(arguments)
            signature = (name, args.model_dump_json())
            if signature in self._seen:
                raise ToolError("repeated_tool_call")
            self._seen.add(signature)
            self._calls += 1
            self._active = name
            if name == "travel_route" and not explicit_route(self.body):
                raise ToolError("route_requires_separate_explicit_request")
            if name == "travel_draft" and (
                self.travel_context.action == "recommend"
                or not re.search(
                    r"일정|itinerary|schedule|plan|旅程|行程", self.body.message, re.I
                )
            ):
                raise ToolError("itinerary_requires_explicit_request")
            if name != "travel_companion":
                activity = args.changes.activity
                explicit_activities = {
                    "swim": r"수영|swim|泳ぎ|游泳",
                    "surf": r"서핑|surf|サーフ|冲浪|衝浪",
                    "rafting": r"래프팅|rafting|ラフティング|漂流",
                }
                if (
                    activity in explicit_activities
                    and self.travel_context.request.activity != activity
                    and not re.search(
                        explicit_activities[activity], self.body.message, re.I
                    )
                ):
                    raise ToolError("explicit_activity_intent_required")
            if name != "travel_companion":
                self.travel_context.request = apply_patch(
                    self.travel_context.request, args.changes
                )
            async with asyncio.timeout(45 if name == "travel_route" else 20):
                if name == "travel_route":
                    result = await self._route(args)
                elif name == "travel_companion":
                    result = await self._companion()
                else:
                    result = await (
                        self._recommend(args.limit)
                        if name == "travel_recommend"
                        else self._draft(args)
                    )
        except (ValueError, HTTPException) as exc:
            if isinstance(exc, ToolError):
                raise
            raise ToolError("travel_input_or_selection_unverified") from None
        except TimeoutError:
            raise ToolError("travel_query_timeout") from None
        self.features.append(name)
        digest = hashlib.sha256(
            json.dumps(result, ensure_ascii=False, sort_keys=True).encode()
        ).hexdigest()[:16]
        result_id = name + ":" + digest
        self.structured[result_id] = result
        self.scopes.append(
            {
                "tool": name,
                "as_of": self.now.isoformat(),
                "timezone": "Asia/Seoul",
                "policy": "server_validated_travel",
                "structured_id": result_id,
            }
        )
        fact_id = self._fact(
            "서버에서 이번 여행의 구조화된 결과를 확인했습니다.",
            refs=[result_id],
            mandatory=True,
            metadata={"structured_id": result_id},
            status="partial",
        )
        return {
            "tool": name,
            "status": "partial",
            "structured_id": result_id,
            "fact_ids": [fact_id],
            "result": result,
        }

    async def _companion(self):
        identifier = self.travel_context.session_id
        if not identifier:
            raise ToolError("travel_session_required")
        session = await asyncio.to_thread(
            companion.get_session, self.settings, self.owner, identifier, now=self.now
        )
        events = await asyncio.to_thread(
            companion.events,
            self.settings,
            self.owner,
            identifier,
            limit=5,
            now=self.now,
        )
        result = {
            "state": session.state,
            "connection_status": session.connection_status,
            "monitoring": session.monitoring,
            "data_status": session.snapshot.get("data_status", "unknown"),
            "last_refresh_at": session.last_refresh_at.isoformat()
            if session.last_refresh_at
            else None,
            "current_item_id": session.current_item_id,
            "next_item_id": session.snapshot.get("next_item_id"),
            "route_status": session.snapshot.get("route_status", "unconfigured"),
            "event_scope": {"limit": 5, "order": "latest_first"},
            "events": [
                e.model_dump(mode="json", exclude={"session_id", "deduplication_key"})
                for e in events
            ],
        }

        self.travel_results["companion"] = result
        # The client receives identifiers for explicit actions. The model needs
        # only state and public evidence, never private session/event/item IDs.
        return {
            k: value
            for k, value in result.items()
            if k not in {"current_item_id", "next_item_id", "events"}
        } | {
            "events": [
                {
                    k: value
                    for k, value in event.items()
                    if k not in {"event_id", "corrects_event_id"}
                }
                for event in result["events"]
            ]
        }

    async def _route(self, args):
        from app.travel.routing import RouteRecommendationInput, recommend_route

        if not self.body.travel or not self.body.travel.selection_token:
            raise ToolError("recommendation_selection_required")
        result = await recommend_route(
            self.settings,
            self.owner,
            RouteRecommendationInput(
                selection_token=self.travel_context.selection_token,
                request=self.travel_context.request,
                **args.model_dump(exclude={"changes"}),
            ),
            now=self.now,
            catalog=self.catalog,
        )
        self.travel_results["route_recommendation"] = result
        route = result.get("route")
        return {
            "status": result["status"],
            "reason_codes": result["reason_codes"],
            "result_id": result.get("result_id"),
            "ordered_places": [
                {
                    "spot_id": i["spot_id"],
                    "name": i["name"],
                    "arrival_at": i["arrival_at"],
                    "departure_at": i["departure_at"],
                }
                for i in route["items"]
            ]
            if route
            else [],
            "optimality": result.get("optimality"),
            "route_calculated": result["route_calculated"],
        }

    async def _recommend(self, limit):
        result = await recommend(
            self.settings,
            self.owner,
            RecommendationInput(
                request=self.travel_context.request,
                preference=self.travel_context.preference,
                limit=limit,
            ),
            now=self.now,
            catalog=self.catalog,
        )
        self.travel_context.selection_token = result.selection_token
        self.travel_results["recommendations"] = result.model_dump(mode="json")
        self.travel_question = result.clarification
        mood = self.travel_context.request.mood
        if mood and not mood.confirmed:
            proposal = mood_proposal(mood.text, self.travel_context.request.locale)
            self.travel_results["mood_proposal"] = {
                "mood": mood.model_dump(mode="json"),
                "confirmation": proposal["confirmation"],
                "applied": False,
                "scope": "this_trip_only",
            }
            self.travel_question = self.travel_question or proposal["confirmation"]
        if self.travel_context.plan_id and self.travel_context.action != "recommend":
            previous = await asyncio.to_thread(
                storage.get_plan, self.settings, self.owner, self.travel_context.plan_id
            )
            await self._recalculate_saved_plan(previous)
        summaries = []
        for row in result.recommendations:
            self.candidates[f"spot:{row.spot_id}"] = {
                "candidate_id": f"spot:{row.spot_id}",
                "spot_id": row.spot_id,
                "name": row.name,
                "region": row.region,
                "type": row.confirmed["kind"],
                "lat": row.confirmed["latitude"],
                "lng": row.confirmed["longitude"],
                "catalog_source": row.evidence[0].provider,
                "catalog_verified_at": row.confirmed["catalog_verified_at"],
                "links": [{"label": "장소 보기", "href": row.actions["view"]}],
            }
            summaries.append(
                {
                    "candidate_id": f"spot:{row.spot_id}",
                    "rank": row.rank,
                    "spot_id": row.spot_id,
                    "name": row.name,
                    "region": row.region,
                    "reason": row.reason,
                    "activities": row.activities,
                    "unknown_conditions": row.unknown_conditions,
                    "evidence_refs": [e.evidence_id for e in row.evidence],
                }
            )
        return {
            "recommendations": summaries,
            "scope": result.candidate_scope,
            "status": result.status,
            "clarification": result.clarification,
        }

    async def _recalculate_saved_plan(self, previous):
        request = self.travel_context.request
        if not request.dates:
            self.travel_question = "일정을 다시 계산할 날짜를 알려 주세요."
            return
        old_dates = previous.request.dates
        date_map = dict(zip(old_dates, request.dates, strict=False))
        stops, conflicts = [], []
        for stop in previous.input_stops:
            day = date_map.get(stop.day)
            if day is None or (stop.fixed and day != stop.day):
                conflicts.append(
                    {
                        "item_id": stop.item_id,
                        "code": "fixed_date_or_removed_day_requires_user_edit",
                    }
                )
                continue
            stops.append(stop.model_copy(update={"day": day}))
        if conflicts:
            self.travel_results["plan_update_conflicts"] = conflicts
            return
        plan = await draft_plan(
            self.settings,
            self.owner,
            PlanInput(request=request, stops=stops),
            now=self.now,
            catalog=self.catalog,
        )
        self.travel_results["draft_plan"] = plan.model_dump(mode="json")
        self.travel_results["draft_base"] = {
            "plan_id": previous.plan_id,
            "expected_revision": previous.revision,
            "saved": False,
        }

    async def _draft(self, args):
        token = self.travel_context.selection_token
        if not token:
            raise ToolError("recommendation_selection_required")
        selection = tokens.decode(self.settings, self.owner, token, self.now)
        if args.rank > len(selection["spot_ids"]):
            raise ToolError("selected_rank_not_found")
        request = self.travel_context.request
        if not request.dates:
            self.travel_question = "어느 날짜로 일정을 만들까요?"
            return {"status": "clarification", "clarification": self.travel_question}
        sid = selection["spot_ids"][args.rank - 1]
        plan = await draft_plan(
            self.settings,
            self.owner,
            PlanInput(
                request=request,
                stops=[
                    PlanStopInput(
                        item_id=f"selected-{sid}",
                        spot_id=sid,
                        day=request.dates[0],
                        stay_minutes=args.stay_minutes,
                    )
                ],
                selection_token=token,
                selected_ranks=[args.rank],
            ),
            now=self.now,
            catalog=self.catalog,
        )
        self.travel_results["draft_plan"] = plan.model_dump(mode="json")
        return {
            "status": plan.status,
            "days": [
                {
                    "date": day["date"],
                    "items": [
                        {
                            k: item[k]
                            for k in (
                                "spot_id",
                                "name",
                                "stay_minutes",
                                "arrival_at",
                                "departure_at",
                                "cost_krw",
                            )
                        }
                        for item in day["items"]
                    ],
                }
                for day in plan.days
            ],
            "unresolved": plan.unresolved,
            "cost": plan.cost,
        }

    async def fallback(self):
        if explicit_route(self.body):
            await self.execute("travel_route", {})
            return
        if self.travel_context.session_id:
            await self.execute("travel_companion", {})
            return
        text = self.body.message
        changes = {}
        request = self.travel_context.request
        if "아이" in text:
            changes["companion_type"] = "children"
        elif "연인" in text:
            changes["companion_type"] = "couple"
        if "드라이브" in text:
            changes["transport"] = "driving"
        if any(word in text for word in ("물 보", "물보", "쉬고", "휴식")):
            changes.update(activity="relax", activity_intensity="low")
        if any(word in text for word in ("가까", "짧게")):
            if request.max_travel_minutes:
                changes["max_travel_minutes"] = max(
                    5, request.max_travel_minutes * 3 // 4
                )
            else:
                self.travel_question = "이동시간은 최대 몇 분 정도로 잡을까요?"
        if "예산" in text and any(word in text for word in ("줄", "낮")):
            self.travel_question = (
                "예산을 얼마로 줄일까요? 전체 금액인지도 알려 주세요."
            )
        if any(word in text for word in ("지친", "기분", "스트레스", "쉬고")):
            proposal = mood_proposal(text)
            changes["mood"] = proposal["mood"].model_dump(mode="json")
            self.travel_results["mood_proposal"] = {**proposal, "mood": changes["mood"]}
            self.travel_question = proposal["confirmation"]
        local = self.now.astimezone(KST).date()
        if "내일" in text:
            changes["dates"] = [(local + timedelta(days=1)).isoformat()]
        elif "오늘" in text:
            changes["dates"] = [local.isoformat()]
        elif "주말" in text:
            changes["dates"] = []
            self.travel_question = "이번 주말 토요일과 일요일 중 어느 날로 할까요?"
        match = re.search(r"\b\d{4}-\d{2}-\d{2}\b", text)
        if match:
            changes["dates"] = [match.group()]
        # Region extraction is an existing real-catalog match, not invented NER.
        if not request.region:
            for word in re.findall(r"[가-힣]{2,12}", text)[:6]:
                query = re.sub(r"(?:에서|으로|여행)$", "", word)
                if query in {
                    "이번",
                    "주말",
                    "연인과",
                    "드라이브하면서",
                    "싶어",
                    "추천해줘",
                }:
                    continue
                candidates, _ = await self.catalog.search(
                    request.model_copy(update={"region": query})
                )
                if candidates:
                    changes["region"] = query
                    break
        question = self.travel_question
        selection = re.search(r"(?:두\s*번째|2\s*번째|second)", text, re.I)
        if selection:
            await self.execute("travel_draft", {"rank": 2, "changes": changes})
        else:
            await self.execute("travel_recommend", {"changes": changes})
        self.travel_question = question or self.travel_question


async def travel_converse(settings, body, subject, provider, **kwargs):
    from app.ai.chat import converse

    if not wants_travel(body):
        return await converse(settings, body, subject, provider, **kwargs)
    if (
        body.travel
        and body.travel.selection_token
        and not body.travel.plan_id
        and "request" not in body.travel.model_fields_set
    ):
        from datetime import UTC

        selection = tokens.decode(
            settings, subject, body.travel.selection_token, datetime.now(UTC)
        )
        body = body.model_copy(
            update={
                "travel": body.travel.model_copy(
                    update={
                        "request": TravelRequest.model_validate(selection["request"]),
                    }
                )
            }
        )
    if body.travel and body.travel.session_id:
        await asyncio.to_thread(
            companion.get_session, settings, subject, body.travel.session_id
        )
    # Saved plans are owner-checked before context is loaded, but no write occurs.
    if body.travel and body.travel.plan_id:
        previous = await asyncio.to_thread(
            storage.get_plan, settings, subject, body.travel.plan_id
        )
        if "request" not in body.travel.model_fields_set:
            body = body.model_copy(
                update={
                    "travel": body.travel.model_copy(
                        update={"request": previous.request}
                    )
                }
            )
    return await converse(
        settings,
        body,
        subject,
        provider,
        session_factory=lambda s, n: TravelToolSession(s, n, body=body, owner=subject),
        **kwargs,
    )


def assemble_travel(response, session):
    if not isinstance(session, TravelToolSession):
        return response
    from app.travel.language import copy, label

    response.travel = session.travel_context
    response.travel_results = session.travel_results
    if session.travel_question:
        response.clarification = session.travel_question
        response.status = "clarification"
    result = session.travel_results.get("recommendations")
    locale = session.travel_context.request.locale
    if result and result["recommendations"]:
        lines = [copy(locale, "intro")]
        for row in result["recommendations"]:
            heading = f"{row['rank']}. {row['name']}" + (
                f" · {row['region']}" if row["region"] else ""
            )
            lines.extend([heading, row["reason"]])
            if row.get("activities"):
                lines.append(" · ".join(a["label"] for a in row["activities"]))
            unknown = [label(locale, value) for value in row["unknown_conditions"][:3]]
            if unknown:
                lines.append(copy(locale, "unchecked", conditions=", ".join(unknown)))
            fetched = row["evidence"][0].get("fetched_at")
            if fetched:
                stamp = datetime.fromisoformat(fetched).astimezone(KST)
                lines.append(
                    copy(locale, "catalog_time", time=f"{stamp:%Y-%m-%d %H:%M} KST")
                )
        lines.append(copy(locale, "limits"))
        response.answer = "\n\n".join(lines)
    elif result and result["status"] == "query_failed":
        response.answer = copy(locale, "query_failed")
        response.status = "query_failed"
    elif result:
        response.answer = copy(locale, "empty")
        response.status = "no_data"
    if "draft_plan" in session.travel_results:
        plan = session.travel_results["draft_plan"]
        lines = [copy(locale, "plan")]
        for day in plan["days"]:
            for item in day["items"]:
                stay = copy(locale, "stay", minutes=item["stay_minutes"])
                lines.append(f"{day['date']} · {item['name']} · {stay}")
        response.answer = "\n\n".join(lines)
    if "companion" in session.travel_results:
        result = session.travel_results["companion"]
        lines = [copy(locale, "companion_" + result["connection_status"])]
        lines.extend(
            e["message"] for e in result["events"] if e["status"] == "confirmed"
        )
        if result["data_status"] in {"no_data", "unknown", "stale", "query_failed"}:
            lines.append(copy(locale, "unchecked", conditions=result["data_status"]))
        response.answer = "\n\n".join(lines)
    if "route_recommendation" in session.travel_results:
        from app.travel.routing import render_route

        result = session.travel_results["route_recommendation"]
        response.answer = render_route(result, locale)
        if result["status"] == "clarification":
            response.status = "clarification"
    return response
