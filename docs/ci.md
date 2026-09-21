# 빠른 로컬 검증과 main 배포

2026-09-21 사용자 정책: `dev`에 커밋·병합·동기화·푸시·배포하지 않는다.
기존 dev는 보존하고 승인된 작업 브랜치를 `main`에 직접 통합한다. main push와
main 대상 PR만 자동 검사하며 PR은 배포하지 않는다. 수동 CI는 전체 검사이고,
dev 수동 실행 및 dev에서 연 PR은 차단한다.

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
실행한다. 로컬에서는 전체 Vite 빌드·브라우저 167개·Docker 스택을 기본으로
실행하지 않는다. CSS만 변경하면 타입 검사를 생략하고 영향받는 화면을 확인한다.
타입 검사 캐시는 `frontend/node_modules/.cache/`에 저장한다.

백엔드는 수정 Python의 Ruff와 지정한 관련 테스트를 실행한다. 영향 범위가
등록되지 않은 백엔드 동작 변경에는 `--test`로 테스트 파일을 지정해야 한다.
아무 테스트 없이 검증 완료로 처리하거나 자동으로 전체 테스트를 시작하지 않는다.
DB 테스트는 자신이 만든 폐기 가능한 DB임을 확인한 후
`PONGDANG_TEST_DISPOSABLE=1`, `POSTGRES_HOST`(loopback), `POSTGRES_PORT`,
`POSTGRES_DB=pongdang_test`, `POSTGRES_USER`, `POSTGRES_PASSWORD`를 명시해야 한다.
이 스크립트는 DB 생성·운영 연결·환경 파일 복사·커밋·배포를 하지 않는다.

화면 동작을 바꿨으면 해당 Playwright 파일이나 테스트만 추가로 확인한다.
공통 흐름 확인은 `cd frontend && npm run test:browser:smoke`로 실행한다.
`PONGDANG_TEST_FRONTEND_PORT`, `PONGDANG_TEST_BACKEND_PORT`를 지정하면 기본
5177/8099 대신 별도 포트를 사용한다. 테스트 서버는 기존 서버를 재사용하지 않고,
자신의 loopback `pongdang_test`를 초기화하므로 개발용/운영 DB를 지정하면 안 된다.

## CI: 평소 핵심 흐름, 위험한 변경은 전체 검사

| 변경 | 프런트 | 백엔드 | 브라우저 | 독립 Docker 스택 |
| --- | --- | --- | --- | --- |
| README·AGENTS·docs Markdown만 | 생략 | 생략 | 생략 | 생략·배포 없음 |
| 화면 TSX·CSS·번역·정적 자산 | lint·짧은 단위 검사 | 생략 | 핵심 8개 | 기동·readiness·DB 초기화·collector |
| 서버 안내 문구 `travel/language.py` | 생략 | Ruff·여행/채팅 관련 테스트·기본 계약 | 핵심 8개 | 기본 기동 확인 |
| 백엔드 테스트 파일만 | 생략 | 수정 테스트·기본 계약 | 핵심 8개 | 기본 기동 확인 |
| 공용 TS/API·기타 백엔드 코드·테스트 구성/브라우저 테스트 | 영향받는 영역 | 영향받으면 전체 | 전체 167개, 2 shards | 전체 |
| 의존성·Docker·CI·ops·미분류·이력 확인 불가·수동 실행 | 영향 범위에 따라 실행, 미분류/수동은 양쪽 | 영향받으면 전체 | 전체 | 전체 |

기본 브라우저 8개는 모바일의 홈/오늘, 관측 누락·제한 안내, 추천→코스 저장,
빈 데이터·비인증, 관심 장소·알림 설정과 데스크톱의 오늘, 지도, 코스 저장이다.
기존 테스트에 `@smoke` 태그를 붙였으며 검증문을 삭제하거나 실패를 무시하지 않는다.
전체 테스트는 `npm run test:browser`와 수동 Actions 실행에서 유지된다.
전체 검사는 두 runner의 독립 DB로 나누고, 각 shard의 worker는 1개를 유지한다.

인증·권한·DB·수집·점수·공용 API 변경은 범위를 좁히지 않는다. 백엔드의 빠른
생산 코드 경로는 현재 서버 표시 문구 한 모듈뿐이다. 새 경로를 좁히려면 실제
호출부와 관련 테스트를 확인해 `ops/ci_scope.py`에 명시적으로 등록한다.

기준은 마지막으로 **성공한 main push CI 커밋**이다. 직전 푸시가 실패/취소됐어도
그 이후 변경을 포함한다. 기준·API·이력을 확인할 수 없으면 전체 검사한다.
테스트/실행 코드인 docs 내 파일은 Markdown으로 취급하지 않는다.

## 빌드와 운영 확인

선택된 검사는 병렬 실행한다. 프런트 CI 작업은 lint와 단위 테스트만 수행하고,
타입 검사와 Vite 빌드는 Docker 이미지 생성에서 한 번 수행한다. frontend/backend
이미지별 GitHub Actions 레이어 캐시와 npm/uv 설치 캐시를 사용한다. 캐시가 없어도
정상 빌드하고, 오래된 결과만 믿고 변경된 소스 검사를 생략하지 않는다. 캐시
전송에는 60초 제한을 두며 실패를 통과로 바꾸지 않는다. 방식의 근거:
[Docker 공식 GitHub Actions 캐시 문서](https://docs.docker.com/build/cache/backends/gha/).

빠른 Docker 검사는 추가형 DB 초기화와 frontend/backend/collector health,
readiness, 실제 데이터 API, 폐기 API 404를 유지한다. 반복 초기화와 첨부 볼륨
재생성·권한 검사는 전체 모드에서 실행한다.

선택된 필수 검사가 실패·취소되면 배포하지 않는다. 오래된 검증은 취소할 수 있지만
운영 배포는 별도 concurrency로 직렬 실행하며 자동 취소하지 않는다. 배포 직전과
서버 게이트에서 최신 main SHA를 확인한다. 운영에서는 기존 SHA·container health·
readiness 확인과 실패 시 이전 앱 이미지 복원을 유지하고 전체 테스트를 재실행하지 않는다.

운영 서버는 기존 방식대로 서버 아키텍처와 운영 빌드 인자로 이미지를 만든다.
이번 변경은 CI와 운영의 이미지를 공유하도록 바꾸지 않는다. 공유하려면 서버의
아키텍처·레지스트리 접근·지도 빌드 인자·SSH 게이트 설치를 함께 확인해야 한다.
Dockerfile의 설치 캐시는 다음 운영 빌드에서도 사용할 수 있다.

이전 CI는 백엔드 5분 38초와 브라우저 5분 34초를 순차 실행했다. 평소 2~5분은
목표이며 실측 보장이 아니다. 다운로드/runner 대기, 첫 캐시 적재, 전체 검사 여부에
따라 달라진다. 로컬/CI/운영을 같은 검증 체인으로 세 번 반복하지 않는 것이 기본이다.

워크플로는 main 반영 후 활성화된다. `ops/pongdang-ci-watch`와 timer는 설치용
템플릿이며 운영 설치본은 별도 반영해야 한다. 앱 배포가 SSH 게이트나 timer를
자동 갱신하지 않는다. 다른 앱의 설치본은 변경하지 않는다.
