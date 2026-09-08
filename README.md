# Pongdang

[![CI and deploy](https://github.com/facio313/Pongdang/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/facio313/Pongdang/actions/workflows/ci.yml)

Multtara Collector의 역할과 cksDB에 저장된 수집 자료를 확인하는 읽기 전용 데이터 워크스페이스입니다.

- [Collector 소개](https://bonifacio.work/pongdang/#collector): 수집 흐름, 제공처, 기본 주기, 마지막 실행과 활동 신호
- [데이터 조회](https://bonifacio.work/pongdang/#data): 14개 데이터셋, 검색, 열 필터, 정렬, 페이지 이동, 열 선택, 행 상세

원본 스냅샷·측정값과 내부 평가 결과를 구분합니다. `missing`, `unknown`,
`unavailable`, null을 실시간 관측이나 안전한 상태로 바꾸어 표시하지 않습니다.
DB 활동 신호가 900초를 넘으면 기록된 `running`과 별도로 오래된 신호로 표시합니다.

- Frontend: React 19, Vite 8, TypeScript, Node.js 24
- Backend: Python 3.14, FastAPI, psycopg, uv
- Database: PostgreSQL 18
- Runtime: Docker Compose, Nginx

`frontend/`는 두 화면과 표 조회 UI, `backend/app/`는 상태 API와 읽기 전용 조회 API입니다.
의존성은 `package-lock.json`과 `uv.lock`으로 고정합니다.

## 로컬 실행

```bash
cp .env.example .env
# .env의 POSTGRES_PASSWORD를 무작위 비밀번호로 변경합니다.
docker compose up -d --build --wait
```

페이지: http://localhost:5188 · API 문서: http://localhost:5188/api/docs

```bash
docker compose logs -f backend frontend
docker compose down
```

DB 데이터는 `pongdang_postgres_data` 볼륨에 보존됩니다.
`down -v`는 DB 데이터를 삭제하므로 사용하지 않습니다.
DB 비밀번호는 최초 볼륨 초기화에 적용되며, 이후 `.env` 변경만으로 갱신되지 않습니다.

## 개발 서버

Node.js 24와 uv가 필요합니다. 운영 서버와 다른 로컬 개발 환경에서 실행합니다.

```bash
docker compose -f compose.yaml -f compose.dev.yaml up -d db
cp backend/.env.example backend/.env
# backend/.env의 POSTGRES_PASSWORD를 루트 .env와 맞춥니다.
cd backend
uv sync --frozen
uv run uvicorn app.main:create_app --factory --reload
```

다른 터미널:

```bash
cd frontend
npm ci
npm run dev
```

Vite의 `/api` 요청은 로컬 FastAPI의 8000 포트로 전달됩니다.

## 검증

```bash
cd frontend
npm run lint
npm run build
```

```bash
cd backend
uv run ruff check .
uv run ruff format --check .
uv run pytest
```

백엔드 테스트는 별도로 준비한 `pongdang_test` PostgreSQL DB에서 실행합니다.
Collector 테스트는 이 폐기 가능한 테스트 DB에만 합성 테이블을 생성하고 정리합니다.
운영 DB나 기존 개발 데이터가 들어 있는 DB로 테스트를 실행하지 마세요.
`GET /api/health`는 프로세스 상태, `GET /api/ready`는 실제 DB 연결을 확인합니다.

## 브랜치와 자동 배포

- `dev`: 개발 통합 브랜치. 푸시하면 lint, 타입 검사, 빌드, PostgreSQL 연동 테스트를 실행합니다.
- `main`: 운영 브랜치. 동일한 검사를 통과하면 이 서버에 SSH로 배포합니다.
- 두 브랜치 대상 PR에서도 검사를 실행합니다. PR과 `dev`에서는 배포하지 않습니다.

CI는 lint·타입 검사·테스트 뒤 전체 Docker Compose 스택의 빌드·기동까지 검증합니다.
초기 설정 시 GitHub의 push 이벤트가 실행을 생성하지 않는 현상이 확인되어,
서버의 `pongdang-ci-watch.timer`가 1분마다 `main`·`dev`의 최신 커밋을 확인합니다.
해당 브랜치·커밋에 CI 실행이 없을 때만 같은 워크플로를 시작하므로,
일반 push CI와 중복 실행을 최소화하면서 자동 배포 누락을 보완합니다.
실패한 CI는 자동 재시도하지 않으며, 수정 커밋을 푸시하거나 Actions에서 재실행합니다.
보완 장치는 `cks` 계정의 GitHub CLI 인증을 사용합니다.

운영 주소: https://bonifacio.work/pongdang/
포트폴리오 메인 페이지의 Multtara 다음에 있는 Pongdang 카드에서도 접속할 수 있습니다.

## Collector DB 연결

Pongdang의 자체 PostgreSQL과 조회 원본인 cksDB의 Multtara `pongdang` DB는 별개입니다.
서버의 보호된 환경 파일에 `COLLECTOR_DB_HOST=cksDB`, `COLLECTOR_DB_NAME=pongdang`,
`COLLECTOR_DB_USER=multtara_explorer`, `COLLECTOR_DB_PASSWORD`를 설정합니다.
배포 스크립트는 이 설정이 있으면 `compose.collector.yaml`을 추가로 적용합니다.
cksDB와 Pongdang backend만 전용 내부 네트워크 `cksDB-pongdang-explorer`를 공유합니다.
cksDB를 재시작하지 않고 네트워크를 연결했으며 cksDB Compose에도 구성을 보존했습니다.

전용 계정은 `backend/app/collector_catalog.json`의 테이블·열만 SELECT 할 수 있습니다.
회원·세션·비밀정보·원문 응답·레거시 예측 테이블은 조회 대상이 아닙니다.
테이블을 늘릴 때는 카탈로그와 `ops/collector-reader.sql`의 열 권한을 함께 검토합니다.
권한 적용 전에 설치된 cksDB Multtara 도구로 검증된 백업을 만들고,
`MULTTARA_EXPLORER_PASSWORD` 환경변수를 전달해 해당 SQL을 `pongdang` DB에만 적용합니다.
원래 Multtara 앱 계정이나 수집 API 키는 공유하지 않습니다.

조회 API는 `/api/collector/catalog`, `/summary`, `/datasets/{key}`입니다.
검색·필터 값은 바인딩하고 테이블·열·정렬은 허용 목록으로 제한합니다.
DB 트랜잭션은 읽기 전용, 쿼리 제한 3초, 동시 연결 4개, 페이지 최대 100행입니다.
현황 집계는 30초 동안 캐시하며 조회 시각을 함께 반환합니다.
원본 DB 연결이 없거나 실패하면 503과 안내 화면을 표시하며 가짜 데이터를 만들지 않습니다.
이 페이지는 수집기를 시작·정지하거나 외부 API를 새로 호출하지 않습니다.

GitHub Actions의 `production` 환경과 저장소의 `DEPLOY_KEY` secret을 사용합니다.
전용 SSH 키는 `deploy pongdang <40자리 SHA>` 명령만 허용합니다.
서버는 GitHub `main`의 최신 커밋인지 확인하고, 해당 소스로 ARM64 이미지를 빌드한 뒤
`docker compose up -d --no-build --wait`를 실행합니다.
기동 검사 실패 시 이전 앱 이미지로 복구합니다. DB 자동 복구나 스키마 변경은 하지 않습니다.

서버 경로:

- 소스 체크아웃: `/home/cks/Pongdang`
- 운영 환경 변수: `/home/cks/.config/pongdang/production.env` (0600, Git 제외)
- 커밋별 배포: `/home/cks/.local/share/pongdang-deploy/releases/<SHA>`
- 현재/이전 배포: 같은 디렉터리의 `current`, `previous` 심볼릭 링크
- SSH 명령: `/usr/local/libexec/pongdang-deploy` (`ops/pongdang-deploy` 설치본)
- Nginx 경로 설정: `/etc/nginx/snippets/pongdang-location.conf`
- 누락 CI 확인: `/usr/local/libexec/pongdang-ci-watch`, `pongdang-ci-watch.timer`

운영에서는 `APP_BASE_PATH=/pongdang/`, `API_ROOT_PATH=/pongdang`을 설정합니다.
웹 포트는 `127.0.0.1:5188`에만 바인딩하고 DB·API 포트는 호스트에 공개하지 않습니다.
새 페이지는 공개이며 인증은 아직 없습니다. 운영 스크립트와 Nginx 설정 변경은
검토 후 서버 설치본에도 별도로 반영해야 합니다.
