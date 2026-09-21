"""Read-only classification of existing collected water places."""

from typing import Literal

from fastapi import APIRouter, Query
from pydantic import BaseModel, Field

from app.data_reader import DataReader
from app.regions import (
    PLACE_REGION_JOIN,
    DistrictCode,
    ProvinceCode,
    administrative_codes,
    administrative_predicate,
    place_search_predicate,
    region_options,
)

# Classification uses provider categories, never a keyword search result alone.
# The original IDs, types, names, addresses and coordinates stay untouched.
PLACE_SELECT = (
    """
SELECT s.id,s.name,s.type,s.address,s.region,s.lat,s.lng,s.catalog_source,
 r.province_code AS verified_province_code,r.district_code AS verified_district_code,
 CASE WHEN s.type IN ('beach','valley') THEN s.type
 WHEN EXISTS (SELECT 1 FROM pongdang_data.collection_place p WHERE p.spot_id=s.id
   AND ((p.provider='KAKAO_LOCAL' AND p.category LIKE '여행 > 관광,명소 > 해수욕장%%')
     OR (p.provider='TOURAPI_KOREAN' AND p.category='12'
         AND s.name ~ '(해수욕장|해변)$'))) THEN 'beach'
 WHEN EXISTS (SELECT 1 FROM pongdang_data.collection_place p WHERE p.spot_id=s.id
   AND ((p.provider='KAKAO_LOCAL' AND p.category LIKE '여행 > 관광,명소 > 계곡%%')
     OR (p.provider='TOURAPI_KOREAN' AND p.category='12'
         AND s.name ~ '계곡$'))) THEN 'valley'
 ELSE NULL END AS place_kind
FROM pongdang_data.spots_waterspot s
"""
    + PLACE_REGION_JOIN
)


class PreviewPlace(BaseModel):
    id: int
    name: str
    place_kind: Literal["beach", "valley"]
    address: str | None
    region: str | None
    lat: float | None
    lng: float | None


class CatalogPlace(PreviewPlace):
    province_code: ProvinceCode | None = None
    district_code: DistrictCode | None = None
    alias_ids: list[int] = Field(default_factory=list)


class PlacePage(BaseModel):
    rows: list[CatalogPlace]
    total: int
    page: int
    page_size: int
    has_more: bool


def place_catalog_cte(where):
    # Match all source spellings/addresses first, then deduplicate before the
    # count and LIMIT/OFFSET. A search for an alias still returns its place.
    return (
        f"WITH classified AS ({PLACE_SELECT}), matched AS ("
        "SELECT DISTINCT coalesce(a.canonical_spot_id,p.id) AS id "
        "FROM classified p LEFT JOIN pongdang_data.place_alias a ON a.spot_id=p.id "
        + where
        + ") "
    )


async def read_places_page(
    reader, *, q="", province=None, district=None, kind=None, page=1, page_size=100
):
    # Enforce the bound for internal callers too. Every page is read in one
    # read-only repeatable-read transaction with its count.
    if not 1 <= page <= 10000 or not 1 <= page_size <= 100:
        raise ValueError("Invalid place page")
    search, params = place_search_predicate(q, alias="p")
    where = "WHERE place_kind IS NOT NULL AND " + search
    if province or district:
        predicate, region_params = administrative_predicate(
            province=province or "gangwon", district=district, alias="p"
        )
        where += " AND " + predicate
        params.extend(region_params)
    if kind:
        if kind not in {"beach", "valley"}:
            raise ValueError("Unknown place kind")
        where += " AND place_kind=%s"
        params.append(kind)
    catalogue = place_catalog_cte(where)
    async with reader.connection() as connection:
        total = (
            await (
                await connection.execute(
                    catalogue + "SELECT count(*) AS total FROM matched", params
                )
            ).fetchone()
        )["total"]
        rows = await (
            await connection.execute(
                catalogue
                + "SELECT p.id,p.name,p.place_kind,p.address,p.region,p.lat,p.lng,"
                "p.verified_province_code AS province_code,"
                "p.verified_district_code AS district_code,"
                "ARRAY(SELECT a.spot_id FROM pongdang_data.place_alias a "
                "WHERE a.canonical_spot_id=p.id ORDER BY a.spot_id) AS alias_ids "
                "FROM classified p JOIN matched m ON m.id=p.id "
                "ORDER BY p.name,p.id LIMIT %s OFFSET %s",
                [*params, page_size, (page - 1) * page_size],
            )
        ).fetchall()
    for row in rows:
        if row["province_code"] is None:
            row["province_code"], row["district_code"] = administrative_codes(
                row.get("address"), row.get("region")
            )
    return {
        "rows": rows,
        "total": total,
        "page": page,
        "page_size": page_size,
        "has_more": page * page_size < total,
    }


def create_places_router(settings, *, reader=None):
    router = APIRouter(prefix="/api/data", tags=["places"])
    reader = reader or DataReader(settings)

    @router.get("/regions")
    async def regions():
        return region_options()

    @router.get("/places", response_model=PlacePage)
    async def places(
        q: str = Query("", max_length=100),
        province: ProvinceCode | None = None,
        district: DistrictCode | None = None,
        kind: Literal["beach", "valley"] | None = None,
        page: int = Query(1, ge=1, le=10000),
        page_size: int = Query(100, ge=1, le=100),
    ):
        return await read_places_page(
            reader,
            q=q,
            province=province,
            district=district,
            kind=kind,
            page=page,
            page_size=page_size,
        )

    return router
