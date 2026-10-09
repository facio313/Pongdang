# 활동 추천 규칙 (water-recommendation.v1)

상태: **구현됨**. 대상 코드는 `backend/app/water_index/recommendation.py`(규칙),
`backend/app/water_index/recommendation_api.py`(조회·조립),
`frontend/src/recommendationText.ts`(문구)다. 활동별 점수 자체는
[model_spec.md](model_spec.md)와 `activity_score.py`가 그대로 담당하며, 이 문서는
**그 점수들을 비교해 하나를 고르는 규칙**만 다룬다.

## 왜 필요했나

화면은 활동별 점수를 받아 `max` 를 골랐다. 그 결과 셋이 동시에 잘못됐다.

- 휴식이 거의 항상 1위였다. 휴식의 점수 항목은 기온·습도·바람·강수뿐이라 날씨만
  좋으면 만점에 가깝고, 수영은 수온·파고까지 보므로 같은 날 늘 몇 점 낮다.
- 해변에서 래프팅이 1위로 올라올 수 있었다. 래프팅은 하천 수위·유량 곡선이
  미설정(`local_operating_range_required`)이라 기상 항목만으로 부분 점수가 난다.
- 조석은 오늘 탭에만 표시될 뿐 추천과 이어지지 않았다.

첫째를 「물이면 물」로 바로잡으면서 **반대 방향으로 지나쳤다.** 그 구분이 점수보다
앞에 있어, 수온 12°C·파고 1.8m 로 수영이 20점인 날에도 70점 온천 앞에 수영이
섰다. 지금은 조건부다 — `WATER_PREFERENCE_MIN_SCORE` 를 보라.

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
| `essential_measurement_missing` | 활동을 정의하는 지표가 없으면 제외. swim/surf=수온+파고, rafting=하천 수위 또는 유량, relax/mudflat/onsen=기온. 담수 수영은 수온+강수 | — | data_contract |
| `activity_not_offered_at_place` | 그 장소에서 하는 활동이 아니면 제외. onsen 은 `support_status="supported"` 인 장소에서만 후보 | — | data_contract |
| `inland_swimming_authorization_unconfirmed` | 계곡·호수·저수지 수영은 그 장소의 활동 지원 근거가 확인될 때만 후보. 관측값이 있다는 사실은 입수 허가가 아니다 | — | data_contract |
| `water_too_cold_for_immersion` | 수온이 기준 아래면 swim·surf 제외 | 18°C (`WATER` 곡선의 40점 절점) | score_curve_knot |
| `air_below_beach_preference` | 기온이 해변 선호 구간 밖이라는 사실을 문장에 덧붙임. **이 값만으로 활동을 빼지 않는다** | 21°C (`BEACH_AIR` 곡선의 0점 절점) | score_curve_knot |
| `tide_phase_product_rule` | 만조·간조 전후 구간이면 swim·surf 를 뒤로 미루고 계곡 대안을 함께 제시 | ±60분 | **pongdang_product_rule** |
| `water_activity_preferred` | 물 활동(swim·surf·rafting·mudflat)이 **기준 점수 이상**이면 점수가 더 높은 뭍 활동(relax·onsen)보다 먼저 권함 | 40점 (`WATER` 곡선 18°C 절점의 점수) | pongdang_product_rule |
| `water_preference_not_applied` | 물 활동이 기준에 못 미치면 위 우선을 적용하지 않고 점수순으로 줄을 세움. **제외하지는 않는다** | 40점 (같은 절점) | score_curve_knot |
| `beach_closed_season_product_rule` | 해수욕장 개장 기간 밖이면 swim 을 뒤로 미룸(`demoted`). 서핑은 개장과 무관하므로 그대로 둔다 | 개장 기간 서술 | **pongdang_product_rule** |
| `beach_season_unconfirmed` | 개장 기간을 확인하지 못하면 swim 을 **빼지도 미루지도 않되** 물놀이 우선만 거둠(`needs_confirmation`). 안내의 「연중·상시」는 개장 확인으로 쓰지 않는다 | — | data_contract |
| `beach_season_window_from_past_year` | 개장 기간에 지난 연도가 적혀 있으면 그 월·일 구간만 쓰고, 몇 해 전 자료인지 함께 내림 | — | data_contract |
| `wave_favours_surf` / `wave_favours_swim` | swim·surf 가 **둘 다** 가능할 때 파고 항목 점수로 가르고, 파주기를 함께 싣는다 | `SWIM_WAVE` / `SURF_WAVE` / `SURF_PERIOD` | score_curve_knot |
| `no_water_activity_today` | 물 활동이 하나도 남지 않으면 `choice: null` 과 대안 | — | data_contract |

정렬 키는 `(물때로 미뤄짐, 물놀이 우선 자격이 없음, -점수, 추천 순서)` 이다.
물때로 미뤄진 활동이 가장 뒤로 가고, 그다음이 「물이면 물」, 그 안에서 점수,
동점이면 `RECOMMENDED_ACTIVITIES` 순서다.

### 「물이면 물」은 조건부다

`_water_preferred()` 가 자격을 한 곳에서 정한다 — 물에 들어가는 활동이고, 개장이
확인됐고(`needs_confirmation` 이 아니고), 총점이 `WATER_PREFERENCE_MIN_SCORE`(40점)
이상일 것.

기준선은 새 숫자가 아니다. `IMMERSION_WATER_C`(18°C)가 `WATER` 곡선 절점의 x 라면
이쪽은 **같은 절점의 y** 다. 역할은 다르다 — 그쪽은 수온 하나로 묻고 아니면
후보에서 빼고, 이쪽은 파고·바람·강수까지 합친 총점을 묻고 모자라면 가산만 거둔다.
수온 20°C 라도 파고 2m 에 비가 오면 총점이 이 선 아래로 내려간다.

자격을 잃어도 후보에서 빠지지 않는다. 점수로 1위가 되면 그대로 1위이고, 그때는
점수로 이긴 것이다. 그래서 `water_activity_preferred` 문장은 **가산을 실제로 받았을
때만** 나간다 — 점수로 이긴 날 「물에 들어갈 수 있어서 골랐다」를 적으면 틀린 이유를
대는 셈이다.

### 개장 판정의 세 단계

`Candidate` 는 세 가지를 구분한다. 하나로 뭉치면 「판단하지 않았다」·「뒤로
미뤘다」·「할 수 있는 날인지 모른다」가 섞인다.

| 필드 | 뜻 | 점수 | 순위 |
|---|---|---|---|
| `dropped` | 판단 자체를 하지 않음 | 숨김 | 줄에서 빠짐 |
| `demoted` | 뒤로 미룸(물때 구간, 개장 기간 밖) | 그대로 | 맨 뒤 |
| `needs_confirmation` | 할 수 있는 날인지 모름(개장 미확인) | **그대로** | 물놀이 우선만 잃음 |

`unconfirmed` 를 `demoted` 로 뭉치면 「미확인 ≠ 폐장」을 깨고
(`place_details.season` 의 세 가지 답), 아무것도 하지 않으면 10월 해변에 수영이
1위로 선다. 점수는 그대로 남는다 — 조건은 실제로 좋을 수 있고, 모르는 것은
개장이다. 화면은 점수 옆에 「개장 확인 필요」를 세운다.

**해수욕장의 「연중·상시」는 개장 확인으로 쓰지 않는다.** 관광정보가 「상시
개방」이라 적을 때 그것은 출입 가능의 뜻이고 개장 기간이 아니다. 그대로 쓰면
`year_round` 창(1.1~12.31)으로 읽혀 10월 해변이 `in_season` 이 된다. 파서는 읽은
사실 그대로 창을 내놓고, 그것을 개장 판정으로 쓸지는 제품 규칙이므로
`recommendation_api.season_view` 가 정한다(`place_details.season` 은 DB·시계·장소
유형을 모르는 순수 모듈로 남는다). 판정에 쓰지 않은 창은 함께 지운다 — 남겨 두면
화면이 「개장 1.1~12.31」로 읽어 쓰지 않은 숫자를 근거처럼 보이게 한다.

## 세 집합

활동을 세 자리에서 각각 다르게 센다. 하나로 뭉치면 「지원하지 않는다」·「권하지
않는다」·「점수를 보여 주지 않는다」가 섞인다.

| 집합 | 어디 | 값 | 뜻 |
|---|---|---|---|
| 지원 | `conditions.ACTIVITIES` | swim · surf · relax · mudflat · onsen · rafting | API 로 직접 물으면 평가한다 |
| 추천 후보 | `models.RECOMMENDED_ACTIVITIES` | swim · surf · relax · onsen | `decide()` 가 비교해 하나를 고른다 |
| 점수 목록 | `frontend aiApi.listedActivities` | swim · surf · relax · onsen | 화면의 「활동별 점수」에 줄이 선다 |

- **mudflat** 은 후보에서 빠진다 — 동해안에 갯벌 **지형**이 없다.
- **rafting** 은 후보에서 빠진다 — 어댑터가 하천 수위·유량을 공급하지 않고 그
  점수 곡선도 미설정이라 필수 지표가 어떤 날도 `evaluated` 가 되지 않는다. 후보로
  두면 화면에 늘 「추천 제외 · 필수 근거 부족」 한 줄만 섰다. **자료** 문제이며,
  하천 관측이 붙으면 후보 집합 한 줄을 되돌리면 된다. `ESSENTIAL_METRICS` 의
  rafting 행은 그대로 남겨 둔다 — 호출자가 직접 넣어도 기상만으로는 권하지 않는다.
- **relax** 는 한동안 점수 목록에서 숨겼다. 점수는 휴식이 1위인데 위에서는 수영을
  권하는 모순이 그대로 읽혔기 때문이다. 우선이 조건부가 된 지금은 숨길 이유가
  없다 — 오히려 휴식이 1위인데 수영을 권한 날 그 숫자를 볼 수 있어야 「휴식 점수가
  더 높지만」이라는 설명을 확인할 수 있다. 숫자를 지우고 설명만 남기면 확인할 길이
  없다. 히어로에서는 `activityHeadline` 이 `relax` 를 「해변 산책」·「물에 들어가지
  않는 하루」로 바꿔 부른다.
- **onsen** 은 목록에 남는다. 시설 욕조 수온은 수집 경로가 없어 사실상 늘 비어
  있지만, 외기만으로 점수가 서고(`ONSEN_AIR`) 온천 시설에서는 추운 날의 답이 된다.
  해변에서 빠지는 이유는 자료가 아니라 **장소**다
  (`activity_not_offered_at_place`).

두 집합은 지금 같다. 그래도 상수는 둘로 남긴다 — 「무엇을 고를 수 있는가」와
「무엇을 보여 주는가」는 다른 질문이고 전에 한 번 갈렸다. `useBestActivity` 는
히어로가 점수 목록에 없을 수 있다는 계약을 계속 지키며,
`recommendationText.choiceReason` 도 **상대의 점수가 화면에 있을 때만** 상대를
이름으로 부른다.

### 온천의 기온 곡선은 거꾸로다

`onsen` 의 외기 곡선은 `OUTDOOR_AIR` 가 아니라 `ONSEN_AIR` 다. 야외 방문 선호와
온천 선호는 반대 방향이다 — `OUTDOOR_AIR` 는 5°C 에서 0점이므로 온천에 가고 싶은
날에 가장 낮은 점수를 주고 있었다.

**논문 근거가 없다.** 「추우면 온천이 좋다」는 상식이지만 어느 기온에서 몇 점인지를
말해 주는 참고 구간을 찾지 못했으므로 절점은 전부 제품이 정한 것이고, `basis` 에
「퐁당 제품 규칙(미검증)」으로 박아 둔다. 더운 날을 0점으로 떨어뜨리지 않는 것도
의도다 — 한여름에도 온천에 가는 사람이 있고 그것을 「조건 나쁨」으로 단정할 근거가
없다.

욕조 수온은 필수 지표가 아니다. 있으면 점수에 함께 반영되고, 없으면 외기만으로
`coverage 0.5` · `status "partial"` 로 선다. 필수로 두는 동안 온천은 어떤 날도
점수가 나지 않았다.

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

## 추천 탭은 다른 체계다

`decide()` 는 **한 장소의 여러 활동**을 비교해 「오늘 뭘 할까」에 답한다. 추천 탭
(`app/travel/recommend.py`)은 **여러 장소**를 줄 세운다. 두 체계를 합치는 일은
따로이며, 지금은 두 가지만 맞춰 두었다.

- **고른 활동을 전부 본다.** 예전에는 `keywords.normalize` 가 `activities[0]` 하나만
  집어서, 「서핑 + 휴식」을 고르면 서핑 기준으로만 장소를 줄 세웠다. 서핑을 하지
  않는 곳은 휴식으로 좋을 수 있는데 그대로 빠졌고, 나머지 선택은 라벨과 카탈로그
  적합도로만 쓰여 점수에 닿지 못했다. 이제 `TravelRequest.activities` 가 선택 집합
  전부를 담고, `EnvironmentReader.choose` 가 그 장소에서 가장 좋은 하나를 고른다.
  어느 활동으로 뽑혔는지는 `matched_activity` 로 함께 온다. 점수가 없는 활동은
  셈에서 빠진다 — 결측을 0 으로 메우면 「근거 없음」이 「조건 나쁨」으로 둔갑한다.
  제외 판정은 자연히 「고른 활동이 **전부** 막혔을 때만」이 된다.
- **개장 기간은 같은 판정을 쓴다.** 홈·오늘이 「해변 산책」이라고 말하는 날 추천
  탭이 같은 해변을 수영 기준으로 줄 세우면, 같은 앱이 같은 장소에 대해 두 가지를
  말한다. `beach_seasons_closed` 가 `season_view` 를 재사용해 개장 기간 밖 해변에서
  수영을 그 장소의 후보 활동에서 빼고, 수영만 골랐다면 그 해변을 제외한다 — 고른
  것이 수영이었으므로 다른 활동으로 슬쩍 바꾸지 않는다. 미확인은 빼지 않는다.

`activity` 는 대표값으로 남는다(`activities` 의 첫 번째). 활동 하나만 보는 호출부가
여러 곳이다.

## 아직 어긋난 곳

세 가지가 남아 있다. 고치지 않았으므로 사실대로 적어 둔다.

1. **래프팅 운영 범위가 설정되지 않았다.** `river_level`·`river_flow` 곡선이 `None`
   이어서 `status="unconfigured"` 와 `local_operating_range_required` 가 난다. 자료는
   들어온다(`app/ingestion/water.py`) — 막는 것은 곡선이다. 하천 게이지의 영점과
   유량은 구간마다 달라 전국 공통 수치를 쓸 수 없으므로, 장소·관측소별 운영 범위를
   등록하는 경로가 필요하다. 그 경로는 아직 없다(`local_operating_range_required` 를
   참조하는 곳은 내보내는 쪽과 라벨, 둘뿐이다). 강릉 범위에 래프팅 운영 장소가
   있는지 확인이 먼저다.
2. **계곡 수영은 사실상 전면 제외다.** `inland_swimming_authorization_unconfirmed`
   가 `support_status == "supported"` 를 요구하는데, `support_evidence` 를 채우는
   수집 경로가 없다. 규칙은 옳다 — 관측값이 있다는 사실은 입수 허가가 아니다.
   없는 것은 **근거를 넣는 경로**다.
3. **목록·지도 점수는 `decide()` 를 거치지 않는다.** `useConditionSummaries(ids,
   "swim")` 가 저장된 생 수영 점수를 그대로 읽는다(`SpotsPage`·`useHomeBeaches`·
   `MapPage`·`useComparisonPlaces`). 그래서 10월 폐장 해변이 목록에서는 수영 점수를
   그대로 보여 주고, 같은 해변의 상세는 「해변 산책」이라고 말한다. 상세 화면과
   어긋나는 마지막 지점이다.

## 검증

- `backend/tests/test_recommendation.py` — 규칙표 한 줄당 한 케이스(DB 없이 순수 판단).
- `backend/tests/test_recommendation_integration.py` — 규칙이 **실제 자료에 닿는 길**:
  조석 선택과 위상, 계곡 · 온천 · 카페 대안 SQL 과 거리, 한랭 경로, 예보 물러서기.
  일회용 `pongdang_test` 에서만 돈다.
- `frontend/tests/recommendationText.test.mjs` — 코드→문장, 수치가 없을 때 문장을
  만들지 않는지, 물때 문장에 면책이 항상 붙는지.
- `frontend/tests/browser/*.spec.ts` — 화면이 **다시 고르지 않고** 서버 응답을 그대로
  그리는지(`serverRecommendation` 헬퍼).
- `backend/tests/test_season.py` — 개장 기간 서술을 읽는 순수 파서. 읽지 못한 것이
  `unconfirmed` 로 남는지, 「하절기」를 7~8월로 짐작하지 않는지.
- `backend/tests/test_activity_score.py` — `ONSEN_AIR` 가 `OUTDOOR_AIR` 와 **반대
  방향**인지, 욕조 수온 없이도 부분 점수가 서는지.
- `backend/tests/test_travel_keywords_routes.py` — 고른 활동이 전부 살아남는지,
  `choose` 가 점수 없는 활동을 0 으로 세지 않는지.
- `backend/tests/test_app_imports.py` — 기동 경로가 import 되는지. 단위 테스트는
  순수 함수를 직접 import 하고 통합 테스트는 DB 가 없으면 멈추므로, 라우터 모듈을
  한 번도 읽지 않은 채 전체가 초록일 수 있다.
