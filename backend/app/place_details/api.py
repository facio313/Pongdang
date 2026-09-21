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
