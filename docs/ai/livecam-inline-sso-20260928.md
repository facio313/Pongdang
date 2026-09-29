# 라이브캠 복구·페이지 내 비동기 SSO 로그인 · 2026-09-28

- 목표: 운영 라이브캠 이미지 표시, 기존 아이디/비밀번호 모달 유지 및 페이지 이동 없는 SSO 연결. 사용자 확인: 새 창이 아니라 페이지 안의 기존 로그인 팝업이다.
- 제약: 오늘 데이터와 미래 7일 유지. dev refs·타 서비스·공통 SSO 권한/CORS/iframe 정책 변경 금지. 비밀번호·쿠키·OAuth code/state 기록 금지. main 이미지 CI→호스트 감시기 배포 유지.
- 기준: main/운영 `1824fa0943d5ad84ad9a1a32c24e646367b394c1`. 기존 CURRENT와 두 미커밋 작업 문서 보존. 작업 브랜치 `fix/livecam-sso-popup-20260928`.
- 라이브캠 완료: 기존 `app.livecams.catalog --refresh` 1회(잠금 없음 확인, 일일 30회 제한 유지), 2026-09-28T05:29:02Z 카탈로그26개/이미지26개 저장. 이전 revision은 superseded로 보존. 실제 pongdang.site 목록 첫 페이지25개 모두 naturalWidth=200/표시 성공, 이미지 없음0.
- 갱신 전 세 표 백업: `/home/cks/.local/share/pongdang-deploy/backups/livecam-recovery-20260928/windy-before-refresh.dump` (0600, custom archive, TOC 확인). 복구가 필요하면 별도 DB에 복원하여 필요한 Windy 레코드만 복구하며 운영 전체 복원 금지.
- 로그인 근거: 중앙 Authelia v4.39.20, 기존 pongdang-site OIDC client는 one_factor/implicit consent/authorization_code/PKCE S256. 기존 도메인 권한 브리지가 OAuth 세션과 최신 계정·access-pongdang 권한을 매 요청 검사한다. 중앙 도메인 쿠키를 Pongdang에 복제하거나 CORS/iframe 정책을 완화하지 않는다.
- 구현: Pongdang 전용 브리지에서 기존 중앙 1차 인증→OAuth 코드 교환→기존 권한 검사까지 수행하고 Pongdang의 원래 Secure/HttpOnly 세션 쿠키만 반환한다. 별도 계정/비밀번호/SSO 토큰 저장소는 만들지 않는다. 전역 모달 provider로 독립 알림 화면에도 적용하고 성공 후 실제 세션 재확인·공통 resource 무효화로 저장 자료를 다시 읽는다.
- 검증: 변경파일 ESLint 통과, Node193 tests 통과, 타입 검사 통과. 브리지24 tests 통과(동일 권한 게이트, PKCE/state, 쿠키 격리, 출처/비밀 검증, 입력 크기/속도 제한). 폐기용 loopback pongdang_test32779에서 관련 브라우저7 tests 통과(390/1440 모달, 실패/취소, 성공 후 설정·이력 재조회, HTML fallback 방어, 권한 거절). 모의 성공을 실제 운영 로그인 성공으로 취급하지 않는다.
- 환경 문제: 기존 root 소유 타입 캐시만 cks 소유로 정상화 후 타입 검사만 재실행. 기존 root Python 경로는 권한을 넓히지 않고 동일 폐기용DB로 root에서 브라우저 실행. 점유된5177은 건드리지 않고 비어 있는52977/58979를 사용했다. 테스트 서버 종료 확인.
- 호스트 적용: `authorization.mjs`와 `/etc/nginx/sites-available/pongdang.site`를 `/home/cks/.local/share/pongdang-deploy/backups/inline-login-20260928/`에 백업했다. 저장소의 `ops/pongdang-domain-auth.mjs`, `ops/nginx-pongdang-inline-login.conf` 설치, 사이트에 include1줄 추가. Node22 구문 검사/nginx -t 통과 후 Pongdang 전용 domain-auth만 재시작·nginx reload. health 정상, 실제 public auth/state401·notifications401·cross-origin login403 확인. 중앙 SSO·권한정책·OAuth 설정은 변경하지 않았다.
- 코드/배포: 관련12파일만 `fc463e63373302d4a9e51a6d3e485b3470234f23`으로 main 통합/push 완료. CI36383684822 backend/frontend 이미지 모두 성공, watcher outcome=success. current 및 앱3개 태그가 같은 SHA, Pongdang4컨테이너와 domain-auth healthy, health/ready200. 추가 dispatch/수동 동일SHA 배포 없음. 기존 CURRENT 및 작업 메모는 커밋 제외.
- 실제 운영 UI: 새 Chromium 390/1440에서 페이지 내 아이디/비밀번호 팝업 표시, pageCount1/URL `/#today` 유지, Escape 닫기·비로그인 유지·Failed to fetch0 확인. 모바일 빈 로그인 모달 캡처 `/tmp/pongdang-inline-login-mobile.png` 직접 확인.
- 배포 후 라이브캠 재확인: 홈 이미지3/3 로드, 목록 첫 페이지25/25와 두 번째 페이지1/1 로드, 이미지 없음0.
- 실계정 확인: 사용자가 이전 제공한 테스트 계정으로 새 팝업에서 단1회 시도. 중앙 firstfactor가401을 반환하여 브리지에 `SSO_INVALID_CREDENTIALS` 기록. 자동 브라우저 진단에서 response.json의 CDP body 수집이 실패했으므로 그 시도의 상세 화면 문구는 검증 근거로 쓰지 않는다. 재시도·계정/권한 변경·가짜 헤더 없음. 사용자에게 정상 SSO 계정으로 직접 로그인 후 팝업 종료/알림 재조회 확인을 요청했다. 실제 성공 세션 및 개인 자료 재조회는 아직 미검증이며 목표는 활성 상태다.
- 테스트 종료: 직접 만든 `pongdang-inline-login-test-20260928`(tmpfs, pongdang_test32779)만 stop/rm했다. 테스트 서버52977/58979 해제 확인. 운영 DB 오늘 데이터·retention 설정은 이번 작업에서 변경하지 않았다.
- 인증 추가 근거: 기존 도메인 권한 브리지의 store를 읽기 전용으로 확인해 제공된 계정이 존재하고 비활성 상태가 아니며 Pongdang 권한을 보유함을 boolean으로만 확인했다. 비밀번호·계정 레코드·SSO 쿠키는 출력하지 않았다. firstfactor401의 세부 원인을 비밀번호 오류라고 단정하지 않으며 중앙 계정/잠금/권한을 임의 수정하지 않는다.
- 해당 단일 요청 시간대(05:53:20Z~05:54:10Z)의 중앙 JSON 로그를 원문 출력 없이 분류해 `credential_check_failed=1` 확인. 본문 형식·계정 조회·세션 provider 오류 분류는 없었다. 즉 연결 실패나 Pongdang 권한 거절이 아니라 중앙 자격 증명 검사가 거절한 상태다. 정상 계정의 실제 성공 확인만 사용자 응답을 기다린다.
- 06:01Z 후속 목표 턴 재확인: main/current 모두 fc463e6 유지. 05:54:01Z 이후 새 inline 로그인 성공/실패 기록 모두0이며 사용자 로그인 결과 응답은 아직 없다. 앞선 구현 턴은 진행, 이번 턴은 동일한 실제 성공 검증 차단 상태의 재확인(연속2회)이다. 제공 계정 재시도·추가 CI·전체 검증·계정 변경 없이 목표 active 유지. 해제 조건은 정상 중앙 SSO 계정으로 본인 브라우저에서 팝업 로그인 및 알림 조회 확인이다.
- 06:03Z 차단 감사: 같은 정상 계정 검증 부재가 연속3개 목표 턴에서 확인됐다. 새 로그인 성공/실패 기록도 여전히0이고 사용자 결과 응답이 없으므로 목표를 blocked로 전환했다. 변경·배포·라이브캠·팝업 확인 결과는 유지한다. 정상 중앙 SSO 계정의 실제 팝업 로그인/알림 조회 결과가 오면 이 단계부터 재개하며, 임의 계정 생성/비밀번호 초기화/권한 완화는 하지 않는다.

## 2026-09-29 후속: OAuth→SSO 연결 복구

- 요청·범위: 로그인 오류 진단 후 사용자가 연결 복구를 요청했다. Pongdang 전용 호스트 OAuth 설정 변경과 해당 컨테이너 반영만 수행했다. 공용 SSO·계정·권한·운영 DB·dev refs는 변경하지 않았다.
- 확인 원인: 13:24~13:25 KST 실제 로그인은 토큰 교환 HTTP 요청이 `context canceled`로 끝나 브리지503을 반환했다. 기존 `bonifacio.work:192.168.75.98` 고정 매핑과 내부 HTTP 주소는 호스트에서는200이나 OAuth 네트워크에서는6초 timeout이었다. 연결을 막는 호스트 네트워크 규칙 자체는 변경하지 않았다.
- 호스트 변경: `/home/cks/.config/pongdang-domain/oauth2.cfg`의 redeem/JWKS/profile 주소를 `https://bonifacio.work/sso/...`로 통일하고 같은 디렉터리 `compose.yml`의 내부 IP `extra_hosts`를 제거했다. 기존 issuer/client/secret/cookie/PKCE/nonce/권한 검사를 유지한다. 통신은 기존 공개 SSO HTTPS 경로를 사용하므로 공개 경로의 가용성에 의존한다.
- 백업: `/home/cks/.local/share/pongdang-deploy/backups/oauth-connectivity-20260929.jYwukU/`에 기존 두 파일 보존(root 전용 디렉터리). 변경 파일의 cks:cks/0600 유지. 복구는 이 두 파일을 원래 위치에 복원하고 같은 Compose 파일의 `oauth2` 서비스만 재생성하는 범위다. 기존 설정으로 복구하면 이번 연결 장애도 재발할 수 있다.
- 반영: Compose 구문 검사와 설치된 OAuth2 Proxy의 `--config-test` 통과. `compose up -d --no-deps --no-build --pull never oauth2`로 13:38:50 KST 동일 이미지의 `pongdang-oauth2`만 재생성했다. 앱4컨테이너와 domain-auth 시작 시각·이미지는 유지했고 모두 healthy다. OAuth ping200, 앱 readiness200, 공개 홈200, 비로그인 auth/state·개인 API401 JSON/no-store/no redirect 확인.
- 통신 검증: 같은 네트워크에서 HTTPS 공개키·discovery200, 미인증 userinfo401을 확인했다. 실행 중 OAuth Proxy의 시작→의도적으로 유효하지 않은 코드 callback은861ms 안에 SSO 토큰 endpoint까지 도달했고 세션을 발급하지 않았다. 중앙 로그의 최초 응답은 `invalid_grant`였고, 라이브러리의 인증 방식 자동 재시도 때문에 최종 로그에는 `invalid_client`가 남았다. 이를 추가 운영 결함으로 판단하지 않는다. 기존 클라이언트의 Basic 인증을 별도 요청으로 확인해1000ms 안에 예상한400 `invalid_grant` 응답을 받았다. 정상 인증 코드의 전체 성공을 검증한 것은 아니다.
- 위 재시도 근거: [설치 버전의 OIDC 교환 코드](https://github.com/oauth2-proxy/oauth2-proxy/blob/v7.15.4/providers/oidc.go#L69)와 [의존 OAuth 라이브러리의 자동 인증 방식 탐색](https://github.com/golang/oauth2/blob/v0.36.0/internal/token.go#L199). 별도 nsenter/curl은 DNS 조회에 실패해 실제 OAuth 런타임의 연결 판정 근거로 사용하지 않았다.
- 브라우저: 13:42:13 KST 새 Chromium에서 제공 계정으로1회 시도. auth/state401·login401 JSON, 화면 `아이디 또는 비밀번호를 확인해 주세요.`, 처리 약2.2초 및 비밀번호 입력 제거 확인. 중앙1FA 거절은 별도 계정 문제이며 비밀번호 초기화·추가 계정 변경은 하지 않았다. 화면 `/tmp/pongdang-sso-after-repair-20260929.png` 직접 확인, 브라우저 종료.
- 완료·남은 점: 요청한 통신 연결 복구 완료. 제공 계정이1FA에서 거절돼 정상 계정의 실제 로그인 세션·개인자료 조회 성공은 미검증이다. 앱 release는 `d18bebc36d539e65b7307e81419b849859f81263` 유지. 커밋·push·CI dispatch·앱 재빌드/배포 없음. 기존 CURRENT 및 작업 문서 변경 보존.

## 2026-09-29 13:45 KST: 실제 로그인 성공 확인

- 사용자가 새로 제공한 계정으로 새 Chromium의 기존 페이지 내 팝업에서1회 로그인했다. 자격 증명·쿠키·토큰·개인 응답 본문은 작업 파일에 저장하지 않았다.
- 로그인 POST200 후 팝업이 닫혔고, 이어진 auth/state GET200과 `authenticated=true`를 확인했다. 로그인 후 알림 구독·이력 GET도 각각200으로 재조회됐다. 전체 처리 약3.2초, 브라우저 종료 완료.
- 앞선 계정의1FA401과 구분하며, 정상 계정의 실제 로그인 세션·개인자료 재조회 미확인 상태를 해소했다. 이번 후속에는 추가 설정·계정·권한·개인 데이터 변경 없이 로그인과 자동 읽기만 수행했다. 통신 복구와 실계정 검증 완료.
