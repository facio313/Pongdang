import { selectSummaryTemperature, type TemperatureReading } from "./firstSwimTemperature.ts";
import type { ConditionSummary } from "./productData.ts";

let sessionSeed: number | undefined;
/** Share the draw across desktop/mobile remounts; a page reload starts a new draw. */
export function homeBeachShuffleSeed() {
  return sessionSeed ??= crypto.getRandomValues(new Uint32Array(1))[0];
}

export function selectHomeBeaches<T extends { id: number; type: string | null }>(
  places: T[], summaries: ReadonlyMap<number, ConditionSummary>, seed: number,
): (T & { temperature: TemperatureReading })[] {
  const unique = new Map(places.filter(place => place.type === "beach").map(place => [place.id, place]));
  const candidates = [...unique.values()].flatMap(place => {
    const summary = summaries.get(place.id);
    const temperature = summary?.spot_id === place.id ? selectSummaryTemperature(summary) : undefined;
    return temperature ? [{ ...place, temperature }] : [];
  }).sort((a, b) => a.id - b.id);
  // Seeded Fisher–Yates: order does not depend on names or response arrival order.
  let state = seed >>> 0;
  const random = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
  for (let index = candidates.length - 1; index > 0; index--) {
    const other = Math.floor(random() * (index + 1));
    [candidates[index], candidates[other]] = [candidates[other], candidates[index]];
  }
  // Show at most one beach per displayed temperature, even if fewer than four remain.
  const selected: typeof candidates = [];
  const temperatures = new Set<number>();
  for (const candidate of candidates) {
    if (!temperatures.has(candidate.temperature.value)) {
      temperatures.add(candidate.temperature.value);
      selected.push(candidate);
      if (selected.length === 4) return selected;
    }
  }
  return selected;
}
