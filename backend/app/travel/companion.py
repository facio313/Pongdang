"""Foreground-only B4 sessions and evidence-based, idempotent events. No LLM."""

import asyncio
import hashlib
from datetime import UTC, datetime, timedelta
from uuid import uuid4

from fastapi import HTTPException
from psycopg.types.json import Jsonb

from app.ai.tools import ToolSession
from app.schema import connect
from app.travel.catalog import KST, Catalog
from app.travel.models import CompanionEvent, TravelRequest, TripPlan, TripSession

HEARTBEAT_SECONDS = 90
CACHE_SECONDS = 60


def present(session, now):
    session = session.model_copy(deep=True)
    connected = (
        session.state == "active"
        and session.last_seen_at is not None
        and timedelta(0)
        <= now - session.last_seen_at
        < timedelta(seconds=HEARTBEAT_SECONDS)
    )
    session.connection_status = (
        "ended"
        if session.state == "ended"
        else ("connected" if connected else "disconnected")
    )
    session.monitoring = bool(
        connected
        and session.last_refresh_at
        and now - session.last_refresh_at < timedelta(seconds=HEARTBEAT_SECONDS)
        and session.snapshot.get("data_status") == "available"
    )
    if session.snapshot.get("valid_until"):
        if datetime.fromisoformat(session.snapshot["valid_until"]) <= now:
            session.monitoring = False
            session.snapshot["data_status"] = "stale"
    return session


def get_session(settings, owner, identifier, *, now=None):
    now = now or datetime.now(UTC)
    with connect(settings) as c:
        c.execute("SET TRANSACTION READ ONLY")
        row = c.execute(
            "SELECT payload FROM pongdang_data.travel_session "
            "WHERE id=%s AND owner_subject=%s",
            [identifier, owner],
        ).fetchone()
    if not row:
        raise HTTPException(404, "session_not_found")
    return present(TripSession.model_validate(row[0]), now)


def sessions(settings, owner, *, limit=100, offset=0, now=None):
    now = now or datetime.now(UTC)
    with connect(settings) as c:
        c.execute("SET TRANSACTION READ ONLY")
        rows = c.execute(
            "SELECT payload FROM pongdang_data.travel_session WHERE owner_subject=%s "
            "ORDER BY updated_at DESC,id LIMIT %s OFFSET %s",
            [owner, limit, offset],
        ).fetchall()
    return [present(TripSession.model_validate(row[0]), now) for row in rows]


def start_session(settings, owner, body, *, now=None):
    now = now or datetime.now(UTC)
    identifier = uuid4().hex
    with connect(settings) as c:
        row = c.execute(
            "SELECT revision,payload FROM pongdang_data.travel_plan "
            "WHERE id=%s AND owner_subject=%s FOR SHARE",
            [body.plan_id, owner],
        ).fetchone()
        if not row:
            raise HTTPException(404, "plan_not_found")
        if row[0] != body.plan_revision:
            raise HTTPException(409, "plan_revision_conflict")
        plan = TripPlan.model_validate(row[1])
        if plan.status == "conflict":
            raise HTTPException(409, "resolve_plan_conflicts_before_start")
        session = TripSession(
            session_id=identifier,
            plan_id=body.plan_id,
            plan_revision=body.plan_revision,
            revision=1,
            state="active",
            started_at=now,
            location_status=body.location_status,
            notifications=body.notifications,
            snapshot={"plan": plan.model_dump(mode="json"), "data_status": "unknown"},
        )
        c.execute(
            "INSERT INTO "
            "pongdang_data.travel_session(id,owner_subject,plan_id,r"
            "evision,payload)"
            " VALUES(%s,%s,%s,1,%s)",
            [identifier, owner, body.plan_id, Jsonb(session.model_dump(mode="json"))],
        )
    return session


def change_session(
    settings, owner, identifier, *, notification_update=None, end=False, now=None
):
    now = now or datetime.now(UTC)
    with connect(settings) as c:
        row = c.execute(
            "SELECT payload FROM pongdang_data.travel_session WHERE id=%s "
            "AND owner_subject=%s FOR UPDATE",
            [identifier, owner],
        ).fetchone()
        if not row:
            raise HTTPException(404, "session_not_found")
        session = TripSession.model_validate(row[0])
        if end and session.state == "ended":
            return present(session, now)
        if session.state == "ended":
            raise HTTPException(409, "trip_has_ended")
        if notification_update:
            if notification_update.expected_revision != session.revision:
                raise HTTPException(409, "session_revision_conflict")
            session.notifications = notification_update.notifications
        if end:
            session.state, session.ended_at = "ended", now
            session.location_status, session.current_spot_id = "off", None
            session.current_item_id = None
            for key in (
                "current_spot_id",
                "current_item_id",
                "next_spot_id",
                "next_item_id",
            ):
                session.snapshot[key] = None
            session.last_location_at, session.last_seen_at = None, None
            session.monitoring = False
        session.revision += 1
        _write_session(c, owner, session)
    return present(session, now)


def _write_session(c, owner, session):
    c.execute(
        "UPDATE pongdang_data.travel_session SET "
        "payload=%s,revision=%s,updated_at=now() "
        "WHERE id=%s AND owner_subject=%s",
        [
            Jsonb(session.model_dump(mode="json")),
            session.revision,
            session.session_id,
            owner,
        ],
    )


def event_proposals(session, restrictions, facts, now):
    proposals = []
    old_observations = observation_records(
        session.snapshot.get("facts", []), now, include_expired=True
    )
    for identity, record in observation_records(facts, now).items():
        old = old_observations.get(identity)
        corrected = old is not None and old["key"] != record["key"]
        proposals.append(
            {
                "kind": "data_corrected" if corrected else "data_updated",
                "spot_id": record["spot_id"],
                "target_at": record["observed_at"],
                "valid_until": record["valid_until"],
                "key": record["key"],
                "previous_key": old["key"] if corrected else None,
                "evidence": [record["fact"]],
                "message": "같은 관측시각의 자료가 정정됐어요."
                if corrected
                else "새 관측 자료가 도착했어요. 관측시각과 출처를 확인해 주세요.",
            }
        )
    for sid, records in restrictions.items():
        for r in records:
            if not r["blocked"] or datetime.fromisoformat(r["valid_until"]) <= now:
                continue
            if datetime.fromisoformat(r["valid_from"]) > now:
                continue
            proposals.append(
                {
                    "kind": "official_restriction",
                    "spot_id": sid,
                    "target_at": datetime.fromisoformat(r["valid_from"]),
                    "valid_until": datetime.fromisoformat(r["valid_until"]),
                    "key": "restriction:" + r["evidence_id"],
                    "evidence": [r],
                    "previous_key": "restriction:" + r["supersedes_id"]
                    if r["supersedes_id"]
                    else None,
                    "message": "이 장소에 적용되는 공식 제한이 확인됐어요. "
                    "적용 활동과 기간을 확인해 주세요.",
                }
            )
    for fact in facts:
        meta = fact.get("metadata", {})
        if (
            fact.get("feature") != "tides"
            or meta.get("kind") != "low"
            or meta.get("provider") != "khoa_tide_extrema"
            or meta.get("spatial_relation") != "representative_station"
            or not meta.get("mapping_evidence_ref")
            or meta.get("state") != "available"
            or meta.get("data_kind") != "official_forecast"
        ):
            continue
        target = datetime.fromisoformat(meta["event_at"])
        valid = datetime.fromisoformat(meta["valid_until"])
        if not now < target <= now + timedelta(minutes=30) or valid <= now:
            continue
        if datetime.fromisoformat(meta["fetched_at"]) > now:
            continue
        key = f"tide:{meta['source_key']}:{meta['revision_id']}"
        previous = meta.get("previous_revision_id")
        proposals.append(
            {
                "kind": "low_tide",
                "spot_id": meta["spot_id"],
                "target_at": target,
                "valid_until": valid,
                "key": key,
                "previous_key": f"tide:{meta['source_key']}:{previous}"
                if previous
                else None,
                "evidence": [fact],
                "message": "공식 예보의 저조 시각은 "
                f"{target.astimezone(KST):%H:%M}예요. "
                "활동 가능 여부는 별도로 확인해 주세요.",
            }
        )
    return proposals


def observation_records(facts, now, *, include_expired=False):
    records = {}
    for fact in facts:
        meta = fact.get("metadata", {})
        if (
            fact.get("feature") != "place_conditions"
            or fact.get("data_status") != "available"
            or meta.get("relation") != "representative_station"
            or not meta.get("mapping_id")
        ):
            continue
        for source in meta.get("evidence", []):
            if (
                source.get("mode") != "observation"
                or not source.get("source_record_id")
                or source.get("is_missing")
                or not source.get("unit")
                or source.get("numeric_value") is None
                or source.get("source_state") not in {"recorded", "current"}
                or source.get("metric_state") not in {"recorded", "current"}
            ):
                continue
            try:
                at = datetime.fromisoformat(source["observed_at"])
                until = datetime.fromisoformat(source["valid_until"])
                fetched = datetime.fromisoformat(source["fetched_at"])
            except ValueError, KeyError, TypeError:
                continue
            if (
                not at <= fetched <= now
                or until <= at
                or (not include_expired and until <= now)
            ):
                continue
            identity = (
                fact["spot_id"],
                source["provider"],
                source["source_record_id"],
                source["name"],
                at.isoformat(),
            )
            records[identity] = {
                "key": "observation:"
                + ":".join(map(str, identity))
                + ":"
                + str(source["snapshot_id"]),
                "spot_id": fact["spot_id"],
                "observed_at": at,
                "valid_until": until,
                "fact": fact,
            }
    return records


def events(settings, owner, identifier, *, limit=100, offset=0, now=None):
    now = now or datetime.now(UTC)
    get_session(settings, owner, identifier, now=now)
    with connect(settings) as c:
        c.execute("SET TRANSACTION READ ONLY")
        rows = c.execute(
            "SELECT payload FROM pongdang_data.travel_event "
            "WHERE session_id=%s AND owner_subject=%s ORDER BY "
            "created_at DESC,id LIMIT %s OFFSET %s",
            [identifier, owner, limit, offset],
        ).fetchall()
    result = []
    for row in rows:
        event = CompanionEvent.model_validate(row[0])
        if event.valid_until <= now and event.status == "confirmed":
            event.status = "expired"
        result.append(event)
    return result


def acknowledge(settings, owner, identifier, event_id, *, now=None):
    now = now or datetime.now(UTC)
    with connect(settings) as c:
        row = c.execute(
            "SELECT payload FROM pongdang_data.travel_event WHERE id=%s "
            "AND session_id=%s AND owner_subject=%s FOR UPDATE",
            [event_id, identifier, owner],
        ).fetchone()
        if not row:
            raise HTTPException(404, "event_not_found")
        event = CompanionEvent.model_validate(row[0])
        event.acknowledged_at = event.acknowledged_at or now
        c.execute(
            "UPDATE pongdang_data.travel_event SET payload=%s WHERE "
            "id=%s AND owner_subject=%s",
            [Jsonb(event.model_dump(mode="json")), event_id, owner],
        )
    return event


async def refresh(settings, owner, identifier, body, *, now=None, catalog=None):
    now = now or datetime.now(UTC)
    session = await asyncio.to_thread(get_session, settings, owner, identifier, now=now)
    if session.state == "ended":
        raise HTTPException(409, "trip_has_ended")
    plan = TripPlan.model_validate(session.snapshot["plan"])
    ids = list(dict.fromkeys(stop.spot_id for stop in plan.input_stops))
    if body.current_spot_id is not None and body.current_spot_id not in ids:
        raise HTTPException(422, "current_place_must_belong_to_plan")
    selected = body.current_spot_id
    item = next(
        (s for s in plan.input_stops if s.item_id == body.current_item_id), None
    )
    if body.current_item_id and (item is None or selected not in {None, item.spot_id}):
        raise HTTPException(422, "current_item_does_not_match_plan")
    if item:
        selected = item.spot_id
    else:
        possible = [s for s in plan.input_stops if s.spot_id == selected]
        if len(possible) > 1:
            raise HTTPException(422, "current_item_required_for_repeated_place")
        item = possible[0] if possible else None
    body = body.model_copy(
        update={
            "current_spot_id": selected,
            "current_item_id": item.item_id if item else None,
        }
    )
    ordered_ids = [s.spot_id for s in plan.input_stops]
    index = plan.input_stops.index(item) if item else -1
    next_id = ordered_ids[index + 1] if index + 1 < len(ordered_ids) else None
    focus = [sid for sid in (selected, next_id) if sid]
    cached = (
        session.last_refresh_at is not None
        and now - session.last_refresh_at < timedelta(seconds=CACHE_SECONDS)
        and selected == session.current_spot_id
        and body.current_item_id == session.current_item_id
    )
    snapshot, proposals = session.snapshot, []
    if not cached and body.foreground:
        catalog = catalog or Catalog(settings, now)
        current_request = plan.request.model_copy(
            update={"dates": [now.astimezone(KST).date()], "day_trip": True}
        )
        # Revalidate the updated request instead of accepting unchecked copies.
        current_request = TravelRequest.model_validate(current_request.model_dump())
        facts, restrictions = [], {}
        status = "partial"
        try:
            restrictions = await catalog.restrictions(focus, current_request)
            for sid in focus:
                data = await catalog.conditions(sid, current_request)
                facts.extend(data["facts"])
                if data["status"] == "query_failed":
                    status = "query_failed"
                tool = ToolSession(settings, now, reader=catalog.reader)
                tide = await tool.execute(
                    "tides",
                    {
                        "spot_id": sid,
                        "activity": current_request.activity,
                        "when": "now",
                        "part_of_day": "all",
                        "start": None,
                        "end": None,
                    },
                )
                facts.extend(tide["facts"])
            proposals = event_proposals(session, restrictions, facts, now)
            if status != "query_failed":
                status = "available" if proposals else "no_data"
        except HTTPException:
            status = "query_failed"
            proposals = []
        valid_until = min(
            [now + timedelta(seconds=HEARTBEAT_SECONDS)]
            + [proposal["valid_until"] for proposal in proposals]
        )
        snapshot = {
            "plan": session.snapshot["plan"],
            "data_status": status,
            "facts": facts,
            "restrictions": restrictions,
            "current_spot_id": selected,
            "current_item_id": body.current_item_id,
            "next_spot_id": next_id,
            "next_item_id": plan.input_stops[index + 1].item_id if next_id else None,
            "eta": None,
            "route_status": "unconfigured",
            "as_of": now.isoformat(),
            "attempted_at": now.isoformat(),
            "last_successful_refresh_at": now.isoformat()
            if status != "query_failed"
            else session.snapshot.get("last_successful_refresh_at"),
            "valid_until": valid_until.isoformat(),
            "disabled_event_rules": [
                "sunset_arrival",
                "wave_activity",
                "rising_valley_level",
            ],
        }
    return await asyncio.to_thread(
        _persist_refresh,
        settings,
        owner,
        session,
        body,
        snapshot,
        proposals,
        now,
        not cached and body.foreground,
    )


def _persist_refresh(
    settings, owner, read_session, body, snapshot, proposals, now, fetched
):
    notifications = []
    with connect(settings) as c:
        row = c.execute(
            "SELECT payload FROM pongdang_data.travel_session WHERE "
            "id=%s AND owner_subject=%s FOR UPDATE",
            [read_session.session_id, owner],
        ).fetchone()
        if not row:
            raise HTTPException(404, "session_not_found")
        session = TripSession.model_validate(row[0])
        if session.state == "ended":
            raise HTTPException(409, "trip_has_ended")
        if session.revision != read_session.revision:
            return {
                "session": present(session, now),
                "new_notifications": [],
                "cached": True,
            }
        session.current_spot_id = body.current_spot_id
        session.current_item_id = body.current_item_id
        session.location_status = body.location_status
        session.last_location_at = now if body.current_spot_id else None
        session.last_seen_at = now if body.foreground else None
        if fetched:
            session.last_refresh_at, session.snapshot = now, snapshot
        for proposal in proposals:
            digest = hashlib.sha256(proposal["key"].encode()).hexdigest()
            if c.execute(
                "SELECT id FROM pongdang_data.travel_event WHERE "
                "session_id=%s AND deduplication_key=%s",
                [session.session_id, digest],
            ).fetchone():
                continue
            previous = None
            if proposal["previous_key"]:
                prior = c.execute(
                    "SELECT id,payload FROM pongdang_data.travel_event "
                    "WHERE session_id=%s AND deduplication_key=%s",
                    [
                        session.session_id,
                        hashlib.sha256(proposal["previous_key"].encode()).hexdigest(),
                    ],
                ).fetchone()
                if prior:
                    previous = prior[0]
                    corrected = dict(prior[1], status="superseded")
                    c.execute(
                        "UPDATE pongdang_data.travel_event SET payload=%s WHERE "
                        "id=%s AND owner_subject=%s",
                        [Jsonb(corrected), previous, owner],
                    )
            event = CompanionEvent(
                event_id=uuid4().hex,
                session_id=session.session_id,
                kind=proposal["kind"],
                spot_id=proposal["spot_id"],
                occurred_at=now,
                target_at=proposal["target_at"],
                evidence=proposal["evidence"],
                valid_until=proposal["valid_until"],
                deduplication_key=digest,
                corrects_event_id=previous,
                message=proposal["message"],
            )
            last = c.execute(
                "SELECT max((payload->>'notified_at')::timestamptz) "
                "FROM pongdang_data.travel_event "
                "WHERE session_id=%s AND payload->>'kind'=%s",
                [session.session_id, event.kind],
            ).fetchone()[0]
            if (
                session.notifications.enabled
                and event.kind in session.notifications.kinds
                and (
                    last is None
                    or now - last
                    >= timedelta(minutes=session.notifications.minimum_interval_minutes)
                )
            ):
                event.notified_at = now
                notifications.append(event)
            c.execute(
                "INSERT INTO "
                "pongdang_data.travel_event(id,owner_subject,session_id,"
                "deduplication_key,payload)"
                " VALUES(%s,%s,%s,%s,%s)",
                [
                    event.event_id,
                    owner,
                    session.session_id,
                    digest,
                    Jsonb(event.model_dump(mode="json")),
                ],
            )
        session.revision += 1
        _write_session(c, owner, session)
    return {
        "session": present(session, now),
        "new_notifications": notifications,
        "cached": not fetched,
    }
