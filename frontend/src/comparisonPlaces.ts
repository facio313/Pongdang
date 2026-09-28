import {
  conditionScore, formatValue, metricText,
  type Conditions, type ConditionSummary, type Place,
} from "./productData.ts";

export interface ComparisonPlace extends Place {
  conditions?: Conditions | ConditionSummary;
  score: number | null;
  waterTemperature: string;
  loading: boolean;
}

export function comparisonPlace(
  place: Place, conditions?: Conditions | ConditionSummary, loading = false,
): ComparisonPlace {
  const water = conditions && "water_temperature" in conditions
    ? conditions.water_temperature : undefined;
  const component = conditions?.condition_score?.components.find((item) =>
    item.metric === "water_temperature" && item.status === "evaluated" && item.score !== null,
  );
  const waterTemperature = conditions && "metrics" in conditions
    ? metricText(conditions, "water_temperature")
    : water && ["available", "provisional"].includes(water.status) && water.value !== null
      ? formatValue(water.value, water.unit)
      : formatValue(component?.value, component?.unit);
  return { ...place, conditions, score: conditionScore(conditions), waterTemperature, loading };
}

/** Prefer different districts, then stronger evidence, never the highest score.
 * Missing scores are not an alternative, and zero is a valid measured score. */
export function distinctComparisonPlaces(
  reference: ComparisonPlace, candidates: ComparisonPlace[],
): ComparisonPlace[] {
  const rows = [reference];
  const key = (row: ComparisonPlace) => `${row.score}|${row.waterTemperature}`;
  const district = (row: ComparisonPlace) => row.district_code
    ? `${row.province_code ?? ""}:${row.district_code}` : undefined;
  const evidenceCount = (row: ComparisonPlace) => {
    const count = row.conditions?.condition_score?.available_components;
    return typeof count === "number" && Number.isInteger(count) && count >= 0 ? count : 0;
  };
  const seen = new Set([key(reference)]);
  const ids = new Set([reference.id, ...(reference.alias_ids ?? [])]);
  const districts = new Set([district(reference)]);
  while (rows.length < 3) {
    const candidate = candidates.filter((row) => row.type === reference.type && row.score !== null &&
      !ids.has(row.id) && !row.alias_ids?.some((id) => ids.has(id)) && !seen.has(key(row)))
      .sort((left, right) => {
        const newDistrict = (row: ComparisonPlace) => Boolean(district(row) && !districts.has(district(row)));
        return Number(newDistrict(right)) - Number(newDistrict(left)) || evidenceCount(right) - evidenceCount(left);
      })[0];
    if (!candidate) break;
    seen.add(key(candidate));
    ids.add(candidate.id);
    for (const aliasId of candidate.alias_ids ?? []) ids.add(aliasId);
    districts.add(district(candidate));
    rows.push(candidate);
  }
  return rows;
}
