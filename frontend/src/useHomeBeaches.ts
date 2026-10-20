import { useMemo, useState } from "react";
import { homeBeachShuffleSeed, selectHomeBeaches } from "./homeBeachPicks";
import { productPlaces } from "./productData";
import { useConditionSummaries } from "./useConditionSummaries";
import { usePlacePhotos } from "./usePlacePhotos";
import { useResource } from "./useResource";
import { waterPlacesPath, type WaterPlacePage } from "./waterPlaceApi";

export function useHomeBeaches() {
  const [seed] = useState(homeBeachShuffleSeed);
  const catalog = useResource<WaterPlacePage>(waterPlacesPath("", { kind: "beach" }));
  const places = useMemo(() => productPlaces(catalog.data?.rows ?? []).rows, [catalog.data]);
  const summaries = useConditionSummaries(places.map(place => place.id));
  // One bounded metadata read lets us prefer real place photos before drawing
  // cards. Only the selected cards download image files.
  const photos = usePlacePhotos(catalog.data ? places : undefined);
  const selected = useMemo(() => summaries.settled && !photos.loading
    ? selectHomeBeaches(photos.rows ?? [], summaries.byId, seed) : undefined,
  [photos.rows, photos.loading, summaries.byId, summaries.settled, seed]);
  return {
    rows: selected,
    loading: catalog.loading || !summaries.settled || photos.loading,
    error: catalog.error ?? summaries.error ?? photos.error,
  };
}
