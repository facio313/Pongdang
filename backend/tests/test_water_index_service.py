from datetime import UTC, datetime, timedelta

import pytest
from pydantic import ValidationError

from app.config import Settings
from app.water_index.adapters import input_from_records
from app.water_index.models import Context, EvaluationRequest, Target
from app.water_index.service import evaluate_and_store, prepare_evaluation

NOW = datetime(2026, 1, 1, tzinfo=UTC)


def records():
    return (
        {
            "id": 10,
            "spot_id": 2,
            "station_id": 3,
            "provider": "KHOA",
            "provider_record_id": "reading-digest",
            "source_record_id": "original-provider-id",
            "observed_at": NOW,
            "issued_at": None,
            "fetched_at": NOW + timedelta(minutes=2),
            "valid_from": NOW,
            "valid_until": NOW + timedelta(hours=1),
            "spatial_scope": "station only",
        },
        {
            "id": 100,
            "snapshot_id": 10,
            "station_id": "TW_0089",
            "name": "water_temperature",
            "numeric_value": 0,
            "text_value": None,
            "boolean_value": None,
            "unit": "degC",
            "mode": "observation",
            "state": "recorded",
            "is_missing": False,
        },
    )


def request():
    return EvaluationRequest(
        target_id="source-target",
        spot_id=2,
        activity="swim",
        target=Target(kind="instant", start_at=NOW, timezone="Asia/Seoul"),
        as_of=NOW + timedelta(minutes=5),
        evaluated_at=NOW + timedelta(minutes=5),
        context=Context(profile_id="general"),
        requested_mode="observation",
    )


def test_collection_ids_units_zero_and_unknowns_are_preserved():
    item = input_from_records(*records(), input_id="metric:100")
    assert item.provider_record_id == "reading-digest"
    assert item.source_record_id == "original-provider-id"
    assert item.station_id == "TW_0089" and item.snapshot_station_id == 3
    assert item.spot_id == 2 and item.metric_id == 100 and item.snapshot_id == 10
    assert item.numeric_value == 0 and item.state == "recorded"
    assert item.unit == "degC" and item.issued_at is None
    assert item.mapping_version is item.aggregation.method is None
    assert item.used_by == ()


def test_forecast_target_is_not_relabelled_as_observation():
    snapshot, metric = records()
    metric["mode"] = "forecast"
    snapshot.update(
        observed_at=NOW + timedelta(days=1),
        valid_from=NOW + timedelta(days=1),
        valid_until=NOW + timedelta(days=2),
    )
    result = input_from_records(snapshot, metric, input_id="forecast:100")
    assert result.time_role == "forecast_target_start"
    assert result.observed_at > result.fetched_at and result.issued_at is None


@pytest.mark.parametrize(
    "field,value",
    [
        ("snapshot_id", 999),
        ("mode", None),
        ("numeric_value", float("nan")),
        ("numeric_value", "24°C"),
        ("numeric_value", True),
        ("observed_at", NOW + timedelta(minutes=1)),
    ],
)
def test_incompatible_or_conflicting_raw_records_fail(field, value):
    snapshot, metric = records()
    metric[field] = value
    with pytest.raises(ValueError):
        input_from_records(snapshot, metric, input_id="metric:100")


def test_missing_and_textual_rain_are_not_numeric_zero():
    snapshot, metric = records()
    metric.update(
        name="rain_amount",
        numeric_value=None,
        text_value="1mm 미만",
        unit="mm",
        is_missing=True,
    )
    result = input_from_records(snapshot, metric, input_id="rain:100")
    assert result.numeric_value is None and result.text_value == "1mm 미만"
    assert "input_missing" in result.quality_flags


def test_stable_ids_include_context_target_time_and_provenance(monkeypatch):
    first = prepare_evaluation(request())
    assert first == prepare_evaluation(request())
    moved = request().model_copy(update={"as_of": NOW, "evaluated_at": NOW})
    assert prepare_evaluation(moved).assessment_id != first.assessment_id
    changed = request().model_copy(update={"activity": "surf"})
    assert prepare_evaluation(changed).assessment_id != first.assessment_id
    monkeypatch.setattr(
        "app.water_index.service.provenance_manifest",
        lambda: {"bundle_sha256": "another-version"},
    )
    assert prepare_evaluation(request()).assessment_id != first.assessment_id


def test_preparation_revalidates_mutated_objects():
    with pytest.raises(ValidationError):
        prepare_evaluation(request().model_copy(update={"spot_id": -1}))
    with pytest.raises(ValueError, match="context"):
        prepare_evaluation(
            request().model_copy(update={"context": Context(profile_id="family")})
        )


def test_internal_orchestration_captures_request_without_publication(monkeypatch):
    calls = []
    monkeypatch.setattr(
        "app.water_index.service.store_bundle",
        lambda settings, bundle: calls.append(bundle),
    )
    settings = Settings(_env_file=None, postgres_password="test-only")
    result = evaluate_and_store(settings, request())
    assert result.score is None and result.model.status == "unimplemented"
    assert len(calls) == 1 and not calls[0].read_manifests
    assert calls[0].targets[0].assessment.as_of is None
    manifest = calls[0].input_manifests[0]
    assert manifest.manifest_id == result.input_manifest_id
    assert manifest.evaluation_request["as_of"] == result.as_of.isoformat().replace(
        "+00:00", "Z"
    )
    assert (
        manifest.provenance["parameter_set_version"]
        == result.model.parameter_set_version
    )
