import { useEffect, useState } from "react";
import { loadFeature } from "./featureApi";
import type { Feature, FeatureResult } from "./featureApi";

export function useFeatureResult(feature: Feature) {
  const [result, setResult] = useState<{ feature: Feature; value?: FeatureResult; error?: string }>();
  useEffect(() => {
    const controller = new AbortController();
    void loadFeature(feature, import.meta.env.BASE_URL, controller.signal).then(
      (value) => { if (!controller.signal.aborted) setResult({ feature, value }); },
      (error: unknown) => { if (!controller.signal.aborted) setResult({ feature, error: error instanceof Error ? error.message : "조회 오류" }); },
    );
    return () => controller.abort();
  }, [feature]);
  if (result?.feature !== feature) return { text: "서버 자료를 확인하는 중입니다.", detail: "", loading: true, error: false };
  if (result.error) return { text: `자료 조회 불가: ${result.error}`, detail: "조회 실패는 자료 없음 또는 조건 충족을 의미하지 않습니다.", loading: false, error: true };
  return { ...result.value!, loading: false, error: false };
}
