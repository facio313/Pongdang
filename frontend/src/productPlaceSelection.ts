import { useSyncExternalStore } from "react";

export interface ProductPlaceSelection {
  mode: "default" | "selected";
  spotId: number | null;
  district: string;
  search: string;
  page: number;
}
const STORAGE_KEY = "pongdang.product-place.v1";
const INITIAL: ProductPlaceSelection = { mode: "default", spotId: null, district: "", search: "", page: 1 };

export function parseProductPlaceSelection(raw: string | null): ProductPlaceSelection {
  if (!raw) return { ...INITIAL };
  try {
    const value = JSON.parse(raw) as Partial<ProductPlaceSelection>;
    if ((value.mode !== "default" && value.mode !== "selected") ||
      !(value.spotId === null || (typeof value.spotId === "number" && Number.isSafeInteger(value.spotId) && value.spotId > 0)) ||
      typeof value.district !== "string" || !/^[a-z]{0,30}$/.test(value.district) ||
      typeof value.search !== "string" || value.search.length > 100 ||
      typeof value.page !== "number" || !Number.isInteger(value.page) || value.page < 1 || value.page > 10000)
      return { ...INITIAL };
    return { mode: value.mode, spotId: value.mode === "selected" ? value.spotId : null, district: value.district, search: value.search, page: value.page };
  } catch { return { ...INITIAL }; }
}

function initialState() {
  try { return parseProductPlaceSelection(typeof window === "undefined" ? null : window.sessionStorage.getItem(STORAGE_KEY)); }
  catch { return { ...INITIAL }; }
}
let state = initialState();
const listeners = new Set<() => void>();
function update(next: ProductPlaceSelection) {
  state = next;
  try { window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  catch { /* The current tab still keeps its selection when storage is unavailable. */ }
  listeners.forEach((listener) => listener());
}
export function selectProductPlace(spotId: number) {
  if (Number.isSafeInteger(spotId) && spotId > 0) update({ ...state, mode: "selected", spotId });
}
export function changeProductPlaceFilters(filters: Partial<Pick<ProductPlaceSelection, "district" | "search" | "page">>) {
  // Browsing a different scope clears the old reference immediately. Empty or
  // failed pages must not keep displaying another district's measurements.
  update({ ...state, ...filters, page: filters.page ?? 1, mode: "selected", spotId: null });
}
export function resetProductPlace() { update({ ...INITIAL }); }
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};
export function useProductPlaceSelection() {
  return useSyncExternalStore(subscribe, () => state, () => state);
}
