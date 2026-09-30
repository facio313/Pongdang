import { t } from "./i18n";
import { distanceLabel, placeDistanceKm, type PlaceCoordinates } from "./placeDistance";
import type { ClassifiedWaterPlace } from "./productData";
import { useProductPlaceSelection } from "./productPlaceSelection";
import type { DefaultPlaceSelection } from "./useProductData";
import { useResource } from "./useResource";
import "./placeDetails.css";

export function PlaceDistanceInfo({ place, loading = false }: { place: PlaceCoordinates | undefined; loading?: boolean }) {
  const selection = useProductPlaceSelection();
  // Use the same reference as home/today without fetching its conditions or
  // overriding an explicit selection with a previous route or device location.
  const defaultPlace = useResource<DefaultPlaceSelection>(selection.mode === "default" ? "water-index/default-place" : null);
  const selectedPlace = useResource<ClassifiedWaterPlace[]>(selection.mode === "selected" && selection.spotId !== null
    ? `livecams/preview/places?spot_id=${selection.spotId}` : null);
  const origin = selection.mode === "default" ? defaultPlace.data?.place
    : selectedPlace.data?.find((row) => row.id === selection.spotId);
  const kilometers = placeDistanceKm(origin, place);
  if (loading || !origin || kilometers === null) return null;
  return (
    <div className="place-distance">
      <div className="place-distance-result">
        <span>{t("기준: {name}", { name: origin.name })}</span>
        <span className="place-distance-value"><strong>{distanceLabel(kilometers)}</strong><span>{t("직선거리")}</span></span>
      </div>
    </div>
  );
}
