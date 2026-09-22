"""Select the preferred Gyeongpo beach; never create places or data.

Other beaches stay on the place catalog. Opening the place switcher reads
that catalog. This entry path does not rank them or scan their observations.
"""

import asyncio
from datetime import UTC, datetime

from fastapi import APIRouter, HTTPException, Request, Response

from app.data_reader import DataReader
from app.livecams.places import PLACE_SELECT
from app.livecams.preview import PreviewPlace
from app.water_index.condition_api import ConditionQuery
from app.water_index.condition_storage import read_condition_set

PREFERRED_NAME = "강릉 경포대 해수욕장"


async def preferred_beach(reader):
    """Canonical beach whose own name, or an alias, contains 경포."""
    async with reader.connection() as c:
        return await (
            await c.execute(
                f"""WITH named AS (
                SELECT id FROM pongdang_data.spots_waterspot WHERE name LIKE '%%경포%%'
                UNION
                SELECT a.canonical_spot_id FROM pongdang_data.spots_waterspot s
                JOIN pongdang_data.place_alias a ON a.spot_id=s.id
                WHERE s.name LIKE '%%경포%%'), classified AS (
                SELECT * FROM ({PLACE_SELECT}) p
                WHERE p.id IN (SELECT id FROM named)), matched AS (
                SELECT DISTINCT coalesce(a.canonical_spot_id,p.id) AS id
                FROM classified p LEFT JOIN pongdang_data.place_alias a
                  ON a.spot_id=p.id WHERE p.place_kind='beach')
                SELECT p.id,p.name,p.place_kind,p.address,p.region,p.lat,p.lng
                FROM classified p JOIN matched m ON m.id=p.id
                ORDER BY (p.name=%s) DESC, p.id LIMIT 1""",
                [PREFERRED_NAME],
            )
        ).fetchone()


async def select_default_place(reader):
    now = datetime.now(UTC)
    selected = await preferred_beach(reader)
    places = [PreviewPlace.model_validate(selected)] if selected else []
    status = "no_current_data" if selected else "no_places"
    checked = 1 if selected else 0
    conditions = []
    if selected:
        conditions = await read_condition_set(
            reader,
            [
                ConditionQuery(spot_id=selected["id"], activity="swim", mode=mode)
                for mode in ("observation", "forecast")
            ],
            now=now,
        )
        for evidence in conditions:
            if isinstance(evidence, HTTPException):
                raise evidence
            # A stored score or a known restriction is enough. Another beach is
            # not consulted on this request.
            if (
                evidence.condition_score.status == "blocked"
                or evidence.condition_score.score is not None
            ):
                status = "preferred"
                break
    messages = {
        "preferred": "기본 장소인 강릉 경포대 해수욕장의 수집 자료를 표시합니다.",
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
        "display_name": PREFERRED_NAME,
        "status": status,
        "message": messages[status],
        "candidates_checked": checked,
        "refresh_pending": any(
            not isinstance(evidence, HTTPException)
            and (
                evidence.projection.status == "refreshing"
                or "condition_projection_pending" in evidence.reason_codes
            )
            for evidence in conditions
        ),
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
