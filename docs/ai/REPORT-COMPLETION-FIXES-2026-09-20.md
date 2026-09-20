# R37 · R22 · R60 잔여 완료 기준 수정 · 2026-09-20

범위는 사용자 지정 세 항목뿐이다. 브랜치는 `feature/connect-cursor`, 기준 HEAD는 `4a20c72`이며 커밋·푸시·운영 배포를 하지 않았다. 합성 점수/결측 보충, 장소 병합, 웹캠 페이지, 계정·프로필·경로 엔진, 점수 계산식·DB 스키마·.env·SSO·키 변경 없음.

## 수정

- R37: `AppShell.tsx`의 공용 `AppActions`와 `appTabBar.css`의 공통 탭 여유 공간을 사용한다. 1080px 미만에서 탭 터치 높이·패딩·하단 안전 영역·12px 간격을 슬롯/주요 액션의 sticky 위치/문서 scroll-padding이 공유한다. 취향 STEP 1/2/3, 경로 요청 버튼, 내 코스 상세 액션에 적용했다. 문서 끝 슬롯은 마지막 문장을 끝까지 스크롤해 읽도록 유지하며 ≥1080px 탐색 레이아웃은 그대로다.
- R22: 기존 `productData.dataStatusText`의 DATA_STATUS에 네 코드의 한국어 문구를 추가했다. 데스크톱 추천 대화 근거, 모바일 추천 안내/대안, 내 코스 경로 상태가 이 경계를 사용한다. `no_data=자료 없음`, `partial=일부 자료`, `unavailable=제공 불가`, `evaluated=평가 완료`. 안전/정상으로 번역하지 않았고 #data/#info 코드 열과 R23 기술 설명은 유지했다.
- R60: 서버 키워드 카탈로그 `max_selections`로 태그·좋아요 합집합을 제한한다. STEP 2에서 선택 수와 초과 안내를 보여 주고 추가 좋아요를 막는다. 기존 선택의 중복 좋아요는 추가 개수로 세지 않는다. STEP 1과 요약에서 선택을 줄일 수 있으며, 기존 과다 저장도 STEP 1부터 안내한다. PUT 성공 뒤에만 실제 저장 안내를 표시한다.

## 실패 재현과 자동 검사

- 수정 전 `mobile-layout.spec.ts` 신규 STEP 1 회귀: 390×844, #recommend, scrollY=0에서 CTA bottom=804.921875, tabTop=780; 기대 bottom≤768 실패.
- 수정 전 `copy-honesty.spec.ts` 신규 데스크톱 근거 검사: 실제 후보 POST 200/status partial 후 근거의 `상태 일부 자료` 기대가 `상태 partial`로 실패. 칩만 검사하지 않는다.
- 수정 전 `conditionScore.test.mjs` 자료 상태 단위 검사: no_data가 `자료 상태 no_data.`로 반환되어 1 fail/9 pass. 수정 후 10/10 pass.
- 최초 위 두 브라우저 실패 로그: `/tmp/pongdang-r37-r22-r60-before.log`.
- 수정 후 레이아웃/copy/취향 선택 회귀 18개 통과: `/tmp/pongdang-r37-r22-r60-targeted.log`.
- 추가 `mobile-course-actions.spec.ts`: 390×844/1079×900에서 STEP3 PUT200 → 후보 POST200 → 경로 CTA 포인터 클릭(출발지 안내, 경로 요청 0건) → 코스 POST201 → 목록 GET200 → 내 기록/코스 상세 링크 클릭. 클릭 전에 rect와 elementFromPoint로 가림을 확인한다. 새 테스트의 화면 전환 대기와 정확한 기록 페이지 제목을 보완했고 두 뷰포트 모두 통과했다.
- `recommend-preferences.spec.ts`: 활동 한도·태그와 카드 합집합·중복·요약 삭제·기존 과다 선택 축소, 실제 PUT200/GET 저장값 재조회. 테스트에서 만든 코스는 삭제하고 기존 취향은 복구한다.
- 전체 검사 중 기존 예보 테스트의 비동기 route.fetch가 테스트 종료/응답 폐기와 경합했다. `forecast-honesty.spec.ts`, `product.spec.ts`에서 `unrouteAll({ behavior: "wait" })`로 처리 완료를 기다리도록 보완했다. 오류 무시·assert 완화·제품 예보 변경은 없다.
- 최종 전체 browser: 110 passed (1.6분), 종료 코드 0. `/tmp/pongdang-r37-r22-r60-browser-verified.log`. 최종 lint와 build도 종료 코드 0이다.

| 검사 | 결과 |
|---|---|
| frontend lint | 통과 |
| frontend unit | 106 passed |
| frontend build | TypeScript / Vite 통과 |
| frontend test:browser | 110 passed (1.6분) |
| backend Ruff check / format --check | 통과 / 174 files already formatted |
| backend pytest | 1160 passed, 2 skipped, 2 warnings (63.85초) |

Node.js 24.21.0, Python 3.14.4, PostgreSQL 18.3 UTF8. 백엔드 skip 2건은 Docker CLI 부재로 Compose 검사 미실행이고 경고 2건은 기존 FastAPI/Starlette deprecation이다. 로그 접두사 `/tmp/pongdang-r37-r22-r60-`.

## 실제 컴퓨터 유즈

Codex in-app browser에서 실제 버튼/링크/카드를 클릭했다. Vite `127.0.0.1:5173/pongdang/`, FastAPI `:8000`, 기존 실제 자료 복사본 `:51906/pongdang_test`를 사용했다. 자동 테스트 fixture 서버와 실제 화면 확인 서버를 구분한다. API 상태는 `/tmp/pongdang-cua-backend.log`의 해당 클릭 후 요청과 화면 결과로 확인했다.

| 화면 | 뷰포트·동작·실측 | 결과 |
|---|---|---|
| #recommend STEP 1 | 390×844, scrollY=0, CTA bottom=768 / tabTop=780, (195,746) 실제 포인터 클릭 | STEP 2 진입 |
| #recommend STEP 2 | 태그+좋아요 3/3 뒤 수영·래프팅 좋아요 비활성화, 패스 클릭 | 마지막 저장 전에 초과 차단 |
| #recommend STEP 3 | 390×844, scrollY=0, 저장 CTA bottom=537.42 / tabTop=780 | PUT preferences 200, POST recommendations 200, 취향 저장 안내·후보 5곳 표시 |
| #recommend 후보 | 390×844, 경로 CTA bottom=768 / tabTop=780, 실제 클릭 | 출발지 선택 안내. 외부 경로 호출은 하지 않음 |
| #recommend 마지막 저장 | 390×844, 내 코스에 저장 클릭 | POST plans 201, 저장됨 표시 |
| #my-courses 목록 | 390×844, 끝 스크롤 후 내 기록 링크 bottom=651.22 / tabTop=780, 실제 클릭 | #travel-history 이동 |
| #my-courses 상세 | 390×844, 상세 CTA bottom=462.70 / tabTop=780, 실제 클릭 | 동일 plan_id의 #recommend로 이동(내용 확인은 자동 회귀 포함) |
| #recommend 대화 근거 | 1440×1000, 이 조건으로 후보 찾기 실제 클릭 | POST recommendations 200, `근거 · 조회 23:40 KST · 상태 일부 자료 · 선택 취향 없음` |
| # 홈 마지막 문장 | 390×844 / 1079×900, 문서 끝 스크롤 | foot bottom=750.22 / 778.25, tabTop=780 / 836 |
| #today 마지막 문장 | 390×844 / 1079×900, 문서 끝 스크롤 | foot bottom=749.64 / 778.39, tabTop=780 / 836 |

검증 후 브라우저 뷰포트를 원복하고 임시 탭을 닫았다. 51907 자동 검사 DB는 정상 종료했고, 기존 5173/8000/51906 확인 환경은 유지했다.

모바일·데스크톱 홈/오늘/추천/명소/지도/내 코스 본문의 네 원본 코드 비노출을 자동 검사에 포함했고, 컴퓨터 유즈에서도 해당 화면 전환과 본문을 확인했다. 이 확인은 모든 가능한 서버 상태의 종단 검증을 의미하지 않는다.

## 기록 범위와 제외

`report.md`의 R37/R22/R60 조치 상태 행 3개만 최종 근거로 갱신했다. 수정 전 복사본과 비교해 추가·삭제 각 3행만 바뀜을 확인했다. 기존 처리 내용·원문·집계·다른 상태 행은 그대로다. 명시적 제외 20개, 범위 밖 17개, R25–R30 운영 SSO는 사용자 지정 범위 밖이므로 유지한다.
