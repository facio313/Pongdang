"""Official provider shapes, no live service calls or production data."""

from datetime import UTC, datetime

import pytest

from app.config import Settings
from app.ingestion.http import ProviderError
from app.place_details.provider import TourDetails, homepage, plain

NOW = datetime.now(UTC)
PHOTO = "http://tong.visitkorea.or.kr/cms/resource/11/123411_image2_1.jpg"


def place(**updates):
    return {
        "id": 1,
        "spot_id": 1,
        "provider": "TOURAPI_KOREAN",
        "source_id": "100",
        "category": "12",
        "name": "격리 해변",
        "source_modified_at": None,
        **updates,
    }


class Client:
    def __init__(self, *, common=None, intro=None, extra=None, empty=False):
        self.common = {
            "title": "격리 해변",
            "overview": "<p>원천 소개</p><script>bad()</script>",
            "homepage": '<a href="https://example.com/beach">공식 홈페이지</a>',
            "tel": "033-000-0000",
            "modifiedtime": "20240921123456",
            "firstimage": PHOTO,
            "cpyrhtDivCd": "Type1",
            **(common or {}),
        }
        self.intro = {
            "usetime": "09:00~18:00<br>계절별 확인",
            "restdate": "월요일",
            "parking": "주차장 있음",
            "opendate": "1990년",
            **(intro or {}),
        }
        self.extra = (
            extra
            if extra is not None
            else [
                {
                    "serialnum": "0",
                    "infoname": "이용가능시설",
                    "infotext": "샤워장<br>화장실",
                },
                {"serialnum": "1", "infoname": "입장료", "infotext": "무료"},
            ]
        )
        self.empty, self.calls, self.rewrite = empty, [], None

    def get_json(self, url, params):
        self.calls.append((url, params))
        method = url.rsplit("/", 1)[-1]
        all_rows = (
            []
            if self.empty
            else {
                "detailCommon2": [self.common],
                "detailIntro2": [self.intro],
                "detailInfo2": self.extra,
            }[method]
        )
        start = (params["pageNo"] - 1) * params["numOfRows"]
        rows = [
            {
                "contentid": params["contentId"],
                "contenttypeid": params.get("contentTypeId", "12"),
                **row,
            }
            for row in all_rows[start : start + params["numOfRows"]]
        ]
        payload = {
            "response": {
                "header": {"resultCode": "0000"},
                "body": {
                    "items": {"item": rows},
                    "totalCount": len(all_rows),
                },
            }
        }
        return self.rewrite(method, payload) if self.rewrite else payload


def provider(client, **settings):
    return TourDetails(
        Settings(
            _env_file=None,
            postgres_password="test",
            data_go_kr_key="test%2Bkey",
            **settings,
        ),
        client=client,
    )


def test_full_detail_fields_keep_semantics_identity_source_time_and_plain_text():
    client = Client()
    batch = provider(client).fetch(place())
    detail = batch.place_details[0]
    assert len(client.calls) == 3
    assert client.calls[0][1]["serviceKey"] == "test+key"
    assert detail.source_id == "100" and detail.content_type == "12"
    assert detail.opening_hours == "09:00~18:00\n계절별 확인"
    assert detail.opening_date == "1990년" and detail.opening_period is None
    assert detail.rest_days == "월요일" and detail.parking == "주차장 있음"
    assert detail.facilities == "이용가능시설: 샤워장\n화장실"
    assert detail.contact == "033-000-0000"
    assert detail.overview == "원천 소개"
    assert detail.homepage == "https://example.com/beach"
    assert detail.source_modified_at.isoformat() == "2024-09-21T12:34:56+09:00"
    assert detail.photo_url == PHOTO.replace("http:", "https:")
    assert detail.photo_license == "Type1"
    assert any(
        entry.label == "입장료" and entry.value == "무료" for entry in detail.details
    )
    assert not batch.places and not batch.readings


def test_empty_source_is_successful_empty_and_stops_after_one_call():
    client = Client(empty=True)
    detail = provider(client).fetch(place()).place_details[0]
    assert detail.availability == "empty" and detail.opening_hours is None
    assert len(client.calls) == 1


def test_foreign_record_uses_matching_service_and_content_type():
    client = Client(common={"contenttypeid": "76"}, intro={"useseason": "Summer"})
    detail = (
        provider(client)
        .fetch(place(provider="tourapi_english", category="76"))
        .place_details[0]
    )
    assert all("/EngService2/" in url for url, _ in client.calls)
    assert detail.opening_period == "Summer"


def test_unknown_fields_are_not_stored_and_type_specific_fields_do_not_leak():
    client = Client(intro={"arbitrary_payload": "secret", "opentimefood": "wrong"})
    detail = provider(client).fetch(place()).place_details[0]
    serialized = detail.model_dump_json()
    assert "secret" not in serialized and "wrong" not in serialized


@pytest.mark.parametrize(
    "field,value,code",
    [
        ("contentid", "999", "DETAIL_ID_MISMATCH"),
        ("contenttypeid", "39", "DETAIL_TYPE_MISMATCH"),
    ],
)
def test_inconsistent_identity_fails_whole_batch(field, value, code):
    with pytest.raises(ProviderError, match=code):
        provider(Client(intro={field: value})).fetch(place())


def test_provider_errors_and_incomplete_repeated_information_never_become_empty():
    client = Client()
    client.rewrite = lambda method, payload: (
        {"response": {"header": {"resultCode": "30"}}}
        if method == "detailIntro2"
        else payload
    )
    with pytest.raises(ProviderError, match="PROVIDER_30"):
        provider(client).fetch(place())
    client = Client()

    def incomplete(method, payload):
        if method == "detailInfo2":
            payload["response"]["body"]["totalCount"] = 3
        return payload

    client.rewrite = incomplete
    with pytest.raises(ProviderError, match="INCOMPLETE_PAGINATION"):
        provider(client).fetch(place())


def test_repeated_information_paginates_with_a_bound_and_complete_count():
    extra = [
        {"serialnum": str(n), "infoname": f"시설 {n}", "infotext": "제공됨"}
        for n in range(101)
    ]
    client = Client(extra=extra)
    detail = provider(client).fetch(place()).place_details[0]
    assert len([field for field in detail.details if field.section == "info"]) == 101
    assert len(client.calls) == 4 and client.calls[-1][1]["pageNo"] == 2
    client = Client(extra=extra * 5)
    with pytest.raises(ProviderError, match="DETAIL_RECORD_LIMIT"):
        provider(client).fetch(place())


def test_html_and_private_urls_are_never_renderable_markup_or_public_links():
    assert plain("<style>hidden</style><p>A &amp; B</p>") == "A & B"
    assert plain("source https://example.com/?serviceKey=secret") == "source"
    for value in [
        "javascript:alert(1)",
        "https://user:pass@example.com/",
        "https://example.com/?token=private",
        "http://example.com/",
    ]:
        assert homepage(value) is None


def test_unsupported_content_does_not_call_provider():
    client = Client()
    with pytest.raises(ProviderError, match="UNSUPPORTED_CONTENT_TYPE"):
        provider(client).fetch(place(category="999"))
    assert not client.calls
