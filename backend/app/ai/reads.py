"""Execute a bounded read intent without another model choosing database IDs."""

from typing import Literal

from pydantic import Field, model_validator

from app.ai.tools import TimeArgs, ToolError, normalize_time
from app.water_index.models import Activity

ReadFeature = Literal[
    "place_conditions",
    "assessment_support",
    "forecast_compare",
    "tides",
    "quality",
    "livecams",
    "capabilities",
    "notifications_guide",
]
GENERAL = {"capabilities", "notifications_guide"}
PERIOD = {"place_conditions", "assessment_support", "forecast_compare", "tides"}
GROUPED = {"place_conditions", "forecast_compare"}


class ReadIntent(TimeArgs):
    features: list[ReadFeature] = Field(min_length=1, max_length=2)
    place_query: str | None = Field(default=None, min_length=1, max_length=80)
    activity: Activity = "relax"
    temperature_confirmed_only: bool = Field(default=False, strict=True)

    @model_validator(mode="after")
    def bounded_read(self):
        if len(set(self.features)) != len(self.features):
            raise ValueError("duplicate_read_feature")
        if set(self.features) & GENERAL and (
            len(self.features) != 1 or self.place_query is not None
        ):
            raise ValueError("general_read_has_no_place")
        if self.temperature_confirmed_only and "place_conditions" not in self.features:
            raise ValueError("temperature_filter_requires_conditions")
        if self.place_query is not None:
            self.place_query = self.place_query.strip()
            if not self.place_query:
                raise ValueError("empty_place_query")
        return self


async def execute_read_intent(intent, request, execute, now, tool_limit):
    """Return a clarification instead of choosing among ambiguous place matches."""
    if set(intent.features) <= GENERAL:
        name = intent.features[0]
        await execute(
            name, {"include_collection_status": True} if name == "capabilities" else {}
        )
        return None
    if intent.when == "this_weekend":
        return "weekend_day"
    period = intent.model_dump(
        mode="json", include={"activity", "when", "part_of_day", "start", "end"}
    )
    # Validate dates before searching. No model is allowed to repair an invalid
    # period by silently substituting current observations.
    normalize_time(TimeArgs.model_validate(period), now)
    if not set(intent.features) <= PERIOD and (
        intent.when != "now" or intent.part_of_day != "all"
    ):
        return "time"
    if intent.place_query:
        result = await execute(
            "search_places",
            {"query": intent.place_query, "activity": intent.activity, "limit": 8},
        )
        if result.get("status") == "query_failed":
            return None
        candidates = result.get("candidates", [])
        has_more = any(
            fact.get("metadata", {}).get("has_more") for fact in result.get("facts", [])
        )
        # Even an exact name can refer to more than one catalogue place. Never
        # choose the first result, drop a district, or invent a provider ID.
        if not candidates:
            return "location"
        if len(candidates) != 1 or has_more:
            return "place"
        ids = [candidates[0]["spot_id"]]
    else:
        context = request.context
        ids = list(
            dict.fromkeys(
                context.spot_ids or ([context.spot_id] if context.spot_id else [])
            )
        )
        if not ids:
            return "location"
    required = bool(intent.place_query) + sum(
        1 if name in GROUPED else len(ids) for name in intent.features
    )
    if required > tool_limit:
        raise ToolError("ai_tool_limit")
    for name in intent.features:
        args = period if name in PERIOD else {}
        if name in GROUPED:
            args = {**args, "spot_ids": ids}
            if name == "place_conditions":
                args["temperature_confirmed_only"] = intent.temperature_confirmed_only
            await execute(name, args)
        else:
            for sid in ids:
                await execute(name, {**args, "spot_id": sid})
    return None


def evidence_answer(facts, intro):
    """Use server-owned text and provenance; never ask a model to rewrite values."""
    substantive = [f for f in facts if f.get("feature") != "search_places"]
    lines = []
    for fact in substantive or facts:
        if not fact.get("text"):
            continue
        metadata = fact.get("metadata", {})
        evidence = metadata.get("evidence") or [metadata]
        provenance = []
        for item in evidence:
            parts = [str(item["provider"])] if item.get("provider") else []
            for key, label in (
                ("observed_at", "관측"),
                ("issued_at", "발행"),
                ("valid_from", "유효 시작"),
                ("valid_until", "유효 종료"),
            ):
                if item.get(key):
                    parts.append(f"{label} {item[key]}")
            if parts:
                provenance.append(" · ".join(parts))
        line = fact["text"]
        if provenance:
            line += "\n" + "\n".join(dict.fromkeys(provenance))
        if line not in lines:
            lines.append(line)
    return "\n\n".join([intro, *lines])
