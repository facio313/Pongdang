# report.md 선별 결함 수정 · 최종 검증 완료

- 요청 범위: report.md 전체 66개가 아니라 사용자가 지정한 5개 단위의 29개 항목. 각 단위 구현·검증·보고 후 다음 단위로 진행했고, 후속 컴퓨터 유즈에서 발견한 R04·R05 경로까지 보완했다.
- 제약: AGENTS.md 우선. 합성 결측/점수, 장소 병합, 웹캠 범위·캐시 변경, 새 계정·프로필·경로 엔진 없음. 점수 계산식·DB 스키마 변경 없음.
- 브랜치: `feature/connect-cursor`. 사용자의 후속 요청으로 아래 변경의 커밋이 승인됐다. 푸시·운영 배포·운영 설정 변경은 하지 않는다. 처음부터 있던 사용자 파일 `report.md`, `.byeori/`는 수정·커밋 대상에서 제외한다.

## 실제 데이터 검증에서 발견한 결함과 최종 수정

이전 자동 검증 후 로컬 실제 데이터에서 아래 두 실패가 재현되어 전체 완료 판정을 정정했다. 후속 구현과 재검증을 마쳤다.

1. **R04 빈 region의 초안 추가 422:** `place.region ?? undefined`가 빈 문자열을 그대로 전달해 TravelRequest의 최소 길이 검증에 실패했다. 빈/공백 지역은 기존 선택적 필드를 생략한다. 백엔드 검증을 완화하거나 가짜 지역을 채우지 않았다.
2. **R04·R05 실제 해수욕장 저장/초안 404:** 송정해수욕장(ID 584)은 `collection_station`의 실제 KHOA 해변 자료로 등록돼 있고 `collection_place` 관광 기록은 없다. 명시한 장소 ID를 조회하는 Catalog.places와 signals의 대상 확인에서 기존 물놀이 장소 종류의 실제 station 기록도 인정한다. provider·source_id·수집 시각·제공된 유효기간·미확인 메타데이터를 보존한다. 부표와 없는 ID는 계속 거부하며 추천 검색 범위는 바꾸지 않았다. 장소/카탈로그 레코드를 새로 만들거나 이름으로 합치지 않는다.
3. **상세 피드백:** 즐겨찾기만 저장했을 때는 코스 초안 링크를 표시하지 않는다. 실제 초안 추가 또는 이미 초안에 포함된 경우에만 해당 링크가 나타난다.

백엔드 회귀 검사는 관광 카탈로그가 없는 해변·계곡, 빈 지역, 실제 출처 보존, 부표/없는 ID 거부, collection_place·conditions_conditionscore 행 수 불변을 확인한다. 브라우저 테스트 서버의 격리 fixture에도 같은 계약을 추가했고, 모바일·데스크톱이 실제 테스트 API로 초안/즐겨찾기를 처리하도록 검증한다. 테스트 fixture는 별도 pongdang_test에서만 사용한다.

## 컴퓨터 유즈 직접 확인

로컬 Vite(127.0.0.1:5173/pongdang/)와 FastAPI(127.0.0.1:8000)를 실행하고 Codex in-app browser에서 클릭·새로고침·날짜 변경·스크롤했다. 390×844, 1079×900, 1440×1000에서 확인했다. 원본 로컬 `pongdang`은 읽기 전용 pg_dump로 복사했으며, 브라우저 서버의 모든 저장은 별도 클러스터(51906)의 `pongdang_test`만 사용했다. 이 복사본에 합성 수집 자료를 보충하지 않았다.

- **최종 R04·R05 재검증:** 송정해수욕장(584) 즐겨찾기 POST 201, 새로고침 후 `aria-pressed=true` 유지. 모바일·데스크톱 초안 POST 200, 코스 지도에서 동일 장소 1곳 확인. 내 코스 저장 POST 201 후 내 코스 목록 재조회에도 송정해수욕장이 표시된다. 빈 region의 관광 카탈로그 장소 송정해변(14)도 초안 POST 200과 동일 장소 표시를 확인했다.
- 없는 ID(999999999999999): 모바일·데스크톱 상세가 「장소를 찾지 못했습니다」로 끝나고 추가/저장 버튼이 없다. 데스크톱 지도는 목록 조회 완료 후에도 다른 지점을 선택하지 않는다.
- 상세→지도: `spot_id=584` 유지, 모바일·데스크톱 선택 장소 모두 송정해수욕장.
- 내 코스 조회 실패: 테스트 백엔드를 잠시 중단했을 때 모바일·데스크톱 모두 개수 미확인/조회 실패이고 0개로 표시하지 않는다. 이후 서버를 재시작했다.
- 데스크톱 후보: 실제 해변 5곳 응답, 진행 중 취소 후 대기 해제, 연속 클릭 후 결과 복귀. 코스 저장 201, 새 후보 요청 즉시 이전 저장 성공 문구 제거. 저장 코스→추천→지도는 기존 경로 입력으로 연결된다.
- 오늘: 장소 baseline 수온 23.64°C·파고 0.8m와 활동 입력 분리. 래프팅·온천은 숫자 대신 근거 부족/숫자 추천 보류. 9/25 예보 80.2점 옆에 부분 점수·근거 2/4(50%). 물때는 9/21 KST 날짜를 명시한다. 값은 검증 시점의 자료이며 고정값으로 구현하지 않았다.
- 예보 목록: 9/25의 200 빈 결과와 기존 점수 근거를 별개로 표시한다. 테스트 백엔드 중단 후 9/21 선택은 예보 목록 조회 실패로 표시한다.
- 모바일 도움말/하단 탭: 390px에서 도움말을 펼쳐도 CTA가 한 글자씩 줄바꿈되지 않는다. 390px 홈·1079px 오늘의 마지막 문장이 고정 탭 위에서 끝까지 보인다.
- 첫 입수: 해변 선택지, 카페 검색 0건/저장 비활성화 확인. 구독 저장은 기존 로컬 SSO 미설정으로 503이며, 실제 브라우저 저장 성공으로 보고하지 않는다. 인증된 구독 저장·비대상 거부는 격리 자동 테스트로 검증했다.
- 취향: 실제 `PUT travel/preferences` 200과 코스 화면 이동 확인.

## 로컬과 운영의 구분

- 빈 region 422와 실제 해변 404는 로컬이라는 이유만으로 발생하는 문제가 아니라 코드/API 대상 계약의 불일치였다. 수정 코드와 로컬 실제 데이터 복사본에서 해소를 확인했다. 운영에서 같은 데이터로 재현/해소됐다고 주장하지 않는다.
- 구독의 로컬 SSO 미설정, 의도적으로 중단한 서버의 조회 실패, 운영 SSO 세션·Origin은 각각 별개다. 공개 읽기 성공을 개인 API 성공으로 간주하지 않는다.
- 유료 AI 대화, 실제 외부 경로 계산, 운영 로그인·Origin은 실행·검증하지 않았다. 대화/후보 동시 요청과 인증·출처 오류 UI는 자동 회귀 테스트 범위다.
- 사용자 확인용 로컬 서버 5173/8000과 실제 데이터 테스트 복사본 51906은 실행 상태로 남긴다. 원본 DB·운영·키·.env·SSO 설정은 바꾸지 않았다. 뷰포트 임시 설정을 원복했다.
- 자동 테스트는 별도 51907의 `pongdang_test`에서 수행해 브라우저 확인용 실제 데이터 복사본을 보존했다. 자동 테스트 클러스터는 검증 후 종료한다.

## 구현 결과


1. **R04/R05/R09/R13/R14**: 상세의 선택 장소를 기존 `travel/plans/draft`에 추가하고 초안임을 표시한다. 모바일 상세 저장은 `travel/signals`를 조회·저장하며 실패를 성공으로 남기지 않는다. 상세→지도에 `spot_id`를 전달하고, 명시한 장소가 없거나 조회 실패하면 다른 해변을 선택하지 않는다. 빈 조회도 완료로 처리하고 없는 장소의 액션을 숨긴다. 데스크톱 상세도 같은 추가·조회 종료·이동 흐름을 사용한다.
2. **R25–R30/R31**: 공통 SSO/403/Origin 오류 설명과 SSO 리다이렉트 응답 처리를 정리했다. 공개 읽기 성공과 개인 API 성공을 구분한다. 내 코스 조회 중·실패는 0개/빈 목록으로 표시하지 않는다. `auth.py`의 기존 정책은 유지했다. 운영 세션/Origin 원인은 확인하지 않았고 설정을 바꾸지 않았다.
3. **R38/R39/R02**: 대화·후보·저장 액션 상태를 분리하고 새 후보 요청이 이전 요청을 취소·대체하게 했다. 성공/실패/취소 후 대기를 해제한다. 새 후보 의도에서 이전 저장 성공 문구를 지운다. 데스크톱 `#map?view=course`는 기존 MapScreen의 코스·경로 흐름으로 연결하며 경로 엔진이나 RouteRequestForm을 새로 만들지 않았다.
4. **R06/R07/R08/R12/R16/R51**: 서버에서 미지원/제외한 활동의 카드에 숫자 추천을 표시하지 않는다. partial은 원래 점수를 유지하며 근거 비율을 가까이 표시한다. 오늘 baseline 해양 정보와 활동 점수 입력을 분리하고 관측/예보 출처를 구분한다. 물때에 KST 날짜를 표시한다. 예보의 실패와 성공한 빈 결과를 구분하며 선택 날짜 구간을 조회한다. 최대 100행 제한은 유지하고, 점수 근거 유무를 원자료 첫 목록의 존재 여부로 단정하지 않는다.
5. **R17/R19/R20/R24/R22/R37/R60/R56**: 도움말을 별도 줄에 배치해 CTA 글자 줄바꿈을 방지하고, 1080px 미만의 하단 고정 탭 높이만큼 본문 슬롯을 확보했다. 오늘 후보 수, 사진/점수 연동 상태, 자료 상태 칩, 실제 취향 저장 동작에 맞춰 문구를 정리했다. 첫 입수 목록은 기존 물놀이 장소 API를 사용하며 서버도 해변/계곡 분류만 저장·변경을 허용한다. 장소 이름으로 레코드를 삭제·병합하지 않는다.

## 최종 검증 명령과 결과

Node.js 24.21.0 / Python 3.14 / PostgreSQL 18. DB 쓰기를 동반한 모든 검증은 독립 클러스터의 pongdang_test만 사용했다.

| 위치 | 명령 | 결과 |
| --- | --- | --- |
| frontend | `npm run lint` | 통과 |
| frontend | `npm test` | 106 passed |
| frontend | `npm run build` | TypeScript·Vite 통과 |
| frontend | `npm run test:browser` | 101 passed (1.5분) |
| backend | `uv run ruff check .` | 통과 |
| backend | `uv run ruff format --check .` | 174 files already formatted |
| backend | `uv run pytest -q` | 1,160 passed, 2 skipped, 2 warnings (69.49초) |

- skipped 2개는 Docker CLI가 없어 실행하지 못한 Compose 설정 검사다. DB 검사는 미실행으로 남지 않았다. 기존 FastAPI/Starlette deprecation 경고 2개가 있다.
- 중간 브라우저 검사에서 새 데스크톱 테스트의 범용 status 선택자가 로딩 스켈레톤과 충돌했다. 실제 완료 메시지 요소로 선택자를 한정했고, 기대 동작·성공 응답·장소 ID 단언은 유지했다. 최종 전체 101개가 통과했다.
- 앞선 99개 검사에서 발견했던 지도 선택 전 근거 패널 회귀도 최종 전체 검사에 포함해 통과했다. 테스트 삭제·완화로 해결하지 않았다.
- 최종 자동 검증 로그: `/tmp/pongdang-report-followup-{lint,frontend-tests,build,backend-tests,browser}.log`.
- 실제 데이터 서버 로그: `/tmp/pongdang-cua-backend.log`, `/tmp/pongdang-cua-frontend.log`. 임시 환경 경로 포인터: `/tmp/pongdang-report-test-path`, `/tmp/pongdang-report-regression-path`. 설정/비밀 내용은 문서에 복사하지 않는다.

## 제외 항목 유지


R01, R03, R10/R11/R41, R15, R18, R32, R35, R46, R47, R50, R53, R55, R58, R59, R63, R64/R66, R65는 구현하지 않았다. R25–R30은 기능별 인증 6개로 나누지 않고 공통 경로만 다뤘다. 웹캠은 분류별 첫 25개 페이지·10분 캐시·추가 페이지 금지를 유지한다. 0행 점수/편의시설/표를 채우지 않고, 갯벌을 오늘 동해안 후보에 억지로 추가하지 않았다.

## 변경 파일

- [backend/app/notifications/service.py](/Users/cksmacbook/Desktop/Develop/Project/Pongdang/backend/app/notifications/service.py)
- [backend/app/travel/api.py](/Users/cksmacbook/Desktop/Develop/Project/Pongdang/backend/app/travel/api.py)
- [backend/app/travel/catalog.py](/Users/cksmacbook/Desktop/Develop/Project/Pongdang/backend/app/travel/catalog.py)
- [backend/app/travel/models.py](/Users/cksmacbook/Desktop/Develop/Project/Pongdang/backend/app/travel/models.py)
- [backend/app/travel/storage.py](/Users/cksmacbook/Desktop/Develop/Project/Pongdang/backend/app/travel/storage.py)
- [backend/tests/browser_contract_server.py](/Users/cksmacbook/Desktop/Develop/Project/Pongdang/backend/tests/browser_contract_server.py)
- [backend/tests/test_notifications_integration.py](/Users/cksmacbook/Desktop/Develop/Project/Pongdang/backend/tests/test_notifications_integration.py)
- [backend/tests/test_travel_integration.py](/Users/cksmacbook/Desktop/Develop/Project/Pongdang/backend/tests/test_travel_integration.py)
- [docs/ai/CURRENT.md](/Users/cksmacbook/Desktop/Develop/Project/Pongdang/docs/ai/CURRENT.md)
- [docs/ai/REPORT-FIXES-2026-09-20.md](/Users/cksmacbook/Desktop/Develop/Project/Pongdang/docs/ai/REPORT-FIXES-2026-09-20.md)
- [frontend/src/CoursesDesktop.tsx](/Users/cksmacbook/Desktop/Develop/Project/Pongdang/frontend/src/CoursesDesktop.tsx)
- [frontend/src/HomeDesktop.tsx](/Users/cksmacbook/Desktop/Develop/Project/Pongdang/frontend/src/HomeDesktop.tsx)
- [frontend/src/HomePage.tsx](/Users/cksmacbook/Desktop/Develop/Project/Pongdang/frontend/src/HomePage.tsx)
- [frontend/src/MapDesktop.tsx](/Users/cksmacbook/Desktop/Develop/Project/Pongdang/frontend/src/MapDesktop.tsx)
- [frontend/src/MapPage.tsx](/Users/cksmacbook/Desktop/Develop/Project/Pongdang/frontend/src/MapPage.tsx)
- [frontend/src/MyCoursesPage.tsx](/Users/cksmacbook/Desktop/Develop/Project/Pongdang/frontend/src/MyCoursesPage.tsx)
- [frontend/src/NotificationSettings.tsx](/Users/cksmacbook/Desktop/Develop/Project/Pongdang/frontend/src/NotificationSettings.tsx)
- [frontend/src/RecommendDesktop.tsx](/Users/cksmacbook/Desktop/Develop/Project/Pongdang/frontend/src/RecommendDesktop.tsx)
- [frontend/src/RecommendPage.tsx](/Users/cksmacbook/Desktop/Develop/Project/Pongdang/frontend/src/RecommendPage.tsx)
- [frontend/src/SpotDetailPage.tsx](/Users/cksmacbook/Desktop/Develop/Project/Pongdang/frontend/src/SpotDetailPage.tsx)
- [frontend/src/SpotsDesktop.tsx](/Users/cksmacbook/Desktop/Develop/Project/Pongdang/frontend/src/SpotsDesktop.tsx)
- [frontend/src/TodayDesktop.tsx](/Users/cksmacbook/Desktop/Develop/Project/Pongdang/frontend/src/TodayDesktop.tsx)
- [frontend/src/TodayForecast.tsx](/Users/cksmacbook/Desktop/Develop/Project/Pongdang/frontend/src/TodayForecast.tsx)
- [frontend/src/TodayPage.tsx](/Users/cksmacbook/Desktop/Develop/Project/Pongdang/frontend/src/TodayPage.tsx)
- [frontend/src/aiApi.ts](/Users/cksmacbook/Desktop/Develop/Project/Pongdang/frontend/src/aiApi.ts)
- [frontend/src/appTabBar.css](/Users/cksmacbook/Desktop/Develop/Project/Pongdang/frontend/src/appTabBar.css)
- [frontend/src/authMessages.ts](/Users/cksmacbook/Desktop/Develop/Project/Pongdang/frontend/src/authMessages.ts)
- [frontend/src/homePage.css](/Users/cksmacbook/Desktop/Develop/Project/Pongdang/frontend/src/homePage.css)
- [frontend/src/pongdangUi.tsx](/Users/cksmacbook/Desktop/Develop/Project/Pongdang/frontend/src/pongdangUi.tsx)
- [frontend/src/productData.ts](/Users/cksmacbook/Desktop/Develop/Project/Pongdang/frontend/src/productData.ts)
- [frontend/src/recommendationText.ts](/Users/cksmacbook/Desktop/Develop/Project/Pongdang/frontend/src/recommendationText.ts)
- [frontend/src/travelApi.ts](/Users/cksmacbook/Desktop/Develop/Project/Pongdang/frontend/src/travelApi.ts)
- [frontend/src/useAction.ts](/Users/cksmacbook/Desktop/Develop/Project/Pongdang/frontend/src/useAction.ts)
- [frontend/src/useBestActivity.ts](/Users/cksmacbook/Desktop/Develop/Project/Pongdang/frontend/src/useBestActivity.ts)
- [frontend/src/usePlacesById.ts](/Users/cksmacbook/Desktop/Develop/Project/Pongdang/frontend/src/usePlacesById.ts)
- [frontend/src/useProductData.ts](/Users/cksmacbook/Desktop/Develop/Project/Pongdang/frontend/src/useProductData.ts)
- [frontend/src/useSpotActions.ts](/Users/cksmacbook/Desktop/Develop/Project/Pongdang/frontend/src/useSpotActions.ts)
- [frontend/tests/aiApi.test.mjs](/Users/cksmacbook/Desktop/Develop/Project/Pongdang/frontend/tests/aiApi.test.mjs)
- [frontend/tests/browser/copy-honesty.spec.ts](/Users/cksmacbook/Desktop/Develop/Project/Pongdang/frontend/tests/browser/copy-honesty.spec.ts)
- [frontend/tests/browser/default-place.spec.ts](/Users/cksmacbook/Desktop/Develop/Project/Pongdang/frontend/tests/browser/default-place.spec.ts)
- [frontend/tests/browser/desktop-course-navigation.spec.ts](/Users/cksmacbook/Desktop/Develop/Project/Pongdang/frontend/tests/browser/desktop-course-navigation.spec.ts)
- [frontend/tests/browser/desktop-screens.spec.ts](/Users/cksmacbook/Desktop/Develop/Project/Pongdang/frontend/tests/browser/desktop-screens.spec.ts)
- [frontend/tests/browser/forecast-honesty.spec.ts](/Users/cksmacbook/Desktop/Develop/Project/Pongdang/frontend/tests/browser/forecast-honesty.spec.ts)
- [frontend/tests/browser/loading-order.spec.ts](/Users/cksmacbook/Desktop/Develop/Project/Pongdang/frontend/tests/browser/loading-order.spec.ts)
- [frontend/tests/browser/mobile-layout.spec.ts](/Users/cksmacbook/Desktop/Develop/Project/Pongdang/frontend/tests/browser/mobile-layout.spec.ts)
- [frontend/tests/browser/notification-places.spec.ts](/Users/cksmacbook/Desktop/Develop/Project/Pongdang/frontend/tests/browser/notification-places.spec.ts)
- [frontend/tests/browser/personal-courses.spec.ts](/Users/cksmacbook/Desktop/Develop/Project/Pongdang/frontend/tests/browser/personal-courses.spec.ts)
- [frontend/tests/browser/product.spec.ts](/Users/cksmacbook/Desktop/Develop/Project/Pongdang/frontend/tests/browser/product.spec.ts)
- [frontend/tests/browser/recommend-actions.spec.ts](/Users/cksmacbook/Desktop/Develop/Project/Pongdang/frontend/tests/browser/recommend-actions.spec.ts)
- [frontend/tests/browser/spot-detail-desktop.spec.ts](/Users/cksmacbook/Desktop/Develop/Project/Pongdang/frontend/tests/browser/spot-detail-desktop.spec.ts)
- [frontend/tests/browser/spot-map-selection.spec.ts](/Users/cksmacbook/Desktop/Develop/Project/Pongdang/frontend/tests/browser/spot-map-selection.spec.ts)
- [frontend/tests/browser/spots.spec.ts](/Users/cksmacbook/Desktop/Develop/Project/Pongdang/frontend/tests/browser/spots.spec.ts)
- [frontend/tests/browser/today-desktop-honesty.spec.ts](/Users/cksmacbook/Desktop/Develop/Project/Pongdang/frontend/tests/browser/today-desktop-honesty.spec.ts)
- [frontend/tests/browser/today-honesty.spec.ts](/Users/cksmacbook/Desktop/Develop/Project/Pongdang/frontend/tests/browser/today-honesty.spec.ts)
- [frontend/tests/browser/today-sync.spec.ts](/Users/cksmacbook/Desktop/Develop/Project/Pongdang/frontend/tests/browser/today-sync.spec.ts)
- [frontend/tests/conditionScore.test.mjs](/Users/cksmacbook/Desktop/Develop/Project/Pongdang/frontend/tests/conditionScore.test.mjs)
- [frontend/tests/connectionErrors.test.mjs](/Users/cksmacbook/Desktop/Develop/Project/Pongdang/frontend/tests/connectionErrors.test.mjs)
- [frontend/tests/recommendationText.test.mjs](/Users/cksmacbook/Desktop/Develop/Project/Pongdang/frontend/tests/recommendationText.test.mjs)
