import { useMemo } from "react";
import { placePhotosPath, type PlacePhoto } from "./placePhotos";
import { useResource } from "./useResource";

/** One bounded metadata request per displayed set, never one request per card. */
export function usePlacePhotos<T extends { id: number; photo?: PlacePhoto }>(rows: T[] | undefined) {
  const response = useResource<{ items: PlacePhoto[] }>(
    placePhotosPath(rows?.map((place) => place.id) ?? []),
  );
  const withPhotos = useMemo(() => {
    const photos = new Map(response.data?.items.map((photo) => [photo.spot_id, photo]));
    return rows?.map((place) => ({ ...place, photo: photos.get(place.id) }));
  }, [rows, response.data]);
  return { rows: withPhotos, loading: response.loading, error: response.error };
}
