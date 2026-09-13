"""Disposable-database checks for immutable, knowledge-time-correct projections."""

import asyncio
from dataclasses import replace
from datetime import UTC, datetime, timedelta

import psycopg
import pytest

from app.config import Settings
from app.data_reader import DataReader
from app.schema import VERSION, connect, initialize
from app.water_index.engine import diagnostic_assessment, evaluate
from app.water_index.models import (
    Context,
    EvaluationRequest,
    SupportDTO,
    SupportEvidence,
    Target,
)
from app.water_index.registry import provenance_manifest
from app.water_index.storage import (
    InputManifest,
    ReadManifest,
    StorageBundle,
    StorageReadError,
    TargetRecord,
    read_projection,
    store_bundle,
)


@pytest.fixture
def db():
    settings = Settings()
    if settings.postgres_db != "pongdang_test":
        pytest.fail("Water Index tests require the disposable pongdang_test database")
    with connect(settings) as c:
        c.execute("DROP SCHEMA IF EXISTS pongdang_data CASCADE")
    initialize(settings)
    with connect(settings) as c:
        c.execute(
            "INSERT INTO pongdang_data.spots_waterspot(id,name) VALUES (991,'test')"
        )
    yield settings
    with connect(settings) as c:
        c.execute("DROP SCHEMA pongdang_data CASCADE")


def diagnostic(target_id="target-1", start=None, end=None):
    start = start or datetime.now(UTC) + timedelta(hours=1)
    end = end or start + timedelta(hours=1)
    return diagnostic_assessment(
        target_id=target_id,
        spot_id=991,
        activity="swim",
        context=Context(profile_id="general"),
        target=Target(kind="interval", start_at=start, end_at=end, timezone="UTC"),
    )


def view(target, *, selections=None, manifest_id="view-1", expiry=None):
    return ReadManifest(
        manifest_id=manifest_id,
        spot_id=991,
        activity="swim",
        profile_id="general",
        mode="forecast",
        scope_start_at=target.target.start_at,
        scope_end_at=target.target.end_at,
        read_valid_until=expiry or datetime.now(UTC) + timedelta(minutes=20),
        selections=selections if selections is not None else {target.target_id: None},
        supported_windows=[
            {
                "start_at": target.target.start_at.isoformat(),
                "end_at": target.target.end_at.isoformat(),
            }
        ],
    )


def read(db, target, *, as_of=None, historical=False, **options):
    async def run():
        async with DataReader(db).connection() as c:
            state = await (await c.execute("SHOW transaction_read_only")).fetchone()
            assert state["transaction_read_only"] == "on"
            return await read_projection(
                c,
                spot_id=options.pop("spot_id", 991),
                activity="swim",
                profile_id="general",
                mode="forecast",
                from_at=target.target.start_at,
                until_at=target.target.end_at,
                as_of=as_of or datetime.now(UTC),
                historical=historical,
                **options,
            )

    return asyncio.run(run())


@pytest.mark.parametrize("old_version", [1, 2, 3])
def test_additive_upgrade_preserves_source_rows(db, old_version):
    with connect(db) as c:
        for table in (
            "water_index_production_run",
            "water_index_read_manifest",
            "water_index_assessment",
            "water_index_input_manifest",
            "water_index_target",
        ):
            c.execute(f"DROP TABLE pongdang_data.{table}")
        c.execute("UPDATE pongdang_data.schema_version SET version=%s", [old_version])
    assert initialize(db) is True
    assert initialize(db) is False
    with connect(db) as c:
        assert c.execute(
            "SELECT version FROM pongdang_data.schema_version"
        ).fetchone() == (VERSION,)
        assert c.execute(
            "SELECT id,name FROM pongdang_data.spots_waterspot"
        ).fetchone() == (991, "test")
        assert c.execute(
            "SELECT count(*) FROM pongdang_data.water_index_assessment"
        ).fetchone() == (0,)


def test_idempotence_conflict_and_no_creation_time_refresh(db):
    target = diagnostic()
    bundle = StorageBundle(
        targets=[TargetRecord(target, "forecast")], read_manifests=[view(target)]
    )
    assert store_bundle(db, bundle) == 2
    with connect(db) as c:
        before = c.execute(
            "SELECT created_at,available_at FROM pongdang_data.water_index_target"
        ).fetchone()
    assert store_bundle(db, bundle) == 0
    with connect(db) as c:
        assert (
            c.execute(
                "SELECT created_at,available_at FROM pongdang_data.water_index_target"
            ).fetchone()
            == before
        )
        assert before[0] == before[1]
    with pytest.raises(ValueError, match="different content"):
        store_bundle(db, StorageBundle(targets=[TargetRecord(target, "observation")]))
    with pytest.raises(ValueError, match="different content"):
        store_bundle(
            db,
            StorageBundle(
                read_manifests=[
                    replace(
                        bundle.read_manifests[0],
                        read_valid_until=datetime.now(UTC) + timedelta(hours=1),
                    )
                ]
            ),
        )


def test_database_rejects_history_mutation(db):
    store_bundle(db, StorageBundle(targets=[TargetRecord(diagnostic(), "forecast")]))
    with pytest.raises(psycopg.errors.RaiseException, match="immutable"):
        with connect(db) as c:
            c.execute("UPDATE pongdang_data.water_index_target SET activity='surf'")
    with pytest.raises(psycopg.errors.RaiseException, match="immutable"):
        with connect(db) as c:
            c.execute("DELETE FROM pongdang_data.water_index_target")


def test_read_cutoff_uses_storage_availability_not_old_evaluation_time(db):
    target = diagnostic()
    now = datetime.now(UTC)
    request = EvaluationRequest(
        target_id=target.target_id,
        spot_id=991,
        activity="swim",
        target=target.target,
        context=target.context,
        as_of=now - timedelta(minutes=3),
        evaluated_at=now - timedelta(minutes=2),
        assessment_id="assessment-1",
        input_manifest_id="input-1",
        requested_mode="forecast",
    )
    assessed = evaluate(request)
    inputs = InputManifest(
        "input-1",
        assessed.model_dump(mode="json")["inputs"],
        request.model_dump(mode="json"),
        provenance_manifest(),
    )
    before_storage = datetime.now(UTC)
    bundle = StorageBundle(
        targets=[TargetRecord(target, "forecast")],
        assessments=[assessed],
        input_manifests=[inputs],
        read_manifests=[view(target, selections={target.target_id: "assessment-1"})],
    )
    store_bundle(db, bundle)
    with pytest.raises(StorageReadError) as error:
        read(db, target, as_of=before_storage, historical=True)
    assert error.value.code == "history_not_reproducible"
    result = read(db, target, historical=True)
    assert result["rows"][0]["as_of"] == assessed.model_dump(mode="json")["as_of"]
    assert (
        result["rows"][0]["evaluated_at"]
        == assessed.model_dump(mode="json")["evaluated_at"]
    )
    assert result["rows"][0]["score"] is None


def test_missing_target_stays_identifiable_without_evaluation_or_get_write(db):
    target = diagnostic()
    store_bundle(
        db,
        StorageBundle(
            targets=[TargetRecord(target, "forecast")], read_manifests=[view(target)]
        ),
    )
    result = read(db, target)
    row = result["rows"][0]
    assert row["target_id"] == target.target_id
    assert row["assessment_id"] is None
    assert row["as_of"] is None
    assert result["coverage"]["missing_targets"][0]["target_id"] == target.target_id
    with connect(db) as c:
        assert c.execute(
            "SELECT count(*) FROM pongdang_data.water_index_assessment"
        ).fetchone() == (0,)


def test_newer_narrower_view_never_resurrects_an_older_wide_view(db):
    target = diagnostic()
    old = view(target)
    store_bundle(
        db,
        StorageBundle(targets=[TargetRecord(target, "forecast")], read_manifests=[old]),
    )
    new = replace(
        old,
        manifest_id="view-2",
        scope_start_at=target.target.start_at + timedelta(minutes=10),
    )
    store_bundle(db, StorageBundle(read_manifests=[new]))
    assert read(db, target)["coverage"]["status"] == "unknown"
    with pytest.raises(StorageReadError) as error:
        read(db, target, historical=True)
    assert error.value.code == "history_not_reproducible"


def test_no_target_inference_and_unknown_place(db):
    target = diagnostic()
    assert read(db, target)["rows"] == []
    assert read(db, target)["coverage"]["status"] == "unknown"
    with pytest.raises(StorageReadError) as error:
        read(db, target, spot_id=999999)
    assert error.value.status_code == 404
    store_bundle(db, StorageBundle(read_manifests=[view(target, selections={})]))
    assert read(db, target)["coverage"]["status"] == "unknown"


def test_support_fields_and_duration_are_validated_before_publication(db):
    target = diagnostic()
    support = {
        "target_id": "support-1",
        "spot_id": 991,
        "activity": "swim",
        "target": target.target.model_dump(mode="json"),
        "support": SupportDTO().model_dump(mode="json"),
        "raw_response": {},
    }
    with pytest.raises(ValueError, match="Unexpected support"):
        store_bundle(
            db,
            StorageBundle(
                read_manifests=[
                    replace(
                        view(target, selections={}),
                        support_rows=[support],
                    )
                ]
            ),
        )
    support.pop("raw_response")
    support["support"].update(
        status="supported",
        evidence_refs=["official-record"],
        valid_from=target.target.start_at.isoformat(),
        valid_until=target.target.end_at.isoformat(),
    )
    support["support"]["source_evidence"] = [
        SupportEvidence(
            evidence_ref="official-record",
            provider="official-test",
            provider_record_id="s1",
            spot_id=991,
            activity="swim",
            authority="test authority",
            authoritative=True,
            source_status="active",
            state="current",
            fetched_at=datetime.now(UTC),
            issued_at=datetime.now(UTC) - timedelta(minutes=1),
            status="supported",
            scope="test reach",
            mapping_version="verified-test",
            valid_from=target.target.start_at,
            valid_until=target.target.end_at,
        ).model_dump(mode="json")
    ]
    with pytest.raises(ValueError, match="outlives its support"):
        store_bundle(
            db,
            StorageBundle(
                read_manifests=[
                    replace(
                        view(target, selections={}),
                        support_rows=[support],
                        read_valid_until=target.target.end_at + timedelta(hours=1),
                    )
                ]
            ),
        )


def test_missing_target_overflow_is_an_error_not_silent_truncation(db):
    first = diagnostic()
    targets = [
        diagnostic(f"target-{i}", first.target.start_at, first.target.end_at)
        for i in range(101)
    ]
    manifest = view(first, selections={t.target_id: None for t in targets})
    store_bundle(
        db,
        StorageBundle(
            targets=[TargetRecord(t, "forecast") for t in targets],
            read_manifests=[manifest],
        ),
    )
    with pytest.raises(StorageReadError) as error:
        read(db, first)
    assert error.value.code == "response_scope_too_large"


def test_interval_overlap_preserves_original_window_and_excludes_right_boundary(db):
    target = diagnostic()
    begin, end = target.target.start_at, target.target.end_at
    query_target = diagnostic("query", begin + timedelta(minutes=30), end)
    at_left = diagnostic_assessment(
        target_id="instant-left",
        spot_id=991,
        activity="swim",
        context=target.context,
        target=Target(
            kind="instant", start_at=query_target.target.start_at, timezone="UTC"
        ),
    )
    at_right = diagnostic_assessment(
        target_id="instant-right",
        spot_id=991,
        activity="swim",
        context=target.context,
        target=Target(kind="instant", start_at=end, timezone="UTC"),
    )
    targets = [target, at_left, at_right]
    store_bundle(
        db,
        StorageBundle(
            targets=[TargetRecord(t, "forecast") for t in targets],
            read_manifests=[
                view(target, selections={t.target_id: None for t in targets})
            ],
        ),
    )
    result = read(db, query_target, page_size=1)
    assert result["total"] == 2
    assert (
        result["rows"][0]["target"]["start_at"]
        == target.model_dump(mode="json")["target"]["start_at"]
    )
    second = read(db, query_target, page=2, page_size=1)
    assert second["rows"][0]["target_id"] == "instant-left"


def test_complete_request_snapshot_and_provenance_are_required(db):
    target = diagnostic()
    now = datetime.now(UTC)
    request = EvaluationRequest(
        target_id=target.target_id,
        spot_id=991,
        activity="swim",
        target=target.target,
        context=target.context,
        as_of=now - timedelta(minutes=2),
        evaluated_at=now - timedelta(minutes=1),
        assessment_id="assessment-1",
        input_manifest_id="input-1",
        requested_mode="forecast",
    )
    assessed = evaluate(request)
    with pytest.raises(ValueError, match="complete request snapshot"):
        store_bundle(
            db,
            StorageBundle(
                targets=[TargetRecord(target, "forecast")],
                input_manifests=[InputManifest("input-1", [])],
                assessments=[assessed],
            ),
        )
    with connect(db) as c:
        assert c.execute(
            "SELECT count(*) FROM pongdang_data.water_index_target"
        ).fetchone() == (0,)
    manifest = InputManifest(
        "input-1", [], request.model_dump(mode="json"), provenance_manifest()
    )
    altered = assessed.model_copy(update={"reason_codes": ("forged_reason",)})
    with pytest.raises(ValueError, match="pure evaluator output"):
        store_bundle(
            db,
            StorageBundle(
                targets=[TargetRecord(target, "forecast")],
                input_manifests=[manifest],
                assessments=[altered],
            ),
        )
