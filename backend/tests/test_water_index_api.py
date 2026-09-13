"""Synthetic contract cases, not Korean preference/safety performance data."""

from contextlib import asynccontextmanager
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app
from app.water_index.engine import diagnostic_assessment
from app.water_index.models import Context, Target
from app.water_index.storage import StorageReadError

PREFIX = "/api/data/water-index/"
TARGET = Target(
    kind="interval",
    start_at=datetime(2026, 1, 1, 1, tzinfo=UTC),
    end_at=datetime(2026, 1, 1, 2, tzinfo=UTC),
    timezone="Asia/Seoul",
)


def query(**changes):
    return {
        "spot_id": "1",
        "activity": "swim",
        "profile_id": "general",
        "mode": "forecast",
        "from": "2026-01-01T00:00:00Z",
        "until": "2026-01-02T00:00:00Z",
        **changes,
    }


def empty_projection():
    return {
        "rows": [],
        "total": 0,
        "coverage": {
            "status": "unknown",
            "supported_windows": [],
            "uncovered_windows": [],
            "missing_targets": [],
            "reason_codes": ["target_manifest_unavailable"],
        },
    }


def diagnostic():
    return diagnostic_assessment(
        target_id="test-target",
        spot_id=1,
        activity="swim",
        target=TARGET,
        context=Context(profile_id="general"),
    ).model_dump(mode="json")


@pytest.fixture
def api(monkeypatch):
    settings = Settings(
        _env_file=None,
        postgres_host="never-connect.invalid",
        postgres_db="pongdang_test",
        postgres_password="test-only",
        api_root_path="/pongdang",
    )

    @asynccontextmanager
    async def connection(_self):
        yield object()

    projection = AsyncMock(return_value=empty_projection())
    monkeypatch.setattr("app.water_index.api.DataReader.connection", connection)
    monkeypatch.setattr("app.water_index.api.read_projection", projection)
    with (
        patch("app.main.check_database", new=AsyncMock()),
        patch(
            "app.water_index.engine.evaluate",
            side_effect=AssertionError("GET evaluated"),
        ),
        patch("psycopg.connect", side_effect=AssertionError("GET wrote")),
        TestClient(create_app(settings)) as client,
    ):
        yield client, projection


def test_empty_data_is_unknown_not_a_synthetic_score(api):
    client, projection = api
    response = client.get(PREFIX + "assessments", params=query())
    assert response.status_code == 200
    body = response.json()
    assert body["rows"] == [] and body["total"] == 0
    assert body["coverage"]["status"] == "unknown"
    assert body["contract_version"] == "water-assessment.v1-draft"
    assert response.headers["cache-control"] == "no-store"
    assert projection.await_args.kwargs["historical"] is False


@pytest.mark.parametrize(
    "changes",
    [
        {"spot_id": "0"},
        {"spot_id": "1.0"},
        {"spot_id": "-1"},
        {"spot_id": "1,2"},
        {"activity": "diving"},
        {"profile_id": "family"},
        {"mode": "mixed"},
        {"page_size": "101"},
        {"page": "1001"},
        {"page": "0"},
        {"from": "2026-01-01"},
        {"from": "2026-01-01T00:00:00"},
        {"from": "1767225600"},
        {"until": "2026-01-01T00:00:00Z"},
        {"until": "2026-02-01T00:00:01Z"},
        {"model_id": "hci-beach-reproduction"},
        {"experimental": "true"},
        {"model_version": "validated"},
        {"q": "' OR 1=1"},
        {"as_of": "2999-01-01T00:00:00Z"},
        {"profile_id": "general&password=do-not-echo"},
    ],
)
def test_invalid_query_is_bounded_and_does_not_reach_storage(api, changes):
    client, projection = api
    response = client.get(PREFIX + "assessments", params=query(**changes))
    assert response.status_code == 422
    assert isinstance(response.json()["detail"], str)
    assert response.json()["error_code"] == "invalid_request"
    assert "do-not-echo" not in response.text
    projection.assert_not_awaited()


def test_query_alias_and_duplicate_cannot_bypass_allowlist(api):
    client, projection = api
    renamed = query()
    renamed["from_at"] = renamed.pop("from")
    assert client.get(PREFIX + "assessments", params=renamed).status_code == 422
    duplicate = [*query().items(), ("spot_id", "2")]
    assert client.get(PREFIX + "assessments", params=duplicate).status_code == 422
    projection.assert_not_awaited()


@pytest.mark.parametrize("field", ["profile_id", "mode"])
def test_assessment_requires_explicit_context_and_mode(api, field):
    client, projection = api
    params = query()
    del params[field]
    assert client.get(PREFIX + "assessments", params=params).status_code == 422
    projection.assert_not_awaited()


@pytest.mark.parametrize("route", ["support", "coverage"])
def test_auxiliary_routes_have_explicit_nonpersonal_default(api, route):
    client, projection = api
    params = query()
    del params["profile_id"], params["mode"]
    response = client.get(PREFIX + route, params=params)
    assert response.status_code == 200
    assert response.json()["query"]["profile_id"] == "general"
    assert response.json()["query"]["mode"] == "forecast"
    assert projection.await_args.kwargs["route"] == route


def test_exact_window_boundary_and_historical_cutoff(api):
    client, projection = api
    cutoff = datetime.now(UTC) - timedelta(minutes=10)
    response = client.get(
        PREFIX + "assessments",
        params=query(until="2026-02-01T00:00:00Z", as_of=cutoff.isoformat()),
    )
    assert response.status_code == 200
    assert projection.await_args.kwargs["as_of"] == cutoff
    assert projection.await_args.kwargs["historical"] is True
    assert datetime.fromisoformat(response.json()["as_of"]) == cutoff


@pytest.mark.parametrize(
    "status,code",
    [
        (404, "spot_not_found"),
        (422, "history_not_reproducible"),
        (422, "response_scope_too_large"),
    ],
)
def test_known_read_failure_keeps_status_and_machine_code(api, status, code):
    client, projection = api
    projection.side_effect = StorageReadError(status, code, "조회 조건 확인 필요")
    response = client.get(PREFIX + "assessments", params=query())
    assert response.status_code == status
    assert response.json()["error_code"] == code


def test_database_outage_is_not_empty_success_or_secret_error(api):
    client, projection = api
    projection.side_effect = HTTPException(503, "private connection string")
    response = client.get(PREFIX + "assessments", params=query())
    assert response.status_code == 503
    assert "private" not in response.text
    assert response.json()["error_code"] == "assessment_unavailable"


def test_null_target_identity_is_preserved_without_evaluation_on_get(api):
    client, projection = api
    saved = diagnostic()
    projection.return_value = {**empty_projection(), "rows": [saved], "total": 1}
    response = client.get(PREFIX + "assessments", params=query())
    assert response.status_code == 200
    row = response.json()["rows"][0]
    assert row["target_id"] == "test-target"
    assert row["assessment_id"] is row["as_of"] is row["evaluated_at"] is None
    assert row["score"] is row["environment"]["score"] is None
    assert row["model"]["status"] == "unimplemented"
    assert row["safety_status"] == "not_assessed"
    assert row["queried_at"] is not None and saved["queried_at"] is None
    assert row["target"] == saved["target"]


@pytest.mark.parametrize(
    "field,value",
    [
        ("model_version", "0.2.0"),
        ("ruleset_version", "new-rules"),
        ("parameter_set_version", "new-parameters"),
        ("evidence_version", "unverified"),
        ("status", "validated"),
        ("validation_status", "external_validation_passed"),
    ],
)
def test_unknown_or_promoted_model_cannot_enter_public_api(api, field, value):
    client, projection = api
    row = diagnostic()
    row["model"][field] = value
    projection.return_value = {**empty_projection(), "rows": [row], "total": 1}
    response = client.get(PREFIX + "assessments", params=query())
    assert response.status_code == 503


def test_oversized_nested_lineage_is_rejected_not_truncated(api):
    client, projection = api
    result = empty_projection()
    result["coverage"]["missing_targets"] = [{}] * 101
    projection.return_value = result
    response = client.get(PREFIX + "assessments", params=query())
    assert response.status_code == 422
    assert response.json()["error_code"] == "response_scope_too_large"


@pytest.mark.parametrize("field,value", [("spot_id", 2), ("activity", "surf")])
def test_projection_cannot_return_another_requested_context(api, field, value):
    client, projection = api
    row = diagnostic()
    row[field] = value
    projection.return_value = {**empty_projection(), "rows": [row], "total": 1}
    assert client.get(PREFIX + "assessments", params=query()).status_code == 503


def test_internal_support_fields_are_not_exposed(api):
    client, projection = api
    projection.return_value = {
        **empty_projection(),
        "rows": [{"target_id": "support", "raw_payload": "must-not-leak"}],
        "total": 1,
    }
    response = client.get(PREFIX + "support", params=query())
    assert response.status_code == 503 and "must-not-leak" not in response.text


def test_forged_gate_pass_cannot_promote_the_default_model(api):
    client, projection = api
    row = diagnostic()
    row["model"]["gate_results"]["G_EXTERNAL_VALIDATION"] = "pass"
    projection.return_value = {**empty_projection(), "rows": [row], "total": 1}
    assert client.get(PREFIX + "assessments", params=query()).status_code == 503


def test_write_methods_not_accepted_and_openapi_documents_routes(api):
    client, projection = api
    for route in ("assessments", "support", "coverage"):
        assert client.post(PREFIX + route, json={}).status_code == 405
    schema = client.get("/api/openapi.json").json()
    assert schema["servers"] == [{"url": "/pongdang"}]
    parameters = schema["paths"][PREFIX + "assessments"]["get"]["parameters"]
    assert {"spot_id", "activity", "from", "until", "profile_id", "mode"} <= {
        parameter["name"] for parameter in parameters
    }
    assert all(
        parameter["required"]
        for parameter in parameters
        if parameter["name"] in {"profile_id", "mode"}
    )
    projection.assert_not_awaited()
