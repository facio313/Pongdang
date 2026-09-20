"""Restart-safe preference evaluation and owner-scoped subscription storage."""

import hashlib
import json
from dataclasses import asdict
from datetime import UTC, datetime
from uuid import uuid4
from zoneinfo import ZoneInfo

from fastapi import HTTPException
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

from app.livecams.places import PLACE_SELECT
from app.notifications.models import SubscriptionInput, SubscriptionView
from app.notifications.provider import configuration_state
from app.schema import connect
from app.water_index.units import convert_exact

RULE_VERSION = "temperature-preference-v1"


def lock_subscription(connection, subscription_id):
    connection.execute(
        "SELECT pg_advisory_xact_lock(hashtext(%s))",
        ["pongdang-notification/" + subscription_id],
    )


def subscription_view(row, settings):
    return SubscriptionView(
        **{k: row[k] for k in SubscriptionView.model_fields if k in row},
        year=row["season_year"],
        delivery_configuration=configuration_state(settings, row["channel"]),
    )


def cancel_pending(c, subscription_id, reason, *, state="cancelled"):
    c.execute(
        "UPDATE pongdang_data.notification_outbox o SET state=CASE "
        "WHEN o.first_attempt_at IS NULL THEN 'cancelled' "
        "ELSE 'delivery_unknown' END,"
        "last_error=%s,updated_at=now() FROM pongdang_data.notification_event e "
        "WHERE e.id=o.event_id AND e.subscription_id=%s "
        "AND o.state IN ('pending','retry','sending','not_configured')",
        [reason, subscription_id],
    )
    c.execute(
        "UPDATE pongdang_data.notification_event SET state=%s "
        "WHERE subscription_id=%s AND state='active'",
        [state, subscription_id],
    )


def save_subscription(settings, principal, body, *, identifier=None, expected=None):
    body = SubscriptionInput.model_validate(body)
    if body.channel == "email":
        if not principal.email:
            raise HTTPException(403, detail="SSO_VERIFIED_EMAIL_REQUIRED")
        if body.destination != principal.email:
            raise HTTPException(403, detail="DESTINATION_MUST_MATCH_SSO_EMAIL")
    elif body.destination is not None:
        raise HTTPException(422, detail="IN_APP_DESTINATION_MUST_BE_NULL")
    current_year = datetime.now(ZoneInfo(body.timezone)).year
    if body.year not in {current_year, current_year + 1}:
        raise HTTPException(422, detail="SUBSCRIPTION_YEAR_OUT_OF_RANGE")
    with connect(settings) as c:
        c.row_factory = dict_row
        # Serialize create/upsert limits for one existing SSO subject.
        c.execute(
            "SELECT pg_advisory_xact_lock(hashtext(%s))",
            ["pongdang-notification-owner/" + principal.subject],
        )
        place = c.execute(
            f"SELECT id,place_kind FROM ({PLACE_SELECT}) p WHERE id=%s",
            [body.spot_id],
        ).fetchone()
        if not place:
            raise HTTPException(404, detail="PLACE_NOT_FOUND")
        if place["place_kind"] not in {"beach", "valley"}:
            raise HTTPException(422, detail="WATER_PLACE_REQUIRED")
        if identifier:
            lock_subscription(c, identifier)
            old = c.execute(
                "SELECT * FROM pongdang_data.notification_subscription "
                "WHERE id=%s AND owner_subject=%s FOR UPDATE",
                [identifier, principal.subject],
            ).fetchone()
            if not old:
                raise HTTPException(404, detail="SUBSCRIPTION_NOT_FOUND")
            if old["revision"] != expected:
                raise HTTPException(409, detail="SUBSCRIPTION_REVISION_CONFLICT")
            if all(
                old[k] == v
                for k, v in {
                    **body.model_dump(exclude={"year"}),
                    "season_year": body.year,
                }.items()
            ):
                return subscription_view(old, settings)
            if body.active and not old["active"]:
                count = c.execute(
                    "SELECT count(*) AS n FROM "
                    "pongdang_data.notification_subscription "
                    "WHERE owner_subject=%s AND active",
                    [principal.subject],
                ).fetchone()["n"]
                if count >= 100:
                    raise HTTPException(409, detail="SUBSCRIPTION_LIMIT_REACHED")
        else:
            old = c.execute(
                "SELECT * FROM pongdang_data.notification_subscription "
                "WHERE owner_subject=%s AND spot_id=%s AND season_year=%s",
                [principal.subject, body.spot_id, body.year],
            ).fetchone()
            if old:
                same = all(
                    old[k] == v
                    for k, v in {
                        **body.model_dump(exclude={"year"}),
                        "season_year": body.year,
                    }.items()
                )
                if same:
                    return subscription_view(old, settings)
                raise HTTPException(409, detail="SUBSCRIPTION_ALREADY_EXISTS")
            count = c.execute(
                "SELECT count(*) AS n FROM pongdang_data.notification_subscription "
                "WHERE owner_subject=%s AND active",
                [principal.subject],
            ).fetchone()["n"]
            if count >= 100:
                raise HTTPException(409, detail="SUBSCRIPTION_LIMIT_REACHED")
        duplicate = c.execute(
            "SELECT id FROM pongdang_data.notification_subscription WHERE "
            "owner_subject=%s AND spot_id=%s AND season_year=%s AND id<>%s",
            [principal.subject, body.spot_id, body.year, identifier or ""],
        ).fetchone()
        if duplicate:
            raise HTTPException(409, detail="SUBSCRIPTION_ALREADY_EXISTS")
        values = [
            body.spot_id,
            body.year,
            body.timezone,
            body.minimum_temperature_c,
            body.channel,
            body.destination,
            body.active,
        ]
        if identifier:
            cancel_pending(c, identifier, "SUBSCRIPTION_CHANGED")
            row = c.execute(
                "UPDATE pongdang_data.notification_subscription SET spot_id=%s,"
                "season_year=%s,timezone=%s,minimum_temperature_c=%s,channel=%s,"
                "destination=%s,active=%s,revision=revision+1,updated_at=now(),"
                "condition_state='unknown',last_evaluated_at=NULL WHERE id=%s "
                "RETURNING *",
                [*values, identifier],
            ).fetchone()
        else:
            row = c.execute(
                "INSERT INTO pongdang_data.notification_subscription (id,"
                "owner_subject,spot_id,season_year,timezone,minimum_temperature_c,"
                "channel,destination,active) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s) "
                "RETURNING *",
                [str(uuid4()), principal.subject, *values],
            ).fetchone()
        return subscription_view(row, settings)


def cancel_subscription(settings, subject, identifier):
    with connect(settings) as c:
        lock_subscription(c, identifier)
        row = c.execute(
            "SELECT active FROM pongdang_data.notification_subscription "
            "WHERE id=%s AND owner_subject=%s FOR UPDATE",
            [identifier, subject],
        ).fetchone()
        if not row:
            raise HTTPException(404, detail="SUBSCRIPTION_NOT_FOUND")
        cancel_pending(c, identifier, "SUBSCRIPTION_CANCELLED")
        if row[0]:
            c.execute(
                "UPDATE pongdang_data.notification_subscription SET active=false,"
                "revision=revision+1,updated_at=now() WHERE id=%s",
                [identifier],
            )


def _station(c, spot_id, now):
    direct = c.execute(
        "SELECT id AS station_id,provider,source_id FROM "
        "pongdang_data.collection_station WHERE spot_id=%s AND fetched_at<=%s LIMIT 2",
        [spot_id, now],
    ).fetchall()
    if len(direct) == 1:
        return {**direct[0], "relation": "station_itself", "mapping_id": None}
    mapping_table = c.execute(
        "SELECT to_regclass('pongdang_data.water_index_station_mapping') AS name"
    ).fetchone()["name"]
    if not mapping_table:
        return None
    rows = c.execute(
        "SELECT m.mapping_id,m.station_id,m.payload,m.valid_from,m.valid_until,"
        "s.provider,s.source_id FROM "
        "pongdang_data.water_index_station_mapping m JOIN "
        "pongdang_data.collection_station s ON s.id=m.station_id "
        "WHERE m.spot_id=%s AND m.valid_from<=%s AND m.valid_until>%s "
        "AND m.available_at<=%s AND m.payload->'activities' ? 'swim' "
        "AND NOT EXISTS (SELECT 1 FROM "
        "pongdang_data.water_index_station_mapping newer "
        "WHERE newer.supersedes_id=m.mapping_id AND newer.available_at<=%s) "
        "LIMIT 2",
        [spot_id, now, now, now, now],
    ).fetchall()
    if len(rows) != 1:
        return None
    return {**rows[0], "relation": "representative_station"}


def evaluate_condition(c, subscription, now):
    """Evaluate real, current observations at a documented station relationship."""
    year = subscription["season_year"]
    zone = ZoneInfo(subscription["timezone"])
    result = {
        "rule_version": RULE_VERSION,
        "kind": "temperature_preference_met",
        "spot_id": subscription["spot_id"],
        "minimum_temperature_c": subscription["minimum_temperature_c"],
        "preference_is_safety_threshold": False,
        "safety_status": "unknown",
        "first_in_year": None,
        "first_in_observed_history": None,
        "year": year,
        "timezone": subscription["timezone"],
        "condition_state": "unknown",
        "reason_codes": [],
    }
    if now.astimezone(zone).year != year:
        result["reason_codes"] = ["outside_subscription_year"]
        return result
    station = _station(c, subscription["spot_id"], now)
    if station is None:
        result["reason_codes"] = ["station_mapping_missing_or_ambiguous"]
        return result
    result["station_relationship"] = station
    year_start = datetime(year, 1, 1, tzinfo=zone)
    observation = c.execute(
        "SELECT s.id AS snapshot_id,s.provider,s.source_record_id,"
        "s.provider_record_id AS revision,s.observed_at,s.fetched_at,s.valid_until,"
        "s.spatial_scope,s.state,m.numeric_value,m.unit,m.is_missing "
        "FROM pongdang_data.conditions_observationsnapshot s JOIN "
        "pongdang_data.conditions_observationmetric m ON m.snapshot_id=s.id "
        "WHERE s.station_id=%s AND s.state<>'superseded' AND m.state<>'superseded' "
        "AND m.name='water_temperature' AND m.mode='observation' "
        "AND s.observed_at BETWEEN %s AND %s AND s.fetched_at<=%s "
        "AND (s.issued_at IS NULL OR s.issued_at<=%s) "
        "ORDER BY s.observed_at DESC,s.fetched_at DESC,s.id DESC LIMIT 1",
        [station["station_id"], year_start, now, now, now],
    ).fetchone()
    if not observation:
        result["reason_codes"] = ["no_temperature_observation"]
        return result
    result["observation"] = observation
    if station.get("valid_from") and not (
        station["valid_from"] <= observation["observed_at"] < station["valid_until"]
    ):
        result["reason_codes"] = ["observation_outside_mapping_period"]
        return result
    if observation["valid_until"] is None or observation["valid_until"] <= now:
        result["reason_codes"] = ["temperature_expired"]
        return result
    if observation["is_missing"] or observation["numeric_value"] is None:
        result["reason_codes"] = ["temperature_missing"]
        return result
    try:
        normalized = convert_exact(
            observation["numeric_value"],
            observation["unit"],
            "degC",
            quantity="water_temperature",
        )
    except ValueError:
        result["reason_codes"] = ["temperature_unit_not_comparable"]
        return result
    result["temperature_normalization"] = asdict(normalized)
    conflicts = c.execute(
        "SELECT count(DISTINCT ROW(m.numeric_value,CASE WHEN m.unit "
        "IN ('degC','°C') THEN 'degC' ELSE m.unit END,m.is_missing)) AS count "
        "FROM pongdang_data.conditions_observationsnapshot s JOIN "
        "pongdang_data.conditions_observationmetric m ON m.snapshot_id=s.id "
        "WHERE s.station_id=%s AND s.observed_at=%s AND s.fetched_at<=%s "
        "AND (s.issued_at IS NULL OR s.issued_at<=%s) "
        "AND s.state<>'superseded' AND m.state<>'superseded' "
        "AND m.name='water_temperature' AND m.mode='observation'",
        [station["station_id"], observation["observed_at"], now, now],
    ).fetchone()["count"]
    if conflicts > 1:
        result["reason_codes"] = ["conflicting_temperature_evidence"]
        return result
    met = normalized.value >= subscription["minimum_temperature_c"]
    result["condition_state"] = "met" if met else "not_met"
    prior = c.execute(
        "SELECT count(*) AS count FROM "
        "pongdang_data.conditions_observationsnapshot s JOIN "
        "pongdang_data.conditions_observationmetric m ON m.snapshot_id=s.id "
        "WHERE s.station_id=%s AND s.state<>'superseded' AND m.state<>'superseded' "
        "AND m.name='water_temperature' AND m.mode='observation' "
        "AND m.unit IN ('degC','°C') AND NOT m.is_missing AND m.numeric_value>=%s "
        "AND s.observed_at>=%s AND s.observed_at<%s AND s.fetched_at<=%s "
        "AND (s.issued_at IS NULL OR s.issued_at<=%s)",
        [
            station["station_id"],
            subscription["minimum_temperature_c"],
            year_start,
            observation["observed_at"],
            now,
            now,
        ],
    ).fetchone()["count"]
    result["earlier_qualifying_observations"] = prior
    result["first_in_observed_history"] = not bool(prior) if met else None
    result["first_in_year"] = False if met and prior else None
    result["reason_codes"] = [
        "user_preference_met" if met else "below_user_preference",
        "earlier_qualifying_observation" if prior else "annual_history_not_certified",
        "temperature_does_not_establish_swimming_safety",
    ]
    return result


def _json(value):
    return json.loads(
        json.dumps(value, default=lambda x: x.isoformat(), sort_keys=True)
    )


def evaluate_subscriptions(settings, *, now=None, limit=100):
    now = now or datetime.now(UTC)
    received = inserted = 0
    with connect(settings) as c:
        subscriptions = c.execute(
            "SELECT id FROM pongdang_data.notification_subscription WHERE active "
            "ORDER BY last_evaluated_at ASC NULLS FIRST,id LIMIT %s",
            [min(max(limit, 1), 100)],
        ).fetchall()
    for (identifier,) in subscriptions:
        with connect(settings) as c:
            c.row_factory = dict_row
            lock_subscription(c, identifier)
            sub = c.execute(
                "SELECT * FROM pongdang_data.notification_subscription "
                "WHERE id=%s AND active FOR UPDATE",
                [identifier],
            ).fetchone()
            if not sub:
                continue
            payload = _json(evaluate_condition(c, sub, now))
            evidence_key = hashlib.sha256(
                json.dumps(payload, sort_keys=True).encode()
            ).hexdigest()
            received += 1
            inserted += bool(
                c.execute(
                    "INSERT INTO pongdang_data.notification_evaluation "
                    "(subscription_id,subscription_revision,evaluated_at,evidence_key,"
                    "condition_state,payload) VALUES (%s,%s,%s,%s,%s,%s) "
                    "ON CONFLICT DO NOTHING RETURNING id",
                    [
                        identifier,
                        sub["revision"],
                        now,
                        evidence_key,
                        payload["condition_state"],
                        Jsonb(payload),
                    ],
                ).fetchone()
            )
            # A correction cannot leave a queued, contradicted alert deliverable.
            c.execute(
                "UPDATE pongdang_data.notification_event e SET state='superseded' "
                "WHERE e.subscription_id=%s AND e.state='active' AND EXISTS "
                "(SELECT 1 FROM pongdang_data.conditions_observationsnapshot s "
                "WHERE s.id=(e.payload->'observation'->>'snapshot_id')::bigint "
                "AND s.state='superseded')",
                [identifier],
            )
            # End a never-dispatched episode when its condition disappears. An
            # accepted/ambiguous delivery keeps a season-wide dispatch barrier.
            c.execute(
                "UPDATE pongdang_data.notification_event e SET state='cancelled' "
                "FROM pongdang_data.notification_outbox o WHERE o.event_id=e.id "
                "AND e.subscription_id=%s AND e.state='active' "
                "AND o.first_attempt_at IS NULL "
                "AND o.state IN ('pending','retry','not_configured','cancelled') "
                "AND (%s OR o.state='cancelled' OR "
                "COALESCE((e.payload->'observation'->>'valid_until')::timestamptz "
                "<=%s,true))",
                [identifier, payload["condition_state"] != "met", now],
            )
            c.execute(
                "UPDATE pongdang_data.notification_subscription SET "
                "condition_state=%s,last_evaluated_at=%s WHERE id=%s",
                [payload["condition_state"], now, identifier],
            )
            if payload["condition_state"] != "met":
                continue
            dispatched = c.execute(
                "SELECT 1 FROM pongdang_data.notification_event e JOIN "
                "pongdang_data.notification_outbox o ON o.event_id=e.id "
                "WHERE e.subscription_id=%s AND e.subscription_revision=%s "
                "AND e.season_year=%s AND e.kind=%s AND "
                "(o.first_attempt_at IS NOT NULL OR "
                "o.state IN ('accepted','available_in_app','delivery_unknown')) "
                "LIMIT 1",
                [identifier, sub["revision"], sub["season_year"], payload["kind"]],
            ).fetchone()
            if dispatched:
                continue
            event_id = str(uuid4())
            event = c.execute(
                "INSERT INTO pongdang_data.notification_event "
                "(id,subscription_id,subscription_revision,season_year,kind,"
                "created_at,payload) VALUES (%s,%s,%s,%s,%s,%s,%s) "
                "ON CONFLICT DO NOTHING RETURNING id",
                [
                    event_id,
                    identifier,
                    sub["revision"],
                    sub["season_year"],
                    payload["kind"],
                    now,
                    Jsonb(payload),
                ],
            ).fetchone()
            if event:
                inserted += 1
                c.execute(
                    "INSERT INTO pongdang_data.notification_outbox "
                    "(event_id,state,next_attempt_at,provider,updated_at) "
                    "VALUES (%s,%s,%s,%s,%s)",
                    [
                        event_id,
                        "available_in_app" if sub["channel"] == "in_app" else "pending",
                        now,
                        "in_app" if sub["channel"] == "in_app" else "resend",
                        now,
                    ],
                )
    return {"received": received, "inserted": inserted}
