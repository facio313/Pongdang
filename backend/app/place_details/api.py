"""Bounded read-only access to stored place details and collection status."""

from fastapi import APIRouter, HTTPException, Query, Response

from app.data_reader import DataReader

PROVIDERS = (
    "TOURAPI_KOREAN",
    "tourapi_english",
    "tourapi_japanese",
    "tourapi_chinese_simplified",
    "tourapi_chinese_traditional",
)
KOREAN_TYPES = {"12", "14", "15", "25", "28", "32", "38", "39"}
FOREIGN_TYPES = {"75", "76", "77", "78", "79", "80", "82", "85"}
TEXT_FIELDS = (
    "opening_hours",
    "rest_days",
    "opening_period",
    "opening_date",
    "parking",
    "facilities",
    "contact",
    "homepage",
    "overview",
)


async def read_place_details(connection, spot_ids):
    """Resolve confirmed links, with a direct-provider fallback before backfill."""
    if not spot_ids:
        return []
    if len(spot_ids) > 100:
        raise ValueError("place_detail_read_limit")
    rows = await (
        await connection.execute(
            """
            SELECT s.id AS spot_id,s.name AS spot_name,
              p.provider,p.source_id,p.category AS current_content_type,
              p.source_modified_at AS current_modified_at,p.id AS place_id,
              d.id AS detail_id,d.name,d.content_type,d.availability,d.fetched_at,
              d.source_created_at,d.source_modified_at,d.catalog_modified_at,
              d.opening_hours,d.rest_days,d.opening_period,d.opening_date,
              d.parking,d.facilities,d.contact,d.homepage,d.overview,d.details,
              a.state AS collection_state
            FROM pongdang_data.spots_waterspot s
            LEFT JOIN pongdang_data.place_detail_link l ON l.spot_id=s.id
            LEFT JOIN LATERAL (
              SELECT p.* FROM pongdang_data.collection_place p
              WHERE p.id=l.place_id OR (l.place_id IS NULL AND p.spot_id=s.id
                AND p.provider=ANY(%s))
              ORDER BY p.fetched_at DESC NULLS LAST,p.id LIMIT 1
            ) p ON true
            LEFT JOIN pongdang_data.place_detail d
              ON d.place_id=p.id AND d.state='active'
            LEFT JOIN pongdang_data.place_detail_collection a ON a.place_id=p.id
            WHERE s.id=ANY(%s) ORDER BY s.id LIMIT 100
            """,
            [list(PROVIDERS), list(spot_ids)],
        )
    ).fetchall()
    return [detail_view(row) for row in rows]


async def read_opening_season(connection, spot_id):
    """한 장소의 개장 기간 서술. 없으면 `None`.

    `read_place_details` 와 **같은 선택 규칙**입니다: 확정 링크
    (`place_detail_link`)가 먼저고, 없으면 spot 직결로 물러섭니다. `state='active'`
    에는 `place_detail_active_place` 부분 유니크 인덱스가 place_id 당 한 행을
    보장하므로 정렬이 필요 없습니다(`LIMIT 1` 은 방어용).

    provider 는 **한국어 행으로 고정**합니다. 개장 기간 파서는 한국어 서술을
    읽으므로(`season.py`), 외국어 행의 영어 산문을 먹이면 읽지 못한 것을 읽은
    것처럼 되거나 그 반대가 됩니다.
    """
    return await (
        await connection.execute(
            """
            SELECT d.opening_period,d.opening_date,d.fetched_at,d.source_modified_at
            FROM pongdang_data.spots_waterspot s
            LEFT JOIN pongdang_data.place_detail_link l ON l.spot_id=s.id
            LEFT JOIN LATERAL (
              SELECT p.* FROM pongdang_data.collection_place p
              WHERE p.id=l.place_id OR (l.place_id IS NULL AND p.spot_id=s.id
                AND p.provider='TOURAPI_KOREAN')
              ORDER BY p.fetched_at DESC NULLS LAST,p.id LIMIT 1
            ) p ON true
            JOIN pongdang_data.place_detail d
              ON d.place_id=p.id AND d.state='active' AND d.availability='available'
            WHERE s.id=%s LIMIT 1
            """,
            [spot_id],
        )
    ).fetchone()


async def read_opening_seasons(connection, spot_ids):
    """여러 장소의 개장 기간 서술을 한 번에. `{spot_id: row}` 이며 없는 장소는 빠집니다.

    `read_opening_season` 과 **같은 선택 규칙**입니다 -- 확정 링크가 먼저,
    없으면 spot 직결, provider 는 한국어 행 고정. 규칙이 갈리면 같은 해변의
    개장 판정이 화면마다 달라집니다.

    추천 탭이 후보 30곳의 개장 기간을 봐야 해서 생겼습니다. 한 곳씩 물으면
    한 요청에 서른 번을 왕복합니다.
    """
    ids = list(dict.fromkeys(spot_ids))
    if not ids:
        return {}
    rows = await (
        await connection.execute(
            """
            SELECT s.id AS spot_id,
                   d.opening_period,d.opening_date,
                   d.fetched_at,d.source_modified_at
            FROM pongdang_data.spots_waterspot s
            LEFT JOIN pongdang_data.place_detail_link l ON l.spot_id=s.id
            LEFT JOIN LATERAL (
              SELECT p.* FROM pongdang_data.collection_place p
              WHERE p.id=l.place_id OR (l.place_id IS NULL AND p.spot_id=s.id
                AND p.provider='TOURAPI_KOREAN')
              ORDER BY p.fetched_at DESC NULLS LAST,p.id LIMIT 1
            ) p ON true
            JOIN pongdang_data.place_detail d
              ON d.place_id=p.id AND d.state='active' AND d.availability='available'
            WHERE s.id=ANY(%s)
            """,
            [ids],
        )
    ).fetchall()
    return {row["spot_id"]: row for row in rows}


def detail_view(row):
    supported = row["current_content_type"] in (
        KOREAN_TYPES if row["provider"] == "TOURAPI_KOREAN" else FOREIGN_TYPES
    )
    if row["detail_id"] is not None:
        status = row["availability"]
    elif row["place_id"] is None:
        status = "unmatched"
    elif not supported or row["collection_state"] == "unsupported":
        status = "unsupported"
    elif row["collection_state"] == "failed":
        status = "failed"
    else:
        status = "pending"
    refresh_failed = row["collection_state"] == "failed"
    refresh_pending = bool(
        row["place_id"] is not None
        and supported
        and (
            row["detail_id"] is None
            or row["current_modified_at"] != row["catalog_modified_at"]
            or row["current_content_type"] != row["content_type"]
            or refresh_failed
        )
    )
    return {
        "spot_id": row["spot_id"],
        "name": row["name"] or row["spot_name"],
        "status": status,
        "provider": row["provider"],
        "source_id": row["source_id"],
        "content_type": row["content_type"] or row["current_content_type"],
        "fetched_at": row["fetched_at"],
        "source_created_at": row["source_created_at"],
        "source_modified_at": row["source_modified_at"],
        "refresh_pending": refresh_pending,
        "refresh_failed": refresh_failed,
        **{field: row[field] for field in TEXT_FIELDS},
        "details": row["details"] or [],
    }


def create_place_details_router(settings, *, reader=None):
    router = APIRouter(prefix="/api/data/place-details", tags=["place-details"])
    reader = reader or DataReader(settings)

    @router.get("")
    async def place_details(
        response: Response,
        spot_ids: str = Query(
            min_length=1, max_length=2100, pattern=r"^[0-9]+(?:,[0-9]+)*$"
        ),
    ):
        raw_ids = spot_ids.split(",")
        if len(raw_ids) > 100 or any(len(v) > 18 or int(v) < 1 for v in raw_ids):
            raise HTTPException(422, "Choose 1 to 100 valid place IDs")
        ids = sorted({int(value) for value in raw_ids})
        async with reader.connection() as connection:
            items = await read_place_details(connection, ids)
        response.headers["Cache-Control"] = "no-store"
        return {"items": items}

    return router
