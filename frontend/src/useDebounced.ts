import { useEffect, useState } from "react";

/** 입력이 멎은 뒤의 값.
 *
 *  검색창은 **보여 주는 값과 조회하는 값이 다릅니다.** 입력 상자는 타자마다
 *  즉시 반응해야 하지만(그러지 않으면 글자가 늦게 찍힙니다), 그 값이 그대로
 *  조회 키가 되면 「경포」 세 글자에 목록 조회가 세 번, 그 목록이 부르는
 *  조건 조회가 그 몇 배로 나갑니다. 화면이 말하는 사실은 마지막 한 번과
 *  같은데 네트워크만 세 배로 때린 것입니다.
 *
 *  마지막 글자 기준으로 `delay` 만큼 기다렸다가 한 번만 넘깁니다. 값이 계속
 *  바뀌는 동안에는 이전 타이머를 버리므로 중간 상태는 조회되지 않습니다. */
export function useDebounced<T>(value: T, delay = 250) {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    if (Object.is(settled, value)) return;
    const timer = window.setTimeout(() => setSettled(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay, settled]);
  return settled;
}
