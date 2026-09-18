# 추천 프런트 연동 계약: 키워드 목록 → 장소·활동 → 별도 경로 요청

## 사용자 흐름

1. 프런트가 `GET /api/data/travel/keywords`로 선택 가능한 카테고리와 키워드를 읽는다.
2. 사용자가 키워드를 선택하면 `POST /api/data/travel/recommendations`로 보낸다.
3. 응답의 실제 장소·활동 목록, 추천 이유, 환경 자료와 미확인 조건을 표시한다.
4. 사용자가 별도로 경로를 요청하면 반환받은 `selection_token`으로
   `POST /api/data/travel/routes/recommend`를 호출한다.
5. 지도에는 경로 응답의 순서와 polyline을 표시한다. 자동 저장·예약은 하지 않는다.

기존 `/api/data/ai/chat`에서도 같은 TravelRequest를 사용한다. 첫 응답에는 장소·활동
목록만 반환하며 길찾기 API를 호출하지 않는다. 후속 경로 프롬프트 또는 명시적인
`travel.action="route"`가 있어야 경로 계산 도구를 실행한다.

### 구현된 화면 흐름 — 2026-09-18

추천 화면(`RecommendPage`의 코스 단계, `RecommendDesktop`)이 4번을 직접 수행한다.
경로를 보려고 지도 탭으로 이동할 필요가 없다.

- 공용 폼 `RouteRequestForm`이 출발지(현재 위치 좌표, 추천 후보의 여행
  카탈로그 `spot_id`, 또는 물 카탈로그 기본 장소의 좌표), 출발 날짜·시각,
  체류 시간, 후보 선택과 방문 수를 받는다. 여행 카탈로그가 아닌 식별자는
  `spot_id`로 보내지 않고 좌표만 보낸다. 좌표가 없는 장소는 출발지 목록에
  넣지 않으며, 위치 권한 거부는 거부로 남기고 근처 좌표로 대체하지 않는다.
- 공용 훅 `useTravelConcierge`가 대화(`/api/data/ai/chat`)와 별도 경로 요청을
  담당해 모바일·데스크탑이 같은 계약을 보낸다. 대화는 `travel.action="conversation"`
  으로 보내 목록 요청인지 경로 요청인지를 서버의 `explicit_route`가 판정한다.
  클라이언트가 사용자를 대신해 그 판정을 하지 않는다.
- `selection_token`이 만료(410)되면 같은 조건에 `must_include`로 고른 장소를 실어
  한 번 다시 조회하고 새 순번으로 재시도한다. 같은 장소를 현재 조건에서 다시
  확인하지 못하면 실패로 남긴다.
- 지도(앱 내)는 방문 순서 번호 마커, 출발지 마커, 구간별 도로 선을 그린다.
  카카오 지도 SDK 래퍼는 `[경도, 위도]` 쌍을 받으므로 `routePaths()`가 응답의
  `{longitude, latitude}` 객체를 변환한다.
- 외부 길찾기는 공식 URL 스킴
  `https://m.map.kakao.com/scheme/route?sp=위도,경도&vp=…&vp2=…&ep=위도,경도&by=car`
  를 쓴다. 경유지는 `vp`~`vp5`로 최대 5개이며, 순서 전체 링크와 구간별 링크를
  각각 제공한다. 좌표가 하나라도 없거나 경유지 상한을 넘으면 링크를 만들지
  않는다. 일부만 담은 링크는 사용자가 요청하지 않은 경로가 되기 때문이다.

## 1. 키워드 선택 목록

`GET /api/data/travel/keywords`는 `version=travel-keywords.v1`, `categories[]`를 반환한다.
각 카테고리는 안정적인 `id`, 표시용 `label`, `max_selections`, `options[]`가 있다.
프런트가 임의의 키워드 ID를 만들 필요가 없다. 모르는 ID, 중복, 단일 선택 항목의
복수 선택은 422로 거절한다.

| 카테고리 ID | 표시 이름 | 선택 항목 |
|---|---|---|
| `place_type` | 장소 유형 | 해변, 온천, 호수, 강 |
| `activity` | 활동 | 물 보며 쉬기, 온천, 서핑, 수영, 갯벌 체험, 래프팅 |
| `companion` | 동행 | 혼자, 연인, 친구, 가족, 아이와 함께 — 하나 선택 |
| `atmosphere` | 분위기 | 조용한 휴식, 자연 풍경, 사진 촬영, 인파 회피 |
| `mobility` | 이동 선호 | 구간별 30분, 60분, 제한 없음 — 하나 선택 |
| `weather` | 환경 선호 | 기온 18~26°C, 1시간 강수량 0mm, 관측소 파고 0~0.5m, 풍속 0~5m/s |

환경 선택 항목의 `criterion`에 단위에 대응하는 minimum/maximum/weight를 공개한다.
이 숫자는 사용자가 선택하는 범위 프리셋이다. 검증된 활동 적합성·안전 기준이 아니다.
프런트는 선택 전에 수치 범위를 표시해야 한다. 임의 범위 편집에는 별도의
`environment_preferences[]`를 사용한다. 같은 metric의 프리셋과 다른 범위를 동시에
보내면 422다. 프리셋 변경·해제를 이전 파생 태그/범위로 덮지 않도록, 응답의 원본
`request`를 폼 상태로 유지한다.

장소 유형 안에서는 OR로 비교한다. 다른 명시적 필수 조건은 모두 검사한다.
분위기·동행은 희망 조건이며 장소의 실제 속성으로 복사하지 않는다.
여러 활동을 선택할 수 있지만 장소 분류와 연관된 활동만 후보에 붙인다.
운영·허가·현장 지원까지 확인된 것이 아니므로 `activities[].status=unverified`다.
기존 자료 읽기와 공식 제한 검사는 첫 번째 선택 활동을 주 활동으로 사용한다.

## 2. 장소·활동 목록 요청

예시는 선택 계약을 보여 주며 실제 장소나 관측을 생성하지 않는다.

```json
{
  "request": {
    "region": "강릉",
    "dates": ["2026-09-16"],
    "keyword_selection": [
      {"category": "place_type", "values": ["beach"]},
      {"category": "activity", "values": ["relax"]},
      {"category": "companion", "values": ["children"]},
      {"category": "weather", "values": ["mild", "dry"]}
    ],
    "locale": "ko"
  },
  "limit": 5
}
```

주요 응답 필드:

| 필드 | 프런트 용도 |
|---|---|
| `stage="places_activities"`, `route_calculated=false` | 첫 목록 상태. 경로 계산 완료 표시 금지 |
| `request` | 다음 폼/대화 상태. 원래 선택을 그대로 유지 |
| `recommendations[].rank/spot_id/name/region` | 서버가 결정한 순서와 실제 장소 |
| `activities[]` | 제안 활동과 미확인 상태 |
| `reason`, `matched_preferences` | 왜 후보로 골랐는지 설명 |
| `environment_match.criteria[]` | 기온·강수·파고 등의 선택 범위/원본 값·단위·일치 여부·근거 |
| `environment_match.samples[]` | 관측/예보, 대상·조회·발표·만료시각과 대표 관측소 매핑 |
| `confirmed`, `unknown_conditions`, `conditions` | 확인한 장소 사실과 미확인 조건, 기존 자료 조회 |
| `candidate_scope` | 실제 검색 수, 비교 범위와 상한 |
| `selection_token` | 후속 비교·일정·경로에 사용할 소유자 결합 서명 토큰 |

`must_include[]`로 장소를 직접 지정하면 지역·분류 검색이 그 장소를 돌려주지
않아도 등록 카탈로그에서 따로 읽어 후보에 넣고(`candidate_scope.must_include_added`),
취향 가중치보다 앞에 두어 요청한 결과 수에서 밀려나지 않게 한다. 등록되지 않은
식별자는 404다. 순위 검사 자체를 면제하지는 않으므로 공식 제한·필수 조건·선택
분류에 걸리면 `excluded[]`에 사유가 그대로 남고 추천에는 들어가지 않는다.

후보는 실제 카탈로그에서 최대 300개를 읽는다. 환경 비교는 취향으로 추린 최대
30개에 적용하며 이 절단 범위를 응답에 남긴다. 완전한 환경 비교가 가능한 후보를 먼저
두고 `취향 가중치 합 + 선택 환경 범위 일치점`으로 정렬한다. 자료가 부족한 후보는
환경 일치점을 null로 보존한다. 없는 값을 0mm 강수나 낮은 파고로 대체하지 않는다.

날짜·시각이 있으면 해당 대상의 예보를 읽는다. 날짜만 있으면 해당일 정오 미리보기,
날짜가 없으면 현재 관측 미리보기이며 `time_basis`에 구분한다. 실제 경로 단계에서
예상 방문 시각으로 다시 읽는다. 관측소 자체를 여행지로 반환하지 않는다.

## 3. 별도 경로 요청

`POST /api/data/travel/routes/recommend`:

```json
{
  "selection_token": "직전 추천에서 받은 실제 토큰",
  "candidate_ranks": [1, 2, 3],
  "stop_count": 2,
  "stay_minutes": 60,
  "include_geometry": true
}
```

출발 좌표와 날짜·출발시각이 첫 추천에 없었다면 이 요청의 선택적 `request`에
편집한 TravelRequest 전체를 보낸다. 출발지는 사용자가 고른 좌표 또는 여행
카탈로그의 실제 등록 `spot_id`가 필요하다. 주소 문자열만으로 임의 좌표를 만들지
않는다. 다른 목록의 식별자가 좌표와 함께 오면 좌표 출발지로 처리하고 그
식별자는 `route.origin.spot_id`에 남기지 않는다.

- 후보 최대 5개, 방문 수 1~5곳. 생략 시 후보 수와 3 중 작은 값을 사용한다.
- 명시한 방문 수를 충족하지 못하면 부족 상태를 반환하며 자동으로 줄이지 않는다.
- 후보 순번은 직전 추천의 순서다. 다른 사용자의 토큰·위조·30분 만료를 거절한다.
- 한 날짜의 경로를 계산한다. 여러 날짜의 여행에는 `day`를 명시해 날짜별로 요청한다.
- 이동 수단은 현재 자동차만 실제 어댑터에 연결한다. 다른 수단은 미설정이다.
- 실제 장소와 최신 공식 제한, 요청 변경/프로필/기록을 재조회한다.

### 계산 방식과 의미

현재 구현은 **선택된 후보 안에서의 방문 순서 비교**다.
카카오모빌리티에서 출발 기준 시각의 방향별 구간 소요시간 행렬을 받은 뒤,
요청한 방문 수의 모든 순열을 비교한다. 출발·장소 사이·귀가 구간과 체류시간을 포함한다.
환경은 예상 방문 시각/시간당/마지막 시각의 유효한 대표 관측소 자료로 비교한다.

목적함수:

`장소 취향점 평균 + 환경 범위 일치점 평균 − 0.25 × 전체 이동 분`

이는 설명 가능한 여행 선호 정책이며 안전 점수가 아니다. 사용자 선택 환경 범위가
없으면 환경 점수는 미적용이다. 알려진 통행료가 예산을 넘거나, 이동 허용 시간/귀가
마감 위반이 확인되면 제외한다. 전체 비용이 없으면 예산 충족은 unknown이다.

구간 행렬은 **출발 기준 시각**의 자료다. 이후 모든 구간을 각 도착시각의 교통정보로
다시 최적화한 결과가 아니다. 따라서 시간은 estimate이며, optimality도
`best_under_reference_matrix_and_sampled_preferences`라는 제한된 의미다.
비교에 필요한 환경 자료/경로가 부족하면 `provisional_missing_comparison_evidence`로
표시하고 최적 경로로 확정하지 않는다. 시간당 샘플 사이의 연속 환경 상태도 증명하지 않는다.

### 경로 응답

- `stage="route"`, `route_calculated`, `status`, `reason_codes`
- `route.items[]`: 방문 순서·실제 장소·예상 도착/출발·활동·해당 시각의 환경 비교
- `route.items[].latitude`/`longitude`: 등록 카탈로그 좌표. 지도 마커와 지도앱
  길찾기 전달에 사용한다. 좌표가 없는 장소는 null이며 임의로 만들지 않는다.
- `route.origin`: 요청한 출발지의 `label`·`spot_id`·`latitude`·`longitude`.
  등록 출발지는 카탈로그 좌표로 해석하며, 사용자가 입력한 라벨을 좌표로 바꾸지
  않는다. 카탈로그에 없는 `spot_id`는 좌표가 있으면 좌표 출발지로 떨어지고,
  좌표도 없으면 `origin_coordinates_required`다. 선택된 순서에만 붙고
  `alternatives[]`에는 넣지 않는다. 이 값은 요청 본인에게만 반환하며 모델에는
  전달하지 않는다.
- `route.legs[]`: 출발지 포함 구간별 예상시간·출처·조회시각·기준 출발시각
- `route.legs[].geometry.polyline`: 선택 후 조회한 선. 각 점은
  `{"longitude": …, "latitude": …}` 객체이며 순서대로 연결한다. 한 구간에
  사용할 수 없는 점이 있으면 그 구간 전체를 그리지 않는다. 남은 점만 이어
  실제로 받지 않은 도로를 그리지 않는다.
- `route.travel_minutes`, `return_at`, `cost`: 이동 합·예상 귀가·알려진 통행료/총비용 unknown
- `candidate_scope`: 검토한 후보/순열 수, 실패 구간, 기준 시각, 전체 지역 최적 여부 false
- `alternatives[]`: 비교한 다음 후보 경로 최대 3개
- `plan_input`: 기존 일정 초안/저장 API에 보낼 장소 순서. 기존 일정 API의 경로 어댑터는
  별도 미설정이므로 이 값을 저장하면 정밀 ETA가 유지된다고 가정하지 않는다.
- `saved=false`: 계산은 개인 일정 저장·예약·여행 시작을 실행하지 않는다.

초기 요약과 지도 선은 별도 조회다. 값이 바뀌면 `summary_may_differ=true`로 보존한다.
선 상세 조회 실패는 빈 geometry/unavailable로 표시한다. 직선 선이나 가짜 도로를 채우지 않는다.
한 요청에서 최대 36회, 외부 호출 동시성 3, 호출당 timeout 5초, 계산 전체 45초다.
토큰·인증정보·응답 원문은 모델이나 클라이언트 오류에 포함하지 않는다.

## 기존 AI 대화에서 사용

```json
{
  "message": "이제 이 후보들로 경로 추천해줘",
  "travel": {
    "action": "route",
    "selection_token": "직전 추천에서 받은 실제 토큰"
  }
}
```

`travel.request`를 생략하면 서명 토큰의 원래 여행 조건을 복원한다.
수정한 조건이 있으면 전체 request를 함께 보낸다. 응답은
`travel_results.route_recommendation`에 들어간다. 모델은 서버 결과 ID와 최소한의
장소·시각 요약만 받아 설명하며, 좌표·지도 선·토큰·개인 식별자를 받지 않는다.
`action="recommend"`는 모델이 경로를 요청해도 차단한다. 자유 대화에서도
“경로 말고 목록만”, “경로는 나중에”를 경로 요청으로 처리하지 않는다.

## 설정과 실제 연결 상태 — 2026-09-15

Pilgrimage의 `backend/common/directions.py`가 사용하는 공식 카카오모빌리티 API를
Pongdang에 독립적으로 연결했다. Pilgrimage 모듈·DB·서비스 인증을 가져오지 않는다.

- 현재 자동차: `https://apis-navi.kakaomobility.com/v1/directions`
- 미래 출발시각: `https://apis-navi.kakaomobility.com/v1/future/directions`
- 서버 설정: `TRAVEL_ROUTE_PROVIDER=kakao`, `KAKAO_REST_API_KEY`
- 경로에는 `KAKAO_REST_API_KEY`를 우선 사용한다. 비어 있을 때만 기존
  `KAKAO_REST_KEY`를 사용하며 수집기의 키 선택은 변경하지 않는다.
- 로컬 Pongdang Compose는 `compose.yaml`과 같은 디렉터리의 `.env`에서 두 키를
  읽어 백엔드에 전달한다. 직접 백엔드를 실행할 때는 `backend/.env`를 사용한다.
- 운영 배포 스크립트는 `--env-file /home/cks/.config/pongdang/production.env`를
  지정한다. 운영의 새 키는 그 파일에 설정해야 하며 로컬 `.env`가 전송되지는 않는다.
- 선택한 키가 401/403을 받았다고 다른 키로 재시도하지 않는다.
- `TRAVEL_ROUTE_PROVIDER=disabled`로 경로 외부 호출만 끌 수 있다.
- browser의 JavaScript/VITE 키를 서버 REST 키로 사용하지 않는다.

사용자가 Pilgrimage의 내부 `GET /api/directions/`, 위 공식 상위 API와
`/home/cks/pilgrimage/.env`의 `KAKAO_REST_API_KEY` 설정을 확인했다.
Pongdang의 운영 설정 경로는 `/home/cks/.config/pongdang/production.env`다.
배포된 Pongdang은 자신의 운영 설정을 읽으며 Pilgrimage의 `.env`를 자동 복사하지 않는다.

이번 백엔드 변경은 기존 `dev` 통합 → `main` CI → 자동 배포 절차를 따른다.
로컬 개발 완료를 위해 운영 SSH 접속을 요구하지 않는다. 실제 운영 키의 유효성과
배포 후 경로 응답은 운영 확인 사항이며 로컬 테스트 성공과 구분한다.
[배포 후 진단 참고](travel-route-server-check.md)는 연결 문제가 있을 때 사용할 수
있는 선택적 읽기 전용 절차이며 로컬 작업의 선행 조건이 아니다.

로컬의 기존 `KAKAO_REST_KEY`로 실제 등록 경포해수욕장(7) → 강문해변(9)을
검사한 2026-09-15 17:00 KST 요청은 HTTP 401이었다.
401/403에서 후속 호출을 멈추고 인증 실패를 보존하는 동작을 확인했다.

2026-09-18 14:39 KST 같은 로컬 키로 경포해수욕장(7) 출발, 사근진해변(10) →
강문해변(9) 방문의 실제 경로 계산이 성공했다. `route_calculated=true`,
구간 3개의 예상시간 4·9·5분과 점 25·91·36개의 도로 선을 받았고
`optimality`는 환경 비교 자료 부족으로 `provisional_missing_comparison_evidence`
였다. 이는 로컬 관측이며 운영 키의 상태를 뜻하지 않는다. 운영 성공은
배포 후 별도로 확인한다. 키 자체와 외부 응답 원문은 기록하지 않았다.

공식 사양: [자동차 길찾기](https://developers.kakaomobility.com/guide/navi-api/directions),
[미래 운행 정보 길찾기](https://developers.kakaomobility.com/guide/navi-api/future).

## 검증

### 배포용 커밋 검증 — 2026-09-15

기존 `main`의 웹캠 목록과 `dev`의 Luna 기반을 합친 `4156e84`를 기준으로,
이번 여행 백엔드 파일만 별도 작업 폴더에 구성했다. 원래 작업 폴더의 미커밋
중복 파일과 별도 웹캠 수집 변경은 포함하지 않았다.

- Backend Ruff lint/format 통과, 전체 **928 passed**, 36.27초.
- PostgreSQL 18의 disposable `pongdang_test`만 사용했다.
- Frontend Node 24.21.0, `npm ci`, lint, **37 tests passed**, `/pongdang/` build 통과.
- 여행 provider 대체물 테스트는 로컬 `.env`를 읽지 않고 명시적인 테스트용 키를
  사용한다. 실제 API 키가 없는 CI에서도 같은 검증을 수행한다.
- 배포 스키마는 v8이다. 명시적 초기화가 기존 수집 행을 보존하고 여행 개인 테이블을
  추가하며, HTTP 시작이나 요청에서 마이그레이션하지 않는다.

아래 기록은 기존 혼합 작업 폴더에서 실행한 이전 검사다. 배포 대상의 검증 결과는
이 절을 기준으로 하며, CI와 운영 배포 결과는 해당 커밋의 GitHub Actions에서 확인한다.

`backend/tests/test_travel_keywords_routes.py`는 키워드 오류/해제, 단계 분리,
실제 PostgreSQL 정규화 기온·강수·파고의 추천 반영, 미래 예보/범위 초과,
예상 방문 시각에 따른 순서 변경, 누락 자료, 타인 토큰, 외부 응답/단위/형상/인증
실패와 비밀 비노출을 검사한다. 격리 DB와 HTTP 응답 대체물을 사용한다.
실제 유료 길찾기의 성공이나 실제 현장 안전성을 증명하는 테스트가 아니다.

### 이번 조정의 실행 기록

- 앞선 키워드·추천·경로·기존 AI chat·환경 조건 관련 검사: **132 passed**, 11.00초.
- 새 운영 키 설정의 `.env` 로딩, 경로/수집 키 우선순위, 비밀 비노출,
  인증 실패 후 다른 키 재시도 방지를 검사하는 5개 테스트를 추가했다.
- Ruff: 후속 전체 검사 통과. `git diff --check`도 통과.
- Compose YAML을 파싱해 새 키가 backend에만 전달되고
  frontend/collector/initialize/db에는 전달되지 않는 것을 확인했다.
- 실제 정규화 SQL fixture는 별도 PostgreSQL 18의 `pongdang_test`에서만 사용했다.
- 전체 백엔드 최종 검사: **1,192 passed**, 49.65초. 경고 2개는 기존 Starlette/httpx·AnyIO deprecation이다.
- 프런트 Node 24.21.0: lint 통과, **37 tests passed**. build는 TypeScript 단계 실패.
  기존 `activityAssessmentApi 2.ts` / `ActivityAssessmentPanel 2.tsx`의 누락 import와
  암시적 any 오류가 마지막 빌드에도 남아 있다. 앞선 웹캠 화면 타입 오류는
  동시 작업 변경 후 마지막 빌드에서 더 이상 보고되지 않았다. 프런트는 이 작업에서 수정하지 않았다.
- HTTP 대체 응답은 카카오 요청/시간/단위/형상/오류 경로를 검증한다.
  실제 길찾기 성공을 증명하지 않으며, 현재 실제 연결의 401은 해결되지 않았다.

키워드 목록 → 장소·활동 추천 → 별도 경로 요청의 백엔드 계약과 환경 설정 조정은
위 로컬 검사로 확인했다. `main`의 CI와 자동 배포 이후에는 실제 운영 설정으로
길찾기 성공 → 환경 근거 연결 → 후속 경로 응답을 확인한다.
