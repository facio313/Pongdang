import { useEffect, useMemo, useState } from "react";
import type { Activity } from "./aiApi";
import {
  conditionSummaryPath,
  summariesExpiry,
  SUMMARY_BATCH_MAX,
  type ConditionSummaries,
  type ConditionSummary,
} from "./productData";
import { REFRESH_MAX, REFRESH_MIN } from "./useConditions";
import { useResource } from "./useResource";

/** 한 번에 물을 수 있는 묶음 수. 25 × 4 = 100 으로, 서버가 한 번에 내려주는
 *  장소 수와 맞춥니다. 훅은 조건부로 부를 수 없어 **고정된 슬롯**을 두고,
 *  쓰지 않는 슬롯에는 null 을 넘깁니다(useResource 의 「해당 없음」). */
const SUMMARY_CHUNKS = 4;

/** 목록 한 화면분의 조건 요약. **줄마다 부르지 않습니다.**
 *
 *  예전에는 데스크탑 지도의 지점 줄이 저마다 useConditions 를 불렀습니다.
 *  지도에 들어가는 것만으로 조건 조회가 100건 나갔고, 서버의 연결 슬롯은 네
 *  개뿐이라 그 요청들이 서로를 굶겼습니다. 화면에 달린 배지는 그동안 「고른
 *  지점만 점수를 조회합니다」라고 적혀 있었습니다 -- 핀만 그 약속을 지켰고
 *  목록은 어기고 있었습니다.
 *
 *  usePlacePhotos 와 같은 원칙입니다: 보여 주는 한 묶음당 한 요청, 카드마다
 *  한 요청은 절대 아님. */
export function useConditionSummaries(
  ids: number[],
  activity: Activity = "swim",
) {
  // 경로를 먼저 만들고 그 **문자열**을 의존성으로 씁니다. ids 배열은 렌더마다
  // 새 참조라 그대로 쓰면 메모가 서지 않습니다.
  const key = ids.join(",");
  const paths = useMemo(() => {
    const selected = [...new Set(key ? key.split(",").map(Number) : [])]
      .filter((id) => Number.isSafeInteger(id) && id > 0)
      .sort((left, right) => left - right)
      .slice(0, SUMMARY_BATCH_MAX * SUMMARY_CHUNKS);
    return Array.from({ length: SUMMARY_CHUNKS }, (_, index) =>
      conditionSummaryPath(
        selected.slice(index * SUMMARY_BATCH_MAX, (index + 1) * SUMMARY_BATCH_MAX),
        activity,
      ),
    );
  }, [key, activity]);

  const [revision, setRevision] = useState(0);
  // 슬롯 수는 상수이므로 훅 호출 순서가 흔들리지 않습니다. SUMMARY_CHUNKS 를
  // 바꾸면 이 줄도 함께 바꿔야 합니다 -- 훅은 반복문으로 부를 수 없습니다.
  const a = useResource<ConditionSummaries>(paths[0], revision);
  const b = useResource<ConditionSummaries>(paths[1], revision);
  const c = useResource<ConditionSummaries>(paths[2], revision);
  const d = useResource<ConditionSummaries>(paths[3], revision);
  const chunks = [a, b, c, d];
  // useResource 는 렌더마다 새 객체를 돌려주므로 **담긴 자료**를 의존성으로
  // 씁니다. 객체를 그대로 쓰면 아래 메모가 매 렌더 깨집니다.
  const [dataA, dataB, dataC, dataD] = [a.data, b.data, c.data, d.data];

  const rows = useMemo(
    () =>
      [dataA, dataB, dataC, dataD].flatMap((chunk) => chunk?.rows ?? []),
    [dataA, dataB, dataC, dataD],
  );
  const expiresAt = summariesExpiry(rows);

  useEffect(() => {
    if (!rows.length) return;
    // useConditions 와 **같은 하한**을 씁니다. 하한이 없으면 이미 만료된
    // 근거를 서버가 그대로 내려주는 상황에서 왕복 속도로 무한 재조회합니다.
    const delay =
      expiresAt === undefined
        ? REFRESH_MAX
        : Math.min(REFRESH_MAX, expiresAt - Date.now());
    const timer = window.setTimeout(
      () => setRevision(Date.now()),
      Math.max(REFRESH_MIN, delay),
    );
    return () => window.clearTimeout(timer);
  }, [rows.length, expiresAt, revision]);

  const byId = useMemo(() => {
    const map = new Map<number, ConditionSummary>();
    for (const row of rows) map.set(row.spot_id, row);
    return map;
  }, [rows]);
  const unavailable = useMemo(
    () =>
      new Map(
        [dataA, dataB, dataC, dataD].flatMap((chunk) =>
          (chunk?.unavailable ?? []).map(
            (item) => [item.spot_id, item.reason] as const,
          ),
        ),
      ),
    [dataA, dataB, dataC, dataD],
  );

  return {
    byId,
    unavailable,
    /** 아직 아무 묶음도 도착하지 않은 첫 조회인지. 조회 중을 「자료 없음」으로
     *  그리면 거짓말이 되므로, 부르는 쪽이 이걸 보고 스켈레톤을 씁니다. */
    loading: chunks.some((chunk) => chunk.loading) && !rows.length,
    error: chunks.find((chunk) => chunk.error)?.error,
  };
}
