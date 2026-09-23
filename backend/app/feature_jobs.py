"""Domain jobs share persisted scheduling, locks, backoff and heartbeat."""

from datetime import datetime, timedelta
from math import ceil
from zoneinfo import ZoneInfo

from app.ingestion.jobs import Job

KST = ZoneInfo("Asia/Seoul")


def feature_jobs(settings):
    from app.forecast.storage import project_forecasts
    from app.livecams.service import run_checks
    from app.notifications.delivery import run_notifications
    from app.quality.service import run_quality_job
    from app.water_index.condition_producer import produce_conditions
    from app.water_index.condition_storage import prune_condition_results
    from app.water_index.producer import produce_assessment_batch

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
            received=changed,
            inserted=0,
            state="succeeded",
            error="",
            next_run_seconds=min(
                86400, max(30, ceil((next_midnight - now).total_seconds()))
            ),
        )

    return [
        Job("condition_result_retention", 600, process=condition_result_retention),
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
