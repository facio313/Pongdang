// Only server-defined public codes select a diagnosis. Never echo response details.
export function forbiddenMessage(detail: unknown): string {
  const messages: Record<string, string> = {
    SSO_GRANT_REQUIRED: "현재 SSO 계정에 Pongdang 접근 권한이 없습니다. 운영자에게 접근 권한을 확인해 주세요.",
    ORIGIN_NOT_ALLOWED: "현재 접속 주소에서 보낸 요청이 허용되지 않았습니다. 기존 SSO로 접속한 서비스 주소인지 확인해 주세요. 계속되면 운영자가 허용 출처(Origin)를 확인해야 합니다.",
    CROSS_SITE_REQUEST_REJECTED: "다른 사이트에서 보낸 요청으로 판단되어 처리하지 못했습니다. 기존 SSO로 서비스에 직접 접속한 뒤 다시 시도해 주세요.",
  };
  const message = typeof detail === "string" && Object.hasOwn(messages, detail)
    ? messages[detail]
    : "개인 요청의 접근이 거부됐습니다. 기존 SSO 세션과 접속 주소를 확인하고, 계속되면 운영자에게 권한·허용 출처 확인을 요청해 주세요.";
  return message + " 공개 자료가 보여도 개인 자료 접근이 확인된 것은 아닙니다.";
}
