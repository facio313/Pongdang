# Pongdang

공모전용 독립 프로젝트입니다. Multtara 저장소·컨테이너·cksDB 없이 개발·테스트·배포합니다.
React 19 / Vite 8 / TypeScript / Node.js 24, Python 3.14 / FastAPI, PostgreSQL 18 기반입니다.
의존성은 `package-lock.json`, `uv.lock`으로 고정합니다.

- [데이터 조회](https://bonifacio.work/pongdang/#data): 기본 더미 화면, 검색·필터·정렬·코드명·행 상세
- [데이터 정보](https://bonifacio.work/pongdang/#info): 전체 데이터 구조, 조합 기준, 활용 예시, 구현 상태

## 독립 구성

운영 컨테이너 이름은 `pongdang-frontend`, `pongdang-backend`, `pongdang-db`입니다.
숫자 접미사는 사용하지 않습니다. 별도 Compose 프로젝트는 지정한 프로젝트명을
접두사로 사용하므로 CI의 `pongdang-ci-*`와 운영 컨테이너가 충돌하지 않습니다.
서비스 간 주소 `backend`, `db`와 기존 PostgreSQL 볼륨은 그대로 유지합니다.

```text
frontend → backend → db (PostgreSQL 18 / pongdang)
                    ├── pongdang_data: 수집용, 초기에는 비어 있음
                    └── pongdang_demo: 기존 합성 예시
```

`backend/app/data_reader.py`는 자체 DB 조회, `data_catalog.json`은 조회 허용 목록,
`ingestion/`은 공급자 중립 수집·검증·저장, `schema.py`는 명시적 초기화,
`seed_demo.py`는 로컬 참조 좌표를 사용하는 독립 더미 생성입니다.

현재 외부 API 제공처와 자동 수집 일정은 미설정입니다. API는 추후 다시 선정합니다.
기존 Django 수집기·평가 엔진·스케줄러를 복제하지 않았습니다.
대신 공통 입력 계약, 원자적 저장, 중복 방지, 운영자 JSON 입력을 제공합니다.
수집기가 실제 호출 중이거나 적합도 계산이 구현됐다고 표시하지 않습니다.
제공처 어댑터를 추가하는 위치와 계약은 [수집 개발 안내](docs/ingestion.md)를 확인합니다.

기존 더미 테이블 이름·열은 보존합니다. `tourapi_id`, `khoa_beach_code` 같은 필드는
선택적인 기존 예시 필드이며 API 변경 시 매핑/마이그레이션을 별도로 검토합니다.

## 로컬 실행 — Docker 없이

Node.js 24, Python 3.14, uv, PostgreSQL 18을 설치합니다.
로컬 PostgreSQL에 개발 전용 `pongdang` DB와 로그인 계정을 만들고,
`backend/.env.example`을 `backend/.env`로 복사해 로컬 DB 접속 정보를 입력합니다.
운영 DB 접속 정보를 개발용으로 사용하지 마세요.

```bash
cd backend
uv sync --frozen
uv run python -m app.schema --initialize
uv run python -m app.seed_demo --confirm-demo-only
uv run uvicorn app.main:create_app --factory --reload
```

다른 터미널:

```bash
cd frontend
npm ci
npm run dev
```

Vite가 `/api`를 로컬 FastAPI 8000 포트로 전달합니다. 운영 SSO는 서버의
`/pongdang/` 앞단에서 유지하며 로컬 개발에 Multtara나 SSO 컨테이너는 필요 없습니다.

## Docker 실행

```bash
cp .env.example .env
# POSTGRES_PASSWORD를 로컬 전용 무작위 비밀번호로 변경
docker compose up -d --build --wait
docker compose exec backend python -m app.schema --initialize
docker compose exec backend python -m app.seed_demo --confirm-demo-only
```

페이지 http://localhost:5188 / API 문서 http://localhost:5188/api/docs

DB만 Docker로 실행하려면 `docker compose -f compose.yaml -f compose.dev.yaml up -d db`를
사용합니다. 개발용 파일만 로컬 DB 포트를 게시하며 운영에는 적용하지 않습니다.
`docker compose down`은 볼륨을 보존합니다. `down -v`는 데이터를 지우므로 사용하지 마세요.
DB 비밀번호는 최초 초기화 때 적용되며 `.env` 수정만으로 기존 비밀번호가 바뀌지 않습니다.

## 데이터와 API

- 수집 데이터: `/api/data/catalog`, `/api/data/summary`, `/api/data/datasets/{key}`
- 더미 데이터: `/api/demo/catalog`, `/api/demo/summary`, `/api/demo/datasets/{key}`
- 상태: `/api/health`, 실제 DB 연결 확인: `/api/ready`
- 이전 `/api/collector/*`는 404입니다. 외부 DB 연결이나 대체 응답이 없습니다.

`?data=data`는 자체 수집 스키마, `?data=demo`는 더미 스키마를 조회합니다.
이전 `?data=collector` 북마크도 자체 수집 화면으로만 이동합니다.
허용 목록 기반 검색·필터·정렬, 최대 100행, 읽기 전용 트랜잭션을 사용합니다.
UI에는 한글 필드명·원본 코드·코드명을 함께 표시하며 미등록 코드는 원문을 유지합니다.

기존 더미는 6개 시나리오, 14개 데이터셋 1,678행과 `seed_manifest`로 구성됩니다.
기온·습도 등 지표 672행, 스냅샷 132행, 경로 540행을 포함합니다.
기존 데이터를 덮어쓰거나 실제 수집 스키마로 복사하지 않습니다.
같은 시드 버전 재실행은 기존 세트를 유지하며 실제 관측·안전 평가로 표시하지 않습니다.

## 검증과 배포

```bash
cd frontend
npm run lint
npm test
npm run build
```

백엔드는 폐기 가능한 별도 PostgreSQL `pongdang_test` 접속 환경을 지정한 뒤 실행합니다.

```bash
cd backend
uv run --frozen ruff check .
uv run --frozen ruff format --check .
uv run --frozen pytest
```

- `dev`: 개발·통합, CI만 실행
- `main`: CI 통과 후 이 서버에 독립 Compose 스택 자동 배포
- CI: lint·테스트·빌드, 자체 DB 초기화·더미 시딩·조회 및 레거시 API 폐쇄 검증
- 배포: 빌드 후 자체 DB 스키마 초기화, 앱 교체. 실패 시 이전 앱 복구
- 스키마 초기화는 추가만 수행하며 기존 더미/다른 스키마는 변경하지 않음
- `pongdang-ci-watch.timer`: 최신 main/dev 커밋에 CI 실행이 없는 경우만 보완 실행

운영 URL `/pongdang/`, 내부 웹 포트 `127.0.0.1:5188`과 `access-pongdang` SSO 권한을
유지합니다. DB/API 포트는 직접 외부에 게시하지 않습니다.

운영 환경: `/home/cks/.config/pongdang/production.env` (비밀, Git 제외)

배포: `/home/cks/.local/share/pongdang-deploy/releases/<SHA>`, `current`, `previous`

SSH 게이트: `/usr/local/libexec/pongdang-deploy` (`ops/pongdang-deploy` 설치본)

주의: 기존 `db.bonifacio.work:15432`는 여전히 **레거시 cksDB의 Multtara DB**입니다.
Pongdang DB가 아니며 이번 독립화에서 그 연결 대상이나 비밀번호를 바꾸지 않습니다.
