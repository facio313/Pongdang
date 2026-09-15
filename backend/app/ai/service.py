"""Restricted context and optional structured fact ordering with durable budgets."""

import asyncio
import hashlib
import json
from datetime import datetime
from typing import Annotated, Literal
from urllib.request import Request, build_opener

from fastapi import APIRouter, Depends, HTTPException
from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, model_validator

from app.ai import budget as accounting
from app.ai.budget import migrate_ai as migrate_ai
from app.ai.budget import reserve as reserve
from app.data_reader import DataReader
from app.ingestion.http import NoRedirect
from app.twin.api import SpatialQuery, spatial_view

DISCLAIMER = "관측·예보 자료는 입수 안전 판정이나 검증된 적합도 점수가 아닙니다."
TOOLS = {
    "assessment": "water-index/assessments",
    "forecast": "water-forecast/forecasts",
    "twin": "water-twin",
    "temperature": "water-temperature",
    "livecams": "livecams",
    "tides": "tides/events",
    "notifications": "notifications/subscriptions",
    "quality": "quality/comparisons",
}


class ExplainRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    spot_id: int = Field(gt=0)
    activity: str = Field(
        default="swim", pattern="^(swim|surf|relax|mudflat|onsen|rafting)$"
    )
    use_model: bool = False
    at: AwareDatetime | None = None
    as_of: AwareDatetime | None = None
    mode: Literal["observation", "forecast"] = "observation"

    def spatial_query(self):
        return SpatialQuery(
            spot_id=self.spot_id,
            activity=self.activity,
            at=self.at,
            as_of=self.as_of,
            mode=self.mode,
            page_size=1,
        )

    @model_validator(mode="after")
    def bounded_time(self):
        self.spatial_query()
        return self


class Fact(BaseModel):
    fact_id: str
    text: str
    evidence_refs: list[str]


class Explanation(BaseModel):
    contract_version: str = "evidence-explanation.v1"
    spot_id: int
    activity: str
    as_of: datetime
    at: datetime
    mode: Literal["observation", "forecast"]
    data_status: str
    status: str
    provider: str
    model: str | None
    facts: list[Fact]
    disclaimer: str = DISCLAIMER
    reason_codes: list[str]


def validate_order(value, fact_ids):
    if (
        not isinstance(value, dict)
        or set(value) != {"ordered_fact_ids"}
        or not isinstance(value["ordered_fact_ids"], list)
        or any(not isinstance(x, str) for x in value["ordered_fact_ids"])
        or len(value["ordered_fact_ids"]) != len(fact_ids)
        or set(value["ordered_fact_ids"]) != set(fact_ids)
    ):
        raise ValueError("Model must return each supplied fact ID exactly once")
    return value["ordered_fact_ids"]


def pricing_configured(settings):
    return (
        getattr(settings, "ai_pricing_model", "") == settings.ai_model
        and bool(settings.ai_model)
        and (getattr(settings, "ai_input_microusd_per_million_tokens", None) or 0) > 0
        and (getattr(settings, "ai_output_microusd_per_million_tokens", None) or 0) > 0
    )


def request_body(settings, payload):
    """One encoder feeds the byte bound, budget and actual HTTP adapter."""
    ids = [f["fact_id"] for f in payload]
    return {
        "model": settings.ai_model,
        "store": False,
        "service_tier": "default",
        "instructions": "Order the supplied fact IDs for a concise explanation. "
        "Return every ID exactly once. Do not produce any other text.",
        "input": json.dumps(payload, ensure_ascii=False),
        "max_output_tokens": settings.ai_max_output_tokens,
        "text": {
            "format": {
                "type": "json_schema",
                "name": "fact_order",
                "strict": True,
                "schema": {
                    "type": "object",
                    "additionalProperties": False,
                    "properties": {
                        "ordered_fact_ids": {
                            "type": "array",
                            "items": {"type": "string", "enum": ids},
                        }
                    },
                    "required": ["ordered_fact_ids"],
                },
            }
        },
    }


def request_bytes(settings, payload):
    return json.dumps(request_body(settings, payload), ensure_ascii=False).encode()


class OrderedFacts(dict):
    """Internal transport usage does not change the legacy JSON contract."""

    def __init__(self, value, usage):
        super().__init__(value)
        self.usage = usage


def openai_order(settings, payload):
    request = Request(
        "https://api.openai.com/v1/responses",
        method="POST",
        data=request_bytes(settings, payload),
        headers={
            "Authorization": "Bearer " + settings.ai_api_key.get_secret_value(),
            "Content-Type": "application/json",
        },
    )
    with build_opener(NoRedirect).open(
        request, timeout=settings.ai_timeout_seconds
    ) as r:
        raw = r.read(65537)
    if len(raw) > 65536:
        raise ValueError("Model response too large")
    response = json.loads(raw)
    if response.get("status") != "completed":
        raise ValueError("Incomplete model response")
    texts = [
        x["text"]
        for item in response.get("output", [])
        for x in item.get("content", [])
        if x.get("type") == "output_text"
    ]
    if len(texts) != 1:
        raise ValueError("Expected one structured result")
    return OrderedFacts(json.loads(texts[0]), response.get("usage", {}))


async def explain(settings, request, *, adapter=openai_order, budget=reserve):
    view = await spatial_view(
        DataReader(settings),
        request.spatial_query(),
    )
    if not view.rows:
        raise HTTPException(404, "place_not_found")
    raw_place = view.rows[0]
    place = raw_place.model_dump() if hasattr(raw_place, "model_dump") else raw_place
    facts = [
        Fact(
            fact_id="data-status",
            text=f"자료 상태: {place['status']}.",
            evidence_refs=[f"spot:{request.spot_id}"],
        )
    ]
    for row in place["layers"][:20]:
        value = (
            f"{row['numeric_value']} {row['unit'] or '(단위 미제공)'}"
            if row["numeric_value"] is not None
            else "값 미제공"
        )
        ref = f"metric:{row['metric_id']}:snapshot:{row['snapshot_id']}"
        links = [
            link
            for link in place.get("stations", [])
            if link.get("station_id") == row["station_id"]
        ]
        representative = any(
            link.get("relation") == "representative_station" for link in links
        )
        direct = any(
            link.get("relation") == "station_observation_point" for link in links
        )
        relation = (
            "여행장소의 대표 관측소"
            if representative
            else "관측소 자체 측정점"
            if direct
            else "공간대표성 미확인 관측소"
        )
        mapping_refs = [
            "mapping:" + str(link["mapping_id"])
            for link in links
            if link.get("mapping_id")
        ]
        when = row["observed_at"].isoformat() if row["observed_at"] else "미제공"
        issued_at = row.get("issued_at")
        issued = issued_at.isoformat() if issued_at else "미제공"
        facts.append(
            Fact(
                fact_id=hashlib.sha256(ref.encode()).hexdigest()[:16],
                text=f"{row['name']}: {value}; 상태 {row['status']}; "
                f"{relation} {row['station_id']}; "
                f"기준시각 {when}; 발표시각 {issued}.",
                evidence_refs=[ref, *mapping_refs],
            )
        )
    source_reasons = [*view.reason_codes, *place.get("reason_codes", [])]
    if len(place["layers"]) > 20:
        source_reasons.append("explanation_fact_limit")
    reasons, provider, model = [], "deterministic", None
    if request.use_model:
        if not place["layers"]:
            reasons.append("no_evidence_to_order")
        elif (
            settings.ai_effective_provider != "openai"
            or not settings.ai_model
            or not settings.ai_api_key.get_secret_value()
        ):
            reasons.append("ai_not_configured")
        elif not pricing_configured(settings):
            reasons.append("ai_pricing_not_configured")
        else:
            # Send server-controlled facts only: no review prose, user, keys or URLs.
            payload = [f.model_dump() for f in facts]
            size = len(request_bytes(settings, payload))
            if size > settings.ai_max_input_bytes:
                reasons.append("ai_input_limit")
            else:
                try:
                    reservation = None
                    if budget is reserve:
                        reservation = await asyncio.to_thread(
                            accounting.reserve_attempt, settings, size
                        )
                        reserved = bool(reservation)
                    else:
                        reserved = await asyncio.to_thread(budget, settings, size)
                except Exception:
                    reserved = False
                    reasons.append("ai_budget_unavailable")
                if not reserved and not reasons:
                    reasons.append("ai_budget_exhausted")
                if reserved:
                    try:
                        output = await asyncio.wait_for(
                            asyncio.to_thread(adapter, settings, payload),
                            timeout=settings.ai_timeout_seconds + 1,
                        )
                        if reservation and isinstance(output, OrderedFacts):
                            usage = output.usage
                            await asyncio.to_thread(
                                accounting.record_usage,
                                settings,
                                reservation,
                                usage.get("input_tokens"),
                                usage.get("output_tokens"),
                            )
                        order = validate_order(output, [f.fact_id for f in facts])
                        by_id = {f.fact_id: f for f in facts}
                        facts = [by_id[key] for key in order]
                        provider, model = "openai", settings.ai_model
                    except Exception:
                        reasons.append("ai_output_unverified_or_unavailable")
    return Explanation(
        spot_id=request.spot_id,
        activity=request.activity,
        as_of=view.as_of,
        at=view.at,
        mode=request.mode,
        data_status=place["status"],
        status="no_data"
        if not place["layers"]
        else ("deterministic_fallback" if reasons else "available"),
        facts=facts,
        reason_codes=list(dict.fromkeys([*source_reasons, *reasons])),
        provider=provider,
        model=model,
    )


def create_ai_router(settings):
    from app.auth import Principal, require_principal

    router = APIRouter(prefix="/api/data/ai", tags=["ai-foundation"])
    auth = require_principal(settings)

    @router.get("/tools")
    async def tools():
        from app.ai.tools import TOOL_REGISTRY

        return {
            "contract_version": "bounded-services.v1",
            "services": TOOLS,
            "concierge_tools": list(TOOL_REGISTRY),
            "maximum_page_size": 100,
            "arbitrary_sql": False,
            "model_authors_facts": False,
            "notification_access": "authenticated owner only",
        }

    @router.get("/explanation", response_model=Explanation)
    async def deterministic(
        spot_id: int,
        activity: str = "swim",
        at: AwareDatetime | None = None,
        as_of: AwareDatetime | None = None,
        mode: Literal["observation", "forecast"] = "observation",
    ):
        try:
            request = ExplainRequest(
                spot_id=spot_id, activity=activity, at=at, as_of=as_of, mode=mode
            )
        except ValueError:
            raise HTTPException(422, "invalid_request") from None
        return await explain(settings, request)

    @router.post("/explanation", response_model=Explanation)
    async def model_explanation(
        request: ExplainRequest, principal: Annotated[Principal, Depends(auth)]
    ):
        if not request.use_model or settings.ai_effective_provider != "openai":
            return await explain(settings, request)
        admission = None
        reason = "ai_admission_unavailable"
        try:
            admission = await asyncio.to_thread(
                accounting.acquire_request, settings, principal.subject
            )
            if admission.lease_id:
                return await explain(settings, request)
            reason = admission.reason_code
        except Exception:
            pass
        finally:
            if admission and admission.lease_id:
                try:
                    await asyncio.shield(
                        asyncio.to_thread(
                            accounting.release_request, settings, admission.lease_id
                        )
                    )
                except Exception:
                    pass
        result = await explain(
            settings, request.model_copy(update={"use_model": False})
        )
        result.reason_codes.append(reason)
        if result.status != "no_data":
            result.status = "deterministic_fallback"
        return result

    return router
