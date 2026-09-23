"""Explicit read tools. Model inputs never select SQL, columns, URLs or owners.

Every session owns a fresh, bounded evidence set. Public service projections are
reused directly, and connections close before returning results to the provider.
"""

import asyncio
import hashlib
import json
import math
from datetime import date, datetime, time, timedelta
from typing import Annotated, Literal
from urllib.parse import urlencode, urlsplit
from zoneinfo import ZoneInfo

from fastapi import HTTPException
from pydantic import (
    AwareDatetime,
    BaseModel,
    ConfigDict,
    Field,
    ValidationError,
    field_validator,
)

from app.data_reader import DataReader
from app.forecast.models import ForecastView
from app.forecast.storage import select_forecasts
from app.livecams.service import CameraEnvelope, read_cameras
from app.quality.api import QualityQuery
from app.quality.models import ComparisonEnvelope
from app.quality.storage import read_analyses
from app.regions import PLACE_REGION_JOIN, place_search_predicate
from app.tides.service import tide_event
from app.tides.storage import read_windows
from app.twin.api import SpatialQuery, spatial_view
from app.water_index.api import QueryParams, _public_rows
from app.water_index.condition_api import ConditionQuery
from app.water_index.condition_storage import read_condition_set
from app.water_index.models import RECOMMENDED_ACTIVITIES, Activity
from app.water_index.sources import AuthorityRecord
from app.water_index.storage import read_projection

KST = ZoneInfo("Asia/Seoul")
MAX_RESULT_BYTES = 24_000
MAX_FACTS = 50
MAX_ROWS = 100
SPOT = Annotated[int, Field(strict=True, gt=0, le=2**53 - 1)]
DISCLAIMER = (
    "자료 존재·예보·조건 일치는 입수 안전 판정이 "
    "아닙니다. 검증된 추천 순위는 제공하지 않습니다."
)


class ToolError(ValueError):
    def __init__(self, code):
        self.code = code
        super().__init__(code)


class StrictArgs(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)


class EmptyArgs(StrictArgs):
    pass


class CapabilityArgs(StrictArgs):
    include_collection_status: bool = Field(default=False, strict=True)


class SearchArgs(StrictArgs):
    query: str = Field(min_length=1, max_length=80, strict=True)
    activity: Activity = "swim"
    limit: int = Field(default=5, strict=True, ge=1, le=8)


class TimeArgs(StrictArgs):
    activity: Activity = "swim"
    when: Literal["now", "today", "tomorrow", "this_weekend", "custom"] = "now"
    part_of_day: Literal["all", "morning", "afternoon", "evening"] = "all"
    start: AwareDatetime | None = None
    end: AwareDatetime | None = None

    @field_validator("start", "end", mode="before")
    @classmethod
    def offset_time_only(cls, value):
        if value is not None and not isinstance(value, datetime):
            if not isinstance(value, str) or "T" not in value:
                raise ValueError("An offset ISO time is required")
        return value


class PlaceArgs(StrictArgs):
    spot_id: SPOT


class PeriodArgs(TimeArgs):
    spot_id: SPOT


class CompareArgs(TimeArgs):
    spot_ids: list[SPOT] = Field(min_length=1, max_length=3)


class ConditionsArgs(CompareArgs):
    temperature_confirmed_only: bool = Field(default=False, strict=True)


class NearbyArgs(PlaceArgs):
    radius_km: float = Field(default=5, strict=True, gt=0, le=20)
    limit: int = Field(default=5, strict=True, ge=1, le=8)


TOOL_REGISTRY = {
    "capabilities": (
        CapabilityArgs,
        (
            "서비스의 실제 읽기 기능과 한계를 안내한다. 수집 "
            "지역·기간·갱신 상태 질문이면 "
            "include_collection_status=true."
        ),
    ),
    "search_places": (
        SearchArgs,
        (
            "지역·장소명으로 실제 여행장소를 최대 8개 "
            "검색한다. 관측소는 후보에서 제외한다. 활동 "
            "지원·안전은 검색만으로 판단하지 않는다. 이후 "
            "place_conditions로 최대 3개를 묶어 확인한다."
        ),
    ),
    "place_conditions": (
        ConditionsArgs,
        (
            "최대 3개 장소의 Water Twin, 활동별 현재 "
            "관측/예보, 수온과 공식 제한 근거를 재조회한다. "
            "수온 확인 후보만 요청하면 "
            "temperature_confirmed_only=true. 순위를 만들지 "
            "않는다."
        ),
    ),
    "assessment_support": (
        PeriodArgs,
        (
            "공개 Water Index 평가와 support/coverage를 함께 "
            "읽는다. 미검증 점수는 null이며 평가 가능 기간의 "
            "누락도 반환한다."
        ),
    ),
    "forecast_compare": (
        CompareArgs,
        (
            "최대 3개 장소의 공식 예보를 동일한 요청 기간으로 "
            "비교할 근거를 읽는다. 관측값과 예보를 구분하며 "
            "실제 예보 지평 밖을 표시한다."
        ),
    ),
    "tides": (
        PeriodArgs,
        (
            "공식 고조·저조 예보와 명시적으로 등록된 "
            "운영시간·제한을 읽는다. 물때는 안전한 입수 "
            "시간을 뜻하지 않는다."
        ),
    ),
    "quality": (
        PlaceArgs,
        (
            "해당 장소의 공개 수질 교차검증과 공식 채수 "
            "근거를 읽는다. 개인 관찰 원문·소유자·연락처는 "
            "제공하지 않는다."
        ),
    ),
    "livecams": (
        PlaceArgs,
        (
            "검토된 공식 라이브캠 등록·링크·접속검사 상태를 "
            "읽는다. 영상을 시청하거나 내용·현재 장면을 "
            "분석하지 않는다."
        ),
    ),
    "nearby_places": (
        NearbyArgs,
        (
            "DB의 실제 여행장소 좌표에서 반경 20km 이내 최대 "
            "8개 후보를 찾는다. 등록 주소·종류만 제공하고 "
            "시설·주차·경로·영업상태를 추정하지 않는다."
        ),
    ),
    "notifications_guide": (
        EmptyArgs,
        (
            "개인 알림의 기존 조회 화면을 안내한다. "
            "상태·이메일·토큰을 모델에 보내지 않으며 "
            "생성·변경·삭제·발송은 실행하지 않는다."
        ),
    ),
}


def normalize_time(args: TimeArgs, now: datetime):
    """Normalize relative expressions once per request, including KST midnight."""
    if now.tzinfo is None:
        raise ToolError("invalid_clock")
    local = now.astimezone(KST)
    if args.when == "custom":
        if args.start is None or args.end is None or args.part_of_day != "all":
            raise ToolError("invalid_time_range")
        start, end = args.start.astimezone(KST), args.end.astimezone(KST)
    else:
        if args.start is not None or args.end is not None:
            raise ToolError("invalid_time_range")
        if args.when == "this_weekend" and args.part_of_day != "all":
            raise ToolError("weekend_day_required")
        day = local.date()
        days = 1
        if args.when == "tomorrow":
            day += timedelta(days=1)
        elif args.when == "this_weekend":
            # On Sunday, this weekend includes the preceding Saturday.
            day += timedelta(days=5 - day.weekday())
            days = 2
        start = datetime.combine(day, time(), KST)
        end = start + timedelta(days=days)
        if args.part_of_day != "all":
            hours = {"morning": (6, 12), "afternoon": (12, 18), "evening": (18, 24)}
            first, last = hours[args.part_of_day]
            end = start + timedelta(days=days - 1, hours=last)
            start += timedelta(hours=first)
        elif args.when == "now":
            start, end = local, local + timedelta(hours=1)
    if not timedelta(0) < end - start <= timedelta(days=7):
        raise ToolError("invalid_time_range")
    if start < local - timedelta(days=31) or end > local + timedelta(days=31):
        raise ToolError("unsupported_time_range")
    at = local if start <= local < end else start
    return {
        "from": start.isoformat(),
        "until": end.isoformat(),
        "at": at.isoformat(),
        "as_of": now.isoformat(),
        "timezone": "Asia/Seoul",
        "activity": args.activity,
        "when": args.when,
        "part_of_day": args.part_of_day,
        "mode": "forecast" if at > local else "observation",
    }


def _json(value):
    if isinstance(value, BaseModel):
        return value.model_dump(mode="json", by_alias=True)
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, (tuple, list)):
        return [_json(v) for v in value]
    if isinstance(value, dict):
        return {k: _json(v) for k, v in value.items()}
    return value


def _safe_url(value):
    if not value or not isinstance(value, str):
        return None
    try:
        parsed = urlsplit(value)
        if (
            parsed.scheme != "https"
            or not parsed.hostname
            or parsed.username
            or parsed.password
            or parsed.query
            or parsed.fragment
            or parsed.port not in (None, 443)
            or not parsed.hostname.endswith((".go.kr", ".or.kr"))
        ):
            return None
    except ValueError:
        return None
    return value


def _pick(row, keys):
    """Explicit projection only; never forward unknown future payload fields."""
    return {k: _json(row.get(k)) for k in keys.split()}


def _strict_schema(schema):
    if isinstance(schema, dict):
        result = {k: _strict_schema(v) for k, v in schema.items() if k != "default"}
        if result.get("type") == "object":
            result["additionalProperties"] = False
            result["required"] = list(result.get("properties", {}))
        return result
    if isinstance(schema, list):
        return [_strict_schema(item) for item in schema]
    return schema


PLACE_COLUMNS = (
    "s.id AS spot_id,s.name,s.region,s.type,s.lat,s.lng,s.address,s.catalog_source,"
    "s.catalog_verified_at,p.provider,p.source_id,p.source_url,p.category,"
    "p.fetched_at,p.source_created_at,p.source_modified_at"
)
PLACE_JOIN = (
    " FROM pongdang_data.spots_waterspot s JOIN pongdang_data.collection_place p "
    "ON p.spot_id=s.id "
) + PLACE_REGION_JOIN


class ToolSession:
    def __init__(self, settings, now, *, reader=None):
        if now.tzinfo is None:
            raise ToolError("invalid_clock")
        self.settings, self.now = settings, now
        self.reader = reader or DataReader(settings)
        self.facts, self.candidates = {}, {}
        self.features, self.scopes, self.reason_codes = [], [], []
        self._calls, self._rows, self._seen = 0, 0, set()
        self._active = ""
        self._scope = {}

    @staticmethod
    def schemas():
        return [
            {
                "type": "function",
                "name": name,
                "description": description,
                "strict": True,
                "parameters": _strict_schema(model.model_json_schema()),
            }
            for name, (model, description) in TOOL_REGISTRY.items()
        ]

    def _count(self, rows):
        self._rows += len(rows)
        if self._rows > MAX_ROWS:
            raise ToolError("evidence_row_limit")
        return rows

    def _fact(
        self,
        text,
        *,
        refs=(),
        metadata=None,
        status="unknown",
        spot=None,
        mandatory=False,
    ):
        metadata = _json(metadata or {})
        identity = [self._active, spot, text, metadata, list(refs)]
        key = hashlib.sha256(
            json.dumps(
                identity, ensure_ascii=False, sort_keys=True, allow_nan=False
            ).encode()
        ).hexdigest()[:20]
        fact = {
            "fact_id": key,
            "text": text,
            "evidence_refs": list(dict.fromkeys(refs)),
            "feature": self._active,
            "spot_id": spot,
            "data_status": status,
            "metadata": metadata,
            "mandatory": mandatory,
        }
        if not mandatory:
            proposed = json.dumps(
                [dict(self.facts, **{key: fact}), self.candidates],
                ensure_ascii=False,
                allow_nan=False,
            ).encode()
            # Reserve room for subsequent mandatory restrictions and errors.
            if len(proposed) > MAX_RESULT_BYTES - 5000 or len(self.facts) >= 40:
                self.reason_codes.append("tool_detail_limit")
                return None
        self.facts[key] = fact
        return key

    def _candidate(self, row):
        sid = row["spot_id"]
        query = {"spot_id": sid}
        for key in ("activity", "from", "until"):
            if self._scope.get(key) is not None:
                query[key] = self._scope[key]
        candidate = _pick(
            row,
            (
                "spot_id name region type lat lng address "
                "catalog_source catalog_verified_at"
            ),
        )
        candidate.update(
            candidate_id=f"spot:{sid}",
            place_kind="travel_place",
            source_url=_safe_url(row.get("source_url")),
            source=_pick(
                row,
                "provider source_id fetched_at source_created_at source_modified_at",
            ),
            links=[
                {"label": label, "href": f"#{route}?{urlencode(query)}"}
                for route, label in [
                    ("water-index-map", "장소 지도"),
                    ("water-index", "현재 조건"),
                    ("water-forecast", "예보"),
                    ("tide", "물때"),
                    ("water-quality", "수질"),
                    ("livecam", "라이브캠"),
                ]
            ],
        )
        self.candidates[candidate["candidate_id"]] = candidate
        return candidate

    async def _place(self, sid):
        async with self.reader.connection() as c:
            row = await (
                await c.execute(
                    "SELECT " + PLACE_COLUMNS + PLACE_JOIN + "WHERE s.id=%s LIMIT 1",
                    [sid],
                )
            ).fetchone()
        if row is None:
            raise ToolError("travel_place_not_found")
        self._count([row])
        return row

    async def execute(self, name, arguments):
        if name not in TOOL_REGISTRY:
            raise ToolError("unknown_tool")
        if self._calls >= 6:
            raise ToolError("tool_call_limit")
        try:
            if isinstance(arguments, str):
                if len(arguments.encode()) > 4096:
                    raise ToolError("tool_arguments_limit")

                def no_duplicates(pairs):
                    result = {}
                    for key, value in pairs:
                        if key in result:
                            raise ValueError("duplicate")
                        result[key] = value
                    return result

                arguments = json.loads(arguments, object_pairs_hook=no_duplicates)
            args = TOOL_REGISTRY[name][0].model_validate(arguments)
            signature = (name, args.model_dump_json())
            if signature in self._seen:
                raise ToolError("repeated_tool_call")
        except (ValidationError, ValueError, TypeError) as exc:
            if isinstance(exc, ToolError):
                raise
            raise ToolError("invalid_tool_arguments") from None
        self._calls += 1
        self._seen.add(signature)
        self._active = name
        before_facts, before_candidates = dict(self.facts), dict(self.candidates)
        before_reasons = len(self.reason_codes)
        scope = (
            normalize_time(args, self.now)
            if isinstance(args, TimeArgs)
            else {"as_of": self.now.isoformat(), "timezone": "Asia/Seoul"}
        )
        if name == "place_conditions":
            try:
                ConditionQuery(
                    spot_id=args.spot_ids[0],
                    activity=args.activity,
                    mode=scope["mode"],
                    at=scope["at"],
                ).product_times(self.now)
            except ValueError:
                raise ToolError("unsupported_time_range") from None
        if hasattr(args, "spot_id"):
            scope["spot_id"] = args.spot_id
        if hasattr(args, "spot_ids"):
            scope["spot_ids"] = args.spot_ids
        scope["tool"] = name
        self._scope = scope
        self.scopes.append(scope)
        if name not in self.features:
            self.features.append(name)
        reasons = []
        try:
            async with asyncio.timeout(12):
                status, reasons = await getattr(self, "_" + name)(args, scope)
            serialized = json.dumps(
                _json([self.facts, self.candidates]),
                ensure_ascii=False,
                allow_nan=False,
            ).encode()
            if len(serialized) > MAX_RESULT_BYTES or len(self.facts) > MAX_FACTS:
                raise ToolError("tool_result_limit")
        except (HTTPException, TimeoutError, ValueError, KeyError, TypeError) as exc:
            # Atomic result sets prevent partially read restrictions being hidden
            # beside a successful-looking candidate after a later read fails.
            self.facts, self.candidates = before_facts, before_candidates
            code = (
                exc.code
                if isinstance(exc, ToolError)
                else "tool_timeout"
                if isinstance(exc, TimeoutError)
                else "query_failed"
            )
            status, reasons = "query_failed", [code]
            self._fact(
                (
                    "요청한 자료를 확인하지 못했습니다. 조회 실패는 "
                    "자료 없음이나 안전을 뜻하지 않습니다."
                ),
                status="query_failed",
                metadata={"error_code": code},
                mandatory=True,
            )
        reasons = list(dict.fromkeys([*self.reason_codes[before_reasons:], *reasons]))
        self.reason_codes = list(dict.fromkeys([*self.reason_codes, *reasons]))
        facts = [v for k, v in self.facts.items() if k not in before_facts]
        candidates = [
            v
            for k, v in self.candidates.items()
            if k not in before_candidates or v != before_candidates[k]
        ]
        return {
            "tool": name,
            "status": status,
            "scope": scope,
            "reason_codes": reasons,
            "fact_ids": [f["fact_id"] for f in facts],
            "candidate_ids": [c["candidate_id"] for c in candidates],
            "facts": facts,
            "candidates": candidates,
        }

    async def _capabilities(self, args, scope):
        features = {key: desc for key, (_, desc) in TOOL_REGISTRY.items()}
        self._fact(
            (
                "장소 검색, 관측·수온, 공개 평가·지원 범위, 공식 "
                "예보, 물때, 수질 비교와 라이브캠 등록 정보를 "
                "조회합니다."
            ),
            refs=["contract:concierge-tools.v1"],
            status="available",
            metadata={
                "features": features,
                "activities": list(RECOMMENDED_ACTIVITIES),
                "numeric_recommendation": None,
                "mutations": False,
            },
        )
        self._fact(DISCLAIMER, mandatory=True)
        if args.include_collection_status:
            summary = await self.reader.summary()
            providers = self._count(summary.get("providers", [])[:30])
            heartbeat = summary.get("heartbeat")
            async with self.reader.connection() as c:
                regions = await (
                    await c.execute(
                        (
                            "SELECT region,count(*) AS places,min(fetched_at) "
                            "AS oldest_catalog_at,"
                        )
                        + (
                            "max(fetched_at) AS latest_catalog_at FROM "
                            "pongdang_data.collection_place "
                        )
                        + "GROUP BY region ORDER BY region LIMIT 21"
                    )
                ).fetchall()
                times = await (
                    await c.execute(
                        "SELECT min(observed_at) AS oldest_observation_at,"
                        "max(observed_at) AS latest_observation_at,"
                        "max(fetched_at) AS latest_fetched_at "
                        "FROM pongdang_data.conditions_observationsnapshot"
                    )
                ).fetchone()
            self._count(regions)
            self._fact(
                (
                    "수집 자료의 지역·기간·갱신 상태입니다. 수집 정상 "
                    "상태는 개별 장소의 자료 보유나 안전 판정이 "
                    "아닙니다."
                ),
                status="available",
                refs=["collection:summary"],
                metadata={
                    "providers": [
                        _pick(p, "provider state count latest_at") for p in providers
                    ],
                    "heartbeat": _pick(
                        heartbeat, "effective_state last_seen_at age_seconds"
                    )
                    if heartbeat
                    else None,
                    "regions": regions[:20],
                    "region_list_truncated": len(regions) > 20,
                    "observation_period": times,
                },
            )
        return "available", []

    async def _search_places(self, args, scope):
        scope.update(query=args.query.strip(), activity=args.activity)
        query = args.query.strip()
        if not query or query in {"%", "_"}:
            raise ToolError("region_or_place_required")
        predicate, params = place_search_predicate(query)
        async with self.reader.connection() as c:
            rows = await (
                await c.execute(
                    "SELECT "
                    + PLACE_COLUMNS
                    + PLACE_JOIN
                    + "WHERE "
                    + predicate
                    + " ORDER BY s.name,s.id LIMIT %s",
                    [*params, args.limit + 1],
                )
            ).fetchall()
        self._count(rows)
        more = len(rows) > args.limit
        for row in rows[: args.limit]:
            self._candidate(row)
        self._fact(
            (
                f"검색어에 해당하는 여행장소 "
                f"{min(len(rows), args.limit)}개를 "
                f"확인했습니다. 활동 지원은 별도 근거가 "
                f"필요합니다."
            ),
            status="available" if rows else "no_data",
            metadata={
                "query": query,
                "activity": args.activity,
                "limit": args.limit,
                "has_more": more,
                "order": "catalog_name",
                "ranking": None,
            },
            refs=[f"spot:{r['spot_id']}" for r in rows[: args.limit]],
        )
        return ("available" if rows else "no_data"), (
            ["candidate_limit_not_exhaustive"] if more else []
        )

    async def _place_conditions(self, args, scope):
        retained = 0
        spots = tuple(dict.fromkeys(args.spot_ids))
        places = [await self._place(sid) for sid in spots]
        queries = [
            ConditionQuery(
                spot_id=sid,
                activity=args.activity,
                mode=scope["mode"],
                at=scope["at"],
            )
            for sid in spots
        ]
        results = await read_condition_set(self.reader, queries, now=self.now)
        for sid, place, result in zip(spots, places, results, strict=True):
            if isinstance(result, HTTPException):
                raise result
            conditions = _json(result)
            self._count(conditions["metrics"])
            # Water Twin retains additional mapped marine/weather metrics and
            # provider lineage outside the activity's selectable conditions.
            spatial = _json(
                await spatial_view(
                    self.reader,
                    SpatialQuery(
                        spot_id=sid,
                        activity=args.activity,
                        at=scope["at"],
                        as_of=self.now,
                        mode=scope["mode"],
                        page_size=1,
                    ),
                )
            )
            layers = spatial["rows"][0]["layers"] if spatial["rows"] else []
            self._count(layers)
            await self._official_notices(place, args, scope)
            confirmed = any(
                m["name"] in {"water_temperature", "bath_water_temperature"}
                and m["status"] == "available"
                and m["value"] is not None
                and m["relation"] == "representative_station"
                for m in conditions["metrics"]
            )
            if not args.temperature_confirmed_only or confirmed:
                self._candidate(place)
                retained += 1
            else:
                # Remove a previously searched candidate only after rechecking;
                # retain its facts and official restrictions as audit evidence.
                self.candidates.pop(f"spot:{sid}", None)
            safety = conditions["safety_status"]
            self._fact(
                (
                    f"{place['name']}: 활동 지원 "
                    f"{conditions['support_status']}, 안전 상태 "
                    f"{safety}. 검증된 환경 점수는 없습니다."
                ),
                spot=sid,
                status="unknown",
                refs=conditions["restriction_refs"],
                mandatory=True,
                metadata=_pick(
                    conditions,
                    (
                        "activity mode at as_of support_status "
                        "safety_status restriction_refs environment_score "
                        "missing_metrics required_evidence reason_codes"
                    ),
                ),
            )
            for metric in conditions["metrics"][:6]:
                refs = [
                    f"metric:{e['metric_id']}:snapshot:{e['snapshot_id']}"
                    for e in metric["evidence"]
                ]
                if metric.get("mapping_id"):
                    refs.append("mapping:" + metric["mapping_id"])
                relation = (
                    "대표 관측소 자료"
                    if metric["relation"] == "representative_station"
                    else "관측소 자체 측정점 자료"
                    if metric["relation"] == "station_observation_point"
                    else "공간대표성 미확인 관측소 자료"
                )
                value = (
                    f"{metric['value']} {metric['unit']}"
                    if metric["value"] is not None
                    else "값 미확인"
                )
                self._fact(
                    (
                        f"{place['name']} · {metric['label']}: {value}; "
                        f"{relation}; 상태 {metric['status']}."
                    ),
                    spot=sid,
                    status=metric["status"],
                    refs=refs,
                    metadata={
                        **_pick(
                            metric,
                            (
                                "name unit value station_id station_name relation "
                                "mapping_id spatial_scope reason_codes"
                            ),
                        ),
                        "evidence": [
                            _pick(
                                e,
                                (
                                    "metric_id snapshot_id provider "
                                    "provider_record_id source_record_id name "
                                    "numeric_value unit is_missing mode observed_at "
                                    "issued_at fetched_at valid_from valid_until "
                                    "spatial_scope source_state metric_state"
                                ),
                            )
                            for e in metric["evidence"][:3]
                        ],
                    },
                )
            selected = {m["name"] for m in conditions["metrics"][:6]}
            for layer in [r for r in layers if r["name"] not in selected][:3]:
                ref = f"metric:{layer['metric_id']}:snapshot:{layer['snapshot_id']}"
                self._fact(
                    (
                        f"{place['name']} · {layer['name']}: 관측소 "
                        f"부가 자료, 상태 {layer['status']}. "
                        f"대표성·원본 단위와 기준시각을 확인해야 "
                        f"합니다."
                    ),
                    spot=sid,
                    status=layer["status"],
                    refs=[ref],
                    metadata=_pick(
                        layer,
                        (
                            "metric_id snapshot_id station_id provider "
                            "provider_record_id source_record_id name "
                            "numeric_value unit is_missing mode observed_at "
                            "issued_at fetched_at valid_until spatial_scope "
                            "status reason_codes time_role"
                        ),
                    ),
                )
            if len(conditions["metrics"]) > 6 or len(layers) > 3 + len(selected):
                self.reason_codes.append("condition_detail_limit")
            if args.temperature_confirmed_only and not confirmed:
                self._fact(
                    (
                        f"{place['name']}: 대표성·단위·신선도가 확인된 "
                        f"수온 조건을 충족하지 않아 후보에서 "
                        f"제외했습니다."
                    ),
                    spot=sid,
                    refs=[f"spot:{sid}"],
                    status="no_data",
                )
        return ("available" if retained else "no_data"), []

    async def _official_notices(self, place, args, scope):
        """Retain authority provenance; bulletin text matches are not mappings."""
        sid, at = place["spot_id"], datetime.fromisoformat(scope["at"])
        async with self.reader.connection() as c:
            authorities = await (
                await c.execute(
                    "SELECT payload FROM "
                    "pongdang_data.water_index_authority_evidence a "
                    "WHERE spot_id=%s AND activity=%s AND available_at<=%s "
                    "AND valid_from<=%s AND valid_until>%s "
                    "AND NOT EXISTS (SELECT 1 FROM "
                    "pongdang_data.water_index_authority_evidence n WHERE "
                    "n.supersedes_id=a.evidence_id AND n.available_at<=%s) "
                    "ORDER BY evidence_id LIMIT 5",
                    [sid, args.activity, self.now, at, at, self.now],
                )
            ).fetchall()
            region = place.get("region") or ""
            warnings = await (
                await c.execute(
                    "SELECT id,provider,source_id,issued_at,region,kind,effective_at,"
                    "ended_at,status,fetched_at FROM pongdang_data.collection_warning "
                    "WHERE %s<>'' AND position(%s in region)>0 AND issued_at<=%s "
                    "AND fetched_at<=%s AND fetched_at>=%s "
                    "ORDER BY (status='active') DESC,issued_at DESC,id DESC LIMIT 4",
                    [region, region, self.now, self.now, self.now - timedelta(days=7)],
                )
            ).fetchall()
        self._count(authorities)
        self._count(warnings)
        if len(authorities) > 4 or len(warnings) > 3:
            raise ToolError("notice_scope_too_large")
        for raw in authorities:
            record = AuthorityRecord.model_validate(raw["payload"])
            value = _json(record.evidence)
            self._fact(
                "공식 활동·제한 근거를 보존합니다. 유효시간·원본 상태와 "
                "적용 범위는 아래 출처 기록을 기준으로 확인하세요.",
                spot=sid,
                status=value["state"],
                mandatory=True,
                refs=[record.evidence_id, value["evidence_ref"]],
                metadata={
                    "source_url": _safe_url(record.source_url),
                    "evidence": value,
                },
            )
        self._fact(
            "특보 발표 이력의 지역명 일치만 조회했습니다. 장소별 발효 범위를 "
            "확인한 결과가 아니며, 발표 기록이 없어도 특보 없음이나 "
            "안전을 뜻하지 않습니다.",
            spot=sid,
            status="unknown",
            mandatory=True,
            refs=[f"warning:{w['id']}" for w in warnings],
            metadata={
                "region_match": region,
                "spatial_relation": "unverified",
                "window_days": 7,
                "bulletins": warnings,
                "current_place_warning_status": "unknown",
            },
        )

    async def _assessment_support(self, args, scope):
        self._candidate(await self._place(args.spot_id))
        q = QueryParams(
            spot_id=args.spot_id,
            activity=args.activity,
            profile_id="general",
            mode=scope["mode"],
            **{"from": scope["from"], "until": scope["until"]},
            as_of=self.now,
            page_size=3,
        )
        async with self.reader.connection() as c:
            result = await read_projection(
                c,
                spot_id=args.spot_id,
                activity=args.activity,
                profile_id="general",
                mode=scope["mode"],
                from_at=q.from_at,
                until_at=q.until_at,
                as_of=self.now,
                historical=False,
                page=1,
                page_size=3,
                route="assessments",
            )
            support = await read_projection(
                c,
                spot_id=args.spot_id,
                activity=args.activity,
                profile_id="general",
                mode=scope["mode"],
                from_at=q.from_at,
                until_at=q.until_at,
                as_of=self.now,
                historical=False,
                page=1,
                page_size=3,
                route="support",
            )
        rows = self._count(_public_rows(result["rows"], self.now, self.now, q))
        self._count(support["rows"])
        for row in rows:
            self._count(row["inputs"])
        self._fact(
            (
                f"공개 평가 범위 상태: "
                f"{result['coverage']['status']}. 수치 추천 "
                f"모델은 검증되지 않았습니다."
            ),
            spot=args.spot_id,
            status=result["coverage"]["status"],
            mandatory=True,
            metadata={
                "coverage": result["coverage"],
                "support": support["rows"],
                "total": result["total"],
                "page_size": 3,
                "score": None,
            },
            refs=[r["target_id"] for r in support["rows"]],
        )
        for row in rows:
            self._fact(
                (
                    f"평가 지원 {row['support']['status']}, 환경 "
                    f"{row['environment']['status']}, 안전 "
                    f"{row['safety_status']}; 점수 미제공."
                ),
                spot=args.spot_id,
                status=row["support"]["status"],
                mandatory=True,
                refs=[
                    row["assessment_id"] or row["target_id"],
                    *[i["input_id"] for i in row["inputs"]],
                ],
                metadata=_pick(
                    row,
                    (
                        "assessment_id target_id input_manifest_id model "
                        "target support environment safety_status score "
                        "evaluated_at valid_until reason_codes inputs"
                    ),
                ),
            )
        return result["coverage"]["status"], (
            ["assessment_page_limit"] if result["total"] > 3 else []
        )

    async def _forecast_rows(self, sid, args, scope, provider=None):
        async with self.reader.connection() as c:
            result = await select_forecasts(
                c,
                spot_id=sid,
                activity=args.activity,
                as_of=self.now,
                from_at=datetime.fromisoformat(scope["from"]),
                until_at=datetime.fromisoformat(scope["until"]),
                page=1,
                page_size=3,
                provider=provider,
            )
        result["rows"] = [
            ForecastView.model_validate(r).model_dump(mode="json")
            for r in self._count(result["rows"])
        ]
        for row in result["rows"]:
            self._count(row["inputs"])
        if result["total"] > 3:
            self.reason_codes.append("forecast_page_limit")
        return result

    async def _forecast_compare(self, args, scope):
        statuses = []
        for sid in dict.fromkeys(args.spot_ids):
            place = await self._place(sid)
            self._candidate(place)
            result = await self._forecast_rows(sid, args, scope)
            statuses.append(result["status"])
            self._fact(
                f"{place['name']} 공식 예보 조회 상태: {result['status']}.",
                spot=sid,
                status=result["status"],
                metadata={
                    **scope,
                    **_pick(
                        result, "horizon_start_at horizon_end_at total range_semantics"
                    ),
                    "page_size": 3,
                },
                refs=[f"spot:{sid}"],
            )
            for row in result["rows"]:
                refs = [f"forecast:{row['source_key']}:{row['revision_id']}"]
                refs += [i["input_id"] for i in row["inputs"]]
                if row["mapping_evidence_ref"]:
                    refs.append(row["mapping_evidence_ref"])
                self._fact(
                    (
                        f"{place['name']}: {row['provider']} 공식 예보, "
                        f"대상 "
                        f"{row['target_start_at']}~{row['target_end_at']},"
                        f" 상태 {row['state']}. 관측소 관계 "
                        f"{row['spatial_relation']}."
                    ),
                    spot=sid,
                    status=row["state"],
                    refs=refs,
                    metadata=_pick(
                        row,
                        (
                            "revision_id previous_revision_id source_key "
                            "requested_spot_id spot_id station_id "
                            "station_code station_name provider "
                            "source_record_id provider_record_id snapshot_id "
                            "issued_at fetched_at target_start_at "
                            "target_end_at available_at mapping_evidence_ref "
                            "spatial_relation spatial_scope data_kind "
                            "reason_codes inputs"
                        ),
                    ),
                )
        return ("available" if "available" in statuses else statuses[0]), []

    async def _tides(self, args, scope):
        self._candidate(await self._place(args.spot_id))
        result = await self._forecast_rows(
            args.spot_id, args, scope, "khoa_tide_extrema"
        )
        async with self.reader.connection() as c:
            windows = await read_windows(
                c,
                spot_id=args.spot_id,
                activity=args.activity,
                from_at=datetime.fromisoformat(scope["from"]),
                until_at=datetime.fromisoformat(scope["until"]),
                as_of=self.now,
                page=1,
                page_size=3,
            )
        self._count(windows["rows"])
        self._fact(
            (
                f"물때 자료 상태 {result['status']}, 공식 "
                f"운영시간 자료 상태 {windows['status']}. "
                f"고조·저조는 안전한 활동 시간이 아닙니다."
            ),
            spot=args.spot_id,
            status=result["status"],
            mandatory=True,
            metadata={
                **scope,
                "forecast_status": result["status"],
                "operating_status": windows["status"],
                **_pick(result, "horizon_start_at horizon_end_at"),
            },
        )
        for row in result["rows"]:
            event = _json(tide_event(row, datetime.fromisoformat(scope["at"])))
            height = event["height"] if event["height"] is not None else "값 미제공"
            unit = event["unit"] or "단위 미제공"
            self._fact(
                (
                    f"{event['kind']} 물때 예보: "
                    f"{event['event_at']}; 높이 {height} "
                    f"{unit}; 상태 {event['state']}."
                ),
                spot=args.spot_id,
                status=event["state"],
                refs=[
                    event["event_id"],
                    *(
                        [event["mapping_evidence_ref"]]
                        if event["mapping_evidence_ref"]
                        else []
                    ),
                ],
                metadata=event,
            )
        for row in windows["rows"]:
            self._fact(
                (
                    f"공식 운영 근거: 운영 "
                    f"{row['operating_status']}, 통제 "
                    f"{row['controls_status']}, 상태 "
                    f"{row['state']}."
                ),
                spot=args.spot_id,
                status=row["state"],
                mandatory=True,
                refs=[row["window_id"], *row["control_evidence_refs"]],
                metadata={
                    **_pick(
                        row,
                        (
                            "window_id source_key spot_id station_id activity "
                            "start_at end_at timezone provider "
                            "provider_record_id fetched_at issued_at "
                            "valid_until operating_status controls_status "
                            "control_evidence_refs scope rule_version state "
                            "reason_codes"
                        ),
                    ),
                    "source_url": _safe_url(row.get("source_url")),
                },
            )
        return result["status"], (
            ["tides_page_limit"] if result["total"] > 3 or windows["total"] > 3 else []
        )

    async def _quality(self, args, scope):
        self._candidate(await self._place(args.spot_id))
        async with self.reader.connection() as c:
            result = ComparisonEnvelope.model_validate(
                await read_analyses(
                    c,
                    QualityQuery(spot_id=args.spot_id, as_of=self.now, page_size=1),
                    self.now,
                )
            )
        rows = self._count(_json(result)["rows"])
        if not rows:
            self._fact(
                (
                    "저장된 수질 교차검증 결과가 없습니다. 수질이 "
                    "양호하다는 뜻은 아닙니다."
                ),
                spot=args.spot_id,
                status="analysis_pending",
                mandatory=True,
            )
        for row in rows:
            self._count(row["official_sources"])
            self._count(row["measurement_comparisons"])
            if (
                len(row["official_sources"]) > 2
                or len(row["measurement_comparisons"]) > 3
            ):
                self.reason_codes.append("quality_detail_limit")
            refs = [
                row["analysis_id"],
                *[s["evidence_id"] for s in row["official_sources"]],
            ]
            self._fact(
                (
                    f"수질 비교 {row['status']}, 자료 신선도 "
                    f"{row['freshness']}. 독립 관측·공식 채수 "
                    f"시각과 항목·방법이 다르면 직접 비교할 수 "
                    f"없습니다. 안전 상태는 unknown입니다."
                ),
                spot=args.spot_id,
                status=row["freshness"],
                refs=refs,
                mandatory=True,
                metadata=_pick(
                    row,
                    (
                        "analysis_id analysis_version comparison_version "
                        "as_of available_at from until status freshness "
                        "reason_codes sample_count "
                        "independent_observer_count duplicate_count "
                        "official_sample_count latest_review_at "
                        "input_truncated safety_status "
                        "model_validation_status confidence_percent"
                    ),
                ),
            )
            for sample in row["official_sources"][:2]:
                self._fact(
                    (
                        f"공식 수질 채수: {sample['provider']}, "
                        f"채수시각 {sample['observed_at']}; 원본 상태 "
                        f"{sample['revision_state']}."
                    ),
                    spot=args.spot_id,
                    status=sample["revision_state"],
                    refs=[sample["evidence_id"]],
                    metadata={
                        **_pick(
                            sample,
                            (
                                "evidence_id spot_id station_id provider "
                                "provider_record_id source_record_id observed_at "
                                "sampled_until fetched_at issued_at valid_until "
                                "spatial_scope revision_state measurements "
                                "official_grade source_spot_id place_relation "
                                "mapping_ref mapping_version mapping_scope"
                            ),
                        ),
                        "mapping_source_url": _safe_url(
                            sample.get("mapping_source_url")
                        ),
                    },
                )
            for comp in row["measurement_comparisons"][:3]:
                self._fact(
                    (
                        f"{comp['item']} 비교 상태 {comp['status']}; "
                        f"일치 여부는 unknown입니다."
                    ),
                    spot=args.spot_id,
                    status=comp["status"],
                    refs=[comp["official_evidence_id"], comp["review_evidence_id"]],
                    metadata=_pick(
                        comp,
                        (
                            "item status reason_codes official_value "
                            "reported_value unit reported_unit "
                            "official_method reported_method difference "
                            "agreement"
                        ),
                    ),
                )
        return result.status, []

    async def _livecams(self, args, scope):
        self._candidate(await self._place(args.spot_id))
        result = CameraEnvelope.model_validate(
            await read_cameras(
                self.reader, spot_id=args.spot_id, page_size=3, now=self.now
            )
        )
        rows = self._count(_json(result)["rows"])
        self._fact(
            (
                "라이브캠은 검토된 등록 링크와 접속 확인 상태만 "
                "조회합니다. 영상 내용·현재 장면은 확인하지 "
                "않았습니다."
            ),
            spot=args.spot_id,
            status=result.status,
            mandatory=True,
        )
        for row in rows:
            self._fact(
                (
                    f"{row['provider']} {row['media_kind']} 등록: "
                    f"접속 검사 {row['status']}; 검사시각 "
                    f"{row['checked_at']}."
                ),
                spot=args.spot_id,
                status=row["status"],
                refs=[row["revision_id"]],
                metadata={
                    **_pick(
                        row,
                        (
                            "camera_id revision_id spot_id provider "
                            "media_kind playback_method embed_allowed "
                            "reviewed_at review_valid_until source_revision "
                            "checked_at valid_until status reason_code "
                            "live_verified"
                        ),
                    ),
                    "public_page": _safe_url(row["public_page"]),
                    "terms_url": _safe_url(row["terms_url"]),
                },
            )
        return result.status, (["livecam_page_limit"] if result.has_more else [])

    async def _nearby_places(self, args, scope):
        origin = await self._place(args.spot_id)
        if origin["lat"] is None or origin["lng"] is None:
            raise ToolError("place_coordinates_missing")
        lat, lng = origin["lat"], origin["lng"]
        delta = args.radius_km / 110
        longitude_delta = min(180, delta / max(0.01, math.cos(math.radians(lat))))
        # Bounding box reduces rows first; exact spherical distance remains a
        # parameterized expression. No client/model coordinate is trusted.
        async with self.reader.connection() as c:
            rows = await (
                await c.execute(
                    "WITH candidates AS (SELECT "
                    + PLACE_COLUMNS
                    + ",6371*2*asin(sqrt(least(1.0,power(sin(radians(s.lat-%s)/2),2)+"
                    + (
                        (
                            "cos(radians(%s))*cos(radians(s.lat))*power(sin"
                            "(radians(s.lng-%s)/2),2)))) "
                        )
                        + "AS distance_km"
                    )
                    + PLACE_JOIN
                    + "WHERE s.id<>%s AND s.lat BETWEEN %s AND %s "
                    "AND s.lng BETWEEN %s AND %s) SELECT * FROM candidates "
                    "WHERE distance_km<=%s ORDER BY distance_km,spot_id LIMIT %s",
                    [
                        lat,
                        lat,
                        lng,
                        args.spot_id,
                        lat - delta,
                        lat + delta,
                        lng - longitude_delta,
                        lng + longitude_delta,
                        args.radius_km,
                        args.limit + 1,
                    ],
                )
            ).fetchall()
        self._count(rows)
        for row in rows[: args.limit]:
            candidate = self._candidate(row)
            candidate["distance_km"] = round(row["distance_km"], 2)
        self._fact(
            (
                f"등록 좌표 기준 반경 {args.radius_km} km 이내 "
                f"장소 {min(len(rows), args.limit)}개를 "
                f"조회했습니다. 직선거리이며 이동 경로나 시설 "
                f"운영 정보는 아닙니다."
            ),
            spot=args.spot_id,
            status="available" if rows else "no_data",
            refs=[f"spot:{r['spot_id']}" for r in rows[: args.limit]],
            metadata={
                "radius_km": args.radius_km,
                "limit": args.limit,
                "has_more": len(rows) > args.limit,
                "origin_spot_id": args.spot_id,
            },
        )
        return ("available" if rows else "no_data"), (
            ["nearby_page_limit"] if len(rows) > args.limit else []
        )

    async def _notifications_guide(self, args, scope):
        self._fact(
            (
                "개인 알림은 첫 입수의 알림 조회 화면에서 확인하세요. "
                "현재 화면은 조회만 지원합니다. AI는 구독 생성·변경·삭제와 "
                "이메일 발송을 실행하지 않았습니다."
            ),
            refs=["contract:notifications-owner-ui"],
            status="guide_only",
            mandatory=True,
            metadata={
                "action_executed": False,
                "private_data_read": False,
                "links": [{"label": "첫 입수·알림", "href": "#first-swim"}],
            },
        )
        return "guide_only", []
