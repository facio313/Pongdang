import { useEffect, useState, useSyncExternalStore } from "react";
import { useI18n } from "./i18n";
import { previewPlayerUrl, safeWebcamUrl } from "./livecamApi";
import {
  loadWebcamCatalog,
  requestWebcamPreview,
  sessionWebcamShuffleSeed,
  WebcamPreviewError,
  type PreviewResult,
} from "./livecamPreviewApi";
import {
  resourceRefreshGeneration,
  subscribeResourceRefresh,
} from "./resourceRefresh";

/** 주변 조회가 성공했지만 열 수 있는 카메라가 없을 때만 전국 목록을 재사용합니다.
 *  화면은 catalogFallback으로 다른 지역의 풍경임을 구분합니다. */
export function useNearbyWebcams(spotId: number | undefined) {
  const { t } = useI18n();
  const generation = useSyncExternalStore(
    subscribeResourceRefresh,
    resourceRefreshGeneration,
    resourceRefreshGeneration,
  );
  const key = `${spotId ?? ""}:${generation}`;
  const [response, setResponse] = useState<{
    key: string;
    data?: PreviewResult;
    catalogFallback?: boolean;
    radiusKm?: number | null;
    error?: string | WebcamPreviewError;
  }>();
  const [now, setNow] = useState(Date.now);
  const current = response?.key === key ? response : undefined;

  useEffect(() => {
    if (spotId === undefined) return;
    let active = true;
    // 20초. useResource 의 조회 타임아웃과 같은 값을 씁니다.
    const controller = AbortSignal.timeout(20000);
    void (async () => {
      let catalogFallback = false;
      let radiusKm: number | null = null;
      try {
        let data = await requestWebcamPreview(import.meta.env.BASE_URL, spotId, controller);
        if (!active) return;
        radiusKm = data.radius_km;
        const hasOpenCamera = data.rows.some(camera =>
          previewPlayerUrl(camera, data.valid_until)
          ?? safeWebcamUrl(camera.public_page, camera.provider_camera_id),
        );
        if (data.scope === "place" && !hasOpenCamera) {
          catalogFallback = true;
          data = await loadWebcamCatalog(import.meta.env.BASE_URL, 1, "", sessionWebcamShuffleSeed());
        }
        if (!active) return;
        setNow(Date.now());
        setResponse({ key, data, catalogFallback, radiusKm });
      } catch (error: unknown) {
        if (!active) return;
        setResponse({
          key,
          catalogFallback,
          radiusKm,
          error:
            error instanceof WebcamPreviewError
              ? error
              : error instanceof Error
                ? error.message
                : "근처 라이브캠을 불러오지 못했습니다.",
        });
      }
    })();
    return () => {
      active = false;
    };
  }, [key, spotId]);

  // 가까운 것부터. 거리를 모르는 행은 뒤로 보냅니다 -- 모르는 거리를 0 으로
  // 읽으면 먼 카메라가 맨 앞에 섭니다.
  const rows = [...(current?.data?.rows ?? [])];
  if (!current?.catalogFallback) rows.sort(
      (left, right) =>
        (left.distance_km ?? Number.POSITIVE_INFINITY) -
        (right.distance_km ?? Number.POSITIVE_INFINITY),
    );
  const validUntil =
    current?.data?.storage === "database" ? null : current?.data?.valid_until;
  useEffect(() => {
    if (!validUntil) return;
    const delay = Date.parse(validUntil) - Date.now();
    if (!Number.isFinite(delay)) return;
    const timer = window.setTimeout(() => setNow(Date.now()), Math.max(1, delay));
    return () => window.clearTimeout(timer);
  }, [validUntil]);

  return {
    result: current?.data,
    rows,
    catalogFallback: current?.catalogFallback ?? false,
    /** 조회한 반경(km). 화면이 「○km 안에 없음」이라고 말할 수 있어야 합니다. */
    radiusKm: current?.radiusKm ?? null,
    error:
      current?.error instanceof WebcamPreviewError
        ? current.error.localizedMessage()
        : current?.error
          ? t(current.error)
          : undefined,
    /** 장소가 정해지지 않았으면 조회하지 않습니다 -- 「조회 중」이 아닙니다. */
    loading: spotId !== undefined && !current,
    now,
    expired: validUntil ? Date.parse(validUntil) <= now : false,
  };
}
