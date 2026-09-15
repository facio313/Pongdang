# Pongdang

공모전용 독립 프로젝트입니다. React / Vite / TypeScript / Node.js 24,
Python 3.14 / FastAPI, PostgreSQL 18을 사용합니다.
레거시 Multtara 저장소·DB·네트워크·인증정보를 사용하지 않습니다.

## 실제 데이터 수집

`collector → 공식 API → pongdang_data → /api/data → frontend` 경로로 동작합니다.
별도 collector 프로세스가 기상청, 국립해양조사원, 수질·관측소, 관광공사,
카카오의 공개 자료를 수집합니다. 작업별 주기·다음 실행·오류·수신 건수는
데이터 조회의 **API 갱신 작업** 표에서 확인합니다.

기본 조사 범위는 경포대 중심 20km이며, 선택한 관측소 자료는 그 관측소의
공간 범위를 그대로 유지합니다. 다른 관측소의 값이 해변의 실측값이라는 뜻은 아닙니다.
카카오 검색은 5분류 각 최대15개, 관광정보는 최대500개로 제한된 주변 카탈로그입니다.
조회 상한이 있는 결과는 `partial`로 표시하며 전체 목록 수집으로 표시하지 않습니다.
관측소만 확인되고 관측값이 없으면 `no_data`이며, 아직 승인되지 않은 API는
새 자료를 만들어 채우지 않습니다. [수집 계약과 운영](docs/ingestion.md)을 참고하세요.

기존 더미 생성 코드와 `/api/demo`는 제거했습니다. 실제 자료가 없는 화면은
빈 상태를 표시합니다. 기존 기능 화면은 유지하며 원본 표를 연결했습니다.
안전 점수·추천·경로 계산·라이브캠은 이번 수집 작업만으로 제공되지 않습니다.

## 로컬 실행

PostgreSQL 18에 퐁당 전용 `pongdang` DB와 계정을 만듭니다.
`backend/.env.example`을 `backend/.env`로 복사해 DB와 API 키를 입력하세요.
키와 엑셀은 Git에 포함하지 않습니다. 저장된 엑셀을 서비스가 직접 읽지는 않습니다.

```bash
cd backend
uv sync --frozen
uv run python -m app.schema --initialize --remove-demo
uv run python -m app.ingestion.worker --once
uv run python -m app.ingestion.worker
```

worker는 계속 실행하는 별도 프로세스입니다. 다른 터미널에서 웹을 실행합니다.

```bash
cd backend
uv run uvicorn app.main:create_app --factory --host 127.0.0.1 --port 8000
```

```bash
cd frontend
npm ci
npm run dev
```

macOS에서 로그아웃 전까지 자동 재시작과 로그인 시 실행이 필요하면
`python3 ops/install-local-collector.py --python /absolute/path/to/venv/bin/python`을
실행합니다. 계정별 launchd 서비스이며 Mac이 꺼지거나 잠든 동안 수집하지 않습니다.
실행 코드와 비공개 환경 설정은 `~/.local/share/pongdang/collector/releases/`에
복사해 Desktop/iCloud 파일 대기에 영향을 받지 않도록 했습니다. 코드나 키를 바꾼 뒤
설치 명령을 다시 실행하면 새 실행본으로 교체됩니다.

## Docker와 운영

```bash
cp .env.example .env
# DB 비밀번호와 발급받은 API 키 입력
docker compose up -d --build --wait
```

`initialize` 일회성 서비스가 자체 스키마를 초기화·이전하고 은퇴한
`pongdang_demo`만 제거한 뒤 backend와 collector가 시작됩니다.
기존 실제 데이터와 `postgres_data` 볼륨은 유지합니다.
collector는 `restart: unless-stopped`로 계속 실행하며 DB/API 포트는 공개하지 않습니다.
웹 포트만 `127.0.0.1:5188`에 바인딩합니다.

운영 URL `/pongdang/`의 Vite base / FastAPI root path와 Bonifacio SSO
`access-pongdang` 게이트를 유지합니다. 운영 환경 파일은
`/home/cks/.config/pongdang/production.env`이며 API 키도 이 파일에 등록합니다.
로컬 환경 파일은 서버에 자동 전송되지 않습니다.

지도는 카카오 **JavaScript 키**를 사용합니다. 로컬에서는
`frontend/.env.local`에 `VITE_KAKAO_MAP_KEY`를 등록하고 Vite를 재시작합니다.
서버에서는 `/home/cks/.config/pongdang/production.env`의 같은 변수에 키를
등록한 뒤 현재 `main`을 기존 배포 절차로 다시 빌드·배포합니다.
Compose가 이 변수 하나를 프론트 Docker 빌드 인자로 전달합니다.
Vite의 빌드 시점 설정이므로 컨테이너 재시작만으로는 키 변경이 반영되지 않습니다.
카카오 Developers의 JavaScript SDK 도메인에 실제 접속 origin
(`http://127.0.0.1:5173`, `http://localhost:5173`, `https://bonifacio.work`)을 등록합니다.
`KAKAO_REST_KEY`는 수집기의 장소 검색용 키이며 지도 키로 사용하지 않습니다.
키 값과 `.env` 파일은 커밋하지 않습니다. 브라우저용 JavaScript 키는 지도 SDK
요청에 포함되므로 등록 도메인으로 사용 범위를 제한합니다.

Water Index의 지점 지도와 전체 지도는 실제 카카오 타일·장소 좌표를 사용합니다.
금요일 프론트 시안에 있던 점수·수온 등은 별도 시연용 값으로 유지하며,
이 지도 연결 작업이 실시간 관측·평가 API 연결을 의미하지는 않습니다.

`dev`는 통합, `main`은 CI 통과 후 자동 배포입니다. 이 코드의 수정만으로 운영
배포가 완료되는 것은 아닙니다. `ops/pongdang-deploy`는 SSH 게이트 설치용 소스이고
애플리케이션 배포가 게이트 설치본을 바꾸지는 않습니다.

## 조회 API와 검증

- `/api/data/catalog`, `/api/data/summary`, `/api/data/datasets/{key}`
- `/api/health`, `/api/ready`
- `/api/demo/*`와 `/api/collector/*`는 404

조회는 허용 목록과 읽기 전용 트랜잭션을 사용하며 최대100행으로 제한됩니다.
주기 수집이 HTTP 요청의 부작용으로 실행되거나 수집 실패를 더미로 대체하지 않습니다.

```bash
cd frontend
npm run lint
npm test
npm run build
```

```bash
cd backend
# 폐기 가능한 pongdang_test DB 및 전용 테스트 접속환경을 지정
POSTGRES_DB=pongdang_test uv run pytest
uv run ruff check .
uv run ruff format --check .
```

실제 API를 호출하는 스모크는 수동 검증이며 CI 테스트는 제공처 응답 대역을 사용합니다.
운영 DB에서 테스트나 더미 시드를 실행하지 않습니다.

### 물 풍경 웹캠

`/pongdang/#livecam`은 해변·해안·항구·호수·하천의 실제 Windy 카메라를 모아 보여줍니다.
서버 전용 `WINDY_WEBCAMS_API_KEY`를 설정하면 화면 요청에 따라 조회하며, 기존 수집 장소
10km 이내인 카메라를 먼저 표시합니다. [설정과 조회 범위](docs/webcams.md)를 참조하세요.
