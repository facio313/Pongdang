import { useEffect, useState, useSyncExternalStore } from "react";
import { travelJson } from "./travelApi";
import { queueResourceRead } from "./resourceQueue";
import { useI18n } from "./i18n";
import { RESOURCE_REFRESH_INTERVAL, resourceRefreshInterval, resourceRefreshGeneration, subscribeResourceRefresh } from "./resourceRefresh";
import { retainConditionData, retainsDisplayData } from "./retainConditionData";

/** Skeletons are for the first read; later reads keep the displayed result. */
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

/** 성공한 응답만 담는 조회 기억.
 *
 *  이 앱은 **같은 라우트에서 폭(1080px)으로 컴포넌트를 통째로 갈아 끼우고**
 *  (useIsDesktop), 해시가 바뀌면 화면 전체를 다시 마운트합니다(App.tsx 의
 *  `key`). 조회 결과가 컴포넌트 안에만 있으면 창을 조금 넓혔다는 이유로
 *  기본 해수욕장 · 추천 · 수질 · 명소 · 웹캠이 전부 다시 나갔습니다 -- 화면이
 *  말하는 사실은 그대로인데 네트워크만 다시 때린 것입니다.
 *
 *  기억하는 것은 **성공한 응답뿐**입니다. 실패는 다시 물어볼 수 있어야 하므로
 *  남기지 않습니다. 조건 자료는 갱신 실패·근거 부족에도 마지막 결과를
 *  기준 시각과 함께 보존합니다. */
interface CacheEntry {
  data: unknown;
  generation: number;
  refreshError?: string;
  /** 응답을 받은 시각. TTL 이 지나면 화면은 그대로 둔 채 조용히 다시 읽습니다. */
  at: number;
}

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<{ data?: unknown; error?: string }>>();
/** 이 시간이 지나면 같은 키라도 한 번 더 읽습니다. 폭 전환 · 탭 왕복은 이보다
 *  훨씬 짧아 요청이 나가지 않고, 오래 열어 둔 탭으로 돌아오면 갱신됩니다. */
const CACHE_TTL = RESOURCE_REFRESH_INTERVAL;
/** 기억은 무한정 쌓이지 않습니다. 오래 안 쓴 것부터 버립니다.
 *
 *  지도 한 화면이 장소 목록 · 사진 · 조건 요약 · 고른 지점 조건을 한꺼번에
 *  읽습니다. 50 이면 그 한 화면이 기억을 통째로 밀어내, 다시 들어올 때마다
 *  전부 새로 물었습니다. */
const CACHE_MAX = 80;

/** 같은 경로를 보고 있는 구독자들. 쓰기가 끝난 뒤 옛 기억을 지우고 다시
 *  읽게 하려면, 기억을 지우는 것만으로는 모자랍니다 -- 이미 마운트된 구독자는
 *  deps 가 그대로라 effect 가 다시 돌지 않습니다. 그래서 경로별로 구독자를
 *  들고 있다가 깨웁니다. */
const watchers = new Map<string, Set<() => void>>();

function watch(path: string, notify: () => void) {
  const set = watchers.get(path) ?? new Set();
  set.add(notify);
  watchers.set(path, set);
  return () => {
    set.delete(notify);
    if (set.size === 0) watchers.delete(path);
  };
}

/** 이 경로의 기억을 버리고, 보고 있는 화면에 다시 읽게 합니다.
 *
 *  기억은 CACHE_TTL 동안 살아 있습니다. 그 시간은 **아무도 고치지 않았을 때**
 *  같은 사실을 다시 묻지 않기 위한 것이지, 방금 내가 고친 것을 옛 값으로
 *  보여주기 위한 것이 아닙니다. 쓰기가 성공한 쪽에서 이걸 불러 주세요
 *  (useTastePreference.savePreference). */
export function forgetResource(path: string) {
  for (const key of [...cache.keys()])
    if (key.startsWith(`data:${path}:`)) cache.delete(key);
  for (const notify of watchers.get(path) ?? []) notify();
}

function remember(key: string, data: unknown, generation: number, refreshError?: string) {
  cache.delete(key);
  cache.set(key, { data, at: Date.now(), generation, refreshError });
  while (cache.size > CACHE_MAX) {
    const oldest = cache.keys().next();
    if (oldest.done) break;
    cache.delete(oldest.value);
  }
}

/** 같은 키를 동시에 물으면 요청은 하나입니다. 그리고 이 요청은 **구독자가
 *  사라져도 취소되지 않습니다** -- 예전에는 폭 전환 중에 진행 중이던 요청이
 *  `controller.abort()` 로 죽고, 새 레이아웃이 같은 것을 처음부터 다시
 *  물었습니다. */
function readResource(key: string, resourceKey: string, path: string, generation: number) {
  const shared = inflight.get(key);
  if (shared) return shared;
  const signal = AbortSignal.timeout(20000);
  const pending = (async () => {
    try {
      const incoming = await queueResourceRead(signal, () =>
        travelJson<unknown>(import.meta.env.BASE_URL, path, "GET", undefined, signal),
      );
      const data = retainConditionData(path, cache.get(resourceKey)?.data, incoming);
      // A read started before a manual refresh cannot repopulate its new cache.
      if (generation === resourceRefreshGeneration()) remember(resourceKey, data, generation);
      return { data };
    } catch (error) {
      const message = signal.aborted
          ? "자료 조회 시간이 초과됐습니다. 잠시 후 새로고침해 주세요."
          : error instanceof Error
            ? error.message
            : "데이터를 불러오지 못했습니다.";
      const previous = cache.get(resourceKey)?.data;
      if (previous !== undefined && retainsDisplayData(path)) {
        const data = retainConditionData(path, previous, undefined);
        if (generation === resourceRefreshGeneration()) remember(resourceKey, data, generation, message);
        return { data, refreshError: message };
      }
      return { error: message };
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, pending);
  return pending;
}

export function useResource<T>(path: ResourcePath, revision = 0) {
  const { t } = useI18n();
  const origin = "data";
  const generation = useSyncExternalStore(subscribeResourceRefresh, resourceRefreshGeneration, resourceRefreshGeneration);
  const resourceKey = `${origin}:${path}:${revision}`;
  const key = `${resourceKey}:${generation}`;
  const [result, setResult] = useState<{
    key: string;
    resourceKey: string;
    data?: T;
    error?: string;
    refreshError?: string;
  }>();
  // 무효화 횟수. forgetResource 가 이 값을 올리면 아래 effect 가 다시 돕니다.
  const [stamp, setStamp] = useState(0);
  useEffect(() => {
    if (path == null) return;
    return watch(path, () => setStamp((current) => current + 1));
  }, [path]);
  useEffect(() => {
    if (path == null) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = async () => {
      const entry = cache.get(resourceKey);
      const next = entry && entry.generation === generation && Date.now() - entry.at < resourceRefreshInterval(entry.data, entry.at)
        ? await Promise.resolve({ data: entry.data, error: undefined, refreshError: entry.refreshError })
        : await readResource(key, resourceKey, path, generation);
      if (!alive) return;
      setResult({ key, resourceKey, ...(next as { data?: T; error?: string }) });
      const refreshed = cache.get(resourceKey);
      timer = setTimeout(() => { void refresh(); }, !next.error && refreshed
        ? Math.max(1, resourceRefreshInterval(refreshed.data, refreshed.at) - (Date.now() - refreshed.at))
        : CACHE_TTL);
    };
    void refresh();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [path, key, resourceKey, generation, stamp]);
  // 기억에 있는 값은 **첫 프레임부터** 보여줍니다. 리마운트했다는 것은 화면을
  // 다시 그렸다는 뜻이지 사실을 잊었다는 뜻이 아닙니다.
  const hit =
    result?.key === key
      ? result
      : cache.has(resourceKey)
        ? { key, data: cache.get(resourceKey)!.data as T, error: undefined, refreshError: cache.get(resourceKey)!.refreshError }
        // A manual refresh keeps the same screen and current selection visible.
        // A different path/revision must not borrow another query's result.
        : result?.resourceKey === resourceKey ? result : undefined;
  return path === undefined
    ? // 대상 미정. 요청은 나가지 않지만 화면에는 「조회 중」입니다.
      { loading: true, data: undefined, previousData: undefined, error: undefined }
    : path === null
    ? { loading: false, data: undefined, previousData: undefined, error: undefined }
    : hit
    ? { ...hit, error: hit.error ? t(hit.error) : undefined, previousData: hit.data, loading: false }
    : {
        loading: true,
        data: undefined,
        previousData: result?.data,
        error: undefined,
      };
}
