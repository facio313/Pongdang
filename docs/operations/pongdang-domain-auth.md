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

## 페이지 내 로그인과 로그아웃

공통 헤더는 보호된 `/api/data/travel/preferences`의 `account_id`를 표시한다.
비로그인 상태에서는 기존 로그인 팝업을 열고, 계정 ID를 누르면 로그아웃 확인창을
연다. 취소/Esc는 세션을 유지한다. 확인 후 POST `/api/auth/logout`와 새
GET `/api/auth/state` 모두 명시적인 `authenticated: false`를 반환해야 화면을
새로 열어 개인 자료의 메모리 캐시를 비운다. 실패·HTML 응답·권한 오류는
로그아웃 성공으로 표시하지 않는다.

운영 적용에는 다음 두 호스트 설치본이 필요하다. 앱 이미지 배포만으로 갱신되지
않으므로 기존 설치본을 백업하고, 앱 배포 전에 호환되는 중계 경로를 설치한다.

- `ops/pongdang-domain-auth.mjs` → Pongdang 전용 domain-auth에 마운트된
  `authorization.mjs`. 실제 마운트 경로를 확인하고 해당 서비스만 재시작한다.
- `ops/nginx-pongdang-inline-login.conf` →
  `/etc/nginx/snippets/pongdang-inline-login.conf`. 사이트의 기존 include를
  유지하고 `nginx -t` 통과 후 nginx를 reload한다.

`/pongdang/api/auth/{state,login,logout}`와 `/api/auth/{state,login,logout}`는
같은 중계 경로를 사용한다. 로그아웃은 신뢰된 중계·같은 Origin·POST·JSON 조건을
확인하고 `__Host-pongdang_session` 및 숫자 접미사의 분할 쿠키만 만료시킨다.
중앙 SSO와 다른 앱의 세션·계정·권한은 변경하지 않는다. GET 로그아웃은405,
다른 출처의 POST는403이어야 하며 이 거절 응답에 쿠키 변경이 없어야 한다.

중계 헬스, 공개 홈페이지/readiness, 비로그인 상태의 JSON401을 확인하고 실제
사용자 브라우저에서 로그인→취소→로그아웃→재로그인을 확인한다. 설치 검증에
실패하면 두 설치본을 백업으로 복원하고 같은 서비스 재시작 및 nginx 구문 검사·
reload를 수행한다. 앱 배포 실패는 기존 배포 게이트의 이전 이미지 복구를 따른다.
