import argparse
from datetime import UTC, datetime
from pathlib import Path

from psycopg.types.json import Jsonb

from app.config import Settings
from app.schema import connect
from app.tides.service import OperatingWindow, window_state
from app.water_index.sources import stable_id


def migrate_tides(c):
    c.execute(
        "CREATE TABLE IF NOT EXISTS pongdang_data.tide_operating_window ("
        "window_id text PRIMARY KEY, source_key text NOT NULL, spot_id bigint NOT NULL "
        "REFERENCES pongdang_data.spots_waterspot(id), activity text NOT NULL, "
        "start_at timestamptz NOT NULL,end_at timestamptz NOT NULL, "
        "available_at timestamptz NOT NULL DEFAULT clock_timestamp(), payload "
        "jsonb NOT NULL, "
        "digest text NOT NULL, CHECK(end_at>start_at))"
    )
    c.execute(
        "CREATE INDEX IF NOT EXISTS tide_window_lookup_idx ON "
        "pongdang_data.tide_operating_window "
        "(spot_id,activity,source_key,available_at DESC)"
    )
    c.execute(
        "CREATE OR REPLACE TRIGGER tide_operating_window_immutable BEFORE UPDATE "
        "OR DELETE "
        "ON pongdang_data.tide_operating_window FOR EACH ROW EXECUTE FUNCTION "
        "pongdang_data.water_index_immutable()"
    )


def register_window(settings, window: OperatingWindow):
    window = OperatingWindow.model_validate(window.model_dump())
    if window.fetched_at > datetime.now(UTC):
        raise ValueError("Operating evidence cannot be fetched in the future")
    payload = window.model_dump(mode="json")
    digest = stable_id("", payload)
    with connect(settings) as c:
        c.execute("SELECT pg_advisory_xact_lock(hashtext('pongdang-tide-windows'))")
        old = c.execute(
            "SELECT digest FROM pongdang_data.tide_operating_window WHERE window_id=%s",
            [window.window_id],
        ).fetchone()
        if old:
            if old[0] != digest:
                raise ValueError("Immutable operating window conflict")
            return 0
        if window.station_id:
            mapping = c.execute(
                "SELECT 1 FROM pongdang_data.collection_station s WHERE id=%s AND "
                "(spot_id=%s OR EXISTS (SELECT 1 FROM "
                "pongdang_data.water_index_station_mapping m "
                "WHERE m.station_id=s.id AND m.spot_id=%s AND m.valid_from<=%s AND "
                "m.valid_until>=%s "
                "AND m.payload->'activities' ? %s AND NOT EXISTS (SELECT 1 FROM "
                "pongdang_data.water_index_station_mapping n WHERE "
                "n.supersedes_id=m.mapping_id)))",
                [
                    window.station_id,
                    window.spot_id,
                    window.spot_id,
                    window.start_at,
                    window.end_at,
                    window.activity,
                ],
            ).fetchone()
            if not mapping:
                raise ValueError(
                    "Operating window station lacks reviewed place applicability"
                )
        c.execute(
            "INSERT INTO pongdang_data.tide_operating_window "
            "(window_id,source_key,spot_id,activity,start_at,end_at,payload,digest) "
            "VALUES(%s,%s,%s,%s,%s,%s,%s,%s)",
            [
                window.window_id,
                window.source_key,
                window.spot_id,
                window.activity,
                window.start_at,
                window.end_at,
                Jsonb(payload),
                digest,
            ],
        )
    return 1


async def read_windows(
    c, *, spot_id, activity, from_at, until_at, as_of, page=1, page_size=100
):
    from fastapi import HTTPException

    if not await (
        await c.execute(
            "SELECT id FROM pongdang_data.spots_waterspot WHERE id=%s", [spot_id]
        )
    ).fetchone():
        raise HTTPException(404, "등록된 장소가 없습니다.")
    base = (
        "WITH latest AS (SELECT DISTINCT ON (source_key) * FROM "
        "pongdang_data.tide_operating_window "
        "WHERE spot_id=%s AND activity=%s AND available_at<=%s "
        "ORDER BY source_key,available_at DESC,window_id DESC) "
    )
    params = [spot_id, activity, as_of, until_at, from_at]
    count = await (
        await c.execute(
            base
            + "SELECT count(*) AS total FROM latest WHERE start_at<%s AND end_at>%s",
            params,
        )
    ).fetchone()
    rows = await (
        await c.execute(
            base + "SELECT payload FROM latest WHERE start_at<%s AND end_at>%s "
            "ORDER BY start_at,window_id LIMIT %s OFFSET %s",
            [*params, page_size, (page - 1) * page_size],
        )
    ).fetchall()
    results = []
    for row in rows:
        window = OperatingWindow.model_validate(row["payload"])
        state, reasons = window_state(window, as_of)
        # Internal reviewer identity is not relevant to a public activity timer.
        results.append(
            {
                **window.model_dump(mode="json", exclude={"reviewed_by"}),
                "state": state,
                "reason_codes": reasons,
            }
        )
    return {
        "rows": results,
        "total": count["total"],
        "status": "available" if count["total"] else "no_official_operating_window",
    }


def main():
    parser = argparse.ArgumentParser(
        description="Register one reviewed official operating window"
    )
    parser.add_argument("file", type=Path)
    args = parser.parse_args()
    print(
        register_window(
            Settings(), OperatingWindow.model_validate_json(args.file.read_text())
        )
    )


if __name__ == "__main__":
    main()
