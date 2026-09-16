"""Bounded read of the latest collected marine laboratory result, including history."""

from fastapi import HTTPException

from app.livecams.places import PLACE_SELECT
from app.quality.grading import GRADE_LABELS, QualityGradeEnvelope, resolve_grade


async def read_grade(c, spot_id, now):
    place = await (
        await c.execute(
            f"WITH places AS ({PLACE_SELECT}) SELECT * FROM places WHERE id=%s",
            [spot_id],
        )
    ).fetchone()
    if place is None:
        raise HTTPException(404, "place_not_found")
    # Select the nearest collected station before looking at its grade or age.
    # A nearby station is context, never an implicit representative mapping.
    station = await (
        await c.execute(
            "WITH candidates AS (SELECT st.*,CASE WHEN latitude IS NULL OR "
            "longitude IS NULL OR %s::float IS NULL OR %s::float IS NULL THEN NULL "
            "ELSE 6371*2*asin(sqrt(least(1.0,greatest(0.0,"
            "power(sin(radians(latitude-%s)/2),2)+cos(radians(%s))*"
            "cos(radians(latitude))*power(sin(radians(longitude-%s)/2),2))))) "
            "END AS distance_km FROM pongdang_data.collection_station st "
            "WHERE provider='koem_water_quality' AND kind='marine_water_quality' "
            "AND fetched_at<=%s AND EXISTS (SELECT 1 FROM "
            "pongdang_data.conditions_observationsnapshot s WHERE s.station_id=st.id "
            "AND s.provider='koem_water_quality' AND s.fetched_at<=%s "
            "AND s.observed_at<=%s AND (s.issued_at IS NULL OR s.issued_at<=%s))) "
            "SELECT * FROM candidates WHERE spot_id=%s OR (%s AND distance_km<=10) "
            "ORDER BY (spot_id=%s) DESC,distance_km NULLS LAST,id LIMIT 1",
            [
                place["lat"],
                place["lng"],
                place["lat"],
                place["lat"],
                place["lng"],
                now,
                now,
                now,
                now,
                spot_id,
                place["place_kind"] == "beach",
                spot_id,
            ],
        )
    ).fetchone()
    base = {"spot_id": spot_id, "queried_at": now}
    if station is None:
        unsupported = place["place_kind"] != "beach"
        return QualityGradeEnvelope(
            **base,
            status="unsupported" if unsupported else "no_data",
            reason_codes=(
                "marine_wqi_not_applicable"
                if unsupported
                else "no_collected_marine_sample_within_10km",
            ),
        )
    # Choose the newest provider revision first, including missing/corrected data.
    # No old valid grade is substituted for a newer missing/conflicting result.
    snapshots = await (
        await c.execute(
            "WITH revisions AS (SELECT DISTINCT ON "
            "(COALESCE(source_record_id,provider_record_id)) * FROM "
            "pongdang_data.conditions_observationsnapshot WHERE station_id=%s "
            "AND provider='koem_water_quality' AND fetched_at<=%s AND observed_at<=%s "
            "AND (issued_at IS NULL OR issued_at<=%s) "
            "ORDER BY COALESCE(source_record_id,provider_record_id),"
            "fetched_at DESC,id DESC) "
            "SELECT id,provider_record_id,source_record_id,observed_at,fetched_at,"
            "issued_at,valid_until,spatial_scope,state FROM revisions "
            "WHERE observed_at=(SELECT max(observed_at) FROM revisions) "
            "ORDER BY id LIMIT 101",
            [station["id"], now, now, now],
        )
    ).fetchall()
    if len(snapshots) > 100:
        raise HTTPException(422, "quality_source_scope_too_large")
    metrics = await (
        await c.execute(
            "SELECT snapshot_id,name,numeric_value,text_value,unit,is_missing "
            "FROM pongdang_data.conditions_observationmetric "
            "WHERE snapshot_id=ANY(%s) AND mode='observation' ORDER BY id LIMIT 101",
            [[row["id"] for row in snapshots]],
        )
    ).fetchall()
    if len(metrics) > 100:
        raise HTTPException(422, "quality_source_scope_too_large")
    grade, index, basis, reasons = resolve_grade(metrics)
    if any(row["state"] == "superseded" for row in snapshots):
        grade, index, basis = None, None, "none"
        reasons.append("revision_history_ambiguous")
    observed = max(row["observed_at"] for row in snapshots)
    historical = any(
        row["valid_until"] is None or row["valid_until"] <= now for row in snapshots
    )
    if historical:
        reasons.append("historical_sample_not_current_water_quality")
    direct = station["spot_id"] == spot_id
    if not direct:
        reasons.append("nearby_station_not_beach_sample")
    layers = {
        m["snapshot_id"]: m["text_value"] for m in metrics if m["name"] == "water_layer"
    }
    measurements = [
        {
            "item": m["name"],
            "value": m["numeric_value"],
            "unit": m["unit"] or None,
            "layer": layers.get(m["snapshot_id"]),
            "is_missing": m["is_missing"],
        }
        for m in metrics
        if (m["numeric_value"] is not None or m["is_missing"])
        and m["name"] not in {"official_wqi_grade", "official_wqi_index"}
    ]
    return QualityGradeEnvelope(
        **base,
        status=(
            "conflict"
            if "conflicting_or_invalid_wqi" in reasons
            or "revision_history_ambiguous" in reasons
            else "no_data"
            if grade is None
            else "historical"
            if historical
            else "available"
        ),
        grade=grade,
        label=GRADE_LABELS.get(grade),
        wqi=index,
        basis=basis,
        provider="koem_water_quality",
        station_id=station["id"],
        station_name=station["name"],
        source_spot_id=station["spot_id"],
        relation="station_observation_point" if direct else "nearby_station_context",
        distance_km=None if direct else station["distance_km"],
        observed_at=observed,
        age_days=(now - observed).days,
        reason_codes=tuple(reasons),
        measurements=tuple(measurements),
        sources=tuple(
            {
                "snapshot_id": s["id"],
                **{k: v for k, v in s.items() if k not in {"id", "state"}},
            }
            for s in snapshots
        ),
    )
