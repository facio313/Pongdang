# 코스 즐겨찾기·추천 로그인 운영 배포 · 2026-09-30

- 사용자 승인: 지도 코스 별표 즐겨찾기, 홈의 최신 즐겨찾기 코스, 추천 화면의 로그인 안내·입력 잠금을 운영 배포한다.
- 기준: 작업 `fix/finale`, 로컬/원격 `main` 모두 `364267f7a23c831a332bbb4c21f189624d064369`. `main` 작업 트리(`/Users/cksmacbook/.codex/worktrees/pongdang-release-compat/Pongdang`)가 깨끗함을 확인했다. 작업 코드와 관련 테스트·계약·작업 문서만 커밋한다. 기존 `docs/ai/CURRENT.md` 수정 및 로컬 산출물은 보존한다.
- 검증: [코스 즐겨찾기](COURSE-FAVORITES.md), [추천 로그인](RECOMMEND-LOGIN.md)의 실제 통과 결과를 유지한다. 프런트 Node 24의 단위 240개, 변경 파일 ESLint·증분 TypeScript, backend Ruff·격리 PostgreSQL18의 여행 통합 21개, 데스크톱·모바일 관련 브라우저 검증 완료. 그 뒤 제품 코드 변경 없음. 스키마·호스트 설정 변경 없음.
- 절차: 검증된 커밋을 기존 `main` 작업 트리에 fast-forward 통합하고 `main`·`fix/finale`에 push한다. 정확한 main SHA의 `ci.yml` 두 이미지 빌드 성공 후 기존 호스트 watcher/gate의 배포를 기다린다. 배포 게이트는 건강/준비 검사를 통과해야 하며 실패하면 이전 앱 이미지로 복구한다. 별도 SSH 배포·호스트 설정 변경·운영 데이터 테스트 쓰기는 하지 않는다.
- 사전 관측: 공개 운영 자산은 `index-DGSGPWsN.js`와 `index-BFc3_Ssr.css`. 기본 Python User-Agent 요청은 Cloudflare403, 일반 브라우저 User-Agent의 같은 URL은200이다. 운영 확인은 정상 브라우저 요청으로 진행한다.
- 보존: `dev`·`origin/dev`는 `0f824a9ccecbd7ed5332919c99b03920b769000c`를 그대로 유지한다. 운영 인증은 기존 SSO를 사용하며 로컬 테스트 로그인 모듈은 배포 이미지에 포함되지 않는다.
- 현재 상태: 배포 커밋 준비. CI·운영 확인 자료는 `.local/release-favorites-20260930/`에 기록하고, 완료 후 이 문서의 로컬 상태를 갱신한다. 추가 문서만을 위한 재배포는 하지 않는다.
