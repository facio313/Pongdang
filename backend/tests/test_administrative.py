import pytest

from app.config import Settings
from app.ingestion.administrative import (
    ENDPOINT,
    administrative_jobs,
    collect_place_regions,
    resolve_region,
)
from app.ingestion.http import ProviderError


class Client:
    def __init__(self, *responses, callback=None):
        self.responses = iter(responses)
        self.calls = []
        self.callback = callback

    def get_json(self, url, params, headers):
        self.calls.append((url, params, headers))
        if self.callback:
            self.callback()
        result = next(self.responses)
        if isinstance(result, Exception):
            raise result
        return result


def settings(key="test-key"):
    return Settings(_env_file=None, postgres_password="test", kakao_rest_key=key)


def response(*rows):
    return {"documents": list(rows)}


def legal(code="5115010100", **changes):
    return {"region_type": "B", "code": code, **changes}


def test_only_official_legal_district_code_assigns_region():
    client = Client(response({"region_type": "H", "code": "1111111111"}, legal()))
    assert resolve_region(settings(), 37.8, 128.9, client=client) == (
        ("gangwon", "gangneung"),
        "5115010100",
    )
    assert client.calls == [
        (
            ENDPOINT,
            {"x": 128.9, "y": 37.8, "input_coord": "WGS84"},
            {"Authorization": "KakaoAK test-key"},
        )
    ]


@pytest.mark.parametrize(
    "payload",
    [
        response(),
        response({"region_type": "H", "code": "5115010100"}),
        response(legal("1111010100", region_1depth_name="강원특별자치도")),
    ],
)
def test_no_legal_gangwon_evidence_remains_unknown(payload):
    assert resolve_region(settings(), 37.8, 128.9, client=Client(payload)) is None


@pytest.mark.parametrize(
    "payload,error",
    [
        ({}, "INVALID_REGION_RESPONSE"),
        (response("bad row"), "INVALID_REGION_RESPONSE"),
        (response(legal(), legal()), "AMBIGUOUS_REGION_RESPONSE"),
        (response(legal("51")), "INVALID_REGION_CODE"),
        (response(legal("51150bad00")), "INVALID_REGION_CODE"),
        (response(legal("5199910100")), "UNKNOWN_GANGWON_DISTRICT"),
    ],
)
def test_invalid_and_ambiguous_responses_are_explicit_failures(payload, error):
    with pytest.raises(ProviderError, match=error):
        resolve_region(settings(), 37.8, 128.9, client=Client(payload))


def test_missing_key_never_sends_upstream_request_and_disables_job():
    client = Client()
    with pytest.raises(ProviderError, match="MISSING_CREDENTIAL"):
        resolve_region(settings(""), 37.8, 128.9, client=client)
    assert not client.calls
    assert not administrative_jobs(settings(""))[0].enabled


@pytest.mark.parametrize("limit", [0, 101, True, 1.5])
def test_request_bound_is_validated_before_database_connection(limit):
    with pytest.raises(ValueError, match="Invalid region collection limit"):
        collect_place_regions(settings(), client=Client(), limit=limit)
