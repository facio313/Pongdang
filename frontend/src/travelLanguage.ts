import { useSyncExternalStore } from "react";
import type { TravelRequest } from "./travelApi";

export const TRAVEL_LANGUAGES = [
  { locale: "ko", label: "한국어" },
  { locale: "en", label: "English" },
  { locale: "zh-CN", label: "简体中文" },
  { locale: "ja", label: "日本語" },
] as const;
export type TravelLocale = typeof TRAVEL_LANGUAGES[number]["locale"];
export const TRAVEL_LANGUAGE_KEY = "pongdang.travel-language";

function isTravelLocale(value: unknown): value is TravelLocale {
  return TRAVEL_LANGUAGES.some(({ locale }) => locale === value);
}

type LanguageState = { locale: TravelLocale; persisted: boolean };
let state: LanguageState | undefined;
const listeners = new Set<() => void>();

function readLanguage(): LanguageState {
  try {
    const value = window.localStorage.getItem(TRAVEL_LANGUAGE_KEY);
    return { locale: isTravelLocale(value) ? value : "ko", persisted: true };
  } catch {
    // Storage may be unavailable; language switching still works in this tab.
    return { locale: "ko", persisted: false };
  }
}

export function getTravelLanguage(): LanguageState {
  state ??= readLanguage();
  return state;
}

export function setTravelLanguage(locale: TravelLocale) {
  let persisted = true;
  try {
    window.localStorage.setItem(TRAVEL_LANGUAGE_KEY, locale);
  } catch {
    persisted = false;
  }
  state = { locale, persisted };
  listeners.forEach((listener) => listener());
}

function onStorage(event: StorageEvent) {
  if (event.key !== TRAVEL_LANGUAGE_KEY && event.key !== null) return;
  state = readLanguage();
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  if (!listeners.size) window.addEventListener("storage", onStorage);
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (!listeners.size) window.removeEventListener("storage", onStorage);
  };
}

export function useTravelLanguage() {
  return useSyncExternalStore(subscribe, getTravelLanguage);
}

/** Display language changes neither the geographic scope nor saved place IDs.
 * The backend resolves canonical region codes and localized region aliases.
 */
export function requestInLanguage(request: TravelRequest, locale: TravelLocale): TravelRequest {
  return {
    ...request,
    locale,
  };
}
