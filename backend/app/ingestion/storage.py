"""Atomic storage of real provider records, with immutable observation revisions."""

import hashlib
from datetime import UTC, datetime

from app.config import Settings
from app.ingestion.models import SourceBatch
from app.schema import connect


def digest(record):
    return hashlib.sha256(record.model_dump_json().encode()).hexdigest()


def store_batch(settings: Settings, batch: SourceBatch) -> int:
    batch = SourceBatch.model_validate(batch.model_dump())
    inserted = 0
    with connect(settings) as c:
        c.execute("SELECT pg_advisory_xact_lock(hashtext('pongdang-ingestion'))")
        stations = {}

        def station_id(station):
            nonlocal inserted
            if station.source_id in stations:
                return stations[station.source_id]
            previous = c.execute(
                "SELECT id,spot_id FROM pongdang_data.collection_station "
                "WHERE provider=%s AND source_id=%s",
                [batch.provider, station.source_id],
            ).fetchone()
            if previous:
                sid, spot = previous
                c.execute(
                    "UPDATE pongdang_data.spots_waterspot SET "
                    "name=%s,region=%s,type=%s,"
                    "lat=COALESCE(%s,lat),lng=COALESCE(%s,lng),catalog_verified_at=%s "
                    "WHERE id=%s",
                    [
                        station.name,
                        station.region,
                        station.kind,
                        station.latitude,
                        station.longitude,
                        batch.fetched_at,
                        spot,
                    ],
                )
                c.execute(
                    "UPDATE pongdang_data.collection_station SET name=%s,kind=%s,"
                    "latitude=COALESCE(%s,latitude),longitude=COALESCE(%s,longitude),"
                    "region=%s,datum=%s,fetched_at=%s,source_valid_from=%s,"
                    "source_valid_until=%s WHERE id=%s",
                    [
                        station.name,
                        station.kind,
                        station.latitude,
                        station.longitude,
                        station.region,
                        station.datum,
                        batch.fetched_at,
                        station.source_valid_from,
                        station.source_valid_until,
                        sid,
                    ],
                )
            else:
                spot = c.execute(
                    "INSERT INTO pongdang_data.spots_waterspot "
                    "(name,region,type,catalog_source,catalog_verification,lat,lng,"
                    "catalog_verified_at) VALUES "
                    "(%s,%s,%s,%s,'source_record',%s,%s,%s) "
                    "RETURNING id",
                    [
                        station.name,
                        station.region,
                        station.kind,
                        batch.provider,
                        station.latitude,
                        station.longitude,
                        batch.fetched_at,
                    ],
                ).fetchone()[0]
                sid = c.execute(
                    "INSERT INTO pongdang_data.collection_station "
                    "(provider,source_id,name,kind,latitude,longitude,region,datum,"
                    "spot_id,fetched_at,source_valid_from,source_valid_until) VALUES "
                    "(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) "
                    "RETURNING id",
                    [
                        batch.provider,
                        station.source_id,
                        station.name,
                        station.kind,
                        station.latitude,
                        station.longitude,
                        station.region,
                        station.datum,
                        spot,
                        batch.fetched_at,
                        station.source_valid_from,
                        station.source_valid_until,
                    ],
                ).fetchone()[0]
                inserted += 1
            stations[station.source_id] = sid, spot
            return sid, spot

        for station in batch.stations:
            station_id(station)
        for reading in batch.readings:
            sid, spot = station_id(reading.station)
            record_digest = digest(reading)
            state = "stale" if reading.valid_until <= datetime.now(UTC) else "recorded"
            snapshot = c.execute(
                "INSERT INTO pongdang_data.conditions_observationsnapshot "
                "(spot_id,provider,state,observed_at,fetched_at,valid_until,valid_from,"
                "spatial_scope,provider_record_id,ingestion_version,source_record_id,"
                "station_id,issued_at) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) "
                "ON CONFLICT (provider,provider_record_id,spot_id) DO NOTHING "
                "RETURNING id",
                [
                    spot,
                    batch.provider,
                    state,
                    reading.observed_at,
                    batch.fetched_at,
                    reading.valid_until,
                    reading.observed_at,
                    reading.spatial_scope,
                    record_digest,
                    batch.adapter_version,
                    reading.source_id,
                    sid,
                    reading.issued_at,
                ],
            ).fetchone()
            new_snapshot = bool(snapshot)
            if not snapshot:
                existing = c.execute(
                    "SELECT id,state FROM pongdang_data.conditions_observationsnapshot "
                    "WHERE provider=%s AND provider_record_id=%s AND spot_id=%s",
                    [batch.provider, record_digest, spot],
                ).fetchone()
                if existing[1] != "superseded":
                    continue
                snapshot = (existing[0],)
                # A -> B -> A is a real source reversion, not a duplicate of B.
                # Restore the old evidence without extending its expiry/fetch time.
                c.execute(
                    "UPDATE pongdang_data.conditions_observationsnapshot "
                    "SET state=%s WHERE id=%s",
                    [state, snapshot[0]],
                )
                c.execute(
                    "UPDATE pongdang_data.conditions_observationmetric "
                    "SET state=CASE WHEN is_missing THEN 'missing' ELSE %s END "
                    "WHERE snapshot_id=%s",
                    [state, snapshot[0]],
                )
            else:
                inserted += 1
            previous = c.execute(
                "UPDATE pongdang_data.conditions_observationsnapshot "
                "SET state='superseded' WHERE provider=%s AND source_record_id=%s "
                "AND station_id=%s AND id<>%s AND state<>'superseded' RETURNING id",
                [batch.provider, reading.source_id, sid, snapshot[0]],
            ).fetchall()
            if previous:
                c.execute(
                    "UPDATE pongdang_data.conditions_observationmetric "
                    "SET state='superseded' WHERE snapshot_id=ANY(%s)",
                    [[r[0] for r in previous]],
                )
            if not new_snapshot:
                continue
            for value in reading.values:
                c.execute(
                    "INSERT INTO pongdang_data.conditions_observationmetric "
                    "(snapshot_id,name,numeric_value,text_value,unit,mode,state,source,"
                    "observed_at,fetched_at,valid_until,station_id,spatial_scope,is_m"
                    "issing) "
                    "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
                    [
                        snapshot[0],
                        value.name,
                        value.numeric_value,
                        value.text_value,
                        value.unit,
                        value.mode,
                        "missing"
                        if value.missing
                        or (value.numeric_value is None and value.text_value is None)
                        else state,
                        batch.provider,
                        reading.observed_at,
                        batch.fetched_at,
                        reading.valid_until,
                        reading.station.source_id,
                        reading.spatial_scope,
                        value.missing
                        or (value.numeric_value is None and value.text_value is None),
                    ],
                )
        for place in batch.places:
            old = c.execute(
                "SELECT id,spot_id FROM pongdang_data.collection_place "
                "WHERE provider=%s AND source_id=%s",
                [batch.provider, place.source_id],
            ).fetchone()
            if old:
                pid, spot = old
                c.execute(
                    "UPDATE pongdang_data.spots_waterspot SET "
                    "name=%s,region=%s,type=%s,"
                    "lat=%s,lng=%s,address=%s,catalog_verified_at=%s WHERE id=%s",
                    [
                        place.name,
                        place.region,
                        place.kind,
                        place.latitude,
                        place.longitude,
                        place.address,
                        batch.fetched_at,
                        spot,
                    ],
                )
                c.execute(
                    "UPDATE pongdang_data.collection_place SET "
                    "name=%s,kind=%s,latitude=%s,"
                    "longitude=%s,address=%s,region=%s,category=%s,source_url=%s,"
                    "fetched_at=%s,source_created_at=%s,source_modified_at=%s "
                    "WHERE id=%s",
                    [
                        place.name,
                        place.kind,
                        place.latitude,
                        place.longitude,
                        place.address,
                        place.region,
                        place.category,
                        place.source_url,
                        batch.fetched_at,
                        place.source_created_at,
                        place.source_modified_at,
                        pid,
                    ],
                )
            else:
                spot = c.execute(
                    "INSERT INTO pongdang_data.spots_waterspot "
                    "(name,region,type,catalog_source,catalog_verification,lat,lng,ad"
                    "dress,"
                    "catalog_verified_at) VALUES "
                    "(%s,%s,%s,%s,'source_record',%s,%s,%s,%s) "
                    "RETURNING id",
                    [
                        place.name,
                        place.region,
                        place.kind,
                        batch.provider,
                        place.latitude,
                        place.longitude,
                        place.address,
                        batch.fetched_at,
                    ],
                ).fetchone()[0]
                c.execute(
                    "INSERT INTO pongdang_data.collection_place "
                    "(provider,source_id,name,"
                    "kind,latitude,longitude,address,region,category,source_url,spot_"
                    "id,"
                    "fetched_at,source_created_at,source_modified_at) VALUES "
                    "(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
                    [
                        batch.provider,
                        place.source_id,
                        place.name,
                        place.kind,
                        place.latitude,
                        place.longitude,
                        place.address,
                        place.region,
                        place.category,
                        place.source_url,
                        spot,
                        batch.fetched_at,
                        place.source_created_at,
                        place.source_modified_at,
                    ],
                )
                inserted += 1
        for warning in batch.warnings:
            row = c.execute(
                "INSERT INTO pongdang_data.collection_warning "
                "(provider,source_id,issued_at,"
                "title,region,kind,effective_at,ended_at,status,fetched_at,evidence_d"
                "igest) "
                "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) "
                "ON CONFLICT(provider,source_id,evidence_digest) DO NOTHING "
                "RETURNING id",
                [
                    batch.provider,
                    warning.source_id,
                    warning.issued_at,
                    warning.title,
                    warning.region,
                    warning.kind,
                    warning.effective_at,
                    warning.ended_at,
                    warning.status,
                    batch.fetched_at,
                    digest(warning),
                ],
            ).fetchone()
            inserted += int(row is not None)
    return inserted
