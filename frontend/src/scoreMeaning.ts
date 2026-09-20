import { t } from "./i18n.ts";
// 서버가 내려준 점수를 「무엇의 · 얼마나 · 왜 · 그래서 뭘」로 읽어 주는 계층.
//
// 이 파일은 고르기만 하고 계산하지 않습니다. 점수를 다시 매기거나, 결측을
// 0 으로 메우거나, 항목 점수를 평균 내어 총점을 흉내 내지 않습니다 -- 그건
// 백엔드(activity_score.py)의 몫이고, 화면이 따로 셈하면 두 숫자가 갈립니다.
// 여기서 하는 일은 이미 온 components 중 어느 것을 문장으로 올릴지 고르는 것뿐입니다.

// 값을 실제로 가져오는 import 는 확장자를 붙입니다. tests/*.test.mjs 는
// 번들러 없이 node 가 이 .ts 를 그대로 읽으므로, 확장자가 없으면 해석하지
// 못합니다(타입만 가져오는 import 는 지워지므로 상관없습니다).
import { activities, type Activity } from "./aiApi.ts";
import { grades } from "./groupAGrade.ts";
import {
  SCORE_REASONS,
  formatValue,
  type ConditionScore,
  type Conditions,
} from "./productData.ts";

type Component = ConditionScore["components"][number];

/** 「이 이상이면 아쉬울 것 없다」의 경계. 등급표의 «매우 좋음» 하한과 같은 값을
 *  써서, 문장이 말하는 기준과 게이지가 보여 주는 눈금이 어긋나지 않게 합니다. */
const COMFORTABLE = grades.find((grade) => grade.key === "excellent")!.min;

/** 무엇의 점수인지. 「퐁당 72」는 무슨 점수인지 말해 주지 않으므로 활동명을
 *  항상 붙입니다. */
export function scoreTitle(activity: Activity) {
  return t("{activity} 적합도", { activity: t(activities[activity]) });
}

// 활동 동사와 등급 꼬리를 나누어 조합합니다. 6활동 × 5등급 = 30 문장을 그대로
// 적어 두면 활동이 하나 늘 때마다 다섯 줄을 빠뜨리기 쉽습니다.
const ACTIVITY_VERB: Record<Activity, string> = {
  swim: "수영하기",
  surf: "서핑하기",
  relax: "쉬기",
  mudflat: "갯벌에 나가기",
  onsen: "온천하기",
  rafting: "래프팅하기",
};
// 동사가 모두 「-기」로 끝나므로 꼬리를 공백 없이 바로 이어 붙입니다.
// 「수영하기에 좋은」 · 「갯벌에 나가기에는 권하지 않는」처럼 어느 활동에
// 붙여도 말이 됩니다.
const GRADE_TAIL: Record<string, string> = {
  excellent: "{activity}에 아주 좋은 조건이에요",
  good: "{activity}에 좋은 조건이에요",
  fair: "{activity}에 무난한 조건이에요",
  caution: "{activity}에는 아쉬운 조건이에요",
  poor: "{activity}에는 권하지 않는 조건이에요",
};

/** 등급을 행동으로 옮긴 한 줄. 「양호」는 상태어일 뿐이라 가도 되는지가 읽히지
 *  않습니다. 값이 없으면(`unscored`) 문장을 지어내지 않고 null 을 돌려줍니다 --
 *  모르는 것을 「괜찮다」로 바꾸지 않기 위해서입니다. */
export function verdictOf(activity: Activity, gradeKey: string) {
  const tail = GRADE_TAIL[gradeKey];
  return tail ? t(tail, { activity: t(ACTIVITY_VERB[activity]) }) : null;
}

export interface ScoreFactor {
  metric: string;
  label: string;
  valueText: string;
  score: number;
  /** 화면에 그대로 올리는 한 줄. */
  text: string;
}

/** 실제로 점수가 매겨진 항목만 문장 후보입니다. 미평가 항목을 후보에 넣으면
 *  「근거가 없다」가 「조건이 나쁘다」로 둔갑합니다. */
function scored(data?: Conditions): Component[] {
  return (data?.condition_score?.components ?? []).filter(
    (item) =>
      item.status === "evaluated" &&
      typeof item.score === "number" &&
      Number.isFinite(item.score),
  );
}

// 조사(가/이)는 붙이지 않습니다. 값이 «1.4m» · «8m/s» 처럼 기호로 끝나 받침을
// 판정할 수 없어, 어느 쪽을 골라도 절반은 틀립니다.
function factor(item: Component, text: (label: string, value: string) => string): ScoreFactor {
  const valueText = formatValue(item.value, item.unit);
  return {
    metric: item.metric,
    label: t(item.label),
    valueText,
    score: item.score as number,
    text: text(t(item.label), valueText),
  };
}

/** 점수를 가장 많이 깎은 항목. 동점이면 서버가 준 순서를 따릅니다(구성 순서가
 *  곧 활동의 주요 조건 순서입니다). 모든 항목이 이미 충분히 좋으면 null --
 *  이때는 깎인 데가 없으므로 `strongFactor` 로 무엇이 좋은지를 대신 말합니다. */
export function limitingFactor(data?: Conditions): ScoreFactor | null {
  const items = scored(data);
  if (!items.length) return null;
  const worst = items.reduce((low, item) =>
    (item.score as number) < (low.score as number) ? item : low,
  );
  if ((worst.score as number) >= COMFORTABLE) return null;
  return factor(worst, (label, value) => t("{label} {value} — 이 조건이 점수를 가장 많이 낮췄어요", { label, value }));
}

/** 가장 점수가 높은 항목. 동점이면 서버가 준 순서를 따릅니다. */
export function strongFactor(data?: Conditions): ScoreFactor | null {
  const items = scored(data);
  if (!items.length) return null;
  const best = items.reduce((high, item) =>
    (item.score as number) > (high.score as number) ? item : high,
  );
  return factor(best, (label, value) => t("{label} {value} — 오늘 가장 좋은 조건이에요", { label, value }));
}

/** 히어로에 올릴 한 줄. 깎은 요인이 있으면 그것을, 없으면 강점을, 둘 다 없으면
 *  「근거가 없다」를 말합니다. 셋 다 서로 다른 사실이라 한 문장으로 합치지
 *  않습니다. */
export function scoreReason(data?: Conditions): ScoreFactor | { text: string } {
  return (
    limitingFactor(data) ??
    strongFactor(data) ?? { text: t("근거가 부족해 점수를 내지 못했어요") }
  );
}

export interface ComponentBar {
  metric: string;
  label: string;
  valueText: string;
  score: number | null;
  status: string;
  evaluated: boolean;
  /** 미평가 사유의 한국어 표기. 없으면 빈 문자열입니다. */
  reasons: string;
}

/** 점수를 이루는 항목 전부. 점수가 없는 항목도 빼지 않고 사유를 달아 넘깁니다 --
 *  빠진 칸을 지워 버리면 화면이 「이게 전부」라고 거짓말을 합니다. */
export function componentBars(data?: Conditions): ComponentBar[] {
  return (data?.condition_score?.components ?? []).map((item) => {
    const evaluated =
      item.status === "evaluated" &&
      typeof item.score === "number" &&
      Number.isFinite(item.score);
    return {
      metric: item.metric,
      label: t(item.label),
      valueText: formatValue(item.value, item.unit),
      score: evaluated ? (item.score as number) : null,
      status: item.status,
      evaluated,
      reasons: item.reason_codes
        .map((reason) => t(SCORE_REASONS[reason] ?? reason))
        .join(" · "),
    };
  });
}
