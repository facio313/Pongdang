import { t } from "./i18n";
import { useRequireLogin } from "./loginPopoverState";
import "./recommendationAccess.css";

export function RecommendationLoginNotice({
  loginRequired,
  loading,
  error,
}: {
  loginRequired: boolean;
  loading: boolean;
  error?: string;
}) {
  const requireLogin = useRequireLogin();
  if (!loginRequired && !loading && !error) return null;
  return <div className="recommend-access-notice">
    <p role={error ? "alert" : "status"}>
      {loginRequired
        // 「로그인하면 취향을 고르고 … 추천받을 수 있어요」는 지금 할 수 있는
        // 일을 못 한다고 말합니다. 고르는 일에는 계정이 필요하지 않고, 계정이
        // 필요한 것은 **다음에도 쓰도록 저장**하는 것뿐입니다.
        ? t("지금 고른 취향은 이 브라우저에 있어요. 로그인하면 저장돼요.")
        : error ?? t("로그인 상태를 확인하고 있습니다.")}
    </p>
    {loginRequired && <button type="button" className="recommend-login-button" onClick={requireLogin}>
      {t("로그인")}
    </button>}
  </div>;
}
