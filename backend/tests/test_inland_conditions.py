"""Inland classification must not borrow the sea's measurements or permissions."""

import pytest
from test_condition_score import NOW, envelope, metric, source
from test_recommendation import with_score

from app.ingestion.water_tour_extra import tourism_place
from app.water_index.activity_score import calculate_activity_score
from app.water_index.condition_api import (
    ConditionQuery,
    context_providers,
    group_metric,
)
from app.water_index.condition_producer import _requested
from app.water_index.recommendation import decide


@pytest.mark.parametrize("kind", ["valley", "lake", "reservoir"])
def test_inland_profile_has_rain_and_hydrology_instead_of_sea_waves(kind):
    evidence = envelope(
        place_kind=kind, metrics=(metric(value=25.0), metric("wave_height", 0.0))
    )
    score = calculate_activity_score(evidence)
    components = {c.metric: c for c in score.components}
    assert "wave_height" not in components
    assert components["precipitation"].score is None
    assert components["river_level"].status == "unconfigured"
    assert components["river_flow"].score is None
    assert score.status == "partial"
    assert score.model_version == "1.1.0"
    allowed, requested, _ = _requested("swim", "observation", kind)
    assert "wave_height" not in allowed
    assert {"river_level", "river_flow", "precipitation"} <= requested
    assert "kma_short_forecast" in context_providers(kind)
    assert "hrfco_waterlevel" in context_providers(kind)
    assert "khoa_water_temperature" not in context_providers(kind)


def test_a_nearby_freshwater_station_is_not_automatically_the_same_lake():
    water = metric(
        "water_temperature",
        24.0,
        relation="nearby_station_context",
        distance_km=0.2,
        evidence=(source("water_temperature", 24.0, provider="nier_water_quality"),),
    )
    evidence = envelope(place_kind="lake", metrics=(), context_metrics=(water,))
    component = calculate_activity_score(evidence).components[0]
    assert component.score is None
    assert component.reason_codes == ("inland_waterbody_mapping_required",)
    mapped = water.model_copy(
        update={
            "relation": "representative_station",
            "mapping_id": "reviewed-same-waterbody",
            "distance_km": None,
        }
    )
    mapped_score = calculate_activity_score(
        envelope(place_kind="lake", metrics=(mapped,))
    )
    assert mapped_score.components[0].score is not None
    assert evidence.safety_status == "unknown"


def test_even_an_explicit_link_cannot_move_marine_water_into_an_inland_score():
    row = source(
        "water_temperature", 24.0, provider="khoa_water_temperature"
    ).model_dump() | {"revision_ambiguous": False}
    link = {
        "station_id": 1,
        "name": "Coast fixture",
        "kind": "marine_buoy",
        "relation": "station_observation_point",
        "mapping": None,
    }
    selected = group_metric(
        [row],
        link,
        ConditionQuery(spot_id=1, activity="swim", mode="observation"),
        NOW,
        NOW,
        "valley",
    )
    assert selected.status == "not_applicable" and selected.value is None
    forged = metric(
        "water_temperature",
        24.0,
        evidence=(
            source("water_temperature", 24.0, provider="khoa_water_temperature"),
        ),
    )
    assert (
        calculate_activity_score(envelope(place_kind="valley", metrics=(forged,)))
        .components[0]
        .score
        is None
    )


def test_inland_recommendation_requires_confirmed_swimming_operation():
    swim = with_score(
        envelope(
            place_kind="reservoir",
            metrics=(metric("water_temperature", 24.0), metric("precipitation", 0.0)),
        )
    )
    relax = with_score(
        envelope("relax", place_kind="reservoir", metrics=(metric(value=25.0),))
    )
    result = decide({"swim": swim, "relax": relax}, place_kind="reservoir")
    assert result.choice.activity == "relax"
    assert any(
        r.code == "inland_swimming_authorization_unconfirmed" for r in result.reasons
    )
    for activity in ("surf", "mudflat"):
        assert (
            calculate_activity_score(envelope(activity, place_kind="lake")).status
            == "blocked"
        )


@pytest.mark.parametrize(
    "name,kind",
    [("영랑호", "lake"), ("경포호(철새도래지)", "lake"), ("수양저수지", "reservoir")],
)
def test_existing_official_lake_category_is_preserved_without_name_guessing(name, kind):
    place = tourism_place(
        {
            "contentid": "127565",
            "title": name,
            "mapx": 128.58,
            "mapy": 38.22,
            "contenttypeid": "12",
            "cat3": "A01011700",
        },
        NOW,
    )
    assert place.kind == kind and place.category == "12"
    unclassified = tourism_place(
        {
            "contentid": "127565",
            "title": name,
            "mapx": 128.58,
            "mapy": 38.22,
            "contenttypeid": "12",
        },
        NOW,
    )
    assert unclassified.kind == "tourism"


def test_activity_specific_marine_products_are_filtered_before_context_limit():
    assert "khoa_surfing" not in context_providers("beach", "swim")
    assert "khoa_beach" in context_providers("beach", "swim")
    assert "koem_water_quality" not in context_providers("beach", "swim")
