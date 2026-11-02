#!/usr/bin/env python3
"""Export bounded, public, read-only API responses for Pongdang's archive UI.

This is an operational export, not a database test or a new data collector.
It never follows redirects, reads credentials, calls providers, or uses a write
endpoint. Original response values and evidence timestamps remain unchanged.
"""

from __future__ import annotations

import argparse
import concurrent.futures
import hashlib
import json
import re
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import UTC, datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

# The archive preserves the Korean public presentation; live mode retains the
# full multilingual catalog in its independent database backup.
LOCALES = ("ko",)
ACTIVITIES = ("swim", "surf", "relax", "walk", "onsen", "mudflat", "rafting")
READ_PATHS = frozenset(
    {
        "regions",
        "places",
        "places/nearby",
        "attachments",
        "place-details",
        "catalog",
        "summary",
        "water-index/default-place",
        "water-index/activities",
        "water-index/conditions",
        "water-index/conditions/summary",
        "water-index/conditions/series",
        "water-index/recommendation",
        "water-forecast/forecasts",
        "water-temperature",
        "water-twin",
        "tides/events",
        "quality/grade",
        "travel/keywords",
    }
)
MAX_JSON_BYTES = 8 * 1024 * 1024
MAX_IMAGE_BYTES = 8 * 1024 * 1024
IMAGE_TYPES = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
}


def canonical_path(value: str) -> str:
    parsed = urllib.parse.urlsplit(value)
    if parsed.scheme or parsed.netloc or parsed.fragment or value.startswith("/"):
        raise ValueError("Expected a relative API path")
    path = parsed.path
    if path not in READ_PATHS and not re.fullmatch(r"datasets/[a-z][a-z0-9-]*", path):
        raise ValueError("Endpoint is not in the public read allowlist")
    pairs = urllib.parse.parse_qsl(parsed.query, keep_blank_values=True)
    if len({k for k, _ in pairs}) != len(pairs):
        raise ValueError("Duplicate query parameter")
    normalized = []
    for key, val in pairs:
        if key == "spot_ids":
            if not re.fullmatch(r"[1-9][0-9]*(?:,[1-9][0-9]*)*", val):
                raise ValueError("Invalid place IDs")
            val = ",".join(str(i) for i in sorted(set(map(int, val.split(",")))))
        normalized.append((key, val))
    query = urllib.parse.urlencode(sorted(normalized))
    return path + ("?" + query if query else "")


def api_path(path: str, **query: object) -> str:
    return canonical_path(path + ("?" + urllib.parse.urlencode(query) if query else ""))


def chunks(values: list[int], size: int):
    for start in range(0, len(values), size):
        yield values[start : start + size]


def validate_base(value: str) -> str:
    parsed = urllib.parse.urlsplit(value)
    if (
        parsed.scheme != "http"
        or parsed.hostname not in {"127.0.0.1", "localhost", "::1"}
        or parsed.username
        or parsed.password
        or parsed.query
        or parsed.fragment
        or parsed.path.rstrip("/") != "/api/data"
    ):
        raise ValueError(
            "Only the existing loopback HTTP /api/data endpoint is allowed"
        )
    return value.rstrip("/") + "/"


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def read_http(url: str, limit: int, timeout: float):
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
    request = urllib.request.Request(
        url, headers={"Accept": "application/json, image/*"}, method="GET"
    )
    with opener.open(request, timeout=timeout) as response:
        payload = response.read(limit + 1)
        if len(payload) > limit:
            raise ValueError("Response exceeds export size limit")
        return payload, response.headers.get_content_type()


def atomic_json(path: Path, value: object) -> None:
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(value, ensure_ascii=False, separators=(",", ":")) + "\n")
    tmp.replace(path)


class Exporter:
    def __init__(
        self,
        output: Path,
        base: str,
        source_release: str,
        timeout: float = 30,
        max_bytes: int = 128 * 1024 * 1024,
    ):
        self.output = output
        self.base = validate_base(base)
        self.timeout = timeout
        self.max_bytes = max_bytes
        self.lock = threading.Lock()
        output.mkdir(parents=True, exist_ok=True)
        (output / "responses").mkdir(exist_ok=True)
        (output / "images").mkdir(exist_ok=True)
        partial = output / "manifest.partial.json"
        if (output / "manifest.json").exists():
            raise ValueError(
                "Completed archive already exists; choose a new output directory"
            )
        if partial.exists():
            self.manifest = json.loads(partial.read_text())
            if (
                self.manifest.get("source_release") != source_release
                or self.manifest.get("version") != 1
            ):
                raise ValueError("Cannot resume another release or manifest version")
        else:
            self.manifest = {
                "version": 1,
                "captured_at": datetime.now(UTC).isoformat(),
                "source_release": source_release,
                "requests": {},
                "attachments": {},
                "errors": {},
                "coverage": {},
            }
        self.bytes = sum(
            p.stat().st_size
            for name in ("responses", "images")
            for p in (output / name).iterdir()
            if p.is_file()
        )
        self.completed = 0
        self.started = time.monotonic()
        self.save()

    def save(self):
        atomic_json(self.output / "manifest.partial.json", self.manifest)

    def _store(self, relative: str, payload: bytes):
        if self.bytes + len(payload) > self.max_bytes:
            raise ValueError("Archive exceeds total size limit")
        path = self.output / relative
        path.write_bytes(payload)
        self.bytes += len(payload)

    def get(self, path: str, *, required: bool = False):
        key = canonical_path(path)
        with self.lock:
            old = self.manifest["requests"].get(key)
        if old:
            return json.loads((self.output / old).read_bytes())
        try:
            payload, media_type = read_http(
                self.base + key, MAX_JSON_BYTES, self.timeout
            )
            if media_type != "application/json":
                raise ValueError("Expected an API JSON response")
            value = json.loads(payload)
            digest = hashlib.sha256(payload).hexdigest()
            relative = f"responses/{digest}.json"
            with self.lock:
                if not (self.output / relative).exists():
                    self._store(relative, payload)
                self.manifest["requests"][key] = relative
                self.manifest["errors"].pop(key, None)
                self.completed += 1
                self.save()
                if self.completed % 25 == 0:
                    print(
                        json.dumps(
                            {
                                "responses": len(self.manifest["requests"]),
                                "errors": len(self.manifest["errors"]),
                                "bytes": self.bytes,
                                "elapsed_seconds": round(
                                    time.monotonic() - self.started, 1
                                ),
                            }
                        ),
                        flush=True,
                    )
            return value
        except (OSError, ValueError, TimeoutError) as error:
            status = error.code if isinstance(error, urllib.error.HTTPError) else 0
            # Never save a raw server error body: it is not public screen data.
            with self.lock:
                self.manifest["errors"][key] = {
                    "status": status,
                    "detail": type(error).__name__,
                }
                self.save()
            if required:
                raise RuntimeError(
                    f"Required archive request failed: {key} ({status})"
                ) from None
            return None

    def batch(self, paths):
        # Two in-flight reads bound the pressure on the production database.
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
            return list(pool.map(self.get, dict.fromkeys(paths)))

    def photo(self, attachment_id: int):
        key = str(attachment_id)
        if key in self.manifest["attachments"]:
            return
        try:
            payload, media = read_http(
                self.base + f"attachments/{attachment_id}/file",
                MAX_IMAGE_BYTES,
                self.timeout,
            )
            if media not in IMAGE_TYPES:
                raise ValueError("Only already stored raster images are exported")
            relative = f"images/{attachment_id}.{IMAGE_TYPES[media]}"
            with self.lock:
                self._store(relative, payload)
                self.manifest["attachments"][key] = relative
                self.manifest["errors"].pop(f"attachments/{attachment_id}/file", None)
                self.save()
                if len(self.manifest["attachments"]) % 25 == 0:
                    print(
                        json.dumps(
                            {
                                "photos": len(self.manifest["attachments"]),
                                "elapsed_seconds": round(
                                    time.monotonic() - self.started, 1
                                ),
                            }
                        ),
                        flush=True,
                    )
        except (OSError, ValueError, TimeoutError) as error:
            with self.lock:
                self.manifest["errors"][f"attachments/{attachment_id}/file"] = {
                    "status": error.code
                    if isinstance(error, urllib.error.HTTPError)
                    else 0,
                    "detail": type(error).__name__,
                }
                self.save()

    def export(self, max_places: int, max_pages: int, include_tables: bool = True):
        self.get("regions", required=True)
        default = self.get("water-index/default-place", required=True)
        default_id = (default.get("place") or {}).get("id")
        if not isinstance(default_id, int) or default_id <= 0:
            raise RuntimeError(
                "A real default place is required for archive publication"
            )
        catalog = self.get("catalog", required=True)
        self.get("water-index/activities")
        self.get("travel/keywords")
        all_places = {}
        for locale in LOCALES:
            collected = []
            total = None
            for page in range(1, max_pages + 1):
                result = self.get(
                    api_path(
                        "places",
                        province="gangwon",
                        locale=locale,
                        page=page,
                        page_size=100,
                    ),
                    required=locale == "ko",
                )
                if result is None:
                    break
                collected.extend(result["rows"])
                total = result["total"]
                if not result["has_more"]:
                    break
            all_places[locale] = collected
            self.manifest["coverage"]["places:" + locale] = {
                "stored": len(collected),
                "source_total": total,
                "complete": total == len(collected),
            }
        ids = list(
            dict.fromkeys(
                [default_id, *(p["id"] for rows in all_places.values() for p in rows)]
            )
        )
        if len(ids) > max_places:
            raise RuntimeError(
                f"{len(ids)} places exceeds --max-places={max_places}; explicitly review the export bound"
            )
        self.manifest["coverage"]["place_ids"] = ids
        self.manifest["coverage"]["default_place_id"] = default_id
        photos = set()
        for group in chunks(ids, 100):
            selected = ",".join(map(str, group))
            for locale in LOCALES:
                self.get(api_path("place-details", spot_ids=selected, locale=locale))
            attachments = self.get(api_path("attachments", spot_ids=selected))
            if attachments:
                photos.update(row["id"] for row in attachments["items"])
        for attachment_id in sorted(photos):
            self.photo(attachment_id)

        # A recommendation includes its five real activity condition envelopes;
        # the archive adapter reuses these rather than making duplicate reads.
        self.batch(
            api_path("water-index/recommendation", spot_id=spot, mode=mode)
            for spot in ids
            for mode in ("observation", "forecast")
        )
        self.batch(
            api_path(
                "water-index/conditions/summary",
                spot_ids=",".join(map(str, group)),
                activity=activity,
                mode=mode,
            )
            for group in chunks(ids, 25)
            for activity in ACTIVITIES
            for mode in ("observation", "forecast")
        )
        self.batch(
            path
            for spot in ids
            for path in (
                api_path("quality/grade", spot_id=spot),
                api_path(
                    "water-temperature", spot_id=spot, mode="observation", page_size=1
                ),
                api_path("places/nearby", spot_id=spot, limit=2),
            )
        )

        captured = datetime.fromisoformat(self.manifest["captured_at"])
        day = captured.astimezone(ZoneInfo("Asia/Seoul")).replace(
            hour=0, minute=0, second=0, microsecond=0
        )
        targets = sorted(
            {day.replace(hour=h).isoformat() for h in (9, 12, 15, 18)}
            | {(day + timedelta(days=i, hours=12)).isoformat() for i in range(7)}
        )
        # The default screen retains its seven-day chart. Other places retain
        # current source envelopes; unsupported dates are not synthesized.
        self.batch(
            api_path(
                "water-index/conditions/series",
                spot_id=default_id,
                activity=a,
                targets=",".join(targets),
            )
            for a in ACTIVITIES
        )
        self.batch(
            api_path(
                "water-index/conditions", spot_id=default_id, activity=a, mode=mode
            )
            for a in ACTIVITIES
            for mode in ("observation", "forecast")
        )
        self.get(
            api_path(
                "water-twin",
                spot_id=default_id,
                activity="swim",
                mode="observation",
                page_size=100,
            )
        )
        period = {
            "spot_id": default_id,
            "activity": "swim",
            "mode": "forecast",
            "from": captured.isoformat(),
            "until": (captured + timedelta(days=2)).isoformat(),
            "reference_at": captured.isoformat(),
            "page_size": 100,
        }
        self.get(api_path("tides/events", **period))
        self.batch(
            api_path(
                "water-forecast/forecasts",
                spot_id=default_id,
                activity=a,
                mode="forecast",
                **{
                    "from": (day + timedelta(days=i)).isoformat(),
                    "until": (day + timedelta(days=i + 1)).isoformat(),
                    "page": 1,
                    "page_size": 100,
                },
            )
            for a in ACTIVITIES
            for i in range(7)
        )
        if include_tables:
            self.get("summary")
            self.batch(
                api_path("datasets/" + dataset["key"], page=1, page_size=100)
                for dataset in catalog
            )
            self.manifest["coverage"]["datasets"] = (
                "First 100 API-allowlisted rows per dataset; source totals are retained"
            )
        self.manifest["completed_at"] = datetime.now(UTC).isoformat()
        self.manifest["bytes"] = self.bytes
        self.manifest["coverage"]["forecast_series_place_ids"] = [default_id]
        self.save()
        atomic_json(self.output / "manifest.json", self.manifest)
        print(
            json.dumps(
                {
                    "complete": True,
                    "place_count": len(ids),
                    "responses": len(self.manifest["requests"]),
                    "photos": len(self.manifest["attachments"]),
                    "errors": len(self.manifest["errors"]),
                    "bytes": self.bytes,
                }
            ),
            flush=True,
        )


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--source-release", required=True)
    parser.add_argument("--base", default="http://127.0.0.1:5188/api/data/")
    parser.add_argument("--timeout", type=float, default=30)
    parser.add_argument("--max-places", type=int, default=500)
    parser.add_argument("--max-pages", type=int, default=5)
    parser.add_argument("--max-mib", type=int, default=128)
    parser.add_argument("--without-tables", action="store_true")
    args = parser.parse_args()
    if not re.fullmatch(r"[0-9a-f]{40}", args.source_release):
        parser.error("source release must be a full commit SHA")
    if (
        not 1 <= args.max_places <= 2000
        or not 1 <= args.max_pages <= 20
        or not 1 <= args.max_mib <= 512
    ):
        parser.error("Export bounds are outside supported limits")
    Exporter(
        args.output,
        args.base,
        args.source_release,
        args.timeout,
        args.max_mib * 1024 * 1024,
    ).export(args.max_places, args.max_pages, not args.without_tables)


if __name__ == "__main__":
    main()
