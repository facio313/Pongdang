import { useEffect, useState } from "react";
import { travelJson } from "./travelApi";
import { queueResourceRead } from "./resourceQueue";

/** 「아직 한 번도 보여준 적 없는 첫 조회」인지.
 *
 *  조회 중을 「자료 없음」(–)으로 그리면 자료가 없다고 거짓말이 되지만, 반대로
 *  **모든** 조회 중을 스켈레톤으로 그리는 것도 틀립니다. 근거가 만료돼 다시
 *  불러오는 동안에는 이미 보여주던 값이 **못 쓰는 값이 됐다는 사실 자체가
 *  결론**이므로, 곧 숫자가 온다는 듯 자리를 잡아 두지 않고 그 자리에서 «–» 로
 *  비웁니다(useConditions 의 만료 처리). 스켈레톤은 아무것도 보여준 적 없는
 *  첫 조회에만 씁니다. */
export function isInitialLoad(state: {
  loading: boolean;
  previousData?: unknown;
}) {
  return state.loading && state.previousData === undefined;
}

/** 조회할 경로. **없음에는 두 가지 뜻이 있고, 둘은 다른 사실입니다.**
 *
 *  - `undefined` — **대상을 아직 모름.** 기본 해수욕장을 조회하는 중이라 장소
 *    id 가 없는 동안이 여기입니다. 곧 경로가 정해지므로 「조회 중」입니다.
 *  - `null` — **해당 없음.** 관측이 막히지 않아 예보로 물러설 필요가 없거나
 *    (useConditions), 대상 시각이 31일 범위 밖이라 애초에 묻지 않는 경우
 *    (MyCoursesPage)입니다. 조회가 끝난 것과 같아 「없음」입니다.
 *
 *  둘을 한 값으로 두면 첫 페인트에서 **아직 묻지도 않은 것을 「자료 없음」으로
 *  그립니다** -- 홈이 「오늘 점수를 낼 수 있는 활동이 없어요」를 먼저 보여 주고
 *  장소가 도착한 뒤에야 스켈레톤을 띄우던 순서가 그것이었습니다. */
export type ResourcePath = string | null | undefined;

export function useResource<T>(path: ResourcePath, revision = 0) {
  const origin = "data";
  const key = `${origin}:${path}:${revision}`;
  const [result, setResult] = useState<{
    key: string;
    data?: T;
    error?: string;
  }>();
  useEffect(() => {
    if (path == null) return;
    const controller = new AbortController();
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(20000)]);
    async function load() {
      try {
        const payload = await queueResourceRead(signal, () => travelJson<T>(
          import.meta.env.BASE_URL, path!, "GET", undefined, signal,
        ));
        if (!controller.signal.aborted) setResult({ key, data: payload });
      } catch (error) {
        if (!controller.signal.aborted)
          setResult({
            key,
            error:
              signal.aborted ? "자료 조회 시간이 초과됐습니다. 잠시 후 새로고침해 주세요." : error instanceof Error
                ? error.message
                : "데이터를 불러오지 못했습니다.",
          });
      }
    }
    void load();
    return () => controller.abort();
  }, [path, key, origin]);
  return path === undefined
    ? // 대상 미정. 요청은 나가지 않지만 화면에는 「조회 중」입니다.
      { loading: true, data: undefined, previousData: undefined, error: undefined }
    : path === null
    ? { loading: false, data: undefined, previousData: undefined, error: undefined }
    : result?.key === key
    ? { ...result, previousData: result.data, loading: false }
    : {
        loading: true,
        data: undefined,
        previousData: result?.data,
        error: undefined,
      };
}
