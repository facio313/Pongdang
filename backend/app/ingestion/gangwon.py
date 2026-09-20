"""Restartable TourAPI district catalogs, using verified legal-district codes.

The September 2026 official service specifications deprecate areaCode and
sigunguCode. Kor/Eng/Jpn/ChsService2 areaBasedList2 accept lDongRegnCd and
lDongSignguCd. KorService2/ldongCode2 returned these 18 districts on 2026-09-21.
Each invocation fetches at most configured pages + two resume-check requests.
Provider pagination is not a snapshot: changed boundaries restart a sweep;
completed sweeps refresh daily, without deleting previously collected places.
"""

import hashlib
import json
from dataclasses import dataclass
from functools import partial
from urllib.parse import unquote

from psycopg.types.json import Jsonb

from app.ingestion.http import Client, ProviderError
from app.ingestion.jobs import Job
from app.ingestion.marine import unpack, utcnow
from app.ingestion.models import SourceBatch
from app.ingestion.storage import store_batch
from app.ingestion.water_tour_extra import LANGUAGES, required, tourism_place
from app.schema import connect

DISTRICTS = {
    "110": "춘천시",
    "130": "원주시",
    "150": "강릉시",
    "170": "동해시",
    "190": "태백시",
    "210": "속초시",
    "230": "삼척시",
    "720": "홍천군",
    "730": "횡성군",
    "750": "영월군",
    "760": "평창군",
    "770": "정선군",
    "780": "철원군",
    "790": "화천군",
    "800": "양구군",
    "810": "인제군",
    "820": "고성군",
    "830": "양양군",
}
SERVICES = {"korean": "KorService2", **LANGUAGES}
PAGE_SIZE = 100
MAX_SCOPE_RECORDS = 100_000


def migrate_tourism_scopes(connection):
    """Called only by the explicit additive app.schema migration."""
    connection.execute(
        "CREATE TABLE IF NOT EXISTS pongdang_data.collection_scope_cursor ("
        "task_name text PRIMARY KEY, cursor jsonb NOT NULL DEFAULT '{}', "
        "completed_at timestamptz, updated_at timestamptz NOT NULL DEFAULT now())"
    )


def job_name(language, district):
    if language not in SERVICES or district not in DISTRICTS:
        raise ProviderError("UNSUPPORTED_TOURISM_SCOPE")
    return f"tourism_gangwon_{language}_{district}"


def fingerprint(rows):
    return hashlib.sha256(
        json.dumps(rows, ensure_ascii=False, sort_keys=True).encode()
    ).hexdigest()


@dataclass(frozen=True)
class CatalogChunk:
    batch: SourceBatch
    cursor: dict
    total: int
    received: int
    restarted: bool = False


class GangwonTourism:
    def __init__(self, settings, client=None, clock=utcnow):
        self.settings = settings
        self.client = client or Client()
        self.clock = clock

    def fetch(self, language, district, cursor=None):
        """Read a bounded chunk; no cursor is advanced until storage commits."""
        job_name(language, district)
        if (
            language == "chinese_traditional"
            and not self.settings.tourism_traditional_enabled
        ):
            raise ProviderError("SERVICE_APPROVAL_UNCONFIRMED")
        key = self.settings.data_go_kr_key.get_secret_value()
        if not key:
            raise ProviderError("MISSING_CREDENTIAL")
        pages = self.settings.tourism_pages_per_run
        if not 1 <= pages <= 10:
            raise ProviderError("INVALID_PAGE_BUDGET")
        cache = {}

        def page(number):
            if number not in cache:
                payload = self.client.get_json(
                    f"https://apis.data.go.kr/B551011/{SERVICES[language]}/areaBasedList2",
                    {
                        "serviceKey": unquote(key),
                        "MobileOS": "ETC",
                        "MobileApp": "Pongdang",
                        "_type": "json",
                        "numOfRows": PAGE_SIZE,
                        "pageNo": number,
                        "lDongRegnCd": "51",
                        "lDongSignguCd": district,
                        # Creation order moves less often than modified/title order.
                        # D includes records without images as well.
                        "arrange": "D",
                    },
                )
                rows, total = unpack(payload)
                if total > MAX_SCOPE_RECORDS:
                    raise ProviderError("RECORD_LIMIT_EXCEEDED")
                if len(rows) > PAGE_SIZE:
                    raise ProviderError("PAGE_LIMIT_EXCEEDED")
                expected = max(0, min(PAGE_SIZE, total - (number - 1) * PAGE_SIZE))
                if len(rows) != expected:
                    raise ProviderError("INCOMPLETE_PAGINATION")
                for row in rows:
                    if (
                        str(row.get("lDongRegnCd", "")) != "51"
                        or str(row.get("lDongSignguCd", "")) != district
                    ):
                        raise ProviderError("UNEXPECTED_TOURISM_REGION")
                cache[number] = rows, total
            return cache[number]

        current = dict(cursor or {})
        start = current.get("next_page", 1)
        if (
            not isinstance(start, int)
            or not 1 <= start <= MAX_SCOPE_RECORDS // PAGE_SIZE
        ):
            raise ProviderError("INVALID_CATALOG_CURSOR")
        first_rows, total = page(1)
        first_digest = fingerprint(first_rows)
        restarted = False
        if start > 1:
            # Check both ends of the stored prefix before trusting its offset.
            previous, previous_total = page(start - 1)
            if (
                current.get("total") != total
                or previous_total != total
                or current.get("first_digest") != first_digest
                or current.get("previous_digest") != fingerprint(previous)
            ):
                current, start, restarted = {}, 1, True
        seen = set(current.get("seen_source_ids", []))
        if len(seen) != (start - 1) * PAGE_SIZE:
            raise ProviderError("INVALID_CATALOG_CURSOR")
        places, received, last_rows = [], 0, []
        finished = False
        for number in range(start, start + pages):
            rows, page_total = page(number)
            if page_total != total:
                raise ProviderError("PAGINATION_TOTAL_CHANGED")
            for row in rows:
                identity = required(row, "contentid")
                if identity in seen:
                    raise ProviderError("PAGINATION_REPEATED_RECORD")
                seen.add(identity)
                place = tourism_place(row, self.clock())
                if place is not None:
                    places.append(place)
            received += len(rows)
            last_rows = rows
            if number * PAGE_SIZE >= total:
                finished = True
                break
        next_cursor = (
            {}
            if finished
            else {
                "next_page": number + 1,
                "total": total,
                "first_digest": first_digest,
                "previous_digest": fingerprint(last_rows),
                "seen_source_ids": sorted(seen),
            }
        )
        return CatalogChunk(
            batch=SourceBatch(
                provider="TOURAPI_KOREAN"
                if language == "korean"
                else "tourapi_" + language,
                fetched_at=self.clock(),
                coverage="complete" if finished else "bounded",
                catalog_only=True,
                places=places,
            ),
            cursor=next_cursor,
            total=total,
            received=received,
            restarted=restarted,
        )

    def collect(self, language, district):
        name = job_name(language, district)
        with connect(self.settings) as connection:
            # Also protects direct operator invocation outside the worker.
            connection.execute(
                "SELECT pg_advisory_xact_lock(hashtext(%s))", [name + "/cursor"]
            )
            row = connection.execute(
                "SELECT cursor FROM pongdang_data.collection_scope_cursor "
                "WHERE task_name=%s FOR UPDATE",
                [name],
            ).fetchone()
            chunk = self.fetch(language, district, row[0] if row else None)
            inserted = store_batch(self.settings, chunk.batch, connection=connection)
            connection.execute(
                "INSERT INTO pongdang_data.collection_scope_cursor "
                "(task_name,cursor,completed_at,updated_at) "
                "VALUES (%s,%s,%s,now()) ON CONFLICT(task_name) DO UPDATE SET "
                "cursor=EXCLUDED.cursor,completed_at=COALESCE(EXCLUDED.completed_at,"
                "collection_scope_cursor.completed_at),updated_at=now()",
                [
                    name,
                    Jsonb(chunk.cursor),
                    None if chunk.cursor else chunk.batch.fetched_at,
                ],
            )
        result = {
            "received": chunk.received,
            "inserted": inserted,
            "state": "partial"
            if chunk.cursor
            else "succeeded"
            if chunk.total
            else "no_data",
            "error": "CATALOG_CONTINUATION_PENDING" if chunk.cursor else "",
        }
        if chunk.cursor:
            result["next_run_seconds"] = 60
        return result


def gangwon_tourism_jobs(settings):
    provider = GangwonTourism(settings)
    portal = bool(settings.data_go_kr_key.get_secret_value())
    selected = getattr(settings, "tourism_collection_scope", "local") == "gangwon"
    jobs = []
    for language in SERVICES:
        approved = (
            language != "chinese_traditional" or settings.tourism_traditional_enabled
        )
        for district in DISTRICTS:
            jobs.append(
                Job(
                    job_name(language, district),
                    86400,
                    enabled=portal and selected and approved,
                    process=partial(provider.collect, language, district),
                    disabled_reason=(
                        "KEY_NOT_CONFIGURED"
                        if not portal
                        else "SERVICE_APPROVAL_UNCONFIRMED"
                        if not approved
                        else "COLLECTION_SCOPE_NOT_SELECTED"
                    ),
                )
            )
    return jobs
