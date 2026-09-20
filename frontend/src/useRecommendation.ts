import { useEffect, useState } from "react";
import { conditionScoreExpiry } from "./productData";
import { recommendationPath, type Recommendation } from "./recommendationApi";
import { useResource } from "./useResource";

/** 추천이 판단에 쓴 조건 응답 중 화면이 점수를 보여 주는 하나. 만료를 그
 *  응답의 근거 유효기간으로 재기 위해 고릅니다. */
export function shownConditions(data?: Recommendation) {
  if (!data) return undefined;
  return (
    data.conditions.find((item) => item.activity === data.choice?.activity) ??
    data.conditions[0]
  );
}

/** 오늘 이 장소에서 할 활동과 그 근거.
 *
 *  활동 선택은 서버(`water-index/recommendation`)가 합니다. 화면이 다섯 활동
 *  점수를 받아 스스로 `max` 를 고르던 자리를 대신합니다 -- 같은 판단을 두
 *  곳에서 하면 근거 문장과 고른 활동이 갈립니다.
 *
 *  응답에는 판단에 쓴 활동별 조건 응답이 함께 옵니다. 그래서 이 훅 하나로
 *  끝나며, 화면이 같은 자료를 다시 다섯 번 조회하지 않습니다.
 *
 *  조회 중과 「고를 것이 없음」은 다른 사실입니다. `data` 가 와도 `choice` 는
 *  null 일 수 있고, 그때 화면은 «–» 로 두어야 합니다. */
export function useRecommendation(id?: number, at?: string, enabled = true) {
  // 0 으로 시작합니다. 마운트 시각을 넣으면 그것이 조회 키가 되어, 폭이 바뀌어
  // 레이아웃이 갈릴 때마다 같은 추천을 처음부터 다시 물었습니다(useResource 의
  // 조회 기억 주석). 아래 만료 비교는 「마지막 재조회보다 먼저 만료됐는가」라
  // 0 에서는 자연히 거짓이고, 타이머가 넣는 Date.now() 의 뜻도 그대로입니다.
  const [revision, setRevision] = useState(0);
  // enabled: false 는 「이 조회를 하지 않는다」입니다. 장소 미정(id 없음)과
  // 달라 「조회 중」으로 읽히지 않습니다(useResource 의 ResourcePath 주석).
  const state = useResource<Recommendation>(
    enabled ? recommendationPath(id, at) : null,
    revision,
  );
  // 근거가 만료되면 점수는 못 쓰는 값이 됩니다. 그 시각에 맞춰 다시 읽고,
  // 그 전까지는 5 분마다 확인합니다(useConditions 와 같은 규칙).
  const expiresAt = conditionScoreExpiry(shownConditions(state.data));
  useEffect(() => {
    if (!id || at) return;
    const delay =
      expiresAt === undefined ? 300000 : Math.min(300000, expiresAt - Date.now());
    const timer = window.setTimeout(() => setRevision(Date.now()), Math.max(1, delay));
    return () => window.clearTimeout(timer);
  }, [id, at, expiresAt, revision]);
  // 만료된 값을 화면에 남기지 않습니다. 모르는 것을 지난 값으로 채우는 것과
  // 같기 때문입니다.
  if (!at && expiresAt !== undefined && expiresAt <= revision)
    return { ...state, data: undefined, loading: true };
  return state;
}
