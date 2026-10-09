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
  place_kind: "beach" | "valley" | "lake" | "reservoir" | null;
  at: string;
  as_of: string;
  mode: "observation" | "forecast";
  choice: RecommendationChoice | null;
  ranked: RankedActivity[];
  reasons: RecommendationReasonData[];
  tide: RecommendationTide | null;
  /** 해수욕장 개장 기간 판정. 해변이 아니거나 조회에 실패하면 null 입니다 --
   *  계곡에 「개장 기간」을 지어내지 않습니다. */
  beach_season: RecommendationSeason | null;
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
  /** 뒤로 미뤄짐(물때 구간, 해수욕장 개장 기간 밖). 점수는 그대로이고,
   *  어느 규칙이 미뤘는지는 `rules_applied` 에 있습니다. */
  demoted: boolean;
  /** 조건은 알지만 **할 수 있는 날인지를 모름**. 개장 기간을 확인하지 못한
   *  해수욕장 수영이 여기입니다. `dropped`·`demoted` 의 셋째 단계입니다.
   *
   *  점수는 그대로 옵니다 -- 조건은 실제로 좋을 수 있고, 모르는 것은 개장
   *  입니다. 서버에서 바뀌는 것은 「물이면 물」 가산을 받지 못한다는 사실
   *  뿐이라, 점수가 더 높은 휴식·온천이 그날의 답이 될 수 있습니다. */
  needs_confirmation: boolean;
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
export interface RecommendationSeasonWindow {
  start_month: number;
  start_day: number;
  end_month: number;
  end_day: number;
  /** 서술에서 읽어 낸 정밀도. 「7월 중순」은 날짜가 아니라 어림입니다. */
  precision: "day" | "part_month" | "month" | "year_round";
  year: number | null;
}
/** 개장 기간 판정. **공식 개장 공고가 아닙니다** -- 관광정보의 자유 서술을
 *  읽은 결과입니다. 읽지 못했으면 `unconfirmed` 이고 `windows` 가 빕니다. */
export interface RecommendationSeason {
  status: "in_season" | "out_of_season" | "unconfirmed";
  windows: RecommendationSeasonWindow[];
  source_field: "opening_period" | "opening_date" | null;
  /** 읽은 원문. 읽지 못한 서술도 화면이 그대로 보여 줄 수 있어야 합니다. */
  raw: string | null;
  /** 판정 기준일(KST). 어느 날짜로 판정했는지가 결과의 일부입니다. */
  evaluated_on: string;
  year_basis: "annual" | "explicit_year" | "past_year" | null;
  stale_years: number | null;
  reason_codes: string[];
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
    : // 장소 미정은 「조회 중」입니다(useResource 의 ResourcePath 주석 참고).
      undefined;
}
