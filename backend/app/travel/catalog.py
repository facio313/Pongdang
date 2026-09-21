"""Bounded real catalogue reads and mandatory, dated official restrictions."""

from datetime import datetime, time, timedelta
from zoneinfo import ZoneInfo

from fastapi import HTTPException

from app.ai.tools import PLACE_COLUMNS, PLACE_JOIN, ToolSession, _safe_url
from app.data_reader import DataReader
from app.place_details.api import read_place_details
from app.regions import district_group_expression, place_search_predicate, region_query
from app.travel.models import Evidence
from app.water_index.sources import AuthorityRecord

KST = ZoneInfo("Asia/Seoul")
PROVIDERS = {
    "ko": ["TOURAPI_KOREAN", "KAKAO_LOCAL"],
    "en": ["tourapi_english"],
    "ja": ["tourapi_japanese"],
    "zh-CN": ["tourapi_chinese_simplified"],
    "zh-TW": ["tourapi_chinese_traditional"],
}
PROVIDER_LOCALE = {p: lang for lang, providers in PROVIDERS.items() for p in providers}
MAX_CANDIDATES = 300
# KTO published v4.4 manuals, checked 2026-09-15. These classify catalogue
# records only; they establish no opening/access/amenity/safety property.
# https://www.data.go.kr/data/15101578/openapi.do (Korean)
# https://www.data.go.kr/data/15101753/openapi.do (English)
# https://www.data.go.kr/data/15101760/openapi.do (Japanese)
# https://www.data.go.kr/data/15101764/openapi.do (Simplified Chinese)
ROLE_CODES = {
    "ko": {"visit": ["12", "14", "15", "25", "28"], "meal": ["39"], "lodging": ["32"]},
    "en": {"visit": ["75", "76", "78", "85"], "meal": ["82"], "lodging": ["80"]},
    "ja": {"visit": ["75", "76", "78", "85"], "meal": ["82"], "lodging": ["80"]},
    "zh-CN": {"visit": ["75", "76", "78", "85"], "meal": ["82"], "lodging": ["80"]},
}
VISIT_KINDS = [
    "beach",
    "onsen",
    "hotspring",
    "lake",
    "river",
    "valley",
]


def catalog_role(row):
    if row["provider"] == "KAKAO_LOCAL":
        category = row.get("category") or ""
        if category.startswith("음식점"):
            return "meal"
        if category.startswith("여행 > 숙박"):
            return "lodging"
        if category.startswith("여행 > 관광,명소"):
            return "visit"
        return "unknown"
    if row.get("type") in VISIT_KINDS:
        return "visit"
    locale = PROVIDER_LOCALE.get(row["provider"])
    return next(
        (
            role
            for role, codes in ROLE_CODES.get(locale, {}).items()
            if row.get("category") in codes
        ),
        "unknown",
    )


def target_period(request, now):
    days = request.dates or [now.astimezone(KST).date()]
    return (
        datetime.combine(days[0], time(), KST),
        datetime.combine(days[-1] + timedelta(days=1), time(), KST),
    )


def place_view(row, now):
    evidence = Evidence(
        evidence_id=f"catalog:{row['provider']}:{row['source_id']}",
        provider=row["provider"],
        source_record_id=row["source_id"],
        source_url=_safe_url(row.get("source_url")),
        fetched_at=row.get("fetched_at"),
        issued_at=None,
        source_created_at=row.get("source_created_at"),
        source_modified_at=row.get("source_modified_at"),
        valid_from=row.get("source_valid_from"),
        valid_until=row.get("source_valid_until"),
        status="available"
        if row.get("fetched_at") and row["fetched_at"] <= now
        else "unknown",
    )
    # A category is a catalogue label, never a depth/current/crowding assertion.
    category = row.get("category") or ""
    kind = row.get("type") or ""
    tags = []
    for token, tag in (("온천", "온천"), ("서핑", "서핑"), ("해수욕장", "해변")):
        if token in category:
            tags.append(tag)
    if kind in {"hotspring", "onsen"}:
        tags.append("온천")
    if kind == "beach":
        tags.append("해변")
    return {
        "spot_id": row["spot_id"],
        "name": row["name"],
        "region": row.get("region"),
        "address": row.get("address"),
        "kind": kind,
        "category": category,
        "latitude": row.get("lat"),
        "longitude": row.get("lng"),
        "catalog_locale": PROVIDER_LOCALE.get(row["provider"], "ko"),
        "catalog_tags": sorted(set(tags)),
        "catalog_role": catalog_role(row),
        "evidence": evidence,
        "catalog_verified_at": row.get("catalog_verified_at"),
        "opening_hours": row.get("stored_opening_hours"),
        "reservation_required": None,
        "price": None,
    }


class Catalog:
    def __init__(self, settings, now, *, reader=None):
        self.settings, self.now = settings, now
        self.reader = reader or DataReader(settings)

    async def _with_stored_details(self, connection, rows):
        by_id = {row["spot_id"]: row for row in rows}
        ids = list(by_id)
        for offset in range(0, len(ids), 100):
            details = await read_place_details(connection, ids[offset : offset + 100])
            for detail in details:
                if (
                    detail["status"] == "available"
                    and detail["fetched_at"] is not None
                    and detail["fetched_at"] <= self.now
                ):
                    # Provider prose is informational; it does not establish an
                    # official operating window for a requested travel date.
                    by_id[detail["spot_id"]]["stored_opening_hours"] = detail[
                        "opening_hours"
                    ]

    async def languages(self):
        async with self.reader.connection() as c:
            rows = await (
                await c.execute(
                    "SELECT provider,count(*) AS count,max(fetched_at) AS fetched_at "
                    "FROM pongdang_data.collection_place GROUP BY provider "
                    "ORDER BY provider LIMIT 100"
                )
            ).fetchall()
        return [
            {
                "locale": lang,
                "records": sum(r["count"] for r in rows if r["provider"] in ps),
                "providers": [
                    {
                        "provider": r["provider"],
                        "count": r["count"],
                        "fetched_at": r["fetched_at"],
                    }
                    for r in rows
                    if r["provider"] in ps
                ],
            }
            for lang, ps in PROVIDERS.items()
        ]

    async def search(self, request):
        from app.travel.keywords import choices

        providers = PROVIDERS[request.locale]
        region = request.region or ""
        predicate, region_params = place_search_predicate(region)
        where = "WHERE p.provider=ANY(%s) AND " + predicate + " AND NOT(s.id=ANY(%s))"
        params = [providers, *region_params, request.exclude]
        # Apply selected place categories before the 300-candidate limit. A
        # matching lake/onsen must not disappear behind unrelated low-ID places.
        type_predicates = {
            "beach": (
                "(s.type='beach' OR strpos(coalesce(p.category,''),'해수욕장')>0)"
            ),
            "hot_spring": (
                "(s.type IN ('onsen','hotspring') OR "
                "strpos(coalesce(p.category,''),'온천')>0)"
            ),
            "lake": "s.type='lake'",
            "river": "s.type='river'",
        }
        selected_types = choices(request, "place_type")
        if selected_types:
            # These fragments come only from the fixed registry, never raw input.
            where += (
                " AND ("
                + " OR ".join(type_predicates[value] for value in selected_types)
                + ")"
            )
        if request.place_role != "any":
            codes = ROLE_CODES.get(request.locale, {}).get(request.place_role, [])
            kinds = (
                VISIT_KINDS if request.place_role == "visit" else [request.place_role]
            )
            where += (
                " AND ((p.provider<>'KAKAO_LOCAL' AND (s.type=ANY(%s) OR "
                "(s.type='tourism' AND p.category=ANY(%s)))) OR "
                "(p.provider='KAKAO_LOCAL' AND p.category LIKE %s))"
            )
            prefixes = {
                "visit": "여행 > 관광,명소%",
                "meal": "음식점%",
                "lodging": "여행 > 숙박%",
            }
            params.extend([kinds, codes, prefixes[request.place_role]])
        broad_region = region_query(region) == ("gangwon", None)
        if broad_region:
            district_expression, district_params = district_group_expression()
            query = (
                "WITH candidates AS (SELECT DISTINCT ON(s.id) "
                + PLACE_COLUMNS
                + ","
                + district_expression
                + " AS candidate_district"
                + PLACE_JOIN
                + where
                + " ORDER BY s.id,p.fetched_at DESC,p.provider,p.source_id),"
                "ranked AS (SELECT *,row_number() OVER ("
                "PARTITION BY candidate_district "
                "ORDER BY spot_id) AS district_position FROM candidates) "
                "SELECT * FROM ranked ORDER BY district_position,"
                "candidate_district NULLS LAST,spot_id LIMIT 100 OFFSET %s"
            )
            page_params = [*district_params, *params]
        else:
            query = (
                "SELECT DISTINCT ON(s.id) "
                + PLACE_COLUMNS
                + PLACE_JOIN
                + where
                + " ORDER BY s.id,p.fetched_at DESC,p.provider,p.source_id "
                "LIMIT 100 OFFSET %s"
            )
            page_params = params
        async with self.reader.connection() as c:
            total = (
                await (
                    await c.execute(
                        "SELECT count(DISTINCT s.id) AS count" + PLACE_JOIN + where,
                        params,
                    )
                ).fetchone()
            )["count"]
            rows = []
            for offset in range(0, min(total, MAX_CANDIDATES), 100):
                rows.extend(
                    await (
                        await c.execute(
                            query,
                            [*page_params, offset],
                        )
                    ).fetchall()
                )
            await self._with_stored_details(c, rows)
        return [place_view(r, self.now) for r in rows], {
            "region_query": region or None,
            "locale": request.locale,
            "providers": providers,
            "matched_count": total,
            "scanned_count": len(rows),
            "candidate_limit": MAX_CANDIDATES,
            "sql_page_size": 100,
            "truncated": total > len(rows),
            "scan_order": "round_robin_district_then_spot_id"
            if broad_region
            else "stable_spot_id",
            "coverage": "registered_catalog_only",
            "place_role": request.place_role,
            "role_classification": "KTO_content_type_v4.4_or_explicit_place_kind",
            "area_wide_optimum": False,
            "language_crosswalk": "unconfigured",
            "as_of": self.now.isoformat(),
        }

    async def places(self, ids):
        if not ids or len(ids) > 20:
            raise HTTPException(422, "place_selection_limit")
        async with self.reader.connection() as c:
            rows = await (
                await c.execute(
                    "SELECT DISTINCT ON(s.id) "
                    + PLACE_COLUMNS
                    + PLACE_JOIN
                    + (
                        " WHERE s.id=ANY(%s) ORDER BY s.id,p.fetched_at "
                        "DESC,p.provider LIMIT 100"
                    ),
                    [ids],
                )
            ).fetchall()
            # Explicit selections can come from a real water-place station (for
            # example KHOA beaches) without a tourism catalogue record. Keep that
            # source identity and its missing metadata; never create a catalogue
            # row or admit measurement-only stations such as buoys/grid cells.
            missing = sorted(set(ids) - {r["spot_id"] for r in rows})
            if missing:
                rows.extend(
                    await (
                        await c.execute(
                            "SELECT DISTINCT ON(s.id) s.id AS spot_id,s.name,"
                            "s.region,s.type,s.lat,s.lng,s.address,"
                            "s.catalog_verified_at,p.provider,p.source_id,"
                            "p.fetched_at,p.source_valid_from,p.source_valid_until "
                            "FROM pongdang_data.spots_waterspot s "
                            "JOIN pongdang_data.collection_station p ON p.spot_id=s.id "
                            "WHERE s.id=ANY(%s) AND p.kind=ANY(%s) "
                            "ORDER BY s.id,p.fetched_at DESC,p.provider,p.source_id "
                            "LIMIT 100",
                            [missing, VISIT_KINDS],
                        )
                    ).fetchall()
                )
            await self._with_stored_details(c, rows)
        if set(ids) != {r["spot_id"] for r in rows}:
            raise HTTPException(404, "travel_place_not_found")
        return {r["spot_id"]: place_view(r, self.now) for r in rows}

    async def restrictions(self, ids, request):
        start, end = target_period(request, self.now)
        result = {sid: [] for sid in ids}
        async with self.reader.connection() as c:
            for offset in range(0, len(ids), 50):
                rows = await (
                    await c.execute(
                        "SELECT a.payload,count(*) OVER() AS total FROM "
                        "pongdang_data.water_index_authority_evidence a "
                        "WHERE a.spot_id=ANY(%s) AND a.activity=%s AND "
                        "a.available_at<=%s "
                        "AND a.valid_from<%s AND a.valid_until>%s AND NOT EXISTS "
                        "(SELECT 1 FROM pongdang_data.water_index_authority_evidence n "
                        "WHERE n.supersedes_id=a.evidence_id AND n.available_at<=%s) "
                        "ORDER BY a.evidence_id LIMIT 100",
                        [
                            ids[offset : offset + 50],
                            request.activity,
                            self.now,
                            end,
                            start,
                            self.now,
                        ],
                    )
                ).fetchall()
                if rows and rows[0]["total"] > 100:
                    raise HTTPException(503, "restriction_scope_too_large")
                for row in rows:
                    record = AuthorityRecord.model_validate(row["payload"])
                    ev = record.evidence
                    # Keep stale/bulletin/unknown explicit; never infer clearance.
                    blocked = (
                        getattr(ev, "effect", None) == "restricted"
                        and ev.authoritative
                        and ev.state == "current"
                        and ev.source_status == "active"
                        and ev.fetched_at <= self.now
                        and ev.valid_until > self.now
                    )
                    result[ev.spot_id].append(
                        {
                            "evidence_id": record.evidence_id,
                            "evidence_ref": ev.evidence_ref,
                            "blocked": blocked,
                            "supersedes_id": record.supersedes_id,
                            "provider": ev.provider,
                            "provider_record_id": ev.provider_record_id,
                            "source_url": _safe_url(record.source_url),
                            "fetched_at": ev.fetched_at.isoformat(),
                            "issued_at": ev.issued_at.isoformat()
                            if ev.issued_at
                            else None,
                            "valid_from": ev.valid_from.isoformat(),
                            "valid_until": ev.valid_until.isoformat(),
                            "activity": ev.activity,
                            "state": ev.state,
                            "source_status": ev.source_status,
                            "scope": ev.scope,
                        }
                    )
            # Official operating closures are mandatory too, independent of
            # the authority-evidence registration path.
            from app.tides.service import OperatingWindow

            for offset in range(0, len(ids), 50):
                rows = await (
                    await c.execute(
                        "WITH latest AS (SELECT DISTINCT ON"
                        "(spot_id,activity,source_key) payload,start_at,end_at "
                        "FROM pongdang_data.tide_operating_window "
                        "WHERE spot_id=ANY(%s) AND activity=%s AND available_at<=%s "
                        "ORDER BY spot_id,activity,source_key,available_at DESC,"
                        "window_id DESC) "
                        "SELECT payload,count(*) OVER() AS total FROM latest "
                        "WHERE start_at<%s AND end_at>%s LIMIT 100",
                        [
                            ids[offset : offset + 50],
                            request.activity,
                            self.now,
                            end,
                            start,
                        ],
                    )
                ).fetchall()
                if rows and rows[0]["total"] > 100:
                    raise HTTPException(503, "operating_scope_too_large")
                for row in rows:
                    window = OperatingWindow.model_validate(row["payload"])
                    fresh = window.fetched_at <= self.now < window.valid_until
                    result[window.spot_id].append(
                        {
                            "evidence_id": window.window_id,
                            "evidence_ref": window.window_id,
                            "blocked": fresh
                            and (
                                window.operating_status == "closed"
                                or window.controls_status == "restricted"
                            ),
                            "supersedes_id": None,
                            "provider": window.provider,
                            "provider_record_id": window.provider_record_id,
                            "source_url": _safe_url(window.source_url),
                            "fetched_at": window.fetched_at.isoformat(),
                            "issued_at": window.issued_at.isoformat()
                            if window.issued_at
                            else None,
                            "valid_from": window.start_at.isoformat(),
                            "valid_until": min(
                                window.end_at, window.valid_until
                            ).isoformat(),
                            "activity": window.activity,
                            "state": "current" if fresh else "stale",
                            "source_status": "active" if fresh else "unknown",
                            "scope": window.scope,
                            "operating_status": window.operating_status,
                            "controls_status": window.controls_status,
                        }
                    )
        return result

    async def conditions(self, sid, request):
        session = ToolSession(self.settings, self.now, reader=self.reader)
        start, end = target_period(request, self.now)
        # Existing tools explicitly bound provider time ranges. Outside that
        # window remains unsupported, never replaced with today's observation.
        if end > self.now + timedelta(days=31) or start < self.now - timedelta(days=31):
            return {
                "status": "unknown",
                "reason_codes": ["outside_forecast_horizon"],
                "facts": [],
                "forecast_status": "outside_forecast_horizon",
            }
        args = {
            "activity": request.activity,
            "when": "custom",
            "part_of_day": "all",
            "start": start.isoformat(),
            "end": end.isoformat(),
            "spot_ids": [sid],
        }
        await session.execute(
            "place_conditions", {**args, "temperature_confirmed_only": False}
        )
        forecast = await session.execute("forecast_compare", args)
        if request.activity == "mudflat":
            await session.execute(
                "tides",
                {k: v for k, v in args.items() if k != "spot_ids"} | {"spot_id": sid},
            )
        return {
            "status": "query_failed"
            if any(f["data_status"] == "query_failed" for f in session.facts.values())
            else "partial",
            "reason_codes": session.reason_codes,
            "facts": list(session.facts.values()),
            "forecast_status": forecast["status"],
        }
