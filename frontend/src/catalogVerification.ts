export const CATALOG_VERIFICATION_MAX_AGE_MS = 48 * 3600000;

/** A recent fetch alone is insufficient: the server must confirm a complete collection. */
export function recentCatalogVerification(recent: boolean | undefined, at?: string | null, now = Date.now()) {
  const checked = at ? Date.parse(at) : NaN;
  return recent === true && Number.isFinite(checked) && checked <= now && now - checked < CATALOG_VERIFICATION_MAX_AGE_MS;
}
