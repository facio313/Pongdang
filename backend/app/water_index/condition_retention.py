"""Carry the last usable display and its evidence into each atomic publication."""

from collections import defaultdict
from datetime import timedelta

from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

from app.water_index.activity_score import ScoreComponent, aggregate_activity_score
from app.water_index.condition_result import result_payload


def _blocked(payload):
    return (
        payload.get("safety_status") == "restricted"
        or payload.get("support_status") == "unsupported"
        or (payload.get("condition_score") or {}).get("status") == "blocked"
    )


def _scored(payload):
    return {
        component["metric"]
        for component in (payload.get("condition_score") or {}).get("components", ())
        if component.get("score") is not None
    }


def _displayed(payload):
    return {
        metric["name"]
        for metric in payload.get("display_metrics", ())
        if metric.get("value") is not None or metric.get("text_value")
    }


def _available(payload):
    names = _scored(payload)
    names.update(
        metric["name"]
        for metric in (
            *payload.get("metrics", ()),
            *payload.get("context_metrics", ()),
            *payload.get("display_metrics", ()),
        )
        if (
            metric.get("status") in {"available", "provisional"}
            and metric.get("value") is not None
        )
        or (metric.get("status") == "text" and metric.get("text_value"))
    )
    return names


def _retain_independent_fields(previous, current, lost):
    """Refresh valid fields while retaining only unavailable independent inputs."""
    before = previous.get("condition_score") or {}
    after = current.get("condition_score") or {}
    if any(
        score.get("model_id") != "pongdang-activity-conditions"
        or score.get("model_version") != "1.0.0"
        for score in (before, after)
    ):
        # Only this model declares single-metric, independent components.
        # Coupled/custom formula results must retain their complete input set.
        return None
    if not (_scored(current) | _displayed(current)) - lost:
        return None
    prior_components = {c["metric"]: c for c in before["components"]}
    components = []
    for component in after["components"]:
        prior = prior_components.get(component["metric"])
        if component["metric"] in lost and prior and prior["score"] is not None:
            component = prior
        components.append(ScoreComponent.model_validate(component))

    result = {
        **current,
        "condition_score": aggregate_activity_score(
            components,
            activity=current["activity"],
            support_status=current["support_status"],
            safety_status=current["safety_status"],
        ).model_dump(mode="json"),
        "retained": True,
        # Fresh metrics are validated at this calculation's original target.
        # Borrowed metrics keep their source timestamps and an explicit stale
        # state, so this timestamp never extends their measurement validity.
        "retained_at": current["at"],
    }
    for field in ("metrics", "context_metrics", "display_metrics"):
        kept = [m for m in current.get(field, ()) if m["name"] not in lost]
        for metric in previous.get(field, ()):
            if metric["name"] not in lost:
                continue
            # Display contracts have no stale status. Provisional explicitly
            # identifies its retained numeric value without changing the UI.
            status = (
                ("text" if metric["status"] == "text" else "provisional")
                if field == "display_metrics"
                else "stale"
            )
            kept.append({**metric, "status": status})
        result[field] = kept
    clocks = {
        "at",
        "as_of",
        "retained_at",
        "projection",
        "contract_version",
        "model",
        "environment_score",
    }
    if {k: v for k, v in result.items() if k not in clocks} == {
        k: v for k, v in previous.items() if k not in clocks
    }:
        # Rechecking an unchanged partial result must not churn its stored JSON
        # or claim a new evidence time. Changed provider timestamps still differ.
        return previous
    return result


def retain_payload(previous, current, origin):
    """Retain failed independent fields; a lower valid new score is published."""
    if not previous or _blocked(previous) or _blocked(current):
        return current
    lost_score = (previous.get("condition_score") or {}).get("score") is not None and (
        current.get("condition_score") or {}
    ).get("score") is None
    # Raw availability alone is insufficient: a numeric value may still fail
    # domain checks or conflict during station selection. Preserve the complete
    # prior component/evidence/display group when either selected product fails.
    lost = (
        (_available(previous) - _available(current))
        | (_scored(previous) - _scored(current))
        | (_displayed(previous) - _displayed(current))
    )
    if not lost_score and not lost:
        return current
    if partial := _retain_independent_fields(previous, current, lost):
        return partial
    return {
        **previous,
        "retained": True,
        "retained_at": previous.get("retained_at") or previous["at"],
        "projection": previous.get("projection") or origin,
        "reason_codes": list(
            dict.fromkeys(
                [*previous.get("reason_codes", ()), *current.get("reason_codes", ())]
            )
        ),
        # Current official context is never replaced with an older clearance.
        **{
            key: current[key]
            for key in ("support_status", "safety_status", "restriction_refs")
            if key in current
        },
    }


class RetainedPublication:
    """Bounded batch lookups, with no per-place SQL or unbounded payload cache."""

    def __init__(self, connection, previous, current):
        self.connection = connection
        self.previous = previous
        self.current = current
        self.observation_key = None
        self.observation = None

    def records(self, batch):
        old = defaultdict(list)
        if self.previous:
            keys = {}
            for record in batch:
                key = record["spot_id"], record["activity"], record["mode"]
                if key not in keys:
                    keys[key] = [record["target_start"], record["target_end"]]
                else:
                    keys[key][0] = min(keys[key][0], record["target_start"])
                    keys[key][1] = max(keys[key][1], record["target_end"])
            with self.connection.cursor(row_factory=dict_row) as cursor:
                rows = cursor.execute(
                    "SELECT s.*,origin.source_revision,origin.computed_at "
                    "FROM jsonb_to_recordset(%s::jsonb) "
                    "AS k(spot_id bigint,activity text,mode text,"
                    "min_start timestamptz,max_end timestamptz) JOIN "
                    "pongdang_data.condition_result s ON "
                    "s.spot_id=k.spot_id "
                    "AND s.activity=k.activity AND s.mode=k.mode "
                    "JOIN pongdang_data.condition_generation origin "
                    "ON origin.id=s.generation_id AND origin.result_published "
                    "WHERE origin.source_revision >= "
                    "(SELECT invalidated_revision FROM "
                    "pongdang_data.condition_source_revision WHERE id=1) "
                    "AND ((k.mode='forecast' AND s.target_start<k.max_end "
                    "AND s.target_end>k.min_start) OR "
                    "(k.mode='observation' AND ("
                    "s.target_start BETWEEN k.min_start AND k.max_end OR "
                    "s.target_start=(SELECT max(prior.target_start) "
                    "FROM pongdang_data.condition_result prior JOIN "
                    "pongdang_data.condition_generation valid ON "
                    "valid.id=prior.generation_id AND valid.result_published WHERE "
                    "prior.spot_id=k.spot_id AND prior.activity=k.activity "
                    "AND prior.mode=k.mode AND prior.target_start<=k.min_start "
                    "AND valid.source_revision >= (SELECT "
                    "invalidated_revision FROM "
                    "pongdang_data.condition_source_revision WHERE id=1))))) "
                    "ORDER BY s.spot_id,s.activity,s.mode,s.target_start",
                    [
                        Jsonb(
                            [
                                dict(
                                    spot_id=spot,
                                    activity=activity,
                                    mode=mode,
                                    min_start=times[0].isoformat(),
                                    max_end=times[1].isoformat(),
                                )
                                for (spot, activity, mode), times in sorted(
                                    keys.items()
                                )
                            ]
                        ),
                    ],
                ).fetchall()
            for row in rows:
                row["payload"] = result_payload(row)
                if not row["payload"].get("projection"):
                    row["payload"]["projection"] = dict(
                        generation_id=row["generation_id"],
                        source_revision=row["source_revision"],
                        computed_at=row["computed_at"].isoformat(),
                        refresh_after=(
                            row["computed_at"] + timedelta(minutes=10)
                        ).isoformat(),
                        status="ready",
                        retention_allowed=True,
                    )
                old[(row["spot_id"], row["activity"], row["mode"])].append(row)
        for record in batch:
            key = (record["spot_id"], record["activity"], record["mode"])
            if record["mode"] == "observation":
                if key != self.observation_key:
                    self.observation_key, self.observation = key, None
                    for row in old[key]:
                        if row["target_start"] > record["target_start"]:
                            break
                        self.observation = retain_payload(
                            self.observation, row["payload"], self.previous
                        )
                    if self.observation and not self.observation.get("projection"):
                        self.observation = {
                            **self.observation,
                            "projection": self.previous,
                        }
                payload = retain_payload(
                    self.observation, record["payload"], self.current
                )
                self.observation = payload
                yield {**record, "payload": payload}
                continue
            # Forecasts may only borrow the same target interval. Split at old
            # boundaries so a broad missing interval never spreads one hour's
            # forecast into another hour or day.
            start, end = record["target_start"], record["target_end"]
            overlapping = [
                r
                for r in old[key]
                if r["target_start"] < end and r["target_end"] > start
            ]
            boundaries = sorted(
                {start, end}
                | {max(start, r["target_start"]) for r in overlapping}
                | {min(end, r["target_end"]) for r in overlapping}
            )
            pending = None
            for begin, finish in zip(boundaries, boundaries[1:], strict=False):
                previous = next(
                    (
                        r["payload"]
                        for r in overlapping
                        if r["target_start"] <= begin < r["target_end"]
                    ),
                    None,
                )
                payload = retain_payload(previous, record["payload"], self.previous)
                # Old boundaries matter only where they preserve different
                # evidence. Do not copy obsolete boundaries into every new
                # generation when the current payload covers both intervals.
                if (
                    pending is not None
                    and pending["target_end"] == begin
                    and pending["payload"] == payload
                ):
                    pending["target_end"] = finish
                    continue
                if pending is not None:
                    yield pending
                pending = {
                    **record,
                    "target_start": begin,
                    "target_end": finish,
                    "payload": payload,
                }
            if pending is not None:
                yield pending
