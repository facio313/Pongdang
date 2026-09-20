import { t } from "./i18n.ts";
import { useSyncExternalStore } from "react";
import { placeRegionLabel } from "./productData.ts";
import { DEFAULT_PROVINCE, type RegionCatalog } from "./waterPlaceApi.ts";

const provinceAliases = ["gangwon", "gangwon-do", "gangwon state", "gangwon special self-governing province", "강원", "강원도", "강원특별자치도"];

let selectedRegion: string | null = null;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

export function setTravelRegion(region: string) {
  if (selectedRegion === region) return;
  selectedRegion = region;
  listeners.forEach((listener) => listener());
}

export function getTravelRegion() {
  return selectedRegion;
}

/** Unsaved region choices survive navigation and responsive layout changes. */
export function useTravelRegionSelection() {
  return [useSyncExternalStore(subscribe, getTravelRegion, () => null), setTravelRegion] as const;
}

export function travelRegionOptions(catalog?: RegionCatalog) {
  const province = catalog?.provinces.find((item) => item.code === DEFAULT_PROVINCE);
  return [
    { value: DEFAULT_PROVINCE, label: t("강원도 전체") },
    ...(province?.districts ?? []).map((district) => ({
      // Goseong and Donghae also have non-administrative meanings. Keep the
      // province in every district request so the server can resolve it safely.
      value: `${DEFAULT_PROVINCE} ${district.code}`,
      label: t(district.label),
    })),
  ];
}

export function travelRegionLabel(region: string | null | undefined, catalog?: RegionCatalog) {
  const value = region?.trim() ?? "";
  const lower = value.toLowerCase();
  if (provinceAliases.includes(lower)) return t("강원도 전체");
  const district = catalog?.provinces.find((item) => item.code === DEFAULT_PROVINCE)?.districts.find((item) => {
    const aliases = [item.code, item.label, item.label.slice(0, -1), `${item.code}-${item.label.endsWith("시") ? "si" : "gun"}`];
    const unambiguous = item.code === "donghae" ? ["동해시", "donghae-si"].includes(lower)
      : item.code !== "goseong" && aliases.includes(lower);
    return unambiguous || provinceAliases.some((province) => aliases.includes(lower.slice(province.length + 1)) && lower.startsWith(`${province} `));
  });
  if (district) return t(district.label);
  const code = lower.startsWith(`${DEFAULT_PROVINCE} `) ? lower.slice(DEFAULT_PROVINCE.length + 1)
    : ["goseong", "donghae"].includes(lower) ? undefined : lower;
  return placeRegionLabel({ district_code: code, region: value || null });
}
