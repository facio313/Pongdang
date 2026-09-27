import { conditionPath } from "./productData";
import { selectPlaceTemperature, selectNearbyTemperature, type TemperaturePage, type NearbyTemperatureConditions } from "./firstSwimTemperature";
import { useExpired } from "./useExpiry";
import { useResource } from "./useResource";

export type { TemperaturePage } from "./firstSwimTemperature";

export function useFirstSwimTemperature(spotId: number) {
  const primary = useResource<TemperaturePage>(
    `water-temperature?spot_id=${spotId}&mode=observation&page_size=1`,
  );
  const place = selectPlaceTemperature(primary.data, spotId);
  const needsNearby = !primary.loading && !primary.error && place.needsNearby;
  const nearby = useResource<NearbyTemperatureConditions>(
    needsNearby ? conditionPath(spotId, "swim", undefined, "observation") : null,
  );
  const selected = needsNearby ? selectNearbyTemperature(nearby.data, spotId) : place;
  const reading = selected.reading;
  const expired = useExpired(reading ? Date.parse(reading.validUntil) : undefined);
  const error = primary.error ?? (needsNearby ? nearby.error : undefined);
  const state = primary.loading || (needsNearby && nearby.loading) ? "loading"
    : error ? "error" : !reading ? "missing"
    : reading.stale || expired ? "stale" : "available";
  return { state, reason: selected.reason, reading, error };
}
