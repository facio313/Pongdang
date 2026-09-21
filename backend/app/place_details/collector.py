"""Incremental backfill: missing/revised sources only, with durable retry/quota."""

from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

from psycopg.rows import dict_row

from app.attachments.collector import distance
from app.ingestion.http import ProviderError
from app.ingestion.jobs import Job
from app.ingestion.storage import store_batch
from app.place_details.provider import (
    SERVICES,
    SUPPORTED_TYPES,
    TourDetails,
    language_group,
)
from app.schema import connect

KST = ZoneInfo("Asia/Seoul")


def providers(settings):
    return [
        provider
        for provider in SERVICES
        if provider != "tourapi_chinese_traditional"
        or settings.tourism_traditional_enabled
    ]


def name_sql(column):
    # Conservative spelling equivalence, plus coordinates within 500 metres.
    return (
        f"regexp_replace(regexp_replace(regexp_replace({column},"
        r"'\([^)]*\)','','g'),'\s','','g'),'해수욕장$','해변')"
    )


def link_places(settings):
    """Resolve existing catalogue identities without any external API request."""
    with connect(settings) as c:
        c.execute(
            "INSERT INTO pongdang_data.place_detail_link "
            "(spot_id,place_id,match_method,linked_at) "
            "SELECT DISTINCT ON(p.spot_id) p.spot_id,p.id,'provider_id',now() "
            "FROM pongdang_data.collection_place p "
            "WHERE p.provider=ANY(%s) AND p.spot_id IS NOT NULL "
            "ORDER BY p.spot_id,p.id "
            "ON CONFLICT(spot_id) DO UPDATE SET place_id=EXCLUDED.place_id,"
            "match_method=EXCLUDED.match_method,linked_at=EXCLUDED.linked_at "
            "WHERE place_detail_link.place_id<>EXCLUDED.place_id "
            "OR place_detail_link.match_method<>'provider_id'",
            [providers(settings)],
        )
        # Re-evaluate DB matches as catalogue rows arrive. Recheck old matches
        # too: moved, renamed or now-ambiguous sources cannot remain attached.
        with c.cursor(row_factory=dict_row) as cursor:
            rows = cursor.execute(
                f"""
                SELECT s.id,s.name,s.lat,s.lng,p.id AS place_id,
                  p.latitude AS mapy,p.longitude AS mapx,
                  count(p.id) OVER(PARTITION BY s.id) AS matches
                FROM pongdang_data.spots_waterspot s
                LEFT JOIN pongdang_data.collection_place p
                  ON p.provider='TOURAPI_KOREAN'
                  AND p.category='12'
                  AND p.latitude BETWEEN s.lat-0.005 AND s.lat+0.005
                  AND p.longitude BETWEEN s.lng-0.01 AND s.lng+0.01
                  AND {name_sql("p.name")}={name_sql("s.name")}
                WHERE s.lat IS NOT NULL AND s.lng IS NOT NULL
                  AND (s.type IN ('beach','valley') OR EXISTS (
                    SELECT 1 FROM pongdang_data.collection_place source
                    WHERE source.spot_id=s.id AND source.provider='KAKAO_LOCAL'
                      AND (source.category LIKE '여행 > 관광,명소 > 해수욕장%%'
                        OR source.category LIKE '여행 > 관광,명소 > 계곡%%')))
                  AND NOT EXISTS (SELECT 1 FROM pongdang_data.collection_place own
                    WHERE own.spot_id=s.id AND own.provider=ANY(%s))
                ORDER BY s.id,p.id
                LIMIT 10000
                """,
                [list(SERVICES)],
            ).fetchall()
        seen = set()
        for row in rows:
            if row["id"] in seen:
                continue
            seen.add(row["id"])
            if row["matches"] != 1 or distance(row, row) > 500:
                c.execute(
                    "DELETE FROM pongdang_data.place_detail_link "
                    "WHERE spot_id=%s AND match_method='name_and_coordinates'",
                    [row["id"]],
                )
                continue
            c.execute(
                "INSERT INTO pongdang_data.place_detail_link "
                "(spot_id,place_id,match_method,linked_at) VALUES (%s,%s,"
                "'name_and_coordinates',now()) ON CONFLICT(spot_id) DO UPDATE "
                "SET place_id=EXCLUDED.place_id,linked_at=EXCLUDED.linked_at "
                "WHERE place_detail_link.match_method='name_and_coordinates' "
                "AND place_detail_link.place_id<>EXCLUDED.place_id",
                [row["id"], row["place_id"]],
            )


def needs_details(place, attempt, now):
    if not attempt:
        return True
    if (
        attempt["catalog_modified_at"] != place.get("source_modified_at")
        or attempt["content_type"] != place["category"]
    ):
        return True
    return bool(attempt["next_attempt_at"] and attempt["next_attempt_at"] <= now)


def due_places(settings, now, *, check_budget=True):
    service_case = (
        "CASE p.provider "
        + " ".join(
            f"WHEN '{provider}' THEN '{service}'"
            for provider, service in SERVICES.items()
        )
        + " END"
    )
    with connect(settings) as c, c.cursor(row_factory=dict_row) as cursor:
        return cursor.execute(
            f"""
            SELECT p.* FROM pongdang_data.collection_place p
            LEFT JOIN pongdang_data.place_detail_collection a ON a.place_id=p.id
            LEFT JOIN pongdang_data.place_detail_budget b
              ON b.service={service_case} AND b.day=%s
            WHERE p.provider=ANY(%s)
              AND (a.place_id IS NULL
                OR a.catalog_modified_at IS DISTINCT FROM p.source_modified_at
                OR a.content_type IS DISTINCT FROM p.category
                OR a.next_attempt_at<=%s)
              {"AND coalesce(b.calls,0)+3<=%s" if check_budget else ""}
            ORDER BY (p.provider='TOURAPI_KOREAN'
                AND p.name ~ '(해수욕장|해변|계곡)$') DESC,
              a.checked_at NULLS FIRST,p.id
            LIMIT %s
            """,
            [
                now.astimezone(KST).date(),
                providers(settings),
                now,
                *([settings.place_detail_daily_budget] if check_budget else []),
                settings.place_detail_batch_size,
            ],
        ).fetchall()


def reserve_request(settings, service, now):
    with connect(settings) as c:
        row = c.execute(
            """
            INSERT INTO pongdang_data.place_detail_budget(service,day,calls)
            SELECT %s,%s,1 WHERE %s>0
            ON CONFLICT(service,day) DO UPDATE
              SET calls=place_detail_budget.calls+1
              WHERE place_detail_budget.calls<%s
            RETURNING calls
            """,
            [
                service,
                now.astimezone(KST).date(),
                settings.place_detail_daily_budget,
                settings.place_detail_daily_budget,
            ],
        ).fetchone()
    if row is None:
        raise ProviderError("DETAIL_DAILY_BUDGET_EXHAUSTED")


def record_attempt(c, place, state, now, error=""):
    previous = c.execute(
        "SELECT consecutive_failures FROM pongdang_data.place_detail_collection "
        "WHERE place_id=%s FOR UPDATE",
        [place["id"]],
    ).fetchone()
    failed = state == "failed"
    failures = (previous[0] if previous else 0) + 1 if failed else 0
    retry = (
        now + timedelta(minutes=min(1440, 15 * 2 ** min(failures - 1, 7)))
        if failed
        else None
    )
    c.execute(
        """
        INSERT INTO pongdang_data.place_detail_collection
          (place_id,state,catalog_modified_at,content_type,checked_at,
           last_success_at,next_attempt_at,consecutive_failures,error_code)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)
        ON CONFLICT(place_id) DO UPDATE SET
          state=EXCLUDED.state,catalog_modified_at=EXCLUDED.catalog_modified_at,
          content_type=EXCLUDED.content_type,checked_at=EXCLUDED.checked_at,
          last_success_at=CASE WHEN EXCLUDED.state='failed'
            THEN place_detail_collection.last_success_at
            ELSE EXCLUDED.last_success_at END,
          next_attempt_at=EXCLUDED.next_attempt_at,
          consecutive_failures=EXCLUDED.consecutive_failures,
          error_code=EXCLUDED.error_code
        """,
        [
            place["id"],
            state,
            place.get("source_modified_at"),
            place["category"],
            now,
            None if failed else now,
            retry,
            failures,
            error,
        ],
    )


def collect_details(settings, *, provider=None, clock=None):
    clock = clock or (lambda: datetime.now(UTC))
    provider = provider or TourDetails(
        settings,
        reserve=lambda service: reserve_request(settings, service, clock()),
        clock=clock,
    )
    link_places(settings)
    received = inserted = failed = 0
    for place in due_places(settings, clock()):
        # Also protects direct CLI calls, without holding a network transaction.
        with connect(settings) as guard:
            guard.autocommit = True
            lock = f"place-detail/{place['provider']}/{place['source_id']}"
            if not guard.execute(
                "SELECT pg_try_advisory_lock(hashtext(%s))", [lock]
            ).fetchone()[0]:
                continue
            try:
                with guard.cursor(row_factory=dict_row) as cursor:
                    attempt = cursor.execute(
                        "SELECT * FROM pongdang_data.place_detail_collection "
                        "WHERE place_id=%s",
                        [place["id"]],
                    ).fetchone()
                if not needs_details(place, attempt, clock()):
                    continue
                received += 1
                if (
                    place["category"]
                    not in SUPPORTED_TYPES[language_group(place["provider"])]
                ):
                    with connect(settings) as c:
                        record_attempt(c, place, "unsupported", clock())
                    continue
                try:
                    batch = provider.fetch(place)
                    with connect(settings) as c:
                        inserted += store_batch(settings, batch, connection=c)
                        record_attempt(
                            c,
                            place,
                            batch.place_details[0].availability,
                            clock(),
                        )
                except ProviderError as exc:
                    failed += 1
                    with connect(settings) as c:
                        record_attempt(c, place, "failed", clock(), exc.code)
            finally:
                guard.execute("SELECT pg_advisory_unlock(hashtext(%s))", [lock])
    budget_wait = not due_places(settings, clock()) and bool(
        due_places(settings, clock(), check_budget=False)
    )
    return dict(
        received=received,
        inserted=inserted,
        state="failed"
        if failed and failed == received
        else "partial"
        if failed or budget_wait
        else "succeeded",
        error="DETAIL_COLLECTION_FAILED"
        if failed
        else "DETAIL_DAILY_BUDGET_EXHAUSTED"
        if budget_wait
        else "",
    )


def place_detail_jobs(settings):
    return [
        Job(
            "place_details",
            300,
            process=lambda: collect_details(settings),
            enabled=settings.place_detail_collection_enabled
            and settings.place_detail_daily_budget >= 3
            and bool(settings.data_go_kr_key.get_secret_value()),
            disabled_reason="DETAIL_COLLECTION_DISABLED_OR_KEY_MISSING",
        )
    ]
