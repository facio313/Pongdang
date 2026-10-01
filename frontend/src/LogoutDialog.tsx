import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { t } from "./i18n";
import { signOutSso } from "./ssoLogin";
import "./logoutDialog.css";

export function LogoutDialog({ accountId, onClose }: { accountId: string; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const request = useRef<AbortController | null>(null);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    const panel = dialog.current;
    panel?.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      request.current?.abort();
      panel?.close();
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, []);
  const logout = async () => {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setPending(true);
    setFailed(false);
    try {
      await signOutSso(import.meta.env.BASE_URL, AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]));
      // Reload this route so cached profiles, saved trips and chat state cannot
      // survive into an anonymous session or another account's next sign-in.
      if (!controller.signal.aborted) window.location.reload();
    } catch {
      if (!controller.signal.aborted) setFailed(true);
    } finally {
      request.current = null;
      if (!controller.signal.aborted) setPending(false);
    }
  };
  return createPortal(<dialog ref={dialog} className="pd-app pd-logout-dialog"
    aria-labelledby="pd-logout-title" aria-describedby="pd-logout-account" aria-busy={pending}
    onCancel={event => { event.preventDefault(); if (!request.current) onClose(); }}>
    <h2 id="pd-logout-title">{t("로그아웃하시겠어요?")}</h2>
    <p id="pd-logout-account">{accountId}</p>
    {failed && <p className="pd-logout-error" role="alert">{t("로그아웃하지 못했습니다. 잠시 후 다시 시도해 주세요.")}</p>}
    <div className="pd-logout-actions">
      <button type="button" disabled={pending} onClick={onClose}>{t("취소")}</button>
      <button type="button" className="pd-logout-confirm" disabled={pending} onClick={() => void logout()}>
        {t(pending ? "로그아웃 중…" : "로그아웃")}
      </button>
    </div>
  </dialog>, document.body);
}
