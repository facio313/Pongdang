"""개장 기간 서술을 읽는 파서의 소프트웨어 검증.

DB 도 시계도 보지 않습니다. 오늘 날짜를 인자로 받으므로 「10월 2일의 경포」를
그대로 한 줄로 적을 수 있습니다.
"""

from datetime import date

import pytest

from app.place_details.season import (
    MAX_SOURCE_LENGTH,
    parse_opening_season,
    season_status,
)

OCTOBER = date(2026, 10, 2)
MIDSUMMER = date(2026, 7, 25)


def read(period, today=OCTOBER, opening_date=None):
    return parse_opening_season(period, opening_date, today)


def status(period, today=OCTOBER, opening_date=None):
    return season_status(read(period, today, opening_date), today)


def window(period, today=OCTOBER):
    parsed = read(period, today)
    assert parsed.readable, period
    return parsed.windows[0]


def test_a_dated_period_is_read_to_the_day():
    for text in (
        "2024.07.12~2024.08.18",
        "2024-07-12~2024-08-18",
        "2024년 7월 12일~8월 18일",
        "매년 2024.07.12 ~ 2024.08.18",
    ):
        one = window(text)
        assert (one.start_month, one.start_day) == (7, 12), text
        assert (one.end_month, one.end_day) == (8, 18), text
        assert one.precision == "day", text


def test_a_period_without_a_year_repeats_every_year():
    one = window("7.1~8.31")
    assert (one.start_month, one.start_day, one.end_month, one.end_day) == (7, 1, 8, 31)
    assert one.year is None
    assert read("7.1~8.31").year_basis == "annual"
    assert window("7월 1일~8월 31일").precision == "day"


def test_months_alone_cover_whole_months():
    for text in ("7월~8월", "7월 ~ 8월"):
        one = window(text)
        assert (one.start_month, one.start_day, one.end_month, one.end_day) == (
            7,
            1,
            8,
            31,
        ), text
        assert one.precision == "month", text


def test_a_part_of_a_month_uses_a_declared_product_rule():
    mid = window("7월 중순~8월 중순")
    assert (mid.start_month, mid.start_day) == (7, 11)
    assert (mid.end_month, mid.end_day) == (8, 20)
    assert mid.precision == "part_month"
    edges = window("매년 7월초~8월말")
    assert (edges.start_month, edges.start_day, edges.end_month, edges.end_day) == (
        7,
        1,
        8,
        31,
    )
    # 2월 말은 그 달의 마지막 날입니다.
    assert window("1월초~2월말").end_day == 28


def test_an_explicit_year_is_separated_from_a_past_one():
    future = read("2026-07-01~2026-08-23")
    assert future.year_basis == "explicit_year"
    assert future.stale_years is None
    assert "opening_period_from_past_year" not in future.reason_codes

    past = read("2024.07.12~2024.08.18")
    assert past.year_basis == "past_year"
    assert past.stale_years == 2
    # 지난 연도라는 사실을 숨기지 않습니다. 그래도 월·일 창으로는 씁니다.
    assert "opening_period_from_past_year" in past.reason_codes
    assert season_status(past, MIDSUMMER) == "in_season"


def test_year_round_wording_is_in_season_on_any_day():
    for text in ("연중", "상시", "사계절", "연중무휴", "연중 개장"):
        assert status(text) == "in_season", text
        assert window(text).precision == "year_round", text
    assert status("연중", date(2026, 1, 1)) == "in_season"


def test_several_windows_in_one_description_are_all_honoured():
    text = "7.1~7.14, 7.20~8.20"
    assert len(read(text).windows) == 2
    assert status(text, date(2026, 7, 16)) == "out_of_season"
    assert status(text, date(2026, 7, 21)) == "in_season"
    assert status(text, date(2026, 7, 5)) == "in_season"


def test_a_window_may_cross_the_new_year():
    text = "12.20~2.10"
    assert status(text, date(2026, 1, 5)) == "in_season"
    assert status(text, date(2026, 12, 25)) == "in_season"
    assert status(text, date(2026, 3, 1)) == "out_of_season"


def test_both_ends_of_a_window_are_inside_it():
    text = "7.1~8.31"
    assert status(text, date(2026, 7, 1)) == "in_season"
    assert status(text, date(2026, 8, 31)) == "in_season"
    assert status(text, date(2026, 6, 30)) == "out_of_season"
    assert status(text, date(2026, 9, 1)) == "out_of_season"


@pytest.mark.parametrize(
    "text",
    [
        None,
        "",
        "   ",
        "하절기",
        "동절기",
        "미정",
        "별도 공지",
        "해수욕장 개장시 문의",
        # 월 표시가 없는 「7~8」은 일 범위인지 월 범위인지 알 수 없습니다.
        "7~8",
        "13월~14월",
        "7.32~8.1",
        "2월 30일~3월 1일",
        # 구간이 아닌 한 날짜는 개장 **기간**이 아닙니다.
        "2024.07.12",
        # 조각이 너무 많으면 개장 기간 서술이 아닙니다.
        "7.1~7.2, 7.4~7.5, 7.7~7.8, 7.10~7.11, 7.13~7.14",
        # 300일을 넘는 구간은 잘못 읽은 것으로 봅니다.
        "1.1~12.30",
    ],
)
def test_what_cannot_be_read_stays_unconfirmed(text):
    parsed = read(text)
    assert not parsed.readable, text
    assert season_status(parsed, OCTOBER) == "unconfirmed", text


def test_a_long_notice_is_not_an_opening_period():
    parsed = read("가" * (MAX_SOURCE_LENGTH + 1))
    assert not parsed.readable
    assert "opening_period_unparsed" in parsed.reason_codes


def test_one_unreadable_segment_makes_the_whole_description_unreadable():
    # 읽은 조각만으로 판정하면 「7월 15일은 폐장」을 지어내게 됩니다.
    parsed = read("7.1~7.14 및 별도 공지")
    assert not parsed.readable
    assert "opening_period_unparsed" in parsed.reason_codes


def test_opening_date_is_a_fallback_and_never_merged():
    # opening_period 가 있으면 그것만 봅니다.
    both = parse_opening_season("7.1~8.31", "2024.06.01~2024.09.30", OCTOBER)
    assert both.source_field == "opening_period"
    assert (both.windows[0].start_month, both.windows[0].end_month) == (7, 8)
    assert len(both.windows) == 1

    # 비어 있으면 opening_date 로 물러섭니다.
    fallback = parse_opening_season("   ", "7.1~8.31", OCTOBER)
    assert fallback.source_field == "opening_date"
    assert fallback.readable

    missing = parse_opening_season(None, None, OCTOBER)
    assert missing.source_field is None
    assert "opening_period_missing" in missing.reason_codes


def test_the_parser_produces_no_korean_sentences():
    """문구는 프론트엔드 사전의 몫입니다.

    여기서 문장을 만들면 두 곳에서 말이 갈립니다.
    """
    parsed = read("2024.07.12~2024.08.18")
    assert parsed.raw == "2024.07.12~2024.08.18"
    for code in parsed.reason_codes:
        assert code.isascii(), code
    for one in parsed.windows:
        for value in (one.start_month, one.start_day, one.end_month, one.end_day):
            assert isinstance(value, int)
        assert one.precision in {"day", "part_month", "month", "year_round"}


def test_gyeongpo_in_october_is_out_of_season():
    """회귀 고정. 이 한 줄이 이 모듈이 생긴 이유입니다.

    10월 2일 경포해수욕장에서 「오늘 가장 좋은 활동: 수영 62.7」이 나오고 그
    아래에 「이용시간 상시 개방」이 적혀 있었습니다.
    """
    assert status("2024.07.12~2024.08.18", OCTOBER) == "out_of_season"
    assert status("7월 중순~8월 중순", OCTOBER) == "out_of_season"
    assert status("2024.07.12~2024.08.18", MIDSUMMER) == "in_season"
