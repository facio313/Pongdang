"""Opt-in official reads; all persistence is restricted to disposable pongdang_test.

Run from backend with explicit test-only POSTGRES_* and --live. Server provider
keys may be loaded from the project's ignored .env. No notifications are sent.
"""

import argparse
import json
from datetime import UTC, datetime, timedelta
from pathlib import Path

from fastapi.testclient import TestClient

from app.config import Settings
from app.feature_jobs import feature_jobs
from app.ingestion.marine import marine_jobs
from app.ingestion.storage import store_batch
from app.ingestion.weather import weather_jobs
from app.ingestion.worker import run_due
from app.main import create_app
from app.schema import connect, initialize


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--live", action="store_true", required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    settings = Settings()
    if settings.postgres_db != "pongdang_test":
        raise SystemExit("Requires explicitly configured disposable pongdang_test")
    if settings.notifications_delivery_enabled:
        raise SystemExit("Disable notification delivery before isolated verification")
    initialize(settings)
    report = {
        "started_at": datetime.now(UTC).isoformat(),
        "database": "pongdang_test",
        "official_fetches": [],
        "jobs": [],
        "http": [],
    }
    jobs = {j.name: j for j in weather_jobs(settings) + marine_jobs(settings)}
    selected = ["kma_short_forecast", "khoa_water_temperature", "khoa_tide_extrema"]
    for name in selected:
        job = jobs[name]
        if not job.enabled:
            result = {"job": name, "status": "not_configured"}
        else:
            try:
                batch = job.fetch()
                inserted = store_batch(settings, batch)
                result = {
                    "job": name,
                    "status": "received" if batch.readings else "no_data",
                    "readings": len(batch.readings),
                    "inserted": inserted,
                    "fetched_at": batch.fetched_at.isoformat(),
                }
            except Exception as exc:
                code = getattr(exc, "code", "FETCH_OR_STORAGE_ERROR")
                result = {"job": name, "status": "failed", "error_code": code}
        report["official_fetches"].append(result)
        print(json.dumps(result), flush=True)
    report["jobs"] = run_due(settings, feature_jobs(settings), force=True)
    with connect(settings) as c:
        c.execute("SET TRANSACTION READ ONLY")
        spots = c.execute(
            "SELECT provider,spot_id FROM pongdang_data.collection_station "
            "ORDER BY provider,id LIMIT 100"
        ).fetchall()
    now = datetime.now(UTC)
    with TestClient(create_app(settings)) as client:
        for provider, spot_id in spots:
            common = {
                "spot_id": spot_id,
                "activity": "swim",
                "from": (now - timedelta(hours=1)).isoformat(),
                "until": (now + timedelta(days=3)).isoformat(),
                "page_size": 100,
            }
            paths = [
                ("/api/data/water-temperature", {"spot_id": spot_id}),
                ("/api/data/water-forecast/forecasts", common),
                (
                    "/api/data/water-index/assessments",
                    {**common, "mode": "forecast", "profile_id": "general"},
                ),
                ("/api/data/tides/events", {**common, "activity": "mudflat"}),
                ("/api/data/quality/comparisons", {"spot_id": spot_id}),
                ("/api/data/ai/explanation", {"spot_id": spot_id}),
            ]
            for path, params in paths:
                response = client.get(path, params=params)
                data = response.json()
                report["http"].append(
                    {
                        "provider": provider,
                        "spot_id": spot_id,
                        "path": path,
                        "status_code": response.status_code,
                        "state": data.get("status"),
                        "rows": len(data.get("rows", [])),
                        "total": data.get("total"),
                        "first_row": data.get("rows", [None])[0]
                        if data.get("rows")
                        else None,
                    }
                )
    report["finished_at"] = datetime.now(UTC).isoformat()
    args.output.write_text(
        json.dumps(report, ensure_ascii=False, indent=2, default=str) + "\n"
    )
    print("Saved sanitized normalized verification report", flush=True)


if __name__ == "__main__":
    main()
