"""One representative TourAPI photo per real water place, outside HTTP requests."""

import hashlib
import json
import math
import re
from datetime import UTC, datetime, timedelta
from urllib.parse import unquote

from psycopg.rows import dict_row

from app.attachments.files import download, file_path, image_url, save_file
from app.ingestion.http import Client, ProviderError
from app.ingestion.jobs import Job
from app.livecams.places import PLACE_SELECT
from app.schema import connect

BASE = "https://apis.data.go.kr/B551011/KorService2/"
PROVIDER = "TOURAPI_KOREAN"


def place_name(value):
    # Only spelling-equivalent suffixes; nearby parks/restaurants are not beaches.
    value = re.sub(r"\([^)]*\)", "", value)
    value = re.sub(r"\s+", "", value)
    return re.sub(r"해수욕장$", "해변", value)


def distance(a, b):
    try:
        lat1, lon1 = float(a["lat"]), float(a["lng"])
        lat2, lon2 = float(b["mapy"]), float(b["mapx"])
        if not all(math.isfinite(v) for v in (lat1, lon1, lat2, lon2)) or not (
            -90 <= lat2 <= 90 and -180 <= lon2 <= 180
        ):
            return math.inf
        p1, p2 = math.radians(lat1), math.radians(lat2)
        h = (
            math.sin((p2 - p1) / 2) ** 2
            + math.cos(p1) * math.cos(p2) * math.sin(math.radians(lon2 - lon1) / 2) ** 2
        )
        return 6371000 * 2 * math.asin(math.sqrt(min(1, max(0, h))))
    except TypeError, ValueError, KeyError:
        return math.inf


class TourPhotos:
    def __init__(self, settings, client=None):
        self.settings = settings
        self.client = client or Client(timeout=15)

    def rows(self, method, **params):
        data = self.client.get_json(
            BASE + method,
            {
                "serviceKey": unquote(self.settings.data_go_kr_key.get_secret_value()),
                "MobileOS": "ETC",
                "MobileApp": "Pongdang",
                "_type": "json",
                "pageNo": 1,
                **params,
            },
        )
        try:
            body = data["response"]["body"]
            items = body.get("items")
            if items not in (None, "") and not isinstance(items, dict):
                raise ValueError
            if not items and int(body.get("totalCount", 0)) != 0:
                raise ValueError
            rows = items.get("item", []) if isinstance(items, dict) else []
            if isinstance(rows, dict):
                rows = [rows]
            if (
                not isinstance(rows, list)
                or len(rows) > params["numOfRows"]
                or any(not isinstance(r, dict) for r in rows)
            ):
                raise ValueError
            return rows
        except KeyError, TypeError, ValueError, AttributeError:
            raise ProviderError("INVALID_PHOTO_RESPONSE") from None

    def find(self, place):
        """Use saved common information; only missing photos need a provider read."""
        source_id = place.get("source_id")
        method = place.get("match_method", "provider_id")
        if not source_id:
            return None, "no_match", method
        if not isinstance(source_id, str) or not re.fullmatch(
            r"[0-9]{1,20}", source_id
        ):
            raise ProviderError("INVALID_PHOTO_CONTENT_ID")
        url, license_code = place.get("photo_url"), place.get("photo_license")
        if not url:
            images = self.rows(
                "detailImage2", contentId=source_id, imageYN="Y", numOfRows=10
            )
            if any(str(r.get("contentid")) != source_id for r in images):
                raise ProviderError("PHOTO_ID_MISMATCH")
            allowed = [
                r
                for r in images
                if r.get("originimgurl") and r.get("cpyrhtDivCd") in {"Type1", "Type3"}
            ]
            if not allowed:
                return None, "restricted" if images else "no_image", method
            url, license_code = allowed[0]["originimgurl"], allowed[0]["cpyrhtDivCd"]
        if license_code not in {"Type1", "Type3"}:
            return None, "restricted", method
        modified = place.get("source_modified_at")
        if modified is not None:
            if not isinstance(modified, datetime) or modified.utcoffset() is None:
                raise ProviderError("INVALID_PHOTO_SOURCE_TIME")
            if modified > datetime.now(UTC):
                raise ProviderError("FUTURE_PHOTO_SOURCE_TIME")
        title = str(place.get("photo_name") or place["name"])[:200]
        return (
            dict(
                source_record_id=source_id,
                name=title,
                original_url=url,
                source_url=image_url(url),
                license=license_code,
                attribution=(
                    f"한국관광공사 TourAPI · {title} · 공공누리 {license_code[-1]}유형"
                ),
                source_modified_at=modified,
            ),
            "available",
            method,
        )


def due_places(settings):
    with connect(settings) as c:
        c.row_factory = dict_row
        return c.execute(
            f"""
            WITH places AS ({PLACE_SELECT})
            SELECT w.*, d.id AS source_detail_id,d.source_id,
              d.name AS photo_name,d.photo_url,d.photo_license,d.source_modified_at,
              l.match_method
            FROM places w
            JOIN pongdang_data.place_detail_link l ON l.spot_id=w.id
            JOIN pongdang_data.place_detail d ON d.place_id=l.place_id
              AND d.state='active' AND d.provider='TOURAPI_KOREAN'
            LEFT JOIN pongdang_data.attachment_collection a ON a.spot_id=w.id
            WHERE w.place_kind IN ('beach','valley')
              AND (a.spot_id IS NULL OR a.source_detail_id IS DISTINCT FROM d.id
                OR a.next_attempt_at<=now())
            ORDER BY a.next_attempt_at NULLS FIRST,w.id LIMIT %s
        """,
            [settings.photo_collection_batch_size],
        ).fetchall()


def record_attempt(
    c, settings, spot_id, state, now, error="", *, source_detail_id=None
):
    failed = state == "failed"
    row = c.execute(
        "SELECT consecutive_failures FROM pongdang_data.attachment_collection "
        "WHERE spot_id=%s",
        [spot_id],
    ).fetchone()
    failures = ((row[0] if row else 0) + 1) if failed else 0
    retry_at = (
        now + timedelta(minutes=min(1440, 30 * 2 ** min(failures - 1, 6)))
        if failed
        else None
    )
    c.execute(
        """
        INSERT INTO pongdang_data.attachment_collection
        (spot_id,state,checked_at,last_success_at,next_attempt_at,consecutive_failures,
         error_code,source_detail_id)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s) ON CONFLICT(spot_id) DO UPDATE SET
          state=EXCLUDED.state,checked_at=EXCLUDED.checked_at,
          last_success_at=CASE WHEN EXCLUDED.state='failed'
            THEN attachment_collection.last_success_at
            ELSE EXCLUDED.last_success_at END,
          next_attempt_at=EXCLUDED.next_attempt_at,
          consecutive_failures=EXCLUDED.consecutive_failures,error_code=EXCLUDED.error_code,
          source_detail_id=EXCLUDED.source_detail_id
    """,
        [
            spot_id,
            state,
            now,
            None if failed else now,
            retry_at,
            failures,
            error,
            source_detail_id,
        ],
    )


def link_attachment(c, settings, place, attachment_id, method, now):
    c.execute(
        """
        INSERT INTO pongdang_data.place_attachment
        (spot_id,attachment_id,match_method,linked_at)
        VALUES (%s,%s,%s,%s) ON CONFLICT(spot_id) DO UPDATE SET
        attachment_id=EXCLUDED.attachment_id,match_method=EXCLUDED.match_method,
        linked_at=EXCLUDED.linked_at
    """,
        [place["id"], attachment_id, method, now],
    )
    record_attempt(
        c,
        settings,
        place["id"],
        "available",
        now,
        source_detail_id=place.get("source_detail_id"),
    )


def reuse_attachment(settings, place, photo, method, now):
    """An unchanged provider photo can serve another place or detail revision."""
    with connect(settings) as c:
        c.execute(
            "SELECT pg_advisory_xact_lock(hashtext(%s))",
            ["photo/" + photo["source_record_id"]],
        )
        row = c.execute(
            "SELECT id,storage_key,byte_size,sha256 FROM pongdang_data.attachment "
            "WHERE provider=%s AND source_record_id=%s AND source_url=%s "
            "AND license=%s AND source_modified_at IS NOT DISTINCT FROM %s "
            "AND status='active' LIMIT 1",
            [
                PROVIDER,
                photo["source_record_id"],
                photo["source_url"],
                photo["license"],
                photo["source_modified_at"],
            ],
        ).fetchone()
        if not row:
            return False
        try:
            path = file_path(settings.attachment_root, row[1])
            if not path.is_file() or path.stat().st_size != row[2]:
                return False
            with path.open("rb") as stored:
                if hashlib.file_digest(stored, "sha256").hexdigest() != row[3]:
                    return False
        except OSError, ValueError:
            return False
        link_attachment(c, settings, place, row[0], method, now)
        return True


def saved_fallback(settings, place):
    """Several confirmed places may share one detailImage result, including empty."""
    with connect(settings) as c, c.cursor(row_factory=dict_row) as cursor:
        row = cursor.execute(
            "SELECT a.state,f.source_record_id,f.name,f.original_url,f.source_url,"
            "f.license,f.attribution,f.source_modified_at "
            "FROM pongdang_data.attachment_collection a "
            "LEFT JOIN pongdang_data.place_attachment p ON p.spot_id=a.spot_id "
            "LEFT JOIN pongdang_data.attachment f ON f.id=p.attachment_id "
            "AND f.status='active' AND f.provider='TOURAPI_KOREAN' "
            "WHERE a.source_detail_id=%s AND a.state<>'failed' "
            "AND (a.state<>'available' OR f.source_record_id=%s) "
            "ORDER BY a.checked_at DESC LIMIT 1",
            [place["source_detail_id"], place["source_id"]],
        ).fetchone()
    if row is None:
        return None
    state = row.pop("state")
    return row if state == "available" else None, state, place["match_method"]


def persist(settings, place, photo, method, data, media_type, extension, now):
    # Commit bytes before metadata: readers can never see a half-written file.
    # A DB failure may leave an unreferenced content hash, safe to reuse on retry.
    sha, key = save_file(settings.attachment_root, data, extension)
    evidence = hashlib.sha256(
        json.dumps(
            {**photo, "sha256": sha}, sort_keys=True, default=str, ensure_ascii=False
        ).encode()
    ).hexdigest()
    with connect(settings) as c:
        c.execute(
            "SELECT pg_advisory_xact_lock(hashtext(%s))",
            ["photo/" + photo["source_record_id"]],
        )
        old_ids = [
            r[0]
            for r in c.execute(
                """
            UPDATE pongdang_data.attachment SET status='superseded'
            WHERE provider=%s AND source_record_id=%s AND evidence_hash<>%s
              AND status='active' RETURNING id
        """,
                [PROVIDER, photo["source_record_id"], evidence],
            ).fetchall()
        ]
        previous = c.execute(
            "SELECT id FROM pongdang_data.attachment WHERE provider=%s "
            "AND source_record_id=%s AND evidence_hash=%s",
            [PROVIDER, photo["source_record_id"], evidence],
        ).fetchone()
        if previous:
            attachment_id = previous[0]
            c.execute(
                "UPDATE pongdang_data.attachment SET status='active' WHERE id=%s",
                [attachment_id],
            )
        else:
            attachment_id = c.execute(
                """
                INSERT INTO pongdang_data.attachment
                (provider,source_record_id,evidence_hash,sha256,storage_key,media_type,
                 byte_size,name,source_url,original_url,license,attribution,
                 source_modified_at,fetched_at,status)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'active') RETURNING id
            """,
                [
                    PROVIDER,
                    photo["source_record_id"],
                    evidence,
                    sha,
                    key,
                    media_type,
                    len(data),
                    photo["name"],
                    photo["source_url"],
                    photo["original_url"],
                    photo["license"],
                    photo["attribution"],
                    photo["source_modified_at"],
                    now,
                ],
            ).fetchone()[0]
        # All previously confirmed links to this provider record follow its revision.
        if old_ids:
            c.execute(
                "UPDATE pongdang_data.place_attachment "
                "SET attachment_id=%s,linked_at=%s "
                "WHERE attachment_id=ANY(%s)",
                [attachment_id, now, old_ids],
            )
        link_attachment(c, settings, place, attachment_id, method, now)
    return int(previous is None)


def collect_photos(settings, *, provider=None, fetch_image=download):
    saved_metadata = provider is None
    provider = provider or TourPhotos(settings)
    received = inserted = failed = available = 0
    for place in due_places(settings):
        received += 1
        now = datetime.now(UTC)
        try:
            cached = (
                saved_fallback(settings, place)
                if saved_metadata and not place["photo_url"]
                else None
            )
            photo, state, method = (
                cached if cached is not None else provider.find(place)
            )
            if photo:
                if reuse_attachment(settings, place, photo, method, now):
                    available += 1
                    continue
                data, mime, extension = fetch_image(
                    photo["source_url"], settings.photo_max_bytes
                )
                inserted += persist(
                    settings,
                    place,
                    photo,
                    method,
                    data,
                    mime,
                    extension,
                    datetime.now(UTC),
                )
                available += 1
            else:
                with connect(settings) as c:
                    c.execute(
                        "DELETE FROM pongdang_data.place_attachment WHERE spot_id=%s",
                        [place["id"]],
                    )
                    record_attempt(
                        c,
                        settings,
                        place["id"],
                        state,
                        now,
                        source_detail_id=place["source_detail_id"],
                    )
        except (ProviderError, OSError) as exc:
            failed += 1
            code = exc.code if isinstance(exc, ProviderError) else "PHOTO_STORAGE_ERROR"
            with connect(settings) as c:
                record_attempt(
                    c,
                    settings,
                    place["id"],
                    "failed",
                    now,
                    code,
                    source_detail_id=place["source_detail_id"],
                )
    return dict(
        received=received,
        inserted=inserted,
        state="failed"
        if received and failed == received
        else "partial"
        if failed
        else "succeeded"
        if available or not received
        else "no_data",
        error="PHOTO_COLLECTION_FAILED" if failed else "",
    )


def attachment_jobs(settings):
    return [
        Job(
            "place_photos",
            300,
            process=lambda: collect_photos(settings),
            enabled=settings.photo_collection_enabled
            and bool(settings.data_go_kr_key.get_secret_value()),
            disabled_reason="PHOTO_COLLECTION_DISABLED_OR_KEY_MISSING",
        )
    ]
