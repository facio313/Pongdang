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
  matched_total: number; matching_status: 'available' | 'unavailable';
};
export const webcamCategories = { beach: '해변', coast: '해안', port: '항구', lake: '호수', river: '하천' } as const;
export type WebcamCategory = keyof typeof webcamCategories;
export function cameraCategories(values: string[]) {
  const labels: Record<string, string> = { ...webcamCategories, landscape: '풍경', city: '도시', traffic: '교통', island: '섬', mountain: '산', building: '건물', meteo: '기상', airport: '공항', forest: '숲', water: '물', sport: '스포츠', indoor: '실내', other: '기타', pool: '수영장' };
  return values.map(value => labels[value] ?? value).join(' · ') || '미분류';
}
const errors: Record<string, string> = {
  WINDY_NOT_CONFIGURED: '연동 미설정 · 서버에 Windy API 키가 필요합니다.',
  WINDY_HTTP_401: 'Windy 인증에 실패했습니다. 서버의 API 키를 확인해 주세요.',
  WINDY_HTTP_403: 'Windy가 접근을 거절했습니다. 서버 키의 권한을 확인해 주세요.',
  WINDY_HTTP_429: 'Windy 요청 한도에 도달했습니다. 잠시 후 다시 시도해 주세요.',
  WINDY_BACKOFF: '이전 조회 실패 후 재시도를 기다리고 있습니다.',
  WINDY_DAILY_BUDGET: '오늘의 구현 확인용 API 요청 한도에 도달했습니다.',
  WINDY_NETWORK_ERROR: 'Windy 연결에 실패했거나 응답 시간이 초과됐습니다.',
  WEBCAM_REQUEST_IN_PROGRESS: '다른 웹캠 조회가 진행 중입니다. 잠시 후 다시 시도해 주세요.',
  WEBCAM_COORDINATES_MISSING: '좌표 없음 · 이 장소의 주변 카메라를 검색할 수 없습니다.',
  WEBCAM_PLACE_NOT_FOUND: '선택한 해수욕장·계곡을 찾을 수 없습니다.',
};
export async function requestWebcamPreview(base: string, spotId: number | undefined, signal: AbortSignal, fetcher: typeof fetch = fetch): Promise<PreviewResult> {
  return requestPreview(base, spotId === undefined ? {} : { spot_id: spotId }, signal, fetcher);
}
async function requestPreview(base: string, body: object, signal: AbortSignal, fetcher: typeof fetch): Promise<PreviewResult> {
  const response = await fetcher(`${base}api/data/livecams/preview`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin', cache: 'no-store', signal,
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(errors[payload?.detail] ?? '웹캠 조회에 실패했습니다. 잠시 후 다시 시도해 주세요.');
  if (payload?.contract_version !== 'livecams.preview.v1' || !Array.isArray(payload.rows) || payload.rows.length > 50) throw new Error('웹캠 응답 형식을 확인할 수 없습니다.');
  return payload;
}

// StrictMode remounts share one request; leaving a page only ignores its result.
const pendingCatalog = new Map<string, Promise<PreviewResult>>();
export function loadWebcamCatalog(base: string, page: number, category: WebcamCategory | '', fetcher: typeof fetch = fetch): Promise<PreviewResult> {
  const key = JSON.stringify([base, page, category]);
  let pending = pendingCatalog.get(key);
  if (!pending) {
    pending = requestPreview(base, { page, ...(category ? { category } : {}) }, AbortSignal.timeout(100000), fetcher)
      .finally(() => { pendingCatalog.delete(key); });
    pendingCatalog.set(key, pending);
  }
  return pending;
}
