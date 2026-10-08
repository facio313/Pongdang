"""추천 후보 집합이 지원 집합·키워드 facet 과 따로 유지되는지 지킵니다.

세 집합이 각자 다른 질문에 답합니다.

- `ACTIVITIES` -- 평가할 수 있는 활동. API 로 직접 물으면 여섯 전부 답합니다.
- `RECOMMENDED_ACTIVITIES` -- 「오늘 뭘 할까」에 올리는 활동. 동해안에 갯벌
  지형이 없어 mudflat 이, 하천 수위·유량 자료가 없어 rafting 이 빠집니다.
- 키워드 facet -- 사용자가 고르는 관심사. 「래프팅 코스를 짜 줘」는 점수가
  나오든 말든 뜻이 통합니다.

「지원하지 않는다」·「권하지 않는다」·「관심사로 고를 수 없다」는 서로 다른
사실이고, 이 파일은 셋이 다시 뒤섞이지 않게 합니다.
"""

from types import SimpleNamespace

import pytest

from app.travel.keywords import LOOKUP, activity_options
from app.water_index.conditions import ACTIVITIES
from app.water_index.models import RECOMMENDED_ACTIVITIES

LOCALES = ("en", "ja", "zh-CN", "zh-TW")


def test_recommended_is_a_subset_of_supported_and_excludes_mudflat_and_rafting():
    assert set(RECOMMENDED_ACTIVITIES) <= set(ACTIVITIES)
    assert "mudflat" not in RECOMMENDED_ACTIVITIES
    # 래프팅은 하천 수위·유량 자료가 없어 어떤 날도 점수가 나오지 않습니다.
    # 갯벌은 지형 때문이고 래프팅은 자료 때문입니다 -- 이유가 다릅니다.
    assert "rafting" not in RECOMMENDED_ACTIVITIES
    # 지원 범위는 줄지 않습니다. 카탈로그는 여전히 둘을 평가할 수 있습니다.
    assert {"mudflat", "rafting"} <= set(ACTIVITIES)


def test_keyword_activity_options_are_supported_but_need_not_be_recommended():
    """키워드 facet 과 추천 후보는 다른 집합입니다.

    키워드는 사용자가 고르는 **관심사**입니다 -- 「래프팅 가는 코스를 짜 줘」는
    점수가 나오든 말든 뜻이 통합니다. 추천 후보는 「오늘 이 장소에서 점수를 낼
    수 있는 활동」입니다. 예전에는 두 집합이 같다고 단언해 두었는데, 그러면
    자료가 없는 활동을 추천에서 뺄 때 여행 키워드까지 함께 사라집니다.

    지켜야 하는 것은 **지원 범위 안이고 중복이 없다**는 것뿐입니다.
    """
    ids = [option["id"] for option in LOOKUP["activity"]["options"]]
    assert set(ids) <= set(ACTIVITIES)
    assert "mudflat" not in ids
    assert len(ids) == len(set(ids))
    # 추천 후보는 전부 고를 수 있어야 합니다. 권하는 활동을 관심사로 못 고르면
    # 사용자가 그 코스를 요청할 길이 없습니다.
    assert set(RECOMMENDED_ACTIVITIES) <= set(ids)


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
