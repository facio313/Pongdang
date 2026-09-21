"""Immutable forecast revisions, captured only by the worker, never by GET."""

from datetime import UTC, datetime, timedelta

from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

from app.ingestion.errors import SourceScopeTooLargeError
from app.ingestion.weather import grid_coordinates
from app.schema import connect
from app.water_index.adapters import input_from_records
from app.water_index.sources import stable_id

from .models import ForecastRecord


def read_normalized(connection, now, *, forecast_only=False, current_only=False):
    """Bound effective source targets, not repeated issue cycles or expired data."""
    with connection.cursor(row_factory=dict_row) as cursor:
        rows = cursor.execute(
            "WITH forecast_names AS (SELECT snapshot_id,"
            "array_agg(name ORDER BY name) AS names FROM "
            "pongdang_data.conditions_observationmetric WHERE mode='forecast' "
            "GROUP BY snapshot_id), applicable AS (SELECT s.id,s.provider,"
            "s.station_id,s.observed_at,s.fetched_at,s.ingestion_version,"
            # Match forecast_from_normalized's identity before applying the
            # bound. Separate KMA issue cycles are revisions of one target.
            # Missing values still participate and can replace earlier values.
            "CASE WHEN fm.snapshot_id IS NULL THEN jsonb_build_array(s.id) "
            "WHEN left(s.provider,4)='kma_' THEN jsonb_build_array(s.provider,"
            "s.station_id,s.observed_at,s.valid_until,fm.names) "
            "ELSE jsonb_build_array(s.provider,s.station_id,s.source_record_id) "
            "END AS selection_key "
            "FROM pongdang_data.conditions_observationsnapshot s "
            "LEFT JOIN forecast_names fm ON fm.snapshot_id=s.id "
            "WHERE s.state<>'superseded' AND s.fetched_at<=%s "
            "AND (s.issued_at IS NULL OR s.issued_at<=%s) "
            "AND s.valid_until>%s AND s.observed_at<%s "
            # Expired v2 tide slots establish which legacy identities remain
            # suppressed for that day; do not filter this lineage away.
            "AND ((s.provider='khoa_tide_extrema' "
            "AND s.ingestion_version='tide-event-slots.2') OR "
            "((NOT %s OR s.valid_until>%s) "
            "AND (NOT %s OR fm.snapshot_id IS NOT NULL)))), "
            "latest AS (SELECT DISTINCT ON (selection_key) * FROM applicable "
            "ORDER BY selection_key,fetched_at DESC,id DESC), "
            "effective AS (SELECT s.id FROM latest s "
            "WHERE s.provider<>'khoa_tide_extrema' "
            "OR s.ingestion_version='tide-event-slots.2' OR NOT EXISTS ("
            "SELECT 1 FROM latest n WHERE n.provider=s.provider "
            "AND n.station_id=s.station_id "
            "AND n.ingestion_version='tide-event-slots.2' "
            "AND (n.observed_at AT TIME ZONE 'Asia/Seoul')::date="
            "(s.observed_at AT TIME ZONE 'Asia/Seoul')::date)) "
            "SELECT to_jsonb(s) AS snapshot,to_jsonb(st) AS station,"
            "jsonb_agg(to_jsonb(m) ORDER BY m.id) AS metrics "
            "FROM effective e JOIN "
            "pongdang_data.conditions_observationsnapshot s ON s.id=e.id "
            "JOIN pongdang_data.collection_station st ON st.id=s.station_id "
            "JOIN pongdang_data.conditions_observationmetric m ON m.snapshot_id=s.id "
            "GROUP BY s.id,st.id ORDER BY s.id LIMIT 5001",
            [
                now,
                now,
                now - timedelta(days=31),
                now + timedelta(days=31),
                current_only,
                now,
                forecast_only,
            ],
        ).fetchall()
    if len(rows) > 5000:
        raise SourceScopeTooLargeError
    return rows


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
        # Already published history remains immutable. A normal worker pass
        # updates currently applicable targets; expired observations/forecasts
        # must not exhaust its capacity as raw collection history accumulates.
        for source in read_normalized(c, now, forecast_only=True, current_only=True):
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

    place = await (
        await connection.execute(
            "SELECT id,lat,lng,catalog_verified_at "
            "FROM pongdang_data.spots_waterspot WHERE id=%s",
            [spot_id],
        )
    ).fetchone()
    if not place:
        raise HTTPException(404, "등록된 장소가 없습니다.")
    grid_id = None
    if (
        place["lat"] is not None
        and place["lng"] is not None
        and place["catalog_verified_at"] is not None
        and place["catalog_verified_at"] <= as_of
    ):
        nx, ny = grid_coordinates(place["lat"], place["lng"])
        grid_id = f"kma-grid-{nx}-{ny}"
    # Resolve reviewed mappings once. A correlated lookup of the base mapping
    # table for every forecast revision inflated planner cost enough to trigger
    # expensive JIT compilation, timing out even when no mapping existed.
    query = (
        "WITH mappings AS MATERIALIZED (SELECT m.* FROM "
        "pongdang_data.water_index_station_mapping m WHERE m.spot_id=%(spot)s "
        "AND m.available_at<=%(as_of)s AND m.payload->'activities' ? %(activity)s "
        "AND NOT EXISTS (SELECT 1 FROM pongdang_data.water_index_station_mapping n "
        "WHERE n.supersedes_id=m.mapping_id AND n.available_at<=%(as_of)s)), "
        "latest AS (SELECT DISTINCT ON (f.source_key) f.* "
        "FROM pongdang_data.forecast_revision f WHERE f.available_at<=%(as_of)s "
        "AND (f.spot_id=%(spot)s OR EXISTS (SELECT 1 FROM "
        "mappings m WHERE m.station_id=f.station_id "
        "AND m.valid_from<=f.target_start_at AND m.valid_until>=f.target_end_at) "
        "OR (f.provider IN ('kma_short_forecast','kma_ultra_forecast') "
        "AND EXISTS (SELECT 1 FROM pongdang_data.collection_station st "
        "WHERE st.id=f.station_id AND st.kind='weather_forecast_grid' "
        "AND st.source_id=%(grid_id)s AND st.fetched_at<=%(as_of)s))) "
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
        "grid_id": grid_id,
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
            "(SELECT m.mapping_id FROM mappings m "
            "WHERE m.station_id=latest.station_id "
            "AND m.valid_from<=latest.target_start_at "
            "AND m.valid_until>=latest.target_end_at "
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
        grid_context = record.spot_id != spot_id and not saved["mapping_evidence_ref"]
        if grid_context:
            reasons.append("containing_forecast_grid")
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
                else "containing_forecast_grid"
                if grid_context
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
