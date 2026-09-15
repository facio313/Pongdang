"""Editable B2 drafts. Unknown transport never turns into a precise itinerary."""

from datetime import UTC, datetime, time, timedelta
from typing import Protocol

from fastapi import HTTPException
from pydantic import AwareDatetime, Field

from app.travel import tokens
from app.travel.catalog import KST, Catalog
from app.travel.models import Mode, Record, TripPlan


class RouteQuote(Record):
    origin_key: str
    destination_key: str
    mode: Mode
    departure_at: AwareDatetime
    duration_minutes: int = Field(ge=0, le=1440)
    provider: str = Field(min_length=1, max_length=100)
    source_record_id: str = Field(min_length=1, max_length=200)
    source_url: str
    fetched_at: AwareDatetime
    valid_until: AwareDatetime
    cost_krw: int | None = Field(default=None, ge=0)


class RouteProvider(Protocol):
    status: str

    async def quote(
        self, origin, destination, mode, departure_at
    ) -> RouteQuote | None: ...


class UnconfiguredRoutes:
    status = "unconfigured"

    async def quote(self, origin, destination, mode, departure_at):
        return None


def validate_quote(quote, origin, destination, mode, departure, now):
    # Quotes can only enter via a server adapter, never via a public request/model.
    if quote is None:
        return None
    from urllib.parse import urlsplit

    quote = RouteQuote.model_validate(quote)
    url = urlsplit(quote.source_url)
    if (
        quote.origin_key != origin
        or quote.destination_key != destination
        or quote.mode != mode
        or quote.departure_at != departure
        or not quote.fetched_at <= now < quote.valid_until
        or url.scheme != "https"
        or not url.hostname
        or url.username
        or url.password
        or url.query
        or url.fragment
    ):
        raise ValueError("route_evidence_mismatch")
    return quote


def preserve_fixed(previous, update):
    old = {s.item_id: s for s in previous.input_stops}
    new = {s.item_id: s for s in update.stops}
    unlocked = set(update.unlock_item_ids)
    if not unlocked <= old.keys():
        raise HTTPException(422, "unknown_unlock_item")
    for item in old.values():
        if (
            item.fixed
            and item.item_id not in unlocked
            and new.get(item.item_id) != item
        ):
            raise HTTPException(409, "fixed_item_requires_explicit_unlock")


def check_selection(settings, owner, body, now):
    if not body.selection_token:
        return
    selection = tokens.decode(settings, owner, body.selection_token, now)
    selected = []
    for rank in body.selected_ranks:
        if type(rank) is not int or not 1 <= rank <= len(selection["spot_ids"]):
            raise HTTPException(422, "selected_rank_not_found")
        selected.append(selection["spot_ids"][rank - 1])
    if body.selected_ranks and not set(selected) <= {s.spot_id for s in body.stops}:
        raise HTTPException(422, "selection_does_not_match_stops")


async def draft_plan(settings, owner, body, *, now=None, catalog=None, routes=None):
    now = now or datetime.now(UTC)
    catalog = catalog or Catalog(settings, now)
    routes = routes or UnconfiguredRoutes()
    check_selection(settings, owner, body, now)
    request = body.request
    selected = {s.spot_id for s in body.stops}
    places = await catalog.places(list(selected))
    if request.origin and request.origin.spot_id:
        await catalog.places([request.origin.spot_id])
    restrictions = await catalog.restrictions(list(selected), request)
    unresolved, conflicts, adjustments = [], [], []
    if request.origin is None:
        unresolved.append("origin_required")
    if request.departure_time is None:
        unresolved.append("departure_time_required")
    if request.return_by is None:
        unresolved.append("return_deadline_required")
    if routes.status == "unconfigured":
        unresolved.append("route_provider_unconfigured")
    if request.budget is None:
        unresolved.append("budget_not_specified")
    for code, ids in (
        ("must_include_missing", set(request.must_include) - selected),
        ("excluded_place_selected", set(request.exclude) & selected),
    ):
        if ids:
            conflicts.append({"code": code, "spot_ids": sorted(ids)})
    days, legs, known_cost, cost_unknown = [], [], 0, False
    origin_key = (
        f"spot:{request.origin.spot_id}"
        if request.origin and request.origin.spot_id
        else "origin"
        if request.origin
        else None
    )
    previous_lodging = None
    for day_index, day in enumerate(request.dates):
        day_stops = [s for s in body.stops if s.day == day]
        cursor = datetime.combine(day, request.departure_time or time(9), KST)
        # `lower_bound` proves impossible schedules even when route time is unknown.
        lower_bound = (
            cursor if request.departure_time else datetime.combine(day, time(), KST)
        )
        cursor_known = request.departure_time is not None and request.origin is not None
        prior = previous_lodging or origin_key
        items = []
        for stop in day_stops:
            place = places[stop.spot_id]
            dest = f"spot:{stop.spot_id}"
            quote = None
            if prior and cursor_known:
                try:
                    quote = validate_quote(
                        await routes.quote(prior, dest, request.transport, cursor),
                        prior,
                        dest,
                        request.transport,
                        cursor,
                        now,
                    )
                except ValueError, TimeoutError:
                    unresolved.append("route_query_failed")
            leg = {
                "from": prior,
                "to": dest,
                "day": day.isoformat(),
                "mode": request.transport,
                "duration_minutes": quote.duration_minutes if quote else None,
                "status": "confirmed" if quote else "unknown",
                "evidence": quote.model_dump(mode="json") if quote else None,
            }
            legs.append(leg)
            if quote:
                cursor += timedelta(minutes=quote.duration_minutes)
                lower_bound += timedelta(minutes=quote.duration_minutes)
                if (
                    request.max_travel_minutes
                    and quote.duration_minutes > request.max_travel_minutes
                ):
                    conflicts.append(
                        {"code": "travel_tolerance_exceeded", "item_id": stop.item_id}
                    )
            else:
                cursor_known = False
                unresolved.append("travel_time_unknown")
            if stop.requested_arrival:
                requested = datetime.combine(day, stop.requested_arrival, KST)
                if requested < lower_bound:
                    conflicts.append(
                        {
                            "code": "overlapping_or_unreachable_fixed_time",
                            "item_id": stop.item_id,
                        }
                    )
                if cursor_known and requested < cursor:
                    conflicts.append(
                        {"code": "arrival_before_route_eta", "item_id": stop.item_id}
                    )
                lower_bound = max(lower_bound, requested)
                if cursor_known:
                    cursor = max(cursor, requested)
                else:
                    unresolved.append("requested_arrival_unverified")
            start = cursor if cursor_known else None
            if cursor_known:
                cursor += timedelta(minutes=stop.stay_minutes)
            lower_bound += timedelta(minutes=stop.stay_minutes)
            blocked = [
                r
                for r in restrictions[stop.spot_id]
                if r["blocked"]
                and datetime.fromisoformat(r["valid_from"]).astimezone(KST).date()
                <= day
                and datetime.fromisoformat(r["valid_until"])
                > datetime.combine(day, time(), KST)
            ]
            if blocked:
                conflicts.append(
                    {
                        "code": "official_restriction",
                        "item_id": stop.item_id,
                        "evidence": blocked,
                    }
                )
            from app.travel.recommend import confirmed_condition

            for condition in request.required:
                if confirmed_condition(place, condition) is not True:
                    conflicts.append(
                        {
                            "code": "required_condition_unconfirmed",
                            "item_id": stop.item_id,
                            "condition": condition.model_dump(),
                        }
                    )
            item_unknown = [
                "opening_hours",
                "reservation_required",
                "official_controls_completeness",
            ]
            if stop.role in {"meal", "lodging"}:
                registered_role = place.get("catalog_role", "unknown")
                if registered_role == "unknown":
                    item_unknown.append("place_role_unconfirmed")
                elif registered_role != stop.role:
                    conflicts.append(
                        {
                            "code": "registered_place_role_mismatch",
                            "item_id": stop.item_id,
                            "catalog_role": registered_role,
                        }
                    )
            opening = "unknown"
            for operation in restrictions[stop.spot_id]:
                if (
                    start
                    and cursor_known
                    and operation.get("operating_status") == "open"
                    and operation.get("controls_status") == "confirmed"
                    and operation["state"] == "current"
                    and datetime.fromisoformat(operation["valid_from"]) <= start
                    and cursor <= datetime.fromisoformat(operation["valid_until"])
                ):
                    opening = "within_official_operating_window"
                    item_unknown.remove("opening_hours")
                    break
            cost = None
            if stop.cost:
                cost = stop.cost.amount * (
                    request.people if stop.cost.basis == "per_person" else 1
                )
                known_cost += cost
            else:
                cost_unknown = True
                item_unknown.append("price")
            if quote and quote.cost_krw is not None:
                known_cost += quote.cost_krw
            else:
                cost_unknown = True
            condition_data = await catalog.conditions(stop.spot_id, request)
            if condition_data["status"] == "query_failed":
                item_unknown.append("conditions_query_failed")
            items.append(
                {
                    "item_id": stop.item_id,
                    "spot_id": stop.spot_id,
                    "name": place["name"],
                    "day": day.isoformat(),
                    "role": stop.role,
                    "arrival_at": start.isoformat() if start else None,
                    "departure_at": cursor.isoformat() if cursor_known else None,
                    "requested_arrival": stop.requested_arrival.isoformat()
                    if stop.requested_arrival
                    else None,
                    "stay_minutes": stop.stay_minutes,
                    "fixed": stop.fixed,
                    "previous_leg": leg,
                    "cost_krw": cost,
                    "cost_source": stop.cost.source if stop.cost else "unknown",
                    "reservation_status": stop.reservation_status,
                    "opening_status": opening,
                    "reservation_evidence": "user_assertion"
                    if stop.reservation_status == "user_confirmed"
                    else None,
                    "reason": "user_selected_registered_place",
                    "evidence": [place["evidence"].model_dump(mode="json")],
                    "status": "conflict" if blocked else "draft",
                    "unknown_conditions": item_unknown,
                    "conditions": condition_data,
                }
            )
            prior = dest
            unresolved.extend(item_unknown)
        lodging = [s for s in day_stops if s.role == "lodging"]
        if request.meal_preference and not any(s.role == "meal" for s in day_stops):
            unresolved.append("meal_selection_required:" + day.isoformat())
        if request.rest_preference and not any(s.role == "rest" for s in day_stops):
            unresolved.append("rest_selection_required:" + day.isoformat())
        previous_lodging = f"spot:{lodging[-1].spot_id}" if lodging else None
        is_return_day = request.day_trip or day_index == len(request.dates) - 1
        if not is_return_day and not lodging:
            unresolved.append("lodging_selection_required:" + day.isoformat())
        return_at = None
        if is_return_day:
            quote = None
            if prior and origin_key and cursor_known:
                try:
                    quote = validate_quote(
                        await routes.quote(
                            prior, origin_key, request.transport, cursor
                        ),
                        prior,
                        origin_key,
                        request.transport,
                        cursor,
                        now,
                    )
                except ValueError, TimeoutError:
                    unresolved.append("return_route_query_failed")
            legs.append(
                {
                    "from": prior,
                    "to": origin_key,
                    "day": day.isoformat(),
                    "mode": request.transport,
                    "duration_minutes": quote.duration_minutes if quote else None,
                    "status": "confirmed" if quote else "unknown",
                    "return_leg": True,
                    "evidence": quote.model_dump(mode="json") if quote else None,
                }
            )
            if quote:
                return_at = cursor + timedelta(minutes=quote.duration_minutes)
                lower_bound += timedelta(minutes=quote.duration_minutes)
                if quote.cost_krw is not None:
                    known_cost += quote.cost_krw
                else:
                    cost_unknown = True
            else:
                cost_unknown = True
                unresolved.append("return_time_unknown")
            if request.return_by and lower_bound > datetime.combine(
                day, request.return_by, KST
            ):
                conflicts.append(
                    {"code": "return_deadline_exceeded", "day": day.isoformat()}
                )
                adjustments.append(
                    {
                        "code": "remove_stop_or_reduce_stay_or_extend_deadline",
                        "day": day.isoformat(),
                    }
                )
        days.append(
            {
                "date": day.isoformat(),
                "items": items,
                "return_at": return_at.isoformat() if return_at else None,
                "lodging_status": (
                    "user_confirmed"
                    if lodging
                    and all(s.reservation_status == "user_confirmed" for s in lodging)
                    else ("selected_not_reserved" if lodging else "not_selected")
                ),
            }
        )
    budget_limit = (
        request.budget.amount
        * (request.people if request.budget.basis == "per_person" else 1)
        if request.budget
        else None
    )
    exceeds = budget_limit is not None and known_cost > budget_limit
    if exceeds:
        conflicts.append(
            {
                "code": "known_cost_exceeds_budget",
                "known_cost_krw": known_cost,
                "budget_krw": budget_limit,
            }
        )
        adjustments.append({"code": "reduce_cost_or_increase_budget"})
    # Even all entered admission costs do not establish meals/accommodation/etc.
    unresolved.append("incidental_costs_unknown")
    return TripPlan(
        request=request,
        input_stops=body.stops,
        days=days,
        legs=legs,
        cost={
            "known_subtotal_krw": known_cost,
            "total_krw": None,
            "currency": "KRW",
            "budget_krw": budget_limit,
            "budget_status": "exceeded" if exceeds else "unknown",
            "coverage": "partial",
            "unknown_item_costs": cost_unknown,
        },
        status="conflict" if conflicts else "draft",
        unresolved=sorted(set(unresolved)),
        conflicts=conflicts,
        adjustments=adjustments,
        queried_at=now,
        route_status=routes.status,
    )
