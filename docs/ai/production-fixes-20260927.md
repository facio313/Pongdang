# Pongdang 운영 점수 갱신·OAuth 연결 수정 · 2026-09-27

## 최종 상태

코드 수정·main push·자동 배포·점수 재게시·실제 홈페이지 갱신을 완료했다.
로그인 연결과 취소·실패 처리는 운영에서 확인했지만, 제공 계정이 중앙 SSO의
1차 인증에서 401로 거절되어 로그인 성공 후 개인 자료 조회는 확인하지 못했다.
계정 정보와 쿠키는 기록하지 않았으며 계정·공통 SSO·권한 정책도 변경하지 않았다.

- GitHub main / 운영 current / 앱 세 컨테이너 SHA:
  `51b4a3c4aa5669033231e4bea47c90ff0cf53adf`.
- [CI 36315532712](https://github.com/facio313/Pongdang/actions/runs/36315532712):
  backend·frontend 이미지 빌드 성공. 호스트 감시기 같은 run attempt 1의
  `outcome=success`. 별도 중복 CI·수동 배포 없음.
- 최종 Pongdang frontend/backend/collector/DB 모두 healthy.
  내부 `/api/health`, `/api/ready` 및 외부 `/pongdang/api/ready` 모두 HTTP 200.
- 점수 작업: 자동 재시도가 11:35:49→11:43:58 UTC에 성공했다.
  `last_success_at=2026-09-27T11:43:58.327038Z`, 실패 횟수 0, 오류 없음.
- 새 generation 756: revision 348444, 계산 기준
  `2026-09-27T11:35:49.828712Z`, 게시
  `2026-09-27T11:43:57.952682Z`, 133,915건, 재사용 7,907건.
  이전 generation 745의 게시 기록도 남아 있다. 원자료·게시 결과 초기화 없음.
- 실제 Chromium 홈페이지: 추천 API HTTP 200 / generation 756,
  화면 관측 기준 **9월 27일 20:35**, 대표 추천 **휴식 69.4**,
  서핑 **57.9**, 수온 23.36°C, 파고 0.6m 확인.
  시작 시 화면은 9월 25일 19:28 / 서핑 64.8이었다.
- 비로그인: 알림·취향 API JSON 401 / no-store / 리디렉션 없음.
  알림의 로그인 안내와 버튼 표시, Failed to fetch 없음.
- 로그인 버튼 → 실제 중앙 SSO 비밀번호 입력 화면 연결 확인.
  취소 후 뒤로가기 2회 → 원래 `/#today`, 개인 API 재조회/401 확인.
  제공 계정의 실제 1차 인증은 401이므로 추가 시도 중단.
- 검증: backend 관련 23개, frontend 단위 184개, 관련 브라우저 11개,
  수정 파일 lint·format·증분 타입 검사, nginx -t 통과.
  폐기용 DB 두 개는 검증 후 제거했다. 운영 인증 성공을 모의 응답으로 대체하지 않았다.

## 변경 파일과 복구

- Backend: `backend/app/water_index/condition_retention.py`,
  `backend/tests/test_condition_retention_integration.py`.
- Frontend: `frontend/src/AppShell.tsx`, `NotificationSummary.tsx`,
  `NotificationsPage.tsx`, `loginPopoverState.ts`, `main.tsx`,
  `pongdangDesktop.tsx`, `ssoLogin.ts`, `travelApi.ts`.
  같은 src의 `loginPopover.tsx`, `loginPopover.css`는 제거했다.
- Frontend tests: `frontend/tests/connectionErrors.test.mjs`,
  `ssoLogin.test.mjs`, `browser/login-flow.spec.ts`.
- 운영 템플릿·안내: `ops/nginx-pongdang-api-errors.conf`,
  `ops/nginx-pongdang-api-error-handlers.conf`,
  `docs/operations/pongdang-domain-auth.md`.
- 호스트 수정: `/etc/nginx/sites-available/pongdang.site`,
  `/etc/nginx/snippets/pongdang-domain-proxy.conf`.
  신규 snippet: `/etc/nginx/snippets/pongdang-api-errors.conf`,
  `/etc/nginx/snippets/pongdang-api-error-handlers.conf`.
- 백업: `/home/cks/.local/share/pongdang-nginx-backups/20260927-production-fixes/`.
  [복구 절차](../operations/pongdang-domain-auth.md)에 따라 기존 두 파일을
  복원하고 nginx -t 후 reload하면 된다.
- 기존 CURRENT.md 변경과 dev refs `549c0b5`를 보존했다. 작업 브랜치
  `fix/production-projection-oauth-20260927`도 남아 있다.
  이 기록과 CURRENT 갱신은 로컬 인수인계이며 추가 배포용 커밋을 만들지 않았다.

## 진행 중 확인한 근거와 당시 상태

- 목표: 운영 condition_projection timeout 원인 수정 및 기존 worker 경로 1회 정상 게시, pongdang.site OAuth 로그인·개인 API 오류 처리 수정, main CI/자동 배포 후 실사이트 확인.
- 승인: Pongdang 코드 커밋/main push/운영 배포 및 필요한 Pongdang 호스트 설정 변경. 다른 서비스/공통 SSO 정책 변경은 범위 밖. dev refs 보존. 운영 원자료·게시 결과 초기화/테스트 데이터 삽입 금지.
- 시작: 원격 main과 current/컨테이너 SHA `4149b54088b248b70fa2e1792a6931ffe7aecdf3`, CI `36313935051` 두 이미지 성공. 로컬 main `705bd65`를 fast-forward하고 `fix/production-projection-oauth-20260927` 분기. 기존 CURRENT.md 미커밋 기록은 보존/커밋 제외.
- 점수 원인: DB 로그의 2026-09-27 06:12:15 UTC timeout SQL은 `RetainedPublication.records()`의 이전 결과 조회. EXPLAIN에서 시간조건은 인덱스 조건 밖 OR 필터이며 candidate마다 상관 `max(prior.target_start)` 집계 실행. 잠금 대기 없음. 마지막 성공 09-25 10:40:20 UTC, 게시 generation745 computed09-25 10:28:43 UTC.
- 인증 원인: 개인 API 401이 OAuth 시작302로 변환되어 fetch가 외부 로그인을 따라감. 새 로그인폼의 `/sso/api/state`는 이 도메인에서 앱 HTML fallback. 기존 `/pongdang/auth/continue` → `/oauth2/start` → 중앙 SSO → 같은 continuation 경로를 사용하도록 수정 중.
- 검증 환경: 이번 작업의 별도 tmpfs PG18 `pongdang-projection-fix-test-20260927` loopback32768, `pongdang-auth-fix-test-20260927` loopback32769. DB/user는 pongdang_test, trust인 폐기환경만 사용. 운영 환경파일 사용 안 함.
- backend 검증: 관련23개 통과(기존21개 + 신규2개; 신규 fixture의 as_of 오류를 고친 뒤 integration7개 재확인), Ruff/format/diff check 통과. 운영 read-only 동일40키에서298행 완전일치, EXPLAIN ANALYZE 354.525ms/556,718 buffer hits → 4.553ms/2,180 hits, 반복집계3,401회 제거. timeout 값 변경 없음.
- 호스트 반영: `/etc/nginx/sites-available/pongdang.site`, `pongdang-domain-proxy.conf` 변경; `pongdang-api-errors.conf`, `pongdang-api-error-handlers.conf` 추가. 백업 `/home/cks/.local/share/pongdang-nginx-backups/20260927-production-fixes/`. nginx -t 성공/reload active. 실제 개인API401 JSON/no-store/no Location, continuation302 확인. 복구절차 `docs/operations/pongdang-domain-auth.md`.
- frontend 검증: 수정 lint/단위184개/증분 typecheck/관련 Playwright11개 통과. 기존 root소유 검증 캐시 때문에 cks 검증시작이 실패한 것은 root 검증실행으로 해결. 모의 OAuth302 테스트1개는 fixture 이동방식 수정 후 단독재실행통과. 실제계정 인증이 아니라 disposable DB/모의응답을 사용한 구독·이력 재조회 계약검증이다.
- 배포: GitHub main 및 current/frontend/backend/collector SHA `51b4a3c4aa5669033231e4bea47c90ff0cf53adf`. CI36315532712의 두 이미지 성공, 감시기동일run attempt1 outcome=success. Pongdang4컨테이너healthy, 내부health/readiness200. 별도 수동빌드/배포/CI dispatch 없음. 기존 CURRENT와 본 작업메모는 커밋 제외. dev refs549c0b5 보존.
- 운영계산: 실행중작업/active DB transaction없음을 확인한 뒤 collector의 기존 `python -m app.ingestion.worker --once --force --job condition_projection`을1회 시작. 첫 실행11:26:06→11:34:53 UTC는 조회timeout 없이 merge까지 완료했으나 병행 수집으로 입력revision이 바뀌어 최종검사 `CONDITION_INPUT_CHANGED`로 rollback. 기존 worker의30초재시도예약 후 상시수집기가11:35:49 UTC 자동재시작했다. 다른 running job없음, revision348444. 중복수동실행/실패초기화/안전검사완화 없음. 자동재시도 게시결과 대기중.
- 운영인증: 배포 asset JS `index-CDCp32Q_.js`, CSS `index-BA-azCuU.css`. Chromium 실제 `/#today`의 개인 API401, 로그인 필요/버튼 표시, Failed to fetch없음. 버튼→중앙SSO `/sso` 비밀번호입력 존재 확인. 로그인 취소 후 뒤로가기2회로 `/#today` 복귀, 개인API401재조회/로그인버튼/Failed to fetch없음을 확인. SSO SPA가 추가 history entry를 만들어 뒤로가기1회만 기대한 진단스크립트는 timeout, 실제2회경로 확인으로 해소. state없는 OAuth실패callback은403거부를 별도확인했다.
- 실계정검증: 사용자가 제공한 계정으로 중앙SSO 입력폼을 통해 실제 로그인 시도. Pongdang으로 돌아오지 않았으며 원인확인용 시도에서 중앙 `/sso/api/firstfactor`가401을 반환함을 확인했다. 추가재시도 중단. 자격증명/쿠키/인증코드/개인자료는 작업파일에 저장하지 않았고 중앙계정·권한정책도 변경하지 않았다. 실제 로그인성공 및 저장개인자료조회는 미검증이다.
- 기타: 시작 브라우저홈09-25 19:28/서핑64.8, API generation745로 문제재현. Python urllib은 edge403이었으나 curl/Chromium 실제 도메인은 정상 응답하여 도구차이를 앱 결함으로 취급하지 않는다. 검증용tmpfs DB2개 종료/제거완료(해당임시자료만폐기).
- 다음: 회귀/쿼리 비교, nginx 백업·검사·reload, main 통합/push, 자동 배포 완료 후 worker lock 확인 및 기존 CLI1회, 게시/실사이트 확인. 실제 계정이 없으므로 로그인 성공의 운영 검증은 미확인으로 구분한다.
