# 활동 추천 규칙 (water-recommendation.v1)

상태: **구현됨**. 대상 코드는 `backend/app/water_index/recommendation.py`(규칙),
`backend/app/water_index/recommendation_api.py`(조회·조립),
`frontend/src/recommendationText.ts`(문구)다. 활동별 점수 자체는
[model_spec.md](model_spec.md)와 `activity_score.py`가 그대로 담당하며, 이 문서는
**그 점수들을 비교해 하나를 고르는 규칙**만 다룬다.

## 왜 필요했나

화면은 다섯 활동의 점수를 받아 `max` 를 골랐다. 그 결과 셋이 동시에 잘못됐다.

- 휴식이 거의 항상 1위였다. 휴식의 점수 항목은 기온·습도·바람·강수뿐이라 날씨만
  좋으면 만점에 가깝고, 수영은 수온·파고까지 보므로 같은 날 늘 몇 점 낮다.
- 해변에서 래프팅이 1위로 올라올 수 있었다. 래프팅은 하천 수위·유량 곡선이
  미설정(`local_operating_range_required`)이라 기상 항목만으로 부분 점수가 난다.
- 조석은 오늘 탭에만 표시될 뿐 추천과 이어지지 않았다.

그리고 사용자에게 보이던 근거는 «근거 확보 100% (3/3개) · 조건 근거로 계산 …
격자 93,133 · kma_nowcast» 였다. 이것은 **점수 산출의 감사 기록**이지 «오늘 왜
이걸 하라는 건가»의 답이 아니다.

## 규칙표

각 규칙은 응답의 `rules[]` 에 `{code, text, basis}` 로 실린다. `basis` 는 임계값의
출처를 구분한다 — `score_curve_knot`(점수 곡선의 절점, 논문 참고 구간에서 유래),
`pongdang_product_rule`(검증되지 않은 퐁당 자체 규칙), `data_contract`(기존 계약).

| code | 동작 | 임계값 | basis |
|---|---|---|---|
| `activity_blocked` | `condition_score.status` 가 `blocked`·`unavailable` 이면 후보에서 제외 | — | data_contract |
| `essential_measurement_missing` | 활동을 정의하는 지표가 없으면 제외. swim/surf=수온+파고, onsen=시설 욕조 수온, rafting=하천 수위 또는 유량, relax/mudflat=기온 | — | data_contract |
| `water_too_cold_for_immersion` | 수온이 기준 아래면 swim·surf 제외 | 18°C (`WATER` 곡선의 40점 절점) | score_curve_knot |
| `air_below_beach_preference` | 기온이 해변 선호 구간 밖이라는 사실을 문장에 덧붙임. **이 값만으로 활동을 빼지 않는다** | 21°C (`BEACH_AIR` 곡선의 0점 절점) | score_curve_knot |
| `tide_phase_product_rule` | 만조·간조 전후 구간이면 swim·surf 를 뒤로 미루고 계곡 대안을 함께 제시 | ±60분 | **pongdang_product_rule** |
| `water_activity_preferred` | 물 활동(swim·surf·rafting·mudflat)이 가능하면 점수가 더 높은 뭍 활동(relax·onsen)보다 먼저 권함 | — | pongdang_product_rule |
| `wave_favours_surf` / `wave_favours_swim` | swim·surf 가 **둘 다** 가능할 때 파고 항목 점수로 가르고, 파주기를 함께 싣는다 | `SWIM_WAVE` / `SURF_WAVE` / `SURF_PERIOD` | score_curve_knot |
| `no_water_activity_today` | 물 활동이 하나도 남지 않으면 `choice: null` 과 대안 | — | data_contract |

정렬 키는 `(물때로 미뤄짐, 뭍 활동인가, -점수, 추천 순서)` 이다. 물때로 미뤄진
활동이 가장 뒤로 가고, 그다음이 「물이면 물」, 그 안에서 점수, 동점이면
`RECOMMENDED_ACTIVITIES` 순서다.

### 조석 규칙은 설계 문서와 의도적으로 어긋난다

[frontend_integration.md](frontend_integration.md)는 «조위 자료만으로 갯벌 진입·탈출
시간이나 안전 타이머를 산출하지 않는다»고 못박는다. `tide_phase_product_rule` 은
그 선을 넘는 **제품 결정**이며, 사용자의 명시적 요구(만조·간조에 바다가 맞지 않으면
계곡을 권할 것)에 따른 것이다. 대신 세 가지를 강제한다.

1. 원본 조석 응답의 `events_are_not_safe_activity_windows` 사유를 그대로 전달한다.
2. 규칙 문구와 화면 문장 양쪽에 «퐁당 자체 물때 기준이며 공식 운영시간·안전 판정이
   아닙니다»를 고정으로 붙인다(`recommendationText.TIDE_DISCLAIMER`).
3. 조석 자료가 없으면 규칙을 적용하지 않는다. 없음을 유리한 상태로 바꾸지 않는다.

이 규칙은 공식 통제(`safety_status="restricted"`)와 활동 미지원을 **뒤집지 않는다.**
그쪽이 먼저 적용되어 `choice` 가 null 이 되고, 그때는 대안도 추천 표현을 쓰지 않는다.

## 물때 판정

`/tides/events` 와 같은 선택 규칙(`select_forecasts` + `nearby_tide_station`)으로
`at-12h ~ at+24h` 를 읽어 직전·다음 극값을 모두 확보한다. `next_high`/`next_low`
만으로는 「만조 지난 지 20분」을 말할 수 없기 때문이다. 위상은
`near_high | near_low | rising | falling | unknown` 이고, 근거의 `minutes` 는
부호가 있다 — 양수면 앞으로 남은 분, 음수면 지난 분이다.

## 대안 장소

전부 **등록된 카탈로그 행**이다. 이름을 지어내지 않고, 영업·개방 여부를 확인한 것도
아니다(`limitations` 에 그대로 실린다). 반경 50km, 종류당 2건.

| kind | 출처 | 언제 |
|---|---|---|
| `valley` | `livecams/places.PLACE_SELECT` 의 `place_kind='valley'` | 물때로 바다를 미뤘을 때 |
| `onsen` | `s.type IN ('onsen','hotspring')` 또는 카카오 `여행 > 관광,명소 > 온천%` | 수온이 낮을 때 **최우선** |
| `meal` | 카카오 `음식점%` 또는 TourAPI 콘텐츠 39 | 수온이 낮을 때, 그리고 휴식이 뽑혔을 때 |
| `visit` | 카카오 `여행 > 관광,명소%` 또는 TourAPI 12·14·15·25·28 | 위와 같음 |

분류 근거는 `app/travel/catalog.py` 의 `ROLE_CODES`·`catalog_role` 과 같다. 새 분류
체계를 만들지 않았다. 가장 가까운 계곡 **한 곳**에 한해 그 장소의 추천을 한 번 더
계산해 `best_activity`·`score` 를 채운다(조회가 장소를 타고 번지지 않도록 1건 제한).

## 「휴식」의 표기

백엔드 enum `relax` 는 계약·DB·테스트가 물려 있으므로 그대로 둔다. 바뀐 것은 표현
계층뿐이다 — 추천 문맥에서 `relax` 는 «물에 들어가지 않는 하루»로 부르고, 카페·맛집·
명소 대안을 함께 싣는다(`recommendationText.activityHeadline`). 「물가에 앉아 있기」가
답이 되지 않도록 **갈 곳**을 함께 말한다.

## 한 번의 조회로 끝난다

응답에는 판단에 쓴 **활동별 조건 응답(`conditions`)** 이 함께 실린다. 화면은 그것을
그대로 쓰고 같은 자료를 다시 묻지 않는다 -- 예전에는 홈 한 번에 활동마다 한 번씩,
관측이 비면 예보로 한 번 더, 모두 여섯 번을 왕복했고 그 응답들의 시각이 서로 달라
히어로 점수와 아래 근거가 다른 순간을 가리킬 수 있었다.

관측 점수가 없을 때 같은 시각의 예보로 물러서는 일도 서버가 한다
(`recommendation_api.read_activity`). 규칙은 화면이 하던 것과 같다 -- 공식 제한 ·
활동 미지원 · 계산 보류는 예보로 우회하지 않고, 빈 예보로 관측 근거를 덮지 않는다.

만료는 그 응답이 싣고 온 근거의 유효기간으로 잰다(`conditionScoreExpiry`). 그 시각에
다시 읽고, 그 전까지는 5 분마다 확인하며, 만료된 점수는 화면에 남기지 않고 «–» 로
비운다.

## 조회 실패와 「고를 것이 없음」은 다른 사실이다

`choice: null` 은 고를 것이 없다는 뜻이고, 조회 실패는 아무것도 모른다는 뜻이다.
화면은 둘을 다른 문장으로 말한다 -- 실패했을 때 「오늘은 할 게 없다」로 바꾸면
없는 판단을 지어내는 셈이다(`recommendationText.missingChoiceHeadline`).

## 문장은 백엔드가 만들지 않는다

응답에는 코드와 수치만 있다. 한국어 문구는 `frontend/src/recommendationText.ts`
한 곳에 모인다 — 같은 사유가 화면마다 다른 말로 보이지 않게 하려는 것이며,
`productData.SCORE_REASONS` 와 같은 원칙이다.

## 검증

- `backend/tests/test_recommendation.py` — 규칙표 한 줄당 한 케이스(DB 없이 순수 판단).
- `backend/tests/test_recommendation_integration.py` — 규칙이 **실제 자료에 닿는 길**:
  조석 선택과 위상, 계곡 · 온천 · 카페 대안 SQL 과 거리, 한랭 경로, 예보 물러서기.
  일회용 `pongdang_test` 에서만 돈다.
- `frontend/tests/recommendationText.test.mjs` — 코드→문장, 수치가 없을 때 문장을
  만들지 않는지, 물때 문장에 면책이 항상 붙는지.
- `frontend/tests/browser/*.spec.ts` — 화면이 **다시 고르지 않고** 서버 응답을 그대로
  그리는지(`serverRecommendation` 헬퍼).
