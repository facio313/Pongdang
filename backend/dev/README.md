# 운영과 분리된 로컬 로그인 테스트

`local_preview.py`는 실제 Pongdang API 앞에 로컬 테스트 로그인만 연결하는
개발용 실행 파일이다. 운영 SSO 계정으로 인증하지 않는다. 운영 Dockerfile은
`app/`만 복사하므로 이 디렉터리는 운영 이미지에 포함되지 않는다.

현재 구성의 설정 경로는 저장소의 `.local/login-preview-config-path`에 있다.
설정과 테스트 비밀번호는 저장소 밖의 사용자 전용 디렉터리에 0600 권한으로
저장한다. 비밀번호 파일 `LOCAL-LOGIN.txt`는 설정 파일과 같은 디렉터리에 있다.
설정이나 비밀번호를 커밋·출력·운영 환경에 복사하지 않는다.

## 실행

준비된 별도 PostgreSQL이 실행 중일 때 저장소 루트에서:

```sh
preview_config="$(cat .local/login-preview-config-path)"
backend/.venv/bin/python backend/dev/local_preview.py --config "$preview_config"
```

다른 터미널에서 기존 5173 포트의 개발 서버를 정상 종료한 후:

```sh
cd frontend
APP_BASE_PATH=/pongdang/ APP_API_TARGET=http://127.0.0.1:18000 VITE_KAKAO_MAP_KEY= npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

Node.js 24를 사용한다. 접속 주소는 `http://127.0.0.1:5173/pongdang/`이며
`localhost` 등 다른 호스트는 테스트 인증에서 허용하지 않는다. 실행 PID와 로그
위치는 설정 파일 옆 `runtime.json`에 기록돼 있다. PostgreSQL을 다시 시작할 때는
해당 디렉터리의 `postgres/`에만 PostgreSQL 18의 `pg_ctl -D ... start`를 사용한다.
이 명령은 처음 생성한 서버의 loopback·포트 설정을 재사용한다.

## 검증 가능한 범위

- 테스트 계정의 로그인·오류·세션 만료, 개인 API의 인증 요구 처리.
- 실제 수집 장소와 점수를 이용하는 취향 기반 추천.
- 테스트 계정의 취향·코스 저장 및 재조회. 알림은 앱 내 저장 경로만 사용한다.

AI 대화, 외부 도로 경로 계산, 지도 SDK, 메일 발송과 실시간 수집은 꺼져 있다.
따라서 이 환경의 로그인 성공은 운영 Bonifacio SSO의 인증 성공을 증명하지 않으며,
지도나 경로 시각은 비어 있을 수 있다. 자료는 로컬 원본에서 복사한 스냅샷이고,
기존 관측 시각·유효기간을 늘리거나 빠진 점수를 생성하지 않는다.

## 격리 경계

- `127.0.0.1`의 별도 포트와 `pongdang_test` DB만 허용하며 원본 5432는 거부한다.
  시작 시 관리자만 변경 가능한 `local_preview.identity` 표의 표시값을 검증한다.
- 모든 설정을 명시적으로 생성하여 `.env`나 상속된 운영/유료 API 키를 사용하지 않는다.
  일반 앱의 인증 요구는 유지하고, 유효한 로컬 쿠키에만 테스트 소유자를 전달한다.
- 임의 SSO 헤더를 제거하고 요청의 실제 peer·Host·Origin을 확인한다.
  쿠키는 host 전용·HttpOnly·SameSite=Strict이며 세션은 최대 12시간이다.
  서버를 다시 시작하면 로그인 상태가 만료되지만 저장된 코스는 남는다.
- 실행 시 Python 네트워크 감사 훅으로 테스트 DB 이외의 연결과 외부 DNS 조회를
  거부한다. 별도 worker·collector·메일 발송 프로세스를 시작하지 않는다.
- 운영 SSO 세션·개인 이력은 복사하지 않는다. `travel_*`, `notification_*`, `ai_*`
  데이터는 빈 상태에서 시작하며 테스트 저장은 이 별도 DB에만 남는다.

기존 로컬 수집 DB 화면으로 복귀하려면 Vite만 정상 종료 후
`APP_API_TARGET=http://127.0.0.1:8000`으로 다시 실행한다. 현재 원본 로컬 backend와
collector는 그대로 실행 중이며, 이 테스트 구성이 운영 배포 설정을 바꾸지 않는다.
