"""Provider-confirmed administrative areas, separate from raw place metadata."""

import re
from datetime import UTC, datetime

from psycopg.rows import dict_row

from app.ingestion.http import Client, ProviderError
from app.ingestion.jobs import Job
from app.schema import connect

ENDPOINT = "https://dapi.kakao.com/v2/local/geo/coord2regioncode.json"


def migrate_place_regions(connection):
    connection.execute(
        "CREATE TABLE IF NOT EXISTS pongdang_data.collection_place_region ("
        "spot_id bigint PRIMARY KEY REFERENCES pongdang_data.spots_waterspot(id),"
        "province_code text NOT NULL,district_code text,provider text NOT NULL,"
        "provider_region_code text NOT NULL,source_url text NOT NULL,"
        "verified_at timestamptz NOT NULL,latitude double precision NOT NULL,"
        "longitude double precision NOT NULL)"
    )
    connection.execute(
        "CREATE INDEX IF NOT EXISTS place_region_district_idx ON "
        "pongdang_data.collection_place_region(province_code,district_code)"
    )


def resolve_region(settings, latitude, longitude, *, client=None):
    """Use a returned legal-district code; never guess from nearby place names."""
    from app.regions import administrative_codes

    key = settings.kakao_rest_key.get_secret_value()
    if not key:
        raise ProviderError("MISSING_CREDENTIAL")
    data = (client or Client()).get_json(
        ENDPOINT,
        {"x": longitude, "y": latitude, "input_coord": "WGS84"},
        {"Authorization": "KakaoAK " + key},
    )
    if not isinstance(data, dict) or not isinstance(data.get("documents"), list):
        raise ProviderError("INVALID_REGION_RESPONSE")
    if any(not isinstance(row, dict) for row in data["documents"]):
        raise ProviderError("INVALID_REGION_RESPONSE")
    legal = [r for r in data["documents"] if r.get("region_type") == "B"]
    if not legal:
        return None  # Offshore/unknown is not an administrative assignment.
    if len(legal) != 1:
        raise ProviderError("AMBIGUOUS_REGION_RESPONSE")
    row = legal[0]
    code = str(row.get("code") or "")
    if not re.fullmatch(r"[0-9]{10}", code):
        raise ProviderError("INVALID_REGION_CODE")
    if not code.startswith("51"):
        return None
    area = administrative_codes(region=f"51:{code[2:5]}")
    if area[0] != "gangwon" or area[1] is None:
        raise ProviderError("UNKNOWN_GANGWON_DISTRICT")
    return area, code


def collect_place_regions(settings, *, client=None, limit=25):
    from app.livecams.places import PLACE_SELECT

    if type(limit) is not int or not 1 <= limit <= 100:
        raise ValueError("Invalid region collection limit")
    with connect(settings) as c, c.cursor(row_factory=dict_row) as cursor:
        rows = cursor.execute(
            f"WITH places AS ({PLACE_SELECT}) SELECT id,lat,lng FROM places "
            "WHERE place_kind IS NOT NULL AND lat IS NOT NULL AND lng IS NOT NULL "
            "AND verified_province_code IS NULL "
            "AND coalesce(address,'')='' AND coalesce(region,'')='' "
            "ORDER BY id LIMIT %s",
            [limit],
        ).fetchall()
    verified = []
    for row in rows:
        result = resolve_region(settings, row["lat"], row["lng"], client=client)
        if result:
            area, code = result
            verified.append((row, area, code))
    now = datetime.now(UTC)
    inserted = 0
    with connect(settings) as c:
        for row, area, code in verified:
            inserted += c.execute(
                "INSERT INTO pongdang_data.collection_place_region "
                "(spot_id,province_code,district_code,provider,provider_region_code,"
                "source_url,verified_at,latitude,longitude) "
                "SELECT id,%s,%s,'KAKAO_LOCAL_REGIONS',%s,%s,%s,lat,lng "
                "FROM pongdang_data.spots_waterspot WHERE id=%s AND lat=%s "
                "AND lng=%s AND coalesce(address,'')='' AND coalesce(region,'')='' "
                "ON CONFLICT(spot_id) DO UPDATE SET "
                "province_code=EXCLUDED.province_code,"
                "district_code=EXCLUDED.district_code,provider=EXCLUDED.provider,"
                "provider_region_code=EXCLUDED.provider_region_code,"
                "source_url=EXCLUDED.source_url,verified_at=EXCLUDED.verified_at,"
                "latitude=EXCLUDED.latitude,longitude=EXCLUDED.longitude",
                [
                    area[0],
                    area[1],
                    code,
                    ENDPOINT,
                    now,
                    row["id"],
                    row["lat"],
                    row["lng"],
                ],
            ).rowcount
    return {
        "state": "succeeded" if inserted else "no_data",
        "received": len(rows),
        "inserted": inserted,
        "error": "",
    }


def administrative_jobs(settings):
    return [
        Job(
            "place_administrative_regions",
            86400,
            enabled=bool(settings.kakao_rest_key.get_secret_value()),
            process=lambda: collect_place_regions(settings),
        )
    ]
