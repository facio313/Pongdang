"""추천 후보 집합이 지원 집합과 따로 유지되는지 지킵니다.

강릉을 포함한 동해안은 서해안·남해안 같은 갯벌 지형이 발달하지 않아 mudflat 을
먼저 제안하지 않습니다. 그렇다고 지원을 끊은 것은 아니어서, 카탈로그와 API 는
여섯 활동을 그대로 평가합니다 -- 「권하지 않는다」와 「지원하지 않는다」는 다른
사실이고, 이 파일은 그 둘이 다시 뒤섞이지 않게 합니다.
"""

from types import SimpleNamespace

import pytest

from app.travel.keywords import LOOKUP, activity_options
from app.water_index.conditions import ACTIVITIES
from app.water_index.models import RECOMMENDED_ACTIVITIES

LOCALES = ("en", "ja", "zh-CN", "zh-TW")


def test_recommended_is_a_subset_of_supported_and_excludes_mudflat():
    assert set(RECOMMENDED_ACTIVITIES) <= set(ACTIVITIES)
    assert "mudflat" not in RECOMMENDED_ACTIVITIES
    # 지원 범위는 줄지 않습니다. 카탈로그는 여전히 갯벌을 평가할 수 있습니다.
    assert "mudflat" in ACTIVITIES


def test_keyword_activity_options_match_the_recommended_set():
    ids = [option["id"] for option in LOOKUP["activity"]["options"]]
    assert set(ids) == set(RECOMMENDED_ACTIVITIES)
    assert len(ids) == len(set(ids))


@pytest.mark.parametrize("locale", LOCALES)
def test_localised_labels_stay_aligned_with_the_options(locale):
    """라벨은 zip(strict=True) 위치 대응입니다. 활동을 더하거나 빼면서 번역 배열을
    같이 고치지 않으면 서핑이 다른 활동의 이름으로 보입니다."""
    ids = [option["id"] for option in LOOKUP["activity"]["options"]]
    place = {"catalog_tags": ["해변", "서핑", "온천"], "kind": "river"}
    request = SimpleNamespace(
        locale=locale,
        activity="swim",
        keyword_selection=[SimpleNamespace(category="activity", values=ids)],
    )
    rows = activity_options(request, place)
    assert [row["activity"] for row in rows] == ids
    assert all(row["label"] for row in rows)


def test_an_unrecommended_activity_is_dropped_rather_than_raising():
    """추천 목록에 없는 활동을 요청이 들고 와도 KeyError 가 아니라 조용한 제외."""
    place = {"catalog_tags": ["해변"], "kind": "beach"}
    request = SimpleNamespace(
        locale="ko",
        activity="mudflat",
        keyword_selection=[
            SimpleNamespace(category="activity", values=["mudflat", "swim"])
        ],
    )
    assert [row["activity"] for row in activity_options(request, place)] == ["swim"]
