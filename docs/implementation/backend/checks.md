# 최종 검증 기록 — 2026-09-14 KST

실행 요약 원문은 [checks.json](checks.json), 로그는 [logs/](logs/)에 보존했다. 기존 보고서의 성공 횟수를 이번 작업의 결과로 재사용하지 않았다.

| 검사 | 결과 |
|---|---|
| Backend Python 3.14.4 전체 pytest | **413 passed**, 0 failed, 0 skipped, 13.96초 |
| Backend Ruff check | 통과 |
| Backend Ruff format check | 92개 파일 통과 |
| Frontend Node.js 24.20.0 lint | 통과, max-warnings=0 |
| Frontend tests | **20 passed**, 0 failed |
| TypeScript/Vite build | 통과; `APP_BASE_PATH=/pongdang/`, 실제 asset 경로 확인 |
| PostgreSQL 18 | 별도 55439 포트의 `pongdang_test`만 사용 |
| v4→v5 migration | 기존 snapshot/metric/station/spot/batch를 byte-equivalent JSON으로 보존; 명시 초기화 두 번째 실행 no-op |
| worker CLI | forecast/evaluation 강제 재실행 inserted=0; 다음 별도 프로세스는 persisted due를 읽고 0개 실행; health exit 0 |
| 공식 소량 새 호출 | KMA 단기예보 78건, KHOA 수온 26건, KHOA 고저조 20건 |
| 실자료→도메인→API | forecast revision 98개, 평가/manifest 관련 저장 1,800개, 품질 비교 3개; HTTP 18건 모두 200 |
| `/pongdang/` prefix | ready/twin/수온/OpenAPI 200; retired demo/collector 404 |
| 브라우저 | 기존 7개 기능 화면에서 실제 API 상태 확인; 마지막 예보·지도 DOM 재확인, 메뉴10개/페이지 바깥 가로 넘침 없음 |
| 프론트 보존 | 시작 baseline의 CSS 8개·App/DataPage/FeatureData/useResource/navigation 등 동일 해시 |
| 검증 소스 정합 | 프론트 입력 소스/테스트/설정/lock 37개가 작업트리와 임시 검사 사본에서 동일 |
| 의존성 | Python 설치 버전이 uv.lock과 일치; 프론트 package-lock 그대로. dependency 변경 없음 |
| 비밀값 확인 | 서버 `.env`의 key/password/token/secret 값이 변경된 소스/생성 인계물에 포함됐는지 검사: 일치 0개 |
| Docker Compose 전체 smoke | **미실행** — 로컬 Docker 실행 파일/runtime 없음. CI 정의 보존 |

평가/manifest 저장 1,800개는 점수 1,800개 또는 여행지 1,800개를 뜻하지 않는다. target·입력 manifest·평가·read manifest 등의 불변 artifact 수다. 수치 환경모델은 여전히 `unimplemented`이고 공개 score는 null이다. quality 3개도 실제 리뷰 분석 성공 건수가 아니라 실제 관측소의 `no_review_data` 비교 결과 저장이다.

최종 공식 실행은 [live-verification.json](live-verification.json)의 2026-09-14 04:24 KST 기록이다. 요청 기간에 따라 KMA 예보 71행·고저조 12행 등이 응답하며 원자료 전체 78/20개와 HTTP 행수는 다르다. 공급자가 제공한 target interval·날짜·발표시각·정정 버전을 보존한다. 첫 실자료 실패와 tide ID 수정 경위는 [README.md](README.md)에 기록했다.

## 주요 자동 검증 범위

- SourceBatch→원자 저장→공식 예보/평가/수질 비교 job→HTTP 실제 DB 연결
- null/0·단위 불일치·만료·예보 범위 밖·발표시각 미제공·정정·충돌·외부 실패
- v4·기존 구버전 migration, 재실행, immutable trigger, GET이 행수/예산/평가를 변경하지 않음
- 역사 as_of·미래 정보 배제·한국시간 자정·연도 경계·공간/시간/100행 상한
- 대표 mapping의 활동 삭제/기간 축소 후 기존 publication 차단과 이전 as_of 재현
- 구 조석 adapter projection 후 v2 수집 시 현재 중복 제외, 역사 구행·원본 revision 보존
- SSO subject/grant/Origin, 소유권·verified email, 사용자 설정 revision, 취소·정정·중복 발송
- 발송 시도 없는 정정 이벤트 복구와 provider 접수/접수 미확정 이벤트 재발송 차단
- 비용·토큰·호출 상한 경쟁·DB 장애 fallback·모델 출력 fact 추가/삭제/조작 거부
- 프론트 AbortSignal·늦은 응답 폐기·배포 prefix·별도 DTO 검증·null을 정상/0으로 바꾸지 않음

각 담당 테스트 파일과 상세 정책은 기능별 인계 문서에 있다. 새 공간 통합 테스트에서 처음 드러난 UTC/KST 문자열 비교, `unknown`/`not_assessed` 기대값 및 OpenAPI 경로 오류는 실제 도메인 계약을 확인해 수정했다. 안전 판정을 허용하도록 테스트를 약화하지 않았다. 기존 데이터로 새 migration을 검증하는 fixture도 필수 시각/공간 필드를 명시했다.

## 실행 환경과 재현

프로젝트 `.venv`와 `node_modules`의 일부 iCloud 파일 읽기가 멈춰, Python3.14와 동일 lock 버전의 임시 runtime 및 동일 frontend source 사본으로 검사했다. [source-verification.json](source-verification.json)에 버전/해시 근거가 있다. macOS에 설치하지 않은 colorama/tzdata는 uv.lock의 win32 전용 항목이다. 프로젝트 lockfile을 변경하거나 다른 메이저 runtime으로 대체하지 않았다.

프로젝트에서 의존성 파일을 정상적으로 읽을 수 있는 환경에서는 아래 명령으로 재현한다. 아래 접속은 이번 격리 cluster용이며, 운영 접속값으로 테스트하지 않는다. 임시 DB 서버는 검증 후 종료하므로 동일 설정의 PostgreSQL18 테스트 cluster를 먼저 준비한다.

```sh
# frontend/ (Node.js 24)
npm ci
npm run lint
npm test
APP_BASE_PATH=/pongdang/ npm run build

# backend/ (Python 3.14, PostgreSQL18 test DB)
uv sync --frozen
uv run --frozen ruff check .
uv run --frozen ruff format --check .
POSTGRES_HOST=127.0.0.1 POSTGRES_PORT=55439 POSTGRES_DB=pongdang_test POSTGRES_USER=pongdang_goal POSTGRES_PASSWORD=test-only uv run --frozen pytest

# 실제 공식 endpoint를 소량 확인할 때만 사용; 프로젝트 서버 키는 .env에서 읽되 출력하지 않음
POSTGRES_HOST=127.0.0.1 POSTGRES_PORT=55439 POSTGRES_DB=pongdang_test POSTGRES_USER=pongdang_goal POSTGRES_PASSWORD=test-only PYTHONPATH=. uv run --frozen python scripts/verify_goal_live.py --live --output ../docs/implementation/backend/live-verification.json
```

Docker 사용 가능한 격리 환경에서는 저장소 루트의 기존 CI smoke와 같은 설정으로 아래를 실행한다. 이는 이번에는 실행하지 않았다. 테스트 전용 project/volume이며 운영 project를 가리키지 않는다.

```sh
POSTGRES_PASSWORD=ci-only-password docker compose --project-name pongdang-ci up -d --build --wait --wait-timeout 180
POSTGRES_PASSWORD=ci-only-password docker compose --project-name pongdang-ci exec -T collector python -m app.ingestion.health
POSTGRES_PASSWORD=ci-only-password docker compose --project-name pongdang-ci down --volumes
```

pytest의 두 warning은 lock된 Starlette/AnyIO의 deprecation 안내다. 실패·skip은 없으며 이 작업에서 의존성 업그레이드는 하지 않았다. 운영 SSO ingress·실제 발송·LLM 호출·카메라 live·수치모델 과학 검증은 [README.md](README.md)의 외부 의존성 절차에 따라 별도로 수행해야 한다.
