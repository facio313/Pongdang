"""Normalized, bounded tourism details; never an upstream response envelope."""

from typing import Literal

from pydantic import AwareDatetime, Field

from app.ingestion import Record


class DetailField(Record):
    section: str = Field(min_length=1, max_length=40)
    key: str = Field(min_length=1, max_length=200)
    label: str = Field(min_length=1, max_length=500)
    value: str = Field(min_length=1, max_length=20000)


class PlaceDetail(Record):
    source_id: str = Field(pattern=r"^[0-9]{1,20}$")
    content_type: str = Field(pattern=r"^[0-9]{1,3}$")
    name: str = Field(min_length=1, max_length=500)
    source_created_at: AwareDatetime | None = None
    source_modified_at: AwareDatetime | None = None
    catalog_modified_at: AwareDatetime | None = None
    availability: Literal["available", "empty"] = "available"
    opening_hours: str | None = Field(default=None, max_length=20000)
    rest_days: str | None = Field(default=None, max_length=20000)
    opening_period: str | None = Field(default=None, max_length=20000)
    opening_date: str | None = Field(default=None, max_length=20000)
    parking: str | None = Field(default=None, max_length=20000)
    facilities: str | None = Field(default=None, max_length=20000)
    contact: str | None = Field(default=None, max_length=20000)
    homepage: str | None = Field(default=None, max_length=2000)
    overview: str | None = Field(default=None, max_length=20000)
    details: list[DetailField] = Field(default_factory=list, max_length=2000)
    photo_url: str | None = Field(default=None, max_length=2000)
    photo_license: str | None = Field(default=None, max_length=40)
