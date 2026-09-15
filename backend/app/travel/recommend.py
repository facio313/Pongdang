"""B1/B3/B5 share this deterministic, explainable preference ordering."""

import asyncio
from datetime import UTC, datetime

from fastapi import HTTPException

from app.travel import keywords, storage, tokens
from app.travel.catalog import Catalog
from app.travel.language import copy, label
from app.travel.models import (
    PreferenceMatch,
    Recommendation,
    RecommendationResult,
    TravelRequest,
)

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


def rank_places(places, request, preference, signals, restrictions):
    terms, card_avoid = preference_terms(request, preference, signals)
    avoid = set(preference.avoid) | set(request.avoid) | card_avoid
    ranked, excluded = [], []
    for place in places:
        sid = place["spot_id"]
        if not keywords.matches_place(request, place):
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
    ranked.sort(key=lambda row: (-sum(m.weight for m in row[1]), row[0]["spot_id"]))
    return ranked, excluded


async def recommend(settings, owner, body, *, now=None, catalog=None, environment=None):
    now = now or datetime.now(UTC)
    catalog = catalog or Catalog(settings, now)
    preference = body.preference
    if preference is None:
        preference = (await asyncio.to_thread(storage.profile, settings, owner))[
            "preference"
        ]
    signals = await asyncio.to_thread(storage.signals, settings, owner)
    try:
        request = keywords.normalize(body.request)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from None
    try:
        places, scope = await catalog.search(request)
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
    environment_matches = {}
    if request.keyword_selection or request.environment_preferences:
        from app.travel.environment import (
            PREVIEW_LIMIT,
            EnvironmentReader,
            preview_time,
        )

        environment = environment or EnvironmentReader(catalog)
        target, time_basis = preview_time(request, now)
        shortlist = ranked[:PREVIEW_LIMIT]

        async def read_match(row):
            return row[0]["spot_id"], await environment.compare(
                row[0]["spot_id"], request, target
            )

        environment_matches = dict(
            await asyncio.gather(*(read_match(row) for row in shortlist))
        )
        scope["environment_comparison"] = {
            "candidate_limit": PREVIEW_LIMIT,
            "compared_count": len(shortlist),
            "truncated": len(ranked) > len(shortlist),
            "shortlist_order": "explicit_preference_then_spot_id",
            "time_basis": time_basis,
            "target_at": target.isoformat(),
            "optimality": "only_within_compared_candidates_and_available_evidence",
        }

        def environment_order(row):
            points = environment_matches[row[0]["spot_id"]]["preference_points"]
            return (
                points is None if request.environment_preferences else False,
                -sum(m.weight for m in row[1]) - (points or 0),
                row[0]["spot_id"],
            )

        ranked = sorted(shortlist, key=environment_order)
    recommendations = []
    for rank, (place, matches, unknown) in enumerate(ranked[: body.limit], 1):
        conditions = await catalog.conditions(place["spot_id"], request)
        sid = place["spot_id"]
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
        policy_version="keyword-environment.v2"
        if request.keyword_selection or request.environment_preferences
        else "explicit-preference.v1",
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
