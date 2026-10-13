import { calendarDays, kstDate } from "./productData.ts";

/** Today and the following six Korean calendar days; missing forecasts stay missing. */
export function travelDates(now = new Date().toISOString()) {
  return calendarDays(now, 7);
}

export function isTravelDate(value: string, now = new Date().toISOString()) {
  return travelDates(now).some(day => day.id === value);
}

/** Future trips start at 09:00 by default. Today's trip keeps a near-term departure. */
export function defaultRouteDeparture(date = kstDate(), now = new Date().toISOString()) {
  if (date > kstDate(now)) return `${date}T09:00`;
  const soon = Math.min(Date.parse(now) + 600000, Date.parse(`${date}T23:59:00+09:00`));
  const local = new Date(soon + 9 * 3600000).toISOString();
  return `${date}T${local.slice(11, 16)}`;
}
