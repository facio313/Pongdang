export interface KakaoLatLng {
  getLat(): number;
  getLng(): number;
}

export interface KakaoLatLngBounds {
  extend(point: KakaoLatLng): void;
  getSouthWest(): KakaoLatLng;
  getNorthEast(): KakaoLatLng;
  isEmpty(): boolean;
}

export interface KakaoMap {
  setCenter(center: KakaoLatLng): void;
  getCenter(): KakaoLatLng;
  panTo(center: KakaoLatLng): void;
  setLevel(level: number): void;
  getLevel(): number;
  setBounds(bounds: KakaoLatLngBounds, top?: number, right?: number, bottom?: number, left?: number): void;
  getBounds(): KakaoLatLngBounds;
  relayout(): void;
  addControl(control: object, position: number): void;
  removeControl(control: object): void;
}

export interface KakaoCustomOverlay {
  setMap(map: KakaoMap | null): void;
  setPosition(position: KakaoLatLng): void;
  setContent(content: HTMLElement | string): void;
  setVisible(visible: boolean): void;
  setZIndex(zIndex: number): void;
}

export interface KakaoMapsNamespace {
  Polyline?: new (options: { map: KakaoMap; path: KakaoLatLng[]; strokeWeight: number; strokeColor: string; strokeOpacity: number }) => { setMap(map: KakaoMap | null): void };
  Map: new (container: HTMLElement, options: {
    center: KakaoLatLng;
    level?: number;
    draggable?: boolean;
    scrollwheel?: boolean;
    keyboardShortcuts?: boolean;
  }) => KakaoMap;
  LatLng: new (latitude: number, longitude: number) => KakaoLatLng;
  LatLngBounds: new (southWest?: KakaoLatLng, northEast?: KakaoLatLng) => KakaoLatLngBounds;
  CustomOverlay: new (options: {
    map?: KakaoMap | null;
    position: KakaoLatLng;
    content: HTMLElement | string;
    clickable?: boolean;
    xAnchor?: number;
    yAnchor?: number;
    zIndex?: number;
  }) => KakaoCustomOverlay;
  ZoomControl: new () => object;
  ControlPosition: { RIGHT: number; TOPRIGHT: number; BOTTOMRIGHT: number };
  event: {
    addListener(target: object, type: string, handler: () => void): void;
    removeListener(target: object, type: string, handler: () => void): void;
    preventMap(): void;
  };
}

type KakaoMapsBootstrap = Partial<KakaoMapsNamespace> & { load?: (callback: () => void) => void };

declare global {
  interface Window {
    kakao?: { maps?: KakaoMapsBootstrap };
  }
}

export type KakaoMapsErrorCode = 'MISSING_KEY' | 'BROWSER_REQUIRED' | 'KEY_CHANGED' | 'LOAD_FAILED' | 'LOAD_TIMEOUT';

export class KakaoMapsLoadError extends Error {
  readonly code: KakaoMapsErrorCode;

  constructor(code: KakaoMapsErrorCode) {
    const messages: Record<KakaoMapsErrorCode, string> = {
      MISSING_KEY: '카카오 지도 JavaScript 키가 설정되지 않았습니다.',
      BROWSER_REQUIRED: '지도는 브라우저에서 열 수 있습니다.',
      KEY_CHANGED: '지도 설정이 변경되었습니다. 페이지를 새로고침해 주세요.',
      LOAD_FAILED: '카카오 지도를 불러오지 못했습니다. 연결 상태와 지도 키·허용 도메인 설정을 확인해 주세요.',
      LOAD_TIMEOUT: '카카오 지도 응답이 지연되고 있습니다. 잠시 후 다시 시도해 주세요.',
    };
    super(messages[code]);
    this.name = 'KakaoMapsLoadError';
    this.code = code;
  }
}

let activeLoad: { key: string; promise: Promise<KakaoMapsNamespace> } | undefined;

function readyMaps(maps: KakaoMapsBootstrap | undefined): maps is KakaoMapsNamespace {
  return typeof maps?.Map === 'function'
    && typeof maps.LatLng === 'function'
    && typeof maps.LatLngBounds === 'function'
    && typeof maps.CustomOverlay === 'function'
    && typeof maps.ZoomControl === 'function'
    && typeof maps.ControlPosition?.RIGHT === 'number'
    && typeof maps.event?.addListener === 'function'
    && typeof maps.event?.removeListener === 'function'
    && typeof maps.event?.preventMap === 'function';
}

function withAbort(promise: Promise<KakaoMapsNamespace>, signal?: AbortSignal): Promise<KakaoMapsNamespace> {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(new DOMException('지도 열기가 취소되었습니다.', 'AbortError'));
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(new DOMException('지도 열기가 취소되었습니다.', 'AbortError'));
    signal.addEventListener('abort', onAbort, { once: true });
    void promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort));
  });
}

/** Load only the public JavaScript key. REST API keys must never be passed here. */
export function loadKakaoMaps(jsKey: string, signal?: AbortSignal): Promise<KakaoMapsNamespace> {
  const key = jsKey.trim();
  if (!key) return Promise.reject(new KakaoMapsLoadError('MISSING_KEY'));
  if (signal?.aborted) return Promise.reject(new DOMException('지도 열기가 취소되었습니다.', 'AbortError'));
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.reject(new KakaoMapsLoadError('BROWSER_REQUIRED'));
  }
  if (activeLoad) {
    if (activeLoad.key !== key) return Promise.reject(new KakaoMapsLoadError('KEY_CHANGED'));
    return withAbort(activeLoad.promise, signal);
  }

  // Defer starting until activeLoad has been assigned, even if appending a script fails.
  const promise = Promise.resolve().then(() => new Promise<KakaoMapsNamespace>((resolve, reject) => {
    if (readyMaps(window.kakao?.maps)) {
      resolve(window.kakao.maps);
      return;
    }

    const script = document.createElement('script');
    let finished = false;
    const timeout = setTimeout(() => fail('LOAD_TIMEOUT'), 15_000);
    const cleanup = () => {
      clearTimeout(timeout);
      script.onload = null;
      script.onerror = null;
    };
    const fail = (code: KakaoMapsErrorCode) => {
      if (finished) return;
      finished = true;
      cleanup();
      script.remove();
      reject(new KakaoMapsLoadError(code));
    };
    script.async = true;
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(key)}&autoload=false`;
    script.onerror = () => fail('LOAD_FAILED');
    script.onload = () => {
      if (finished) return;
      const maps = window.kakao?.maps;
      if (typeof maps?.load !== 'function') {
        fail('LOAD_FAILED');
        return;
      }
      try {
        maps.load(() => {
          if (finished) return;
          if (!readyMaps(window.kakao?.maps)) {
            fail('LOAD_FAILED');
            return;
          }
          finished = true;
          cleanup();
          resolve(window.kakao.maps);
        });
      } catch {
        fail('LOAD_FAILED');
      }
    };
    try {
      document.head.appendChild(script);
    } catch {
      fail('LOAD_FAILED');
    }
  })).catch((error: unknown) => {
    if (activeLoad?.promise === promise) activeLoad = undefined;
    // Never forward a browser exception containing a request URL or key.
    throw error instanceof KakaoMapsLoadError ? error : new KakaoMapsLoadError('LOAD_FAILED');
  });
  activeLoad = { key, promise };
  return withAbort(promise, signal);
}
