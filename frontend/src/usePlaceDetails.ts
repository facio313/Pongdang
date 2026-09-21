import { useMemo } from "react";
import { placeDetailsPath, type PlaceDetails } from "./placeDetails";
import { useResource } from "./useResource";

/** This endpoint reads the DB; opening a page never initiates provider calls. */
export function usePlaceDetails(ids: number[]) {
  const response = useResource<{ items: PlaceDetails[] }>(placeDetailsPath(ids));
  const byId = useMemo(
    () => new Map(response.data?.items.map((item) => [item.spot_id, item])),
    [response.data],
  );
  return { ...response, byId };
}
