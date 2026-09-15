export type MediaKind = 'live' | 'timelapse' | 'photo' | 'unknown';
export type PlaybackOption = {
  media_kind: MediaKind; playback_method: 'iframe' | 'external_page'; url: string;
  verified: boolean; checked_at: string | null; valid_until: string | null;
  connection_status: 'reachable' | 'offline' | 'unverifiable';
};
export type WatchCamera = {
  camera_key: string; revision_id: string; provider_camera_id: string; provider: string;
  title: string; spot_id: number; spot_name: string; place_kind: string | null;
  region: string | null; address: string | null; distance_km: number | null;
  relationship: 'confirmed' | 'nearby' | 'unknown'; location_evidence: string | null;
  location_reviewed_at: string | null; location_valid_until: string | null;
  camera_country: string | null; camera_region: string | null; camera_city: string | null;
  camera_description: string | null; categories: string[]; timezone: string | null;
  provider_status: string; provider_updated_at: string | null; fetched_at: string | null;
  checked_at: string | null; valid_until: string | null; provider_live_available: boolean;
  photo_available: boolean; public_page: string | null; options: PlaybackOption[];
  reason_codes: string[];
};
export type SearchState = 'unconfigured' | 'not_searched' | 'coordinates_missing' | 'failed' | 'no_nearby_cameras' | 'found' | 'expired';
export type WatchPlace = {
  id: number; name: string; type: string; place_kind: 'beach' | 'valley';
  address: string | null; region: string | null; lat: number | null; lng: number | null;
  search_state: SearchState; reason_code: string | null; attempted_at: string | null;
  fetched_at: string | null; valid_until: string | null; radius_km: number | null;
  total: number | null; truncated: boolean;
};
export type PageEnvelope<T> = { rows: T[]; page: number; page_size: number; has_more: boolean; as_of: string; configured: boolean };
export const mediaLabels: Record<MediaKind, string> = { live: '실시간', timelapse: '타임랩스', photo: '사진', unknown: '미확인' };
export const relationLabels = { confirmed: '해당 장소 촬영 확인', nearby: '주변 풍경', unknown: '연결 미확인' };
export const searchLabels: Record<SearchState, string> = {
  unconfigured: '연동 미설정', not_searched: '아직 검색하지 않음', coordinates_missing: '좌표 없음',
  failed: '조회 실패', no_nearby_cameras: '주변 카메라 없음', found: '주변 카메라 확인', expired: '검색 자료 만료',
};
export const connectionLabels = { reachable: '접근 가능', offline: '오프라인', unverifiable: '확인 불가' };

// Defense in depth: the backend returns only URLs that pass the same exact policy.
export function safeWebcamUrl(value: string | null, id: string, period?: string): string | null {
  if (!value || !/^[1-9][0-9]{0,19}$/.test(id) || /[\s\\%]/.test(value)) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.hash || !value.startsWith(`https://${url.host}/`)) return null;
    if (!period) return ['webcams.windy.com', 'windy.com'].includes(url.host) && url.pathname === `/webcams/${id}` && !url.search ? value : null;
    if (url.host !== 'webcams.windy.com' || !['live', 'day', 'month', 'year', 'lifetime'].includes(period)) return null;
    const entries = [...url.searchParams];
    const legacy = url.pathname === '/webcams/public//player' && entries.length === 2 && url.searchParams.get('webcamId') === id && url.searchParams.get('playerType') === period;
    const current = url.pathname === `/webcams/public/embed/player/${id}/${period}` && !url.search;
    return legacy || current ? value : null;
  } catch { return null; }
}
export function playableUrl(camera: WatchCamera, option: PlaybackOption, now = Date.now()): string | null {
  if (option.playback_method === 'external_page') return option.url === camera.public_page ? publicCameraPage(camera) : null;
  if (!camera.valid_until || Date.parse(camera.valid_until) <= now || !Number.isFinite(Date.parse(camera.valid_until))) return null;
  if (option.connection_status === 'offline') return null;
  if (option.media_kind === 'live' && (!option.verified || !option.valid_until || !Number.isFinite(Date.parse(option.valid_until)) || Date.parse(option.valid_until) <= now)) return null;
  if (!['live', 'timelapse'].includes(option.media_kind)) return null;
  try {
    const url = new URL(option.url);
    const period = url.searchParams.get('playerType') ?? url.pathname.match(/^\/webcams\/public\/embed\/player\/[1-9][0-9]{0,19}\/(live|day|month|year|lifetime)$/)?.[1] ?? '';
    if (!period || (option.media_kind === 'live' ? period !== 'live' : period === 'live')) return null;
    return safeWebcamUrl(option.url, camera.provider_camera_id, period);
  } catch { return null; }
}
export function cameraKey(camera: WatchCamera) { return `${camera.spot_id}:${camera.camera_key}:${camera.revision_id}`; }

export function previewPlayerUrl(camera: { provider_camera_id: string; timelapse_period: string | null; timelapse_player: string | null }, validUntil: string, now = Date.now()): string | null {
  if (!Number.isFinite(Date.parse(validUntil)) || Date.parse(validUntil) <= now || !camera.timelapse_period || camera.timelapse_period === 'live') return null;
  return safeWebcamUrl(camera.timelapse_player, camera.provider_camera_id, camera.timelapse_period);
}

export function publicCameraPage(camera: WatchCamera): string | null {
  if (camera.camera_key.startsWith('windy:')) return safeWebcamUrl(camera.public_page, camera.provider_camera_id);
  const value = camera.public_page;
  if (!value || /[\s\\]/.test(value)) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && /\.(go|or)\.kr$/.test(url.hostname) && !url.username && !url.password && !url.search && !url.hash && !url.port ? value : null;
  } catch { return null; }
}
