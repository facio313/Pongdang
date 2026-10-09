"""평가 지원·추천 후보·관심사 선택지는 별도 집합이며 기록 호환을 보존합니다.

새 선택지에서는 래프팅 대신 물길 걷기를 제공하지만, 저장된 래프팅 코스와
직접 평가 API는 계속 읽을 수 있습니다.
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
    # 지원 범위는 줄지 않습니다. 카탈로그는 여전히 갯벌을 평가할 수 있습니다.
    assert "mudflat" in ACTIVITIES
    assert "rafting" not in RECOMMENDED_ACTIVITIES
    assert "rafting" in ACTIVITIES
    assert "walk" in RECOMMENDED_ACTIVITIES


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


@pytest.mark.parametrize("kind", ["beach", "valley", "lake", "river", "reservoir"])
def test_walking_candidates_cover_water_places_without_asserting_access(kind):
    request = SimpleNamespace(locale="ko", activity="walk", keyword_selection=[])
    options = activity_options(request, {"catalog_tags": [], "kind": kind})
    assert [row["activity"] for row in options] == ["walk"]
    assert options[0]["status"] == "unverified"


def test_retired_rafting_keywords_still_load_saved_trips_without_becoming_walks():
    from app.travel.keywords import normalize
    from app.travel.models import TravelRequest

    request = TravelRequest(
        activity="rafting",
        keyword_selection=[{"category": "activity", "values": ["rafting"]}],
    )
    assert normalize(request).activity == "rafting"
    assert activity_options(request, {"catalog_tags": [], "kind": "river"}) == []
