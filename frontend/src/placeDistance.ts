export interface PlaceCoordinates {
  lat: number | null | undefined;
  lng: number | null | undefined;
}

export function hasPlaceCoordinates(point: PlaceCoordinates | null | undefined): point is { lat: number; lng: number } {
  return typeof point?.lat === "number" && Number.isFinite(point.lat) && Math.abs(point.lat) <= 90
    && typeof point.lng === "number" && Number.isFinite(point.lng) && Math.abs(point.lng) <= 180;
}

/** Haversine distance from two confirmed coordinates; no provider request. */
export function placeDistanceKm(from: PlaceCoordinates | null | undefined, to: PlaceCoordinates | null | undefined) {
  if (!hasPlaceCoordinates(from) || !hasPlaceCoordinates(to)) return null;
  const radians = Math.PI / 180;
  const lat = (to.lat - from.lat) * radians;
  const lng = (to.lng - from.lng) * radians;
  const a = Math.sin(lat / 2) ** 2
    + Math.cos(from.lat * radians) * Math.cos(to.lat * radians) * Math.sin(lng / 2) ** 2;
  return 6371.0088 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, a))));
}

export function distanceLabel(kilometers: number | null) {
  if (kilometers === null || !Number.isFinite(kilometers) || kilometers < 0) return "–";
  return kilometers < 1 ? `${Math.round(kilometers * 1000)} m` : `${kilometers.toFixed(1)} km`;
}
