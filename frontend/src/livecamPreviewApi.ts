import { t } from "./i18n.ts";
export type PreviewPlace = { id: number; name: string; place_kind: 'beach' | 'valley'; address: string | null; region: string | null; lat: number | null; lng: number | null };
export type PreviewCamera = {
  provider_camera_id: string; title: string; country_code: string | null;
  region: string | null; city: string | null; provider_status: string;
  categories: string[];
  provider_updated_at: string | null; public_page: string | null;
  live_player: string | null; timelapse_player: string | null;
  timelapse_period: string | null; photo_available: boolean;
  distance_km: number | null; relationship: 'nearby' | 'unknown'; playback_verified: false;
  nearby_place: { id: number; name: string; place_kind: 'beach' | 'valley'; distance_km: number } | null;
};
export type PreviewResult = {
  contract_version: 'livecams.preview.v1'; scope: 'korea_list' | 'place';
  place: PreviewPlace | null; rows: PreviewCamera[]; total: number;
  truncated: boolean; radius_km: number | null;
  fetched_at: string; valid_until: string; cached: boolean;
  page: number; page_size: number; has_more: boolean; category: string | null;
  matched_total: number; matching_status: 'available' | 'unavailable' | 'not_requested';
  ordering?: 'random' | null; shuffle_seed?: number | null;
};
export const webcamCategories = { beach: '해변', coast: '해안', port: '항구', lake: '호수', river: '하천' } as const;
export type WebcamCategory = keyof typeof webcamCategories;
export function cameraCategories(values: string[]) {
  const labels: Record<string, string> = { ...webcamCategories, landscape: '풍경', city: '도시', traffic: '교통', island: '섬', mountain: '산', building: '건물', meteo: '기상', airport: '공항', forest: '숲', water: '물', sport: '스포츠', indoor: '실내', other: '기타', pool: '수영장' };
  return values.map(value => t(labels[value] ?? value)).join(' · ') || t('미분류');
}
const errors: Record<string, string> = {
  WINDY_NOT_CONFIGURED: '연동 미설정 · 서버에 Windy Webcams API 키가 필요합니다.',
  WINDY_INVALID_KEY_FORMAT: 'Windy API 키 형식이 잘못되었습니다. 서버의 키 설정을 확인해 주세요.',
  WINDY_HTTP_401: 'Windy 인증에 실패했습니다. 서버에 Webcams API 전용 키를 설정했는지 확인해 주세요.',
  WINDY_HTTP_403: 'Windy가 접근을 거절했습니다. 서버의 Webcams API 키 권한을 확인해 주세요.',
  WINDY_HTTP_429: 'Windy 요청 한도에 도달했습니다. 잠시 후 다시 시도해 주세요.',
  WINDY_BACKOFF: '이전 조회 실패 후 재시도를 기다리고 있습니다.',
  WINDY_DAILY_BUDGET: '퐁당 서버에 설정된 오늘의 웹캠 조회 한도를 사용했습니다.',
  WINDY_NETWORK_ERROR: 'Windy 연결에 실패했거나 응답 시간이 초과됐습니다.',
  WINDY_HTTP_500: 'Windy 서버 오류로 웹캠 목록을 불러오지 못했습니다.',
  WINDY_HTTP_502: 'Windy 서버 오류로 웹캠 목록을 불러오지 못했습니다.',
  WINDY_HTTP_503: 'Windy 서비스를 일시적으로 사용할 수 없습니다.',
  WINDY_HTTP_504: 'Windy 서버의 응답 시간이 초과됐습니다.',
  SAME_ORIGIN_REQUIRED: '웹캠 요청 주소를 확인하지 못했습니다. 퐁당 페이지를 새로고침해 주세요.',
  WEBCAM_REQUEST_IN_PROGRESS: '다른 웹캠 조회가 진행 중입니다. 잠시 후 다시 시도해 주세요.',
  WEBCAM_COORDINATES_MISSING: '좌표 없음 · 이 장소의 주변 카메라를 검색할 수 없습니다.',
  WEBCAM_PLACE_NOT_FOUND: '선택한 해수욕장·계곡을 찾을 수 없습니다.',
};
/** Keep structured app copy so an already-visible error follows language changes. */
export class WebcamPreviewError extends Error {
  readonly parts: string[];
  readonly retrySeconds: number;
  constructor(parts: string[], retrySeconds = 0) {
    const count = retrySeconds < 60 ? retrySeconds : Math.ceil(retrySeconds / 60);
    super(parts.join(' ') + (retrySeconds ? ` 약 ${count}${retrySeconds < 60 ? '초' : '분'} 후 다시 조회할 수 있습니다.` : ''));
    this.parts = parts;
    this.retrySeconds = retrySeconds;
  }
  localizedMessage() {
    const seconds = this.retrySeconds;
    const wait = seconds ? t(' 약 {count}{unit} 후 다시 조회할 수 있습니다.', {
      count: seconds < 60 ? seconds : Math.ceil(seconds / 60),
      unit: t(seconds < 60 ? '초' : '분'),
    }) : '';
    return this.parts.map(part => t(part)).join(' ') + wait;
  }
}
function previewFailure(response: Response, payload: unknown): WebcamPreviewError {
  const detail = payload && typeof payload === 'object' && 'detail' in payload && typeof payload.detail === 'string' ? payload.detail : '';
  const cause = detail === 'WINDY_BACKOFF' ? response.headers.get('X-Webcam-Failure-Code') : null;
  const reason = cause && Object.hasOwn(errors, cause) ? [errors[cause], errors.WINDY_BACKOFF] : Object.hasOwn(errors, detail) ? [errors[detail]] : undefined;
  const retry = response.headers.get('Retry-After') ?? '';
  const seconds = /^\d{1,6}$/.test(retry) ? Number(retry) : 0;
  const wait = seconds > 0 && seconds <= 604800 && ['WINDY_BACKOFF', 'WINDY_DAILY_BUDGET', 'WINDY_HTTP_429', 'WEBCAM_REQUEST_IN_PROGRESS'].includes(detail) ? seconds : 0;
  if (reason) return new WebcamPreviewError(reason, wait);
  if (response.status === 401 || response.status === 403 || response.redirected) return new WebcamPreviewError(['로그인 또는 접근 권한을 확인해 주세요. 다시 로그인한 뒤 웹캠 목록을 열어 주세요.']);
  return new WebcamPreviewError(['웹캠 조회에 실패했습니다. 잠시 후 다시 시도해 주세요.']);
}
export async function requestWebcamPreview(base: string, spotId: number | undefined, signal: AbortSignal, fetcher: typeof fetch = fetch): Promise<PreviewResult> {
  return requestPreview(base, spotId === undefined ? {} : { spot_id: spotId }, signal, fetcher);
}
async function requestPreview(base: string, body: object, signal: AbortSignal, fetcher: typeof fetch): Promise<PreviewResult> {
  let response: Response;
  try {
    response = await fetcher(`${base}api/data/livecams/preview`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin', cache: 'no-store', signal,
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error(signal.aborted
      ? '웹캠 조회 시간이 초과됐거나 요청이 취소됐습니다. 잠시 후 다시 불러와 주세요.'
      : '퐁당 웹캠 서버에 연결하지 못했습니다. 인터넷 연결과 로그인 상태를 확인한 뒤 다시 불러와 주세요.');
  }
  const payload = await response.json().catch(() => null);
  if (!response.ok || response.redirected) throw previewFailure(response, payload);
  if (payload?.contract_version !== 'livecams.preview.v1' || !Array.isArray(payload.rows) || payload.rows.length > 50) throw new Error('웹캠 응답 형식을 확인할 수 없습니다.');
  return payload;
}

// StrictMode remounts share one request; leaving a page only ignores its result.
const pendingCatalog = new Map<string, Promise<PreviewResult>>();
export function newWebcamShuffleSeed(previous?: number): number {
  const seed = crypto.getRandomValues(new Uint32Array(1))[0];
  return seed === previous ? (seed + 1) >>> 0 : seed;
}
/** 이 페이지가 쓰는 셔플 시드. **마운트마다 새로 뽑지 않습니다.**
 *
 *  시드는 조회 키의 일부입니다. 컴포넌트가 마운트할 때 뽑으면, 창 폭이 바뀌어
 *  레이아웃이 갈릴 때마다 웹캠 목록을 다시 받고 풍경까지 바뀝니다 -- 사용자가
 *  「다른 풍경 보기」를 누른 적이 없는데 말입니다. 새 시드는 그 버튼만
 *  뽑습니다(newWebcamShuffleSeed). */
let sessionSeed: number | undefined;
export function sessionWebcamShuffleSeed(): number {
  return (sessionSeed ??= newWebcamShuffleSeed());
}
/** 「다른 풍경 보기」. 고른 결과는 이 페이지 전체가 기억하므로, 폭이 바뀌어도
 *  방금 뽑은 풍경이 그대로 남습니다. */
export function shuffleWebcams(): number {
  sessionSeed = newWebcamShuffleSeed(sessionSeed);
  return sessionSeed;
}
/** 아직 유효기간이 남은 목록. **응답이 스스로 말하는 valid_until 까지만**
 *  기억합니다 -- 그 시각이 지나면 타임랩스 링크가 죽으므로 화면이 「다른 풍경
 *  보기」를 요구해야 하고(useWebcamCatalog 의 expired), 그 전까지는 같은 시드로
 *  같은 것을 다시 받을 이유가 없습니다. 화면을 다시 마운트했다는 것은 창 폭이
 *  바뀌었거나 탭을 갔다 왔다는 뜻이지 목록이 낡았다는 뜻이 아닙니다. */
const catalogMemory = new Map<string, PreviewResult>();
export function loadWebcamCatalog(base: string, page: number, category: WebcamCategory | '', shuffleSeed = 0, fetcher: typeof fetch = fetch): Promise<PreviewResult> {
  const key = JSON.stringify([base, page, category, shuffleSeed]);
  const known = catalogMemory.get(key);
  if (known && Date.parse(known.valid_until) > Date.now()) return Promise.resolve(known);
  let pending = pendingCatalog.get(key);
  if (!pending) {
    // Navigating from Home can ask for another shuffle while the five-provider
    // lookup is still running. Queue different catalog requests so this browser
    // does not hit the backend's single-lookup lock; exact requests still share.
    const previous = [...pendingCatalog.values()].at(-1);
    const request = () => requestPreview(base, { page, shuffle_seed: shuffleSeed, ...(category ? { category } : {}) }, AbortSignal.timeout(100000), fetcher);
    pending = (previous ? previous.catch(() => undefined).then(request) : request())
      .then(result => { catalogMemory.set(key, result); return result; })
      .finally(() => { pendingCatalog.delete(key); });
    pendingCatalog.set(key, pending);
  }
  return pending;
}
