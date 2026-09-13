"""Worker producer: collection evidence -> normalized comparison -> immutable view."""

from datetime import UTC, datetime, timedelta

from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

from app.quality.engine import compare, digest
from app.quality.models import (
    ComparisonResult,
    Measurement,
    OfficialSample,
    StoredObservation,
)

PROVIDERS = ("koem_water_quality", "nier_water_quality")


def _official(row, spot_id=None, mapping=None):
    metrics = {m["name"]: m for m in row["metrics"]}
    day_precision = metrics.get("observation_precision", {}).get("text_value") == "day"
    end = row["observed_at"] + timedelta(days=1) if day_precision else None
    generic_method = metrics.get("measurement_method", {}).get("text_value")
    measurements = []
    for m in row["metrics"]:
        if m["numeric_value"] is None and not m.get("is_missing"):
            continue
        measurements.append(
            Measurement(
                item=m["name"],
                value=m["numeric_value"],
                unit=m["unit"] or None,
                method=metrics.get(m["name"] + "_method", {}).get("text_value")
                or generic_method,
                sampled_at=row["observed_at"],
                sampled_until=end,
                sample_precision="day" if day_precision else "unknown",
                scope=row["spatial_scope"] or None,
            )
        )
    grade = metrics.get("official_wqi_grade", {})
    grade_value = grade.get("text_value")
    if grade_value is None and grade.get("numeric_value") is not None:
        grade_value = str(grade["numeric_value"])
    return OfficialSample(
        evidence_id=f"collection-snapshot:{row['id']}",
        spot_id=spot_id or row["spot_id"],
        station_id=row["station_id"],
        provider=row["provider"],
        provider_record_id=row["provider_record_id"],
        source_record_id=row["source_record_id"],
        observed_at=row["observed_at"],
        sampled_until=end,
        fetched_at=row["fetched_at"],
        issued_at=row["issued_at"],
        valid_until=row["valid_until"],
        spatial_scope=row["spatial_scope"],
        revision_state=row["state"],
        measurements=tuple(measurements),
        official_grade=grade_value,
        source_spot_id=row["spot_id"],
        place_relation="representative_station"
        if mapping
        else "station_observation_point",
        mapping_ref=mapping["mapping_id"] if mapping else None,
        mapping_version=mapping["mapping_version"] if mapping else None,
        mapping_scope=mapping["spatial_scope"] if mapping else None,
        mapping_source_url=mapping["source_url"] if mapping else None,
    )


def evaluate_place(connection, spot_id: int, now: datetime) -> bool:
    """One bounded place projection; published sources retain exact station scope."""
    start = now - timedelta(days=31)
    with connection.cursor(row_factory=dict_row) as c:
        c.execute(
            "SELECT payload FROM pongdang_data.water_index_station_mapping m "
            "WHERE m.spot_id=%s AND m.available_at<=%s "
            "AND m.valid_from<%s AND m.valid_until>%s "
            "AND NOT EXISTS (SELECT 1 FROM "
            "pongdang_data.water_index_station_mapping next "
            "WHERE next.supersedes_id=m.mapping_id AND next.available_at<=%s) "
            "ORDER BY m.available_at DESC LIMIT 101",
            [spot_id, now, now, start, now],
        )
        mapping_rows = c.fetchall()
        mappings = [row["payload"] for row in mapping_rows[:100]]
        station_ids = sorted({mapping["station_id"] for mapping in mappings})
        c.execute(
            "SELECT s.*, (SELECT jsonb_agg(jsonb_build_object('name',m.name,"
            "'numeric_value',m.numeric_value,'text_value',m.text_value,'unit',m.unit,"
            "'is_missing',m.is_missing)) "
            "FROM pongdang_data.conditions_observationmetric m "
            "WHERE m.snapshot_id=s.id) AS metrics "
            "FROM pongdang_data.conditions_observationsnapshot s "
            "WHERE (s.spot_id=%s OR s.station_id=ANY(%s)) "
            "AND s.provider=ANY(%s) AND s.observed_at>=%s "
            "AND s.observed_at<=%s AND s.fetched_at<=%s "
            "AND (s.issued_at IS NULL OR s.issued_at<=%s) AND s.state<>'superseded' "
            "ORDER BY s.observed_at DESC,s.id DESC LIMIT 101",
            [spot_id, station_ids, list(PROVIDERS), start, now, now, now],
        )
        source_rows = c.fetchall()
        official, ambiguous_mapping = [], False
        for row in source_rows[:100]:
            if not row["metrics"]:
                continue
            direct = _official(row)
            if row["spot_id"] == spot_id:
                official.append(direct)
                continue
            matches = [
                m
                for m in mappings
                if m["station_id"] == row["station_id"]
                and datetime.fromisoformat(m["valid_from"]) <= row["observed_at"]
                and datetime.fromisoformat(m["valid_until"])
                >= (direct.sampled_until or row["observed_at"])
            ]
            if len(matches) == 1:
                official.append(_official(row, spot_id, matches[0]))
            elif len(matches) > 1:
                ambiguous_mapping = True
        # Select latest revisions BEFORE period filtering: a correction/retraction
        # must remove the prior observation even if its new date leaves this window.
        c.execute(
            "SELECT payload FROM (SELECT DISTINCT ON (owner_key,review_id) "
            "payload,observed_at,received_at FROM pongdang_data.quality_observation "
            "WHERE spot_id=%s AND received_at<=%s "
            "ORDER BY owner_key,review_id,revision DESC) latest "
            "WHERE observed_at>=%s AND observed_at<=%s "
            "ORDER BY received_at DESC LIMIT 101",
            [spot_id, now, start, now],
        )
        source_reviews = c.fetchall()
    reviews = [
        StoredObservation.model_validate(r["payload"]) for r in source_reviews[:100]
    ]
    result = compare(
        spot_id,
        official,
        reviews,
        now,
        input_truncated=(
            len(source_rows) > 100
            or len(source_reviews) > 100
            or len(mapping_rows) > 100
        ),
    )
    if ambiguous_mapping:
        result["reason_codes"].append("conflicting_station_mappings")
    if not official:
        result["reason_codes"].append("no_official_sample_with_valid_place_mapping")
    if result["latest_review_at"]:
        result["latest_review_at"] = result["latest_review_at"].isoformat()
    result = ComparisonResult.model_validate(result).model_dump(mode="json")
    # Fixed 15-minute computation slots make retries idempotent, including a
    # restart after the comparison commits but before the job status commits.
    slot = now.replace(minute=now.minute // 15 * 15, second=0, microsecond=0)
    identity = digest(
        {
            "spot_id": spot_id,
            "slot": slot.isoformat(),
            "official": [s.model_dump(mode="json") for s in official],
            "reviews": [r.evidence_id for r in reviews],
            "comparison_version": result["comparison_version"],
        }
    )
    inserted = connection.execute(
        "INSERT INTO pongdang_data.quality_analysis "
        "(analysis_id,spot_id,from_at,until_at,as_of,payload,digest) "
        "VALUES (%s,%s,%s,%s,%s,%s,%s) ON CONFLICT(analysis_id) DO NOTHING RETURNING 1",
        [identity, spot_id, start, now, now, Jsonb(result), digest(result)],
    ).fetchone()
    return bool(inserted)


def run_quality_job(settings, now=None):
    """Restart-safe keyset traversal; at most 100 places/101 sources each per run."""
    from app.schema import connect

    now = now or datetime.now(UTC)
    with connect(settings) as c:
        if not c.execute(
            "SELECT pg_try_advisory_xact_lock(hashtext('pongdang-quality-producer'))"
        ).fetchone()[0]:
            return {"processed": 0, "inserted": 0, "status": "locked"}
        c.execute(
            "INSERT INTO pongdang_data.quality_job_cursor(id,last_spot_id) VALUES(1,0) "
            "ON CONFLICT(id) DO NOTHING"
        )
        last = c.execute(
            "SELECT last_spot_id FROM pongdang_data.quality_job_cursor "
            "WHERE id=1 FOR UPDATE"
        ).fetchone()[0]
        spots = c.execute(
            "SELECT id FROM pongdang_data.spots_waterspot "
            "WHERE id>%s ORDER BY id LIMIT 100",
            [last],
        ).fetchall()
        if not spots and last:
            spots = c.execute(
                "SELECT id FROM pongdang_data.spots_waterspot ORDER BY id LIMIT 100"
            ).fetchall()
        inserted = sum(evaluate_place(c, row[0], now) for row in spots)
        c.execute(
            "UPDATE pongdang_data.quality_job_cursor SET last_spot_id=%s WHERE id=1",
            [spots[-1][0] if len(spots) == 100 else 0],
        )
    return {
        "processed": len(spots),
        "inserted": inserted,
        "status": "available" if spots else "no_data",
    }
