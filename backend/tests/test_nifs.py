from datetime import datetime, timedelta
from types import SimpleNamespace

import pytest
from pydantic import SecretStr

from app.ingestion.http import ProviderError
from app.ingestion.nifs import KST, NifsProvider, nifs_jobs

NOW = datetime(2025, 9, 27, 17, 10, tzinfo=KST)


def settings(**changes):
    return SimpleNamespace(
        **{
            "nifs_api_key": SecretStr("test-nifs-secret"),
            "nifs_station_codes": "fggo3",
            **changes,
        }
    )


def station(**changes):
    return {
        "sta_cde": "fggo3",
        "sta_nam_kor": "Fixture station",
        "lat": "38.3681",
        "lon": "128.5239",
        "sur_tmp_yn": "Y",
        "sur_dep": "5",
        "bld_dat": "2024-03-11",
        "end_dat": "",
        **changes,
    }


def observation(**changes):
    return {
        "sta_cde": "fggo3",
        "obs_dat": "2025-09-27",
        "obs_tim": "17:00:00",
        "obs_lay": "1",
        "wtr_tmp": "22.9",
        "repair_gbn": "1",
        "rpr_yn": "N",
        **changes,
    }


def response(rows):
    return {"header": {"resultCode": "00"}, "body": {"item": rows}}


class Client:
    def __init__(self, metadata=None, readings=None):
        self.responses = [
            response(metadata if metadata is not None else [station()]),
            response(readings if readings is not None else [observation()]),
        ]
        self.calls = []

    def get_json(self, url, params=None):
        self.calls.append((url, params))
        result = self.responses[len(self.calls) - 1]
        if isinstance(result, Exception):
            raise result
        return result


def fetch(client=None, at=NOW, **changes):
    return NifsProvider(settings(**changes), client or Client(), lambda: at).fetch()


def test_surface_only_preserves_identity_depth_kst_and_two_request_bound():
    client = Client(
        readings=[
            observation(),
            observation(obs_lay="2", wtr_tmp="15"),
            observation(obs_lay="3", wtr_tmp="10"),
            observation(sta_cde="other", wtr_tmp="25"),
        ]
    )
    batch = fetch(client)
    assert len(batch.readings) == 1
    reading = batch.readings[0]
    assert reading.station.source_id == "fggo3"
    assert reading.station.latitude == 38.3681
    assert reading.observed_at == NOW.replace(minute=0)
    assert reading.valid_until == NOW.replace(hour=18, minute=0)
    assert reading.issued_at is None
    assert "5m" in reading.spatial_scope
    values = {v.name: v for v in reading.values}
    assert values["water_temperature"].numeric_value == 22.9
    assert values["water_temperature"].unit == "degC"
    assert values["water_temperature_depth"].numeric_value == 5
    assert values["water_temperature_layer"].text_value == "surface"
    assert len(client.calls) == 2
    assert all(
        url == "https://www.nifs.go.kr/api/OpenAPI_json" for url, _ in client.calls
    )
    assert client.calls[0][1]["use_yn"] == "Y"
    assert "test-nifs-secret" not in batch.model_dump_json()


@pytest.mark.parametrize(
    "change",
    [
        {"repair_gbn": "2"},
        {"rpr_yn": "Y"},
        {"repair_gbn": None},
        {"wtr_tmp": ""},
        {"wtr_tmp": "-"},
        {"wtr_tmp": "-99"},
        {"wtr_tmp": "NaN"},
        {"wtr_tmp": "Infinity"},
        {"wtr_tmp": True},
    ],
)
def test_missing_or_maintenance_does_not_become_a_usable_temperature(change):
    batch = fetch(Client(readings=[observation(**change)]))
    value = batch.readings[0].values[0]
    assert value.missing is True
    assert value.numeric_value is None
    assert value.text_value


def test_documented_repaire_spelling_and_zero_temperature_are_supported():
    row = observation(wtr_tmp="0")
    row["repaire_gbn"] = row.pop("repair_gbn")
    assert fetch(Client(readings=[row])).readings[0].values[0].numeric_value == 0


def test_retry_never_extends_validity_and_no_surface_never_uses_bottom():
    first = fetch().readings[0]
    assert fetch(at=NOW + timedelta(hours=2)).readings[0] == first
    assert fetch(Client(readings=[observation(obs_lay="3")])).readings == []


@pytest.mark.parametrize(
    "change",
    [
        {"lat": ""},
        {"lon": "nan"},
        {"sur_dep": ""},
        {"sur_dep": "-1"},
        {"sur_tmp_yn": "N"},
        {"sta_nam_kor": ""},
        {"bld_dat": "invalid"},
    ],
)
def test_bad_station_metadata_fails_before_requesting_observations(change):
    client = Client(metadata=[station(**change)])
    with pytest.raises(ProviderError):
        fetch(client)
    assert len(client.calls) == 1


def test_absent_station_metadata_and_conflicting_metadata_are_rejected():
    for rows in [[], [station(), station(lat="38.3")]]:
        with pytest.raises(ProviderError):
            fetch(Client(metadata=rows))


@pytest.mark.parametrize(
    "change",
    [{"obs_tim": "unknown"}, {"obs_tim": "18:00:00"}, {"obs_dat": "2023-09-27"}],
)
def test_unknown_future_and_pre_installation_timestamps_are_rejected(change):
    with pytest.raises(ProviderError):
        fetch(Client(readings=[observation(**change)]))


def test_duplicate_identical_rows_dedupe_but_conflicts_reject_entire_batch():
    assert len(fetch(Client(readings=[observation(), observation()])).readings) == 1
    with pytest.raises(ProviderError, match="CONFLICTING_NIFS_OBSERVATION"):
        fetch(Client(readings=[observation(), observation(wtr_tmp="23.0")]))


@pytest.mark.parametrize(
    "payload",
    [
        ProviderError("HTTP_403"),
        {"header": {"resultCode": "99", "resultMsg": "private text"}},
        {"header": {"resultCode": "00"}},
        response("invalid"),
        {"body": {"item": []}},
    ],
)
def test_failure_or_malformed_response_cannot_produce_a_batch(payload):
    client = Client()
    client.responses[1] = payload
    with pytest.raises(ProviderError) as exc:
        fetch(client)
    assert "private text" not in str(exc.value)
    assert "test-nifs-secret" not in str(exc.value)


def test_key_and_scope_fail_closed_before_network_and_job_is_periodic():
    for changes in [
        {"nifs_api_key": SecretStr("")},
        {"nifs_station_codes": ""},
        {"nifs_station_codes": "http://untrusted"},
    ]:
        client = Client()
        with pytest.raises(ProviderError):
            fetch(client, **changes)
        assert not client.calls
    assert nifs_jobs(settings())[0].interval_seconds == 1800
    assert not nifs_jobs(settings(nifs_api_key=SecretStr("")))[0].enabled


def test_worker_collects_nifs_before_publishing_and_includes_manual_refresh():
    from app.config import Settings
    from app.ingestion.worker import registered_jobs
    from app.refresh.service import DYNAMIC_JOBS

    config = Settings(
        _env_file=None, postgres_password="fixture-password", nifs_api_key="fixture-key"
    )
    jobs = registered_jobs(config)
    names = [job.name for job in jobs]
    job = next(job for job in jobs if job.name == "nifs_risa")
    assert job.enabled and job.external_collection
    assert names.index("nifs_risa") < names.index("condition_projection")
    assert "nifs_risa" in DYNAMIC_JOBS
