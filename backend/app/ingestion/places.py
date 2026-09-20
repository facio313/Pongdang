"""Bounded real place catalogs around the configured collection area."""

from datetime import UTC, datetime
from urllib.parse import unquote

from app.config import Settings
from app.ingestion.http import Client, ProviderError
from app.ingestion.jobs import Job
from app.ingestion.models import Place, SourceBatch


def kakao_places(settings: Settings, client=None) -> SourceBatch:
    client = client or Client()
    found = {}
    headers = {"Authorization": "KakaoAK " + settings.kakao_rest_key.get_secret_value()}
    center = dict(
        x=settings.collection_longitude,
        y=settings.collection_latitude,
        radius=settings.collection_radius_m,
        size=15,
        sort="distance",
    )
    requests = [("keyword", {"query": "해수욕장"})] + [
        ("category", {"category_group_code": code})
        for code in ("PK6", "CS2", "PM9", "HP8")
    ]
    for method, query in requests:
        data = client.get_json(
            f"https://dapi.kakao.com/v2/local/search/{method}.json",
            {**center, **query},
            headers,
        )
        if not isinstance(data, dict) or not isinstance(data.get("documents"), list):
            raise ProviderError("INVALID_PLACE_RESPONSE")
        for row in data["documents"]:
            if not row.get("id") or not row.get("place_name"):
                raise ProviderError("INVALID_PLACE_RECORD")
            found[str(row["id"])] = Place(
                source_id=str(row["id"]),
                name=row["place_name"],
                kind="beach_search_result" if method == "keyword" else "facility",
                latitude=float(row["y"]),
                longitude=float(row["x"]),
                address=row.get("road_address_name") or row.get("address_name", ""),
                category=row.get("category_name", ""),
                source_url=row.get("place_url", ""),
            )
    return SourceBatch(
        provider="KAKAO_LOCAL",
        fetched_at=datetime.now(UTC),
        places=list(found.values()),
        coverage="bounded",
    )


def tourism_places(settings: Settings, client=None) -> SourceBatch:
    client = client or Client()
    places = {}
    for page in range(1, 6):
        data = client.get_json(
            "https://apis.data.go.kr/B551011/KorService2/locationBasedList2",
            dict(
                serviceKey=unquote(settings.data_go_kr_key.get_secret_value()),
                MobileOS="ETC",
                MobileApp="Pongdang",
                _type="json",
                numOfRows=100,
                pageNo=page,
                mapX=settings.collection_longitude,
                mapY=settings.collection_latitude,
                radius=settings.collection_radius_m,
                arrange="E",
            ),
        )
        try:
            body = data["response"]["body"]
            items = body.get("items") or {}
            rows = items.get("item", []) if isinstance(items, dict) else []
            if isinstance(rows, dict):
                rows = [rows]
            total = int(body.get("totalCount", 0))
        except KeyError, TypeError, ValueError:
            raise ProviderError("INVALID_TOURISM_RESPONSE") from None
        for row in rows:
            if not row.get("mapx") or not row.get("mapy"):
                continue
            longitude, latitude = float(row["mapx"]), float(row["mapy"])
            if not (longitude and latitude):
                continue  # Skip missing-coordinate placeholders.
            source_id = str(row["contentid"])
            places[source_id] = Place(
                source_id=source_id,
                name=row["title"],
                kind="tourism",
                latitude=latitude,
                longitude=longitude,
                address=" ".join(filter(None, [row.get("addr1"), row.get("addr2")])),
                category=str(row.get("contenttypeid", "")),
            )
        if page * 100 >= total or not rows:
            break
    return SourceBatch(
        provider="TOURAPI_KOREAN",
        fetched_at=datetime.now(UTC),
        places=list(places.values()),
        coverage="bounded" if page * 100 < total else "complete",
    )


def place_jobs(settings: Settings) -> list[Job]:
    from app.ingestion.gangwon import gangwon_tourism_jobs

    portal = bool(settings.data_go_kr_key.get_secret_value())
    local = getattr(settings, "tourism_collection_scope", "local") == "local"
    return [
        Job(
            "kakao_places",
            86400,
            lambda: kakao_places(settings),
            bool(settings.kakao_rest_key.get_secret_value()),
        ),
        Job(
            "tourism_places",
            86400,
            lambda: tourism_places(settings),
            portal and local,
            disabled_reason=(
                "COLLECTION_SCOPE_REPLACED" if portal else "KEY_NOT_CONFIGURED"
            ),
        ),
    ] + gangwon_tourism_jobs(settings)
