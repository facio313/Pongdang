# 추천 진입 로그인 안내 · 2026-09-30

- 요청/완료: 추천 진입 시 비로그인이면 처음부터 로그인 버튼을 표시하고 나머지 추천 조작을 비활성화한다. 데스크톱·모바일에 적용 완료.
- 구현: 기존 `useTastePreference`의 인증·조회 상태와 기존 로그인 팝오버를 사용한다. 확인 중·비로그인·조회 실패 동안 추천 본문을 `disabled` fieldset과 `inert`로 잠그며, 지역·태그·단계 진행·저장·링크를 조작할 수 없다. 히어로의 추천 행동도 비활성화한다. 비로그인 자동 스크롤을 막아 로그인 안내가 첫 화면에 남는다. 로그인 성공 후 보호된 취향 API가 성공하면 잠금을 해제한다. 공통 메뉴와 탭 이동은 유지한다.
- 관련: `frontend/src/RecommendationLoginNotice.tsx`, `recommendationAccess.css`, `RecommendDesktop.tsx`, `RecommendPage.tsx`, `locales/travel.ts`. 서버·인증 설정 변경 없음.
- 검증: `ops/verify_local.py`에 위 5파일 지정, ESLint·Node 단위 240개·증분 TypeScript 통과. Playwright CLI로 1440/390px에서 최초 로그인 버튼 가시성, 인증 확인 중 잠금, 모든 본문 입력 및 히어로 행동 비활성화, 팝업 닫기·재열기·실패 후 잠금 유지, 로그인 성공 후 지역/취향 선택, 가로 넘침 없음 확인. 모든 API를 브라우저 안에서 모의하여 DB·운영 SSO·외부 제공자 호출 없음. 최초 검증은 fieldset에 대한 `isDisabled()` 판별 때문에 실패했으며 실제 DOM의 disabled/inert 및 자식 컨트롤 상태를 확인하는 방식으로 수정 후 통과했다.
- 증거: `.local/recommend-login-20260930/{checks,browser}.log`, `output/playwright/recommend-login-{1440,390}-guest.png`. 별도 51299 Vite와 검증 브라우저 종료. 기존 5173 미리보기에서 변경 모듈 제공 확인. 백엔드 재시작·사용자 로그인 세션 변경 없음.
- 기존 `fix/finale` 변경과 `docs/ai/CURRENT.md` 사용자 수정 보존. 커밋·푸시·배포·dev ref 변경 없음. 미해결 사항 없음.
