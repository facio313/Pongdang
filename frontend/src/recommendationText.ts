import { t } from "./i18n.ts";
// 서버가 고른 활동을 「왜 이것인가 · 왜 저것이 아닌가 · 지금 물때는 · 대신 갈 곳」
// 으로 읽어 주는 계층.
//
// 이 파일은 고르기만 하고 판단하지 않습니다. 임계값을 다시 재거나, 점수를
// 비교하거나, 서버가 내리지 않은 사유를 만들지 않습니다 -- 그건 백엔드
// (recommendation.py)의 몫이고, 화면이 따로 판단하면 두 결론이 갈립니다.
// 여기서 하는 일은 이미 온 reason 코드와 수치를 문장으로 옮기는 것뿐입니다.
//
// 값을 실제로 가져오는 import 는 확장자를 붙입니다. tests/*.test.mjs 는
// 번들러 없이 node 가 이 .ts 를 그대로 읽습니다(scoreMeaning.ts 와 같은 이유).
import { activities, type Activity } from "./aiApi.ts";
import { conditionScore, formatValue, type Conditions } from "./productData.ts";
import type {
  RankedActivity,
  Recommendation,
  RecommendationAlternative,
  RecommendationReasonData,
} from "./recommendationApi.ts";

/** 원점수는 보존하되, 서버가 제외한 활동을 숫자 추천으로 다시 보이지 않게 합니다.
 * 물때로 순위만 미룬 활동(demoted)은 제외가 아니므로 그 점수를 유지합니다. */
export function activityRecommendationDisplay(
  conditions?: Conditions,
  ranked?: RankedActivity,
): { score: number | null; eligibility?: string } {
  if (conditions?.support_status === "unsupported")
    return { score: null, eligibility: t("활동 미지원") };
  if (ranked?.dropped) {
    const rules = ranked.rules_applied;
    const eligibility = rules.includes("essential_measurement_missing")
      ? t("추천 제외 · 필수 근거 부족")
      : rules.includes("water_too_cold_for_immersion")
        ? t("추천 제외 · 수온 기준 미충족")
        : conditions?.condition_score?.status === "blocked"
          ? t("산정 보류 · 공식 제한 또는 활동 미지원")
          : rules.includes("activity_blocked")
            ? t("산정 불가 · 근거 부족")
            : t("추천 제외");
    return { score: null, eligibility };
  }
  const score = conditionScore(conditions);
  if (score === null && conditions)
    return {
      score,
      eligibility: conditions.condition_score?.status === "blocked"
        ? t("산정 보류 · 공식 제한 또는 활동 미지원")
        : t("산정 불가 · 근거 부족"),
    };
  return { score };
}

/** 물때 규칙은 검증된 기준이 아닙니다. 이 문장은 물때를 말하는 모든 줄에
 *  붙습니다 -- 조석 예측을 활동 가능 시간으로 읽게 두지 않기 위해서입니다. */
export const TIDE_DISCLAIMER =
  "퐁당 자체 물때 기준이며 공식 운영시간 · 안전 판정이 아닙니다.";

/** 대안의 종류별 표기. 「휴식」이라는 말 대신 **갈 곳**을 말합니다 -- 물에
 *  들어가지 않는 날의 답이 「물가에 앉아 있기」가 되지 않도록. */
export const ALTERNATIVE_LABEL: Record<
  RecommendationAlternative["kind"],
  string
> = {
  valley: "계곡",
  onsen: "온천",
  meal: "카페 · 맛집",
  visit: "가까운 명소",
};

/** 히어로에 올릴 활동 이름. `relax` 는 서버 enum 이라 그대로 두고, 추천
 *  문맥에서만 갈 곳이 있는 하루로 바꿔 부릅니다. */
export function activityHeadline(activity: Activity) {
  return activity === "relax" ? t("물에 들어가지 않는 하루") : t(activities[activity]);
}

export interface ReasonLine {
  code: string;
  text: string;
}

/** 고른 활동이 없을 때 히어로가 할 말. **조회 실패와 「고를 것이 없음」은 다른
 *  사실입니다** -- 서버에 닿지 못한 것을 「오늘은 할 게 없다」로 바꾸면 화면이
 *  없는 판단을 지어내는 셈입니다. */
export function missingChoiceHeadline(error?: string, polite = false) {
  // 모바일은 해요체, 데스크탑은 합쇼체를 씁니다. 말투까지 한 곳에서 갈라
  // 두어야 화면마다 같은 사실이 다른 문장으로 벌어지지 않습니다.
  if (error)
    return [t("오늘의 활동을"), polite ? t("불러오지 못했습니다") : t("불러오지 못했어요")];
  return [t("오늘 점수를 낼 수 있는"), polite ? t("활동이 없습니다") : t("활동이 없어요")];
}

function find(rec: Recommendation | undefined, ...codes: string[]) {
  return (rec?.reasons ?? []).find((reason) => codes.includes(reason.code));
}
function all(rec: Recommendation | undefined, code: string) {
  return (rec?.reasons ?? []).filter((reason) => reason.code === code);
}
/** 「수온 24°C」. 조사(이/가)는 붙이지 않습니다 -- 값이 «1.4m» · «8m/s» 처럼
 *  기호로 끝나 받침을 판정할 수 없어, 어느 쪽을 골라도 절반은 틀립니다. */
function measured(reason: RecommendationReasonData) {
  return `${t(reason.label ?? reason.metric ?? "")} ${formatValue(reason.value, reason.unit ?? "")}`.trim();
}

/** 왜 이 활동인가. 서버가 그 이유를 코드로 말해 주지 않았으면 문장을 지어내지
 *  않고 null 을 돌려줍니다 -- 모르는 것을 「좋아서」로 바꾸지 않기 위해서입니다. */
export function choiceReason(rec?: Recommendation): ReasonLine | null {
  const choice = rec?.choice;
  if (!choice) return null;
  const surf = find(rec, "wave_favours_surf");
  if (surf) {
    const period = find(rec, "wave_period_context");
    const waves = [measured(surf), period && measured(period)]
      .filter(Boolean)
      .join(" · ");
    return {
      code: surf.code,
      text: t("{waves} — 오늘은 수영보다 서핑에 맞는 파도예요", { waves }),
    };
  }
  const swim = find(rec, "wave_favours_swim");
  if (swim)
    return {
      code: swim.code,
      text: t("{waves} — 파도가 잔잔해서 바다 수영에 맞아요", { waves: measured(swim) }),
    };
  const preferred = find(rec, "water_activity_preferred");
  if (preferred && preferred.rival)
    return {
      code: preferred.code,
      // 여섯 활동 이름이 모두 받침으로 끝나므로(수영 · 서핑 · 휴식 · 갯벌 ·
      // 온천 · 래프팅) 여기서는 «을» 하나로 맞습니다. 측정값과 달리 활동
      // 이름은 고정된 낱말이라 조사를 붙여도 절반이 틀리지 않습니다.
      text: t("{rival} 점수가 더 높지만, 오늘은 물에 들어갈 수 있어서 {activity}을 먼저 권해요", {
        rival: t(activities[preferred.rival]), activity: t(activities[choice.activity]),
      }),
    };
  return null;
}

/** 왜 다른 활동이 아닌가. 바다를 막은 사유를 먼저 말합니다 -- 그것이 사용자가
 *  가장 궁금해하는 하나이기 때문입니다. */
export function rejectionReason(rec?: Recommendation): ReasonLine | null {
  const cold = find(rec, "water_too_cold_for_immersion");
  if (cold) {
    const air = find(rec, "air_below_beach_preference");
    const measures = [measured(cold), air && measured(air)]
      .filter(Boolean)
      .join(" · ");
    return {
      code: cold.code,
      text: t("{measures} — 바다에 들어가기에는 낮아요(수온 {threshold} 아래)", {
        measures, threshold: formatValue(cold.threshold, "°C"),
      }),
    };
  }
  const missing = all(rec, "essential_measurement_missing");
  if (missing.length) {
    // 빠진 지표가 아니라 **빠진 활동**을 말합니다. 「시설 욕조 수온 자료가
    // 없어요」는 사실이지만, 사용자가 궁금한 것은 «왜 온천이 아닌가» 입니다.
    const names = [
      ...new Set(missing.map((reason) => t(activities[reason.activity!]))),
    ].join(" · ");
    const metrics = [
      ...new Set(missing.map((reason) => t(METRIC_NAMES[reason.metric ?? ""] ?? reason.metric ?? ""))),
    ].join(" · ");
    return {
      code: "essential_measurement_missing",
      text: t("{names}은 이곳의 {metrics} 자료가 없어 판단하지 않았어요 — 조건이 나쁜 것과 다릅니다", { names, metrics }),
    };
  }
  if (find(rec, "no_water_activity_today"))
    return {
      code: "no_water_activity_today",
      text: t("오늘 이곳에서 점수를 낼 수 있는 물 활동이 없어요"),
    };
  return null;
}

/** 근거로 쓰인 지표의 이름. 서버 라벨이 없는 사유(미측정)에만 씁니다. */
const METRIC_NAMES: Record<string, string> = {
  water_temperature: "수온",
  bath_water_temperature: "시설 욕조 수온",
  air_temperature: "기온",
  wave_height: "파고",
  wave_period: "파주기",
  river_level: "하천 수위",
  river_flow: "하천 유량",
  wind_speed: "풍속",
};

/** 바다에 들어가는 활동. 물때 문장이 「바다 대신」이라고 말해도 되는지를
 *  가릅니다(백엔드 recommendation.SEA_ACTIVITIES 와 같은 둘). */
const SEA: Activity[] = ["swim", "surf"];

/** 지금 물때. 극값 전후면 그 사실과 대안을, 아니면 오르내림만 말합니다. */
export function tideLine(rec?: Recommendation): ReasonLine | null {
  const tide = rec?.tide;
  const choice = rec?.choice;
  if (!tide || tide.status !== "available") return null;
  const applied = find(rec, "tide_phase_product_rule");
  if (applied && applied.minutes !== null) {
    const kind = tide.phase === "near_high" ? t("만조") : t("간조");
    // 「만조 40분 전」은 만조까지 40분 남았다는 뜻으로 읽힙니다. 이미 지난
    // 쪽은 「지난 지 20분」으로 갈라 적습니다 -- 물이 드는 중인지 빠지는
    // 중인지가 그 한 낱말에 달려 있습니다.
    const timing =
      applied.minutes >= 0
        ? t("{kind} {minutes}분 전", { kind, minutes: applied.minutes })
        : t("{kind} 지난 지 {minutes}분", { kind, minutes: -applied.minutes });
    // 물때로 바다를 미뤘어도 대신 올릴 활동이 없으면 서버는 그대로 바다를
    // 고릅니다(강등은 제외가 아닙니다). 그때 「바다 대신」이라고 쓰면 바로
    // 위에서 수영을 권해 놓고 아래에서 말리는 꼴이 됩니다. 고른 것이 무엇인지
    // 보고 문장을 가릅니다.
    const stillSea =
      choice !== null && choice !== undefined && SEA.includes(choice.activity);
    return {
      code: applied.code,
      text: stillSea
        ? t("지금은 {timing}이에요. 물때를 보고 시간을 고르세요. {disclaimer}", { timing, disclaimer: t(TIDE_DISCLAIMER) })
        : t("지금은 {timing} — 바다 대신 가까운 곳을 권해요. {disclaimer}", { timing, disclaimer: t(TIDE_DISCLAIMER) }),
    };
  }
  if (tide.phase === "rising" || tide.phase === "falling")
    return {
      code: `tide_${tide.phase}`,
      text: t(tide.phase === "rising" ? "물이 드는 중이에요. {disclaimer}" : "물이 빠지는 중이에요. {disclaimer}", { disclaimer: t(TIDE_DISCLAIMER) }),
    };
  return null;
}

export interface AlternativeGroup {
  kind: RecommendationAlternative["kind"];
  label: string;
  places: RecommendationAlternative[];
}

/** 대신 갈 곳. 서버가 등록된 장소에서 고른 행만 옵니다 -- 없으면 빈 배열이고,
 *  그럴듯한 이름을 지어내지 않습니다. */
export function alternativeGroups(rec?: Recommendation): AlternativeGroup[] {
  const groups = new Map<string, AlternativeGroup>();
  for (const place of rec?.alternatives ?? []) {
    const group = groups.get(place.kind) ?? {
      kind: place.kind,
      label: t(ALTERNATIVE_LABEL[place.kind]),
      places: [],
    };
    group.places.push(place);
    groups.set(place.kind, group);
  }
  return [...groups.values()];
}

/** 대안 한 곳의 표기. 거리는 서버가 준 값만 씁니다. */
export function alternativeText(place: RecommendationAlternative) {
  const distance =
    typeof place.distance_km === "number" ? ` · ${place.distance_km.toFixed(1)}km` : "";
  const score =
    place.best_activity && typeof place.score === "number"
      ? t(" · {activity} {score}점", { activity: t(activities[place.best_activity]), score: place.score })
      : "";
  return `${place.name}${distance}${score}`;
}
