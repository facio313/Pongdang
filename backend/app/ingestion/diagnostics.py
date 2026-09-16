"""Read-only collector diagnosis; run as a module or pipe this file to python -.

No upstream requests, job execution, schema changes or writes. Exit 0 means the
diagnosis completed, not that data is available; exit 1 means a diagnostic read
failed. Credentials describe this invocation's environment, not a past worker.
"""

import asyncio
import json
import re
from datetime import UTC, datetime

from pydantic import SecretStr

from app.config import Settings
from app.data_reader import DataReader
from app.ingestion.worker import registered_jobs
from app.livecams.places import PLACE_SELECT
from app.water_index.condition_api import ConditionQuery, read_conditions
from app.water_index.default_place import select_default_place

KEYS = (
    "kakao_rest_key kakao_rest_api_key data_go_kr_key kma_api_hub_key hrfco_key".split()
)
JOBS = """kakao_places tourism_places khoa_beach khoa_surfing kma_nowcast
kma_ultra_forecast kma_short_forecast kma_aws kma_buoy khoa_buoy_recent
khoa_water_temperature khoa_waves khoa_tide_recent khoa_tide_extrema
khoa_rip_current kma_warnings forecast_projection water_index_evaluation""".split()
JOB_STATES = "disabled pending running succeeded partial no_data failed".split()
# Never echo arbitrary database text or provider-generated error descriptions.
ERROR_CODES = frozenset(
    """
KEY_NOT_CONFIGURED BOUNDED_CATALOG COLLECTION_ERROR SOURCE_SCOPE_TOO_LARGE
MISSING_CREDENTIAL NETWORK_ERROR SERVICE_NOT_AUTHORIZED ENDPOINT_NOT_ALLOWED
RESPONSE_TOO_LARGE UNEXPECTED_HTML INVALID_XML INVALID_JSON INVALID_JSON_STRUCTURE
PROVIDER_ERROR PROVIDER_MISSING_STATUS INVALID_PLACE_RESPONSE INVALID_PLACE_RECORD
INVALID_TOURISM_RESPONSE INVALID_RESPONSE INVALID_RESPONSE_BODY INVALID_RESPONSE_ITEMS
INVALID_TOTAL_COUNT MISSING_SOURCE_TIME INVALID_SOURCE_TIME MISSING_STATION_NAME
REQUEST_BUDGET_EXCEEDED CONFLICTING_PROVIDER_RECORD RECORD_LIMIT_EXCEEDED
INCOMPLETE_PAGINATION UNSUPPORTED_SERVICE INCONSISTENT_PAGINATION SOURCE_ERROR
INVALID_SOURCE_ITEMS INVALID_SOURCE_STRUCTURE PAGINATION_LIMIT DUPLICATE_SOURCE_METRIC
INVALID_MID_FORECAST INCOMPLETE_HUB_RESPONSE AMBIGUOUS_HUB_COLUMNS INVALID_HUB_COLUMNS
INVALID_HUB_ROW HUB_ROW_LIMIT MISSING_HUB_HEADER INVALID_STATION_CONFIGURATION
UNEXPECTED_HUB_STATION MISSING_HUB_METRICS
""".split()
)


def safe_error(value):
    if not value:
        return None
    if value in ERROR_CODES or re.fullmatch(
        r"(?:HTTP_[1-5][0-9]{2}|PROVIDER_[0-9]{1,4})", value
    ):
        return value
    return "UNRECOGNIZED_ERROR_REDACTED"


async def metadata(reader, jobs, now):
    async with reader.connection() as connection:
        heartbeat = await (
            await connection.execute(
                "SELECT state,current_tasks,last_seen_at FROM "
                "pongdang_data.conditions_pipelineheartbeat "
                "WHERE key='condition-pipeline' LIMIT 1"
            )
        ).fetchone()
        rows = await (
            await connection.execute(
                "SELECT task_name,state,started_at,finished_at,last_success_at,"
                "next_run_at,consecutive_failures,last_error,records_received,"
                "records_inserted FROM pongdang_data.collection_job "
                "WHERE task_name=ANY(%s) ORDER BY task_name LIMIT %s",
                [list(JOBS), len(JOBS)],
            )
        ).fetchall()
        counts = await (
            await connection.execute(
                f"WITH places AS ({PLACE_SELECT}) SELECT "
                "(SELECT count(*) FROM places) AS spots,"
                "(SELECT count(*) FROM places WHERE place_kind='beach') "
                "AS classified_beaches,"
                "(SELECT count(*) FROM pongdang_data.collection_place) AS source_places"
            )
        ).fetchone()
    if heartbeat:
        age = (now - heartbeat["last_seen_at"]).total_seconds()
        state = heartbeat["state"]
        heartbeat = {
            "state": state if state in {"idle", "running", "stopped"} else "unknown",
            "last_seen_at": heartbeat["last_seen_at"],
            "age_seconds": round(age),
            # Match ingestion.health; future timestamps are separately visible.
            "healthy": state in {"idle", "running"} and age < 120,
            "clock_in_future": age < 0,
            "current_tasks": [t for t in heartbeat["current_tasks"] if t in jobs][:20],
        }
    persisted = {row["task_name"]: row for row in rows}
    summaries = []
    for name in JOBS:
        job, row = jobs.get(name), persisted.get(name)
        summary = {
            **(row or {}),
            "task_name": name,
            "registered": job is not None,
            "enabled_in_this_process": bool(job and job.enabled),
            "persisted": row is not None,
        }
        if row:
            summary.update(
                state=row["state"] if row["state"] in JOB_STATES else "unknown",
                last_error=safe_error(row["last_error"]),
                due=row["next_run_at"] is None or row["next_run_at"] <= now,
                interval_seconds=job.interval_seconds if job else None,
            )
        summaries.append(summary)
    return {"heartbeat": heartbeat, "jobs": summaries, "counts": counts}


def condition_summary(evidence):
    score = evidence.condition_score
    return {
        "spot_id": evidence.spot_id,
        "mode": evidence.mode,
        "safety_status": evidence.safety_status,
        "score_present": score is not None and score.score is not None,
        "score_status": score.status if score else None,
        "score": score.score if score else None,
        "coverage": score.coverage if score else None,
        "metric_count": len(evidence.metrics),
        "context_metric_count": len(evidence.context_metrics),
        "available_metric_count": sum(
            m.status == "available"
            for m in (*evidence.metrics, *evidence.context_metrics)
        ),
    }


async def diagnose(settings, *, reader=None):
    now = datetime.now(UTC)
    reader = reader or DataReader(settings)
    jobs = {job.name: job for job in registered_jobs(settings)}
    report = {
        "diagnostic_version": 1,
        "queried_at": now,
        "status": "ok",
        "read_only": True,
        "credential_scope": "this_process_settings",
        "configured_keys": {
            key.upper(): bool(getattr(settings, key).get_secret_value().strip())
            for key in KEYS
        },
        "collection_scope": {
            "latitude": settings.collection_latitude,
            "longitude": settings.collection_longitude,
            "radius_m": settings.collection_radius_m,
        },
        "errors": [],
        "default_place": None,
        "conditions": [],
    }

    async def read(section, operation):
        try:
            async with asyncio.timeout(12):
                return await operation
        except Exception:
            report["errors"].append({"section": section, "code": "READ_FAILED"})
            return None

    report.update(await read("metadata", metadata(reader, jobs, now)) or {})
    result = await read("default_place", select_default_place(reader))
    place = result["place"] if result else None
    if result:
        report["default_place"] = {
            "status": result["status"],
            "place": {"id": place.id, "name": place.name} if place else None,
            "candidates_checked": result["candidates_checked"],
        }
    if place:
        for mode in ("observation", "forecast"):
            query = ConditionQuery(spot_id=place.id, activity="swim", mode=mode)
            evidence = await read(mode, read_conditions(reader, query))
            if evidence:
                report["conditions"].append(condition_summary(evidence))
    if report["errors"]:
        report["status"] = "partial"
    return report


def redact(value, secrets):
    if isinstance(value, dict):
        return {key: redact(item, secrets) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [redact(item, secrets) for item in value]
    if isinstance(value, str):
        for secret in secrets:
            value = value.replace(secret, "[REDACTED]")
    return value


def main():
    settings = None
    try:
        settings = Settings()
        report = asyncio.run(diagnose(settings))
        secrets = [
            value.get_secret_value()
            for name in Settings.model_fields
            if isinstance(value := getattr(settings, name), SecretStr)
            and value.get_secret_value()
        ]
        output = json.dumps(
            redact(report, secrets),
            ensure_ascii=False,
            default=lambda v: v.isoformat(),
            allow_nan=False,
            indent=2,
        )
    except Exception:
        report = {
            "status": "error",
            "code": "DIAGNOSTIC_FAILED" if settings else "SETTINGS_INVALID",
            "read_only": True,
        }
        output = json.dumps(report)
    print(output)
    return 0 if report["status"] == "ok" else 1


if __name__ == "__main__":
    raise SystemExit(main())
