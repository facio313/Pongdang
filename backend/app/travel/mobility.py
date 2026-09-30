"""Transparent distance suggestions, separate from provider route evidence."""

import math


def _distance(origin, destination):
    values = [
        origin.get("latitude"),
        origin.get("longitude"),
        destination.get("latitude"),
        destination.get("longitude"),
    ]
    if any(type(v) not in {float, int} or not math.isfinite(v) for v in values):
        return None
    lat1, lng1, lat2, lng2 = map(math.radians, values)
    a = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * (
        math.sin((lng2 - lng1) / 2) ** 2
    )
    return 6_371_000 * 2 * math.asin(min(1, math.sqrt(a)))


def transport_advice(request, place):
    """Candidate guidance uses registered coordinates, never estimated speed."""
    origin = request.origin.model_dump() if request.origin else {}
    distance = _distance(origin, place)
    return _advice(request.transport, None if distance is None else [distance])


def course_transport_advice(request, origin, items):
    nodes = [origin, *items, origin]
    distances = [_distance(a, b) for a, b in zip(nodes[:-1], nodes[1:], strict=True)]
    return _advice(request.transport, None if None in distances else distances)


def _advice(selected, distances):
    total = sum(distances) if distances else None
    longest = max(distances) if distances else None
    suggested = None
    reasons = ["origin_coordinates_required"]
    if total is not None:
        if total <= 4000 and longest <= 2000:
            suggested, reasons = "walking", ["short_distance_walking_candidate"]
        elif total <= 20000 and longest <= 10000:
            suggested, reasons = "cycling", ["medium_distance_cycling_candidate"]
        else:
            suggested = selected if selected in {"driving", "transit"} else "transit"
            reasons = ["long_distance_motorized_route_check"]
    return {
        "policy_version": "straight-distance-suggestion.v1",
        "selected_transport": selected,
        "suggested_transport": suggested,
        "basis": "registered_coordinates_straight_line_distance",
        "straight_line_distance_m": round(total) if total is not None else None,
        "reason_codes": reasons,
        "route_verified": False,
        "alternatives_compared": False,
        "limitations": [
            "actual_path_and_access_unverified",
            "equipment_and_timetable_unverified",
        ],
    }
