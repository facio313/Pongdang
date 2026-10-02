"""개장 기간 서술을 월·일 구간으로 읽습니다. 읽지 못하면 읽지 못했다고 합니다.

관광정보의 개장 기간(`opening_period` ← TourAPI `openperiod` · `useseason`)은
자유 서술입니다. 「2024.07.12~2024.08.18」 처럼 날짜인 것도, 「7월 중순~8월
중순」 처럼 어림인 것도, 「하절기」 처럼 **구간이라고 할 수 없는** 것도 섞여
있습니다.

10월에 해수욕장에서 「오늘 가장 좋은 활동: 수영」이 나오고 그 아래에 「이용시간
상시 개방」이 적혀 있으면, 숫자가 맞든 틀리든 화면 전체를 믿을 수 없게 됩니다.
그래서 이 모듈이 생겼습니다.

**세 가지 답만 냅니다**: 개장 기간 안(`in_season`) · 밖(`out_of_season`) ·
**확인 불가**(`unconfirmed`). 확인 불가는 폐장의 증거가 아닙니다 -- 없는 값을
「닫혔다」로 바꾸지 않습니다. 그 판단을 어떻게 쓸지는 `water_index.recommendation`
의 규칙표가 정합니다.

DB · 시계 · FastAPI 를 모르는 순수 함수입니다. 오늘 날짜는 인자로 받습니다
(KST 변환은 부르는 쪽의 몫). 한국어 문장도 만들지 않습니다 -- 숫자와 enum,
그리고 원문을 그대로 돌려줄 뿐이고, 문구는 프론트엔드 사전 한 곳에 모입니다
(`recommendationText.ts`).
"""

import re
import unicodedata
from calendar import monthrange
from dataclasses import dataclass, field
from datetime import date
from typing import Literal

#: 서술에서 읽어 낸 구간의 정밀도.
#:
#: - `day` — 일까지 적혀 있었음 (「7.12~8.18」)
#: - `part_month` — 초·중·말 어림 (「7월 중순~8월 중순」)
#: - `month` — 월만 (「7월~8월」)
#: - `year_round` — 연중 개방 서술
Precision = Literal["day", "part_month", "month", "year_round"]

#: 연도를 어떻게 읽었는지.
#:
#: - `annual` — 연도가 적혀 있지 않아 매년 반복으로 읽음
#: - `explicit_year` — 올해 연도가 적혀 있었음
#: - `past_year` — **지난 연도**가 적혀 있었음. 월·일 창으로만 씁니다
YearBasis = Literal["annual", "explicit_year", "past_year"]

SeasonStatus = Literal["in_season", "out_of_season", "unconfirmed"]

#: 초 · 중 · 말 을 며칠로 볼지. **퐁당 제품 규칙이며 검증된 기준이 아닙니다.**
#: 상류가 「중순」이라고만 적었으므로 어느 날짜로 읽든 이쪽이 정한 것입니다.
PART_MONTH_START = {"초": 1, "중": 11, "말": 21}
#: 「말」의 끝은 그 달의 마지막 날입니다(월마다 다름).
PART_MONTH_END: dict[str, int | None] = {"초": 10, "중": 20, "말": None}
#: 서술에 쓰이는 말을 위 세 가지로 모읍니다.
_PART_WORDS = {
    "초": "초",
    "상순": "초",
    "중": "중",
    "중순": "중",
    "말": "말",
    "하순": "말",
}

#: 연중 개방을 뜻하는 서술. 이 목록에 없는 말은 **추측하지 않습니다**.
YEAR_ROUND_WORDS = (
    "연중",
    "상시",
    "사계절",
    "연중개방",
    "연중무휴",
    "연중개장",
    "항시",
)

#: 구간이 아니라서 읽을 수 없는 서술. 섞여 들어오는 것을 알고 있으므로 따로
#: 적어 둡니다 -- 「하절기」가 7~8월이라고 **짐작하지 않기** 위해서입니다.
UNREADABLE_WORDS = (
    "하절기",
    "동절기",
    "미정",
    "별도",
    "공지",
    "문의",
    "협의",
    "예정",
    "확인",
)

#: 읽을 서술의 길이 상한. 이보다 길면 개장 기간이 아니라 안내문입니다.
MAX_SOURCE_LENGTH = 200
#: 한 서술에서 읽을 구간 수 상한.
MAX_WINDOWS = 4
#: 구간 하나의 길이 상한(일). 이보다 길면 구간이 아니라 「연중」에 가깝고,
#: 잘못 읽었을 가능성이 높습니다.
MAX_WINDOW_DAYS = 300

_SEPARATORS = "∼～〜ー–—~"
_SEGMENT_SPLIT = re.compile(r"[,，/·]|및|그리고")
_LEADING_NOISE = re.compile(
    r"^(?:매년|개장\s*기간|이용\s*기간|운영\s*기간|기간)\s*[:：]?\s*"
)
_TRAILING_NOTE = re.compile(r"[(（\[【].*$")
_WHITESPACE = re.compile(r"\s+")

#: 「2024.07.12」 · 「2024-7-12」 · 「2024년 7월 12일」
_FULL_DATE = re.compile(
    r"(?P<year>\d{4})\s*[.\-/년]\s*(?P<month>\d{1,2})\s*[.\-/월]\s*(?P<day>\d{1,2})\s*일?"
)
#: 「7.12」 · 「7-12」 · 「7월 12일」. 월 표시가 없는 「7-12」는 쓰지 않습니다.
_MONTH_DAY = re.compile(r"(?P<month>\d{1,2})\s*[.월]\s*(?P<day>\d{1,2})\s*일?")
#: 「7월」 · 「7월 중순」 · 「7월초」
_MONTH_PART = re.compile(
    r"(?P<month>\d{1,2})\s*월\s*(?P<part>초|중순|중|말|하순|상순)?"
)


@dataclass(frozen=True)
class SeasonWindow:
    """한 해 안의 개장 구간. 연도를 넘는 구간(12.20~2.10)도 그대로 둡니다."""

    start_month: int
    start_day: int
    end_month: int
    end_day: int
    precision: Precision
    year: int | None = None

    def contains(self, day: date) -> bool:
        """`day` 가 이 구간 안인가. 양 끝을 포함하고 연도 경계를 넘습니다."""
        start = (self.start_month, self.start_day)
        end = (self.end_month, self.end_day)
        today = (day.month, day.day)
        if start <= end:
            return start <= today <= end
        # 「12.20~2.10」 처럼 해를 넘는 구간.
        return today >= start or today <= end

    def length_days(self) -> int:
        """구간 길이의 어림값. 윤년을 따지지 않습니다(상한 검사용)."""

        def ordinal(month: int, day: int) -> int:
            # 달마다 31일로 셉니다. 실제 날수가 아니라 「너무 길다」를 가리는
            # 단조 함수면 충분합니다.
            return month * 31 + day

        start = ordinal(self.start_month, self.start_day)
        end = ordinal(self.end_month, self.end_day)
        return end - start if start <= end else (12 * 31 + 31) - start + end


@dataclass(frozen=True)
class ParsedSeason:
    """서술을 읽은 결과. 읽지 못했으면 `windows` 가 비어 있습니다."""

    windows: tuple[SeasonWindow, ...] = ()
    source_field: Literal["opening_period", "opening_date"] | None = None
    raw: str | None = None
    year_basis: YearBasis | None = None
    #: 적힌 연도가 올해보다 몇 해 전인지. `year_basis="past_year"` 일 때만.
    stale_years: int | None = None
    reason_codes: tuple[str, ...] = field(default_factory=tuple)

    @property
    def readable(self) -> bool:
        return bool(self.windows)


def _normalize(value: str) -> str:
    text = unicodedata.normalize("NFKC", value)
    for separator in _SEPARATORS:
        text = text.replace(separator, "~")
    text = text.replace("부터", "~").replace("까지", "")
    text = _WHITESPACE.sub(" ", text).strip()
    text = _LEADING_NOISE.sub("", text)
    return text.strip(" ※*:：-").strip()


def _last_day(month: int, year: int | None) -> int:
    # 연도가 없으면 윤년을 가정하지 않습니다. 2월 말은 28일로 둡니다 --
    # 개장 기간에 2월 29일이 끝인 해수욕장은 없고, 있어도 하루 차이로 판정이
    # 뒤집히는 자리가 아닙니다(아래 contains 는 양 끝 포함).
    return monthrange(year or 2001, month)[1]


def _valid(month: int, day: int, year: int | None) -> bool:
    return 1 <= month <= 12 and 1 <= day <= _last_day(month, year)


def _part_bounds(month: int, part: str | None, *, end: bool, year: int | None):
    """「초 · 중순 · 말」을 며칠로 볼지. 없으면 그 달 전체입니다."""
    key = _PART_WORDS.get(part or "", "")
    if not key:
        return (_last_day(month, year) if end else 1), "month"
    if end:
        bound = PART_MONTH_END[key]
        return (bound if bound is not None else _last_day(month, year)), "part_month"
    return PART_MONTH_START[key], "part_month"


def _parse_segment(
    segment: str, today: date
) -> tuple[SeasonWindow | None, YearBasis | None]:
    """구간 하나를 읽습니다. 읽지 못하면 `(None, None)`."""
    segment = _TRAILING_NOTE.sub("", segment).strip()
    if not segment:
        return None, None
    if any(word in segment for word in UNREADABLE_WORDS):
        return None, None
    if any(word in segment.replace(" ", "") for word in YEAR_ROUND_WORDS):
        return SeasonWindow(1, 1, 12, 31, "year_round"), "annual"
    if "~" not in segment:
        # 구간이 아닌 한 날짜(「2024.07.12」)는 개장 **기간**이 아닙니다.
        return None, None
    head, _, tail = segment.partition("~")
    head, tail = head.strip(), tail.strip()
    if not head or not tail:
        return None, None

    years: list[int] = []
    bounds: list[tuple[int, int]] = []
    precisions: list[Precision] = []
    for index, part in enumerate((head, tail)):
        end = index == 1
        full = _FULL_DATE.search(part)
        if full:
            year = int(full["year"])
            month, day = int(full["month"]), int(full["day"])
            if not (2000 <= year <= 2100) or not _valid(month, day, year):
                return None, None
            years.append(year)
            bounds.append((month, day))
            precisions.append("day")
            continue
        month_day = _MONTH_DAY.search(part)
        if month_day:
            month, day = int(month_day["month"]), int(month_day["day"])
            if not _valid(month, day, None):
                return None, None
            bounds.append((month, day))
            precisions.append("day")
            continue
        month_part = _MONTH_PART.search(part)
        if month_part:
            month = int(month_part["month"])
            if not 1 <= month <= 12:
                return None, None
            day, precision = _part_bounds(month, month_part["part"], end=end, year=None)
            bounds.append((month, day))
            precisions.append(precision)
            continue
        if end and bounds:
            # 「7.1~31」 처럼 끝쪽에 일만 적힌 꼴. 시작 월을 이어 씁니다.
            day_only = re.fullmatch(r"(\d{1,2})\s*일?", part)
            if day_only:
                month = bounds[0][0]
                day = int(day_only[1])
                if not _valid(month, day, None):
                    return None, None
                bounds.append((month, day))
                precisions.append("day")
                continue
        return None, None

    if len(bounds) != 2:
        return None, None
    # 끝쪽에만 연도가 적힌 「7.1~2026.8.23」은 그 연도를 구간의 연도로 봅니다.
    year = max(years) if years else None
    basis: YearBasis = (
        "annual"
        if year is None
        else "explicit_year"
        if year >= today.year
        else "past_year"
    )
    precision: Precision = (
        "day"
        if all(p == "day" for p in precisions)
        else "part_month"
        if "part_month" in precisions
        else "month"
    )
    window = SeasonWindow(
        bounds[0][0], bounds[0][1], bounds[1][0], bounds[1][1], precision, year
    )
    if window.length_days() > MAX_WINDOW_DAYS:
        return None, None
    return window, basis


def parse_opening_season(
    opening_period: str | None,
    opening_date: str | None,
    today: date,
) -> ParsedSeason:
    """개장 기간 서술을 구간으로 읽습니다.

    `opening_date` 는 `opening_period` 가 **비어 있을 때만** 봅니다. 둘을 합치지
    않습니다 -- 서로 다른 상류 필드이고, 하나가 다른 하나를 보정한다는 근거가
    없습니다. 어느 쪽을 읽었는지는 `source_field` 에 남습니다.
    """
    for name, value in (
        ("opening_period", opening_period),
        ("opening_date", opening_date),
    ):
        if value is None or not value.strip():
            continue
        text = _normalize(value)
        if not text:
            continue
        if len(text) > MAX_SOURCE_LENGTH:
            return ParsedSeason(
                source_field=name,  # type: ignore[arg-type]
                raw=value[:MAX_SOURCE_LENGTH],
                reason_codes=("opening_period_unparsed",),
            )
        segments = [s.strip() for s in _SEGMENT_SPLIT.split(text) if s.strip()]
        if not segments or len(segments) > MAX_WINDOWS:
            return ParsedSeason(
                source_field=name,  # type: ignore[arg-type]
                raw=text,
                reason_codes=("opening_period_unparsed",),
            )
        windows: list[SeasonWindow] = []
        bases: list[YearBasis] = []
        for segment in segments:
            window, basis = _parse_segment(segment, today)
            if window is None:
                # 한 조각이라도 읽지 못하면 전체를 읽지 못한 것으로 둡니다.
                # 읽은 조각만으로 판정하면 「7.1~7.14 그리고 별도 공지」를
                # 「7월 15일은 폐장」으로 단정하게 됩니다.
                return ParsedSeason(
                    source_field=name,  # type: ignore[arg-type]
                    raw=text,
                    reason_codes=("opening_period_unparsed",),
                )
            windows.append(window)
            bases.append(basis or "annual")
        year_basis: YearBasis = (
            "past_year"
            if "past_year" in bases
            else "explicit_year"
            if "explicit_year" in bases
            else "annual"
        )
        stale = None
        codes = ["opening_period_is_not_an_official_schedule"]
        if year_basis == "past_year":
            stale = today.year - max(w.year for w in windows if w.year)
            # 적힌 연도는 지났지만 월·일 창은 해마다 거의 같습니다. 그 사실을
            # 숨기지 않고 코드로 함께 내립니다.
            codes.append("opening_period_from_past_year")
        return ParsedSeason(
            windows=tuple(windows),
            source_field=name,  # type: ignore[arg-type]
            raw=text,
            year_basis=year_basis,
            stale_years=stale,
            reason_codes=tuple(codes),
        )
    return ParsedSeason(reason_codes=("opening_period_missing",))


def season_status(parsed: ParsedSeason, today: date) -> SeasonStatus:
    """읽은 구간으로 오늘을 판정합니다. 읽지 못했으면 `unconfirmed`."""
    if not parsed.readable:
        return "unconfirmed"
    return (
        "in_season"
        if any(window.contains(today) for window in parsed.windows)
        else "out_of_season"
    )
