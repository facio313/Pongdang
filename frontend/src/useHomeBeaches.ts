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
  const selected = useMemo(() => summaries.settled
    ? selectHomeBeaches(places, summaries.byId, seed) : undefined,
  [places, summaries.byId, summaries.settled, seed]);
  // Only the four selected cards need photos; summaries use at most four 25-row reads.
  const photos = usePlacePhotos(selected);
  return {
    rows: photos.rows,
    loading: catalog.loading || !summaries.settled,
    error: catalog.error ?? summaries.error,
  };
}
