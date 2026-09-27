"""Domain jobs share persisted scheduling, locks, backoff and heartbeat."""

from datetime import datetime, timedelta
from math import ceil
from time import monotonic
from zoneinfo import ZoneInfo

from app.ingestion.jobs import Job

KST = ZoneInfo("Asia/Seoul")


def feature_jobs(settings):
    from app.forecast.storage import project_forecasts
    from app.ingestion.retention import prune_source_history
    from app.livecams.service import run_checks
    from app.notifications.delivery import run_notifications
    from app.quality.service import run_quality_job
    from app.water_index.condition_producer import produce_conditions
    from app.water_index.condition_storage import prune_condition_results
    from app.water_index.producer import produce_assessment_batch
    from app.water_index.retention import prune_water_index_history

    def projection(function):
        count = function(settings)
        return dict(
            received=count,
            inserted=count,
            # Zero inserts also means an idempotent, unchanged successful pass.
            # Data availability belongs to the feature DTO, not this job counter.
            state="succeeded",
            error="",
        )

    def quality():
        result = run_quality_job(settings)
        return dict(
            received=result["processed"],
            inserted=result["inserted"],
            state="succeeded" if result["processed"] else "no_data",
            error="",
        )

    def condition_result_retention():
        changed = prune_condition_results(settings)
        now = datetime.now(KST)
        next_midnight = (now + timedelta(days=1)).replace(
            hour=0, minute=0, second=0, microsecond=0
        )
        return dict(
            received=changed or 0,
            inserted=0,
            state="succeeded",
            error="",
            next_run_seconds=30
            if changed is None or changed >= 10000
            else min(86400, max(30, ceil((next_midnight - now).total_seconds()))),
        )

    def evidence_retention():
        # Each retention pass commits independently. The persisted job lock excludes
        # duplicate runners; producer locks exclude active evaluation writes.
        deadline = monotonic() + 20
        deleted = 0
        while True:
            result = prune_water_index_history(settings, batch_size=10000)
            deleted += result["deleted"]
            if not result["pending"]:
                sources = prune_source_history(
                    settings, batch_size=10000, max_batches=20, max_seconds=20
                )
                deleted += sources["deleted"]
                pending = sources["pending"]
                break
            pending = True
            if result["skipped"] or monotonic() >= deadline:
                break
        return dict(
            received=deleted,
            inserted=0,
            state="succeeded",
            error="",
            next_run_seconds=30 if pending else 3600,
        )

    return [
        Job("condition_result_retention", 600, process=condition_result_retention),
        Job("evidence_retention", 600, process=evidence_retention),
        Job("forecast_projection", 600, process=lambda: projection(project_forecasts)),
        Job(
            "water_index_evaluation",
            600,
            process=lambda: produce_assessment_batch(settings),
        ),
        Job("livecam_checks", 600, process=lambda: run_checks(settings)),
        Job("condition_notifications", 60, process=lambda: run_notifications(settings)),
        Job("quality_comparison", 900, process=quality),
        Job(
            "condition_projection", 600, process=lambda: projection(produce_conditions)
        ),
    ]
