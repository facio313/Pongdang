# 현재 작업 · report.md 선별 결함 수정

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
