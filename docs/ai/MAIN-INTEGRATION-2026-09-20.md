# 최신 main 통합과 로컬 커밋 · 2026-09-20

- 요청: 원격 main의 최신 변경을 현재 작업과 결합하고 커밋한다. 이 작업의 푸시는 요청되지 않았다.
- 대상: feature/connect-cursor. origin/main 377b20e에서 e1d5328로 추가된 9개 커밋을 fast-forward로 반영했다. 커밋 직전 원격 main이 e1d5328인 것도 확인했다.
- 보존: 예보 복구와 사진/첨부 작업을 작업용 stash 547acddd에 임시 보관했다가 복원했다. HomeDesktop, SpotsDesktop, TodayDesktop의 충돌 3개는 수질·오류 표시·사진 출처·예보 로딩/실패 구분을 함께 유지하도록 해결했다.
- 동시 작업: 통합 검증 도중 외부 작업이 tracked 변경을 17c3efc로 커밋하고 같은 이름의 원격 브랜치에 푸시했다. 해당 커밋은 수정하지 않는다. 아직 untracked였던 사진 수집 모듈·UI·테스트·문서와 마이그레이션 테스트 보완은 이번 후속 로컬 커밋으로 포함한다.
- 검증: Node 24.21.0 frontend lint, 단위 테스트 97개, build 통과. 전체 Playwright 43개 통과(51.7초). backend Ruff lint/format 통과.
- backend 전체 pytest: 1,148개 통과, 1개 실패, Docker CLI 부재로 Compose 검사 2개 skip. 실패는 v4 fixture를 만들면서 새 v9 attachment migration을 차단하지 않은 테스트 설정이었다. 기존 v4 및 최종 VERSION 검증은 유지하고 초기 fixture 구성에 해당 migration만 추가로 차단했다. 이후 관련 attachment/마이그레이션 61개 통과. 이어 추가된 공식 제공처 image/jpg 처리 테스트를 포함한 attachment 단위 검사 47개도 통과했다. 전체 suite를 수정 후 다시 실행한 것으로 해석하지 않는다.
- DB 테스트는 기존 수집/운영 DB와 분리된 PostgreSQL 18 클러스터 /tmp/pongdang-forecast-test.Pg5A4N, 127.0.0.1:55449의 UTF8 pongdang_test에서만 실행했다. 기존 55439 포트가 다른 작업에서 사용 중이어서 건드리지 않고 포트를 분리했다.
- 결과 로그: /tmp/pongdang-forecast-test.Pg5A4N/merge-backend-tests.log, /tmp/pongdang-merge-frontend-tests.log, /tmp/pongdang-merge-build.log, /tmp/pongdang-merge-browser-tests.log.
- 제외: 실제 .env/인증정보, .local/첨부 원본, 브라우저 로그·스크린샷 등의 실행 산출물. 운영 배포와 Compose 런타임 검사는 이 작업에서 실행하지 않았다.
