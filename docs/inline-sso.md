# Pongdang 페이지 내 SSO 로그인

`pongdang.site`의 로그인 모달은 `POST /pongdang/api/auth/login`을 호출한다.
서버의 Pongdang 전용 브리지는 다음 기존 경로를 한 요청 안에서 완료한다.

1. `pongdang-oauth2`가 만드는 authorization-code/PKCE S256 요청과 CSRF 쿠키를 받는다.
2. 고정된 중앙 SSO의 `/sso/api/firstfactor`에 자격 증명을 전달한다. 별도 계정·비밀번호 저장은 없다.
3. 중앙 SSO의 기존 `pongdang-site` 클라이언트 정책으로 authorization code를 발급받고, 원래 OAuth 프록시 callback에서 교환한다.
4. 기존 도메인 권한 검사로 현재 계정·그룹·`access-pongdang`을 재확인한다.
5. 통과한 경우에만 기존 `__Host-pongdang_session` Secure/HttpOnly 쿠키를 반환한다. 프런트가 state를 재조회한 뒤 모달을 닫고 알림·취향을 재조회한다.

중앙 SSO 쿠키는 해당 요청의 메모리에서만 사용하며 브라우저로 전달하지 않는다.
이 연동은 Pongdang 세션을 만들며 다른 사이트의 로그인 상태를 변경하지 않는다.
중앙 권한·동의·추가 인증 요구를 우회하지 않으며, 추가 절차가 요구되면 실패로 남긴다.
다른 서비스의 CORS, iframe 보호, 쿠키 도메인, SSO 권한 정책은 변경하지 않는다.
비로그인과 권한 거절은 JSON 401/403이며 API fetch에 로그인 HTML을 반환하지 않는다.

## 운영 설치 경계

- `ops/pongdang-domain-auth.mjs`: 기존 Pongdang 전용 컨테이너의
  `/app/ops/sso/pongdang-domain-auth.mjs`에 bind mount되는
  `/home/cks/.config/pongdang-domain/authorization.mjs` 설치본.
  기존 이미지의 `./admin/lib.mjs`를 읽어 현재 중앙 계정 권한을 확인한다.
- `ops/nginx-pongdang-inline-login.conf`: Pongdang HTTPS 서버에만 include하는
  `/etc/nginx/snippets/pongdang-inline-login.conf` 템플릿.
- 앱 이미지 배포가 호스트 파일을 자동 설치하지 않는다. 설치본 백업 후 차이가
  있는 파일만 갱신하고, `nginx -t`와 브리지 구문 검사를 통과해야 한다.
  필요한 재시작은 `pongdang-domain-auth` 하나, reload는 nginx 하나다.
  중앙 SSO·OAuth 프록시·DB를 재시작할 필요는 없다.
- 브리지의 edge secret은 기존 비밀 파일에서만 읽는다. 요청 헤더·본문·쿠키·
  OAuth query를 로그에 기록하지 않는다. 출처·JSON 형식·크기·동시성·IP별 속도를
  검사하며, 중앙 SSO의 계정 잠금과 기존 OAuth 검증을 유지한다.

## 검증

```sh
node --test ops/test-pongdang-domain-auth.mjs
python3 ops/verify_local.py frontend/src/ssoLogin.ts frontend/src/loginPopover.tsx \
  frontend/src/loginPopoverState.ts frontend/src/loginPopover.css frontend/src/main.tsx \
  frontend/src/locales/common.ts frontend/tests/ssoLogin.test.mjs \
  frontend/tests/browser/login-flow.spec.ts
```

화면 검증은 별도의 폐기용 loopback `pongdang_test`와 명시적 환경으로
`frontend/tests/browser/login-flow.spec.ts`만 실행한다. 테스트 자격 증명과 모의
인증 응답은 로컬 테스트에서만 사용하며 실제 운영 로그인 성공 근거가 아니다.
운영에서는 모달 유지·중앙 인증 결과·실제 세션 인식·개인 자료 재조회까지 구분해 확인한다.

## 복구

설치 직전 백업한 `authorization.mjs`와 `pongdang.site`를 원래 경로에 복원한다.
`nginx -t` 통과 후 `pongdang-domain-auth`만 재시작하고 nginx를 reload한다.
기존 OAuth 전체 화면 로그인 경로와 보호된 API 게이트는 보존된다.
필요하면 정상 main 코드로 UI를 되돌리는 별도 커밋을 동일한 자동 배포 경로로 반영한다.
인증 실패를 해결하려고 권한을 완화하거나 가짜 인증 헤더를 넣지 않는다.

## 라이브캠 기존 미저장 이미지 복구

이미지 URL 처리 코드를 배포해도 이전 카탈로그의 미저장 이미지가 자동으로 채워지지는
않는다. 승인된 운영 작업에서 Windy 관련 표를 먼저 백업하고 기존
`python -m app.livecams.catalog --refresh`를 한 번 실행한다. 기존 잠금·일일 예산을
유지하고, 저장된 이미지를 덮어쓰지 않으며 이전 카탈로그 revision을 보존한다.
`saved` 개수뿐 아니라 실제 목록의 이미지 로드 성공을 확인한다. 일반 조회나 앱 시작에
강제 재수집을 추가하지 않는다.
