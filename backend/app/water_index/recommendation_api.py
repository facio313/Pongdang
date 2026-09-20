"""추천 조회. 활동별 조건 응답과 조석·대안 장소를 모아 규칙에 넘깁니다.

읽기 전용입니다. 점수는 `activity_score` 가 낸 값을 그대로 옮기고, 선택은
`recommendation.decide` 가 합니다. 이 파일이 하는 일은 조회와 조립뿐입니다.
"""

import asyncio
from datetime import UTC, datetime, timedelta
from typing import Annotated, Literal

from fastapi import APIRouter, Query, Request
from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, field_validator

from app.data_reader import DataReader
from app.forecast.storage import select_forecasts
from app.livecams.places import PLACE_SELECT
from app.tides.context import mark_context, nearby_tide_station
from app.tides.service import tide_event
from app.travel.catalog import ROLE_CODES, VISIT_KINDS
from app.water_index.api import WaterIndexRoute, error_response
from app.water_index.condition_api import ConditionQuery, read_conditions
from app.water_index.conditions import ConditionsEnvelope
from app.water_index.models import RECOMMENDED_ACTIVITIES, Activity, Record
from app.water_index.recommendation import (
    CONTRACT,
    LIMITATIONS,
    MODEL_ID,
    MODEL_VERSION,
    RULES,
    TIDE_MARGIN_MINUTES,
    Alternative,
    Candidate,
    Choice,
    Reason,
    Rule,
    Tide,
    decide,
)

#: 대안 장소를 찾는 반경. 조석 관측소 맥락(50km)과 같은 상한을 씁니다.
ALTERNATIVE_RADIUS_KM = 50
#: 한 종류당 대안 수. 목록이 아니라 «대신 여기»를 몇 개 보이는 것입니다.
ALTERNATIVES_PER_KIND = 2
#: 조석 위상을 판정할 조회 구간. 직전 만조·간조를 알아야 «지난 지 20분»을
#: 말할 수 있으므로 과거 쪽으로도 넉넉히 봅니다.
TIDE_LOOKBACK = timedelta(hours=12)
TIDE_LOOKAHEAD = timedelta(hours=24)

#: 카카오 카테고리와 TourAPI 콘텐츠 유형. `app/travel/catalog.py` 의 분류와
#: 같은 근거를 씁니다 -- 새 분류 체계를 만들지 않습니다.
ONSEN_TYPES = ("onsen", "hotspring")
ONSEN_CATEGORY = "여행 > 관광,명소 > 온천%"
MEAL_CATEGORY = "음식점%"
VISIT_CATEGORY = "여행 > 관광,명소%"
TOURAPI_MEAL = ROLE_CODES["ko"]["meal"]
TOURAPI_VISIT = ROLE_CODES["ko"]["visit"]
#: 「가 볼 곳」에는 물놀이 장소도 들어갑니다. 물에 들어가지 않더라도 바다 ·
#: 호수 · 계곡을 보러 가는 것은 갈 곳이기 때문입니다(travel 의 VISIT_KINDS 와
#: 같은 목록). 온천은 위 분기가 먼저 잡습니다.
VISIT_PLACE_KINDS = VISIT_KINDS

_HAVERSINE = (
    "6371*2*asin(sqrt(least(1.0,greatest(0.0,"
    "power(sin(radians(%(lat)s-{lat})/2),2)+cos(radians({lat}))*"
    "cos(radians(%(lat)s))*power(sin(radians(%(lng)s-{lng})/2),2)))))"
)


class RecommendationQuery(BaseModel):
    """`ConditionQuery` 와 같은 검증을 쓰되 활동은 받지 않습니다 -- 어떤 활동을
    고를지가 이 조회의 답이기 때문입니다."""

    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    spot_id: int = Field(gt=0)
    mode: Literal["observation", "forecast"] = "observation"
    at: AwareDatetime | None = None
    as_of: AwareDatetime | None = None

    _id = field_validator("spot_id", mode="before")(ConditionQuery.integer_id.__func__)
    _time = field_validator("at", "as_of", mode="before")(
        ConditionQuery.offset_iso_time.__func__
    )
    times = ConditionQuery.times

    def for_activity(self, activity: Activity) -> ConditionQuery:
        return ConditionQuery(
            spot_id=self.spot_id,
            activity=activity,
            mode=self.mode,
            at=self.at,
            as_of=self.as_of,
        )


class Recommendation(Record):
    contract_version: Literal["water-recommendation.v1"] = CONTRACT
    model_id: Literal["pongdang-activity-recommendation"] = MODEL_ID
    model_version: Literal["1.0.0"] = MODEL_VERSION
    #: 이 결과가 안전 판정이 아니라는 사실은 계약에 남습니다.
    scientific_validation: Literal["not_evaluated"] = "not_evaluated"
    spot_id: int = Field(gt=0)
    place_name: str | None
    place_kind: Literal["beach", "valley"] | None
    at: AwareDatetime
    as_of: AwareDatetime
    mode: Literal["observation", "forecast"]
    choice: Choice | None
    ranked: tuple[Candidate, ...]
    reasons: tuple[Reason, ...]
    tide: Tide | None
    alternatives: tuple[Alternative, ...]
    #: 판단에 쓴 활동별 조건 응답 전부. 화면이 같은 자료를 다시 조회하지
    #: 않도록 함께 싣습니다 -- 따로 조회하면 두 응답의 시각이 어긋나 히어로
    #: 점수와 그 아래 근거가 서로 다른 순간을 가리킵니다.
    conditions: tuple[ConditionsEnvelope, ...]
    rules: tuple[Rule, ...] = RULES
    limitations: tuple[str, ...] = LIMITATIONS
    reason_codes: tuple[str, ...]


def _minutes(delta) -> int:
    return int(delta.total_seconds() // 60)


def tide_view(events, at) -> Tide | None:
    """공식 조석 예측에서 지금의 물때를 읽습니다.

    조석 예측은 그 자체로 활동 가능 시간이 아닙니다. 원본의 사유 코드
    (`events_are_not_safe_activity_windows`)를 그대로 들고 나갑니다.
    """
    usable = [e for e in events if e["state"] != "stale" and e["kind"] != "unknown"]
    if not usable:
        return None
    usable.sort(key=lambda e: e["event_at"])
    nearest = min(usable, key=lambda e: abs(e["event_at"] - at))
    later = [e for e in usable if e["event_at"] >= at]
    earlier = [e for e in usable if e["event_at"] < at]
    next_high = next((e for e in later if e["kind"] == "high"), None)
    next_low = next((e for e in later if e["kind"] == "low"), None)
    last_high = next((e for e in reversed(earlier) if e["kind"] == "high"), None)
    last_low = next((e for e in reversed(earlier) if e["kind"] == "low"), None)

    minutes = _minutes(nearest["event_at"] - at)
    if abs(minutes) <= TIDE_MARGIN_MINUTES:
        phase = "near_high" if nearest["kind"] == "high" else "near_low"
    elif next_high and next_low:
        phase = "rising" if next_high["event_at"] < next_low["event_at"] else "falling"
    else:
        phase = "unknown"
    return Tide(
        status="available",
        phase=phase,
        minutes_to_high=_minutes(next_high["event_at"] - at) if next_high else None,
        minutes_to_low=_minutes(next_low["event_at"] - at) if next_low else None,
        minutes_since_high=_minutes(at - last_high["event_at"]) if last_high else None,
        minutes_since_low=_minutes(at - last_low["event_at"]) if last_low else None,
        high_at=next_high["event_at"].isoformat() if next_high else None,
        low_at=next_low["event_at"].isoformat() if next_low else None,
        height=nearest["height"],
        unit=nearest["unit"],
        station_name=nearest["station_name"],
        spatial_relation=nearest["spatial_relation"],
        distance_km=nearest.get("distance_km"),
        reason_codes=("events_are_not_safe_activity_windows",),
    )


async def read_tide(c, spot_id, at, as_of) -> Tide | None:
    """`/tides/events` 와 같은 선택 규칙으로 직전·다음 조석 사건을 읽습니다."""
    selection = dict(
        as_of=as_of,
        from_at=at - TIDE_LOOKBACK,
        until_at=at + TIDE_LOOKAHEAD,
        activity="mudflat",
        page=1,
        page_size=100,
        provider="khoa_tide_extrema",
    )
    selected = await select_forecasts(c, spot_id=spot_id, **selection)
    station = None
    if selected["status"] == "no_forecast_data":
        station = await nearby_tide_station(c, spot_id, as_of)
        if not station:
            return None
        selected = await select_forecasts(c, spot_id=station["spot_id"], **selection)
    if station:
        mark_context(selected, station, spot_id)
    return tide_view([tide_event(f, at) for f in selected["rows"]], at)


async def read_valleys(c, place, as_of, limit=ALTERNATIVES_PER_KIND):
    distance = _HAVERSINE.format(lat="p.lat", lng="p.lng")
    return await (
        await c.execute(
            f"WITH places AS ({PLACE_SELECT}), candidates AS ("
            f"SELECT p.id,p.name,p.address,p.region,{distance} AS distance_km "
            "FROM places p JOIN pongdang_data.spots_waterspot s ON s.id=p.id "
            "WHERE p.place_kind='valley' AND p.id<>%(spot)s "
            "AND p.lat IS NOT NULL AND p.lng IS NOT NULL "
            "AND s.catalog_verified_at IS NOT NULL AND s.catalog_verified_at<=%(cut)s"
            ") SELECT * FROM candidates WHERE distance_km<=%(radius)s "
            "ORDER BY distance_km,id LIMIT %(limit)s",
            {
                "lat": place["lat"],
                "lng": place["lng"],
                "spot": place["id"],
                "cut": as_of,
                "radius": ALTERNATIVE_RADIUS_KM,
                "limit": limit,
            },
        )
    ).fetchall()


async def read_catalog_places(c, place, as_of, kinds):
    """온천·맛집·명소 대안. `app/travel/catalog.py` 와 같은 분류 근거입니다."""
    distance = _HAVERSINE.format(lat="s.lat", lng="s.lng")
    return await (
        await c.execute(
            "WITH rows AS (SELECT DISTINCT ON (s.id) s.id,s.name,s.address,s.region,"
            f"{distance} AS distance_km,p.category,CASE "
            "WHEN s.type=ANY(%(onsen_types)s) OR p.category LIKE %(onsen)s "
            "THEN 'onsen' "
            "WHEN p.category LIKE %(meal)s OR (p.provider<>'KAKAO_LOCAL' "
            "AND s.type='tourism' AND p.category=ANY(%(meal_codes)s)) THEN 'meal' "
            "WHEN p.category LIKE %(visit)s OR s.type=ANY(%(visit_kinds)s) "
            "OR (p.provider<>'KAKAO_LOCAL' AND s.type='tourism' "
            "AND p.category=ANY(%(visit_codes)s)) THEN 'visit' "
            "END AS kind "
            "FROM pongdang_data.spots_waterspot s "
            "JOIN pongdang_data.collection_place p ON p.spot_id=s.id "
            "WHERE s.id<>%(spot)s AND s.lat IS NOT NULL AND s.lng IS NOT NULL "
            "AND s.catalog_verified_at IS NOT NULL AND s.catalog_verified_at<=%(cut)s "
            "AND p.fetched_at<=%(cut)s "
            "ORDER BY s.id,p.fetched_at DESC,p.provider,p.source_id), "
            "ranked AS (SELECT *,row_number() OVER (PARTITION BY kind "
            "ORDER BY distance_km,id) AS rank FROM rows "
            "WHERE kind=ANY(%(kinds)s) AND distance_km<=%(radius)s) "
            "SELECT id,name,address,region,distance_km,kind FROM ranked "
            "WHERE rank<=%(limit)s ORDER BY kind,distance_km,id LIMIT 12",
            {
                "lat": place["lat"],
                "lng": place["lng"],
                "spot": place["id"],
                "cut": as_of,
                "radius": ALTERNATIVE_RADIUS_KM,
                "limit": ALTERNATIVES_PER_KIND,
                "kinds": list(kinds),
                "onsen_types": list(ONSEN_TYPES),
                "onsen": ONSEN_CATEGORY,
                "meal": MEAL_CATEGORY,
                "visit": VISIT_CATEGORY,
                "meal_codes": list(TOURAPI_MEAL),
                "visit_codes": list(TOURAPI_VISIT),
                "visit_kinds": list(VISIT_PLACE_KINDS),
            },
        )
    ).fetchall()


def _alternative(kind, row) -> Alternative:
    return Alternative(
        kind=kind,
        spot_id=row["id"],
        name=row["name"],
        distance_km=round(float(row["distance_km"]), 1)
        if row["distance_km"] is not None
        else None,
        address=row["address"],
        region=row["region"],
    )


async def read_activity(reader, q: RecommendationQuery, activity: Activity, now):
    """관측으로 점수가 나오지 않으면 같은 시각의 예보로 한 번 더 읽습니다.

    화면(useConditions)이 하던 물러서기를 서버로 옮긴 것입니다. 활동마다 두
    번씩 왕복하던 것을 한 응답에 담기 위한 것이며, 규칙은 그대로입니다 --
    공식 제한·활동 미지원·계산 보류는 예보로 우회하지 않습니다.
    """
    evidence = await read_conditions(reader, q.for_activity(activity), now=now)
    score = evidence.condition_score
    if (
        q.mode == "forecast"
        or q.at is not None
        or score is None
        or score.score is not None
        or score.status == "blocked"
        or evidence.safety_status == "restricted"
        or evidence.support_status == "unsupported"
    ):
        return evidence
    forecast = await read_conditions(
        reader,
        q.for_activity(activity).model_copy(
            update={"mode": "forecast", "at": evidence.at}
        ),
        now=now,
    )
    # 예보로 점수가 나오거나 근거가 더 많을 때만 바꿉니다. 빈 예보로 관측
    # 근거를 덮지 않습니다.
    forecast_score = forecast.condition_score
    return (
        forecast
        if (forecast_score is not None and forecast_score.score is not None)
        or len(forecast.metrics) > len(evidence.metrics)
        else evidence
    )


async def read_recommendation(reader, q: RecommendationQuery, *, now=None):
    now = now or datetime.now(UTC)
    at, as_of = q.times(now)
    envelopes = {}
    for activity in RECOMMENDED_ACTIVITIES:
        envelopes[activity] = await read_activity(reader, q, activity, now)
    first = envelopes[RECOMMENDED_ACTIVITIES[0]]

    async with reader.connection() as c:
        place = await (
            await c.execute(
                f"SELECT id,name,place_kind,lat,lng FROM ({PLACE_SELECT}) p "
                "WHERE id=%s",
                [q.spot_id],
            )
        ).fetchone()
        tide = None
        if place and place["place_kind"] == "beach":
            tide = await read_tide(c, q.spot_id, at, as_of)

        decision = decide(
            envelopes,
            place_kind=place["place_kind"] if place else None,
            tide=tide,
        )

        alternatives: list[Alternative] = []
        if place and place["lat"] is not None and place["lng"] is not None:
            kinds = set(decision.alternative_kinds)
            if "valley" in kinds:
                alternatives += [
                    _alternative("valley", row)
                    for row in await read_valleys(c, place, as_of)
                ]
            catalog_kinds = sorted(kinds - {"valley"})
            if catalog_kinds:
                alternatives += [
                    _alternative(row["kind"], row)
                    for row in await read_catalog_places(c, place, as_of, catalog_kinds)
                ]

    # 계곡 대안 한 곳에 한해 그 장소의 추천을 한 번 더 계산합니다. 「대신 계곡」
    # 이라고 말하면서 그곳 조건을 모르면 근거가 아니라 넘겨짚기입니다.
    for index, item in enumerate(alternatives):
        if item.kind != "valley":
            continue
        nested = await read_recommendation_choice(reader, item.spot_id, q, now)
        if nested:
            alternatives[index] = item.model_copy(
                update={"best_activity": nested.activity, "score": nested.score}
            )
        break

    return Recommendation(
        spot_id=q.spot_id,
        place_name=first.place_name,
        place_kind=place["place_kind"] if place else None,
        at=at,
        as_of=as_of,
        mode=q.mode,
        choice=decision.choice,
        ranked=decision.ranked,
        reasons=decision.reasons,
        tide=tide,
        alternatives=tuple(alternatives),
        conditions=tuple(envelopes[a] for a in RECOMMENDED_ACTIVITIES),
        reason_codes=decision.reason_codes,
    )


async def read_recommendation_choice(reader, spot_id, q, now) -> Choice | None:
    """대안 장소의 선택만 계산합니다. 조석·재귀 대안은 보지 않습니다 --
    한 번의 조회가 장소를 타고 번지지 않게 하려는 것입니다."""
    nested = RecommendationQuery(spot_id=spot_id, mode=q.mode, at=q.at, as_of=q.as_of)
    envelopes = {}
    for activity in RECOMMENDED_ACTIVITIES:
        envelopes[activity] = await read_conditions(
            reader, nested.for_activity(activity), now=now
        )
    return decide(envelopes).choice


def create_recommendation_router(settings):
    router = APIRouter(
        prefix="/api/data/water-index",
        tags=["water-index-conditions"],
        route_class=WaterIndexRoute,
    )
    reader = DataReader(settings)

    @router.get("/recommendation", response_model=Recommendation)
    async def recommendation(
        request: Request, q: Annotated[RecommendationQuery, Query()]
    ):
        if len(request.query_params) != len(request.query_params.multi_items()):
            return error_response(
                422, "invalid_request", "중복 조회 조건은 허용하지 않습니다."
            )
        try:
            q.times(datetime.now(UTC))
        except ValueError:
            return error_response(
                422, "invalid_request", "조회 시각이 올바르지 않습니다."
            )
        try:
            async with asyncio.timeout(20):
                return await read_recommendation(reader, q)
        except TimeoutError:
            return error_response(
                503, "recommendation_unavailable", "추천 자료 조회가 지연되고 있습니다."
            )
        except ValueError, KeyError:
            return error_response(
                503, "recommendation_unavailable", "추천 근거를 제공할 수 없습니다."
            )

    return router
