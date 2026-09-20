"""Shared form/chat contracts. Wishes, evidence and calculations stay separate."""

from datetime import date, time
from typing import Annotated, Literal

from pydantic import (
    AwareDatetime,
    BaseModel,
    ConfigDict,
    Field,
    field_validator,
    model_validator,
)

ID = Annotated[int, Field(strict=True, gt=0, le=2**53 - 1)]
Tag = Annotated[str, Field(min_length=1, max_length=80)]
Tags = Annotated[list[Tag], Field(max_length=30)]
Locale = Literal["ko", "en", "ja", "zh-CN", "zh-TW"]
Intensity = Literal["low", "moderate", "high"]
Mode = Literal["driving", "transit", "walking", "cycling"]
SignalKind = Literal["card", "favorite", "visit", "review"]
DataStatus = Literal[
    "available", "no_data", "stale", "partial", "unknown", "query_failed"
]
Activity = Literal["relax", "swim", "surf", "mudflat", "onsen", "rafting"]


class Record(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)


class TravelPreference(Record):
    tags: Tags = Field(default_factory=list)
    regions: Tags = Field(default_factory=list)
    activity_intensity: Intensity | None = None
    max_travel_minutes: int | None = Field(default=None, ge=5, le=1440)
    companion_type: (
        Literal["solo", "couple", "friends", "family", "children"] | None
    ) = None
    avoid: Tags = Field(default_factory=list)
    learning_enabled: bool = False
    # Only explicit profile editing changes these labels; never a diagnosis.
    persona_labels: Tags = Field(default_factory=list)


class PreferenceUpdate(Record):
    preference: TravelPreference
    expected_revision: int = Field(ge=0)


class SignalInput(Record):
    kind: SignalKind
    action: Literal[
        "like", "dislike", "skip", "confirm", "positive", "negative", "neutral"
    ]
    spot_id: ID | None = None
    tags: Tags = Field(default_factory=list)
    visited_on: date | None = None
    satisfaction: int | None = Field(default=None, ge=1, le=5)
    note: str | None = Field(default=None, max_length=500)

    @model_validator(mode="after")
    def consistent(self):
        actions = {
            "card": {"like", "dislike", "skip"},
            "favorite": {"like"},
            "visit": {"confirm"},
            "review": {"positive", "negative", "neutral"},
        }
        if self.action not in actions[self.kind]:
            raise ValueError("signal_action_mismatch")
        if self.kind != "card" and self.spot_id is None:
            raise ValueError("registered_spot_required")
        if self.kind == "card" and not self.tags:
            raise ValueError("card_tags_required")
        if self.kind == "visit" and self.visited_on is None:
            raise ValueError("explicit_visit_date_required")
        if self.kind != "visit" and self.visited_on is not None:
            raise ValueError("only_confirmed_visits_have_visit_dates")
        if self.kind != "review" and (self.satisfaction is not None or self.note):
            raise ValueError("review_fields_only")
        if self.satisfaction is not None:
            direction = (
                "positive"
                if self.satisfaction >= 4
                else ("negative" if self.satisfaction <= 2 else "neutral")
            )
            if self.action != direction:
                raise ValueError("review_direction_conflict")
        return self


class Origin(Record):
    label: str = Field(min_length=1, max_length=160)
    spot_id: ID | None = None
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)

    @model_validator(mode="after")
    def coordinate_pair(self):
        if (self.latitude is None) != (self.longitude is None):
            raise ValueError("coordinate_pair_required")
        return self


class Budget(Record):
    amount: int = Field(ge=0, le=1_000_000_000)
    basis: Literal["total", "per_person"] = "total"
    currency: Literal["KRW"] = "KRW"


class Condition(Record):
    attribute: Literal[
        "region",
        "kind",
        "tag",
        "child_friendly",
        "shallow_water",
        "gentle_flow",
        "quiet",
        "accessible",
        "reservation_not_required",
        "open",
    ]
    value: Tag


class Mood(Record):
    text: str = Field(min_length=1, max_length=300)
    tags: Tags = Field(default_factory=list)
    activity_intensity: Intensity | None = None
    max_travel_minutes: int | None = Field(default=None, ge=5, le=1440)
    confirmed: bool = False
    # Persisting to long-term profile uses a separate explicit endpoint.


class KeywordSelection(Record):
    category: str = Field(min_length=1, max_length=40)
    values: list[str] = Field(min_length=1, max_length=8)


class EnvironmentPreference(Record):
    metric: Literal[
        "air_temperature",
        "precipitation",
        "wave_height",
        "wind_speed",
        "water_temperature",
        "relative_humidity",
        "wave_period",
    ]
    minimum: float | None = None
    maximum: float | None = None
    weight: int = Field(default=1, ge=1, le=10)

    @model_validator(mode="after")
    def ordered_range(self):
        if self.minimum is None and self.maximum is None:
            raise ValueError("explicit_environment_range_required")
        if (
            self.minimum is not None
            and self.maximum is not None
            and self.minimum > self.maximum
        ):
            raise ValueError("environment_range_reversed")
        return self


class TravelRequest(Record):
    keyword_selection: list[KeywordSelection] = Field(
        default_factory=list, max_length=6
    )
    environment_preferences: list[EnvironmentPreference] = Field(
        default_factory=list, max_length=7
    )
    dates: list[date] = Field(default_factory=list, max_length=7)
    region: str | None = Field(default=None, min_length=1, max_length=80)
    place_role: Literal["visit", "meal", "lodging", "any"] = "visit"
    origin: Origin | None = None
    transport: Mode = "driving"
    departure_time: time | None = None
    return_by: time | None = None
    day_trip: bool = True
    people: int = Field(default=1, ge=1, le=50)
    companion_type: (
        Literal["solo", "couple", "friends", "family", "children"] | None
    ) = None
    budget: Budget | None = None
    required: list[Condition] = Field(default_factory=list, max_length=20)
    preferred_tags: Tags = Field(default_factory=list)
    avoid: Tags = Field(default_factory=list)
    activity: Activity = "relax"
    activity_intensity: Intensity | None = None
    max_travel_minutes: int | None = Field(default=None, ge=5, le=1440)
    mood: Mood | None = None
    purpose: str | None = Field(default=None, max_length=200)
    meal_preference: Tags = Field(default_factory=list)
    rest_preference: Tags = Field(default_factory=list)
    must_include: list[ID] = Field(default_factory=list, max_length=20)
    exclude: list[ID] = Field(default_factory=list, max_length=20)
    locale: Locale = "ko"

    @field_validator("departure_time", "return_by")
    @classmethod
    def local_time(cls, value):
        if value is not None and value.tzinfo is not None:
            raise ValueError("use_local_Asia_Seoul_time")
        return value

    @model_validator(mode="after")
    def consistent(self):
        from app.travel.keywords import validate_selection

        validate_selection(self.keyword_selection)
        if len({p.metric for p in self.environment_preferences}) != len(
            self.environment_preferences
        ):
            raise ValueError("duplicate_environment_metric")
        if self.dates != sorted(set(self.dates)):
            raise ValueError("dates_must_be_unique_and_ordered")
        if self.dates and (self.dates[-1] - self.dates[0]).days > 6:
            raise ValueError("trip_span_maximum_7_days")
        if self.day_trip and len(self.dates) > 1:
            raise ValueError("day_trip_requires_one_date")
        if set(self.must_include) & set(self.exclude):
            raise ValueError("included_and_excluded_place_conflict")
        return self


class RecommendationInput(Record):
    request: TravelRequest = Field(default_factory=TravelRequest)
    # Omission means read saved preferences, explicit object means form override.
    preference: TravelPreference | None = None
    limit: int = Field(default=5, ge=1, le=10)


class TravelContext(Record):
    action: Literal["conversation", "recommend", "route"] = "conversation"
    request: TravelRequest = Field(default_factory=TravelRequest)
    preference: TravelPreference | None = None
    selection_token: str | None = Field(default=None, max_length=16000)
    plan_id: str | None = Field(default=None, max_length=80)
    session_id: str | None = Field(default=None, max_length=80)


class Evidence(Record):
    evidence_id: str
    provider: str
    source_record_id: str | None = None
    source_url: str | None = None
    fetched_at: AwareDatetime | None = None
    issued_at: AwareDatetime | None = None
    source_created_at: AwareDatetime | None = None
    source_modified_at: AwareDatetime | None = None
    valid_from: AwareDatetime | None = None
    valid_until: AwareDatetime | None = None
    status: DataStatus = "unknown"


class PreferenceMatch(Record):
    tag: str
    source: Literal[
        "explicit",
        "trip",
        "mood",
        "card",
        "favorite",
        "positive_review",
        "confirmed_visit",
        "region",
    ]
    weight: int
    evidence_refs: list[str]


class Recommendation(Record):
    recommendation_id: str
    spot_id: ID
    rank: int = Field(ge=1)
    name: str
    region: str | None
    locale: Locale
    catalog_locale: Locale
    confirmed: dict
    matched_preferences: list[PreferenceMatch]
    preference_score: int
    evidence: list[Evidence]
    conditions: dict
    unknown_conditions: list[str]
    target_dates: list[date]
    queried_at: AwareDatetime
    reason: str
    actions: dict
    activities: list[dict] = Field(default_factory=list)
    environment_match: dict = Field(default_factory=dict)


class RecommendationResult(Record):
    contract_version: Literal["pongdang-travel.v1"] = "pongdang-travel.v1"
    policy_version: Literal["explicit-preference.v1", "keyword-environment.v2"] = (
        "explicit-preference.v1"
    )
    stage: Literal["places_activities"] = "places_activities"
    route_calculated: Literal[False] = False
    request: TravelRequest
    preference: TravelPreference
    status: DataStatus
    recommendations: list[Recommendation]
    candidate_scope: dict
    excluded: list[dict]
    relaxation_proposals: list[dict]
    clarification: str | None
    selection_token: str | None
    queried_at: AwareDatetime
    persona: dict


class UserCost(Record):
    amount: int = Field(ge=0, le=1_000_000_000)
    basis: Literal["total", "per_person"] = "total"
    source: Literal["user_input", "user_estimate"] = "user_input"


class PlanStopInput(Record):
    item_id: str = Field(min_length=1, max_length=80)
    spot_id: ID
    day: date
    stay_minutes: int = Field(default=60, ge=5, le=720)
    fixed: bool = False
    requested_arrival: time | None = None
    role: Literal["visit", "meal", "rest", "lodging"] = "visit"
    cost: UserCost | None = None
    reservation_status: Literal["unknown", "not_booked", "user_confirmed"] = (
        "not_booked"
    )

    _time = field_validator("requested_arrival")(TravelRequest.local_time.__func__)


class PlanInput(Record):
    request: TravelRequest
    stops: list[PlanStopInput] = Field(min_length=1, max_length=20)
    selection_token: str | None = Field(default=None, max_length=16000)
    selected_ranks: list[int] = Field(default_factory=list, max_length=10)

    @model_validator(mode="after")
    def unique_items(self):
        if len({item.item_id for item in self.stops}) != len(self.stops):
            raise ValueError("duplicate_item_id")
        if self.selected_ranks and not self.selection_token:
            raise ValueError("selection_token_required")
        if any(item.day not in self.request.dates for item in self.stops):
            raise ValueError("stop_date_outside_request")
        if [item.day for item in self.stops] != sorted(item.day for item in self.stops):
            raise ValueError("stops_must_be_ordered_by_day")
        return self


class PlanUpdate(PlanInput):
    expected_revision: int = Field(ge=1)
    unlock_item_ids: list[Tag] = Field(default_factory=list, max_length=20)


class TripPlan(Record):
    contract_version: Literal["pongdang-travel.v1"] = "pongdang-travel.v1"
    plan_id: str | None = None
    revision: int = 0
    request: TravelRequest
    input_stops: list[PlanStopInput]
    days: list[dict]
    legs: list[dict]
    cost: dict
    status: Literal["draft", "conflict", "confirmed"]
    unresolved: list[str]
    conflicts: list[dict]
    adjustments: list[dict]
    queried_at: AwareDatetime
    route_status: str


class NotificationSettings(Record):
    kinds: list[
        Literal["official_restriction", "low_tide", "data_updated", "data_corrected"]
    ] = Field(
        default_factory=lambda: ["official_restriction", "low_tide"], max_length=4
    )
    minimum_interval_minutes: int = Field(default=15, ge=1, le=1440)
    enabled: bool = True


class SessionStart(Record):
    plan_id: str = Field(min_length=1, max_length=80)
    plan_revision: int = Field(ge=1)
    location_status: Literal["manual", "denied", "enabled", "off"] = "manual"
    notifications: NotificationSettings = Field(default_factory=NotificationSettings)


class SessionRefresh(Record):
    current_spot_id: ID | None = None
    current_item_id: str | None = Field(default=None, min_length=1, max_length=80)
    location_status: Literal["manual", "denied", "enabled", "off"] = "manual"
    foreground: bool = True


class SessionSettings(Record):
    expected_revision: int = Field(ge=1)
    notifications: NotificationSettings


class TripSession(Record):
    session_id: str
    plan_id: str
    plan_revision: int
    revision: int
    state: Literal["active", "ended"]
    started_at: AwareDatetime
    ended_at: AwareDatetime | None = None
    location_status: Literal["manual", "denied", "enabled", "off"]
    current_spot_id: ID | None = None
    current_item_id: str | None = None
    last_location_at: AwareDatetime | None = None
    last_refresh_at: AwareDatetime | None = None
    last_seen_at: AwareDatetime | None = None
    notifications: NotificationSettings
    snapshot: dict = Field(default_factory=dict)
    monitoring: bool = False
    connection_status: Literal["connected", "disconnected", "ended"] = "disconnected"
    background_enabled: Literal[False] = False


class CompanionEvent(Record):
    event_id: str
    session_id: str
    kind: str
    spot_id: ID
    occurred_at: AwareDatetime
    target_at: AwareDatetime | None
    evidence: list[dict]
    valid_until: AwareDatetime
    status: Literal["confirmed", "expired", "superseded"] = "confirmed"
    deduplication_key: str
    acknowledged_at: AwareDatetime | None = None
    notified_at: AwareDatetime | None = None
    corrects_event_id: str | None = None
    message: str
