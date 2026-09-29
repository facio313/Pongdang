import { placeDistanceKm } from "./placeDistance.ts";
import type { ConditionSummary, Metric } from "./productData.ts";

export interface TemperatureObservation {
  station_id: number;
  provider: string;
  name: string;
  numeric_value: number | null;
  unit: string | null;
  mode: "observation" | "forecast";
  is_missing: boolean;
  observed_at: string;
  valid_until: string | null;
  status: "missing" | "unknown" | "stale" | "forecast" | "observation";
  spatial_scope?: string | null;
}

interface TemperatureStation {
  station_id: number;
  spot_id: number;
  source_id: string;
  name: string | null;
  latitude?: number | null;
  longitude?: number | null;
  relation: "station_observation_point" | "representative_station";
  mapping: { valid_from: string; valid_until: string } | null;
}

export interface TemperaturePage {
  retained?: boolean;
  rows: {
    spot_id: number;
    lat?: number | null;
    lng?: number | null;
    stations: TemperatureStation[];
    layers: TemperatureObservation[];
  }[];
}

export interface NearbyTemperatureConditions {
  spot_id: number;
  mode: string;
  retained?: boolean;
  context_metrics?: (Omit<Metric, "evidence"> & {
    evidence: (Metric["evidence"][number] & Pick<TemperatureObservation,
      "mode" | "is_missing" | "numeric_value" | "unit">)[];
  })[];
}

export interface TemperatureReading {
  value: number;
  relation: TemperatureStation["relation"] | "nearby_station_context";
  stationName: string;
  distanceKm: number | null;
  provider: string;
  observedAt: string;
  validUntil: string;
  stale: boolean;
  observationScope?: string | null;
}

export type TemperatureState = "loading" | "error" | "missing" | "stale" | "available";

/** Nearby context and expired observations are not current first-swim evidence. */
export function firstSwimDataLabel(state: TemperatureState, reading?: TemperatureReading) {
  if (state === "loading") return "첫 입수 자료 확인 중";
  if (state === "error") return "첫 입수 자료 조회 실패";
  if (state === "missing" || !reading) return "첫 입수 자료 없음";
  const nearby = reading.relation === "nearby_station_context";
  if (state === "stale" || reading.stale)
    return nearby ? "첫 입수 · 주변 이전 자료" : "첫 입수 · 이전 자료";
  return nearby ? "첫 입수 · 주변 자료" : "첫 입수 자료 있음";
}

const temperatureNames = new Set(["water_temperature", "sea_water_temperature"]);
const celsius = (unit: string | null) => unit === "degC" || unit === "°C";
const missingReason = "사용할 수 있는 실제 수온 관측이 없습니다.";

/** A list summary includes the same source observation as its condition detail. */
export function selectSummaryTemperature(summary: ConditionSummary): TemperatureReading | undefined {
  const metric = summary.water_temperature;
  const source = metric?.evidence.length === 1 ? metric.evidence[0] : undefined;
  if (summary.retention_allowed === false || !metric || !temperatureNames.has(metric.name) ||
    !["available", "provisional", "stale"].includes(metric.status) || !celsius(metric.unit) ||
    metric.value === null || !Number.isFinite(metric.value) || !metric.station_name ||
    !source || source.mode !== "observation" || source.is_missing !== false || source.numeric_value !== metric.value ||
    !celsius(source.unit ?? null) || !Number.isFinite(Date.parse(source.observed_at)) || !source.valid_until ||
    !(Date.parse(source.valid_until) > Date.parse(source.observed_at))) return undefined;
  const relation = metric.relation;
  if (relation !== "station_observation_point" && relation !== "representative_station" && relation !== "nearby_station_context") return undefined;
  const distance = typeof metric.distance_km === "number" && Number.isFinite(metric.distance_km) && metric.distance_km >= 0
    ? metric.distance_km : null;
  if (relation === "nearby_station_context" && distance === null) return undefined;
  return {
    value: metric.value, relation, stationName: metric.station_name, distanceKm: distance,
    provider: source.provider, observedAt: source.observed_at, validUntil: source.valid_until,
    observationScope: source.spatial_scope,
    stale: metric.status === "stale" || !!summary.retained,
  };
}

/** A validated place link takes precedence, including its retained observation. */
export function selectPlaceTemperature(page: TemperaturePage | undefined, spotId: number): {
  reading?: TemperatureReading; reason: string; needsNearby: boolean;
} {
  const place = page?.rows.find(row => row.spot_id === spotId);
  const observations = place?.layers.filter(row => row.mode === "observation" && temperatureNames.has(row.name)) ?? [];
  const direct = observations.filter(row => place?.stations.some(station =>
    station.station_id === row.station_id && station.spot_id === spotId && station.relation === "station_observation_point"));
  const candidates = direct.length ? direct : observations;
  const missing = (reason = missingReason) => ({ reason, needsNearby: false });
  if (!observations.length) return { reason: missingReason, needsNearby: !!place };
  if (candidates.length !== 1) return missing("수온 관측이 여러 개여서 하나의 수온으로 표시하지 않습니다.");
  const observation = candidates[0];
  const stations = place!.stations.filter(row => row.spot_id === spotId && row.station_id === observation.station_id);
  if (stations.length !== 1) return missing("이 장소를 대표하는 수온 관측소 연결이 없거나 모호합니다.");
  const station = stations[0];
  const observedAt = Date.parse(observation.observed_at);
  if (station.relation === "representative_station" && (!station.mapping ||
    !(observedAt >= Date.parse(station.mapping.valid_from)) ||
    !(observedAt < Date.parse(station.mapping.valid_until)))) {
    return missing("관측 시각이 관측소 연결의 유효기간 밖입니다.");
  }
  if (observation.is_missing || observation.numeric_value === null || !Number.isFinite(observation.numeric_value)) {
    return missing("관측 자료에 수온 값이 없습니다.");
  }
  if (!celsius(observation.unit)) return missing("수온 단위를 비교할 수 없습니다.");
  if (!Number.isFinite(observedAt) || !observation.valid_until ||
    !(Date.parse(observation.valid_until) > observedAt) || !["observation", "stale"].includes(observation.status)) return missing();
  return {
    reason: missingReason, needsNearby: false,
    reading: {
      value: observation.numeric_value, relation: station.relation,
      stationName: station.name ?? station.source_id,
      distanceKm: placeDistanceKm({ lat: place?.lat, lng: place?.lng }, { lat: station.latitude, lng: station.longitude }),
      provider: observation.provider, observedAt: observation.observed_at, validUntil: observation.valid_until,
      observationScope: observation.spatial_scope,
      stale: observation.status === "stale" || !!page?.retained,
    },
  };
}

/** Use only the server's bounded nearby observation context, never a forecast or an average. */
export function selectNearbyTemperature(data: NearbyTemperatureConditions | undefined, spotId: number): {
  reading?: TemperatureReading; reason: string;
} {
  const missing = { reason: missingReason };
  if (!data || data.spot_id !== spotId || data.mode !== "observation") return missing;
  const candidates = (data.context_metrics ?? []).flatMap(metric => {
    const source = metric.evidence.length === 1 ? metric.evidence[0] : undefined;
    if (!temperatureNames.has(metric.name) || metric.relation !== "nearby_station_context" ||
      !["available", "stale"].includes(metric.status) || !celsius(metric.unit) ||
      metric.value === null || !Number.isFinite(metric.value) || !metric.station_name ||
      typeof metric.distance_km !== "number" || !Number.isFinite(metric.distance_km) || metric.distance_km < 0 ||
      !source || source.mode !== "observation" || source.is_missing || source.numeric_value !== metric.value ||
      !celsius(source.unit) || !Number.isFinite(Date.parse(source.observed_at)) || !source.valid_until ||
      !(Date.parse(source.valid_until) > Date.parse(source.observed_at))) return [];
    return [{ stationId: metric.station_id, reading: {
      value: metric.value, relation: "nearby_station_context" as const,
      stationName: metric.station_name, distanceKm: metric.distance_km,
      provider: source.provider, observedAt: source.observed_at, validUntil: source.valid_until,
      observationScope: source.spatial_scope,
      stale: metric.status === "stale" || !!data.retained,
    } }];
  });
  // Closest observed station; latest observation breaks a shared-location tie.
  candidates.sort((a, b) => a.reading.distanceKm - b.reading.distanceKm ||
    Date.parse(b.reading.observedAt) - Date.parse(a.reading.observedAt) || a.stationId - b.stationId);
  const reading = candidates[0]?.reading;
  if (!reading) return missing;
  // A station may be published by several official feeds. Identical values need
  // no averaging; conflicting values at that station and time remain unknown.
  if (candidates.some(({ reading: other }) => other.stationName === reading.stationName &&
    other.distanceKm === reading.distanceKm && Date.parse(other.observedAt) === Date.parse(reading.observedAt) &&
    other.value !== reading.value)) return { reason: "같은 시각의 수온 관측이 서로 다릅니다." };
  return { reading, reason: missingReason };
}
