# 프론트 ↔ 백엔드 연결 점검

기준: `feature/connect` (`main`의 `6d74d88`에서 시작). 기존 `dev`의 미커밋 작업을 보존하기 위해 `Pongdang-connect` 작업 폴더에서 구현했다.

## 범위와 화면 유지

- 제품 탭 5개(홈·오늘·추천·지도·내 코스)의 표시값과 사용자 동작을 기존 FastAPI 계약과 대조했다.
- CSS, 폰트, 색상 팔레트, 아이콘 자산, 카드와 탭바 스타일을 수정하지 않았다. 예시 상수 대신 데이터와 빈 상태를 넣었다.
- 기존 틀 안에 필요한 입력·이벤트만 연결했다. 경로 슬롯에는 출발지/출발시각 입력, 기존 데이터 화면에는 앱 내 알림 구독 입력을 연결했다.
- API는 모두 배포 기본 경로 아래의 `api/data/`를 사용한다. `/pongdang/` 개발 프록시도 같은 경로로 동작한다.
- 새 계정, 클라이언트 API 키, 임의 SQL, 운영 DB 마이그레이션, 시작 시 데이터 생성은 추가하지 않았다.

## 화면별 연결표

| 화면/요소 | 기존 백엔드/동작 | 연결과 표시 규칙 |
|---|---|---|
| 홈 장소·날짜 | `GET datasets/spots` | 강릉의 실제 해변을 선택하고 KST 날짜 표시. 조회 실패 시 가상 장소로 대체하지 않음 |
| 홈/오늘 종합 점수·안전 안내 | `GET water-index/conditions` | `environment_score`, `safety_status`를 분리. 서버의 null/unknown 유지 |
| 홈 수온·파고·강수 | `GET water-index/conditions` | 유효한 단일 관측소 근거만 표시. 강수량을 확률로 표시하지 않음. 단위·대상시각·관측소 구분 |
| 홈/오늘 수질 타일 | `GET quality/comparisons` | 현재 공식 자료가 단일 출처로 명확할 때만 공식 등급 표시. 그 외 `–` |
| 홈 취향 배너 | `#recommend` | 실제 추천 단계로 이동 |
| 홈 경로 요약 | 현재 실제 경로 응답 + `#map?view=course` | 서버가 계산한 방문 순서/이동시간을 표시. 계산 전에는 장소 선택 안내 |
| 홈 라이브캠 | `POST livecams/preview` | 기존 공유 카탈로그 로더의 첫 페이지에서 최대 3개. 실제 목록으로 이동. 색상 배경은 영상으로 주장하지 않음 |
| 사이드 메뉴 저장 코스 | `#my-courses` | 개인 저장 목록 |
| 사이드 메뉴 즐겨찾기 | `GET travel/signals` | 기존 데이터 표 재사용. 본인의 favorite 기록만 표시 |
| 사이드 메뉴 알림 | `GET/POST notifications/subscriptions` | 실제 구독 조회 및 사용자가 입력한 연도·장소·선호 수온으로 앱 내 구독 저장 |
| 사이드 메뉴 데이터 출처·안내 | `#info` | 기존 데이터 정보 화면 유지 |
| 사이드 메뉴 설정 | `#recommend` | 저장된 추천 취향을 읽고 변경 가능 |
| 오늘 지점 비교/상세 | 장소 목록 + 지점별 `water-index/conditions` | 각 행의 지점 ID로 수온 조회. 선택 상세에서 주소·검증 상태·근거 표시 |
| 오늘 활동별 점수 | 활동별 `water-index/conditions` | 수영·래프팅·온천 각각 조회. 미검증 종합 점수는 null 유지 |
| 오늘 7일 예보/날짜 선택 | `GET water-forecast/forecasts` | 현재 KST 기준 7일, 첫 100개 예보의 시각·출처·값·상태 표시. 예보를 임의 일별 점수로 변환하지 않음 |
| 오늘 물때 | `GET tides/events` | 다음 간조/만조와 만조 높이를 구분. 간조·만조에서 현재 밀물/썰물이나 안전성을 추정하지 않음 |
| 오늘 물때 활동 행 | `GET tides/windows` | 갯벌·래프팅 공식 운영 시간 표시. 튜브 활동은 대응 계약이 없어 확인 필요 유지 |
| 오늘 첫 입수 | `GET notifications/subscriptions` | 해당 장소·연도의 본인 구독 기준/평가 상태. 검증되지 않은 첫 입수일·전년 차이를 만들지 않음 |
| 오늘 수질 신뢰도 | `GET quality/comparisons` | 공식 측정값과 비교 자료 상태. 신뢰도 수치는 백엔드 모델 미검증이므로 `–` |
| 추천 진입/태그 | `GET travel/preferences`, `GET travel/keywords` | 기존 태그·활동 카드 디자인을 유지. 저장 취향과 서버 키워드 정의를 읽고 활동 코드를 전달. 파도 적은 곳은 보이는 설명과 함께 서버의 small_waves 선호 범위에 연결 |
| 추천 카드 좋아요/패스 | `POST travel/signals` | 사용자 선택을 실제 카드 신호로 저장. 중복 제출 차단 |
| 취향 확정 | `PUT travel/preferences` | 최신 revision을 확인하고 태그/좋아요 반영. 명시적 확정 이후 저장 |
| 대화 3단계 | `POST ai/chat` + travel request | 동행·활동·이동 답변 전달, 실제 응답과 fallback 유지. 직접 답변은 과거 취향보다 우선 |
| 추천 후보/날짜 선택 | `POST travel/recommendations` | 실제 ID·이름·활동·이유·미확인 조건과 서명된 선택 토큰 사용. 날짜 변경 시 새 요청 |
| 추천 코스 저장 | `POST travel/plans` | 실제 장소/날짜/토큰 저장. 실패 시 성공 표시 금지. 저장 ID를 URL에 유지 |
| 대안 조회/적용 | 새 추천 + `PUT travel/plans/{id}` | 조회는 저장 코스를 바꾸지 않음. 적용 클릭 시 expected_revision으로 수정 |
| 지도 검색/핀/선택 | 장소 조회 + `water-index/conditions`, 기존 Kakao SDK | 등록 좌표만 사용. 검색 페이지 밖의 저장 코스 장소도 ID 필터로 제한 조회 |
| 지도 길찾기 | 공식 Kakao 지도 목적지 링크 | 실제 이름·좌표를 전달. 좌표 없으면 활성 링크 없음 |
| 지도 코스 담기 | `POST travel/plans/draft` | 저장 전 초안으로 실제 장소 추가. 선택 코스는 탭 사이에 메모리로 공유 |
| 지도 즐겨찾기 | `POST travel/signals` | 명시적 클릭으로 favorite 기록 저장 후 개인 목록 이동 |
| 지도 경로 계산 | `POST travel/recommendations` → `POST travel/routes/recommend` | 출발지·KST 출발시각·후보 선택을 전달. 별도 계산 버튼을 누른 후 요청 |
| 지도 도로 선/시간 | `route.legs[].geometry.polyline`, 예상시간 | 경도/위도 순서를 SDK에 맞게 전달. 비어 있거나 잘못된 선을 직선으로 채우지 않음 |
| 지도 저장 | `POST travel/plans` | 장소·순서 저장. 저장 API가 정밀 ETA를 보존하지 않는 사실 표시 |
| 내 코스 목록/상세 | `GET travel/plans`, `GET travel/plans/{id}` | 실제 개인 목록, 선택한 plan_id 상세, 새로고침 복원 |
| 내 코스 알림 상태 | `GET travel/sessions` | 실제 active 동행 세션의 enabled 상태. 백그라운드 발송으로 표시하지 않음 |
| 내 코스 요약 복사 | Clipboard API | 클릭한 코스의 실제 이름·장소·날짜만 복사. 공개 공유 링크로 주장하지 않음 |
| 지난 코스 기록 링크 | `GET travel/signals` | 기존 데이터 표에서 본인의 visit/review 기록만 조회 |
| 데이터/정보/AI/웹캠 별도 화면 | 기존 읽기/API 경로 | 기존 연동 유지. 새 개인 항목도 같은 표를 재사용 |

## 계약상 값이 없는 항목과 기존 디자인 슬롯

- 종합 환경·안전 점수, 검증된 수질 신뢰도, 연속 관측으로 입증된 첫 입수일/전년 비교는 백엔드가 제공하지 않는다. 화면에서 임의 계산하지 않는다.
- 튜브 물놀이는 기존 활동 계약에 없다. 수영 지원 근거를 튜브 허용으로 확대하지 않는다.
- 홈의 애니메이션/시간대별 그래프, 활동 사진, 편의시설 필터, 이미지 공유 카드는 기존 디자인용 슬롯이다. 새 시각 디자인이나 검증되지 않은 시설 정보를 만들지 않았다. 경로·지난 기록처럼 기존 기능에 대응하는 슬롯/링크는 실제 동작에 연결했다.
- 카카오 JavaScript 지도 키, 서버 경로 키, Windy 키와 기존 SSO 설정의 실제 운영 가용성은 서버 설정에 달린다. 미설정/오류는 그대로 표시한다. 테스트용 응답을 운영 화면에 주입하지 않는다.
- 내 코스/즐겨찾기/기록은 첫 100건, 개별 저장 코스의 장소 보충 조회는 최대 20개 ID, 추천 경로 후보는 최대 5곳으로 제한한다.

## 검증

- Node 24에서 frontend lint, 단위/기존 화면 테스트 43개, `/pongdang/` production build.
- backend Ruff lint/format, 기존 전체 테스트 928개. PostgreSQL 18의 별도 로컬 `pongdang_test`만 사용했다.
- `npm run test:browser` (8개 흐름): 실제 FastAPI와 별도 테스트 DB를 통해 표시·취향 저장·추천·코스 저장 실패/재시도·새로고침 복원·명시적 경로 요청·대화 답변·즐겨찾기·알림 저장·지점 변경·대안 적용을 검증한다.
- 브라우저 fixture는 `backend/tests/browser_contract_server.py`에만 있다. `PONGDANG_BROWSER_TEST=1`, DB 이름 `pongdang_test`, loopback 호스트가 아니면 실행을 거부한다. 앱 코드에서 import하거나 시작 시 실행하지 않는다.
- 실제 AI/길찾기/Windy 유료 호출 성공을 테스트 결과로 주장하지 않는다. 브라우저 테스트의 AI는 서버의 기존 비활성 fallback, 길찾기는 외부 어댑터만 테스트 대체물이다.
- CI backend job의 기존 disposable DB에서 브라우저 회귀검사도 실행하도록 연결했다. 로컬 통과와 원격 CI 실행/배포는 별개다.

### 브라우저 회귀검사 실행

별도로 만든 폐기 가능한 PostgreSQL에 `pongdang_test` DB가 있어야 한다. 다른 작업과 같은 DB에서 동시에 실행하지 않는다. 테스트 서버는 이 DB의 `pongdang_data` 스키마를 재구성한다.

```sh
cd frontend
npm ci
npx playwright install chromium
POSTGRES_HOST=127.0.0.1 POSTGRES_PORT=55439 POSTGRES_DB=pongdang_test POSTGRES_USER=YOUR_TEST_USER POSTGRES_PASSWORD=YOUR_TEST_PASSWORD npm run test:browser
```

운영 `.env`를 복사할 필요가 없으며, 인증/외부 제공자 키는 브라우저에 전달하지 않는다.
