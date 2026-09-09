"""Provider-independent ingestion. No legacy imports, database or scheduler."""

import hashlib
from datetime import UTC, datetime
from typing import Annotated, Literal, Protocol

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, model_validator

from app.config import Settings
from app.schema import connect

Code = Annotated[str, Field(pattern=r"^[A-Za-z][A-Za-z0-9_-]{0,79}$")]
Text = Annotated[str, Field(min_length=1, max_length=200)]


class Record(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)


class Metric(Record):
    name: Code
    numeric_value: float | None = None
    unit: Annotated[str, Field(max_length=40)] = ""
    mode: Literal["observation", "forecast"] = "observation"


class Observation(Record):
    record_id: Text
    spot_id: Annotated[int, Field(gt=0)]
    observed_at: AwareDatetime
    fetched_at: AwareDatetime
    valid_until: AwareDatetime
    spatial_scope: Text
    metrics: Annotated[list[Metric], Field(min_length=1, max_length=100)]

    @model_validator(mode="after")
    def validate_evidence(self):
        if self.valid_until <= self.observed_at:
            raise ValueError(
                "Validity must follow the observation/forecast target time"
            )
        if self.fetched_at > datetime.now(UTC):
            raise ValueError("Fetch time cannot be in the future")
        if (
            any(m.mode == "observation" for m in self.metrics)
            and self.observed_at > self.fetched_at
        ):
            raise ValueError("An observation cannot postdate its fetch time")
        if len({m.name for m in self.metrics}) != len(self.metrics):
            raise ValueError("Duplicate metric name in observation")
        return self


class Batch(Record):
    provider: Code
    batch_key: Text
    adapter_version: Text
    observations: Annotated[list[Observation], Field(min_length=1, max_length=100)]

    @model_validator(mode="after")
    def validate_batch(self):
        if "demo" in self.provider.lower():
            raise ValueError("Synthetic data belongs only in pongdang_demo")
        keys = {(o.record_id, o.spot_id) for o in self.observations}
        if len(keys) != len(self.observations):
            raise ValueError("Duplicate provider record in batch")
        return self


class Provider(Protocol):
    """Future API adapters fetch and normalize without knowing storage/SQL.

    Implementations must enforce their own bounded timeout, quota, credentials,
    source identity and provider semantics. No provider is enabled by default.
    """

    def fetch(self) -> Batch: ...


def ingest(settings: Settings, batch: Batch) -> bool:
    """Atomic append; same batch is a no-op, conflicts never overwrite evidence."""
    batch = Batch.model_validate(batch.model_dump())
    digest = hashlib.sha256(batch.model_dump_json().encode()).hexdigest()
    with connect(settings) as connection:
        connection.execute(
            "SELECT pg_advisory_xact_lock(hashtext(%s))", ["pongdang-ingestion"]
        )
        previous = connection.execute(
            "SELECT digest FROM pongdang_data.ingestion_batches "
            "WHERE provider=%s AND batch_key=%s",
            [batch.provider, batch.batch_key],
        ).fetchone()
        if previous:
            if previous[0] != digest:
                raise ValueError("Batch key already belongs to different evidence")
            return False
        for observation in batch.observations:
            stale = observation.valid_until <= datetime.now(UTC)
            state = "stale" if stale else "recorded"
            snapshot_id = connection.execute(
                "INSERT INTO pongdang_data.conditions_observationsnapshot "
                "(spot_id,provider,state,observed_at,fetched_at,valid_until,valid_from,"
                "spatial_scope,provider_record_id,ingestion_version) "
                "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id",
                [
                    observation.spot_id,
                    batch.provider,
                    state,
                    observation.observed_at,
                    observation.fetched_at,
                    observation.valid_until,
                    observation.observed_at,
                    observation.spatial_scope,
                    observation.record_id,
                    batch.adapter_version,
                ],
            ).fetchone()[0]
            for metric in observation.metrics:
                connection.execute(
                    "INSERT INTO pongdang_data.conditions_observationmetric "
                    "(snapshot_id,name,numeric_value,unit,mode,state,source,"
                    "observed_at,fetched_at,valid_until,spatial_scope) "
                    "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
                    [
                        snapshot_id,
                        metric.name,
                        metric.numeric_value,
                        metric.unit,
                        metric.mode,
                        "missing" if metric.numeric_value is None else state,
                        batch.provider,
                        observation.observed_at,
                        observation.fetched_at,
                        observation.valid_until,
                        observation.spatial_scope,
                    ],
                )
        connection.execute(
            "INSERT INTO pongdang_data.ingestion_batches (provider,batch_key,digest) "
            "VALUES (%s,%s,%s)",
            [batch.provider, batch.batch_key, digest],
        )
        connection.execute(
            "INSERT INTO pongdang_data.conditions_ingestionrun "
            "(task_name,status,started_at,finished_at,error_code) "
            "VALUES (%s,'succeeded',transaction_timestamp(),clock_timestamp(),'')",
            ["ingest/" + batch.provider],
        )
    return True


def collect(settings: Settings, provider: Provider) -> bool:
    # Fetch failures cannot extend stored validity or create success records.
    return ingest(settings, provider.fetch())
