"""Public, normalized provider evidence; no SQL, credentials or raw responses."""

from datetime import UTC, datetime
from typing import Annotated, Literal

from pydantic import AwareDatetime, Field, model_validator

from app.ingestion import Code, Record, Text


class Station(Record):
    source_id: Text
    name: Text
    kind: Text
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    region: str = Field(default="", max_length=200)
    datum: str = Field(default="", max_length=200)


class Value(Record):
    name: Code
    numeric_value: float | None = None
    text_value: str | None = Field(default=None, max_length=500)
    missing: bool = False
    unit: str = Field(default="", max_length=40)
    mode: Literal["observation", "forecast"] = "observation"


class Reading(Record):
    source_id: Text
    station: Station
    observed_at: AwareDatetime
    valid_until: AwareDatetime
    issued_at: AwareDatetime | None = None
    spatial_scope: Text
    values: Annotated[list[Value], Field(min_length=1, max_length=100)]

    @model_validator(mode="after")
    def validate_reading(self):
        if self.valid_until <= self.observed_at:
            raise ValueError("Validity must follow target time")
        if len({v.name for v in self.values}) != len(self.values):
            raise ValueError("Duplicate metric")
        return self


class Place(Record):
    source_id: Text
    name: Text
    kind: Text
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    address: str = Field(default="", max_length=500)
    region: str = Field(default="", max_length=200)
    category: str = Field(default="", max_length=200)
    source_url: str = Field(default="", max_length=1000)


class Warning(Record):
    source_id: Text
    issued_at: AwareDatetime
    title: str = Field(min_length=1, max_length=2000)
    region: str = Field(default="", max_length=1000)
    kind: str = Field(default="", max_length=200)
    effective_at: AwareDatetime | None = None
    ended_at: AwareDatetime | None = None
    # A historical bulletin is not evidence of a currently active warning.
    status: Literal["bulletin", "active", "ended"] = "bulletin"


class SourceBatch(Record):
    provider: Code
    fetched_at: AwareDatetime
    adapter_version: Text = "1"
    coverage: Literal["complete", "bounded"] = "complete"
    catalog_only: bool = False
    stations: list[Station] = Field(default_factory=list, max_length=5000)
    readings: list[Reading] = Field(default_factory=list, max_length=5000)
    places: list[Place] = Field(default_factory=list, max_length=5000)
    warnings: list[Warning] = Field(default_factory=list, max_length=1000)

    @model_validator(mode="after")
    def validate_evidence(self):
        if "demo" in self.provider.lower():
            raise ValueError("Synthetic providers are not accepted")
        if self.fetched_at > datetime.now(UTC):
            raise ValueError("Fetch time cannot be in the future")
        identities = {}
        station_metadata = {}
        for station in [*self.stations, *(r.station for r in self.readings)]:
            old = station_metadata.setdefault(station.source_id, station)
            if old != station:
                raise ValueError("Conflicting station metadata in one batch")
        for r in self.readings:
            key = (r.station.source_id, r.source_id)
            old = identities.setdefault(key, r)
            if old != r:
                raise ValueError("Conflicting source record in one batch")
            if any(v.mode == "observation" for v in r.values):
                if r.observed_at > self.fetched_at:
                    raise ValueError("Observed time cannot be in the future")
            if r.issued_at and r.issued_at > self.fetched_at:
                raise ValueError("Issue time cannot be in the future")
        return self
