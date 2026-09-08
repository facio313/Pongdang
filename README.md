# Pongdang

[![CI and deploy](https://github.com/facio313/Pongdang/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/facio313/Pongdang/actions/workflows/ci.yml)

빈 React 페이지에서 시작하는 최소 스캐폴드입니다.

- Frontend: React 19, Vite 8, TypeScript, Node.js 24
- Backend: Python 3.14, FastAPI, psycopg, uv
- Database: PostgreSQL 18
- Runtime: Docker Compose, Nginx

`frontend/`에는 앱 진입점만, `backend/app/`에는 설정과 DB 연결·상태 API만 있습니다.
라우팅, 인증, 상태 관리, ORM, 예제 데이터는 기능을 만들 때 추가합니다.
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

백엔드 테스트는 `backend/.env`에 지정된 PostgreSQL 연결을 사용합니다.
`GET /api/health`는 프로세스 상태, `GET /api/ready`는 실제 DB 연결을 확인합니다.

## 브랜치와 자동 배포

- `dev`: 개발 통합 브랜치. 푸시하면 lint, 타입 검사, 빌드, PostgreSQL 연동 테스트를 실행합니다.
- `main`: 운영 브랜치. 동일한 검사를 통과하면 이 서버에 SSH로 배포합니다.
- 두 브랜치 대상 PR에서도 검사를 실행합니다. PR과 `dev`에서는 배포하지 않습니다.

운영 주소: https://bonifacio.work/pongdang/

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

운영에서는 `APP_BASE_PATH=/pongdang/`, `API_ROOT_PATH=/pongdang`을 설정합니다.
웹 포트는 `127.0.0.1:5188`에만 바인딩하고 DB·API 포트는 호스트에 공개하지 않습니다.
새 페이지는 공개이며 인증은 아직 없습니다. 운영 스크립트와 Nginx 설정 변경은
검토 후 서버 설치본에도 별도로 반영해야 합니다.
