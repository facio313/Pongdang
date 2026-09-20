import type { Activity } from "./aiApi.ts";
import type { Conditions } from "./productData.ts";

/** `water-index/recommendation` 의 응답. 서버가 활동별 점수를 **비교해** 하나를
 *  고른 결과와, 그 판단에 쓴 코드·수치입니다.
 *
 *  문장은 들어 있지 않습니다. 한국어 문구는 `recommendationText.ts` 한 곳에
 *  모여 있어야 화면마다 같은 사유가 다른 말로 보이지 않습니다. */
export interface Recommendation {
  contract_version: "water-recommendation.v1";
  model_id: string;
  model_version: string;
  scientific_validation: "not_evaluated";
  spot_id: number;
  place_name: string | null;
  place_kind: "beach" | "valley" | null;
  at: string;
  as_of: string;
  mode: "observation" | "forecast";
  choice: RecommendationChoice | null;
  ranked: RankedActivity[];
  reasons: RecommendationReasonData[];
  tide: RecommendationTide | null;
  alternatives: RecommendationAlternative[];
  /** 판단에 쓴 활동별 조건 응답 전부. 화면은 이것을 그대로 쓰고 같은 자료를
   *  다시 조회하지 않습니다 -- 따로 조회하면 두 응답의 시각이 어긋나 히어로
   *  점수와 그 아래 근거가 서로 다른 순간을 가리킵니다. */
  conditions: Conditions[];
  rules: { code: string; text: string; basis: string }[];
  limitations: string[];
  reason_codes: string[];
}
export interface RecommendationChoice {
  activity: Activity;
  score: number;
  status: string;
}
export interface RankedActivity {
  activity: Activity;
  score: number | null;
  status: string;
  coverage: number;
  available_components: number;
  total_components: number;
  /** 후보에서 빠짐. 점수가 낮은 것과 다른 사실입니다. */
  dropped: boolean;
  /** 물때로 뒤로 미뤄짐. 점수는 그대로입니다. */
  demoted: boolean;
  rules_applied: string[];
}
export interface RecommendationReasonData {
  code: string;
  activity: Activity | null;
  /** 비교 대상 활동. 「저쪽이 아니라 이쪽」을 말하는 사유에만 있습니다. */
  rival: Activity | null;
  metric: string | null;
  label: string | null;
  value: number | null;
  unit: string | null;
  threshold: number | null;
  station_name: string | null;
  relation: string | null;
  distance_km: number | null;
  /** 물때 극값까지의 분. 양수면 앞으로, 음수면 이미 지났다는 뜻입니다. */
  minutes: number | null;
}
export interface RecommendationTide {
  status: string;
  phase: "near_high" | "near_low" | "rising" | "falling" | "unknown";
  minutes_to_high: number | null;
  minutes_to_low: number | null;
  minutes_since_high: number | null;
  minutes_since_low: number | null;
  high_at: string | null;
  low_at: string | null;
  height: number | null;
  unit: string | null;
  station_name: string | null;
  spatial_relation: string | null;
  distance_km: number | null;
  reason_codes: string[];
}
export interface RecommendationAlternative {
  kind: "valley" | "onsen" | "meal" | "visit";
  spot_id: number;
  name: string;
  distance_km: number | null;
  address: string | null;
  region: string | null;
  /** 계곡 대안 한 곳에 한해 그곳의 추천도 함께 옵니다. */
  best_activity: Activity | null;
  score: number | null;
}

export function recommendationPath(id?: number, at?: string) {
  return id
    ? "water-index/recommendation?" +
        new URLSearchParams({
          spot_id: String(id),
          mode: at ? "forecast" : "observation",
          ...(at ? { at } : {}),
        })
    : null;
}
