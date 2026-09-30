# 지도 코스 즐겨찾기와 홈 최신 코스 · 2026-09-30

- 요청/완료 조건: 지도에 저장된 코스마다 별표로 즐겨찾기를 켜고 끄며 새로고침 후에도 유지한다. 홈에는 즐겨찾기한 코스 중 가장 최근에 저장·수정한 코스 1개를 표시하고 해당 코스를 지도에서 연다.
- 구현 완료: 데스크톱·모바일 목록에서 코스 열기와 별표를 별도 버튼으로 제공한다. 성공한 저장 응답으로 별표를 채우며, 실패하면 상태를 유지하고 오류를 표시한다. 키보드 및 `aria-pressed`를 지원한다.
- 저장: 소유자 인증을 사용하는 `PUT /api/data/travel/plans/{plan_id}/favorite`, 본문 `is_favorite: boolean`. 기존 코스 JSON을 갱신하므로 스키마 마이그레이션은 없다. 이전 자료는 false로 읽고, 경로 재저장 시 행 잠금 안에서 최신 별표 값을 보존한다. 별표로 경로 계산·revision·목록 순서를 바꾸지 않는다.
- 홈 구현: `useFavoriteCourse`를 데스크톱·모바일이 공유한다. `GET travel/plans?favorite_only=true&limit=1&offset=0`은 소유자와 즐겨찾기를 페이지 적용 전에 필터링하고 기존 `updated_at DESC,id` 순서를 사용한다. 별표를 누른 시점이 아닌 코스 저장·수정 시점을 최신 기준으로 삼았다. 즐겨찾기 변경·코스 재저장 후 조회 캐시를 지우며, 저장된 경로의 장소 순서와 예상 이동 시간을 표시한다. 비로그인·빈 목록·조회 실패를 구분한다.
- 검증: Node 24.19.0/Python 3.14/PostgreSQL 18.3. `ops/verify_local.py`에 변경 파일과 여행 통합 테스트를 명시하여 ESLint, Node 단위 240개, 증분 타입 검사, Ruff, 백엔드 통합 21개 통과. 100개를 넘는 일반 코스·다른 소유자·이전 JSON·즐겨찾기 해제·코스 수정 시 최신 선택을 검증했다. 테스트는 이번 작업이 생성한 loopback 49923의 disposable `pongdang_test`만 사용했다. 추가 테스트의 줄 길이 lint 오류를 수정한 뒤 백엔드 검사만 재실행했다.
- UI: 별도 49924/49925 서버에서 Playwright CLI로 데스크톱·모바일 추가/해제, 재조회·새로고침 유지, Space 키, 503 저장 실패 시 상태 유지·오류 표시, 코스 열기와 선택 보존을 확인했다. 초기 브라우저 검증은 빈 탭으로 바뀌어 한 번 timeout이 났고 URL을 다시 연 뒤 나머지 검증이 통과했다. 외부 지도·길찾기 호출은 검증에 사용하지 않았다.
- 홈 UI: Playwright CLI에서 최신 즐겨찾기 표시, 정확한 지도 코스 열기, 해제 후 이전 코스 표시, 새로고침 유지, 모바일 동일 표시·가로 넘침 없음, 전체 해제 후 빈 안내, 다시 추가 후 갱신, 401 로그인 안내·503 조회 오류를 확인했다. 화면은 `output/playwright/home-favorite-desktop.png`, `home-favorite-mobile.png`. 검증 중 라이브캠 503은 테스트 서버에 Windy 키가 없는 상태의 기존 응답이다.
- 현재 미리보기: 기존 5173 프런트와 18000 로컬 테스트 DB 설정을 유지하고 백엔드만 최신 코드로 재시작(PID 33658)했다. readiness 200, 실행 중 `/api/openapi.json`의 `favorite_only` 조회 매개변수 확인. 재시작으로 로컬 로그인 세션은 다시 필요할 수 있다. 기존 사용자 코스에 테스트 쓰기는 하지 않았다.
- 정리: 검증용 브라우저·프런트·백엔드·PostgreSQL 종료. 로그는 `/var/folders/ns/8yh7k1zn3q9flcsx0msyzfhm0000gn/T/pongdang-course-favorites-v56g4akf/`의 `verification.log`, `home-verification.log`, `home-backend-verification.log`.
- 관련: `frontend/src/CourseFavoriteButton.tsx`, `courseFavorite.css`, `MapDesktop.tsx`, `MapPage.tsx`, `HomeDesktop.tsx`, `HomePage.tsx`, `useFavoriteCourse.ts`, `useCourseRouteOptimization.ts`, `travelApi.ts`, 관련 목록 CSS·번역, `backend/app/travel/{api,models,storage}.py`, `backend/tests/test_travel_integration.py`, `docs/travel-frontend-contract.md`.
- 브랜치: 기존 `fix/finale` 유지. 기존 `docs/ai/CURRENT.md` 사용자 변경과 미추적 파일 보존. 커밋·푸시·운영 배포·dev ref 변경 없음. 요청 범위 완료.
