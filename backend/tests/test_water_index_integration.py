"""End-to-end synthetic cases on a disposable DB; no preference validation."""

import json
from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app
from app.schema import connect, initialize
from app.water_index.models import (
    Context,
    EvaluationRequest,
    SafetyEvidence,
    SupportEvidence,
    Target,
)
from app.water_index.service import evaluate_and_store
from app.water_index.storage import ReadManifest, StorageBundle, store_bundle


@pytest.fixture
def database():
    settings = Settings()
    if settings.postgres_db != "pongdang_test":
        pytest.fail("Integration requires disposable pongdang_test")
    initialize(settings)
    with connect(settings) as c:
        c.execute(
            "INSERT INTO pongdang_data.spots_waterspot(id,name) "
            "VALUES(1201,'Synthetic integration spot')"
        )
    yield settings
    with connect(settings) as c:
        c.execute("DROP SCHEMA pongdang_data CASCADE")


def evaluated_request():
    now = datetime.now(UTC) - timedelta(seconds=1)
    target = Target(
        kind="interval",
        start_at=now + timedelta(hours=1),
        end_at=now + timedelta(hours=2),
        timezone="Asia/Seoul",
    )
    evidence = {
        "provider": "TEST_OFFICIAL",
        "provider_record_id": "fixture-original-record",
        "spot_id": 1201,
        "activity": "swim",
        "authority": "Synthetic authority for software verification only",
        "authoritative": True,
        "source_status": "active",
        "state": "current",
        "issued_at": now - timedelta(minutes=1),
        "fetched_at": now,
        "valid_from": now,
        "valid_until": now + timedelta(hours=3),
        "scope": "explicit fixture area",
    }
    return EvaluationRequest(
        target_id="integration-target-1201-swim",
        spot_id=1201,
        activity="swim",
        target=target,
        as_of=now,
        evaluated_at=now,
        context=Context(profile_id="general"),
        requested_mode="forecast",
        forecast_coverage=(target,),
        support_evidence=(
            SupportEvidence(
                **evidence,
                evidence_ref="fixture-support",
                status="supported",
                mapping_version="fixture-area-v1",
            ),
        ),
        safety_evidence=(
            SafetyEvidence(
                **evidence,
                evidence_ref="fixture-restriction",
                check_id="fixture-operation",
                rule_id="fixture-official-control",
                effect="restricted",
                parameter_ids=("PAR_SAFETY_NON_COMPENSATION",),
            ),
        ),
    )


def view_for(request, result):
    return ReadManifest(
        manifest_id="integration-read-view",
        spot_id=request.spot_id,
        activity=request.activity,
        profile_id="general",
        mode="forecast",
        scope_start_at=request.target.start_at,
        scope_end_at=request.target.end_at + timedelta(hours=1),
        read_valid_until=request.as_of + timedelta(minutes=10),
        selections={request.target_id: result.assessment_id},
        supported_windows=[
            {
                "start_at": request.target.start_at.isoformat(),
                "end_at": request.target.end_at.isoformat(),
            }
        ],
        support_rows=[
            {
                "target_id": "support-source-key",
                "spot_id": request.spot_id,
                "activity": request.activity,
                "target": {
                    "kind": "interval",
                    "start_at": result.support.valid_from.isoformat(),
                    "end_at": result.support.valid_until.isoformat(),
                    "timezone": "Asia/Seoul",
                },
                "support": result.support.model_dump(mode="json"),
            }
        ],
    )


def test_evaluation_storage_api_contract_and_immutable_read(database, tmp_path):
    request = evaluated_request()
    result = evaluate_and_store(database, request)
    assert evaluate_and_store(database, request) == result
    params = {
        "spot_id": request.spot_id,
        "activity": "swim",
        "profile_id": "general",
        "mode": "forecast",
        "from": request.target.start_at.isoformat(),
        "until": request.target.end_at.isoformat(),
    }
    with TestClient(create_app(database)) as client:
        # Saving an assessment never automatically publishes a read selection.
        unpublished = client.get("/api/data/water-index/assessments", params=params)
        assert unpublished.status_code == 200
        assert unpublished.json()["rows"] == []
        assert unpublished.json()["coverage"]["status"] == "unknown"
        view = view_for(request, result)
        assert store_bundle(database, StorageBundle(read_manifests=[view])) == 1
        assert store_bundle(database, StorageBundle(read_manifests=[view])) == 0
        response = client.get("/api/data/water-index/assessments", params=params)
        assert response.status_code == 200, response.text
        body = response.json()
        row = body["rows"][0]
        assert row["assessment_id"] == result.assessment_id
        assert row["input_manifest_id"] == result.input_manifest_id
        assert row["score"] is None and row["safety_status"] == "restricted"
        assert row["recommendation"]["message_code"] == "ACTIVITY_RESTRICTED"
        notice = row["safety"]["restrictions"][0]
        assert notice["provider_record_id"] == "fixture-original-record"
        assert notice["fetched_at"] and notice["issued_at"]
        assert row["model"]["validation_status"] == "not_evaluated"
        assert all(gate == "pending" for gate in row["model"]["gate_results"].values())
        assert datetime.fromisoformat(row["as_of"]) < datetime.fromisoformat(
            body["as_of"]
        )
        support = client.get("/api/data/water-index/support", params=params)
        assert support.status_code == 200
        assert support.json()["rows"][0]["target_id"] == "support-source-key"
        assert support.json()["rows"][0]["support"]["source_evidence"]
        outside_params = {
            **params,
            "from": request.target.end_at.isoformat(),
            "until": (request.target.end_at + timedelta(hours=1)).isoformat(),
        }
        outside = client.get("/api/data/water-index/assessments", params=outside_params)
        assert outside.status_code == 200
        assert outside.json()["rows"] == []
        assert outside.json()["coverage"]["reason_codes"] == [
            "outside_forecast_horizon"
        ]
        # Mutable collection metadata does not rewrite the saved evaluation.
        with connect(database) as c:
            c.execute(
                "UPDATE pongdang_data.spots_waterspot "
                "SET name='Corrected' WHERE id=1201"
            )
            before = c.execute(
                "SELECT count(*) FROM pongdang_data.water_index_assessment"
            ).fetchone()
        replay = client.get(
            "/api/data/water-index/assessments",
            params={**params, "as_of": body["as_of"]},
        )
        assert replay.status_code == 200
        replay_row = replay.json()["rows"][0]
        assert {k: v for k, v in replay_row.items() if k != "queried_at"} == {
            k: v for k, v in row.items() if k != "queried_at"
        }
        with connect(database) as c:
            assert (
                c.execute(
                    "SELECT count(*) FROM pongdang_data.water_index_assessment"
                ).fetchone()
                == before
            )
            captured = c.execute(
                "SELECT payload FROM pongdang_data.water_index_input_manifest "
                "WHERE manifest_id=%s",
                [result.input_manifest_id],
            ).fetchone()[0]
        assert (
            captured["evaluation_request"]["safety_evidence"][0]["evidence_ref"]
            == "fixture-restriction"
        )
        assert captured["provenance"]["bundle_sha256"]
        (tmp_path / "response_examples.json").write_text(
            json.dumps(
                {
                    "documentation_only": True,
                    "synthetic_integration_cases": True,
                    "not_production_data": True,
                    "not_seed_or_fallback": True,
                    "examples": {
                        "unpublished": unpublished.json(),
                        "official_restriction": body,
                        "support": support.json(),
                        "outside_forecast_horizon": outside.json(),
                        "historical_replay": replay.json(),
                    },
                },
                ensure_ascii=False,
                indent=2,
            )
            + "\n"
        )
