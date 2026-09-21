"""Persistent Windy catalog with one representative thumbnail per camera."""

import argparse
import math
import time
from datetime import UTC, datetime, timedelta

from fastapi import HTTPException
from psycopg.types.json import Jsonb
from pydantic import AwareDatetime, BaseModel, Field

from app import schema
from app.config import Settings
from app.ingestion.webcams import WebcamMetadata
from app.livecams.thumbnails import ThumbnailStore
from app.livecams.windy import WindyError


class CatalogSnapshot(BaseModel):
    rows: list[WebcamMetadata] = Field(max_length=125)
    fetched_at: AwareDatetime
    truncated: bool
    # Import-only URLs: excluded from serialized catalog records and responses.
    thumbnail_sources: dict[str, str] = Field(
        default_factory=dict, exclude=True, repr=False
    )


def migrate_windy_catalog(connection):
    """Add metadata revisions and durable request admission; never fetch or seed."""
    connection.execute(
        "CREATE TABLE IF NOT EXISTS pongdang_data.windy_catalog_revision ("
        "id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, "
        "fetched_at timestamptz NOT NULL, truncated boolean NOT NULL, "
        "cameras jsonb NOT NULL CHECK (jsonb_typeof(cameras)='array' "
        "AND jsonb_array_length(cameras)<=125), "
        "state text NOT NULL CHECK (state IN ('recorded','superseded')))"
    )
    connection.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS windy_catalog_current "
        "ON pongdang_data.windy_catalog_revision (state) WHERE state='recorded'"
    )
    connection.execute(
        "CREATE TABLE IF NOT EXISTS pongdang_data.windy_api_budget ("
        "id integer PRIMARY KEY CHECK (id=1), day date NOT NULL, "
        "calls integer NOT NULL CHECK (calls>=0), last_call_at timestamptz, "
        "blocked_until timestamptz, blocked_reason text)"
    )


class CatalogStore:
    def __init__(self, settings, *, clock=time.time, sleep=time.sleep, thumbnails=None):
        self.settings, self.clock, self.sleep = settings, clock, sleep
        self.thumbnails = thumbnails or ThumbnailStore(settings, clock=clock)

    @staticmethod
    def _read(connection):
        row = connection.execute(
            "SELECT cameras,fetched_at,truncated "
            "FROM pongdang_data.windy_catalog_revision "
            "WHERE state='recorded' LIMIT 1"
        ).fetchone()
        if row is None:
            return None
        return CatalogSnapshot(
            rows=row[0], fetched_at=row[1].astimezone(UTC), truncated=row[2]
        )

    def read(self):
        with schema.connect(self.settings) as connection:
            connection.execute("SET TRANSACTION READ ONLY")
            return self._read(connection)

    def get_or_fetch(self, fetch, *, refresh=False):
        if not refresh:
            stored = self.read()
            if stored is not None:
                return stored, True
        # A session lock spans provider requests and the atomic write. Reservations
        # commit before network I/O, so crashes cannot refund consumed API calls.
        with schema.connect(self.settings) as connection:
            connection.autocommit = True
            acquired = connection.execute(
                "SELECT pg_try_advisory_lock(hashtext('pongdang-windy-catalog'))"
            ).fetchone()[0]
            if not acquired:
                raise HTTPException(
                    429, "WEBCAM_REQUEST_IN_PROGRESS", {"Retry-After": "2"}
                )
            try:
                if not refresh:
                    stored = self._read(connection)
                    if stored is not None:
                        return stored, True
                try:
                    snapshot = fetch()
                except WindyError as exc:
                    self.record_failure(exc)
                    raise
                self.thumbnails.capture(snapshot.rows, snapshot.thumbnail_sources)
                with connection.transaction():
                    connection.execute(
                        "UPDATE pongdang_data.windy_catalog_revision "
                        "SET state='superseded' WHERE state='recorded'"
                    )
                    connection.execute(
                        "INSERT INTO pongdang_data.windy_catalog_revision "
                        "(fetched_at,truncated,cameras,state) "
                        "VALUES (%s,%s,%s,'recorded')",
                        [
                            snapshot.fetched_at,
                            snapshot.truncated,
                            Jsonb(
                                [row.model_dump(mode="json") for row in snapshot.rows]
                            ),
                        ],
                    )
                return snapshot, False
            finally:
                connection.execute(
                    "SELECT pg_advisory_unlock(hashtext('pongdang-windy-catalog'))"
                )

    def reserve(self):
        """One shared UTC daily budget and pacing for catalog and spot lookups."""
        now = datetime.fromtimestamp(self.clock(), UTC)
        with schema.connect(self.settings) as connection:
            connection.execute(
                "INSERT INTO pongdang_data.windy_api_budget (id,day,calls) "
                "VALUES (1,%s,0) ON CONFLICT (id) DO NOTHING",
                [now.date()],
            )
            day, calls, last_call, blocked_until, reason = connection.execute(
                "SELECT day,calls,last_call_at,blocked_until,blocked_reason "
                "FROM pongdang_data.windy_api_budget WHERE id=1 FOR UPDATE"
            ).fetchone()
            if blocked_until and now < blocked_until:
                raise WindyError(
                    "WINDY_BACKOFF",
                    math.ceil((blocked_until - now).total_seconds()),
                    cause_code=reason,
                )
            calls = calls if day == now.date() else 0
            if calls >= self.settings.windy_webcams_daily_budget:
                midnight = datetime.combine(
                    now.date() + timedelta(days=1), datetime.min.time(), UTC
                )
                raise WindyError(
                    "WINDY_DAILY_BUDGET", math.ceil((midnight - now).total_seconds())
                )
            if last_call:
                self.sleep(max(0, 2 - (now - last_call).total_seconds()))
            reserved_at = datetime.fromtimestamp(self.clock(), UTC)
            # Pacing can cross UTC midnight.
            calls = calls if reserved_at.date() == now.date() else 0
            connection.execute(
                "UPDATE pongdang_data.windy_api_budget "
                "SET day=%s,calls=%s,last_call_at=%s WHERE id=1",
                [reserved_at.date(), calls + 1, reserved_at],
            )

    def record_failure(self, error):
        if error.code in {
            "WINDY_BACKOFF",
            "WINDY_DAILY_BUDGET",
            "WINDY_NOT_CONFIGURED",
            "WINDY_INVALID_KEY_FORMAT",
        }:
            return
        until = datetime.fromtimestamp(self.clock() + error.retry_seconds, UTC)
        with schema.connect(self.settings) as connection:
            connection.execute(
                "UPDATE pongdang_data.windy_api_budget "
                "SET blocked_until=%s,blocked_reason=%s "
                "WHERE id=1 AND (blocked_until IS NULL OR blocked_until<%s)",
                [until, error.code, until],
            )


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--initialize", action="store_true", help="Import only if absent")
    mode.add_argument(
        "--refresh", action="store_true", help="Explicitly replace metadata"
    )
    args = parser.parse_args()
    # Import after module setup: preview also uses this store.
    from app.livecams.preview import PreviewService

    try:
        result = PreviewService(Settings()).query(refresh=args.refresh)
    except WindyError as exc:
        raise SystemExit(
            f"Webcam catalog unchanged: {exc.code}; retry after {exc.retry_seconds}s"
        ) from None
    except HTTPException as exc:
        raise SystemExit(f"Webcam catalog unchanged: {exc.detail}") from None
    print(
        f"Webcam catalog {'reused' if result.cached else 'stored'}: "
        f"{result.total} cameras; fetched_at={result.fetched_at.isoformat()}"
    )


if __name__ == "__main__":
    main()
