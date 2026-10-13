import { useEffect, useState, useSyncExternalStore } from "react";
import { useI18n } from "./i18n";
import { loadWebcamCatalog, sessionWebcamShuffleSeed, WebcamPreviewError, type PreviewResult } from "./livecamPreviewApi";
import { resourceRefreshGeneration, subscribeResourceRefresh } from "./resourceRefresh";

/** Home reads saved metadata only. Playback stays lazy through the provider link. */
export function useNearbyWebcams() {
  const { t } = useI18n();
  const [now] = useState(Date.now);
  const generation = useSyncExternalStore(subscribeResourceRefresh, resourceRefreshGeneration, resourceRefreshGeneration);
  const [response, setResponse] = useState<{ generation: number; data?: PreviewResult; error?: unknown }>();
  const current = response?.generation === generation ? response : undefined;
  useEffect(() => {
    let active = true;
    void loadWebcamCatalog(import.meta.env.BASE_URL, 1, "", sessionWebcamShuffleSeed(), fetch, true)
      .then(data => { if (active) setResponse({ generation, data }); })
      .catch((error: unknown) => { if (active) setResponse({ generation, error }); });
    return () => { active = false; };
  }, [generation]);
  return {
    result: current?.data,
    rows: current?.data?.rows ?? [],
    error: current?.error instanceof WebcamPreviewError ? current.error.localizedMessage()
      : current?.error instanceof Error ? t(current.error.message) : undefined,
    loading: !current,
    now,
    expired: false,
  };
}
