/** 한국어 조사를 받침으로 고릅니다.
 *
 *  화면에는 「수영이(가) 가장 잘 맞습니다」 · 「장소 유형을(를) 골라 주세요」처럼
 *  두 형태를 괄호로 묶은 문장이 남아 있었습니다. 템플릿에 들어오는 낱말이
 *  무엇인지 적는 쪽이 몰라 양쪽을 다 적어 둔 것인데, 읽는 사람에게는 그 괄호가
 *  **빈칸을 못 채운 자리**로 보입니다.
 *
 *  **서식이 아니라 값에 붙입니다.** 번역 사전의 키는 한국어 원문 그대로이고
 *  (`i18n.ts`), 플레이스홀더 집합이 세 언어에서 같아야 하는 계약 테스트가
 *  있습니다(`tests/i18n.test.mjs`). 그래서 템플릿에 조사 플레이스홀더를 새로
 *  만들지 않고, `{activity}` 에 넣는 **값 자체**를 「수영이」로 만들어 넘깁니다.
 *  영어 · 중국어 · 일본어 번역은 조사가 없는 문장이라 값만 그대로 들어갑니다.
 *
 *  판정할 수 없는 낱말에는 **아무것도 붙이지 않습니다**. 측정값은 «1.4m» ·
 *  «8m/s» 처럼 기호로 끝나 받침을 알 수 없고, 어느 쪽을 골라도 절반은 틀립니다
 *  (`recommendationText.ts` 의 `measured` 가 이 원칙으로 조사를 뺍니다).
 */

/** 쓸 수 있는 조사 쌍. 앞이 받침 있는 쪽, 뒤가 받침 없는 쪽입니다. */
const PAIRS = {
  "이/가": ["이", "가"],
  "을/를": ["을", "를"],
  "은/는": ["은", "는"],
  "와/과": ["과", "와"],
  "으로/로": ["으로", "로"],
} as const;

export type JosaKind = keyof typeof PAIRS;

const HANGUL_FIRST = 0xac00;
const HANGUL_LAST = 0xd7a3;
/** 한글 음절은 (초성 × 21 + 중성) × 28 + 종성 으로 배열돼 있습니다. */
const JONGSEONG_COUNT = 28;

/** 숫자로 끝나는 낱말의 받침. 읽는 소리를 따릅니다 -- 「3」은 «삼»이라 받침이
 *  있고, 「2」는 «이»라 없습니다. 해의 수·개수가 문장에 들어오는 자리가 있어
 *  둡니다(예: 「2곳」이 아니라 「2」로 끝나는 경우). */
const DIGIT_HAS_FINAL: Record<string, boolean> = {
  "0": true, // 영
  "1": true, // 일
  "2": false, // 이
  "3": true, // 삼
  "4": false, // 사
  "5": false, // 오
  "6": true, // 육
  "7": true, // 칠
  "8": true, // 팔
  "9": false, // 구
};

/** 받침이 있는가. **모르면 `undefined`** 입니다 -- 없다고 단정하지 않습니다. */
export function hasFinalConsonant(word: string): boolean | undefined {
  const last = [...word.trim()].at(-1);
  if (!last) return undefined;
  const code = last.codePointAt(0)!;
  if (code >= HANGUL_FIRST && code <= HANGUL_LAST) {
    const jongseong = (code - HANGUL_FIRST) % JONGSEONG_COUNT;
    // 「ㄹ」 받침(8)도 받침입니다. 「으로/로」만 ㄹ 을 받침 없는 쪽으로 봅니다
    // (josa 가 그 쌍을 따로 처리합니다).
    return jongseong !== 0;
  }
  if (last in DIGIT_HAS_FINAL) return DIGIT_HAS_FINAL[last];
  // 라틴 문자 · 기호 · 한자 · 가나는 읽는 소리를 알 수 없습니다.
  return undefined;
}

/** 낱말에 맞는 조사. 판정할 수 없으면 **빈 문자열**입니다. */
export function josa(word: string, kind: JosaKind): string {
  const final = hasFinalConsonant(word);
  if (final === undefined) return "";
  const [withFinal, withoutFinal] = PAIRS[kind];
  if (kind === "으로/로" && final) {
    // 「서울로」처럼 ㄹ 받침은 «로» 를 씁니다.
    const code = [...word.trim()].at(-1)!.codePointAt(0)!;
    if (
      code >= HANGUL_FIRST &&
      code <= HANGUL_LAST &&
      (code - HANGUL_FIRST) % JONGSEONG_COUNT === 8
    )
      return withoutFinal;
  }
  return final ? withFinal : withoutFinal;
}

/** 낱말과 조사를 붙인 것. 템플릿의 `{...}` 에 넣을 값입니다.
 *
 *  판정할 수 없는 낱말은 조사 없이 그대로 돌려줍니다 -- 「1.4m이(가)」 대신
 *  「1.4m」 입니다. 문장이 조금 딱딱해지는 것이 틀린 조사보다 낫습니다. */
export function withJosa(word: string, kind: JosaKind): string {
  return `${word}${josa(word, kind)}`;
}
