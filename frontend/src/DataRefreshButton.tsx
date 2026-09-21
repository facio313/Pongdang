import { t } from "./i18n";
import { useDataRefresh } from "./useDataRefresh";

/** Visible in the common mobile/desktop header; shares the menu's single job. */
export function DataRefreshButton() {
  const refresh = useDataRefresh();
  const message = refresh.error ?? (refresh.pending
    ? "자료를 갱신하는 동안 기존 값을 유지합니다."
    : refresh.job?.status === "partial" || refresh.job?.status === "failed"
      ? "갱신 자료 부족 · 이전 값 유지"
      : refresh.job?.status === "succeeded"
        ? "자료 확인 완료 · 부족한 항목은 이전 값 유지"
        : "30분마다 자동 갱신 · 자료가 부족하면 이전 값 유지");
  return (
    <div className="pd-data-refresh">
      <button type="button" className="pd-tap" disabled={refresh.pending}
        title={t("30분마다 자동 갱신 · 자료가 부족하면 이전 값 유지")}
        onClick={() => { void refresh.refresh(); }}>
        {t(refresh.pending ? "데이터 갱신 중…" : "데이터 새로고침")}
      </button>
      <span className="pd-data-refresh-message" role="status">{t(message)}</span>
    </div>
  );
}
