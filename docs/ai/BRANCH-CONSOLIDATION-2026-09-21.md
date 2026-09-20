# 브랜치 통합 및 운영 배포 · 2026-09-21

## 승인과 보존 범위

사용자는 현재 수정 커밋, Codex/Cursor 브랜치 통합·정리, main 머지·푸시·운영 배포를 승인했다. 유지할 이름은 `main`, `dev`, `feature/connect`, `feature/today-page`, `feature/api`다. 기존 `feat/today-page`는 이름을 맞춘다. .env, 키, SSO 설정, DB 스키마는 이 작업에서 변경하지 않는다.

## 통합 결정

- 검증된 R37/R22/R60 및 잔여 수정은 `68648ca`에 커밋했다. `report.md` 완료 23개와 기존 제외 범위는 유지한다.
- `dev`에서 main `9e6055f`를 합친 뒤 푸시 전 fetch에서 발견한 `3e5bf9e`도 충돌 없이 합쳤다. main의 새 카테고리별 취향 UI, 공용 취향 조회, 히어로 구성, 캐시 및 지도 조건 일괄 조회를 유지하며 이번 버그 수정을 적용했다.
- 추가 main 변경은 홈의 상세 근거를 오늘 탭으로 이동한다. 이 동선을 유지하며 모바일 오늘에도 기존 ScoreExplainer를 연결해 설명이 사라지는 회귀를 막았다.
- 새 단계 UI에 맞게 회귀 테스트의 이동 경로를 수정했다. 카드 신호 비차단, 카테고리 한도, 태그 중복 제거, 저장·후보 요청 중복 방지, 재조회·취소·늦은 응답 배제 검사는 계속 검증한다.
- Cursor `d86cee2`는 예전 `waterTravelAsk` 화면·특수 AI 프레임 실험과 ` 2.py`/` 2.mjs` 복사본이다. 현재 `useTravelConcierge`와 서버 키워드 계약으로 대체된 구현이므로 파일을 덮어쓰지 않고 `ours` merge로 퇴역 이력을 보존한다. 다른 삭제 대상은 통합 계보에 포함된다.
- 모든 원래 refs와 전체 커밋은 외부 `all-refs.bundle`에 보존했고 무결성을 검사했다. 체크아웃 도중 나타난 미추적 번호 복사본 120개는 SHA-256 manifest와 함께 외부 백업으로 이동했다. `.byeori/`와 기존 stash는 보존한다.
- 백업: `/Users/cksmacbook/.codex/backups/pongdang-branches-2026-09-21-e66k67t8/`.

## 검증

- Node 24: frontend lint, 단위 테스트 106개, production build 통과.
- backend Ruff lint/format, pytest 1170 passed / 2 skipped / 2 deprecation warnings. Docker 부재로 로컬 Compose 검사 2개는 skip이며 GitHub Actions smoke에서 검증한다.
- 자동 검사 DB: 별도 일회용 127.0.0.1:51907 `pongdang_test`. 화면 확인은 기존 5173/8000/51906 실제 자료 복사본을 사용한다. 운영 DB는 사용하지 않았다.
- 컴퓨터 유즈 390×844, scrollY=0: 첫 카테고리 note bottom 371.42 / slot top 441.42 / CTA bottom 497.42 / tab top 780. 마지막 카테고리 423.42 / 493.42 / 549.42 / 780. 노트 겹침 0, CTA 위 여유 12px 이상, 실제 클릭으로 카드 단계에 진입했다.
- 좋아요·패스 즉시 다음 카드로 이동, aria-busy=false, 전면 요청 토스트 없음. 장소 온천+활동 온천을 포함해 저장했고 GET 결과 tags는 `[물 보며 쉬기, 해변, 온천, 서핑]`으로 중복이 없었다. 저장 안내·후보 5곳과 오늘 탭 이동을 확인했다. 원래 취향 PUT200 및 재조회 복구 완료.
- 최종 main 추가 통합 후 브라우저 전체 실행: 117개 통과, 5개는 이동한 상세 설명의 공용 class 선택자와 오늘 주간 조회의 잔여 요청을 세는 검사 문제였다. 설명 제목으로 범위를 좁히고 이전 화면 조회를 마친 뒤 새 홈 요청을 측정하도록 수정했다. 영향받는 mobile-layout/product 29개 재실행 전부 통과. 전체 122개는 dev/main CI에서 다시 실행한다.
- 새 홈 링크 → 오늘 → 점수 설명 펼치기도 390×844 실제 클릭으로 확인했다. 설명이 열리고 안전 판정과의 구분 문구를 유지하며 가로 넘침이 없다.


## 배포 절차

통합 dev의 CI(frontend/backend/browser/standalone Compose smoke)를 통과시킨 후 같은 커밋으로 main을 fast-forward하고 push한다. main의 동일 CI와 기존 production 배포 작업을 통과해야 운영 반영 완료다. 수동 우회 배포나 강제 push는 하지 않는다. 성공 뒤 불필요한 로컬·원격 브랜치 및 깨끗한 Codex report worktree를 정리한다.

실제 Actions 실행 URL·배포 SHA·최종 refs와 health 확인 결과는 위 외부 백업 디렉터리의 `release-verification.json`에도 기록한다. 이 기록은 배포 이후 생성하며 소스 변경으로 재배포를 유발하지 않는다.
