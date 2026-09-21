import { conditionScore, type Conditions, type ConditionSeries, type ConditionSummaries, type ConditionSummary } from "./productData.ts";
import type { Recommendation } from "./recommendationApi.ts";
import type { TemperaturePage } from "./useFirstSwimTemperature.ts";

/** Only public condition displays may retain an earlier response. Account data,
 * searches and user edits keep their existing replacement semantics. */
export function retainsConditionData(path: string) {
  return /^(water-index\/(conditions(?:\/series|\/summary)?|recommendation)|water-temperature)\?/.test(path);
}

function isPlaceRead(path: string) {
  return path === "water-index/default-place" || /^(places|datasets\/spots|livecams\/preview\/places)\?/.test(path);
}

export function retainsDisplayData(path: string) {
  return retainsConditionData(path) || isPlaceRead(path);
}

function blocked(data: { safety_status?: string; support_status?: string; condition_score?: { status: string } | null }) {
  return data.safety_status === "restricted" || data.support_status === "unsupported" || data.condition_score?.status === "blocked";
}

function availableMetrics(data: Conditions) {
  return new Set([
    ...(data.condition_score?.components ?? []).filter(c => c.status === "evaluated" && c.score !== null).map(c => c.metric),
    ...[...data.metrics, ...(data.display_metrics ?? [])].filter(m =>
      (["available", "provisional"].includes(m.status) && m.value !== null) || (m.status === "text" && m.text_value),
    ).map(m => m.name),
  ]);
}

export function retainConditions(previous: Conditions | undefined, next: Conditions): Conditions {
  if (!previous || previous.spot_id !== next.spot_id || previous.activity !== next.activity || previous.mode !== next.mode ||
      blocked(next) || blocked(previous)) return next;
  const oldMetrics = availableMetrics(previous);
  const newMetrics = availableMetrics(next);
  const lostScore = conditionScore(previous) !== null && conditionScore(next) === null;
  // Keep a coherent score with its original evidence, never a mixture of old
  // components and a total computed from a different set. Lower scores are valid.
  if (lostScore || [...oldMetrics].some(name => !newMetrics.has(name))) {
    return { ...previous, retained: true };
  }
  return next;
}

function retainSummary(previous: ConditionSummary | undefined, next: ConditionSummary): ConditionSummary {
  if (!previous || blocked(next) || blocked(previous)) return next;
  const old = previous.condition_score;
  const current = next.condition_score;
  if ((conditionScore(previous) !== null && (conditionScore(next) === null ||
      old!.components.some(c => c.score !== null && !current?.components.some(n => n.metric === c.metric && n.score !== null)))) ||
      (previous.water_temperature?.value != null && next.water_temperature?.value == null)) {
    return { ...previous, retained: true };
  }
  return next;
}

/** The caller keys previous data by the complete query, including place,
 * activity and target dates. Never carry a value across a changed selection. */
export function retainConditionData(path: string, previous: unknown, next: unknown): unknown {
  // These public catalogs determine the selected place. Losing them would
  // unmount its condition display even when the condition cache is intact.
  if (previous && isPlaceRead(path)) {
    if (next === undefined) return previous;
    if (path === "water-index/default-place") {
      return (next as { place?: unknown }).place ? next : previous;
    }
    const rows = Array.isArray(next) ? next : (next as { rows?: unknown[] }).rows;
    return rows?.length ? next : previous;
  }
  if (!previous || !retainsConditionData(path)) return next;
  if (next === undefined) return markRetained(path, previous);
  if (path.startsWith("water-temperature?")) {
    const before = previous as TemperaturePage;
    const after = next as TemperaturePage;
    const usable = (data: TemperaturePage) => data.rows.some(row => row.layers.length === 1 && row.layers.every(layer =>
      layer.mode === "observation" && ["observation", "stale"].includes(layer.status) &&
      !layer.is_missing && layer.numeric_value !== null && Number.isFinite(layer.numeric_value) &&
      ["degC", "°C"].includes(layer.unit ?? "") && row.stations.some(s => s.station_id === layer.station_id),
    ));
    return usable(before) && (!usable(after) || after.rows.some(row => row.layers.some(layer => layer.status === "stale")))
      ? { ...before, retained: true } : after;
  }
  if (path.startsWith("water-index/conditions/series?")) {
    const before = previous as ConditionSeries;
    const after = next as ConditionSeries;
    const rows = new Map(after.rows.map(row => [Date.parse(row.at), row]));
    for (const old of before.rows) {
      const current = rows.get(Date.parse(old.at));
      rows.set(Date.parse(old.at), current ? retainConditions(old, current) : { ...old, retained: true });
    }
    return { ...after, rows: [...rows.values()] };
  }
  if (path.startsWith("water-index/conditions/summary?")) {
    const before = previous as ConditionSummaries;
    const after = next as ConditionSummaries;
    const rows = new Map(after.rows.map(row => [row.spot_id, row]));
    for (const old of before.rows) {
      const current = rows.get(old.spot_id);
      rows.set(old.spot_id, current ? retainSummary(old, current) : { ...old, retained: true });
    }
    return { ...after, rows: [...rows.values()] };
  }
  if (path.startsWith("water-index/recommendation?")) {
    const before = previous as Recommendation;
    const after = next as Recommendation;
    // A new official restriction must never be masked by an old recommendation.
    if (after.conditions.some(blocked) || before.conditions.some(blocked)) return after;
    const degraded = before.conditions.some(old => {
      const current = after.conditions.find(c => c.activity === old.activity);
      return current ? retainConditions(old, current) !== current : conditionScore(old) !== null;
    });
    if (before.choice && (!after.choice || degraded)) return markRetained(path, before);
    return after;
  }
  return retainConditions(previous as Conditions, next as Conditions);
}

function markRetained(path: string, value: unknown): unknown {
  if (path.startsWith("water-index/recommendation?")) {
    const data = value as Recommendation;
    return { ...data, conditions: data.conditions.map(c => ({ ...c, retained: true })) };
  }
  if (path.startsWith("water-index/conditions/series?") || path.startsWith("water-index/conditions/summary?")) {
    const data = value as ConditionSeries | ConditionSummaries;
    return { ...data, rows: data.rows.map(row => ({ ...row, retained: true })) };
  }
  return { ...(value as Conditions), retained: true };
}
