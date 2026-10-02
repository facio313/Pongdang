import { useEffect, useState, useSyncExternalStore } from "react";
import { useI18n } from "./i18n";
import {
  requestWebcamPreview,
  WebcamPreviewError,
  type PreviewResult,
} from "./livecamPreviewApi";
import {
  resourceRefreshGeneration,
  subscribeResourceRefresh,
} from "./resourceRefresh";

/** 고른 장소 **근처**의 라이브캠.
 *
 *  홈의 「라이브캠 물멍」은 전국 목록 1페이지를 그대로 보여 주고 있었습니다.
 *  강릉 경포를 보고 있는데 청학동 · 소하1동 · 덕적면 웹캠이 뜨면, 그 카드가
 *  이 장소에 대해 말하는 것이 하나도 없게 됩니다.
 *
 *  **백엔드에는 이미 장소 기준 조회가 있습니다.** `POST livecams/preview` 에
 *  `spot_id` 를 주면 그 좌표에서 설정된 반경 안의 카메라만 돌려주고, 행마다
 *  `distance_km` 와 `nearby_place` 를 실어 줍니다. 그걸 쓰지 않고 있었을 뿐입니다.
 *
 *  반경 안에 없으면 **빈 목록**입니다. 전국 목록으로 물러서지 않습니다 --
 *  물러서면 「근처」라고 말할 수 없는 것을 근처 자리에 놓게 됩니다. 화면은 그때
 *  「근처 라이브캠 없음」과 전체 목록으로 가는 길을 보여 줍니다.
 */
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
    error?: string | WebcamPreviewError;
  }>();
  const [now, setNow] = useState(Date.now);
  const current = response?.key === key ? response : undefined;

  useEffect(() => {
    if (spotId === undefined) return;
    let active = true;
    // 20초. useResource 의 조회 타임아웃과 같은 값을 씁니다.
    const controller = AbortSignal.timeout(20000);
    void requestWebcamPreview(import.meta.env.BASE_URL, spotId, controller).then(
      (data) => {
        if (!active) return;
        setNow(Date.now());
        setResponse({ key, data });
      },
      (error: unknown) => {
        if (!active) return;
        setResponse({
          key,
          error:
            error instanceof WebcamPreviewError
              ? error
              : error instanceof Error
                ? error.message
                : "근처 라이브캠을 불러오지 못했습니다.",
        });
      },
    );
    return () => {
      active = false;
    };
  }, [key, spotId]);

  // 가까운 것부터. 거리를 모르는 행은 뒤로 보냅니다 -- 모르는 거리를 0 으로
  // 읽으면 먼 카메라가 맨 앞에 섭니다.
  const rows = [...(current?.data?.rows ?? [])].sort(
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
    /** 조회한 반경(km). 화면이 「○km 안에 없음」이라고 말할 수 있어야 합니다. */
    radiusKm: current?.data?.radius_km ?? null,
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
