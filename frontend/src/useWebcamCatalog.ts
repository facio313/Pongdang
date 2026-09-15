import { useEffect, useState } from 'react';
import { loadWebcamCatalog, type PreviewResult, type WebcamCategory } from './livecamPreviewApi';

export function useWebcamCatalog(page: number, category: WebcamCategory | '', shuffleSeed: number) {
  const key = `${page}:${category}:${shuffleSeed}`;
  const [response, setResponse] = useState<{ key: string; data?: PreviewResult; error?: string }>();
  const [now, setNow] = useState(Date.now);
  const current = response?.key === key ? response : undefined;
  useEffect(() => {
    let active = true;
    void loadWebcamCatalog(import.meta.env.BASE_URL, page, category, shuffleSeed).then(
      data => {
        if (active) {
          setNow(Date.now());
          setResponse({ key, data });
        }
      },
      error => { if (active) setResponse({ key, error: error instanceof Error ? error.message : '목록을 불러오지 못했습니다.' }); },
    );
    return () => { active = false; };
  }, [key, page, category, shuffleSeed]);
  const validUntil = current?.data?.valid_until;
  useEffect(() => {
    if (!validUntil) return;
    const delay = Date.parse(validUntil) - Date.now();
    if (!Number.isFinite(delay)) return;
    const timer = window.setTimeout(() => setNow(Date.now()), Math.max(1, delay));
    return () => window.clearTimeout(timer);
  }, [validUntil]);
  return {
    result: current?.data, error: current?.error, loading: !current, now,
    expired: validUntil ? Date.parse(validUntil) <= now : false,
  };
}
