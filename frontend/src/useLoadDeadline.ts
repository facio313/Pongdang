import { useEffect, useState } from "react";

/** 첫 조회가 이 시간을 넘기면 기다리기를 멈춥니다.
 *
 *  `useResource` 의 요청 타임아웃은 20초입니다. 그 값은 **느린 응답을 끝까지
 *  기다려 주려는** 것이고, 거기에는 이유가 있습니다 -- 조건 조회는 여러 활동과
 *  관측소를 함께 읽습니다.
 *
 *  문제는 첫 화면입니다. 20초 동안 홈 전체가 스켈레톤이면, 보는 사람에게는
 *  고장난 화면과 구별되지 않습니다. 기다리라는 표시를 20초 보여 주는 것은
 *  기다릴지 말지를 그 사람이 정하게 하지 않는 것입니다.
 *
 *  그래서 5초가 지나면 **기다림을 멈추고 실패로 넘깁니다.** 요청은 그대로
 *  진행되고(끝나면 값이 들어옵니다) 화면만 「불러오지 못했어요 · 다시 시도」로
 *  바뀝니다. **거짓 성공으로 바꾸지 않습니다** -- 0점이나 「안전」으로 메우는
 *  것과 다릅니다. */
export const FIRST_LOAD_DEADLINE_MS = 5000;

/** `loading` 이 5초를 넘겼는가. 넘긴 뒤 값이 도착하면 false 로 돌아갑니다. */
export function useLoadDeadline(
  loading: boolean,
  deadline = FIRST_LOAD_DEADLINE_MS,
): boolean {
  const [state, setState] = useState({ loading, expired: false });
  // 조회 상태가 바뀌면 렌더 중에 되돌립니다. 「인자가 바뀔 때 상태 조정」은
  // React 가 권하는 꼴이고, effect 안에서 되돌리면 한 프레임 늦어 값이 도착한
  // 뒤에도 실패 화면이 한 번 더 깜빡입니다.
  if (state.loading !== loading) setState({ loading, expired: false });
  useEffect(() => {
    if (!loading) return;
    const timer = setTimeout(
      () => setState((current) => (current.loading ? { ...current, expired: true } : current)),
      deadline,
    );
    return () => clearTimeout(timer);
  }, [loading, deadline]);
  return loading && state.loading && state.expired;
}
