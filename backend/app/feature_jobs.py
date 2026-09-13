"""Domain jobs share persisted scheduling, locks, backoff and heartbeat."""

from app.ingestion.jobs import Job


def feature_jobs(settings):
    from app.forecast.storage import project_forecasts
    from app.livecams.service import run_checks
    from app.notifications.delivery import run_notifications
    from app.quality.service import run_quality_job
    from app.water_index.producer import produce_assessments

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

    return [
        Job("forecast_projection", 300, process=lambda: projection(project_forecasts)),
        Job(
            "water_index_evaluation",
            300,
            process=lambda: projection(produce_assessments),
        ),
        Job("livecam_checks", 300, process=lambda: run_checks(settings)),
        Job("condition_notifications", 60, process=lambda: run_notifications(settings)),
        Job("quality_comparison", 900, process=quality),
    ]
