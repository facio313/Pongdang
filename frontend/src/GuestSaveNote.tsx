import { t } from "./i18n";
import { withJosa } from "./josa";
import { useRequireLogin } from "./loginPopoverState";
import "./guestSaveNote.css";

/** 계정이 있어야 되는 것만 부드럽게 안내하는 한 줄.
 *
 *  예전에는 저장된 취향을 읽지 못한 것(익명 방문자의 401)을 **로그인 벽**으로
 *  바꿔, 홈의 「취향 고르기 →」 자리에 「로그인」 버튼이 섰습니다. 그러면 추천
 *  7단계를 한 번도 보지 못한 채로 화면이 끝납니다 -- 고르는 일 자체는 로그인이
 *  필요하지 않습니다.
 *
 *  이제 그 자리는 원래 하던 일을 그대로 하고, **저장**만 안내합니다. 버튼이
 *  아니라 문단 안의 링크입니다: 지금 하려던 일을 막지 않아야 하므로 시선을
 *  가져가지 않습니다.
 */
export function GuestSaveNote({
  what = "선택",
  className,
}: {
  /** 무엇이 저장되는지. 「코스」 · 「알림」처럼 그 화면의 말로 적습니다. */
  what?: string;
  className?: string;
}) {
  const requireLogin = useRequireLogin();
  return (
    <p className={"guest-save-note" + (className ? ` ${className}` : "")}>
      {t("지금 고른 {what} 이 브라우저에 있어요.", { what: withJosa(t(what), "은/는") })}{" "}
      <button type="button" className="pd-inline pd-tap" onClick={requireLogin}>
        {t("로그인하면 저장돼요")}
      </button>
    </p>
  );
}
