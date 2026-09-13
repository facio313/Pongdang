from urllib.error import HTTPError

import pytest

from app.config import Settings
from app.ingestion.http import Client, ProviderError
from app.ingestion.places import kakao_places, tourism_places


def test_tourism_preserves_source_identity_and_marks_bounded_catalog():
    calls = []

    class Fake:
        def get_json(self, url, params):
            calls.append(params)
            return {
                "response": {
                    "body": {
                        "totalCount": 600,
                        "items": {
                            "item": [
                                {
                                    "contentid": str(params["pageNo"]),
                                    "title": "Official title",
                                    "mapx": "128.9",
                                    "mapy": "37.8",
                                    "contenttypeid": "12",
                                    "addr1": "Official address",
                                    "addr2": "",
                                }
                            ]
                        },
                    }
                }
            }

    settings = Settings(postgres_password="test", data_go_kr_key="test%2Bkey")
    result = tourism_places(settings, Fake())
    assert len(calls) == 5
    assert calls[0]["serviceKey"] == "test+key"
    assert result.coverage == "bounded"
    assert len(result.places) == 5
    assert result.places[0].source_id == "1"
    assert result.places[0].latitude == 37.8


def test_tourism_no_results_is_empty_not_synthetic():
    class Fake:
        def get_json(self, *_):
            return {"response": {"body": {"totalCount": 0, "items": ""}}}

    result = tourism_places(Settings(postgres_password="test"), Fake())
    assert result.places == []


def test_kakao_deduplicates_shared_places_and_preserves_coordinates():
    calls = []

    class Fake:
        def get_json(self, url, params, headers):
            calls.append((params, headers))
            return {
                "documents": [
                    {
                        "id": "42",
                        "place_name": "Official place",
                        "x": "128.9",
                        "y": "37.8",
                    }
                ]
            }

    result = kakao_places(
        Settings(postgres_password="test", kakao_rest_key="test"), Fake()
    )
    assert len(calls) == 5
    assert len(result.places) == 1
    assert result.places[0].source_id == "42"
    assert result.places[0].longitude == 128.9
    assert result.coverage == "bounded"


def test_http_failure_does_not_expose_authenticated_url(monkeypatch):
    class Fake:
        def open(self, request, timeout):
            raise HTTPError(request.full_url, 403, "private-test-key", {}, None)

    monkeypatch.setattr("app.ingestion.http.build_opener", lambda *_: Fake())
    with pytest.raises(ProviderError) as error:
        Client().get_text(
            "https://apis.data.go.kr/test", {"serviceKey": "private-test-key"}
        )
    assert str(error.value) == "HTTP_403"
    assert "private" not in str(error.value)


@pytest.mark.parametrize(
    "payload",
    [
        '{"response":{"header":{"resultCode":"30"}}}',
        '{"OpenAPI_ServiceResponse":{"cmmMsgHeader":{"returnReasonCode":"30"}}}',
        '{"errorType":"NotAuthorizedError","message":"private-test-key"}',
    ],
)
def test_http_200_provider_errors_are_not_accepted(monkeypatch, payload):
    monkeypatch.setattr(Client, "get_text", lambda *_: payload)
    with pytest.raises(ProviderError) as error:
        Client().get_json("https://apis.data.go.kr/test")
    assert "private" not in str(error.value)
