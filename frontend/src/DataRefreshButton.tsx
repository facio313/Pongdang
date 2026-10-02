import { t } from "./i18n";
import { useDataRefresh } from "./useDataRefresh";

/** Visible in the common mobile/desktop header; shares the menu's single job. */
export function DataRefreshButton() {
  const refresh = useDataRefresh();
  // 「갱신 자료 부족 · 이전 값 유지」는 수집 파이프라인의 상태입니다. 보는
  // 사람에게 필요한 것은 지금 화면의 값이 새것인지 하나입니다 -- 각 숫자 옆의
  // 「마지막 업데이트 10:55」가 그 답을 이미 들고 있습니다(productData).
  const message = refresh.error ?? (refresh.pending
    ? "자료를 확인하고 있습니다."
    : refresh.job?.status === "partial" || refresh.job?.status === "failed"
      ? "새 자료가 아직 없어 이전 값을 보여 줍니다."
      : refresh.job?.status === "succeeded"
        ? "자료를 확인했습니다."
        : "30분마다 자동으로 확인합니다.");
  return (
    <div className="pd-data-refresh">
      <button type="button" className="pd-tap" disabled={refresh.pending}
        title={t("30분마다 자동으로 확인합니다.")}
        onClick={() => { void refresh.refresh(); }}>
        {t(refresh.pending ? "데이터 갱신 중…" : "데이터 새로고침")}
      </button>
      <span className="pd-data-refresh-message" role="status">{t(message)}</span>
    </div>
  );
}
