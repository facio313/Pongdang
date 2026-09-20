export interface PlacePhoto {
  spot_id: number;
  id: number;
  url: string;
  attribution: string;
  source_url: string;
  license: string;
  name: string;
}

export function placePhotosPath(ids: number[]) {
  const selected = [...new Set(ids)]
    .filter((id) => Number.isSafeInteger(id) && id > 0)
    .sort((a, b) => a - b)
    .slice(0, 100);
  return selected.length ? `attachments?spot_ids=${selected.join(",")}` : null;
}

// Images are served from stored attachments through the application's SSO gate.
// A provider URL is never used as an image source in the browser.
export function placePhotoUrl(base: string, photo?: PlacePhoto) {
  if (!photo || !Number.isSafeInteger(photo.id) || photo.id <= 0) return undefined;
  const path = `/api/data/attachments/${photo.id}/file`;
  return photo.url === path ? `${base.replace(/\/$/, "")}${path}` : undefined;
}

export function placePhotoSource(photo?: PlacePhoto) {
  if (!photo) return undefined;
  try {
    const source = new URL(photo.source_url);
    return source.protocol === "https:" && !source.username && !source.password
      ? source.href
      : undefined;
  } catch {
    return undefined;
  }
}

export function placePhotoLicense(photo: PlacePhoto) {
  return photo.license === "Type1" ? "공공누리 1유형"
    : photo.license === "Type3" ? "공공누리 3유형" : photo.license;
}
