"""Read-only classification of existing collected water places."""

from math import isfinite
from typing import Literal

from fastapi import APIRouter, HTTPException, Query
from pydantic import AwareDatetime, BaseModel, Field

from app.data_reader import DataReader
from app.ingestion.water_tour_extra import TOURISM_KIND_CODES
from app.place_kinds import WATER_PLACE_KINDS, WaterPlaceKind
from app.regions import (
    PLACE_REGION_JOIN,
    DistrictCode,
    ProvinceCode,
    administrative_codes,
    administrative_predicate,
    place_search_predicate,
    region_options,
)

TOURISM_PROVIDERS = (
    "TOURAPI_KOREAN",
    "tourapi_english",
    "tourapi_japanese",
    "tourapi_chinese_simplified",
    "tourapi_chinese_traditional",
)
TOURISM_PROVIDER_SQL = ",".join(f"'{provider}'" for provider in TOURISM_PROVIDERS)
CATALOG_VERIFICATION_HOURS = 48


def tourism_detail_kind_sql(alias="s"):
    """Read already stored official classification; never join by name/location."""
    cases = " ".join(
        "WHEN p.category IN ("
        + ",".join(f"'{content_type}'" for content_type in sorted(content_types))
        + ') AND d.details @> \'[{"section":"common",'
        + f'"key":"lclsSystm3","value":"{code}"}}]'
        + f"' THEN '{kind}'"
        for code, (kind, content_types) in TOURISM_KIND_CODES.items()
    )
    return (
        "(SELECT CASE "
        + cases
        + " ELSE NULL END FROM pongdang_data.collection_place p "
        "JOIN pongdang_data.place_detail d ON d.place_id=p.id AND d.state='active' "
        "AND d.content_type=p.category AND d.fetched_at<=now() "
        "AND d.catalog_modified_at IS NOT DISTINCT FROM p.source_modified_at "
        f"WHERE p.spot_id={alias}.id AND p.provider IN ({TOURISM_PROVIDER_SQL}) "
        "ORDER BY p.fetched_at DESC,d.fetched_at DESC,d.id DESC LIMIT 1)"
    )


def catalog_verification_join(alias="s"):
    """Only a recent item read in a completed successful catalogue is a badge.

    collection_job.last_success_at includes partial pages, so it cannot establish
    this status. Failed/running/partial latest work suppresses the badge even when
    the previous item value is retained. No source modification date is used.
    """
    language = (
        "CASE p.provider WHEN 'TOURAPI_KOREAN' THEN 'korean' "
        "ELSE substring(p.provider FROM 9) END"
    )
    return (
        " LEFT JOIN LATERAL (SELECT max(p.fetched_at) AS catalog_verified_at "
        "FROM pongdang_data.collection_place p JOIN LATERAL ("
        "SELECT j.* FROM pongdang_data.collection_job j WHERE j.state<>'disabled' "
        "AND (j.task_name=CASE p.provider WHEN 'TOURAPI_KOREAN' "
        "THEN 'tourism_places' ELSE p.provider END OR "
        "(split_part(p.region,':',1)='51' AND j.task_name="
        f"'tourism_gangwon_'||({language})||'_'||split_part(p.region,':',2))) "
        "ORDER BY coalesce(j.started_at,j.finished_at) DESC NULLS LAST "
        "LIMIT 1) j ON TRUE "
        f"WHERE p.spot_id={alias}.id AND p.provider IN ({TOURISM_PROVIDER_SQL}) "
        f"AND p.fetched_at>=now()-interval '{CATALOG_VERIFICATION_HOURS} hours' "
        "AND p.fetched_at<=now() AND j.state='succeeded' "
        "AND j.started_at<=j.finished_at AND j.finished_at>=p.fetched_at "
        "AND j.finished_at<=now() "
        "AND (j.task_name LIKE 'tourism_gangwon_%%' "
        "OR j.started_at<=p.fetched_at)) catalog_check ON TRUE "
    )


# Classification uses provider categories, never a keyword search result alone.
# The original IDs, types, names, addresses and coordinates stay untouched.
def water_place_kind_sql(alias="s"):
    """Classify stored catalogues; alias is a trusted internal SQL identifier."""
    return (
        "(SELECT CASE WHEN kind IN ('beach','valley','lake','reservoir') "
        "THEN kind ELSE NULL END FROM (SELECT "
        f"{catalog_place_kind_sql(alias)} AS kind) classified_kind)"
    )


def catalog_place_kind_sql(alias="s"):
    legacy = _WATER_PLACE_KIND_SQL.replace("s.", f"{alias}.")
    return f"coalesce({tourism_detail_kind_sql(alias)},{legacy},{alias}.type)"


_WATER_PLACE_KIND_SQL = """
CASE WHEN s.type IN ('beach','valley','lake','reservoir') THEN s.type
 ELSE (SELECT CASE
 WHEN bool_or((p.provider='KAKAO_LOCAL'
               AND p.category LIKE '여행 > 관광,명소 > 해수욕장%%')
     OR (p.provider='TOURAPI_KOREAN' AND p.category='12'
         AND s.name ~ '(해수욕장|해변)$')) THEN 'beach'
 WHEN bool_or((p.provider='KAKAO_LOCAL'
               AND p.category LIKE '여행 > 관광,명소 > 계곡%%')
     OR (p.provider='TOURAPI_KOREAN' AND p.category='12'
         AND s.name ~ '계곡$')) THEN 'valley'
 WHEN bool_or((p.provider='KAKAO_LOCAL'
               AND p.category LIKE '여행 > 관광,명소 > 저수지%%')
     OR (p.provider='TOURAPI_KOREAN' AND p.category='12'
         AND s.name ~ '저수지( *[(][^)]*[)])?$')) THEN 'reservoir'
 WHEN bool_or((p.provider='KAKAO_LOCAL'
               AND p.category LIKE '여행 > 관광,명소 > 호수%%')
     OR (p.provider='TOURAPI_KOREAN' AND p.category='12'
         AND s.name ~ '호수( *[(][^)]*[)])?$')) THEN 'lake'
 WHEN bool_or(d.id IS NOT NULL)
 THEN CASE WHEN s.name ~ '저수지( *[(][^)]*[)])?$'
             THEN 'reservoir' ELSE 'lake' END
 ELSE NULL END
 FROM pongdang_data.collection_place p
 LEFT JOIN pongdang_data.place_detail d ON d.place_id=p.id AND d.state='active'
   AND p.provider='TOURAPI_KOREAN' AND p.category='12'
   AND d.details @> '[{"section":"common","key":"cat3","value":"A01011700"}]'
 WHERE p.spot_id=s.id AND p.provider IN ('KAKAO_LOCAL','TOURAPI_KOREAN')) END
"""
PLACE_SELECT = (
    "SELECT s.id,s.name,s.type,s.address,s.region,s.lat,s.lng,s.catalog_source,"
    "catalog_check.catalog_verified_at,"
    "catalog_check.catalog_verified_at IS NOT NULL AS catalog_recently_verified,"
    "r.province_code AS verified_province_code,"
    "r.district_code AS verified_district_code,"
    + water_place_kind_sql()
    + " AS place_kind FROM pongdang_data.spots_waterspot s "
    + PLACE_REGION_JOIN
    + catalog_verification_join()
)


class PreviewPlace(BaseModel):
    id: int
    name: str
    place_kind: WaterPlaceKind
    address: str | None
    region: str | None
    lat: float | None
    lng: float | None
    catalog_recently_verified: bool = False
    catalog_verified_at: AwareDatetime | None = None


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


class NearbyPlaces(BaseModel):
    rows: list[PreviewPlace] = Field(max_length=25)
    status: Literal["ready", "coordinates_unavailable"]


async def read_nearby_places(reader, spot_id, limit=2):
    """Bounded distinct places of the selected kind, nearest first."""
    if not 1 <= limit <= 25:
        raise ValueError("Nearby place limit must be between 1 and 25")
    async with reader.connection() as c:
        reference = await (
            await c.execute(
                f"WITH classified AS ({PLACE_SELECT}) "
                "SELECT p.*,coalesce(a.canonical_spot_id,p.id) AS canonical_id "
                "FROM classified p LEFT JOIN pongdang_data.place_alias a "
                "ON a.spot_id=p.id WHERE p.id=%s AND p.place_kind IS NOT NULL",
                [spot_id],
            )
        ).fetchone()
        if reference is None:
            raise HTTPException(404, "place_not_found")
        lat, lng = reference["lat"], reference["lng"]
        if (
            lat is None
            or lng is None
            or not isfinite(lat)
            or not isfinite(lng)
            or not -90 <= lat <= 90
            or not -180 <= lng <= 180
            or (lat, lng) == (0, 0)
        ):
            return {"rows": [], "status": "coordinates_unavailable"}
        rows = await (
            await c.execute(
                place_catalog_cte("WHERE p.place_kind=%s")
                + "SELECT p.id,p.name,p.place_kind,p.address,p.region,p.lat,p.lng,"
                "p.catalog_recently_verified,p.catalog_verified_at "
                "FROM classified p JOIN matched m ON m.id=p.id "
                "WHERE p.id<>%s AND p.place_kind=%s "
                "AND p.lat BETWEEN -90 AND 90 AND p.lng BETWEEN -180 AND 180 "
                "AND (p.lat<>0 OR p.lng<>0) "
                # The haversine term is monotonic in great-circle distance.
                # No page, name, score or district preference may outrank distance.
                "ORDER BY power(sin(radians(p.lat-%s)/2),2) + "
                "cos(radians(%s))*cos(radians(p.lat))*"
                "power(sin(radians(p.lng-%s)/2),2), p.id LIMIT %s",
                [
                    reference["place_kind"],
                    reference["canonical_id"],
                    reference["place_kind"],
                    lat,
                    lat,
                    lng,
                    limit,
                ],
            )
        ).fetchall()
    return {"rows": rows, "status": "ready"}


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
        if kind not in WATER_PLACE_KINDS:
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
                "p.catalog_recently_verified,p.catalog_verified_at,"
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

    @router.get("/places/nearby", response_model=NearbyPlaces)
    async def nearby_places(
        spot_id: int = Query(..., gt=0), limit: int = Query(2, ge=1, le=25)
    ):
        return await read_nearby_places(reader, spot_id, limit)

    @router.get("/places", response_model=PlacePage)
    async def places(
        q: str = Query("", max_length=100),
        province: ProvinceCode | None = None,
        district: DistrictCode | None = None,
        kind: WaterPlaceKind | None = None,
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
