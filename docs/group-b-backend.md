# 그룹 B 여행 백엔드

## 추천 프런트에 맞춘 후속 조정

카테고리 키워드 조합과 장소·활동 목록, 별도 경로 프롬프트의 최신 계약은
[추천 프런트 연동 계약](travel-frontend-contract.md)을 따른다.
`GET keywords`, `TravelRequest.keyword_selection/environment_preferences`,
`POST routes/recommend`, chat `travel.action`과 `travel_route` 도구를 추가했다.
첫 목록은 길찾기를 호출하지 않는다. 별도 경로 API는 카카오모빌리티 어댑터로
선택된 후보의 방문 순서를 비교한다. 아래 기존 `plans/draft` API의 미설정 경로
처리와 새 경로 추천 API의 외부 연결은 구분한다.

## 범위와 연결 상태

최신 목표 파일의 **백엔드까지만 구현** 지시를 따른다. 프런트 코드는 변경하지 않았다.
기존 `/pongdang/#ai`는 `answer` 본문을 표시한다. 새 취향 폼·비교·일정 편집·동행
화면은 아래 API와 `travel` 상태를 연결해야 한다. 새로운 화면 경로는 만들지 않았다.
`/pongdang/` base, 기존 자료 조회·자료 정보·SSO·AI provider·비용 제한은 유지한다.

B1/B3/B5는 `app.travel.recommend.recommend`를 함께 사용한다. B2는 실제 선택 장소로
초안을 계산하고, B4는 명시적으로 저장한 일정의 revision에 연결된 세션을 사용한다.
모델은 조건을 해석하고 읽기/계산 도구를 호출한다. 추천 순서, 장소 ID, 일정 항목,
시간, 비용, 이벤트는 서버가 만든 구조화 결과다. 모델의 임의 사실 문장은 반환하지 않는다.

### 동작하는 경로

1. 취향 입력: `GET/PUT preferences`, `POST signals`, `POST mood/proposal`.
2. 장소 추천: `POST recommendations`. 처음 방문한 사람은 빈 프로필로도 조회할 수 있다.
3. 비교·선택: 결과의 `selection_token`과 `rank`를 `POST compare`나 일정 초안에 사용한다.
4. 일정 생성: `POST plans/draft`. 저장은 별도의 `POST plans`다.
5. 일정 수정: `PUT plans/{id}`에 전체 편집 항목과 `expected_revision`을 보낸다.
6. 여행 시작: `POST sessions`. 갱신은 열린 앱에서 `POST sessions/{id}/refresh`로 요청한다.
7. 여행 종료: `POST sessions/{id}/end`. 이후 갱신을 거절하고 위치 선택 상태를 지운다.
8. 방문 확인·만족도·찜은 사용자가 `POST signals`로 남긴다. 종료만으로 방문이 기록되지 않는다.

## API 목록

모든 경로는 `/api/data/travel` 기준이다. 실제 배포에서는 기존 `/pongdang/` prefix를
유지한다. 모든 API는 기존 Bonifacio SSO `access-pongdang` 주체를 검증한다.
변경 요청은 기존 Origin/CSRF 경계를 적용한다. 응답은 `private, no-store`다.
사용자 ID는 요청에서 받지 않는다. 목록은 최대 100행, offset 최대 10,000이다.

| 메서드·경로 | 용도 |
|---|---|
| `GET capabilities` | 태그·카드 동작·언어별 실제 카탈로그 개수·정책·외부 연결 상태 |
| `GET preferences` | 본인 취향과 revision. 처음에는 revision 0 |
| `PUT preferences` | `{preference, expected_revision}` 저장 |
| `GET signals` | 본인의 찜·확인 방문·리뷰·카드 입력 목록 |
| `POST signals` | 명시적인 카드/찜/방문/리뷰 입력. 찜 생성은 장소별 멱등 |
| `DELETE signals/{id}` | 해당 선택 되돌리기, 찜 해제, 기록 삭제 |
| `DELETE history?reset_profile=true` | 행동 기록 삭제 및 선택적 취향 초기화 |
| `POST mood/proposal` | `{text, locale}` → 확인 전 기분 선호 제안 |
| `POST mood/profile` | 확인한 기분 선호를 별도 조작으로 장기 취향에 반영 |
| `POST recommendations` | `{request, preference?, limit?}` → 설명 가능한 추천 |
| `POST compare` | `{selection_token, ranks}` → 선택 후보 최대 3곳 재조회 |
| `POST plans/draft` | 일정 초안 계산. 저장하지 않음 |
| `POST plans` | 재검증한 초안 저장 |
| `GET plans`, `GET plans/{id}` | 본인 일정 목록·저장된 버전 조회 |
| `PUT plans/{id}` | revision 확인 후 재계산·저장 |
| `DELETE plans/{id}` | 본인 일정과 연결된 세션/이벤트 삭제 |
| `POST sessions` | `{plan_id, plan_revision, location_status, notifications}` 여행 시작 |
| `GET sessions`, `GET sessions/{id}` | 본인 여행 세션 목록·상태 |
| `POST sessions/{id}/refresh` | 현재/다음 일정, 최신 근거와 새 안내. LLM 호출 없음 |
| `PUT sessions/{id}/settings` | 이벤트 종류·간격·활성 여부 수정, revision 필수 |
| `POST sessions/{id}/end` | 종료. 반복 종료는 같은 종료 상태 반환 |
| `GET sessions/{id}/events` | 안내 기록, 만료·정정·확인 상태 |
| `POST sessions/{id}/events/{event_id}/ack` | 안내를 확인했다고 표시 |

실제 필드와 enum은 FastAPI `/api/openapi.json`과 `app.travel.models`가 기준이다.
일정/기록/세션 ID는 서버가 반환한 값을 그대로 사용한다. 장소 ID를 예시 값으로 채우지 않는다.

### 취향·기록 계약

`TravelPreference`는 태그, 선호 지역, 활동 강도, 이동 허용 시간, 동행 유형, 회피 조건,
학습 반영 선택, 수정 가능한 페르소나 이름을 가진다. `learning_enabled` 기본값은 false다.

`SignalInput.kind`는 `card`, `favorite`, `visit`, `review`다.

- 카드: `like`, `dislike`, `skip`; 선택 ID 삭제로 되돌린다. 건너뛰기는 이전 선택을 덮지 않는다.
- 찜: `favorite/like`, 실제 `spot_id`가 필요하다. 같은 장소 재요청은 같은 기록 ID를 반환한다.
- 방문: `visit/confirm`과 사용자가 확인한 `visited_on`만 허용한다. 미래 방문·클릭 방문을 거절한다.
- 리뷰: `positive`, `negative`, `neutral`을 구분한다. 1–2점 부정, 3점 중립, 4–5점 긍정이다.
- 리뷰 원문·사용자 식별자·행동 기록의 내부 ID를 모델에 보내지 않는다.
- 기록 삭제와 프로필 초기화는 독립 API로 실행한다. 초기화도 revision을 증가시킨다.

이미지 권한을 확인한 카드 자산은 현재 등록되어 있지 않다. `capabilities.images=[]`,
`image_status=licensed_card_images_unconfigured`를 반환한다. 프런트에서 카드를 만들 때
실제 장소 사진과 분위기 예시를 구분하고, 버튼·키보드 조작을 같은 signals API에 연결한다.

### 여행 요청과 기분

`TravelRequest`는 날짜(Asia/Seoul, 최대 7일), 지역, 장소 역할, 출발지, 이동 수단,
출발 가능 시각, 귀가 마감, 당일치기/숙박, 인원, 예산(total/per_person), 필수 조건,
선호·회피·활동·강도·이동 허용 범위, 기분/목적, 식사/휴식 선호, 포함/제외 장소를 보존한다.
`place_role=visit|meal|lodging|any`로 실제 등록 관광지·식당·숙박 후보를 찾는다.

기분 제안은 `confirmed=false`이며 추천에 적용하지 않는다. 사용자가 확인한 Mood를
같은 TravelRequest로 보내면 이번 여행에 적용한다. 장기 프로필 반영은
`POST mood/profile`로 별도 실행해야 한다. 스트레스·지침을 수영/서핑 의도로 바꾸거나
정신 상태를 진단하지 않는다. 확인된 기분의 희망 강도와 실제 장소 속성은 별개다.

## 추천 정책 `explicit-preference.v1`

필수 조건을 먼저 검사하고 남은 실제 장소를 가중치 합으로 정렬한다.

| 출처 | 가중치 |
|---|---:|
| 명시 프로필 태그 / 이번 여행 태그 | 각각 100 |
| 사용자가 확인한 이번 여행 기분 | 80 |
| 카드의 최근 명시 선택 | 60 |
| 선호 지역 | 40 |
| 찜 | 20 |
| 긍정 리뷰 | 10 |
| 사용자가 확인한 방문 | 5 |

행동 가중치는 학습을 켰을 때만 반영하며 장소·기록 종류별 한 번만 반영한다.
최근 리뷰가 부정이면 해당 방문을 긍정적인 선호 신호로 더하지 않는다.
명시 태그가 행동 신호보다 우선하며, 동일 점수는 stable `spot_id`로 정렬한다.
물멍은 등록 해변 분류와의 취향 연관 규칙으로 비교한다. 조용함·얕은 물·유속·아이 적합성·
영업 중·안전·Water Index의 확인된 속성으로 바꾸지 않는다.

희망 조건은 `request`/`preference`, 등록 장소 속성은 `confirmed`, 관측·예보는
`conditions`, 계산한 일치 항목은 `matched_preferences`, 미확인은
`unknown_conditions`에 분리된다. 기록 ID/출처/원본 시각/조회 시각을 보존한다.
카탈로그 생성·수정 시각을 provider 발표 시각으로 바꾸지 않는다.

후보 검색은 언어·지역·역할 조건으로 필터한 등록 장소를 ID 순서로 최대 300건,
SQL 100행씩 읽는다. 검색 일치 수, 실제 읽은 수, 상한·순서·제공처·절단 여부를
`candidate_scope`에 보존한다. 기본 결과 5곳, 최대 10곳(모델 도구는 최대 5곳)이다.
전국/지역 전체 최적 순위라고 표현하지 않는다. 부족하면 실제 후보 개수만 반환한다.
필수 조건이 미확인인 장소는 통과시키지 않고, 완화 제안은 별도 확인 대상으로 반환한다.
모델은 기존 필수 조건을 조용히 삭제할 수 없다. 사용자가 폼 상태를 바꿔야 한다.

공식 authority 제한과 공식 operating window의 폐쇄/통제를 기간·활동에 맞춰 필수로
검사한다. 조회 실패를 후보 없음으로 바꾸지 않는다. 관련 상태는 원래 근거와 함께 보존한다.

### 실제 관광 분류와 언어

카카오의 `beach_search_result`는 검색에 걸린 결과라는 뜻이다. 해변 이름이 붙은 카페나
주차장도 포함되므로 해변 속성으로 사용하지 않는다. 실제 업종 분류로 역할을 결정한다.
관광공사 관광타입은 공식 v4.4 활용 매뉴얼의 코드를 사용한다.

- [국문 관광정보](https://www.data.go.kr/data/15101578/openapi.do): 관광지·문화·행사·코스·레포츠와 음식점/숙박을 구분.
- [영문 관광정보](https://www.data.go.kr/data/15101753/openapi.do),
  [일문 관광정보](https://www.data.go.kr/data/15101760/openapi.do),
  [중문 간체 관광정보](https://www.data.go.kr/data/15101764/openapi.do): 해당 언어의 관광타입을 사용.

한국어·영어·일본어·중국어 간체·번체 응답 문구를 제공한다. 이름은 요청 언어의 DB
제공처 레코드를 그대로 사용한다. 언어별 장소를 좌표/유사 이름으로 합치지 않는다.
언어 간 place crosswalk는 미설정이다. 번체 관광 역할 코드 검증/카탈로그는 현재
확인되지 않아 기본 여행지 조회는 자료 없음으로 반환할 수 있다. `place_role=any`는
분류를 해석하지 않고 해당 언어의 등록 자료를 조회한다. 이용 가능한 개수는 capabilities에서 확인한다.

## 기존 AI 대화 확장

`POST /api/data/ai/chat`에 선택적인 `travel`을 추가했다.

- `travel.request`: 폼에서 편집하는 TravelRequest 전체 상태.
- `travel.preference`: 저장 프로필 대신 이번 입력을 쓰는 선택적 override.
- `travel.selection_token`: 직전 서버 추천 후보 순서.
- `travel.plan_id`: 재계산할 본인 저장 일정. request를 생략하면 저장 일정의 조건을 읽는다.
- `travel.session_id`: 본인 여행 세션의 마지막 갱신 상태와 최근 이벤트를 읽는다.

응답의 `travel`을 다음 대화와 폼 상태로 보존한다. `travel_results`에는
`recommendations`, `mood_proposal`, `draft_plan`, `draft_base`, `companion`, 수정 충돌이 담길 수 있다.
`draft_base.expected_revision`은 사용자가 PUT으로 저장할 때 사용한다.
조건 변경 후 추천을 다시 계산하고, 연결된 저장 일정의 날짜/동행/예산/교통 조건도
초안으로 재계산한다. 저장 상태는 명시적 API 호출 전까지 변하지 않는다.

추가 모델 도구는 `travel_recommend`, `travel_draft`, `travel_companion` 세 개다.
읽기와 계산만 수행한다. 동행 도구는 최근 이벤트 최대 5개와 마지막 갱신 상태만 읽으며,
갱신·여행 시작·종료·확인 처리·알림 전송을 실행하지 않는다. 소유권을 먼저 확인하고,
모델 입력에서는 개인 세션/이벤트/일정 항목 ID를 제외한다.
서버가 발행한 결과 전체의 `structured_id`를 최종 섹션에서 검증한다.
순서·가격·시간을 모델이 추가하거나 위조 fact/spot/structured ID를 반환하면 거절한다.
`두 번째 장소`는 소유자·여행 조건·후보 순서에 결합된 HMAC 토큰의 2번을 선택한다.
토큰은 30분 후 만료하며, 현재 장소와 제한 근거는 다시 읽는다.

기존 Responses transport, 모델, admission, daily budget, usage, timeout, strict JSON
계약을 사용한다. 모델에 정확한 출발 좌표·SSO 주체·선택 토큰·저장 일정 ID·개인 원문을
추가 전달하지 않는다. 예전 대화의 근거를 현재 근거로 재사용하지 않는다.
일반 대화는 기존 16KB 입력/20KB body 제한, travel 상태가 있는 요청은 64KB body
제한을 적용한다. 모델에 보내는 body는 기존 `ai_max_input_bytes` 한도를 그대로 적용한다.

AI 장애 시 제한된 한국어 후속 패턴과 명시적인 travel 상태는 결정론적으로 처리한다.
일반 자연어 추출 전체를 오프라인에서 지원한다고 주장하지 않는다. 독립 취향·추천·저장
일정·세션 API는 AI 설정/호출과 독립적이다. 로컬 operator 전용 AI 모드는 기존 권한
범위를 유지한다. 개인 여행 API에는 정상 SSO 주체가 필요하다.

## 일정 계산과 저장

`PlanInput`은 TravelRequest와 `stops` 전체 편집 상태다. 각 항목은 `item_id`, 실제
`spot_id`, 날짜, 체류시간, 고정 여부, 희망 도착시각, 역할(visit/meal/rest/lodging),
선택적인 사용자 입력 비용·예약 확인 상태를 가진다.

- 모든 장소를 collection_place에서 재조회한다. 식당/숙박 역할은 등록 분류를 확인한다.
- 구간마다 이동 수단·소요시간·경로 근거를 보존하고, 마지막 귀가 구간까지 계산한다.
- 경로 어댑터의 출발/도착/수단/출발시각/자료 유효성이 일치해야 시간 계산에 사용한다.
- 기본 경로 제공처는 **unconfigured**다. 직선거리로 운전시간을 만들지 않는다.
- 이동시간이 없으면 정밀 도착·출발·귀가 시각은 null이다. 사용자가 고정한 희망 시각은
  별도 필드로 보존하며 확정된 도착시각으로 표시하지 않는다.
- 알려진 체류시간만으로도 겹침/귀가 불가능을 증명할 수 있으면 충돌을 반환한다.
- 알려진 비용 합이 예산을 넘으면 exceeded다. 일부 비용과 기타 비용이 미확인이면
  total은 null, budget_status는 unknown이다. 사용자 입력/추정 비용의 출처도 구분한다.
- 공식 폐쇄/통제는 일정 충돌로 반환한다. 검증된 경로 시각과 공식 운영 구간이 모두
  있으면 해당 구간 안에 들어오는지 확인한다. 예약 필요 여부 미확인은 남긴다.
- 날짜별 일정과 숙박 선택 상태를 구분한다. 예약 실행은 하지 않는다. user_confirmed는
  사용자의 예약 확인 진술이며 공급자 예약 완료를 증명하지 않는다.
- 전체 항목 배열로 순서·삭제·대체·체류시간을 바꾼다. 고정 항목 변경은
  `unlock_item_ids`로 명시해야 한다. 기대 revision이 다르면 409다.

## 여행 동행

세션은 시작 시 선택한 일정의 revision과 사본에 연결된다. 이후 일정 편집은 세션의
기존 계획을 몰래 바꾸지 않는다. 연결 상태는 90초 heartbeat, 읽기 캐시는 60초다.
현재 자료가 없거나 만료됐으면 monitoring은 false다. background_enabled는 항상 false다.

정확한 위치 좌표나 이동 이력을 받지 않는다. `location_status=denied`여도 현재 장소를
수동 선택할 수 있다. 동일 장소를 여러 번 방문하는 일정은 `current_item_id`로 항목을
구분한다. 프런트는 위치 권한 안내/요청과 화면 닫기/여행 종료 시 추적 중지를 구현해야 한다.
서버는 foreground=false 또는 heartbeat 만료 시 연결 끊김을 표시하고, 종료 후 갱신을 거절한다.

동작 규칙은 다음과 같다.

- `official_restriction`: 적용 장소·활동·현재 기간과 유효한 공식 통제 근거.
- `low_tide`: 공식 KHOA 고저조 예보, 검토된 장소 대표 매핑, 유효 자료,
  현재부터 30분 이내 저조 대상 시각이 모두 필요하다.
- `data_updated`: 대표 매핑·시각·단위·결측·상태를 확인한 새 관측.
- `data_corrected`: 같은 제공처/원본 관측 식별자/지표/관측시각의 후속 snapshot.

세션별 event key 유일 제약과 row lock으로 중복 알림을 막는다. 원본 정정은 이전
이벤트를 superseded로 표시하고 corrects_event_id로 연결한다. 간격 제한으로 억제된
이벤트는 안내 기록에는 남지만 나중에 재전송하지 않는다. 새 알림은 refresh의
`new_notifications`이며, 이는 열린 앱으로의 한 번 반환이다. 백그라운드 전송 보장은 없다.

현재 켜지지 않은 규칙은 `sunset_arrival`, `wave_activity`, `rising_valley_level`이다.
각각 경로 ETA+해당 날짜/좌표 일몰, 검증된 활동 판단 기준, 연속 수위/대표성/단위와
검증된 변화 규칙이 필요하다. 단일 수치를 안전/위험으로 바꾸거나 대체 활동의 안전을 보장하지 않는다.

## 스키마와 배포

`app.travel.migrations.migrate_travel`은 v7→v8에서 `travel_preference`, `travel_signal`,
`travel_plan`, `travel_session`, `travel_event`를 additively 만든다. 개인 테이블은
공개 data_catalog에 추가하지 않았다. 세션/이벤트는 소유자가 일치하는 FK를 가진다.

이번 배포에는 여행 테이블의 v8 migration을 포함한다. 별도 작업 폴더에 있는
미커밋 웹캠 수집용 v9 변경은 이번 여행 백엔드 커밋에 포함하지 않는다.
운영 적용은 기존 CI/배포 경로의 `python -m app.schema --initialize`로 실행한다.
HTTP/서버 시작에서 migration/seed/collector를 실행하지 않는다.

## 외부 연결·추가 검증

- 실제 경로 API: 카카오 어댑터와 키 설정을 지원한다. 실제 운영 키의 성공 여부와
  장소 실요금은 별도 확인 대상이며, 미설정/자료 누락은 null과 명시적 상태로 반환한다.
- 영업/예약/접근성·수심·유속·혼잡 속성: 해당 장소에 적용되는 검토된 자료가 필요하다.
- 이미지: 사용 권한과 표시 용도를 검토한 카드 자산 연결 필요.
- 번체 카탈로그·분류 및 언어 간 동일 장소 연결: 자료/공식 매핑 확인 필요.
- 일몰/파고/수위 안내: 위 필수 근거·활동 규칙 검증 필요.
- 운영 SSO ingress·새 도구의 실제 유료 OpenAI 응답·전체 프런트 흐름·실기기 위치 권한은
  이번 격리 테스트의 범위 밖이다. provider tool 흐름은 로컬 응답 대체물로 검증했다.

검증 명령, 실패 항목과 요구사항별 증거는 [그룹 B 검증 기록](group-b-implementation.md)을 참고한다.
