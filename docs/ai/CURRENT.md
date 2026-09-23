# main 릴리스 진행 · 2026-09-23

- 사용자 승인: 로컬 화면 점검 후 main 병합·GitHub 푸시·운영 배포. fix/finale의 결과 저장 변경을 커밋하고 main에 직접 통합한다. dev refs와 로컬 산출물은 보존한다.
- v20 이관 이후 이전 v19 앱으로 자동 복구할 때 초기화가 거부되는 문제를 막기 위해 v19의 v20 수용 호환 릴리스를 먼저 배포한다. 상세와 기존 검증은 [CONDITION-REFRESH.md](CONDITION-REFRESH.md). 실제 배포 결과는 완료 후 이 문서에 갱신한다.
- 복구 호환 릴리스 `86c0460`은 Actions `35864038830`으로 운영 배포 성공. v20 초기화 수용과 legacy snapshot 세대만 읽는 복구 경로를 관련 7개 검사로 검증했다. 본 v20 병합은 검증한 `66ed89a` 제품 소스를 그대로 사용하며, 대체된 v19 전용 검사 3개는 v20 결과 저장·보존 검사로 대체하고 공통 초기화 계약 4개는 최종 코드에서 재검증했다.

# 조건 결과 백그라운드 갱신 · 2026-09-23

- 최신 작업: [CONDITION-REFRESH.md](CONDITION-REFRESH.md). 프론트 변경 없이 완료 결과 SELECT, 갱신/실패 중 이전 점수 유지, 독립 지표 보완 및 미래 예보30분 수집을 구현하고 **실제 로컬 적용·화면 확인까지 완료**했다. v20 migration과 새 generation330 게시, 과거23790행 복원, 현재/미래130003행 불변 및 옛 결과258770행 정리를 확인했다. 최종 관련54+6테스트/Ruff 통과. DB약22.64→12.85GB, 새 결과약1.11GB. 전체 사전백업 보관. frontend5173(PID69751)/backend8000(PID78366)/collector(PID78637,release1a3509d0e88e6646) 실행 유지. 운영·커밋·푸시 없음. 아래 기록은 이전 이력으로 보존한다.

# 데이터 유지·운영 반영 검토 · 2026-09-22

- 사용자 요청은 확인/검토이므로 제품 코드·배포·실제 DB 변경 없이 읽기 전용 점검. 기존 인수인계에 결과만 기록. cks-platform-ops 적용.
- main e3d29443e59a5a68221100529b1608c071ae6016 최신 확인. Actions35692900255 frontend/backend3shards/browser2shards/smoke/deploy 성공; 배포 로그15:05:47 KST에 같은SHA, 초기화 및 모든 컨테이너healthy/ready 성공 확인. 이는 당시 CI 관측이며 현재 운영 직접 관측은 아님. SSH22022 connection refused, 공개 health/ready/conditions 모두403으로 현 운영 데이터 검증 불가. 로컬WIP(v19/30초재조회/지점비교 등)는 아직 미커밋이라 해당배포에 포함되지 않음.
- 로컬 실제읽기: schema19, generation174=115640건15:24:16 게시완료, projection job succeeded/연속실패0, heartbeat최근. API 경포swim72.3/추천surf81.9, refreshing/retained=true, default-place preferred 정상. 새 자료 갱신 중 기존게시값 유지.
- 별도57519 pongdang_test에서 현재main schema.py를 git show로 로드하여 진짜v18 초기화→자료/게시→로컬v19마이그레이션→재게시→9일 수집중단 시점 조회 재현. 점수25.0 일관유지, 이전결과 표시true. 기존 관련49/154프런트/18브라우저 통과 결과도 검토. 테스트스키마 제거 및 테스트PG종료, 실서버유지.
- 확인된 배포차단위험: v19DB에서 이전main v18 initialize를 실행하면 ValueError(Unrecognized Pongdang schema version) 재현. ops/pongdang-deploy64는 이전compose 전체up으로롤백하고 initialize 의존성도 재실행하므로 v19배포후실패시 자동복구막힘가능. 현재배포main18 자체의새데이터유지 실패를관측한것은아님. 운영승격전에 구버전앱/신규스키마호환성 및 초기화롤백전략보완필요.
- 검증공백: ready는SELECT1, collector health는heartbeat만확인; 새점수게시/대표장소 응답 유지 보장은없음. CI성공만으로실제갱신완주단정불가. 서버측 제한된 읽기로 배포SHA/schema/projection job·게시상태/대표API확인이 추가로 필요. 제품코드수정/푸시/운영조작안함.

# 최신 main 반영 및 서버 재기동 · 2026-09-22 15:18 KST

- 요청: main 풀 후 서버 재기동. fix/finale a3cb8fb→e3d2944(4커밋) fast-forward, origin/main과0/0, 미해결 충돌0. stash0d60b9b175eae8316a94fc86bf646de6899f28f6 및 ~/.cache/pongdang-main-merge-20260922-151447/wip.patch 보존. 사용자 WIP는 unstaged, dev/커밋/푸시/운영 배포 없음.
- 통합 결정: main의 영속 점수 보존이 이전 로컬 관측소별 무효화 구현을 대체하므로 condition_storage는 새 main을 채택. 상충하는 로컬 과거 점수 테스트는 새 main의 유지/제한 회귀로 대체. 코스/가까운 지점 비교·계산 대기 재조회는 보존. main18과 로컬18 구분 위해 통합19로 마이그레이션; 로컬 잔여 TRUNCATE 트리거 제거 및 기존 게시 유지/재계산 예약. 이전 소스는 stash에 남아 있음.
- 검증: 프런트lint/154단위/typecheck 통과. 백엔드49관련 중 초기3실패(불필요한 옛 버전 revision 증가2, upstream 테스트의 UTC/KST 문자열 비교1)를 수정, 영향35 재실행 통과 및 나머지14 앞선 통과. 브라우저18(핵심8/점수 갱신/데스크톱 코스/주변비교) 통과. 시간 비교는 UTC 정규화로 의미 유지. 테스트DB 종료.
- 로컬 DB5432/pongdang만 schema backup ~/.local/share/pongdang/backups/before-local-schema19-20260922-151735.sql(0600) 후18→19 적용. frontend5173 PID23756/backend8000 PID23755/collector PID23762 최신 코드 실행. 로그 /var/folders/ns/8yh7k1zn3q9flcsx0msyzfhm0000gn/T/pongdang-dev-server-cazlqq91/. 페이지/health/ready/실제 조건API HTTP200. 경포 swim83.8, generation173, refreshing/retained=true로 이전 점수 유지하며 갱신 확인.

# 로컬 서버 재기동 · 2026-09-22

- 사용자 요청으로 병합된 코드 실행. localhost5432/pongdang v17 확인 후 schema-only 백업 ~/.local/share/pongdang/backups/before-local-schema18-20260922-103626.sql(0600), app.schema.initialize로 v18 적용 완료.
- frontend5173 PID33015, backend8000 PID33014, 최신 소스로 재설치한 collector launchd PID33027 실행. 로그 /var/folders/ns/8yh7k1zn3q9flcsx0msyzfhm0000gn/T/pongdang-dev-server-hzw1a2oi/.
- /pongdang/, /api/health, /api/ready 및 경포 nearby API 모두 HTTP200. 강문·사근진 비교 후보 확인. DB 전환으로 이전 게시 무효화, 수집기 새 점수 계산 대기 상태는 실제 API로 별도 확인. 운영 배포·Git 커밋/푸시 없음.

# GitHub main 재병합 · 2026-09-22

- 요청: 최신 main을 현재 fix/finale에 병합. origin/main만 fetch 후 1409368→a3cb8fb(8커밋) fast-forward 완료. dev 변경·커밋·푸시·배포 없음.
- 미커밋 작업은 stash 45e25271b409863323363a2b347a5a98aa2dd97b 및 ~/.cache/pongdang-main-merge-20260922-100010/ 패치로 보존 후 복원. stash는 복구용으로 유지. 9파일 충돌 해소, 모든 수정은 원래처럼 unstaged.
- 통합: main의 v17과 로컬 v17을 기존 통합 v18로 수용. 원격 retained/retention_allowed/latest_source_revision과 로컬 관측소 무효화를 결합해 무효화된 점수를 프런트가 보존하지 않게 함. 원격 30분 기본 갱신·실패/빈 응답 이전값 유지와 로컬 계산 중30초/서버 refresh_after 재조회를 함께 보존. 코스 경로·가까운 지점 비교 유지.
- 검증: lint/format/typecheck, 프런트151단위, 백엔드44관련(최종 invalidation/storage43 및 앞선 feature migration1), 브라우저22 모두 통과. 첫 백엔드 검사는 이전 테스트DB 잔여 fixture와 구버전16 기대값으로2실패; fixture 정리 및 새 main17 기대값 수정 후 관련43 재실행 통과. diff --check/미해결 충돌0 및 HEAD...origin/main 0/0 확인.
- 검증용57519 PostgreSQL과57520/57521 웹서버 종료. 개발5173/8000·collector는 재시작하지 않았고 실제5432 DB 마이그레이션도 하지 않음.

# 로컬 서버 종료 · 2026-09-22

- 사용자 요청으로 Pongdang Vite5173(PID72312), backend8000(PID9260), collector(PID5258), 작업용 Playwright daemon/browser(PID67344/67345) 종료. collector launchd 서비스를 bootout하여 현재 세션 자동 재시작도 중지. 해당 PID 소멸 및 5173/8000/57519/57520/57521 리스너 없음 확인.
- 기존 Homebrew PostgreSQL5432와 Redis6379는 프로젝트 개발 서버와 별도 서비스로 유지. 코드·DB 데이터 변경 없음. 아래 실행 중이라는 과거 기록은 이 종료 상태로 대체됨.

# 현재 작업 · GitHub main 병합과 충돌 해소 · 2026-09-21

- 요청: GitHub 최신 main을 가져와 현재 작업 브랜치에 병합하고 충돌 확인. origin/main만 명시적으로 fetch했고 fix/finale을50a9e72→1409368(9커밋) fast-forward. 로컬 main/dev 및 origin/dev 갱신·커밋·푸시·배포 없음.
- 보존: 수정/신규 코드28개를 ~/.cache/pongdang-main-merge-20260921-204800/에 파일·패치·SHA로 백업. 보존 stash d3cda702804a0f87f53a51793e0bac7e98303562를 적용 후 남겨둠. .byeori/.playwright-cli/output/.env는 건드리지 않음. 원래 미커밋·unstaged 상태로 복원.
- 충돌: stash 복원 시 backend/app/schema.py와 backend/tests/test_feature_migration.py 2개 발생, 해소 완료. 원격v16의 무변경 수집/미래·NULL timestamp 처리와 NOWAIT 잠금 재시도, 로컬v17의 관측소별 무효화를 함께 보존하도록 v18 마이그레이션으로 통합. v16 statement trigger를 정리 후 scoped row trigger만 설치하여 중복 실행 방지. 실제main v16→18과 로컬17→18 경로 회귀 추가.
- 검증: backend 관련47개 범위 중46개 통과, 첫1개는 이전 브라우저 테스트DB 잔여 fixture 때문에 실패. 정리된 동일 disposable DB에서 해당 invalidation 파일18개 재실행 모두 통과. Ruff, 병합된 프런트12파일 ESLint/141단위/증분typecheck 통과. git unmerged0, HEAD...origin/main 0/0, dev refs 전후 동일 확인. 코스 경로·점수 갱신·지점 비교·조회 중복 방지·핵심 흐름 브라우저20개 모두 통과(46.8초).
- 실행 환경: 테스트는 별도57519/pongdang_test만 사용하고 검증 후 해당 PostgreSQL 종료 확인. 현재 실행 중인 로컬 backend9260/collector5258은 아직 기존v17 코드·DB를 유지하며 이번 Git 병합 중 재시작/원자료DB 변경은 하지 않음. 통합 코드를 서버에 다시 띄울 때 app.schema --initialize로v18 적용 및 collector 소스 갱신을 함께 해야 함. 운영 적용은 별도 승인 범위.

# 현재 작업 · 기준 장소와 가까운 동일 유형 두 곳 비교 · 2026-09-21

- 요청: 오늘의 지점 비교를 선택한 장소 + 주변에서 가장 가까운 동일 유형 장소2곳으로 구성. CSS 변경 금지, 기존 변경 보존.
- 구현: GET /api/data/places/nearby?spot_id=...에서 전체 수집 카탈로그의 정규 장소를 대상으로 같은 place_kind만 직선거리(haversine) 순으로2곳 반환. 선택 장소와 그 별칭 제외, 다른 후보 별칭도 제거 후 LIMIT. 좌표 없으면 명시적 상태/빈 후보, 부족한 후보를 다른 유형으로 채우지 않는다. 읽기 전용, 새 DB 마이그레이션/외부 호출 없음.
- 프런트: useComparisonPlaces 공통 훅으로 기준 장소를 첫 행에 유지하고 두 후보를 이어 표시. 모바일/데스크톱 공통 적용, 해변 전용 필터 제거. 장소 전환 중 이전 장소의 후보 제거, 로딩/좌표 없음 안내와 직선거리 기준 문구 추가. 각 행 점수는 해당 ID의 기존 조건 API를 사용.
- 검증: 변경 파일 Ruff/ESLint,141프런트단위/증분typecheck 통과. 백엔드 장소/지역 기존14개 + 신규7개 통과(초기 fixture import가 lint 자동정리로 제거된 테스트 설정 오류를 수정 후7개 통과). 전체카탈로그105건 초과·유형·거리순·별칭·좌표누락·동거리·부족후보 검사. 브라우저 신규3 + 이전 갱신 유지2 + 핵심8 =13개 통과. CSS diff 없음.
- 실제 적용: 로컬 backend8000 PID9260으로 재시작, frontend5173 유지. 오늘 경포해수욕장→강문해변(약1.238km)→사근진해변(약1.589km) 표시 확인. 이 세 장소는 현재 같은 주변 관측 근거를 써 같은 점수가 나올 수 있다. collector/DB/운영 배포 변경 없음. 별도57519 테스트DB 종료, 커밋·푸시 없음.
- 관련: backend/app/livecams/places.py, backend/tests/test_nearby_places.py, frontend/src/useComparisonPlaces.ts, TodayDesktop.tsx, TodayPage.tsx, locales/conditions.ts, frontend/tests/browser/today-comparison.spec.ts.

# 현재 작업 · 오늘 지점 중복과 반복 점수 공백 · 2026-09-21

- 사용자 재현: 오늘 비교 목록이 경포 3건이고, 대기 중 점수가 없어졌다 복구된다. 직전 v16 수정과 한 시점 화면 확인만으로는 반복 갱신 문제를 해결하지 못했다.
- 실제 원인: default-place 후보가 place_alias를 무시해 582·7·7728(모두 canonical 7)을 각각 반환했다. 조위(khoa_tide_level) 기록 정정까지 전역 invalidated_revision을 올렸고, 게시에 약3분 걸리는 동안 전부 pending이 됐다. 계산 시작 기준 10분 제한도 근거 유효기간과 무관한 공백을 만들었다.
- 구현: 기존 장소 정규화 CTE로 후보를 중복 제거한 뒤 정렬·제한. v17은 관측소별 무효화 revision을 저장하여 해당 metrics/context_metrics를 쓰는 봉투만 차단한다. 제한·위치·매핑 변경의 기존 차단은 유지. 임의10분 표시 종료를 제거하고 저장된 대상 시간 구간/원자료 유효기간을 준수한다. 재계산은 refreshing 표시/30초 재조회. GET 계산·가짜 자료·CSS 변경 없음.
- 검증: backend 관련80개 중77개 통과, 대량 결측 수집3개가 이전값 조회의 정렬 비용으로 timeout. 최신값 탐색 인덱스와 동일 순서를 추가 후 영향받는 storage20 + projection_scope10 모두 통과(19.58초). v15/v16 마이그레이션·관련/무관 관측소·정정·실제 만료·늦은 게시·중복 장소 회귀 포함. frontend lint/141단위/typecheck 통과. 모바일/데스크톱 재계산 중 값 유지·교체2 + 핵심8 browser 모두 통과.
- 로컬 적용: 기존 전체 원자료 백업 보존, 추가 schema 백업 ~/.local/share/pongdang/backups/before-local-schema17-20260921.sql(0600). 기존 게시 완료 후 로컬5432/pongdang만 v17 적용 완료. backend8000 PID5262/frontend5173 PID72312/collector releasea3b089d5622c981f PID5258. 기존 수집기89974 종료 확인. 오늘 화면 경포·송정·주문진 61.8/61.8/64.3, 오늘 예보72.1 및 refreshing 문구 확인. 실제20:35:32~20:38:03 KST 30초 간격6회 API에서 세 지점 점수와 오늘12시 예보를 확인했고 빈 값0회. generation14/refreshing → generation15/ready 교체 및 새로고침 없이 브라우저의 갱신 중 문구 제거 확인. 관측소14의 같은 주변 자료를 쓰는 경포·송정은 점수가 같으며 각 해변 직접 실측으로 간주하지 않는다. 증거는 /var/folders/ns/8yh7k1zn3q9flcsx0msyzfhm0000gn/T/pongdang-dev-server-qe5g2l82/continuity-live-check.jsonl. 별도57519 테스트DB 종료. 커밋·푸시·운영 배포 없음.

# 현재 작업 · 수집 갱신 중 빈 화면 복구 · 2026-09-21

- 사용자 요청: 시간대 예보를 수정했는데도 홈 전체 값이 다시 비는 문제를 실제 수집 갱신 과정까지 해결한다. CSS 수정·커밋·푸시·운영 배포 금지 유지.
- 확인: 원자료 갱신 때 모든 기존 condition_generation을 즉시 무효화하고, 새 계산 게시에는 약3분이 걸렸다. pending 빈 응답이 프런트10분 캐시에 남으며, 홈 추천 활동이 없어져 시간대 조회도 중단됐다. 값이 잠깐 나온 것만으로 완료라고 판단한 이전 검증은 불충분했다.
- 서버 변경: schema v16의 invalidated_revision으로 일반 관측 추가와 정정/충돌/제한/위치/매핑 변경을 구분한다. 일반 갱신에서는 최대10분 내의 유효한 기존 계산을 refreshing으로 반환하고 원래 근거 유효기간은 연장하지 않는다. 실제 정정·사용하던 값의 결측 전환은 즉시 차단한다. 점수에 안 쓰는 필드와 이미 없던 값의 반복 수집, 실제 변화 없는 metadata UPDATE/0행 UPDATE는 전체 표시를 무효화하지 않는다. GET 계산·시딩 없음.
- 프런트 변경: pending/refreshing 계산 응답만30초 간격으로 다시 읽는다. 완료된 계산은 서버 refresh_after에 맞춰 재조회하여 응답 수신 때마다10분이 다시 늘어나지 않게 했다. 실패/실제 자료 없음은 기존10분 간격. 이전 결과에는 ‘새 자료 반영 중 · 이전 계산 결과’ 표시. 과거 시간대 예보 유지 수정은 보존.
- 검증: 프런트 최종 수정lint/141단위/증분typecheck 통과. 백엔드 관련33개 통과 후 충돌/마이그레이션 보완43개, 미사용필드 보완26개, 반복결측 보완 최종storage16개 통과. 브라우저 기존 핵심8개 포함19개 통과 후 최종재조회조건 영향4개 재통과. 실제 홈62.6점/수온23.51°C/파고0.8m, 시간대81.7/48.3/55.8/55.8 표시 확인; 최종 실제 홈 수영62.5점/23.52°C/0.7m, 09/12/15/18시94/72.9/72.9/72.9 및 오늘 주간72.9점 확인. 새 계산 대기→자동복구와 서버 재조회기한 회귀를 포함한 최종 data-refresh 브라우저10개 통과.
- 로컬 적용: 스키마 백업 ~/.local/share/pongdang/backups/before-local-schema16-20260921.sql(0600), 기존 전체v15전 백업도 보존. backend8000 PID88702/frontend5173 PID72312. 수집기 최종release70616dd8ee2a2322/PID89974 및 최종 DB트리거 반영 완료. generation10/source_revision3606 게시 확인. 본래 데이터 유효기간과 결측은 유지한다. 별도57519 검증DB는 종료하고 로컬 미리보기/수집기는 유지한다.
- 첫 트리거 갱신은 게시 트랜잭션과 DDL잠금이 겹쳐 lock timeout으로 rollback됐다. 45초 대기도 후속 게시와 겹쳐 실패한 한 차례가 있었다. 이미 추가된 v16 테이블을 다시 잠그지 않고 최종 함수 본문만 교체하여 완료했다. 제품 연결의 timeout은 변경하지 않았다. 검증은 별도57519 pongdang_test에만 수행.

# 현재 작업 · 지난 시간대와 오늘 예보 표시 · 2026-09-21

- 사용자 요청: 시간이 지나도 홈의 오늘 09/12/15/18시 예보와 오늘 메뉴의 주간 예보 중 오늘 평가값을 표시한다. CSS 수정 금지.
- 원인: 실제 경포 예보 API에 오늘12시 72.9점/근거3/4가 있는데, useHourlyScores/useConditionDays가 예보 근거의 valid_until을 현재 시각과 비교해 숨겼다. 앞서 로컬 복구에서 오늘 시간대의 빈칸을 자료 부족으로 본 설명을 정정했다.
- 변경: 고정 대상 시각의 예보는 서버의 해당 시각 평가 결과를 표시하고 브라우저 현재 시각에 따른 만료 필터를 제거했다. 현재 관측·추천의 만료 처리, 데이터 갱신 및 오류·근거 없음 처리는 유지한다. 모바일과 데스크톱 공통 적용. CSS·백엔드 변경 없음.
- 검증: 수정3파일 lint, Node24 단위139개, 증분 typecheck 통과. 21:30 KST에 지난 시간대와 오늘 점수가 남고 실제 결측 칸은 –인 모바일/데스크톱 회귀2개, 현재 관측 만료/날짜 매핑/오류·부분 점수와 핵심8개 포함 브라우저14개 통과. 실제 로컬 오늘 화면의 주간 오늘72.9점/근거3/4 표시 확인. 릴리스 빌드·커밋·푸시·배포 없음.
- 별도 남은 현상: 원자료 수집 갱신 시 기존 condition_generation을 즉시 무효화하여 재계산 중 모든 점수가 잠시 비는 서버 동작은 이번 예보 시간 만료 수정과 별개이며 변경하지 않았다.
- 관련: frontend/src/useHourlyScores.ts, frontend/src/useConditionDays.ts, frontend/tests/browser/data-refresh.spec.ts. 로컬5173/8000은 유지하고 별도57519 테스트DB는 검증 후 종료한다.

# 현재 작업 · 로컬 미리보기 데이터 복구 · 2026-09-21

- 사용자 요청: 실행한 로컬 서버에서 어느 화면에도 데이터가 표시되지 않는 문제 조치. 원인: 127.0.0.1:5432/pongdang은 실제 원자료가 있으나 schema v10, 현재 앱은 v15. health/readiness의 SELECT 1만 성공하고 places/default-place/summary는 503이었다. 내 코스 rows=[]는 로컬 저장 코스 0건인 별도 상태.
- 로컬 DB를 ~/.local/share/pongdang/backups/before-local-schema15-20260921-191624.dump(479,040,695 bytes, 0600)에 백업하고 pg_restore --list 확인 후 기존 app.schema --initialize로 v15 적용. collection_place 6,665건·spots_waterspot 7,900건 보존. 장소 API200/강원151곳, 기본장소API200, summary200 및 실제 브라우저 명소151곳 표시 확인.
- 화면용 condition_generation이 없고 기존 LaunchAgent는 3b353d94ca36a90b 소스여서 새 condition_projection이 없었다. 첫 별도 생성은 기존 수집기 원자료 갱신으로 CONDITION_INPUT_CHANGED가 나 취소됐다. 기존 수집기를 멈춘 후 129,338건 게시 성공. 가짜 자료를 생성하거나 실패를 성공으로 처리하지 않았다.
- 수집기 plist를 ~/.local/share/pongdang/backups/collector-before-schema15-20260921.plist에 보존하고 ops/install-local-collector.py --python /Users/cksmacbook/.local/share/pongdang/runtime/bin/python으로 현재 소스의 LaunchAgent를 재설치·재기동했다. 새 release 2d84266c0e912532, PID75750, 로그 ~/Library/Logs/Pongdang/collector.log. 재기동 후 실제 최신 수집 데이터로 다시 계산하여 19:25:35 KST generation3/129,340건 게시 성공, source_revision1060 일치 확인.
- 실제 브라우저 검증 완료: 명소151곳, 지도 첫 페이지100곳과 경포69.4점/수온23.52°C/파고0.7m, 오늘 활동별 점수와 물때, 홈69.4점/23.52°C/사진/라이브캠 링크 표시. 자료가 없는 일부 지점·시간대의 –와 저장 코스0건은 별도 실제 상태로 남는다. health 응답만으로 데이터 정상 여부를 판단하지 않는다.
- 실행 중 미리보기: frontend127.0.0.1:5173/pongdang/, backend127.0.0.1:8000. PID frontend72312/backend72311, 로그 /var/folders/ns/8yh7k1zn3q9flcsx0msyzfhm0000gn/T/pongdang-dev-server-qe5g2l82/. 새 코드·CSS·.env·운영 서버·dev 변경 없음. 실제 기존 로컬 수집 데이터로 확인하며 가짜 장소/저장 코스를 만들지 않는다.

# 현재 작업 · 내 코스 지도에서 경로 계산 · 2026-09-21

- 요청: 데스크톱 내 코스의 경로 계산 버튼이 모바일 화면으로 넘어가지 않도록 하고, 버튼 위 코스 상세 목록에 방문 순서·이동 소요시간과 카카오 도로 경로선을 표시한다. 프런트 CSS 수정 금지.
- 구현: CoursesDesktop에서 기존 카카오 경로 API를 include_geometry=true로 호출한다. 같은 패널에서 출발지·시각·체류 조건을 입력하고, 반환된 순서·도착 시각·구간별/전체 이동시간·복귀와 출발/순번 핀·Polyline을 표시한다. CSS 파일과 백엔드는 변경하지 않았다. RouteRequestForm의 데스크톱 모드에서 기존 버튼 클래스를 재사용한다.
- 상태 처리: 요청 중 중복 계산 방지, 코스 전환 시 취소, 저장 코스 revision별 결과 분리, 실패한 재계산에서 이전 경로 제거, 누락 구간은 임의 직선으로 대체하지 않음. 기존 저장 코스를 자동으로 덮어쓰지 않는다. 기존 다른 화면의 #map?view=course 흐름은 이번 버튼 수정 범위 밖이다.
- 검증: 수정 파일 ESLint, Node 24 프런트 단위 테스트 139개, 증분 TypeScript 검사 통과. 브라우저 핵심 8개 + 빈 코스 1개 + 신규 경로 회귀 3개(12개) 통과. 마지막 버튼 보완 후 영향받는 신규 3개와 기존 모바일 경로 계산 1개(4개) 재검증 통과. 화면 캡처로 상세 패널·순서·시간·버튼 표시 확인. git diff --check 통과, CSS 변경 없음.
- 검증 환경/한계: 별도 PostgreSQL 18 disposable pongdang_test(57519), 브라우저 서버 57520/57521. 신규 테스트는 카카오 응답·SDK 로더를 페이지 내부 fixture로 대체하고 실제 KakaoMapCanvas에 전달된 선 좌표·정리 동작을 확인했다. 외부 카카오 실호출 및 운영 화면/배포는 미검증. 전체 빌드는 CI 소관으로 실행하지 않았다.
- 상태: 로컬 구현 완료. 커밋·푸시·배포 없음, dev 변경 없음. 기존 CURRENT 내용과 .byeori/, .playwright-cli/, output/ 보존. 검증 서버·DB는 검증 후 종료했다.
- 관련: frontend/src/CoursesDesktop.tsx, frontend/src/RouteRequestForm.tsx, frontend/src/locales/travel.ts, frontend/tests/browser/course-route-inline.spec.ts.

# 현재 상태 · 빠른 검증 CI main 배포 완료 · 2026-09-21

- 사용자 승인에 따라 Python 3.12 호환성 수정, 최신 main 통합, 커밋·main push·CI·자동배포 확인을 완료했다. dev 커밋·병합·동기화·push·배포는 실행하지 않았다.
- 작업 커밋 d6d532c, 최신 main 249718f 통합 커밋/운영 SHA 50a9e72ddb2917dd301add3689c318d73be8db98. CURRENT 충돌은 양쪽 기록을 보존했으며 제품 코드는 자동 통합됐다.
- CI/배포: https://github.com/facio313/Pongdang/actions/runs/35570256712 전체 성공. Python 3.12 실제 실행 관련 21개 테스트/actionlint 통과. CI frontend 139 단위/lint, backend 1421 테스트/Ruff, browser 88+79=167, Docker 캐시 빌드·스택·볼륨 검사 통과. 전체 로컬 애플리케이션 검증은 반복하지 않았다.
- 운영 로그 2026-09-21 15:59:14 KST: 같은 SHA Deployed, frontend/backend/db/collector Healthy, readiness {"status":"ok"}. 워크플로 총 7분 58초, backend 테스트 5분 58초, browser 약3분씩 병렬, deploy 작업 1분 13초. 이번은 인프라 변경으로 full이며 일반 UI 변경의 fast CI 총시간은 아직 미측정이다.
- iCloud 원본 위치 유지. 52개 관련 경로를 백업·동시변경 비교 후 통합했고 원본 fix/finale을 같은 커밋으로 전진시켰다. 운영 확인 전 tracked 상태 clean을 확인했다. 이 최종 배포 결과 메모만 배포 후 로컬에 추가했으며 추가 CI/재배포를 만들지 않았다.
- 남은 별도 서버 작업: ci-watch/timer 실제 설치본과 서버 사용자의 Codex 전역 지침/스킬 적용 여부 확인·반영. 이번 앱 배포가 해당 설치본을 갱신하지는 않는다. 소스의 main 전용 CI와 프로젝트 지침은 원격 main에 반영 완료다.
- 증거: ~/.cache/pongdang-main-only-ci-backup/deploy-50a9e72.log 및 release-50a9e72.json. 소스/스테이징 백업과 기존 미추적 파일은 보존한다.

# 이전 작업 · 빠른 로컬 검증 및 main 전용 CI · 2026-09-21

- 요청/제약: iCloud 안의 원본 저장소 위치 유지. dev 커밋·병합·동기화·push·배포 금지, 기존 dev refs 보존. 로컬→CI→운영에서 전체 검증 체인을 반복하지 않는다.
- 구현: ops/verify_local.py에 수정 파일을 명시하면 해당 lint, 짧은 Node 단위 검사, 필요한 증분 타입 검사/명시한 backend 테스트만 실행한다. Git 전체 스캔·자동 저장소 복제·전체 빌드는 하지 않는다. backend 동작 변경은 관련 --test를 요구하고 DB 테스트에는 명시적인 disposable loopback pongdang_test 환경을 요구한다.
- CI: main push/PR만, dev 수동/PR 차단. 마지막 성공한 main push CI 이후 변경을 비교한다. 평소 UI는 기존 browser 핵심 8개(@smoke), backend 표시 문구/테스트 변경은 관련 테스트+core. 인증·DB·수집·점수·공용 API·인프라·미분류·수동은 전체 관련 검사를 유지하며 전체 browser는 독립 DB 2 shards. 이전 테스트 167개와 실패 시 배포 차단은 유지한다.
- 빌드: frontend job의 중복 production build 제거, Docker 이미지에서 typecheck+Vite build. frontend/backend별 GHA v2 layer cache, npm/uv cache mount. 기본 Docker health/readiness/초기화/collector 확인 유지; 초기화 반복/볼륨 재생성 검사는 full에서 실행. 운영은 기존 SHA/health/readiness와 실패 복구 유지, 서버 아키텍처/환경 인자에 맞춰 기존 서버 빌드 유지. CI 산출물의 운영 직접 재사용은 구현하지 않았다.
- 지침: ~/.codex/AGENTS.md, cks-gitflow 및 cks-platform-ops 지침(관련 참조 포함), 프로젝트 AGENTS/README/docs/ci.md 갱신. 일상 작업에 all-worktree audit/전체 로컬 검증을 강제하지 않는다.
- 실제 검증: scope/local 안전 조건 단위 테스트 21개 (Python 3.12 문법 호환 회귀 포함), Ruff/ESLint, actionlint 1.7.12, 두 스킬 validator 통과. 새 로컬 명령으로 frontend 139 단위+증분 typecheck 5.3초, backend 관련 133 테스트+Ruff 13.7초(테스트 자체 12.54초). 브라우저 mobile/desktop 핵심 8개 실제 통과 17.8초. 변경 전 지침/파일 백업을 보존했다.
- 검증 환경/한계: 같은 소스의 기존 ~/.cache/pongdang-all-release-20260921-131615 검증 복사본을 재사용, 원본 iCloud 파일을 비교 후 반영했다. 기존 임시 PG 디렉터리는 없어 새 disposable DB 49289/별도 browser 5181·8098을 사용하고 검증 후 종료했다. Docker CLI 부재로 새 이미지 빌드/컨테이너 검사는 로컬 미실행. 새 Actions/운영 배포는 미실행이며 위 시간은 로컬 검증 복사본 실측이다. 평소 CI 2~5분은 목표일 뿐 보장하지 않는다.
- 반영 상태: 사용자에게 main 커밋·push·CI·자동배포 승인을 받았다. 작업 커밋 d6d532c에 최신 main 249718f를 통합했다. CURRENT 충돌은 양쪽 기록을 보존했으며 제품 코드는 자동 통합됐다. Python 3.12 호환성 및 관련 21개 테스트/actionlint 통과. main push 후 CI/배포 확인을 진행한다. dev refs는 갱신하지 않는다. ci-watch/timer는 설치용 템플릿만 변경했고 운영 호스트 설치본은 별도 적용이 필요하다.
- 관련: docs/ci.md, .github/workflows/ci.yml, ops/ci_scope.py, ops/verify_local.py. 검증 복사본 branch codex/main-only-ci, 백업 ~/.cache/pongdang-main-only-ci-backup. 다음 승인된 릴리스에서는 최신 main 통합 후 새 CI 자체(full, 배포 구성 변경)를 한 번 확인한다.

# 이전 작업 · 전체 변경 통합 및 운영 배포 완료 · 2026-09-21

- 사용자 승인: 다른 작업의 변경도 모두 커밋하고 최신 원격 main 통합·충돌 조정·main/dev push·운영 배포. 비공개 환경과 .byeori/, .playwright-cli/, output/는 보존했다.
- 전체 작업 커밋 183c473(154개 파일). 최신 main의 헤더·지도 패널·홈 취향·추천 화면·설명 문구 변경을 포함했다. HomePage.tsx와 useResource.ts 충돌은 첫 입수 수온, 취향 칩, 저장 직후 무효화와 주기적 갱신을 모두 유지하도록 해결했다.
- 운영 배포 SHA: 0f824a9ccecbd7ed5332919c99b03920b769000c. main/dev 원격이 동일 SHA임을 확인했다. CI 및 배포: https://github.com/facio313/Pongdang/actions/runs/35564313621
- 검증: 최종 CI frontend lint/139 unit/build, backend Ruff/1398 tests, browser 167 tests, Docker smoke 모두 통과. 2026-09-21 14:38:43 KST 배포 로그에서 frontend/backend/db/collector Healthy, API readiness status=ok, 동일 SHA 적용을 확인했다. 인증 후 운영 UI 직접 조작은 미실행이다.
- 중간 실패 해결: 웹캠 테스트의 고정 DB 비밀번호 제거(실제 비밀번호 인증 DB에서 재현 후 66개 통과), CI backend 작업 10분 제한을 20분으로 조정, 최신 공용 버튼 스타일과 상세 버튼 폭 충돌 수정 및 새 홈 취향 API fixture 보완(실패 7개 재현 후 관련 browser 19개 통과). 검사를 삭제하거나 우회하지 않았다.
- 통합 체크아웃: /Users/cksmacbook/.cache/pongdang-all-release-20260921-131615. 증거·백업: 같은 경로에 -evidence 접미사를 붙인 디렉터리. 원본 iCloud Git mmap 시간 초과는 파일 비교와 별도 객체 디렉터리로 대응했고 Git 기록을 보존했다. 원본 제품 파일과 로컬 fix/finale·main·dev·origin/main·origin/dev를 배포 SHA로 동기화했다. 상세 상태는 release-state.json에 기록했다.
- 이 배포 결과 기록은 배포 후 작성한 로컬 인수인계 메모다.

# 동시 작업 · 백엔드 운영 복구 · 2026-09-21

- 사용자 요청: 점수·시간별 지표·수온·명소 상세가 정상 운영되도록 조치. 프론트 수정 금지. 커밋·운영 배포 승인 완료. 사용자 지시에 따라 dev 검증은 생략하고 main CI·자동배포만 진행한다.
- 운영 기준 `0f824a9`, 별도 체크아웃 `/home/cks/.local/share/pongdang-repair.lIgOzy/repo`, 브랜치 `fix/backend-operational-recovery`.
- 새 계산 SQL timeout, 예보 범위 초과, 수온의 불필요한 파생 조회, 명소 초기 수집 지연을 수정했다. 실제 자료를 복제한 격리 `pongdang_test`에서 추가로 발견한 게시 GC timeout과 평가 장기 실행도 bounded 처리로 보완했다. 운영 DB에는 테스트를 실행하지 않는다.
- 검증: 로컬 backend 전체 1,416개 통과(후속 변경은 관련 회귀 별도 검증), frontend lint/139 tests/build 통과. 최종 main CI가 통합 소스 전체를 다시 검증한다. 원자료 SELECT 약2초, 예보2,184건 투영, 수온12동시요청200, 평가2batch 28+33그룹 commit, condition GC108,490행 삭제·rollback 복원 통과. 최종 condition107,312건/204.95초/peak242MiB 게시 및40ms readback도 성공했다. main 통합·배포를 진행한다.
- 작업 중 원격 main에 별도 frontend 변경 `c8b4c75`가 추가됐다. 해당 변경을 보존하고 최신 main 위에 백엔드 수정만 통합한다.
- 세부 상태/완료 조건: [BACKEND-OPERATIONAL-RECOVERY.md](BACKEND-OPERATIONAL-RECOVERY.md). 기존 작업 기록은 아래에 보존한다.

# 이전 작업 · 명소 상세 영구 저장 및 정적 API 중복 조회 제거 · 2026-09-21

- 요청: 기존 명소의 운영·개장·주차·시설·문의·소개를 보강해 DB에 저장하고, 신규 장소 및 제공처 수정일 변경 시에만 상세 API를 호출한다. 화면은 읽기 전용 DB 조회. 거리 값은 출발점 좌표에 따른 직선거리로 계산한다.
- 구현: TourAPI 공통/소개/반복정보 수집, 추가형 v11 저장, 최대 100개 DB 조회 API, 데이터 목록, 모바일/데스크톱 및 여행 조회 연결 완료. 기존 행 최초 보강·신규 행·원본 수정 시만 요청하며 자료 없음도 기억한다. 사진의 7일 재조회와 같은 좌표의 행정구역 빈 응답 재조회를 제거했다. 상세: [PLACE-DETAILS.md](PLACE-DETAILS.md).
- 제약: 기존 사용자 CURRENT.md 기록과 .byeori/, .playwright-cli/, output/ 보존. 커밋·푸시·운영 배포 승인 없음. 테스트는 새 disposable pongdang_test에서만 수행한다. 기존 확인 서버·DB와 운영 DB는 테스트 대상으로 사용하지 않는다.
- 확인: 주소/좌표/장소목록은 이미 DB 조회. 사진은 DB+파일 저장이나 collector의 정기 재요청이 있었음. 날씨·교통·Windy livecam preview는 동적 자료로 기존 의미 유지.
- 최종 검증: Node 24 frontend lint/136 unit/type/build, 명소 브라우저 7개 항목 통과. 고정한 소스 복사본의 backend 1,355개 통과(전체 1,354개 + 복사본 누락 증빙 CSV 보충 후 해당 1개 재검증), Docker 부재 2 skips. 최신 작업 폴더 Ruff check/format 207개 및 git diff --check 통과. 동시 편집 중 실행의 실패, 브라우저 세션 종료 1건과 동일 코드 재검증 경위는 상세 문서에 구분해 기록했다.
- 실제 응답: 현재 로컬 목록 162곳 중 TourAPI 직접 원본 146곳 확인. 가진해변 실제 detail API에서 운영 09:00~18:00, 주차 가능, 화장실 있음, 추가 11개 항목을 확인했다. 이 실호출은 읽기 검증이며 실제 확인 DB/운영 DB에 전체 목록 보강을 실행한 것은 아니다. 배포 후 collector가 기존 미수집 행을 한도 안에서 보강한다.
- 동시 작업: 별도 세션에서 livecam 저장·점수 projection/갱신·알림·장소 중복 정리와 후속 v12~v14 스키마를 수정 중이다. 해당 변경은 보존하며 이 작업의 구현이나 전체 통과 결과로 주장하지 않는다.
- 정리: 이 작업의 49418 검증 DB 종료. 기존 5173/8000/51906 확인 환경과 사용자 변경은 유지했다. 소스 구현·관련 검증 완료이며 운영 반영은 아직 실행하지 않았다.

# 이전 작업 · 강원도 확대 main 통합 및 운영 배포 완료 · 2026-09-21

- 사용자 요청 완료: 최신 운영 main `281f4e5`와 강원도 확대를 통합했다. 28개 파일 충돌을 해결하며 최신 로고·파비콘·푸터·전체 화면 지도/내 코스·다국어 UI를 보존했다. 기존 main의 레이아웃 CSS를 바꾸지 않고 지역·장소 선택을 연결했다.
- 배포 커밋: `ebf073a1d345cd7e4034fae22e8fc8867d74a48a`. dev CI [35536916016](https://github.com/facio313/Pongdang/actions/runs/35536916016) 성공 후 동일 커밋을 main에 push했으며 main CI·배포 [35537506824](https://github.com/facio313/Pongdang/actions/runs/35537506824)도 모두 성공했다.
- 운영 로그: 2026-09-21 06:14:20 KST `Deployed Pongdang ebf073a1d345cd7e4034fae22e8fc8867d74a48a`. 추가형 스키마 초기화 성공, frontend/backend/db/collector 모두 Healthy, `/api/ready`는 `{"status":"ok"}`.
- 실제 브라우저로 `https://bonifacio.work/pongdang/` → 기존 Authelia SSO 로그인 화면 연결을 확인했다. 비인증 Python HTTP 요청은 Cloudflare 1010으로 차단되므로 운영 UI 장애 근거로 취급하지 않는다. 인증 후 운영 UI 직접 조작은 미실행이다.
- 검증: frontend lint/123 unit/type/build, backend Ruff 및 CI 1,268개, browser 140개 모두 통과. dev/main의 Docker smoke도 모두 통과했다. 로컬 backend는 1,266 passed/2 Docker skips. 지도 선택자 정정 후 지역·페이지 회귀 4개를 통과했고 최종 CI에서 전체 browser를 다시 통과했다.
- 원본 `fix/finale`, 로컬 main/dev 및 origin/main/dev가 모두 배포 SHA다. iCloud mmap 시간 초과로 중단된 원본 파일 갱신은 동일 해시의 검증 체크아웃 객체를 명령 실행 동안만 사용해 완료했다. Git 설정·비공개 환경·개인 파일을 변경하지 않았다.
- 소스/이력 백업과 검증 증거: `/Users/cksmacbook/.codex/backups/pongdang-gangwon-release-20260921-053525/`의 Git bundles, `release-verification.json`, `main-ci-result.json`, `main-deploy.log`. 통합 체크아웃은 `/Users/cksmacbook/.cache/pongdang-gangwon-release-20260921`이다.
- 기존 로컬 미리보기 `http://127.0.0.1:5173/pongdang/`도 배포 커밋의 frontend 161개 파일로 갱신·해시 검증했다. 비공개 설정과 backend 8000/실제 확인 DB 51906은 유지했다. 검사용 55469 DB와 임시 5179 서버·브라우저는 종료했다.
- 범위와 한계: 기본 검색·추천/관광 수집은 강원도 18개 시군으로 확장했다. 실시간 관측·안전 근거는 제공처별 기존 공간 범위의 제한을 유지하고, 미확인 값은 unknown/null로 둔다. 상세: [GANGWON-EXPANSION.md](GANGWON-EXPANSION.md).
- 이 완료 기록은 배포 후 작성한 로컬 인수인계 메모이며 미커밋 상태다. 배포된 제품 소스와 로컬 제품 소스에는 차이가 없다. 요청 범위의 미완료 작업 없음.

# 이전 작업 · 언어 전환 main 통합 및 운영 배포 완료 · 2026-09-21

- 사용자 요청 완료: 최신 main `a047dce`의 전체 화면 지도·내 코스, 로고·파비콘·푸터를 보존하고 화면 언어 전환을 통합했다. 언어 변경 커밋은 `281f4e5927d36e76fb3b78935bb75e37be571554`이며 원격 main/dev 모두 같은 SHA다.
- dev CI [35534550705](https://github.com/facio313/Pongdang/actions/runs/35534550705) 전체 성공 후 동일 커밋을 main에 push했다. main CI·운영 배포 [35535120595](https://github.com/facio313/Pongdang/actions/runs/35535120595)도 전체 성공했다.
- 서버 로그: 2026-09-21 05:27 KST `Deployed Pongdang 281f4e5927d36e76fb3b78935bb75e37be571554`, frontend/backend/db/collector Healthy, `/api/ready`는 `{"status":"ok"}`. 운영 URL은 `https://bonifacio.work/pongdang/`이며 기존 SSO 로그인 화면 연결을 확인했다. 인증 후 운영 UI 직접 클릭은 미검증이다.
- 로컬 검증: frontend lint/111 unit/type/build, backend Ruff/1,170 tests(로컬 Docker 관련 2 skips), 전체 browser 134개 통과. dev/main CI의 Docker smoke도 모두 성공했다. 별도 `59355/pongdang_test`는 종료했고 기존 5173/8000/51906 확인 환경은 유지했다.
- 원본 Git 명령의 정체로 별도 `codex/ui-language-release` 체크아웃에서 통합·커밋했다. 경로: `/Users/cksmacbook/.codex/backups/pongdang-language-release-20260921-044626/release-checkout`. 원본에 받아진 커밋의 존재와 조상 관계를 확인해 로컬 main/dev 및 원격 추적 refs도 같은 SHA로 갱신했다. 현재 체크아웃 `fix/finale`과 미커밋 작업 파일은 그대로 보존한다.
- 강원 지역 확대·필터·마이그레이션은 이번 언어 커밋에서 제외했다. 기존 변경 116개 백업은 위 부모 경로 `working-files/`, 해시 목록은 `manifest.json`, 배포 증거는 `release-verification.json`과 `main-deploy.log`다. `.byeori/`, `output/`, 비공개 환경·SSO·키·실제 DB를 변경하지 않았다.
- 배포한 구현 상세: [UI-LANGUAGE.md](https://github.com/facio313/Pongdang/blob/281f4e5927d36e76fb3b78935bb75e37be571554/docs/ai/UI-LANGUAGE.md). 기존 강원 확대 기록은 [GANGWON-EXPANSION.md](GANGWON-EXPANSION.md), 최초 로컬 언어 작업 기록은 [UI-LANGUAGE.md](UI-LANGUAGE.md)다.

# 이전 작업 · 화면 전체 언어 전환 · 2026-09-21

- 사용자 후속 요청으로 기존 자료 조회용 토글을 화면 메뉴·버튼·설명 전체에 확장했다. 한국어/영어/중국어 간체/일본어 지원. 제공처·사용자 원문과 기존 대화·저장 코스의 내용은 보존한다.
- 언어 변경은 같은 화면을 다시 마운트하지 않으며 선택한 장소·입력값·펼친 설명을 유지한다. 새 추천과 여행 안내에는 선택 locale을 적용한다.
- 브랜치 `fix/finale`, 기존 `.byeori/`와 강원 지역 확장 동시 변경 보존. 이 언어 작업에서 커밋·푸시·배포·운영 DB·.env 변경을 실행하지 않았다.
- 언어 전환 구현·검증 완료. 상세: [UI-LANGUAGE.md](UI-LANGUAGE.md). 프런트 lint/115 unit/type/build, 전체 browser 134개와 마지막 영향 범위 12개, backend Ruff 및 관련 29개 테스트 통과. 전체 backend 실행·환경 재실행 결과는 상세 문서에 기록했다.
- 사용자 미리보기 `http://127.0.0.1:5173/pongdang/#spots?spot_id=9` 유지. 실제 화면에서 세 외국어 메뉴·설명·버튼 전환을 확인했고 영어 점수 설명을 펼쳐 두었다. 검사는 별도의 `50139/pongdang_test`에서 수행했으며 해당 검사용 DB는 종료했다. 최종 관련 소스 349개가 검증 snapshot과 일치함을 확인했다.

# 이전 작업 · 브랜치 통합·정리 및 운영 배포 · 2026-09-21

- 사용자 승인: 수정 커밋, 도구 브랜치 통합·삭제, main 머지·push·운영 배포. 유지할 이름: main, dev, feature/connect, feature/today-page, feature/api. .env·SSO·키·DB 스키마 변경 없음.
- 수정 커밋 68648ca와 main 9e6055f를 dev에 통합한 뒤 새 main 3e5bf9e도 충돌 없이 받았다. 최신 카테고리별 UI/공용 조회/지도 배치 API와 R37/R22/R60 등 검증된 수정 모두 유지한다. report.md 완료 23개는 백업과 바이트 동일하다.
- 로컬 검증: frontend lint/106 unit/build, Ruff lint/format, backend 1170 passed/2 Docker skips. main 추가 통합 후 전체 browser 117 통과, 상세 설명 이동에 따른 선택자/조회 대기 수정 후 영향받는 29개 전부 통과. 이전 후보 액션 6개도 통과. 전체 122개는 CI에서 재실행한다. 390×844 실제 클릭·노트 간격·신호 비차단·중복 없는 저장 확인과 원래 취향 복구 완료.
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
