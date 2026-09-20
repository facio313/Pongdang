# 현재 작업 · 브랜치 통합·정리 및 운영 배포 · 2026-09-21

- 사용자 승인: 수정 커밋, 도구 브랜치 통합·삭제, main 머지·push·운영 배포. 유지할 이름: main, dev, feature/connect, feature/today-page, feature/api. .env·SSO·키·DB 스키마 변경 없음.
- 수정 커밋 68648ca와 최신 main 9e6055f를 dev에 통합했다. 최신 카테고리별 UI/공용 조회/지도 배치 API와 R37/R22/R60 등 검증된 수정 모두 유지한다. report.md 완료 23개는 백업과 바이트 동일하다.
- 로컬 검증: frontend lint/106 unit/build, Ruff lint/format, backend 1170 passed/2 Docker skips. 전체 browser 121 통과 뒤 화면 단계 변경에 따른 검사 순서 1개 수정, 해당 6개 재실행 전부 통과. 390×844 실제 클릭·노트 간격·신호 비차단·중복 없는 저장 확인과 원래 취향 복구 완료.
- 외부 bundle 및 번호 복사본 120개 보존: `/Users/cksmacbook/.codex/backups/pongdang-branches-2026-09-21-e66k67t8/`. `.byeori/`, 기존 stash, feature/connect worktree의 로컬 의존성은 보존한다.
- Cursor d86cee2의 대체된 실험은 파일 변경 없는 ours merge로 이력을 보존한다. 이후 dev CI → 동일 SHA main CI/자동 배포 → 불필요 브랜치/깨끗한 report worktree 정리 순서다. 최종 Actions URL·배포 SHA·브랜치/health 결과는 백업 디렉터리 `release-verification.json`에 기록한다.
- 상세 결정·검증: [BRANCH-CONSOLIDATION-2026-09-21.md](BRANCH-CONSOLIDATION-2026-09-21.md). 자동 검사 DB 51907은 검증 뒤 종료하며 기존 확인 서버 5173/8000/51906은 유지한다.

# 이전 작업 · R37 노트 겹침 / 카드 신호 / 태그 중복 · 2026-09-21

- 범위: STEP 1 노트와 sticky CTA 겹침, STEP 2 신호의 전면 busy 차단, 서로 다른 카테고리의 같은 라벨 중복 전송만 수정. 기존 변경과 R37/R22/R60 완료 상태·23개 집계 유지. 커밋·푸시·배포·.env·SSO·키·스키마 변경 없음.
- 구현: STEP 1 태그 간격과 CTA 높이 여유 공간, 카드 진행과 POST signals 분리 및 인라인 실패 안내, 전송 태그 문자열 Set 중복 제거. 카테고리 ID와 저장/후보/경로 액션의 busy·중복 제출 방지는 유지.
- 검증 완료: 수정 전 신규 회귀 3개 실패 재현. 최종 frontend lint/106 unit/build, 전체 browser 115개 통과. backend Ruff/format 및 pytest 1160 passed, 2 skipped, 2 warnings. lint/browser 동시 실행의 test-results 경합은 종료 후 순차 검사로 해소했다.
- 컴퓨터 유즈: 390×844 #recommend scrollY=0, note bottom=710.92, slot top=724, CTA bottom=768, tab top=780. CTA 실제 클릭→STEP 2. 좋아요/패스→다음 카드·busy=false·토스트 없음·오늘 탭 클릭 성공. 장소 온천+활동 온천 포함 저장 PUT200, GET tags=[물 보며 쉬기, 온천, 서핑], 빈 후보에서도 저장 안내 확인. 검증 후 원래 취향 복구·재조회 완료.
- 격리: 실제 화면 5173/8000/51906 pongdang_test 유지; 자동 검사용 새 51907 pongdang_test는 종료. 운영 DB 접근 없음. 로그 `/tmp/pongdang-r37-residual-*`; 상세 [REPORT-R37-RESIDUALS-2026-09-21.md](REPORT-R37-RESIDUALS-2026-09-21.md).
- 요청한 세 잔여 수정·검증 완료. report.md는 작업 시작 복사본과 바이트 단위로 동일하다. 명시적 제외 항목은 그대로 유지한다.

# 이전 작업 · R37 / R22 / R60 완료 기준 수정

- 목표: 추천 핵심 CTA의 하단 탭 겹침, 제품 문장의 원본 자료 상태 코드, 취향 마법사의 서버 선택 한도 불일치만 수정한다.
- 브랜치 `feature/connect-cursor`, 기준 `4a20c72`. 커밋·푸시·배포·.env·SSO·키·DB 스키마·점수 계산식 변경 없음. 기존 사용자 `report.md`는 세 항목의 상태 행만 최종 결과로 갱신했고 `.byeori/`는 보존했다.
- 구현과 컴퓨터 유즈 확인 완료. frontend lint/106 unit/build, backend Ruff/1160 pytest 통과. 전체 browser 110개 통과(기존 예보 테스트 응답 종료 경쟁 보완).
- 로컬 실제 클릭은 5173/8000/51906 `pongdang_test`, 자동 검사는 별도 51907 `pongdang_test`를 사용하고 종료했다. 기존 확인 서버는 유지했으며 운영 DB는 사용하지 않았다.
- 상세 근거: [REPORT-COMPLETION-FIXES-2026-09-20.md](REPORT-COMPLETION-FIXES-2026-09-20.md). 요청한 세 항목의 잔여 작업 없음. Docker CLI가 없어 Compose 검사 2건은 skip이다.

# 이전 작업 · report.md 선별 결함 수정

- 최종 구현·검증: [REPORT-FIXES-2026-09-20.md](REPORT-FIXES-2026-09-20.md). 지정한 29개 항목과 컴퓨터 유즈에서 추가 재현한 R04 빈 region 422 / R04·R05 실제 해변 station 404를 수정했다. 실제 송정해수욕장 즐겨찾기·초안·코스 저장 및 재조회, 송정해변 초안 추가를 로컬 실제 데이터 복사본(pongdang_test)에서 확인했다.
- 최종 검사: 프론트 lint / 106 tests / build, 브라우저 101 tests, 백엔드 Ruff lint/format / 1,160 tests 통과. Docker CLI 부재 Compose 2 skips, 기존 deprecation 2 warnings. 자동 검증은 별도 pongdang_test(51907)에서 수행했다.
- 사용자 후속 요청에 따라 커밋 대상에 포함한다. 사용자 원본 report.md·.byeori/는 제외. 푸시·운영 배포·SSO·.env 변경 없음. 명시적 제외 항목은 그대로 유지했다.
- 확인용 로컬 서버 5173/8000 및 실제 데이터 테스트 복사본 51906은 실행 중이다. 구독의 로컬 SSO 미설정 503과 운영 세션·Origin 미검증을 정상 동작으로 포장하지 않는다. 유료 AI·실제 외부 경로 호출은 미실행이며 관련 동시성/오류 처리는 자동 회귀로 검증했다.
- 아래는 이전 예보 복구 작업의 기록이다.

# 이번 주 예보 복구 · 2026-09-20

- 최신 상태: 이후 main e1d5328 통합 및 사진·루나 추천 관련 다른 세션/Cursor 커밋을 포함했다. 사용자가 전체 main 푸시를 명시적으로 요청하여 dev CI 검증 후 main 자동 배포 흐름으로 진행 중이다. 이전 작업 시점의 커밋·배포 상태와 구분하며 상세 이력은 [MAIN-INTEGRATION-2026-09-20.md](MAIN-INTEGRATION-2026-09-20.md)를 참조한다.
- 후속 확인 완료: 16:10:05 KST에 실제 7일 forecast가 모두 HTTP 200이고 값·coverage가 유지됨을 확인했다. 자동 확인 pongdang은 PAUSED이며 추가 실행하지 않는다. 운영 반영 여부는 main CI·배포 결과로 별도 확인한다.

- 요청: main pull, 예보 미표시 원인 확인·계획·조치·정상 확인 후 알림.
- 브랜치: feature/connect-cursor. 깨끗한 1798dd9에서 origin/main 377b20e로 fast-forward 완료. 이 작업에서는 커밋·푸시·운영 배포를 실행하지 않았다.
- 완료 기준: 실제 수집 자료로 7일 조건 API와 로컬 오늘 화면이 표시되고 이력·결측·실패 의미를 보존한다.
- 원인: condition_api.py의 revisions/slots 조인에서 COALESCE 원자료 ID 비교가 잔여 필터로 남아 약 5,645만 행을 비교했다. 실제 실행 5.5~6.8초로 읽기 전용 API의 statement_timeout=3초를 초과했고 7일 모두 HTTP 503이었다. 수집 자체는 성공하고 있었다.
- 수정: known CTE에서 source_key를 한 번 계산해 조인에 재사용. 제한 시간·DB 스키마·저장 데이터는 변경하지 않음. 데스크톱/모바일 주간 예보의 조회 중·실패·자료 없음 표시를 구분.
- 로컬 적용: 기존 개발 백엔드를 같은 app.main:create_app, 127.0.0.1:8000으로 재시작. frontend 127.0.0.1:5173/pongdang/#today에서 실제 표시 확인.
- 실제 확인: 로컬 pongdang DB 경포해수욕장 spot_id=582, 수영, 9/20~9/26 각 12:00 KST. 7개 HTTP 200, 응답 0.296~0.368초. 화면/API 값 일치: 65.7, 74, 68.2, 81.7, 79.2, 80.2, 50.7. 9/20은 3/4, 9/21~23은 4/4, 9/24~26은 2/4 근거의 참고 점수이며 안전 판정이 아니다.
- 검증: Node 24.21.0으로 frontend lint / 단위 테스트 / build 통과. backend Ruff lint/format 통과. 전체 pytest 1,087개 통과(52.54초), 이 중 이력 4,704건으로 7일 조회하는 회귀 포함. 예보 관련 Playwright 4개 통과(데스크톱 실제 서버값, 로딩/실패/결측 구분, 모바일 날짜 전환, 모바일 조회 실패).
- 테스트 격리: 새 PostgreSQL 18 클러스터 /tmp/pongdang-forecast-test.Pg5A4N, 127.0.0.1:55439, pongdang_test 사용. 초기 SQL_ASCII로 만든 테스트 DB에서 bytes 관련 실패가 나 UTF8 DB로 다시 만든 뒤 통과했다. 실제 수집 DB에 테스트 데이터를 쓰지 않음. 전체 결과 로그는 해당 임시 경로 backend-tests.log.
- 동시 작업: 사진/첨부 기능 관련 다른 작업의 파일 변경이 작업 중 들어왔다. 그대로 보존하며 본 작업의 검증을 그 기능 전체 검증으로 해석하지 않는다. 예보 변경 파일은 condition_api.py, test_condition_score_integration.py, TodayDesktop.tsx, TodayPage.tsx, desktop-screens.spec.ts, product.spec.ts.
- 후속: 이 작업에 heartbeat 자동 확인 `pongdang`(Pongdang 예보 복구 후속 확인)을 생성했다. 15분 뒤 로컬 7일 API/가능하면 화면을 읽기 전용으로 재확인하고, 성공 유지 또는 필요한 조치를 한 번 알린 뒤 PAUSED로 전환한다.
- 운영: 최신 main 377b20e의 기존 CI/deploy 성공은 확인했지만 이 수정은 운영에 배포되지 않았다. 운영 URL은 미인증 요청에 302. 사용자에게 로컬/운영 중 대상 확인 질문을 남겼으며 답변 전에는 로컬 복구와 운영 복구를 혼동하지 않는다.
