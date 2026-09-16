"""Diagnostics preserve empty reads and redact failures on a disposable DB."""

import asyncio
import json
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock

import pytest
from pydantic import SecretStr
from test_condition_score_integration import database as database
from test_default_place import beach

from app.data_reader import DataReader
from app.ingestion import diagnostics
from app.schema import connect


@pytest.mark.parametrize(
    "code",
    [
        "KEY_NOT_CONFIGURED",
        "HTTP_403",
        "PROVIDER_30",
        "BOUNDED_CATALOG",
        "NETWORK_ERROR",
    ],
)
def test_persisted_error_codes_remain_useful(code):
    assert diagnostics.safe_error(code) == code


def test_unknown_error_text_is_never_echoed():
    assert diagnostics.safe_error(None) is None
    assert diagnostics.safe_error("https://private/?key=secret") == (
        "UNRECOGNIZED_ERROR_REDACTED"
    )


def test_short_secrets_do_not_damage_json_structure_numbers_or_bools():
    result = diagnostics.redact(
        {
            "status": "ok",
            "count": 1,
            "configured": True,
            "name": "secret true 1",
            "nested": ["secret"],
        },
        ["true", "1", "secret"],
    )
    parsed = json.loads(json.dumps(result))
    assert parsed["count"] == 1 and parsed["configured"] is True
    assert parsed["name"] == "[REDACTED] [REDACTED] [REDACTED]"
    assert parsed["nested"] == ["[REDACTED]"]


def test_settings_failure_prints_only_generic_json(monkeypatch, capsys):
    def invalid():
        raise ValueError("private password and API key")

    monkeypatch.setattr(diagnostics, "Settings", invalid)
    assert diagnostics.main() == 1
    captured = capsys.readouterr()
    assert captured.err == ""
    assert json.loads(captured.out) == {
        "status": "error",
        "code": "SETTINGS_INVALID",
        "read_only": True,
    }


def test_database_failure_keeps_configured_bools_without_exception_text(
    database,
    monkeypatch,
):
    settings = database.model_copy(update={"kakao_rest_key": SecretStr("private-key")})
    monkeypatch.setattr(
        diagnostics,
        "metadata",
        AsyncMock(side_effect=ValueError("private-key authenticated upstream URL")),
    )
    monkeypatch.setattr(
        diagnostics,
        "select_default_place",
        AsyncMock(
            return_value={"place": None, "status": "no_places", "candidates_checked": 0}
        ),
    )
    report = asyncio.run(diagnostics.diagnose(settings))
    assert report["configured_keys"]["KAKAO_REST_KEY"] is True
    assert report["status"] == "partial"
    assert report["errors"] == [{"section": "metadata", "code": "READ_FAILED"}]
    assert "private-key" not in json.dumps(report, default=str)


def test_healthy_heartbeat_disabled_catalog_and_empty_places_are_distinct(database):
    settings = database.model_copy(
        update={
            **{key: SecretStr("") for key in diagnostics.KEYS},
            "kakao_rest_api_key": SecretStr("route-only"),
        }
    )
    with connect(database) as connection:
        connection.execute(
            "INSERT INTO pongdang_data.conditions_pipelineheartbeat "
            "(key,state,current_tasks,last_seen_at,updated_at) "
            "VALUES ('condition-pipeline','idle','[]',now(),now())"
        )
        connection.execute(
            "INSERT INTO pongdang_data.collection_job "
            "(task_name,state,interval_seconds,next_run_at,last_error) "
            "VALUES ('kakao_places','disabled',86400,%s,'KEY_NOT_CONFIGURED')",
            [datetime.now(UTC) + timedelta(hours=20)],
        )
    report = asyncio.run(diagnostics.diagnose(settings))
    assert report["status"] == "ok" and report["heartbeat"]["healthy"]
    assert report["counts"]["classified_beaches"] == 0
    assert report["default_place"]["status"] == "no_places"
    assert report["conditions"] == []
    job = next(j for j in report["jobs"] if j["task_name"] == "kakao_places")
    assert job["persisted"] and job["registered"]
    assert not job["enabled_in_this_process"] and not job["due"]
    assert job["last_error"] == "KEY_NOT_CONFIGURED"
    with connect(database) as connection:
        assert (
            connection.execute(
                "SELECT count(*) FROM pongdang_data.collection_job"
            ).fetchone()[0]
            == 1
        )  # No job synchronization or implicit registration.


def test_actual_default_selection_and_score_read_without_writes(database):
    spot_id = beach(database, "경포")

    async def read():
        reader = DataReader(database)
        async with reader.connection() as connection:
            value = await (
                await connection.execute("SHOW transaction_read_only")
            ).fetchone()
            assert value["transaction_read_only"] == "on"
        return await diagnostics.diagnose(database, reader=reader)

    report = asyncio.run(read())
    assert report["status"] == "ok"
    assert report["counts"]["classified_beaches"] == 1
    assert report["default_place"]["place"] == {"id": spot_id, "name": "경포"}
    modes = {result["mode"]: result for result in report["conditions"]}
    assert not modes["observation"]["score_present"]
    assert modes["forecast"]["score_present"]
    assert modes["forecast"]["metric_count"] > 0
    assert modes["forecast"]["safety_status"] == "unknown"
    with connect(database) as connection:
        assert (
            connection.execute(
                "SELECT count(*) FROM pongdang_data.collection_job"
            ).fetchone()[0]
            == 0
        )
