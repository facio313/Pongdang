# 현재 작업 · 빠른 로컬 검증 및 main 전용 CI · 2026-09-21

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
