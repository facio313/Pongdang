# 빠른 로컬 검증과 main 빌드·배포

2026-09-23 사용자 정책: `dev`에 커밋·병합·동기화·푸시·배포하지 않는다.
기존 dev refs는 보존하고 승인된 작업을 `main`에 직접 통합한다. GitHub Actions는
main push와 main 대상 PR에서 운영용 이미지 두 개의 빌드만 수행한다. PR은 배포하지
않으며 main에서는 두 빌드가 성공하면 자동 배포한다. 수동 실행도 같은 두 빌드만
수행하고, dev 수동 실행 및 dev에서 연 PR은 차단한다.

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

워크플로 `.github/workflows/ci.yml`에는 다음 두 단계만 있다.

1. backend와 frontend 운영 Docker 이미지를 서로 다른 runner에서 병렬 빌드한다.
2. main의 두 빌드가 모두 성공하면 기존 SSH 게이트로 자동 배포한다.

Actions에서는 ESLint, Node 단위 테스트, Ruff, pytest, Playwright, PostgreSQL 테스트,
Compose 기동·초기화·API smoke를 실행하지 않는다. 변경 범위 선택과 테스트 shard도
사용하지 않는다. 문서만 바뀐 main push도 같은 이미지 빌드와 배포를 거친다.

frontend Dockerfile의 `npm run build`는 `tsc --noEmit`과 Vite production bundle을
실행한다. 이는 실제 frontend 이미지 생성 명령의 일부다. backend Dockerfile은 잠긴
운영 의존성을 설치하고 애플리케이션을 담은 이미지를 만든다. backend·collector·
initialize는 같은 backend 이미지를 사용하므로 Actions에서 필요한 운영 이미지 빌드는
두 개다. 각 빌드는 기존 GitHub Actions layer cache를 재사용하되 cache가 없어도
정상적으로 완료되어야 한다.

## 자동 배포 경계

PR과 main 이외의 수동 실행은 빌드만 하고 배포하지 않는다. main 배포는 두 이미지
빌드가 성공한 경우에만 시작하며, 운영 배포 concurrency는 직렬이고 실행 중인 배포를
새 push 때문에 취소하지 않는다. 배포 직전에 GitHub의 최신 main SHA를 다시 확인한다.

운영 서버의 `/usr/local/libexec/pongdang-deploy`는 서버 아키텍처와 운영 빌드 인자로
이미지를 다시 빌드한다. 최신 main 확인, `flock` 직렬화, 추가형 스키마 초기화,
컨테이너 health와 `/api/ready` 확인, 실패 시 이전 애플리케이션 이미지 복구를 유지한다.
이는 배포 안전 경계이며 GitHub Actions의 테스트 suite가 아니다. 같은 SHA를 Codex가
별도 `compose build/up`이나 SSH 호출로 중복 배포하지 않는다.

`ops/pongdang-ci-watch`와 timer는 최신 main SHA에 `ci.yml` 실행이 전혀 없을 때만
수동 실행을 요청한다. 앱 배포는 호스트의 감시기나 SSH 게이트 설치본을 자동으로
갱신하지 않으며, 다른 앱의 설치본도 변경하지 않는다.
