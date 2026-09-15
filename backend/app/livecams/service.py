"""Camera evidence registration is an explicit operator action, never GET/seed."""

import hashlib
import json
from datetime import UTC, datetime, timedelta
from typing import Literal
from urllib.error import HTTPError
from urllib.parse import urlsplit
from urllib.request import Request, build_opener

from fastapi import APIRouter, Query
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb
from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, model_validator

from app.data_reader import DataReader
from app.ingestion.http import NoRedirect


class Camera(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    camera_id: str = Field(min_length=1, max_length=100, pattern=r"^[a-zA-Z0-9_-]+$")
    spot_id: int = Field(gt=0)
    provider: str = Field(min_length=1, max_length=200)
    public_page: str = Field(max_length=1000)
    playback_url: str | None = Field(default=None, max_length=1000)
    media_kind: Literal["live", "recording", "image"]
    playback_method: Literal["external_page", "hls", "image", "iframe"]
    embed_allowed: bool
    usage_terms: str = Field(min_length=1, max_length=2000)
    terms_url: str = Field(max_length=1000)
    location_evidence: str = Field(min_length=1, max_length=1000)
    reviewed_at: AwareDatetime
    review_valid_until: AwareDatetime
    source_revision: str = Field(min_length=1, max_length=100)

    @model_validator(mode="after")
    def check(self):
        if self.review_valid_until <= self.reviewed_at:
            raise ValueError("Review validity must be nonempty")
        if self.reviewed_at > datetime.now(UTC):
            raise ValueError("Review cannot be in the future")
        for url in (self.public_page, self.playback_url, self.terms_url):
            if url:
                safe_url(url)
        if self.playback_method != "external_page" and (
            not self.playback_url or not self.embed_allowed
        ):
            raise ValueError("Embedded playback needs a reviewed URL and permission")
        return self


class CameraView(Camera):
    revision_id: str
    checked_at: AwareDatetime | None
    valid_until: AwareDatetime | None
    status: Literal["reachable", "offline", "unverifiable"]
    reason_code: str
    live_verified: Literal[False] = False


class CameraEnvelope(BaseModel):
    model_config = ConfigDict(extra="forbid")
    contract_version: Literal["livecams.v1"]
    rows: list[CameraView] = Field(max_length=100)
    page: int = Field(ge=1, le=1000)
    page_size: int = Field(ge=1, le=100)
    has_more: bool
    as_of: AwareDatetime
    status: Literal["available", "no_data"]
    reason_codes: list[str] = Field(max_length=100)


def safe_url(url, allowed_hosts=None):
    p = urlsplit(url)
    # Deliberately exclude signed URLs, arbitrary query tokens and credentials.
    if (
        p.scheme != "https"
        or not p.hostname
        or p.username
        or p.password
        or p.port not in (None, 443)
        or p.query
        or p.fragment
        or p.hostname in {"localhost", "127.0.0.1", "::1"}
        or not p.hostname.endswith((".go.kr", ".or.kr"))
    ):
        raise ValueError("Only credential-free official public HTTPS URLs are allowed")
    if allowed_hosts is not None and p.hostname not in allowed_hosts:
        raise ValueError("Official host is not approved for scheduled checks")
    return p


def migrate_livecams(c):
    c.execute("""CREATE TABLE IF NOT EXISTS pongdang_data.livecam_revision (
        revision_id text PRIMARY KEY, camera_id text NOT NULL,
        spot_id bigint NOT NULL REFERENCES pongdang_data.spots_waterspot(id),
        available_at timestamptz NOT NULL DEFAULT clock_timestamp(),
        payload jsonb NOT NULL, UNIQUE(camera_id, revision_id))""")
    c.execute("""CREATE TABLE IF NOT EXISTS pongdang_data.livecam_check (
        revision_id text NOT NULL REFERENCES pongdang_data.livecam_revision,
        checked_at timestamptz NOT NULL, valid_until timestamptz NOT NULL,
        status text NOT NULL, reason_code text NOT NULL,
        PRIMARY KEY(revision_id, checked_at))""")
    c.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS livecam_source_revision_unique "
        "ON pongdang_data.livecam_revision(camera_id, (payload->>'source_revision'))"
    )
    for table in ("livecam_revision", "livecam_check"):
        c.execute(
            f"CREATE OR REPLACE TRIGGER {table}_immutable BEFORE UPDATE OR DELETE "
            f"ON pongdang_data.{table} FOR EACH ROW EXECUTE FUNCTION "
            "pongdang_data.water_index_immutable()"
        )


def register_camera(settings, camera):
    from app.schema import connect

    hosts = {h.strip() for h in settings.livecam_allowed_hosts.split(",") if h.strip()}
    for url in (camera.public_page, camera.playback_url, camera.terms_url):
        if url:
            safe_url(url, hosts)
    payload = camera.model_dump(mode="json")
    revision = hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest()
    with connect(settings) as c:
        c.execute("SELECT pg_advisory_xact_lock(hashtext(%s))", [camera.camera_id])
        old = c.execute(
            "SELECT payload FROM pongdang_data.livecam_revision "
            "WHERE camera_id=%s AND payload->>'source_revision'=%s",
            [camera.camera_id, camera.source_revision],
        ).fetchone()
        if old and old[0] != payload:
            raise ValueError("Conflicting camera source revision")
        c.execute(
            "INSERT INTO pongdang_data.livecam_revision "
            "(revision_id,camera_id,spot_id,payload) VALUES (%s,%s,%s,%s) "
            "ON CONFLICT DO NOTHING",
            [revision, camera.camera_id, camera.spot_id, Jsonb(payload)],
        )
    return revision


def check_camera(camera, hosts, opener=None):
    """Reachability is not proof that an HLS stream is live or its picture current."""
    try:
        url = camera.playback_url or camera.public_page
        safe_url(url, hosts)
        request = Request(
            url, headers={"User-Agent": "Pongdang-camera-check/1"}, method="HEAD"
        )
        with (opener or build_opener(NoRedirect)).open(request, timeout=5) as response:
            if 200 <= response.status < 300:
                return "reachable", "media_liveness_not_verified"
            return "offline", "http_unavailable"
    except HTTPError as exc:
        if exc.code in {404, 410} or 500 <= exc.code < 600:
            return "offline", "http_unavailable"
        return "unverifiable", "http_access_or_redirect_unverified"
    except Exception:
        return "unverifiable", "check_failed"


def run_checks(settings, now=None, checker=check_camera):
    from app.schema import connect

    now = now or datetime.now(UTC)
    hosts = {h.strip() for h in settings.livecam_allowed_hosts.split(",") if h.strip()}
    with connect(settings) as c:
        c.row_factory = dict_row
        rows = c.execute(
            "WITH latest AS (SELECT DISTINCT ON(camera_id) camera_id,revision_id,"
            "payload FROM pongdang_data.livecam_revision WHERE available_at<=%s "
            "ORDER BY camera_id,available_at DESC,revision_id DESC) "
            "SELECT r.revision_id,r.payload FROM latest r LEFT JOIN LATERAL "
            "(SELECT max(checked_at) AS last_checked_at FROM "
            "pongdang_data.livecam_check k WHERE k.revision_id=r.revision_id) "
            "k ON true "
            "ORDER BY k.last_checked_at ASC NULLS FIRST,r.camera_id LIMIT 100",
            [now],
        ).fetchall()
    failed, inserted = 0, 0
    for row in rows:
        camera = Camera.model_validate(row["payload"])
        if camera.review_valid_until <= now:
            status, reason = "unverifiable", "review_expired"
        else:
            status, reason = checker(camera, hosts)
        failed += status == "unverifiable"
        with connect(settings) as c:
            added = c.execute(
                "INSERT INTO pongdang_data.livecam_check VALUES(%s,%s,%s,%s,%s) "
                "ON CONFLICT DO NOTHING RETURNING 1",
                [
                    row["revision_id"],
                    now,
                    min(now + timedelta(minutes=10), camera.review_valid_until),
                    status,
                    reason,
                ],
            ).fetchone()
            inserted += bool(added)
    return dict(
        received=len(rows),
        inserted=inserted,
        state="failed" if failed else "succeeded" if rows else "no_data",
        error="CAMERA_CHECK_FAILED" if failed else "",
    )


async def read_cameras(
    reader, *, spot_id=None, media_kind=None, page=1, page_size=25, now=None
):
    """Public camera projection shared by the API and bounded AI reads."""
    now = now or datetime.now(UTC)
    async with reader.connection() as c:
        rows = await (
            await c.execute(
                """WITH latest AS (
            SELECT DISTINCT ON(camera_id) * FROM pongdang_data.livecam_revision
            ORDER BY camera_id,available_at DESC,revision_id DESC)
            SELECT r.revision_id,r.payload,k.checked_at,k.valid_until,
            k.status,k.reason_code FROM latest r LEFT JOIN LATERAL (
            SELECT * FROM pongdang_data.livecam_check
            WHERE revision_id=r.revision_id
            ORDER BY checked_at DESC LIMIT 1) k ON true
            WHERE (%s::bigint IS NULL OR r.spot_id=%s)
            AND (%s::text IS NULL OR r.payload->>'media_kind'=%s)
            ORDER BY r.camera_id LIMIT %s OFFSET %s""",
                [
                    spot_id,
                    spot_id,
                    media_kind,
                    media_kind,
                    page_size + 1,
                    (page - 1) * page_size,
                ],
            )
        ).fetchall()
    more = len(rows) > page_size
    for row in rows[:page_size]:
        camera = Camera.model_validate(row.pop("payload"))
        row.update(camera.model_dump(mode="json"))
        if (
            not row["valid_until"]
            or row["valid_until"] <= now
            or camera.review_valid_until <= now
        ):
            row["status"] = "unverifiable"
            row["reason_code"] = "check_missing_or_expired"
        row["live_verified"] = False
    return dict(
        contract_version="livecams.v1",
        rows=rows[:page_size],
        page=page,
        page_size=page_size,
        has_more=more,
        as_of=now,
        status="available" if rows else "no_data",
        reason_codes=[] if rows else ["no_verified_camera_data"],
    )


def create_livecam_router(settings):
    router = APIRouter(prefix="/api/data/livecams", tags=["livecams"])
    reader = DataReader(settings)

    @router.get("", response_model=CameraEnvelope)
    async def cameras(
        spot_id: int | None = Query(default=None, gt=0),
        media_kind: Literal["live", "recording", "image"] | None = None,
        page: int = Query(default=1, ge=1, le=1000),
        page_size: int = Query(default=25, ge=1, le=100),
    ):
        return await read_cameras(
            reader,
            spot_id=spot_id,
            media_kind=media_kind,
            page=page,
            page_size=page_size,
        )

    return router
