import { useCallback } from "react";
import { getTravelLanguage, useTravelLanguage, type TravelLocale } from "./travelLanguage.ts";
import { commonMessages } from "./locales/common.ts";
import { conditionsMessages } from "./locales/conditions.ts";
import { travelMessages } from "./locales/travel.ts";
import { placesMessages } from "./locales/places.ts";
import { dataMessages } from "./locales/data.ts";
import { featureMessages } from "./locales/features.ts";
import { regionMessages } from "./locales/regions.ts";
import { errorMessages } from "./locales/errors.ts";

/** English, simplified Chinese, Japanese. Korean source copy is the stable key. */
export type MessageTranslations = readonly [string, string, string];
export type MessageValues = Record<string, string | number>;
export const messages: Record<string, MessageTranslations> = {
  ...commonMessages,
  ...conditionsMessages,
  ...travelMessages,
  ...placesMessages,
  ...dataMessages,
  ...featureMessages,
  ...regionMessages,
  ...errorMessages,
};
const languageIndex = { en: 0, "zh-CN": 1, ja: 2 } as const;

/** Translate application copy only. Unregistered provider/user text stays intact. */
export function t(source: string, values: MessageValues = {}, locale: TravelLocale = getTravelLanguage().locale): string {
  const translated = locale === "ko" ? source : messages[source]?.[languageIndex[locale]] ?? source;
  return translated.replace(/\{(\w+)\}/g, (match, key: string) =>
    Object.hasOwn(values, key) ? String(values[key]) : match,
  );
}

export function useI18n() {
  const { locale } = useTravelLanguage();
  const translate = useCallback((source: string, values?: MessageValues) => t(source, values, locale), [locale]);
  return { locale, t: translate };
}

export function dateLocale(locale: TravelLocale = getTravelLanguage().locale): string {
  return locale === "ko" ? "ko-KR" : locale === "en" ? "en-GB" : locale === "ja" ? "ja-JP" : "zh-CN";
}
