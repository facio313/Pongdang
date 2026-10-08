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

## 공통 팝업 회원가입

2026-10-08 사용자 결정: 기존 Bonifacio 통합 계정으로 가입하며 새 계정을 즉시
활성화한다. 관리자의 승인이나 메일 인증 단계는 추가하지 않는다. 부여하는 그룹은
중앙 함수 `groupsForAssignment("user", ["pongdang"])`가 반환하는
`user`, `portfolio-v2`, `access-pongdang` 세 개다. 현재 v2 계약에서 `user`는
기본 역할이고 앱 접근 권한은 별도다. `admin`, `chief-admin` 또는 다른 `access-*`는
부여하지 않는다. 표식 없는 과거 `["user"]`는 다른 앱 권한으로 확장될 수 있으므로
허용하지 않고 세 그룹의 정확한 값과 순서를 검사한다.
기존 계정에 대한 권한 추가·비밀번호 변경·이메일 변경은 이 경로에서 지원하지 않는다.

공통 `LoginPopoverProvider`에서 회원가입 폼으로 전환한다. 아이디·이름·이메일·
비밀번호·비밀번호 확인을 입력하며, 가입 성공 시 아이디를 채운 로그인 폼으로
돌아온다. 등록 응답은 로그인 세션을 발급하지 않고 기존 로그인 교환과 권한 검사를
통과해야 개인 자료를 읽을 수 있다. 비밀번호는 요청 완료 시 입력란에서 지우고
브라우저 저장소에 보관하지 않는다. 이메일은 인증된 주소로 표시하지 않는다.

같은 출처의 POST `/api/auth/register` 및 `/pongdang/api/auth/register`는
domain-auth의 `/inline/register`로 연결한다. 입력은 정확히
`username`, `displayName`, `email`, `password` 네 필드이며, 서버가 권한을 정한다.
성공은201 `{ "authenticated": false, "registered": true }`, 중복은409
`SSO_REGISTRATION_CONFLICT`, 형식 오류는400, 요청 제한은429,
미설정/저장 실패는503이다. 성공 또는 오류 응답에 계정 레코드·해시·쿠키를 넣지 않는다.

가입은 설치된 중앙 `admin/lib.mjs`의 `UserStore.readVersioned/mutate`,
`hashPassword`, `serializeUserDatabase`, `groupsForAssignment`를 사용한다. 현재 revision을 지정하고
잠금 안에서 중복을 다시 검사한 뒤 해시를 생성하여 기존 백업·원자적 저장 경로로
기록한다. 중앙 serializer가 해당 그룹 계약을 거절하면 전체 저장을 중단한다.
Pongdang DB에 별도 계정 테이블은 만들지 않는다. 예약 아이디 `anonymous-guest`와
`local-operator`는 가입할 수 없다. 비밀번호는 중앙 정책에 맞게 영문 대·소문자,
숫자, 특수문자를 포함한14~128자로 제한한다.

등록 요청에도 신뢰된 edge, 정확한 Host/Origin, JSON, 실제 클라이언트 IP 검사를
적용한다. 본문8KiB, 같은 IP에서 로그인/가입 합계5회/분, 전체 동시 처리8개,
가입 동시 처리2개와 가입 요청30회/시간을 제한한다. 제한은 해당 중계 프로세스
메모리에 있으므로 재시작 시 초기화되며 분산 제한을 보장하지 않는다.

### 별도 호스트 설치에 필요한 항목

앱 이미지 배포만으로는 회원가입이 활성화되지 않는다. 적용할 때 실제 domain-auth
이미지·마운트·중앙 사용자 저장소와 Authelia의 앱별 접근 규칙부터 확인한다.
로컬 Bonifacio 저장소의 오래된 `user/developer/admin` 전용 역할 계약과
Pongdang 설치 중계의 `portfolio-v2/access-*` 계약을 혼합하지 않는다.

1. 설치된 중앙 라이브러리에 위 함수가 있고 기존 `user,portfolio-v2,access-pongdang`
   계정을 읽고 쓸 수 있는지 확인한다. `portfolio-v2`만으로 다른 앱 권한이 생기지
   않으며, OIDC의 `pongdang-site`와 Pongdang 경로가 해당 전용 권한을 인정하는지
   확인한다. 표식과 앱 권한이 없는 과거 `["user"]`로 대신하지 않는다.
2. domain-auth의 중앙 저장소 경로가 중앙 관리기와 **같은 잠금·백업·감사 경로**를
   사용하는지 확인한다. 쓰기 권한이 없거나 해시 도구가 없으면 이 상태로 활성화하지
   않는다. 별도의 사용자 DB나 별개의 잠금을 만들지 않는다.
3. 기존 설치본과 서비스 설정을 백업한다. `ops/pongdang-domain-auth.mjs`를 기존
   `authorization.mjs`에, `ops/pongdang-registration.mjs`를 그 파일과 같은 디렉터리에
   설치한다. 두 모듈은 함께 설치한다. nginx inline-login snippet도 갱신한다.
4. Pongdang 전용 domain-auth에 `PONGDANG_REGISTRATION_ENABLED=true`를 설정하고
   필요한 설치본을 반영한다. 기본값은 비활성이다. 기존 로그인·로그아웃은 가입 설정과
   별개로 유지한다. 계정 경로는 `/accounts:rw`, 모듈·인증 비밀·앱 목록은 계속
   읽기 전용으로 둔다. Argon2 동시 처리2개를 위해 메모리를256MiB로 설정하고
   `/tmp`에16MiB의 `noexec,nosuid,nodev` tmpfs를 둔다. Node 구문 검사와
   `nginx -t` 후 해당 서비스만 재시작/reload한다.
5. 상태 응답의 `registration_available: true`, 기존 로그인·로그아웃, 외부 Origin
   거절, 중복·권한 주입 거절을 확인한다. 별도로 승인된 검증 계정으로 가입→로그인→
   Pongdang 개인 API 허용과 다른 앱 접근 거절을 확인해야 실제 운영 연동 완료다.

복구 시 등록 플래그를 끄고 백업한 모듈·nginx·서비스 설정으로 복원한다. 이미 생성한
중앙 계정을 사용자 DB 전체 복원으로 지우지 않는다. 계정 비활성화/정리는 중앙
관리기의 기존 절차에서 별도 대상으로 처리한다.

로컬 검증은 `node --test ops/test-pongdang-domain-auth.mjs
ops/test-pongdang-registration.mjs`와 `ops/verify_local.py`의 명시적 프런트 파일
검사를 사용한다. 중계 테스트는 중앙 저장소 계약을 모의한 격리 객체로 실행하므로
실제 서버의 쓰기 마운트·해시 도구·Authelia 계정 갱신 성공을 증명하지 않는다.

설치 이미지의 실제 중앙 라이브러리는 `ops/test-pongdang-registration-central.mjs`로
검증할 수 있다. `PONGDANG_CENTRAL_TEST_LIBRARY=/app/ops/sso/admin/lib.mjs`를
설정하고 코드와 앱 목록만 읽기 전용 마운트한 격리 컨테이너에서 실행한다. 운영
사용자 DB는 마운트하지 않는다. 검사는 새 임시 파일에만 저장하고 실제 Argon2
해시·비밀번호 검증·정확한 Pongdang 앱 권한·기존 레코드 보존을 확인한 뒤 제거한다.
