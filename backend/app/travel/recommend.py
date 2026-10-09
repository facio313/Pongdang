"""B1/B3/B5 share this deterministic, explainable preference ordering."""

import asyncio
from datetime import UTC, datetime

from fastapi import HTTPException

from app.place_details.api import read_opening_seasons
from app.regions import region_query
from app.travel import keywords, storage, tokens
from app.travel.catalog import Catalog, matches_visit_intent
from app.travel.language import copy, label
from app.travel.mobility import transport_advice
from app.travel.models import (
    PreferenceMatch,
    Recommendation,
    RecommendationInput,
    RecommendationResult,
    TravelPreference,
    TravelRequest,
)
from app.travel.published import (
    PublishedEnvironmentReader,
    condition_summary,
    describe_score,
    preview_sample,
    ranking_score,
)
from app.water_index.recommendation_api import season_view

WEIGHTS = {
    "explicit": 100,
    "trip": 100,
    "mood": 80,
    "card": 60,
    "favorite": 20,
    "positive_review": 10,
    "confirmed_visit": 5,
    "region": 40,
}


def persona(preference, signals):
    terms, _ = preference_terms(TravelRequest(), preference, signals)
    tags = set(terms)
    labels = preference.persona_labels or [
        label
        for tag, label in (
            ("온천", "온천 힐러형"),
            ("서핑", "서퍼형"),
            ("자연 풍경", "자연 탐방형"),
        )
        if tag in tags
    ]
    return {
        "labels": labels,
        "status": "editable_summary" if labels else "learning",
        "text": " · ".join(labels) if labels else "아직 파악 중",
        "editable": True,
    }


def preference_terms(request, preference, signals):
    terms = {tag: "explicit" for tag in preference.tags}
    terms.update({tag: "trip" for tag in request.preferred_tags})
    if request.activity in {"onsen", "surf"}:
        terms.setdefault("온천" if request.activity == "onsen" else "서핑", "trip")
    if request.mood and request.mood.confirmed:
        for tag in request.mood.tags:
            terms.setdefault(tag, "mood")
    # Card choices are explicit choices, independent of behavioural learning.
    latest = {}
    for row in signals:
        item = row["payload"]
        if item["kind"] == "card":
            for tag in item["tags"]:
                if item["action"] != "skip":
                    latest.setdefault(tag, item["action"])
    for tag, action in latest.items():
        if action == "like":
            terms.setdefault(tag, "card")
    return terms, {tag for tag, action in latest.items() if action == "dislike"}


def confirmed_condition(place, condition):
    if condition.attribute == "kind":
        return place["kind"] == condition.value
    if condition.attribute == "region":
        return condition.value in (place["region"] or "") + (place["address"] or "")
    if condition.attribute == "tag":
        return True if condition.value in place["catalog_tags"] else None
    return None


async def beach_seasons_closed(catalog, shortlist, target):
    """후보 가운데 **개장 기간 밖으로 확인된** 해변의 spot_id.

    홈·오늘과 **같은 판정**을 씁니다(`recommendation_api.season_view`). 규칙을
    새로 쓰면 같은 해변의 개장 여부가 화면마다 달라집니다.

    `unconfirmed` 는 넣지 않습니다 -- 미확인은 폐장의 증거가 아닙니다. 해수욕장
    안내의 「연중·상시」가 개장 확인이 되지 않는 것도 그 함수가 처리하므로,
    여기서 낱말을 다시 읽지 않습니다.

    한 질의로 읽습니다. 후보 서른 곳을 하나씩 물으면 한 요청에 서른 번을
    왕복합니다.
    """
    ids = [
        row[0]["spot_id"]
        for row in shortlist
        if (row[0].get("place_kind") or row[0].get("type")) == "beach"
    ]
    if not ids:
        return set()
    async with catalog.reader.connection() as c:
        rows = await read_opening_seasons(c, ids)
    return {
        sid
        for sid in ids
        if season_view(rows.get(sid), target, place_kind="beach").status
        == "out_of_season"
    }


def rank_places(places, request, preference, signals, restrictions):
    terms, card_avoid = preference_terms(request, preference, signals)
    if len(request.visit_intents) == 1:
        place_tags = {
            "beach": "해변",
            "valley": "계곡",
            "hot_spring": "온천",
            "lake": "호수",
            "river": "강",
            "reservoir": "저수지",
        }
        requested_tag = place_tags.get(request.visit_intents[0].place_type)
        # A saved beach preference is not an unmet requirement for an explicitly
        # requested valley/cafe visit. Keep the saved profile itself unchanged.
        terms = {
            tag: source
            for tag, source in terms.items()
            if tag not in place_tags.values() or tag == requested_tag
        }
        if requested_tag:
            terms[requested_tag] = "trip"
    avoid = set(preference.avoid) | set(request.avoid) | card_avoid
    ranked, excluded = [], []
    for place in places:
        sid = place["spot_id"]
        if not keywords.matches_place(request, place) or not matches_visit_intent(
            request, place
        ):
            excluded.append(
                {"spot_id": sid, "reason": "selected_place_type_unconfirmed"}
            )
            continue
        if keywords.choices(request, "activity") and not keywords.activity_options(
            request, place
        ):
            excluded.append(
                {
                    "spot_id": sid,
                    "reason": "selected_activity_catalog_affinity_unconfirmed",
                }
            )
            continue
        blocked = [r for r in restrictions.get(sid, []) if r["blocked"]]
        failures = [
            {
                "condition": c.model_dump(),
                "status": "unknown"
                if confirmed_condition(place, c) is None
                else "not_matched",
            }
            for c in request.required
            if confirmed_condition(place, c) is not True
        ]
        if blocked or failures or avoid.intersection(place["catalog_tags"]):
            excluded.append(
                {
                    "spot_id": sid,
                    "reason": "official_restriction"
                    if blocked
                    else "required_condition_unconfirmed"
                    if failures
                    else "avoid_preference",
                    "conditions": failures,
                    "evidence": blocked,
                }
            )
            continue
        # Explainable category affinity, not an assertion that water entry,
        # tranquillity or photography permissions have been verified.
        aliases = {"물멍": "해변"}
        matches = [
            PreferenceMatch(
                tag=tag,
                source=source,
                weight=WEIGHTS[source],
                evidence_refs=[place["evidence"].evidence_id],
            )
            for tag, source in terms.items()
            if aliases.get(tag, tag) in place["catalog_tags"]
        ]
        for region in preference.regions:
            if region in (place["region"] or "") + (place["address"] or ""):
                matches.append(
                    PreferenceMatch(
                        tag=region,
                        source="region",
                        weight=40,
                        evidence_refs=[place["evidence"].evidence_id],
                    )
                )
        # One signal per place/kind, not repeated clicks or repeated feedback.
        if preference.learning_enabled:
            kinds = set()
            last_review = next(
                (
                    row["payload"]
                    for row in signals
                    if row["payload"]["spot_id"] == sid
                    and row["payload"]["kind"] == "review"
                ),
                None,
            )
            for row in signals:
                item = row["payload"]
                if item["spot_id"] != sid or item["kind"] in kinds:
                    continue
                kinds.add(item["kind"])
                source = (
                    "favorite"
                    if item["kind"] == "favorite"
                    else (
                        "positive_review"
                        if item["kind"] == "review" and item["action"] == "positive"
                        else "confirmed_visit"
                        if item["kind"] == "visit"
                        and item["action"] == "confirm"
                        and (last_review is None or last_review["action"] != "negative")
                        else None
                    )
                )
                if source:
                    matches.append(
                        PreferenceMatch(
                            tag=source,
                            source=source,
                            weight=WEIGHTS[source],
                            evidence_refs=["signal:" + row["id"]],
                        )
                    )
        unknown = [tag for tag in terms if tag not in place["catalog_tags"]]
        unknown += [
            "activity_support",
            "opening_hours",
            "reservation_required",
            "price",
            "current_crowding",
            "official_controls_completeness",
        ]
        if (
            request.companion_type == "children"
            or preference.companion_type == "children"
        ):
            unknown.append("child_friendly")
        if (
            request.max_travel_minutes
            or preference.max_travel_minutes
            or (
                request.mood
                and request.mood.confirmed
                and request.mood.max_travel_minutes
            )
        ):
            unknown.append("travel_time")
        ranked.append((place, matches, list(dict.fromkeys(unknown))))
    # Hard requirements never become soft just to fill the requested count.
    # Places the user explicitly named stay ahead of preference weight so the
    # requested count cannot drop them; they still pass the checks above, and a
    # blocked or unconfirmed one keeps its reason in `excluded`.
    required = set(request.must_include)
    # Province-wide reads already alternate districts. Preserve that order only
    # for equal preference weights; explicit choices and evidence still win.
    broad_region = region_query(request.region or "") == ("gangwon", None)
    candidate_order = {place["spot_id"]: index for index, place in enumerate(places)}
    ranked.sort(
        key=lambda row: (
            row[0]["spot_id"] not in required,
            -sum(m.weight for m in row[1]),
            candidate_order[row[0]["spot_id"]] if broad_region else row[0]["spot_id"],
        )
    )
    return ranked, excluded


async def _recommend_single(
    settings, owner, body, *, now=None, catalog=None, environment=None
):
    now = now or datetime.now(UTC)
    catalog = catalog or Catalog(settings, now)
    preference = body.preference
    if preference is None:
        profile, signals = await asyncio.gather(
            asyncio.to_thread(storage.profile, settings, owner),
            asyncio.to_thread(storage.signals, settings, owner),
        )
        preference = profile["preference"]
    else:
        signals = await asyncio.to_thread(storage.signals, settings, owner)
    try:
        request = keywords.normalize(body.request)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from None
    try:
        places, scope = await catalog.search(request)
        # An explicitly named place is a candidate even when the bounded
        # region/category search did not return it, so it either appears in the
        # result or states why it was excluded.
        missing = [
            sid
            for sid in dict.fromkeys(request.must_include)
            if sid not in {p["spot_id"] for p in places}
        ]
        if missing:
            added = await catalog.places(missing)
            places = [*places, *added.values()]
            scope["must_include_added"] = sorted(added)
        restrictions = await catalog.restrictions(
            [p["spot_id"] for p in places], request
        )
    except HTTPException as exc:
        if exc.status_code != 503:
            raise
        return RecommendationResult(
            request=body.request,
            preference=preference,
            status="query_failed",
            recommendations=[],
            candidate_scope={"status": "query_failed", "candidate_limit": 300},
            excluded=[],
            relaxation_proposals=[],
            clarification=None,
            selection_token=None,
            queried_at=now,
            persona=persona(preference, signals),
        )
    ranked, excluded = rank_places(places, request, preference, signals, restrictions)
    from app.travel.environment import PREVIEW_LIMIT, preview_time

    environment = environment or PublishedEnvironmentReader(catalog)
    target, time_basis = preview_time(request, now)
    shortlist = ranked[:PREVIEW_LIMIT]
    if hasattr(environment, "prefetch"):
        await environment.prefetch(
            [row[0]["spot_id"] for row in shortlist], request, target
        )

    # 개장 기간 밖 해변에서는 수영을 그 장소의 후보 활동에서 뺍니다. 홈·오늘이
    # 「해변 산책」이라고 말하는 날 추천 탭이 같은 해변을 수영 기준으로 줄
    # 세우면, 같은 앱이 같은 장소에 대해 두 가지를 말합니다.
    #
    # `decide()` 전체를 옮기지는 않습니다 -- 그쪽은 **한 장소의 여러 활동**을
    # 비교하는 규칙이고 이쪽은 **여러 장소**를 줄 세웁니다. 두 체계를 합치는
    # 일은 따로입니다. 여기서는 같은 `season_view` 를 재사용해 같은 판정을
    # 쓰는 것까지만 합니다.
    #
    # 미확인은 빼지 않습니다 -- 폐장의 증거가 아닙니다(1번과 같은 세 단계).
    closed = await beach_seasons_closed(catalog, shortlist, target)

    async def read_match(row):
        sid = row[0]["spot_id"]
        return sid, await environment.compare(
            sid, request, target, exclude=("swim",) if sid in closed else ()
        )

    environment_matches = dict(
        await asyncio.gather(*(read_match(row) for row in shortlist))
    )
    eligible = []
    for row in shortlist:
        if row[0]["spot_id"] in closed and keywords.choices(request, "activity") == [
            "swim"
        ]:
            # 수영만 골랐다면 그 해변은 오늘 할 일이 없습니다. 다른 활동으로
            # 슬쩍 바꿔 추천하지 않습니다 -- 고른 것이 수영이었습니다.
            excluded.append(
                {
                    "spot_id": row[0]["spot_id"],
                    "reason": "beach_closed_season_product_rule",
                    "evidence": [],
                }
            )
            continue
        # 표본은 고른 활동 가운데 **그 장소에서 가장 좋은 하나**입니다
        # (environment.EnvironmentReader.at). 그래서 아래 판정은 자연히
        # 「고른 활동이 전부 막혔을 때만 뺀다」가 됩니다 -- 서핑을 하지 않는
        # 곳이라도 함께 고른 휴식으로 좋으면 후보에 남습니다.
        sample = preview_sample(environment_matches[row[0]["spot_id"]])
        if (
            sample.get("safety_status") == "restricted"
            or sample.get("support_status") == "unsupported"
        ):
            excluded.append(
                {
                    "spot_id": row[0]["spot_id"],
                    "reason": "official_restriction"
                    if sample.get("safety_status") == "restricted"
                    else "selected_activity_unsupported",
                    "evidence": sample.get("restriction_refs", []),
                }
            )
        else:
            eligible.append(row)
    profiles = {
        tuple(
            component["metric"]
            for component in preview_sample(match)
            .get("condition_score", {})
            .get("components", [])
        )
        for match in environment_matches.values()
        if ranking_score(match) is not None
    }
    # A beach-water profile and an inland-weather profile are different scales.
    comparable = len(profiles) <= 1
    broad_region = region_query(request.region or "") == ("gangwon", None)
    shortlist_order = {row[0]["spot_id"]: index for index, row in enumerate(shortlist)}
    scope["environment_comparison"] = {
        "candidate_limit": PREVIEW_LIMIT,
        "compared_count": len(shortlist),
        "truncated": len(ranked) > len(shortlist),
        "shortlist_order": "explicit_preference_then_district_round_robin"
        if broad_region
        else "explicit_preference_then_spot_id",
        "time_basis": time_basis,
        "target_at": target.isoformat(),
        "source": "published_condition_result",
        "score_profiles_comparable": comparable,
        "optimality": "only_within_compared_candidates_and_available_evidence",
    }
    scope["ranking"] = {
        "engine": "deterministic",
        "model_used": False,
        "priority": [
            "must_include",
            "explicit_preferences_and_environment_match",
            "complete_comparable_condition_score",
            "catalog_order",
        ],
        "safety_status": "unknown",
    }
    required = set(request.must_include)

    def environment_order(row):
        match = environment_matches[row[0]["spot_id"]]
        points = match["preference_points"]
        score = ranking_score(match) if comparable else None
        return (
            row[0]["spot_id"] not in required,
            points is None if request.environment_preferences else False,
            -sum(m.weight for m in row[1]) - (points or 0),
            score is None,
            -(score if score is not None else 0),
            shortlist_order[row[0]["spot_id"]] if broad_region else row[0]["spot_id"],
        )

    ranked = sorted(eligible, key=environment_order)
    recommendations = []
    for rank, (place, matches, unknown) in enumerate(ranked[: body.limit], 1):
        sid = place["spot_id"]
        conditions = condition_summary(environment_matches[sid])
        # Source facts cannot be overwritten by user wishes or behavioural tags.
        confirmed = {
            k: v for k, v in place.items() if k not in {"evidence", "catalog_locale"}
        }
        confirmed.pop("spot_id")
        reason = (
            copy(
                request.locale,
                "matches",
                tags=", ".join(label(request.locale, m.tag) for m in matches),
            )
            if matches
            else copy(request.locale, "unmatched")
        )
        from app.travel.environment import describe_match

        environment_text = describe_match(environment_matches.get(sid), request.locale)
        if environment_text:
            reason += " " + environment_text
        reason += " " + describe_score(
            environment_matches[sid], request.locale, comparable=comparable
        )
        recommendations.append(
            Recommendation(
                recommendation_id=f"recommendation:{rank}:{sid}",
                spot_id=sid,
                rank=rank,
                name=place["name"],
                region=place["region"],
                locale=request.locale,
                catalog_locale=place["catalog_locale"],
                confirmed=confirmed,
                matched_preferences=matches,
                preference_score=sum(m.weight for m in matches),
                evidence=[place["evidence"]],
                conditions=conditions,
                unknown_conditions=unknown,
                target_dates=request.dates,
                queried_at=now,
                reason=reason,
                actions={
                    "view": f"#water-index-map?spot_id={sid}",
                    "compare_rank": rank,
                    "select_rank": rank,
                    "favorite_spot_id": sid,
                },
                activities=keywords.activity_options(request, place),
                environment_match=environment_matches.get(sid, {}),
                transport_advice=transport_advice(request, place),
            )
        )
    clarification = (
        copy(request.locale, "origin")
        if request.origin is None
        else copy(request.locale, "date")
        if not request.dates
        else None
    )
    scope.update(
        {
            "result_limit": body.limit,
            "eligible_count": len(ranked),
            "history_window": {"limit": 100, "order": "latest_first"},
        }
    )
    return RecommendationResult(
        request=body.request,
        policy_version="published-evidence.v3",
        preference=preference,
        status="partial" if recommendations else "no_data",
        recommendations=recommendations,
        candidate_scope=scope,
        excluded=excluded,
        relaxation_proposals=[
            {
                "condition": c.model_dump(),
                "reason": "verified_candidates_insufficient",
                "requires_user_confirmation": True,
            }
            for c in request.required
        ]
        if len(ranked) < body.limit
        else [],
        clarification=clarification,
        selection_token=tokens.encode(
            settings,
            owner,
            body.request,
            [r.spot_id for r in recommendations],
            now,
            preference=body.preference,
        )
        if recommendations
        else None,
        queried_at=now,
        persona=persona(preference, signals),
    )


async def recommend(settings, owner, body, *, now=None, catalog=None, environment=None):
    now = now or datetime.now(UTC)
    catalog = catalog or Catalog(settings, now)
    if body.request.visit_intents:
        return await recommend_visits(
            settings,
            owner,
            body,
            now=now,
            catalog=catalog,
            environment=environment,
        )
    return await _recommend_single(
        settings,
        owner,
        body,
        now=now,
        catalog=catalog,
        environment=environment,
    )


def request_for_visit(request, intent):
    """Use one visit's place/activity without inheriting an earlier visit's filter."""
    water_types = {"beach", "valley", "hot_spring", "lake", "river", "reservoir"}
    data = request.model_dump(mode="json")
    selections = [
        item
        for item in data["keyword_selection"]
        if item["category"] not in {"place_type", "activity"}
    ]
    if intent.place_type in water_types:
        selections.append({"category": "place_type", "values": [intent.place_type]})
    # An earlier beach swim must not filter out a later cafe or valley visit.
    activity = intent.activity or "relax"
    if intent.activity in {
        option["id"] for option in keywords.LOOKUP["activity"]["options"]
    }:
        selections.append({"category": "activity", "values": [activity]})
    data.update(
        visit_intents=[intent.model_dump(mode="json")],
        keyword_selection=selections,
        activity=activity,
        place_role={"cafe": "meal", "restaurant": "meal", "lodging": "lodging"}.get(
            intent.place_type, "visit"
        ),
    )
    return TravelRequest.model_validate(data)


async def recommend_visits(settings, owner, body, *, now, catalog, environment=None):
    request = body.request
    intents = request.visit_intents

    async def read_visit(intent):
        stage_request = request_for_visit(request, intent)
        try:
            async with asyncio.timeout(15):
                return await _recommend_single(
                    settings,
                    owner,
                    RecommendationInput(
                        request=stage_request,
                        preference=body.preference,
                        limit=2,
                    ),
                    now=now,
                    catalog=catalog,
                    environment=environment,
                )
        except (TimeoutError, HTTPException) as exc:
            if isinstance(exc, HTTPException) and exc.status_code != 503:
                raise
            return RecommendationResult(
                request=stage_request,
                preference=body.preference or TravelPreference(),
                status="query_failed",
                recommendations=[],
                candidate_scope={
                    "status": "query_failed",
                    "candidate_limit": 300,
                    "preference_status": "unknown",
                },
                excluded=[],
                relaxation_proposals=[],
                clarification=None,
                selection_token=None,
                queried_at=now,
                persona={"status": "unknown"},
            )

    results = await asyncio.gather(*(read_visit(intent) for intent in intents))
    # First take a candidate from every available visit, then add seconds.
    # Candidate rank remains a single owner-bound order for later selection.
    total_limit = min(10, max(body.limit, len(intents)))
    selected = {}
    for position in range(2):
        for result in results:
            if position >= len(result.recommendations):
                continue
            row = result.recommendations[position]
            if row.spot_id in selected or len(selected) >= total_limit:
                continue
            rank = len(selected) + 1
            selected[row.spot_id] = row.model_copy(
                update={
                    "rank": rank,
                    "recommendation_id": f"recommendation:{rank}:{row.spot_id}",
                    "actions": row.actions
                    | {"compare_rank": rank, "select_rank": rank},
                }
            )
    selection_token = (
        tokens.encode(
            settings,
            owner,
            request,
            list(selected),
            now,
            preference=body.preference,
        )
        if selected
        else None
    )
    groups = []
    for intent, result in zip(intents, results, strict=True):
        rows = [
            row.model_copy(
                update={
                    "rank": selected[row.spot_id].rank,
                    "recommendation_id": selected[row.spot_id].recommendation_id,
                    "actions": selected[row.spot_id].actions,
                }
            )
            for row in result.recommendations
            if row.spot_id in selected
        ]
        groups.append(
            {
                "intent": intent.model_dump(mode="json"),
                "result": result.model_copy(
                    update={
                        "recommendations": rows,
                        "selection_token": None,
                    }
                ).model_dump(mode="json"),
            }
        )
    status = (
        "partial"
        if selected
        else "query_failed"
        if any(result.status == "query_failed" for result in results)
        else "no_data"
    )
    return RecommendationResult(
        request=request,
        preference=results[0].preference,
        policy_version="published-evidence.v3",
        status=status,
        recommendations=list(selected.values()),
        recommendation_groups=groups,
        candidate_scope={
            "coverage": "registered_catalog_per_visit",
            "visit_count": len(intents),
            "result_limit": total_limit,
            "per_visit_result_limit": 2,
            "candidate_limit_per_visit": 300,
            "visits": [result.candidate_scope for result in results],
            "route_calculated": False,
        },
        excluded=[
            item | {"visit_index": index}
            for index, result in enumerate(results)
            for item in result.excluded
        ],
        relaxation_proposals=[
            item | {"visit_index": index}
            for index, result in enumerate(results)
            for item in result.relaxation_proposals
        ],
        # Place suggestions do not require a departure point or travel date.
        # The separate route/itinerary flow asks for those when it needs them.
        clarification=None,
        selection_token=selection_token,
        queried_at=now,
        persona=results[0].persona,
    )
