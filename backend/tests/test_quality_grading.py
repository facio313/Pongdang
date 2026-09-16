"""Published WQI grade boundaries; no invented concentration-unit conversions."""

import pytest

from app.quality.grading import grade_from_wqi, parse_grade, resolve_grade


@pytest.mark.parametrize(
    "score,expected",
    [
        (20, 1),
        (23, 1),
        (24, 2),
        (33, 2),
        (34, 3),
        (46, 3),
        (47, 4),
        (59, 4),
        (60, 5),
        (100, 5),
    ],
)
def test_wqi_boundaries(score, expected):
    assert grade_from_wqi(score) == expected


@pytest.mark.parametrize(
    "value", [None, True, False, -1, 0, 19, 101, 23.5, "NaN", "inf", "–", ""]
)
def test_invalid_wqi_is_not_rounded_or_filled(value):
    assert grade_from_wqi(value) is None


@pytest.mark.parametrize(
    "value,expected",
    [
        (1, 1),
        ("2", 2),
        ("3.0", 3),
        ("Ⅳ", 4),
        ("Ⅴ", 5),
        ("II", 2),
        (True, None),
        ("NaN", None),
        (0, None),
        (6, None),
        (2.5, None),
    ],
)
def test_official_grade_normalization(value, expected):
    assert parse_grade(value) == expected


def metric(name, value, **changes):
    return {
        "name": name,
        "numeric_value": value,
        "text_value": None,
        "is_missing": False,
        **changes,
    }


def test_layer_duplicates_agree_and_official_index_can_supply_missing_grade():
    grade = metric("official_wqi_grade", 2, text_value="2")
    assert resolve_grade([grade, grade]) == (2, None, "official_grade", [])
    assert resolve_grade([metric("official_wqi_index", 47)]) == (
        4,
        47,
        "official_wqi_index",
        [],
    )
    assert resolve_grade([grade, metric("official_wqi_index", 33)]) == (
        2,
        33,
        "official_grade",
        [],
    )


def test_conflict_and_invalid_evidence_never_select_better_grade():
    for rows in [
        [metric("official_wqi_grade", 1), metric("official_wqi_grade", 2)],
        [metric("official_wqi_grade", 1), metric("official_wqi_index", 60)],
        [metric("official_wqi_grade", 2, text_value="5")],
        [metric("official_wqi_grade", 6), metric("official_wqi_index", 20)],
        [metric("official_wqi_index", 24), metric("official_wqi_index", 25)],
    ]:
        assert resolve_grade(rows) == (
            None,
            None,
            "none",
            ["conflicting_or_invalid_wqi"],
        )


def test_incomplete_chemistry_is_not_an_invented_water_quality_grade():
    rows = [
        metric("ph", 8),
        metric("water_temperature", 24),
        metric("dissolved_oxygen", 8),
    ]
    assert resolve_grade(rows) == (None, None, "none", ["official_wqi_not_provided"])
