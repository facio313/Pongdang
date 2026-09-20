"""Private storage. Every lookup/mutation binds the authenticated SSO owner."""

from datetime import UTC, datetime
from uuid import uuid4
from zoneinfo import ZoneInfo

from fastapi import HTTPException
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

from app.schema import connect
from app.travel.catalog import VISIT_KINDS
from app.travel.models import TravelPreference, TripPlan


def profile(settings, owner):
    with connect(settings) as c:
        c.execute("SET TRANSACTION READ ONLY")
        row = c.execute(
            "SELECT revision,payload FROM pongdang_data.travel_preference "
            "WHERE owner_subject=%s",
            [owner],
        ).fetchone()
    return {
        "revision": row[0] if row else 0,
        "preference": TravelPreference.model_validate(row[1] if row else {}),
    }


def save_profile(settings, owner, update):
    preference = TravelPreference.model_validate(update.preference.model_dump())
    with connect(settings) as c:
        c.execute(
            "SELECT pg_advisory_xact_lock(hashtext(%s))", ["travel-profile:" + owner]
        )
        row = c.execute(
            "SELECT revision FROM pongdang_data.travel_preference "
            "WHERE owner_subject=%s",
            [owner],
        ).fetchone()
        if (row[0] if row else 0) != update.expected_revision:
            raise HTTPException(409, "preference_revision_conflict")
        revision = update.expected_revision + 1
        c.execute(
            "INSERT INTO "
            "pongdang_data.travel_preference(owner_subject,revision,"
            "payload)"
            " VALUES(%s,%s,%s) ON CONFLICT(owner_subject) DO UPDATE SET "
            "revision=EXCLUDED.revision,payload=EXCLUDED.payload,updated_at=now()",
            [owner, revision, Jsonb(preference.model_dump(mode="json"))],
        )
    return {"revision": revision, "preference": preference}


def signals(settings, owner, *, limit=100, offset=0, spot_id=None, kind=None):
    filters = ["owner_subject=%s"]
    params = [owner]
    if spot_id is not None:
        filters.append("payload->>'spot_id'=%s")
        params.append(str(spot_id))
    if kind is not None:
        filters.append("payload->>'kind'=%s")
        params.append(kind)
    with connect(settings) as c:
        c.execute("SET TRANSACTION READ ONLY")
        c.row_factory = dict_row
        rows = c.execute(
            "SELECT id,payload,created_at FROM pongdang_data.travel_signal "
            f"WHERE {' AND '.join(filters)} "
            "ORDER BY created_at DESC,id LIMIT %s OFFSET %s",
            [*params, limit, offset],
        ).fetchall()
    return rows


def save_signal(settings, owner, signal):
    if (
        signal.visited_on
        and signal.visited_on
        > datetime.now(UTC).astimezone(ZoneInfo("Asia/Seoul")).date()
    ):
        raise HTTPException(422, "visit_cannot_be_in_future")
    identifier = uuid4().hex
    with connect(settings) as c:
        if signal.kind == "favorite":
            c.execute(
                "SELECT pg_advisory_xact_lock(hashtext(%s))",
                ["travel-signals:" + owner],
            )
            existing = c.execute(
                "SELECT id FROM pongdang_data.travel_signal WHERE owner_subject=%s "
                "AND payload->>'kind'='favorite' "
                "AND (payload->>'spot_id')::bigint=%s LIMIT 1",
                [owner, signal.spot_id],
            ).fetchone()
            if existing:
                return {"id": existing[0], "signal": signal}
        if (
            signal.spot_id is not None
            and not c.execute(
                "SELECT 1 WHERE EXISTS (SELECT 1 FROM pongdang_data.collection_place "
                "WHERE spot_id=%s) OR EXISTS (SELECT 1 FROM "
                "pongdang_data.collection_station WHERE spot_id=%s AND kind=ANY(%s))",
                [signal.spot_id, signal.spot_id, VISIT_KINDS],
            ).fetchone()
        ):
            raise HTTPException(404, "travel_place_not_found")
        c.execute(
            "INSERT INTO pongdang_data.travel_signal(id,owner_subject,payload) "
            "VALUES(%s,%s,%s)",
            [identifier, owner, Jsonb(signal.model_dump(mode="json"))],
        )
    return {"id": identifier, "signal": signal}


def delete_signal(settings, owner, identifier):
    with connect(settings) as c:
        if not c.execute(
            "DELETE FROM pongdang_data.travel_signal WHERE id=%s AND owner_subject=%s "
            "RETURNING id",
            [identifier, owner],
        ).fetchone():
            raise HTTPException(404, "signal_not_found")


def reset_history(settings, owner, *, reset_profile=False):
    with connect(settings) as c:
        c.execute(
            "SELECT pg_advisory_xact_lock(hashtext(%s))", ["travel-profile:" + owner]
        )
        c.execute(
            "DELETE FROM pongdang_data.travel_signal WHERE owner_subject=%s", [owner]
        )
        if reset_profile:
            # Preserve monotonic revision so old forms cannot overwrite a reset.
            c.execute(
                "UPDATE pongdang_data.travel_preference SET revision=revision+1,"
                "payload=%s,updated_at=now() WHERE owner_subject=%s",
                [Jsonb(TravelPreference().model_dump(mode="json")), owner],
            )


def get_plan(settings, owner, identifier):
    with connect(settings) as c:
        c.execute("SET TRANSACTION READ ONLY")
        row = c.execute(
            "SELECT payload FROM pongdang_data.travel_plan WHERE "
            "id=%s AND owner_subject=%s",
            [identifier, owner],
        ).fetchone()
    if not row:
        raise HTTPException(404, "plan_not_found")
    return TripPlan.model_validate(row[0])


def plans(settings, owner, *, limit=100, offset=0):
    with connect(settings) as c:
        c.execute("SET TRANSACTION READ ONLY")
        rows = c.execute(
            "SELECT payload FROM pongdang_data.travel_plan WHERE owner_subject=%s "
            "ORDER BY updated_at DESC,id LIMIT %s OFFSET %s",
            [owner, limit, offset],
        ).fetchall()
    return [TripPlan.model_validate(row[0]) for row in rows]


def save_plan(settings, owner, plan, *, identifier=None, expected=None):
    identifier = identifier or uuid4().hex
    with connect(settings) as c:
        if expected is not None:
            row = c.execute(
                "SELECT revision FROM pongdang_data.travel_plan "
                "WHERE id=%s AND owner_subject=%s FOR UPDATE",
                [identifier, owner],
            ).fetchone()
            if not row:
                raise HTTPException(404, "plan_not_found")
            if row[0] != expected:
                raise HTTPException(409, "plan_revision_conflict")
        plan = plan.model_copy(
            update={"plan_id": identifier, "revision": (expected or 0) + 1}
        )
        if expected is None:
            c.execute(
                "INSERT INTO "
                "pongdang_data.travel_plan(id,owner_subject,revision,pay"
                "load)"
                " VALUES(%s,%s,%s,%s)",
                [identifier, owner, plan.revision, Jsonb(plan.model_dump(mode="json"))],
            )
        else:
            c.execute(
                "UPDATE pongdang_data.travel_plan SET "
                "revision=%s,payload=%s,updated_at=now()"
                " WHERE id=%s AND owner_subject=%s",
                [plan.revision, Jsonb(plan.model_dump(mode="json")), identifier, owner],
            )
    return plan


def delete_plan(settings, owner, identifier):
    with connect(settings) as c:
        if not c.execute(
            "DELETE FROM pongdang_data.travel_plan WHERE id=%s AND owner_subject=%s "
            "RETURNING id",
            [identifier, owner],
        ).fetchone():
            raise HTTPException(404, "plan_not_found")
