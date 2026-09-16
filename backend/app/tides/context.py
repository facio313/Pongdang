"""Nearby official tide station context, never a beach operating window."""

from app.livecams.places import PLACE_SELECT


async def nearby_tide_station(c, spot_id, as_of):
    return await (
        await c.execute(
            f"WITH places AS ({PLACE_SELECT}), candidates AS ("
            "SELECT st.spot_id,st.id,st.name,6371*2*asin(sqrt(least(1.0,greatest(0.0,"
            "power(sin(radians(st.latitude-p.lat)/2),2)+cos(radians(p.lat))*"
            "cos(radians(st.latitude))*power(sin(radians(st.longitude-p.lng)/2),2))))) "
            "AS distance_km FROM pongdang_data.collection_station st "
            "JOIN places p ON p.id=%s AND p.place_kind='beach' "
            "JOIN pongdang_data.spots_waterspot original ON original.id=p.id "
            "WHERE st.provider='khoa_tide_extrema' AND st.fetched_at<=%s "
            "AND original.catalog_verified_at<=%s "
            "AND st.latitude IS NOT NULL AND st.longitude IS NOT NULL "
            "AND p.lat IS NOT NULL AND p.lng IS NOT NULL "
            "AND EXISTS (SELECT 1 FROM pongdang_data.forecast_revision f "
            "WHERE f.station_id=st.id AND f.provider='khoa_tide_extrema' "
            "AND f.available_at<=%s)) "
            "SELECT * FROM candidates WHERE distance_km<=50 "
            "ORDER BY distance_km,id LIMIT 1",
            [spot_id, as_of, as_of, as_of],
        )
    ).fetchone()


def mark_context(result, station, requested_spot):
    for row in result["rows"]:
        row.update(
            requested_spot_id=requested_spot,
            spatial_relation="nearby_station_context",
            distance_km=station["distance_km"],
        )
        row["reason_codes"].append("nearby_tide_station_not_beach_prediction")
    return result
