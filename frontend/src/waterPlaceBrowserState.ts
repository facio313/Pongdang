import type { WaterPlaceKind } from "./waterPlaceApi.ts";

export const WATER_PLACE_BROWSER_KEY = "pongdang.water-place-browser";
export type WaterPlaceBrowserState = { search: string; district: string; kind: WaterPlaceKind; page: number };
const initial: WaterPlaceBrowserState = { search: "", district: "", kind: "", page: 1 };
let state: WaterPlaceBrowserState | undefined;
const listeners = new Set<() => void>();

export function parseWaterPlaceBrowserState(raw: string | null): WaterPlaceBrowserState {
  try {
    const value: unknown = JSON.parse(raw ?? "null");
    if (!value || typeof value !== "object") return { ...initial };
    const saved = value as Partial<WaterPlaceBrowserState>;
    return {
      search: typeof saved.search === "string" ? saved.search.slice(0, 100) : "",
      district: typeof saved.district === "string" && /^[a-z]{1,20}$/.test(saved.district) ? saved.district : "",
      kind: saved.kind === "beach" || saved.kind === "valley" ? saved.kind : "",
      page: Number.isSafeInteger(saved.page) && saved.page! >= 1 && saved.page! <= 10000 ? saved.page! : 1,
    };
  } catch {
    return { ...initial };
  }
}

export function getWaterPlaceBrowserState(): WaterPlaceBrowserState {
  if (!state) {
    try {
      state = parseWaterPlaceBrowserState(window.sessionStorage.getItem(WATER_PLACE_BROWSER_KEY));
    } catch {
      state = { ...initial };
    }
  }
  return state;
}

/** Keep the same catalogue scope across list, map, detail/back and layout changes. */
export function updateWaterPlaceBrowserState(change: Partial<WaterPlaceBrowserState>) {
  state = { ...getWaterPlaceBrowserState(), ...change };
  try {
    window.sessionStorage.setItem(WATER_PLACE_BROWSER_KEY, JSON.stringify(state));
  } catch {
    // Browsing remains available in this tab when storage is blocked.
  }
  listeners.forEach(listener => listener());
}

export function subscribeWaterPlaceBrowser(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
