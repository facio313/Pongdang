import { useEffect, useRef, useState } from "react";
export function useAction() {
  const current = useRef<AbortController | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(
    () => () => {
      current.current?.abort();
      current.current = null;
    },
    [],
  );
  async function run(action: (signal: AbortSignal) => Promise<void>) {
    if (current.current) return;
    const controller = new AbortController();
    current.current = controller;
    setBusy(true);
    setError("");
    try {
      await action(controller.signal);
    } catch (error) {
      if (!controller.signal.aborted)
        setError(
          error instanceof Error
            ? error.message
            : "요청을 완료하지 못했습니다.",
        );
    } finally {
      if (current.current === controller) {
        current.current = null;
        setBusy(false);
      }
    }
  }
  return { busy, error, run };
}
