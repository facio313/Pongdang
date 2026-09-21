import { useExpired } from "./useExpiry";
import { useResource } from "./useResource";

interface TemperatureObservation {
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
}

interface TemperatureStation {
  station_id: number;
  spot_id: number;
  source_id: string;
  name: string | null;
  relation: "station_observation_point" | "representative_station";
  mapping: { valid_from: string; valid_until: string } | null;
}

interface TemperaturePage {
  rows: {
    spot_id: number;
    stations: TemperatureStation[];
    layers: TemperatureObservation[];
  }[];
}

/** Read only this place's observations; never borrow a nearby beach or forecast. */
export function useFirstSwimTemperature(spotId: number) {
  const resource = useResource<TemperaturePage>(
    `water-temperature?spot_id=${spotId}&mode=observation&page_size=1`,
  );
  const place = resource.data?.rows.find(row => row.spot_id === spotId);
  const observations = place?.layers.filter(row =>
    row.mode === "observation" && ["water_temperature", "sea_water_temperature"].includes(row.name),
  ) ?? [];
  // Multiple sources are not a license to choose or average a temperature.
  const observation = observations.length === 1 ? observations[0] : undefined;
  const stations = place?.stations.filter(row => row.spot_id === spotId && row.station_id === observation?.station_id) ?? [];
  const station = stations.length === 1 ? stations[0] : undefined;
  const observationExpiry = observation?.valid_until ? Date.parse(observation.valid_until) : undefined;
  const mappingExpiry = station?.mapping ? Date.parse(station.mapping.valid_until) : undefined;
  const expired = useExpired(observationExpiry);
  const mappingExpired = useExpired(mappingExpiry);

  let state: "loading" | "error" | "missing" | "stale" | "available" = "missing";
  let reason = "사용할 수 있는 실제 수온 관측이 없습니다.";
  if (resource.loading) state = "loading";
  else if (resource.error) state = "error";
  else if (observations.length > 1) reason = "수온 관측이 여러 개여서 하나의 수온으로 표시하지 않습니다.";
  else if (observation && !station) reason = "이 장소를 대표하는 수온 관측소 연결이 없거나 모호합니다.";
  else if (observation && station) {
    if (station.relation === "representative_station" && (!station.mapping ||
      !Number.isFinite(mappingExpiry) || mappingExpired ||
      !(Date.parse(observation.observed_at) >= Date.parse(station.mapping.valid_from)) ||
      !(Date.parse(observation.observed_at) < Date.parse(station.mapping.valid_until)))) {
      reason = "관측 시각이 관측소 연결의 유효기간 밖입니다.";
    } else if (observation.status === "stale" || expired) {
      state = "stale";
      reason = "수온 관측의 유효기간이 지났습니다.";
    } else if (observation.is_missing || observation.numeric_value === null || !Number.isFinite(observation.numeric_value)) {
      reason = "관측 자료에 수온 값이 없습니다.";
    } else if (!["degC", "°C"].includes(observation.unit ?? "")) {
      reason = "수온 단위를 비교할 수 없습니다.";
    } else if (observation.status === "observation" && Number.isFinite(observationExpiry)) {
      state = "available";
    }
  }
  const value = state === "available" ? observation?.numeric_value : undefined;
  return { state, reason, value, observation, station, error: resource.error };
}
