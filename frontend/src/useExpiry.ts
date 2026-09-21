import { useCallback, useMemo, useSyncExternalStore } from "react";

/** Expiry changes the display immediately; it never triggers an API request. */
export function useExpiry(expiries: (number | undefined)[]) {
  const key = [...new Set(expiries.filter((value): value is number =>
    value !== undefined && Number.isFinite(value),
  ))].sort((left, right) => left - right).join(",");
  const deadlines = useMemo(() => key ? key.split(",").map(Number) : [], [key]);
  const snapshot = useCallback(() => {
    const now = Date.now();
    return deadlines.findLast((deadline) => deadline <= now);
  }, [deadlines]);
  const subscribe = useCallback((listener: () => void) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      const now = Date.now();
      const next = deadlines.find((deadline) => deadline > now);
      if (next === undefined) return;
      timer = setTimeout(() => {
        listener();
        schedule();
      }, Math.min(2147483647, next - now + 1));
    };
    schedule();
    return () => clearTimeout(timer);
  }, [deadlines]);
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

export function useExpired(expiresAt: number | undefined) {
  const expiredUntil = useExpiry([expiresAt]);
  return expiresAt !== undefined && expiredUntil !== undefined && expiresAt <= expiredUntil;
}
