# 빠른 로컬 검증과 main 빌드·배포

2026-09-23 사용자 정책: `dev`에 커밋·병합·동기화·푸시·배포하지 않는다.
기존 dev refs는 보존하고 승인된 작업을 `main`에 직접 통합한다. GitHub Actions는
main push와 main 대상 PR에서 운영용 이미지 두 개의 빌드만 수행하며 서버에 접속하지
않는다. PR은 배포하지 않는다. main에서는 호스트 감시기가 최신 SHA의 성공한 두 빌드를
확인한 뒤 로컬 배포 게이트를 요청한다. 수동 실행도 같은 두 빌드만 수행하고, dev 수동
실행 및 dev에서 연 PR은 차단한다.

## 로컬: 수정한 부분을 한 번 확인

원본 저장소는 iCloud 안의 기존 위치에 둔다. 검증을 위해 원본을 이동하거나
동기화 설정을 바꾸지 않는다. 매번 전체 저장소를 복제하거나 모든 worktree를
조회하지 않는다. 같은 코드에서 통과한 검사는 관련 변경·실패가 없으면 반복하지 않는다.

```sh
# 저장소 루트에서: 수정 파일을 직접 지정한다. Git 전체 스캔·복제·빌드는 없다.
python3 ops/verify_local.py frontend/src/HomePage.tsx frontend/src/pongdang.css

# 실행할 검사만 미리 출력
python3 ops/verify_local.py backend/app/main.py --test backend/tests/test_health.py --dry-run
```

프런트는 수정 TS/TSX의 ESLint, 짧은 Node 단위 테스트, 필요할 때 증분 타입 검사를
실행한다. 로컬에서는 전체 Vite 빌드·전체 브라우저·Docker 스택을 기본으로 실행하지
않는다. CSS만 변경하면 타입 검사를 생략하고 영향받는 화면을 확인한다. 타입 검사
캐시는 `frontend/node_modules/.cache/`에 저장한다.

백엔드는 수정 Python의 Ruff와 지정한 관련 테스트를 실행한다. 영향 범위가
등록되지 않은 백엔드 동작 변경에는 `--test`로 테스트 파일을 지정해야 한다.
아무 테스트 없이 검증 완료로 처리하거나 자동으로 전체 테스트를 시작하지 않는다.
DB 테스트는 자신이 만든 폐기 가능한 DB임을 확인한 후
`PONGDANG_TEST_DISPOSABLE=1`, `POSTGRES_HOST`(loopback), `POSTGRES_PORT`,
`POSTGRES_DB=pongdang_test`, `POSTGRES_USER`, `POSTGRES_PASSWORD`를 명시해야 한다.
이 스크립트는 DB 생성·운영 연결·환경 파일 복사·커밋·배포를 하지 않는다.

화면 동작을 바꿨으면 영향받는 Playwright 파일이나 화면만 추가로 확인한다.
브라우저 테스트는 자신이 만든 loopback `pongdang_test`와 별도 포트만 사용한다.
운영 DB·기존 개발 DB·운영 환경 파일은 테스트에 사용하지 않는다.

## GitHub Actions: 이미지 빌드만

워크플로 `.github/workflows/ci.yml`에는 backend와 frontend 운영 Docker 이미지의
병렬 빌드만 있다.

Actions에서는 서버 SSH 키를 사용하거나 inbound 배포 연결을 열지 않는다. ESLint,
Node 단위 테스트, Ruff, pytest, Playwright, PostgreSQL 테스트, Compose 기동·초기화·
API smoke도 실행하지 않는다. 변경 범위 선택과 테스트 shard도 사용하지 않는다.
문서만 바뀐 main push도 같은 두 이미지 빌드를 거치며, 성공하면 호스트가 배포한다.

frontend Dockerfile의 `npm run build`는 `tsc --noEmit`과 Vite production bundle을
실행한다. 이는 실제 frontend 이미지 생성 명령의 일부다. backend Dockerfile은 잠긴
운영 의존성을 설치하고 애플리케이션을 담은 이미지를 만든다. backend·collector·
initialize는 같은 backend 이미지를 사용하므로 Actions에서 필요한 운영 이미지 빌드는
두 개다. 각 빌드는 기존 GitHub Actions layer cache를 재사용하되 cache가 없어도
정상적으로 완료되어야 한다.

## 호스트 pull 배포 경계

`/usr/local/libexec/pongdang-deploy-watch`는 최신 main의 정확한 SHA와 `ci.yml`만
조회한다. 해당 SHA의 run 중 하나라도 queued/in_progress이면 기다린다. 모두 완료된
뒤 가장 최신 run이 success이고 그 최신 attempt의 `Build backend image`와
`Build frontend image` job이 각각 하나씩 success인 경우에만 진행한다. API 응답이
잘렸거나 예상하지 않은 job·event·SHA가 섞이면 배포하지 않는다. 배포 직전에 main과
run 상태를 다시 조회하고, current release가 이미 같으면 아무 작업도 하지 않는다.

감시기는 run ID와 attempt별 결과를 원자적으로 기록한다. 시작 중 중단되거나 로컬
게이트가 실패한 attempt는 매분 자동 재시도하지 않는다. 새 SHA나 명시적으로 새로
완료된 CI attempt가 있어야 다시 판단한다. `/usr/local/libexec/pongdang-deploy-local`은
별도 잠금 안에서 current를 다시 확인하고 root 소유의 기존 게이트에 정확한
`deploy pongdang <SHA>` 명령만 전달한다. 게이트가 성공을 반환해도 current가 요청한
release로 바뀌지 않았으면 실패로 처리한다.

운영 서버의 `/usr/local/libexec/pongdang-deploy`는 서버 아키텍처와 운영 빌드 인자로
이미지를 다시 빌드한다. 최신 main 확인, `flock` 직렬화, 추가형 스키마 초기화,
컨테이너 health와 `/api/ready` 확인, 실패 시 이전 애플리케이션 이미지 복구를 유지한다.
이는 배포 안전 경계이며 GitHub Actions의 테스트 suite가 아니다. 같은 SHA를 Codex가
별도 `compose build/up`, SSH 호출 또는 watcher 수동 중복 실행으로 배포하지 않는다.

`ops/pongdang-ci-watch`와 timer는 최신 main SHA에 `ci.yml` 실행이 전혀 없을 때만
수동 실행을 요청한다. `ops/pongdang-deploy-watch`와 별도 timer는 성공한 실행만
관찰하며 CI dispatch나 rerun을 요청하지 않는다. 앱 배포는 호스트의 두 감시기,
local wrapper 또는 기존 게이트 설치본을 자동으로 갱신하지 않으며, 다른 앱의
설치본도 변경하지 않는다.

호스트 전환 시에는 설치본과 unit을 먼저 root 전용 위치에 백업한다. watcher와 local
wrapper는 `/usr/local/libexec/`에 root:root 0755, service와 timer는
`/etc/systemd/system/`에 root:root 0644로 설치한다. unit 구문과 mock 검증 결과를
확인한 뒤 `systemctl daemon-reload`한다. 기존 CI watcher는 그대로 유지한다. 새 timer를
활성화하기 전 실행 중 service가 없는지 확인하고, 첫 자연스러운 main CI에서 build
job·배포 SHA·컨테이너 health·readiness를 확인한다. 전환 성공 전에는 기존 SSH 자격을
회수하지 않으며, 성공 후 별도 승인된 운영 단계에서만 GitHub deploy secret과 전용
authorized key를 회수한다.
