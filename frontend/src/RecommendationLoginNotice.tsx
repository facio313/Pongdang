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
        ? t("로그인하면 취향을 고르고 맞춤 코스를 추천받을 수 있어요.")
        : error ?? t("로그인 상태를 확인하고 있습니다.")}
    </p>
    {loginRequired && <button type="button" className="recommend-login-button" onClick={requireLogin}>
      {t("로그인")}
    </button>}
  </div>;
}
