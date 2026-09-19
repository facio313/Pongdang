"""Versioned UI keyword catalogue; selecting a preset explicitly selects its bounds."""

VERSION = "travel-keywords.v1"
CATEGORIES = [
    {
        "id": "place_type",
        "label": "장소 유형",
        "max_selections": 4,
        "options": [
            {"id": "beach", "label": "해변", "tag": "해변"},
            {"id": "hot_spring", "label": "온천", "tag": "온천"},
            {"id": "lake", "label": "호수", "kind": "lake"},
            {"id": "river", "label": "강", "kind": "river"},
        ],
    },
    {
        "id": "activity",
        "label": "활동",
        "max_selections": 3,
        "options": [
            {"id": "relax", "label": "물 보며 쉬기", "tag": "물멍"},
            {"id": "onsen", "label": "온천", "tag": "온천"},
            {"id": "surf", "label": "서핑", "tag": "서핑"},
            {"id": "swim", "label": "수영"},
            {"id": "rafting", "label": "래프팅"},
        ],
    },
    {
        "id": "companion",
        "label": "동행",
        "max_selections": 1,
        "options": [
            {"id": "solo", "label": "혼자"},
            {"id": "couple", "label": "연인"},
            {"id": "friends", "label": "친구"},
            {"id": "family", "label": "가족"},
            {"id": "children", "label": "아이와 함께"},
        ],
    },
    {
        "id": "atmosphere",
        "label": "분위기",
        "max_selections": 4,
        "options": [
            {"id": "quiet", "label": "조용한 휴식", "tag": "조용한 휴식"},
            {"id": "nature", "label": "자연 풍경", "tag": "자연 풍경"},
            {"id": "photos", "label": "사진 촬영", "tag": "사진 촬영"},
            {"id": "avoid_crowds", "label": "인파 회피", "tag": "인파 회피"},
        ],
    },
    {
        "id": "mobility",
        "label": "이동 선호",
        "max_selections": 1,
        "options": [
            {"id": "short", "label": "구간마다 30분 이내", "max_travel_minutes": 30},
            {"id": "moderate", "label": "구간마다 60분 이내", "max_travel_minutes": 60},
            {
                "id": "flexible",
                "label": "이동시간 제한 없음",
                "max_travel_minutes": None,
            },
        ],
    },
    {
        "id": "weather",
        "label": "환경 선호",
        "max_selections": 4,
        "options": [
            {
                "id": "mild",
                "label": "기온 18~26°C 선호",
                "criterion": {
                    "metric": "air_temperature",
                    "minimum": 18.0,
                    "maximum": 26.0,
                    "weight": 1,
                },
            },
            {
                "id": "dry",
                "label": "1시간 강수량 0mm 선호",
                "criterion": {
                    "metric": "precipitation",
                    "minimum": 0.0,
                    "maximum": 0.0,
                    "weight": 1,
                },
            },
            {
                "id": "small_waves",
                "label": "관측소 파고 0~0.5m 선호",
                "criterion": {
                    "metric": "wave_height",
                    "minimum": 0.0,
                    "maximum": 0.5,
                    "weight": 1,
                },
            },
            {
                "id": "light_wind",
                "label": "풍속 0~5m/s 선호",
                "criterion": {
                    "metric": "wind_speed",
                    "minimum": 0.0,
                    "maximum": 5.0,
                    "weight": 1,
                },
            },
        ],
    },
]
LOOKUP = {c["id"]: c for c in CATEGORIES}


def validate_selection(selections):
    if len({s.category for s in selections}) != len(selections):
        raise ValueError("duplicate_keyword_category")
    for selection in selections:
        category = LOOKUP.get(selection.category)
        if category is None or len(selection.values) > category["max_selections"]:
            raise ValueError("keyword_category_or_count_invalid")
        if len(set(selection.values)) != len(selection.values) or not set(
            selection.values
        ) <= {o["id"] for o in category["options"]}:
            raise ValueError("unknown_or_duplicate_keyword")


def choices(request, category):
    return next(
        (s.values for s in request.keyword_selection if s.category == category), []
    )


def catalogue():
    return {
        "version": VERSION,
        "categories": CATEGORIES,
        "combination": "OR within a category; AND across explicit constraints",
        "environment_meaning": "user_selected_range_preferences_not_safety_thresholds",
        "stages": ["places_activities", "route_on_explicit_request"],
        "activity_availability": "requires_place_evidence",
    }


def normalize(request):
    from app.travel.models import TravelRequest

    data = request.model_dump(mode="json")
    tags = list(request.preferred_tags)
    criteria = {p.metric: p.model_dump() for p in request.environment_preferences}
    for selection in request.keyword_selection:
        category = LOOKUP[selection.category]
        for value in selection.values:
            option = next(o for o in category["options"] if o["id"] == value)
            if option.get("tag"):
                tags.append(option["tag"])
            if "criterion" in option:
                criterion = option["criterion"]
                if (
                    criterion["metric"] in criteria
                    and criteria[criterion["metric"]] != criterion
                ):
                    raise ValueError("conflicting_environment_keyword_and_range")
                criteria[criterion["metric"]] = criterion
            if selection.category == "companion":
                data["companion_type"] = value
            if selection.category == "mobility":
                data["max_travel_minutes"] = option["max_travel_minutes"]
    activities = choices(request, "activity")
    if activities:
        data["activity"] = activities[0]
    data["preferred_tags"] = list(dict.fromkeys(tags))
    data["environment_preferences"] = list(criteria.values())
    return TravelRequest.model_validate(data)


def matches_place(request, place):
    selected = choices(request, "place_type")
    if not selected:
        return True
    for option in LOOKUP["place_type"]["options"]:
        if option["id"] not in selected:
            continue
        if (
            option.get("tag") in place["catalog_tags"]
            or option.get("kind") == place["kind"]
        ):
            return True
    return False


def activity_options(request, place):
    selected = choices(request, "activity") or [request.activity]
    labels = {o["id"]: o["label"] for o in LOOKUP["activity"]["options"]}
    if request.locale != "ko":
        # 아래 배열은 labels 와 위치로 짝지어집니다(zip strict). 활동 옵션을
        # 더하거나 빼면 네 언어 배열을 같은 자리에서 함께 고쳐야 합니다.
        translations = {
            "en": [
                "Relax by the water",
                "Hot springs",
                "Surfing",
                "Swimming",
                "Rafting",
            ],
            "ja": [
                "水辺で休む",
                "温泉",
                "サーフィン",
                "水泳",
                "ラフティング",
            ],
            "zh-CN": ["水边休息", "温泉", "冲浪", "游泳", "漂流"],
            "zh-TW": ["水邊休息", "溫泉", "衝浪", "游泳", "漂流"],
        }
        labels = dict(zip(labels, translations[request.locale], strict=True))
    tags = set(place["catalog_tags"])
    kind = place["kind"]
    affinities = {
        "relax": True,
        "onsen": "온천" in tags,
        "surf": bool(tags & {"해변", "서핑"}),
        "swim": "해변" in tags,
        "rafting": kind == "river",
    }
    # 추천 목록에 없는 활동(mudflat 등)을 요청이 들고 와도 KeyError 대신 조용히
    # 거릅니다. 지원하지 않는다는 판정이 아니라, 제안하지 않는다는 뜻입니다.
    selected = [activity for activity in selected if affinities.get(activity, False)]
    # These are activities to consider at a real candidate, never an assertion
    # of permission, equipment, depth, open hours or scientific suitability.
    return [
        {
            "activity": a,
            "label": labels[a],
            "status": "unverified",
            "reason": "선택한 활동입니다. 장소의 운영·지원 근거 확인이 필요합니다.",
            "support_evidence": [],
            "safety_status": "unknown",
        }
        for a in selected
    ]
