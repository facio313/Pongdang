"""Select a collected beach with usable evidence; never create places or data."""

import asyncio
from datetime import UTC, datetime

from fastapi import APIRouter, HTTPException, Request, Response

from app.data_reader import DataReader
from app.livecams.places import PLACE_SELECT
from app.livecams.preview import PreviewPlace
from app.water_index.condition_api import ConditionQuery, read_conditions

PREFERRED_NAME = "강릉 경포대 해수욕장"


async def beach_candidates(reader, now):
    async with reader.connection() as c:
        return await (
            await c.execute(
                f"""WITH beaches AS ({PLACE_SELECT}), ranked AS (
                SELECT p.*, (p.name LIKE '%%경포%%') AS preferred,
                  row_number() OVER (PARTITION BY (p.name LIKE '%%경포%%')
                    ORDER BY EXISTS (
                      SELECT 1 FROM pongdang_data.conditions_observationsnapshot s
                      JOIN pongdang_data.conditions_observationmetric m
                        ON m.snapshot_id=s.id
                      WHERE s.spot_id=p.id AND s.state<>'superseded'
                        AND m.name IN ('water_temperature','sea_water_temperature',
                          'air_temperature','wind_speed','wave_height')
                        AND m.numeric_value IS NOT NULL AND NOT m.is_missing
                        AND m.observed_at<=%s AND m.valid_until>%s
                        AND m.fetched_at<=%s
                    ) DESC,
                    CASE WHEN p.name ~ '(해운대|광안리|대천|속초|낙산|송정)'
                      THEN 0 ELSE 1 END, p.id) AS rank
                FROM beaches p WHERE p.place_kind='beach')
                SELECT id,name,place_kind,address,region,lat,lng,preferred
                FROM ranked WHERE (preferred AND rank<=3)
                  OR (NOT preferred AND rank<=5)
                ORDER BY preferred DESC,rank LIMIT 8""",
                [now, now, now],
            )
        ).fetchall()


async def select_default_place(reader):
    now = datetime.now(UTC)
    candidates = await beach_candidates(reader, now)
    places = [PreviewPlace.model_validate(row) for row in candidates]
    selected = candidates[0] if candidates else None
    status = "no_current_data" if selected else "no_places"
    checked = 0
    for candidate in candidates:
        checked += 1
        for mode in ("observation", "forecast"):
            evidence = await read_conditions(
                reader,
                ConditionQuery(spot_id=candidate["id"], activity="swim", mode=mode),
                now=now,
            )
            if evidence.condition_score.status == "blocked":
                # A known restriction is not missing data. Preserve it for the
                # preferred beach instead of hiding it behind another place.
                if candidate["preferred"]:
                    selected, status = candidate, "preferred"
                    break
                break
            if evidence.condition_score.score is not None:
                selected = candidate
                status = "preferred" if candidate["preferred"] else "fallback"
                break
        if status in {"preferred", "fallback"}:
            break
    messages = {
        "preferred": "기본 장소인 강릉 경포대 해수욕장의 수집 자료를 표시합니다.",
        "fallback": "경포 자료가 부족하여 다른 해수욕장의 수집 자료를 표시합니다.",
        "no_current_data": (
            "현재 유효한 조건 자료가 없습니다. "
            "수집기 상태와 자료 갱신을 확인해야 합니다."
        ),
        "no_places": (
            "수집된 해수욕장이 없습니다. 수집기와 해변 자료 연동을 확인해야 합니다."
        ),
    }
    return {
        "place": PreviewPlace.model_validate(selected) if selected else None,
        "display_name": PREFERRED_NAME
        if not selected or selected["preferred"]
        else selected["name"],
        "status": status,
        "message": messages[status],
        "candidates_checked": checked,
        "rows": places,
    }


def create_default_place_router(settings):
    router = APIRouter(prefix="/api/data/water-index", tags=["water-index-conditions"])
    reader = DataReader(settings)

    @router.get("/default-place")
    async def default_place(request: Request, response: Response):
        if request.query_params:
            raise HTTPException(422, "Unsupported default-place query")
        response.headers["Cache-Control"] = "no-store"
        try:
            async with asyncio.timeout(12):
                return await select_default_place(reader)
        except TimeoutError:
            raise HTTPException(
                503, "기본 해수욕장 자료 조회가 지연되고 있습니다."
            ) from None

    return router
