# 그룹 B 백엔드 구현 및 검증 기록

프런트 키워드·경로 분리 후속 조정의 최신 계약과 검증 결과는
[추천 프런트 연동 계약](travel-frontend-contract.md)을 참고한다.
아래 기록은 첫 그룹 B 구현 시점의 검증이다.

## 범위와 결론

2026-09-15 최신 목표 파일의 **백엔드 기능까지만** 지시를 적용했다.
B1→B3/B5→B2→B4 흐름을 인증 API와 기존 chat 응답 계약으로 연결했다.
새 프런트 화면은 만들지 않았다. API/모델/정책과 연결 방법은
[그룹 B 여행 백엔드](group-b-backend.md)가 기준이다.

기존 미커밋 AI 연결·SSO·비용 제한과 동시 진행 중인 웹캠 작업을 보존했다.
개인 API는 정상 SSO 주체가 필요하며 기존 로컬 operator AI 모드의 권한을 확대하지 않았다.
운영 DB에는 읽기 전용으로 접근했다. 마이그레이션·테스트 데이터 저장은 별도의
PostgreSQL 18 `127.0.0.1:56438/pongdang_test`에서만 수행했다.

## 요구사항별 구현과 증거

| 요구사항 | 구현 및 검증 |
|---|---|
| 공통 계약 | `app/travel/models.py`의 TravelPreference, TravelRequest, Recommendation, TripPlan, TripSession, CompanionEvent. 희망·등록 속성·관측/예보·취향 일치 필드 분리 |
| 개인 자료 저장 | `storage.py`, `migrations.py`: 소유자 조건, profile/plan/session revision, 기록 삭제/초기화, 소유자 복합 FK. 실제 DB 소유권·충돌·초기화 테스트 통과 |
| B1 첫 방문/입력 | 빈 프로필 추천, 태그 편집, 카드 like/dislike/skip/DELETE undo, 찜 멱등 생성, 확인 방문, 방향 있는 리뷰, learning off/default. 순위 변경과 부정 경험 비학습 검증 |
| B1 추천 정책 | `explicit-preference.v1`, 필수 조건 후 가중치 합 정렬. 350곳 fixture에서 300곳 검색 상한 확인. 관측소 제외, 얕은 물 등 미확인 필수 조건 제외, 공식 통제 우선 검증 |
| B3 같은 요청 상태 | 기존 chat에 `travel.request`, preference, selection_token, plan_id, session_id 추가. 폼 입력과 대화 patch가 같은 계약 사용. 기존 조건 보존/필수 조건 임의 완화 거절 |
| B3 후속 선택/수정 | 실제 추천의 두 번째 후보→초안→저장→수정→세션 연결을 SQL/API 통합 테스트. 날짜/아이 동반 변경 시 저장 일정의 새 초안 계산, 명시적 저장 전 원본 유지 |
| B3 근거 검증 | 위조 fact/spot/structured ID, 토큰 변조·다른 소유자 선택 거절. provider 응답 대체물을 사용해 실제 함수 호출/구조화 응답/최소 맥락 경로 검증 |
| B5 기분 | 확인 전 제안은 미적용, 확인 후 이번 여행만 적용, 별도 API로 장기 반영. 지침에서 수영/서핑/래프팅 의도를 모델이 만들면 서버가 거절 |
| 다국어/응답 | ko/en/ja/zh-CN/zh-TW 서버 문구, 해당 언어 DB 이름 유지, 이유·조회시각·미확인 조건 표시. 없는 번체 자료를 다른 언어로 대체하지 않음 |
| B2 일정 | 일별 항목/체류/구간/귀가, 요청 시각·예산·공식 운영 제한·식당/숙박 역할 검증. 고정 항목 해제 조작, 순서/삭제/대체/체류 변경, 저장 revision 충돌 처리 |
| B2 미설정 | 미설정 경로의 ETA/귀가/총비용 null, 예산 unknown. 체류만으로 증명되는 겹침/귀가 불가능은 conflict. 검증된 RouteQuote 대체 어댑터로 구간+체류+귀가 계산 테스트 |
| B4 동행 | 명시적 시작/종료, 시작 시 일정 사본 고정, 수동 현재 항목 선택, 거절된 위치 권한, 60초 cache, 90초 heartbeat, 자료 만료 표시. 갱신은 LLM을 호출하지 않음 |
| B4 이벤트 | 공식 통제, 검토된 매핑의 공식 저조, 검증된 새 관측/정정 규칙. SQL dedup, 정정 연결, 빈도 억제, 확인 처리, 종료와 갱신 경합 테스트 |
| B4 대화 | 본인 세션과 최근 5개 안내를 읽기만 함. 읽기 전후 session payload 동일, 타인 404, 종료 상태/monitoring false와 모델에서 개인 ID 제외 검증 |
| 실패/프라이버시 | AI disabled에서도 추천·계산·저장·조회·세션 동작. query_failed를 no_data로 바꾸지 않음. 개인 테이블 비공개, no-store, Origin, SSO, 정확 위치/원문/토큰 최소화 검증 |
| 마이그레이션 | 명시적 additive v7→v8 여행 테이블 5개. 기존 실제 collection 행 보존 테스트. 동시 웹캠 작업의 후속 v9 체인 유지 |

테스트의 가상 장소·관측은 오직 disposable DB 또는 메모리 fixture에 있다.
운영 startup/API에 seed·합성 결과·collector 실행을 추가하지 않았다.

## 실행한 검사

### Backend

Python 3.14, PostgreSQL 18, lockfile의 환경에서 실행했다.

```sh
cd backend
uv run --frozen ruff check .
POSTGRES_HOST=127.0.0.1 POSTGRES_PORT=56438 \
POSTGRES_DB=pongdang_test POSTGRES_USER=pongdang \
POSTGRES_PASSWORD=isolated-test uv run --frozen pytest -q
```

- Ruff 전체: **통과**.
- 그룹 B 단독: **37 passed**, 5.94초.
- 전체 백엔드: **1,138 passed**, 44.68초. 기존 AI·자료 조회 및 현재 웹캠 작업을 포함한 전체 suite다.
- 경고 2개: 기존 Starlette/httpx 및 AnyIO BlockingPortal deprecation.
- `git diff --check`: 통과.

처음 전체 회귀 실행에서 기존 chat body 제한 2개 테스트가 실패하여
일반 요청 20KB / travel 요청 64KB 경계를 수정했다. 동행 읽기 테스트의
UTC `Z`/`+00:00` 문자열 비교도 동일 시각 비교로 수정했다. 이후 관련 테스트는 통과했다.

### Frontend

그룹 B는 프런트를 변경하지 않았지만 요청된 회귀 검사는 실행했다.

```sh
cd frontend
npx --yes --package=node@24 --package=npm@11 \
  -c 'node --version && npm run lint && npm test && npm run build'
```

- Node **24.21.0**.
- lint: **통과**.
- tests: **31 passed**, 0 failed.
- build: **실패** — TypeScript 단계, Vite 빌드는 실행되지 않음.
- 기존 미추적 `src/activityAssessmentApi 2.ts:1`의 `./api.ts`,
  `src/ActivityAssessmentPanel 2.tsx:4,8`의 `./activityAssessmentApi` 모듈을 찾지 못한다.
  같은 패널에 암시적 any 오류가 이어진다.
- 기존/다른 작업 파일 보존 지시에 따라 해당 중복 파일을 삭제하거나 tsconfig로 숨기지 않았다.
  그러므로 전체 프런트 빌드와 화면 배포가 완료됐다고 보고하지 않는다.

## 실제 로컬 DB 읽기 확인

2026-09-15 읽기 전용 확인 당시 한국어 TourAPI 500행, Kakao 75행,
영어/일본어/중국어 간체 TourAPI 각 48행이 있었다. 수집에 따라 이후 개수는 달라질 수 있다.
최종 역할 필터(`place_role=visit`)로 읽은 후보 수는 다음과 같다.

| 요청 언어 | 필터 일치/조회 후보 | 확인한 실제 첫 장소명 |
|---|---:|---|
| ko | 57 | 경포해수욕장 |
| en | 42 | Gangneung Gyeongpo Beach (강릉 경포해수욕장) |
| ja | 42 | 江陵 鏡浦海水浴場（강릉 경포해수욕장） |
| zh-CN | 39 | 江陵镜浦海水浴场강릉 경포해수욕장 |
| zh-TW | 0 | 없음 |

이는 현지 전체 여행지 수나 취향 순위가 아니다. 동일 장소의 언어 간 매핑이 없으므로
좌표/이름 유사성으로 번역 자료를 합치지 않는다. 해당 언어의 분류가 세부 해변/온천
속성을 증명하지 않으면 태그가 비어 있을 수 있다.

Kakao `beach_search_result`에 카페/주차장이 섞이는 것을 실제 자료에서 확인하여
검색어 적중을 해변 사실로 쓰지 않도록 수정했다. 실제 업종으로 여행지/음식점/숙박을
구분하며 이 회귀를 테스트했다. 경포의 조건 읽기는 partial/no_forecast_data를 반환했고,
자료 부족을 좋은 현장 조건으로 해석하지 않았다.

## 외부 연결과 미실행 검증

다음은 구현 완료한 실서비스 연결로 보고하지 않는다.

- 실제 경로 API·교통요금·장소 실가격: 기본 어댑터 unconfigured, ETA/가격 null.
  계산 테스트의 RouteQuote는 검증용 대체물이며 실제 제공처 호출이 아니다.
- 혼잡·아이 적합성·수심/유속·접근성·운영시간/예약: 검토된 장소별 근거가 필요하다.
  공식 운영 자료가 있을 때의 처리만 구현했으며 전국 coverage를 보장하지 않는다.
- 일몰 도착, 파고 활동 판단, 계곡 수위 상승: 필수 근거/규칙 미연결, disabled.
- 백그라운드 실행·push 구독·전송 재시도: 미구현, background_enabled=false.
- 권한 확인 카드 이미지, 번체 관광 분류/자료, 언어 간 place crosswalk: 미설정.
- 새 그룹 B 도구의 실제 유료 OpenAI 호출, 운영 SSO ingress,
  프런트 전체 사용자 흐름, 모바일/키보드/브라우저 위치 권한: 이번 검증에서 미실행.
  기존 provider/budget 경로 회귀와 응답 대체물을 사용한 도구 계약은 검사했다.
- 운영 DB migration, commit/push, CI 우회 및 배포: 수행하지 않았다.
  운영 적용에는 기존 CI와 명시적 `app.schema --initialize` 절차가 필요하다.
