"""Immutable forecast revisions, captured only by the worker, never by GET."""

from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

from app.schema import connect
from app.water_index.adapters import input_from_records
from app.water_index.sources import stable_id

from .models import ForecastRecord


def read_normalized(connection, now):
    """Bound a whole worker pass; fail explicitly instead of dropping lineage."""
    with connection.cursor(row_factory=dict_row) as cursor:
        rows = cursor.execute(
            "SELECT to_jsonb(s) AS snapshot,to_jsonb(st) AS station,"
            "jsonb_agg(to_jsonb(m) ORDER BY m.id) AS metrics "
            "FROM pongdang_data.conditions_observationsnapshot s "
            "JOIN pongdang_data.collection_station st ON st.id=s.station_id "
            "JOIN pongdang_data.conditions_observationmetric m ON m.snapshot_id=s.id "
            "WHERE s.state<>'superseded' AND s.fetched_at<=%s "
            "AND (s.issued_at IS NULL OR s.issued_at<=%s) "
            "AND s.valid_until>%s AND s.observed_at<%s "
            "GROUP BY s.id,st.id ORDER BY s.id LIMIT 5001",
            [now, now, now - timedelta(days=31), now + timedelta(days=31)],
        ).fetchall()
    if len(rows) > 5000:
        raise ValueError(
            "SOURCE_SCOPE_TOO_LARGE: narrow the configured collection scope"
        )

    # A complete new adapter pass establishes unambiguous ordered tide slots.
    # Ignore pre-upgrade timestamp identities for dates now captured by v2;
    # retain the old rows themselves for source audit and historical projections.
    def tide_day(row):
        snapshot = row["snapshot"]
        local = datetime.fromisoformat(snapshot["observed_at"]).astimezone(
            ZoneInfo("Asia/Seoul")
        )
        return snapshot["station_id"], local.date()

    revised_days = {
        tide_day(r)
        for r in rows
        if r["snapshot"]["provider"] == "khoa_tide_extrema"
        and r["snapshot"].get("ingestion_version") == "tide-event-slots.2"
    }
    return [
        r
        for r in rows
        if r["snapshot"]["provider"] != "khoa_tide_extrema"
        or r["snapshot"].get("ingestion_version") == "tide-event-slots.2"
        or tide_day(r) not in revised_days
    ]


def forecast_from_normalized(row):
    snapshot, station = row["snapshot"], row["station"]
    metrics = [m for m in row["metrics"] if m["mode"] == "forecast"]
    if not metrics:
        return None
    natural_key = [snapshot["provider"], station["id"], snapshot["source_record_id"]]
    if snapshot["provider"].startswith("kma_"):
        natural_key = [
            snapshot["provider"],
            station["id"],
            snapshot["observed_at"],
            snapshot["valid_until"],
            sorted(m["name"] for m in metrics),
        ]
    # Current KHOA adapters retain a stable ordered high/low source slot.
    # Older ambiguous timestamp identities remain distinct: never merge two
    # real extrema merely because their provider AM/PM code happens to match.
    inputs = tuple(
        input_from_records(
            snapshot,
            m,
            input_id=f"metric:{m['id']}",
            mapping_version="station-observation-point.v1",
        )
        for m in metrics
    )
    return ForecastRecord(
        source_key=stable_id("forecast-source:", natural_key),
        adapter_version=snapshot.get("ingestion_version") or "1",
        spot_id=snapshot["spot_id"],
        station_id=station["id"],
        station_code=station["source_id"],
        station_name=station["name"],
        latitude=station["latitude"],
        longitude=station["longitude"],
        provider=snapshot["provider"],
        source_record_id=snapshot["source_record_id"],
        provider_record_id=snapshot["provider_record_id"],
        snapshot_id=snapshot["id"],
        issued_at=snapshot["issued_at"],
        fetched_at=snapshot["fetched_at"],
        target_start_at=snapshot["observed_at"],
        target_end_at=snapshot["valid_until"],
        spatial_scope=snapshot["spatial_scope"],
        inputs=inputs,
    )


def project_forecasts(settings, *, now=None):
    now = now or datetime.now(UTC)
    inserted = 0
    with connect(settings) as c:
        c.execute(
            "SELECT pg_advisory_xact_lock(hashtext('pongdang-forecast-projector'))"
        )
        c.execute("SELECT pg_advisory_xact_lock(hashtext('pongdang-ingestion'))")
        selected = {}
        for source in read_normalized(c, now):
            record = forecast_from_normalized(source)
            if record is None:
                continue
            old = selected.get(record.source_key)
            if old is None or (record.fetched_at, record.snapshot_id) > (
                old.fetched_at,
                old.snapshot_id,
            ):
                selected[record.source_key] = record
        for record in selected.values():
            payload = record.model_dump(mode="json")
            digest = stable_id("", payload)
            previous = c.execute(
                "SELECT revision_id,digest FROM pongdang_data.forecast_revision "
                "WHERE source_key=%s ORDER BY revision_id DESC LIMIT 1",
                [record.source_key],
            ).fetchone()
            if previous and previous[1] == digest:
                continue
            c.execute(
                "INSERT INTO pongdang_data.forecast_revision "
                "(source_key,spot_id,station_id,provider,target_start_at,target_end_at,"
                "fetched_at,issued_at,previous_revision_id,payload,digest) "
                "VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
                [
                    record.source_key,
                    record.spot_id,
                    record.station_id,
                    record.provider,
                    record.target_start_at,
                    record.target_end_at,
                    record.fetched_at,
                    record.issued_at,
                    previous[0] if previous else None,
                    Jsonb(payload),
                    digest,
                ],
            )
            inserted += 1
    return inserted


async def select_forecasts(
    connection,
    *,
    spot_id,
    as_of,
    from_at,
    until_at,
    activity="relax",
    page=1,
    page_size=100,
    provider=None,
):
    """Select one immutable revision per source as known at the requested cutoff."""
    from fastapi import HTTPException

    if not await (
        await connection.execute(
            "SELECT id FROM pongdang_data.spots_waterspot WHERE id=%s", [spot_id]
        )
    ).fetchone():
        raise HTTPException(404, "등록된 장소가 없습니다.")
    query = (
        "WITH latest AS (SELECT DISTINCT ON (f.source_key) f.* "
        "FROM pongdang_data.forecast_revision f WHERE f.available_at<=%(as_of)s "
        "AND (f.spot_id=%(spot)s OR EXISTS (SELECT 1 FROM "
        "pongdang_data.water_index_station_mapping m WHERE m.spot_id=%(spot)s "
        "AND m.station_id=f.station_id AND m.available_at<=%(as_of)s "
        "AND m.valid_from<=f.target_start_at AND m.valid_until>=f.target_end_at "
        "AND m.payload->'activities' ? %(activity)s "
        "AND NOT EXISTS (SELECT 1 FROM pongdang_data.water_index_station_mapping n "
        "WHERE n.supersedes_id=m.mapping_id AND n.available_at<=%(as_of)s))) "
        "AND (%(provider)s::text IS NULL OR f.provider=%(provider)s) "
        "AND (f.provider NOT IN ('khoa_beach','khoa_surfing','khoa_mudflat') "
        "OR f.provider=CASE %(activity)s WHEN 'swim' THEN 'khoa_beach' "
        "WHEN 'surf' THEN 'khoa_surfing' WHEN 'mudflat' THEN 'khoa_mudflat' "
        "WHEN 'relax' THEN 'khoa_beach' END) "
        "ORDER BY f.source_key,f.available_at DESC,f.revision_id DESC), "
        "effective AS (SELECT f.* FROM latest f "
        "WHERE f.provider<>'khoa_tide_extrema' "
        "OR f.payload->>'adapter_version'='tide-event-slots.2' "
        "OR NOT EXISTS (SELECT 1 FROM latest n WHERE n.provider=f.provider "
        "AND n.station_id=f.station_id "
        "AND n.payload->>'adapter_version'='tide-event-slots.2' "
        "AND (n.target_start_at AT TIME ZONE 'Asia/Seoul')::date="
        "(f.target_start_at AT TIME ZONE 'Asia/Seoul')::date)) "
    )
    params = {
        "as_of": as_of,
        "spot": spot_id,
        "activity": activity,
        "provider": provider,
        "from": from_at,
        "until": until_at,
        "limit": page_size,
        "offset": (page - 1) * page_size,
    }
    summary = await (
        await connection.execute(
            query + "SELECT min(target_start_at) AS horizon_start_at,"
            "max(target_end_at) AS horizon_end_at,"
            "count(*) FILTER(WHERE target_start_at<%(until)s AND "
            "target_end_at>%(from)s) AS total "
            "FROM effective",
            params,
        )
    ).fetchone()
    selected = await (
        await connection.execute(
            query + "SELECT latest.*,CASE WHEN spot_id=%(spot)s THEN NULL ELSE "
            "(SELECT m.mapping_id FROM pongdang_data.water_index_station_mapping m "
            "WHERE m.spot_id=%(spot)s AND m.station_id=latest.station_id "
            "AND m.available_at<=%(as_of)s AND m.valid_from<=latest.target_start_at "
            "AND m.valid_until>=latest.target_end_at "
            "AND m.payload->'activities' ? %(activity)s AND NOT EXISTS "
            "(SELECT 1 FROM pongdang_data.water_index_station_mapping n "
            "WHERE n.supersedes_id=m.mapping_id AND n.available_at<=%(as_of)s) "
            "ORDER BY m.available_at DESC,m.mapping_id DESC LIMIT 1) "
            "END AS mapping_evidence_ref FROM effective latest "
            "WHERE target_start_at<%(until)s "
            "AND target_end_at>%(from)s "
            "ORDER BY target_start_at,provider,source_key LIMIT %(limit)s OFFSET "
            "%(offset)s",
            params,
        )
    ).fetchall()
    rows = []
    for saved in selected:
        record = ForecastRecord.model_validate(saved["payload"])
        reasons = []
        missing = any(
            i.state == "missing" or i.numeric_value is None and i.text_value is None
            for i in record.inputs
        )
        stale = record.target_end_at <= as_of
        if record.issued_at is None:
            reasons.append("provider_issue_time_unknown")
        if stale:
            reasons.append("forecast_target_expired")
        if missing:
            reasons.append("provider_value_missing")
        payload = record.model_dump(mode="json")
        payload.update(
            {
                "revision_id": saved["revision_id"],
                "previous_revision_id": saved["previous_revision_id"],
                "available_at": saved["available_at"].isoformat(),
                "state": "stale" if stale else "partial" if missing else "available",
                "reason_codes": reasons,
                "requested_spot_id": spot_id,
                "mapping_evidence_ref": saved["mapping_evidence_ref"],
                "spatial_relation": "station_observation_point"
                if record.spot_id == spot_id
                else "representative_station",
            }
        )
        rows.append(payload)
    start, end = summary["horizon_start_at"], summary["horizon_end_at"]
    total = summary["total"]
    status = (
        "no_forecast_data"
        if start is None
        else "outside_forecast_horizon"
        if until_at <= start or from_at >= end
        else "missing_within_horizon"
        if total == 0
        else "available"
    )
    return {
        "rows": rows,
        "total": total,
        "status": status,
        "horizon_start_at": start,
        "horizon_end_at": end,
        "range_semantics": "provider_target_intervals; horizon bounds do not imply "
        "gap-free coverage",
    }
