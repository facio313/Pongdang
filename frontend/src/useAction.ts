import { useEffect, useRef, useState } from "react";
import { useI18n } from "./i18n";
import { isLoginRequiredError } from "./authError";
import { useRequireLogin } from "./loginPopover";
export function useAction({ replace = false }: { replace?: boolean } = {}) {
  const { t } = useI18n();
  const requireLogin = useRequireLogin();
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
  function cancel() {
    current.current?.abort();
    current.current = null;
    setBusy(false);
    setError("");
  }
  async function run(action: (signal: AbortSignal) => Promise<void>) {
    if (current.current && !replace) return;
    current.current?.abort();
    const controller = new AbortController();
    current.current = controller;
    setBusy(true);
    setError("");
    try {
      await action(controller.signal);
    } catch (error) {
      if (!controller.signal.aborted) {
        if (isLoginRequiredError(error)) requireLogin();
        else
          setError(
            error instanceof Error
              ? error.message
              : "요청을 완료하지 못했습니다.",
          );
      }
    } finally {
      if (current.current === controller) {
        current.current = null;
        setBusy(false);
      }
    }
  }
  return { busy, error: t(error), run, cancel };
}
