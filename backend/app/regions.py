"""Administrative aliases for read filters; provider text stays unchanged.

Only explicit address/region text establishes membership. Coordinates, place
names, nearest stations and collection search centres are not boundary evidence.
"""

import re
from typing import Literal

ProvinceCode = Literal["gangwon"]
DistrictCode = Literal[
    "chuncheon",
    "wonju",
    "gangneung",
    "donghae",
    "taebaek",
    "sokcho",
    "samcheok",
    "hongcheon",
    "hoengseong",
    "yeongwol",
    "pyeongchang",
    "jeongseon",
    "cheorwon",
    "hwacheon",
    "yanggu",
    "inje",
    "goseong",
    "yangyang",
]
DISTRICTS = (
    ("chuncheon", "춘천시"),
    ("wonju", "원주시"),
    ("gangneung", "강릉시"),
    ("donghae", "동해시"),
    ("taebaek", "태백시"),
    ("sokcho", "속초시"),
    ("samcheok", "삼척시"),
    ("hongcheon", "홍천군"),
    ("hoengseong", "횡성군"),
    ("yeongwol", "영월군"),
    ("pyeongchang", "평창군"),
    ("jeongseon", "정선군"),
    ("cheorwon", "철원군"),
    ("hwacheon", "화천군"),
    ("yanggu", "양구군"),
    ("inje", "인제군"),
    ("goseong", "고성군"),
    ("yangyang", "양양군"),
)
LEGAL_DISTRICT_CODES = {
    "chuncheon": "110",
    "wonju": "130",
    "gangneung": "150",
    "donghae": "170",
    "taebaek": "190",
    "sokcho": "210",
    "samcheok": "230",
    "hongcheon": "720",
    "hoengseong": "730",
    "yeongwol": "750",
    "pyeongchang": "760",
    "jeongseon": "770",
    "cheorwon": "780",
    "hwacheon": "790",
    "yanggu": "800",
    "inje": "810",
    "goseong": "820",
    "yangyang": "830",
}
# Official areaCode2(areaCode=32), retained for already collected foreign rows.
LEGACY_DISTRICT_CODES = {
    "gangneung": "1",
    "goseong": "2",
    "donghae": "3",
    "samcheok": "4",
    "sokcho": "5",
    "yanggu": "6",
    "yangyang": "7",
    "yeongwol": "8",
    "wonju": "9",
    "inje": "10",
    "jeongseon": "11",
    "cheorwon": "12",
    "chuncheon": "13",
    "taebaek": "14",
    "pyeongchang": "15",
    "hongcheon": "16",
    "hwacheon": "17",
    "hoengseong": "18",
}
PROVINCE_ALIASES = (
    "강원특별자치도",
    "강원도",
    "강원",
    "gangwon",
    "gangwon-do",
    "gangwon do",
    "gangwon state",
    "gangwon special self-governing province",
    "江原特別自治道",
    "江原道",
)


def _token(alternatives):
    # PostgreSQL ARE and Python both understand these expressions. All patterns
    # are passed as parameters; no user text is interpolated into SQL.
    return r"(^|[\s,;/])(" + "|".join(map(re.escape, alternatives)) + r")($|[\s,;/])"


PROVINCE_PATTERN = _token(
    (
        *PROVINCE_ALIASES,
        *("51:" + value for value in LEGAL_DISTRICT_CODES.values()),
        *("32:" + value for value in LEGACY_DISTRICT_CODES.values()),
    )
)
DISTRICT_PATTERNS = {
    code: _token(
        (
            label,
            label[:-1],
            code,
            code + ("-si" if label[-1] == "시" else "-gun"),
            "51:" + LEGAL_DISTRICT_CODES[code],
            "32:" + LEGACY_DISTRICT_CODES[code],
        )
    )
    for code, label in DISTRICTS
}
# A conflicting explicit province blocks district-only inference. This avoids
# treating an address with a similarly named road/business as administrative data.
OTHER_PROVINCE_PATTERN = _token(
    (
        "서울",
        "서울시",
        "서울특별시",
        "부산",
        "부산시",
        "부산광역시",
        "대구",
        "대구광역시",
        "인천",
        "인천광역시",
        "광주",
        "광주광역시",
        "대전",
        "대전광역시",
        "울산",
        "울산광역시",
        "세종",
        "세종특별자치시",
        "경기",
        "경기도",
        "충북",
        "충청북도",
        "충남",
        "충청남도",
        "전북",
        "전라북도",
        "전북특별자치도",
        "전남",
        "전라남도",
        "경북",
        "경상북도",
        "경남",
        "경상남도",
        "제주",
        "제주도",
        "제주특별자치도",
        "gyeongsangnam-do",
        "gyeongsangbuk-do",
        "gyeonggi-do",
        "seoul",
        "busan",
        "jeju-do",
    )
)
# Bare 고성/Goseong is ambiguous with Gyeongsangnam-do. Bare 동해/Donghae
# also denotes the sea; only 동해시/Donghae-si is administrative evidence alone.
UNIQUE_DISTRICT_PATTERNS = {
    code: pattern
    for code, pattern in DISTRICT_PATTERNS.items()
    if code not in {"goseong", "donghae"}
} | {"donghae": _token(("동해시", "donghae-si"))}
UNIQUE_PATTERN = "(" + "|".join(UNIQUE_DISTRICT_PATTERNS.values()) + ")"


def district_code_from_name(name):
    return next(
        (code for code, label in DISTRICTS if name in {code, label, label[:-1]}), None
    )


def region_options():
    return {
        "provinces": [
            {
                "code": "gangwon",
                "label": "강원특별자치도",
                "districts": [
                    {"code": code, "label": label} for code, label in DISTRICTS
                ],
            }
        ]
    }


def administrative_codes(address=None, region=None):
    text = " ".join(value for value in (address, region) if value)
    if re.search(OTHER_PROVINCE_PATTERN, text, re.I):
        return None, None
    explicit = bool(re.search(PROVINCE_PATTERN, text, re.I))
    if not explicit and not re.search(UNIQUE_PATTERN, text, re.I):
        return None, None
    found = [
        code
        for code, pattern in DISTRICT_PATTERNS.items()
        if re.search(pattern, text, re.I)
    ]
    return "gangwon", found[0] if len(found) == 1 else None


def region_query(query):
    """Resolve complete aliases; free text and ambiguous Goseong stay free text."""
    value = query.strip().lower()
    if value in PROVINCE_ALIASES:
        return "gangwon", None
    for code, label in DISTRICTS:
        aliases = (
            code,
            label,
            label[:-1],
            code + ("-si" if label[-1] == "시" else "-gun"),
        )
        if value in aliases and code not in {"goseong", "donghae"}:
            return "gangwon", code
        if code == "donghae" and value in {"동해시", "donghae-si"}:
            return "gangwon", code
        if value in {f"{p} {alias}" for p in PROVINCE_ALIASES for alias in aliases}:
            return "gangwon", code
    return None


def administrative_predicate(*, province="gangwon", district=None, alias="s"):
    if province != "gangwon" or district not in {None, *DISTRICT_PATTERNS}:
        raise ValueError("Unknown administrative region")
    if alias not in {"s", "p"}:
        raise ValueError("Unknown query alias")
    text = f"concat_ws(' ',{alias}.address,{alias}.region)"
    predicate = f"({text} !~* %s AND ({text} ~* %s OR {text} ~* %s))"
    params = [OTHER_PROVINCE_PATTERN, PROVINCE_PATTERN, UNIQUE_PATTERN]
    if district is not None:
        predicate += f" AND {text} ~* %s"
        params.append(DISTRICT_PATTERNS[district])
        # Match administrative_codes: conflicting provider codes/address text
        # retain the province but cannot establish either individual district.
        other_districts = (
            "("
            + "|".join(
                pattern
                for code, pattern in DISTRICT_PATTERNS.items()
                if code != district
            )
            + ")"
        )
        predicate += f" AND {text} !~* %s"
        params.append(other_districts)
        if district == "goseong":
            predicate += f" AND {text} ~* %s"
            params.append(PROVINCE_PATTERN)
    metadata_alias = "r" if alias == "s" else "p"
    prefix = "" if alias == "s" else "verified_"
    province_column = f"{metadata_alias}.{prefix}province_code"
    district_column = f"{metadata_alias}.{prefix}district_code"
    verified = f"{province_column}=%s"
    verified_params = [province]
    if district is not None:
        verified += f" AND {district_column}=%s"
        verified_params.append(district)
    return (
        f"(CASE WHEN {province_column} IS NOT NULL THEN ({verified}) "
        f"ELSE ({predicate}) END)",
        [*verified_params, *params],
    )


# Shared join for verified coordinate-to-administration evidence. A later source
# coordinate change invalidates that evidence until an explicit refresh.
PLACE_REGION_JOIN = (
    " LEFT JOIN pongdang_data.collection_place_region r ON r.spot_id=s.id "
    "AND r.latitude=s.lat AND r.longitude=s.lng AND r.verified_at<=now() "
)


def district_group_expression():
    """District grouping after the Gangwon filter, with unknown as its own group."""
    matches = ",".join(["(%s,%s)"] * len(DISTRICT_PATTERNS))
    params = [value for item in DISTRICT_PATTERNS.items() for value in item]
    return (
        "CASE WHEN r.province_code IS NOT NULL THEN r.district_code ELSE "
        "(SELECT CASE WHEN count(*)=1 THEN min(code) ELSE NULL END "
        f"FROM (VALUES {matches}) AS district_matches(code,pattern) "
        "WHERE concat_ws(' ',s.address,s.region) ~* pattern) END",
        params,
    )


def place_search_predicate(query, *, alias="s"):
    if alias not in {"s", "p"}:
        raise ValueError("Unknown query alias")
    scope = region_query(query)
    if scope:
        return administrative_predicate(
            province=scope[0], district=scope[1], alias=alias
        )
    # position is a literal, case-insensitive substring, including % and _.
    return (
        f"position(lower(%s) in lower(concat_ws(' ',{alias}.name,"
        f"{alias}.address,{alias}.region)))>0",
        [query.strip()],
    )


def search_aliases(query):
    """Generic raw-table search aliases, without altering stored provider values."""
    scope = region_query(query)
    if not scope:
        return [query]
    if scope[1] is None:
        return ["강원", "gangwon", "江原"]
    label = dict(DISTRICTS)[scope[1]]
    return [label[:-1], scope[1]]
