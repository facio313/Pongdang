"""Carry the last usable display and its evidence into each atomic publication."""

from collections import defaultdict

from psycopg.rows import dict_row
from psycopg.types.json import Jsonb


def _blocked(payload):
    return (
        payload.get("safety_status") == "restricted"
        or payload.get("support_status") == "unsupported"
        or (payload.get("condition_score") or {}).get("status") == "blocked"
    )


def _available(payload):
    names = {
        component["metric"]
        for component in (payload.get("condition_score") or {}).get("components", ())
        if component.get("score") is not None
    }
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


def retain_payload(previous, current, origin):
    """Keep scores and their inputs together; a lower complete score is valid."""
    if not previous or _blocked(previous) or _blocked(current):
        return current
    lost_score = (previous.get("condition_score") or {}).get("score") is not None and (
        current.get("condition_score") or {}
    ).get("score") is None
    if not lost_score and not (_available(previous) - _available(current)):
        return current
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
            keys = sorted({(r["spot_id"], r["activity"], r["mode"]) for r in batch})
            with self.connection.cursor(row_factory=dict_row) as cursor:
                rows = cursor.execute(
                    "SELECT s.* FROM jsonb_to_recordset(%s::jsonb) "
                    "AS k(spot_id bigint,activity text,mode text) JOIN "
                    "pongdang_data.condition_snapshot s ON "
                    "s.generation_id=%s AND s.spot_id=k.spot_id "
                    "AND s.activity=k.activity AND s.mode=k.mode "
                    "ORDER BY s.spot_id,s.activity,s.mode,s.target_start",
                    [
                        Jsonb(
                            [
                                dict(spot_id=spot, activity=activity, mode=mode)
                                for spot, activity, mode in keys
                            ]
                        ),
                        self.previous["generation_id"],
                    ],
                ).fetchall()
            for row in rows:
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
