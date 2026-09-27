# pongdang.site OAuth 로그인과 개인 API

Pongdang 도메인의 브라우저 로그인은 `/pongdang/auth/continue`의 기존 인증
게이트를 사용한다. 비로그인 브라우저는 `/oauth2/start`에서 중앙 Bonifacio SSO로
이동하고, 성공하면 `/pongdang/auth/continue`로 돌아온다. 앱은 저장한 동일 출처의
화면 주소를 복원하고 개인 자료를 다시 조회한다. `/sso/api/state`와
`/sso/api/firstfactor`는 이 도메인의 로그인 API가 아니다.

개인 API는 동일한 `auth_request /_pongdang_auth`와 `access-pongdang` 검사를
유지하되, 로그인302 대신 JSON401/403을 반환한다. fetch는 세션 만료를 로그인
필요 상태로 표시하고 사용자의 로그인 버튼에서만 최상위 문서를 이동한다.

## 호스트 설치

앱 배포는 nginx 파일을 설치하지 않는다. 변경 전 해당 파일을 root 전용 디렉터리에
백업한다. 공용 SSO snippet이나 다른 도메인의 정책은 수정하지 않는다.

- `ops/nginx-pongdang-api-errors.conf`를
  `/etc/nginx/snippets/pongdang-api-errors.conf`로 설치한다.
- `ops/nginx-pongdang-api-error-handlers.conf`를
  `/etc/nginx/snippets/pongdang-api-error-handlers.conf`로 설치한다.
- `/etc/nginx/snippets/pongdang-domain-proxy.conf`에서 공통
  `error_page 401 = @pongdang_login`을 제거한다. 인증 요청·신뢰 헤더·서버 전용
  token include는 변경하지 않는다.
- `/etc/nginx/sites-available/pongdang.site`의 HTTPS server 안에 error-handlers
  snippet을 include한다. 기존 보호 API 정규식 location과
  `@pongdang_domain_ai_explanation_private`에 proxy snippet 다음으로
  api-errors snippet을 include한다.
- `/pongdang/auth/continue`와 `/auth/continue` location에는
  `error_page 401 = @pongdang_login;`을 명시하여 브라우저 OAuth 흐름을 유지한다.
- `nginx -t` 성공 후 nginx만 reload한다. 공개 홈페이지·readiness200,
  개인 API401 JSON/no-store/no Location, 로그인 continuation302를 확인한다.

복구는 백업한 `pongdang.site`와 `pongdang-domain-proxy.conf`를 원위치에 복원하고
`nginx -t` 성공 후 nginx를 reload한다. 새 snippet은 복구된 설정에서 참조되지
않으므로 즉시 삭제할 필요가 없다.

실제 로그인 성공·권한 부족은 해당 계정으로 확인한다. 테스트 전용 모의 응답은
운영 인증 성공의 증거가 아니며, 가짜 인증 헤더로 이를 대체하지 않는다.
