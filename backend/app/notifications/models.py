"""Owner-only subscriptions; temperatures express preferences, never safety."""

import re
from datetime import datetime
from typing import Literal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import BaseModel, ConfigDict, Field, field_validator


class SubscriptionInput(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)

    spot_id: int = Field(ge=1)
    year: int = Field(ge=2000, le=2100)
    timezone: str = Field(default="Asia/Seoul", max_length=100)
    minimum_temperature_c: float = Field(ge=-5, le=60)
    channel: Literal["in_app", "email"] = "in_app"
    destination: str | None = Field(default=None, max_length=254)
    active: bool = True

    @field_validator("timezone")
    @classmethod
    def known_timezone(cls, value):
        try:
            ZoneInfo(value)
        except ZoneInfoNotFoundError:
            raise ValueError("Unknown IANA timezone") from None
        return value

    @field_validator("destination")
    @classmethod
    def single_email(cls, value):
        if value is not None and not re.fullmatch(
            r"[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+",
            value,
        ):
            raise ValueError("A single email address is required")
        return value


class SubscriptionView(BaseModel):
    id: str
    spot_id: int
    spot_name: str | None = None
    year: int
    timezone: str
    minimum_temperature_c: float
    channel: str
    destination: str | None
    active: bool
    revision: int
    updated_at: datetime
    condition_state: str
    last_evaluated_at: datetime | None
    delivery_configuration: str


class EventView(BaseModel):
    id: str
    subscription_id: str
    subscription_revision: int
    year: int
    kind: str
    state: str
    created_at: datetime
    evidence: dict
    delivery_state: str
    attempts: int
    last_error: str | None


class SubscriptionPage(BaseModel):
    rows: list[SubscriptionView]
    limit: int
    offset: int


class EventPage(BaseModel):
    rows: list[EventView]
    limit: int
    offset: int


class EvaluationView(BaseModel):
    id: int
    subscription_id: str
    subscription_revision: int
    evaluated_at: datetime
    condition_state: str
    evidence: dict


class EvaluationPage(BaseModel):
    rows: list[EvaluationView]
    limit: int
    offset: int
