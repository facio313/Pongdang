import { TravelRequestError } from "./travelApi";
import { AiRequestError } from "./aiApi";
import { t } from "./i18n.ts";

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

/** travelJson 이 던지는 「로그인 필요」의 두 원문(번역 전 한국어 소스). */
const LOGIN_REQUIRED_SOURCES = [
  "기존 SSO 로그인이 필요합니다.",
  "SSO 로그인 화면으로 이동했습니다. 기존 로그인을 확인한 뒤 다시 시도해 주세요.",
];

/** useResource 는 실패를 원래 Error 가 아니라 **이미 번역된 문자열**로만
 *  남긴다(travelJson.ts 참고) -- 그 문자열만 가진 곳에서 isLoginRequiredError
 *  대신 쓴다. 개인정보 자원(preferences · 즐겨찾기 등)을 익명 방문자가
 *  배경 조회할 때, 실패를 알림으로 띄우거나 로그인으로 튕기지 않고 그냥
 *  「자료 없음」으로 다루기 위한 판별입니다. */
export function isLoginRequiredMessage(message: string | undefined): boolean {
  return message != null && LOGIN_REQUIRED_SOURCES.some((source) => t(source) === message);
}

/** useResource 결과 중 「로그인 필요」에러만 지운다. 개인정보 자원을 배경에서
 *  조회하는 화면(홈의 취향, 즐겨찾기, 내 코스 목록·동행 세션·공유 코스 단건
 *  조회 등)이 모두 같은 방식으로 다룬다: 익명 방문자에게는 알림이 아니라
 *  조용히 「없음」으로 보인다. 쓰기 행동은 이 함수를 거치지 않고 useAction 의
 *  로그인 팝오버로 안내한다. */
export function suppressLoginRequired<T extends { error?: string }>(resource: T): T {
  return isLoginRequiredMessage(resource.error) ? { ...resource, error: undefined } : resource;
}
