"""Authenticated immutable review revisions and bounded read projections."""

from datetime import UTC, datetime

from psycopg.types.json import Jsonb

from app.quality.engine import digest, extract_signals, fingerprint
from app.quality.models import ObservationInput, StoredObservation


class QualityError(Exception):
    def __init__(self, code: str, status_code: int):
        self.code, self.status_code = code, status_code
        super().__init__(code)


def owner_key(subject: str) -> str:
    return digest({"sso_subject": subject, "domain": "pongdang-quality"})


def store_observation(settings, subject: str, observation: ObservationInput):
    # Imported lazily to keep explicit schema migration imports acyclic.
    from app.schema import connect

    now = datetime.now(UTC)
    observation.check_cutoff(now)
    owner = owner_key(subject)
    payload = observation.model_dump(mode="json")
    value_digest = digest(payload)
    with connect(settings) as c:
        c.execute(
            "SELECT pg_advisory_xact_lock(hashtext(%s))",
            ["pongdang-quality/" + owner + "/" + observation.review_id],
        )
        current = c.execute(
            "SELECT revision,digest,payload FROM pongdang_data.quality_observation "
            "WHERE owner_key=%s AND review_id=%s ORDER BY revision DESC LIMIT 1",
            [owner, observation.review_id],
        ).fetchone()
        if current and current[0] == observation.revision:
            if current[1] != value_digest:
                raise QualityError("revision_conflict", 409)
            return StoredObservation.model_validate(current[2]), False
        expected = current[0] + 1 if current else 1
        if observation.revision != expected:
            raise QualityError("revision_out_of_order", 409)
        if current:
            previous = StoredObservation.model_validate(current[2])
            if previous.input.spot_id != observation.spot_id:
                raise QualityError("review_place_cannot_change", 409)
        if not c.execute(
            "SELECT 1 FROM pongdang_data.spots_waterspot WHERE id=%s",
            [observation.spot_id],
        ).fetchone():
            raise QualityError("unknown_spot", 404)
        evidence = StoredObservation(
            evidence_id=digest(
                {
                    "owner": owner,
                    "review_id": observation.review_id,
                    "revision": observation.revision,
                }
            ),
            owner_key=owner,
            received_at=now,
            input=observation,
            signals=extract_signals(observation.text),
            duplicate_fingerprint=fingerprint(observation),
        )
        c.execute(
            "INSERT INTO pongdang_data.quality_observation "
            "(evidence_id,owner_key,review_id,revision,spot_id,observed_at,received_at,"
            "retracted,payload,digest) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
            [
                evidence.evidence_id,
                owner,
                observation.review_id,
                observation.revision,
                observation.spot_id,
                observation.observed_at,
                now,
                observation.retracted,
                Jsonb(evidence.model_dump(mode="json")),
                value_digest,
            ],
        )
    return evidence, True


async def read_observations(c, subject, page, page_size):
    params = [owner_key(subject)]
    total = await (
        await c.execute(
            "SELECT count(*) AS total FROM pongdang_data.quality_observation "
            "WHERE owner_key=%s",
            params,
        )
    ).fetchone()
    rows = await (
        await c.execute(
            "SELECT payload FROM pongdang_data.quality_observation WHERE owner_key=%s "
            "ORDER BY received_at DESC,evidence_id LIMIT %s OFFSET %s",
            [*params, page_size, (page - 1) * page_size],
        )
    ).fetchall()
    return {
        "rows": [
            {k: v for k, v in row["payload"].items() if k != "owner_key"}
            for row in rows
        ],
        "total": total["total"],
        "page": page,
        "page_size": page_size,
    }


async def read_analyses(c, query, now):
    cutoff = query.as_of or now
    where = "FROM pongdang_data.quality_analysis WHERE as_of<=%s AND available_at<=%s "
    params = [cutoff, cutoff]
    if query.spot_id is not None:
        where += " AND spot_id=%s"
        params.append(query.spot_id)
    # Latest immutable analysis per place within the requested period. Historical
    # requests include only analyses that had actually been stored by the cutoff.
    view = (
        "WITH selected AS (SELECT DISTINCT ON (spot_id) payload,analysis_id,spot_id,"
        "as_of,available_at,from_at,until_at "
        + where
        + " ORDER BY spot_id,available_at DESC,analysis_id DESC) "
    )
    total = await (
        await c.execute(view + "SELECT count(*) AS total FROM selected", params)
    ).fetchone()
    rows = await (
        await c.execute(
            view + "SELECT * FROM selected ORDER BY spot_id LIMIT %s OFFSET %s",
            [*params, query.page_size, (query.page - 1) * query.page_size],
        )
    ).fetchall()
    result = []
    for row in rows:
        value = row["payload"]
        # Public results deliberately exclude author identities and full raw text.
        result.append(
            {
                **value,
                "analysis_id": row["analysis_id"],
                "available_at": row["available_at"],
                "from": row["from_at"],
                "until": row["until_at"],
                "freshness": "stale"
                if (cutoff - row["as_of"]).total_seconds() > 3600
                else "current",
                "review_age_seconds": max(
                    0,
                    (
                        cutoff - datetime.fromisoformat(value["latest_review_at"])
                    ).total_seconds(),
                )
                if value.get("latest_review_at")
                else None,
            }
        )
    return {
        "contract_version": "water-quality.v1",
        "rows": result,
        "total": total["total"],
        "page": query.page,
        "page_size": query.page_size,
        "as_of": cutoff,
        "queried_at": now,
        "status": "available" if result else "analysis_pending",
        "reason_codes": [] if result else ["no_persisted_analysis_for_period"],
    }
