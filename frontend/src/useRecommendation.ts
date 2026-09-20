import { useEffect, useState } from "react";
import { recommendationPath, type Recommendation } from "./recommendationApi";
import { useResource } from "./useResource";

/** 오늘 이 장소에서 무엇을 할지와 그 근거.
 *
 *  활동 선택은 서버(`water-index/recommendation`)가 합니다. 화면이 다섯 활동
 *  점수를 받아 스스로 `max` 를 고르던 자리를 대신합니다 -- 같은 판단을 두
 *  곳에서 하면 근거 문장과 고른 활동이 갈립니다.
 *
 *  조회 중과 「고를 것이 없음」은 다른 사실입니다. `data` 가 와도 `choice` 는
 *  null 일 수 있고, 그때 화면은 «–» 로 두어야 합니다. */
export function useRecommendation(id?: number, at?: string) {
  const [revision, setRevision] = useState(() => Date.now());
  const state = useResource<Recommendation>(recommendationPath(id, at), revision);
  useEffect(() => {
    if (!id || at) return;
    // 조건 응답과 같은 5분 주기로 다시 읽습니다. 만료 시각은 추천 응답에
    // 실리지 않으므로(점수는 활동마다 다른 근거를 씁니다) 주기만 맞춥니다.
    const timer = window.setTimeout(() => setRevision(Date.now()), 300000);
    return () => window.clearTimeout(timer);
  }, [id, at, revision]);
  return state;
}
