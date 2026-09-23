import { TravelRequestError } from "./travelApi";
import { AiRequestError } from "./aiApi";

/** True when `error` means "이 요청은 로그인(SSO)이 없어서 막혔다" -- not any
 *  다른 실패(권한 없음 403, 검증 실패 422 등). travelJson/aiApi 의 fetch 래퍼가
 *  던지는 세 가지 형태를 모두 인식한다: 401 상태의 TravelRequestError, 로그인이
 *  필요하다는 code 의 AiRequestError, 그리고 만료된 세션이 로그인 HTML로
 *  리다이렉트될 때 나오는 평범한 Error. */
export function isLoginRequiredError(error: unknown): boolean {
  if (error instanceof TravelRequestError) return error.status === 401;
  if (error instanceof AiRequestError) return error.code === "unauthenticated";
  return error instanceof Error && error.message.includes("SSO 로그인 화면으로 이동");
}
