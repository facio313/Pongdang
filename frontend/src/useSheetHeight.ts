import { useCallback, useEffect, useRef, useState } from "react";

/** 바텀 시트(MapSheet)가 지도를 덮는 높이를 알려줍니다.
 *
 *  이 값은 지도에 `insets.bottom` 으로 넘어가 핀이 시트 뒤로 숨지 않게 합니다 --
 *  숨은 핀은 고를 수 없습니다.
 *
 *  높이를 상수로 두 벌(CSS 와 계산식) 적지 않습니다. 접힘 높이는
 *  `clamp(150px, 26dvh, 210px)`, 펼침은 `76dvh` 라 베껴 적는 순간 어긋나고,
 *  화면 높이가 바뀌면 또 어긋납니다. **실제로 그려진 높이를 잽니다.**
 *
 *  ref 는 콜백 ref 입니다 -- 훅이 돌려준 객체를 바깥에서 고쳐 쓰지 않도록
 *  여기서 만들어 넘깁니다. */
export function useSheetHeight() {
  const [height, setHeight] = useState(0);
  const observer = useRef<ResizeObserver>(null);
  useEffect(() => () => observer.current?.disconnect(), []);
  const ref = useCallback((element: HTMLElement | null) => {
    observer.current?.disconnect();
    if (!element) {
      observer.current = null;
      setHeight(0);
      return;
    }
    // 접힘 · 펼침 전환(180ms)에도 값이 따라오도록 관찰로 잽니다. 한 번 재고
    // 마는 것으로는 전환 중간 높이에 멈춥니다.
    const next = new ResizeObserver(() =>
      setHeight(Math.round(element.getBoundingClientRect().height)),
    );
    next.observe(element);
    observer.current = next;
    setHeight(Math.round(element.getBoundingClientRect().height));
  }, []);
  return { ref, height };
}
