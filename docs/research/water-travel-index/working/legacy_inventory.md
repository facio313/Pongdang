# Multtara 읽기 전용 기존 구현 인벤토리

감사일: 2026-09-14 KST. 이 문서는 저장소 근거 추출 작업지이며 문헌의 과학적 타당성 평가는 상위 `legacy_audit.md`와 `synthesis.md`에서 evidence_id로 연결한다. 코드 수치, 코드의 출처 문자열, 저장소 문서가 논문에 부여한 설명을 원논문의 검증된 사실로 취급하지 않았다. 본 감사에서는 웹 검색·원문 접속을 수행하지 않았다.

## 범위와 상태

- 읽은 로컬 참고 저장소: `/Users/cksmacbook/Desktop/Develop/Project/Multtara`, 현재 브랜치 `main`, HEAD `b160cf1c07cc0f299f9d83839557a1e987c47be4`. 원격 fetch, checkout, 실행, DB·네트워크·자격증명 사용, 파일 수정 없음.
- `git worktree list --porcelain`에서 `codex` worktree는 같은 HEAD, `cursor`는 `96248d61cf952d86708522008dc1d5fb8a685ae3` 확인. 다른 브랜치의 구현을 확인했다는 뜻은 아니다. 초기 광역 AGENTS 경로 탐색에 worktree AGENTS가 출력됐지만 다른 worktree 코드는 감사하지 않았다.
- 지침은 Multtara 루트 `AGENTS.md` 1–352 및 Pongdang 루트 `AGENTS.md`를 읽었다. 대상 경로 상위 `backend/`, `backend/services/`, `backend/apps/`, 하위 `water_index/`, `conditions/`, `docs/`에서 추가 AGENTS는 발견되지 않았다. 상위 Project/Develop/Desktop/home 직속 AGENTS도 확인되지 않았다.
- Multtara 지침이 요구한 `/Users/cksmacbook/.agents/skills/vowline/SKILL.md`를 실제 읽었다. 이번 계약은 소스 읽기와 지정 연구 산출물만 쓰기, 기존 변경 보존, 실행 테스트를 과학적 검증으로 부르지 않기다.
- `git --no-optional-locks status --short --untracked-files=no -- AGENTS.md docs/water-index-methodology.md backend/services/water_index/ backend/services/ingestion/ backend/apps/conditions/`는 종료코드 0·출력 공백이었다. 이 경로의 추적 파일 변경은 보고되지 않았다. 전체 `git status --short` 및 전체 tracked status는 장시간 지연 후 종료코드 0·출력 공백으로 완료되었다. 완료 시점 추적/미추적 변경은 보고되지 않았다. 원래 변경에 손대지 않았다.
- 읽기 범위와 파일 SHA-256은 `reviewed_legacy_files.json`에 있다. test-name inventory는 테스트 본문 전체 확인이나 테스트 실행과 구분했다. `.env`, 사용자 계정 데이터, 실제 운영 DB, raw payload를 읽지 않았다. `rg`가 설치되지 않아 Python `pathlib`와 제한된 텍스트 검색을 사용했다.

## 활동·장소·대상자: 실제 구현과 지원 주장 구분

`backend/services/water_index/domain.py:25`의 활동 enum은 swim, surf, relax, mudflat, onsen, rafting 여섯 개다. `domain.py:72`의 허용 environment와 `backend/services/ingestion/fusion.py:398`의 장소 분류를 합치면 다음이다. 이는 구조적으로 요청을 수용하는 범위이며, 실제 해당 장소가 활동을 제공하거나 공식 자료가 있다는 뜻이 아니다. 실 DB 장소 목록·공식 지점 커버리지는 이 감사에서 조회하지 않았다.

| 장소 유형 → environment | 구조상 허용 활동 | 감사 판단 |
|---|---|---|
| beach / sea / marine_beach / coastal_road → marine_beach | swim, surf, relax | 해안도로까지 수영·서핑 환경으로 들어가는 넓은 매핑이다. 장소별 활동 허용·운영·접근 확인 필요. |
| river / valley / lake / riverside / reservoir → inland_water | swim, rafting | 호수·저수지 유형이 래프팅 가능성을 입증하지 않는다. |
| mudflat / tidal_flat → tidal_flat | mudflat | 장소별 공식 체험창과 경로가 추가로 필요. |
| hotspring / pool / waterpark / licensed_facility → licensed_facility | onsen | 풀·워터파크를 온천 연구 대상으로 묶을 근거가 없다. 구조상 swim은 여기서 허용되지 않는다. |
| waterfall 및 그 밖의 유형 → waterside | 위 여섯 활동 모두 미지원 | 풍경 관람 장소가 존재한다고 HCI:Beach relax 대상으로 자동 허용하지 않는다. |

`WaterSpot`의 실제 유형 enum은 `backend/apps/spots/models.py:12–24`에 beach, river, valley, hotspring, pool, waterpark, lake, waterfall, riverside, reservoir, mudflat, coastal_road다. 모델은 나이 정책·실내 여부·악천후 적합·검증 출처를 보존하지만 이 필드 자체가 임상/사용자 연구를 뜻하지 않는다.

swim은 general/family 정체성을 저장한다(`conditions/models.py:491`). 엔진은 family/beginner/family_swim 문자열에 감독·수온 정책을 적용한다(`engine.py:183,345`). 서핑은 unspecified/beginner/intermediate/advanced를 구분하지만 실제 grade detail 허용표는 **`초중급자에게적합` → beginner/intermediate 한 형태뿐**이다(`surf_skill.py:27–33`). `advanced` enum 존재가 advanced 적합도 지원 완료를 뜻하지 않는다. 명시 숙련도, 현재 KHOA 출처, 등급·설명의 시공간/시간 identity 일치가 필요하며 미지정·누락·오해석은 null(`surf_skill.py:44–117`).

## 수식·곡선·가중치 인벤토리

`profiles.py:1–5` 자체가 weights를 engineering choices, 이후 한국 현장 보정이 필요한 값이라고 명시한다. 아래 모든 값은 검증 대상이다. scientific evidence_id가 필요한 후속 연결 대상 규칙에는 `L-` 식별자를 붙였다.

| rule_id | 구현과 위치 | 기존 값 | 저장소의 근거 표시 | 연구 전 판단 |
|---|---|---|---|---|
| L-01 | `profiles.py:48–62` 공식등급 숫자화 | 매우좋음/좋음/보통/나쁨/매우나쁨 → 95/80/60/35/15 | methodology:70–74 표시용 앵커라고 명시 | 순서 보존은 가능. 등간 점수·공식 수치·활동 간 교환 가능한 효용으로 쓰기는 보류. |
| L-02 | `profiles.py:95–113` swim 가중합 | 공식등급 .45, 수온 .15, 기온 .10, 파고 .10, 풍속 .08, 1시간 강수 .05, UV .03, 혼잡 .04 | official_khoa_index, research_informed_engineering_curve, recreation_weather_research, family_swim_engineering_curve, who_uv_guidance, product_preference 문자열 | 인용 문자열만으로 수치 검증 안 됨. KHOA에 이미 포함된 기상요소 재가중 중복 가능성 확인·수정 필요. |
| L-03 | `profiles.py:77–79` 수영 수온 곡선 | (5,0),(14.99,0),(15,10),(16,30),(18,55),(20,75),(23,90),(26,100),(30,100),(31,50),(31.01,0),(36,0) | research_informed_engineering_curve; 원연구·수치 출처 지정 없음 | 일반·가족·장비·노출시간을 통합하는 절대 적합 곡선은 보류. 급격한 0.01°C 구간은 코드 경계 정책이다. |
| L-04 | `profiles.py:80–82` 기온 곡선 °C | (-10,0),(5,10),(15,45),(22,90),(26,100),(31,80),(35,40),(40,0) | recreation_weather_research; 특정 연구/표 매칭 없음 | 해변 방문/육상 쾌적/입수 쾌적 중 무엇을 예측하는지 재정의 필요. |
| L-05 | `profiles.py:86–89` 바람·파고·강수·UV | 아래 상세 좌표 | 일반 연구 또는 제품 곡선; 원표 추적 불가 | 안전기준과 선호 함수 분리; 좌표 전체 보류. |
| L-06 | `profiles.py:114–127` surf | 공식등급 .80, 혼잡 .10, UV .10; coverage≥.80 | KHOA 숙련도별 공식지수 + 제품선호 | 공식결과/숙련도 보존 유지. .80/.10/.10 결합의 경험적 타당성 미확인. |
| L-07 | `hci.py:33–94`, `profiles.py:128–140` relax | HCI=2T+4A+3P+W; 표시용 [0,100] clip·round; 최종 relax=.90 HCI+.10 혼잡 | Rutty2020 지정 | 원지수 재현·시간집계·목표 결과를 별도 검증. 물멍 만족도/정신건강/입수점수로 확대 금지. 혼잡 결합은 원HCI와 다름. |
| L-08 | `profiles.py:141–151` mudflat | 공식등급 .85, 혼잡 .10, UV .05; coverage≥.85 | KHOA 공식지수 + 제품선호 | 공식지수·체험창 보존 유지, 합산 비율·UV 선호는 보류. |
| L-09 | `profiles.py:152–167`, `onsen.py:140–172` onsen | 운영근거 .40, 혼잡선호 .20, 시설요구 .20, 실내대피 .10, 선호수온 .10; coverage≥.70 | 전부 시설/제품/명시적 선호 | 시설 핏과 의료효과 분리 유지. 기온이 낮을수록 온천 선호 증가라는 live factor는 없음. 계수와 tolerance 보류. |
| L-10 | `profiles.py:168–187`, `derived.py:654–676` rafting | 유량핏 .60, 운영준비 .20, 유량변화안정 .10, 보온장비준비 .10; coverage≥.90 | site_specific_hydraulic_thresholds 등 | 지점별 보정 요구 유지. 사다리꼴 모양·60/20/10/10 보편성은 별도 연구 필요. |
| L-11 | `engine.py:584–626,705–743` 합산/판정 | lower=Σw·s; upper=min(100,lower+(1−present_weight)100); 공개점수=floor(lower); confidence=Σw·metric.confidence; confidence≥.80; recommended≥80, consider≥60, caution cap39 | methodology:258–268 제품 판단 | 범위는 통계적 CI가 아닌 결측요인 가능범위. confidence는 보정된 확률이 아님. 표시 경계·하한랭킹은 검증 필요. |

L-05 좌표(단위가 다른 함수를 혼용하면 안 됨):

- `CALM_WIND` m/s: (0,100),(3,100),(6,80),(8.3,55),(10.8,25),(14,0).
- `LIGHT_WAVES` m: (0,100),(.3,95),(.6,75),(.9,40),(1.2,10),(1.5,0).
- `LOW_RAIN` **precipitation_1h_mm**, mm/1시간: (0,100),(.1,80),(1,60),(3,35),(15,0). 강수확률·일강수·지속시간 함수가 아니다.
- `UV_COMFORT` UV index: (0,100),(2,100),(5,80),(7,60),(10,35),(11,25),(15,0). UV 위해의 존재가 이 선호 좌표의 근거는 아니다.
- `CROWD`: low/medium/high/very_high → 100/65/30/10(`profiles.py:64–75`). 모든 이용자가 저혼잡을 같은 비율로 선호한다는 검증 없음.
- 좌표 사이 선형보간, 범위 밖 끝점 상수(`curves.py:28–38`). `COOL_WEATHER_ONSEN`((-15,100),(0,100),(10,90),(20,65),(28,35),(35,10),(40,0))와 `USER_RATING`((1,0),(2,25),(3,50),(4,80),(5,100))은 정의되어 있으나 현재 `PROFILES`에는 사용되지 않는다. 정의만 보고 현행 온천 기온 가중합으로 보고하면 오류다.

L-09 세부: 시설요구 적합=충족 요구 개수/요구 개수. 혼잡핏=1−|요청 target−관측 crowd|. 수온핏=max(0,1−|요청수온−실측수온|/tolerance), 기본 tolerance=5°C(`onsen.py:48,153–171`). 요청 생략 또는 대응 근거 결측이면 metric을 만들지 않고 session-only, 즉시 만료한다. 실내대피는 verified 시설의 indoor && bad_weather_suitable가 둘 다 true일 때 1.0만 생성하며 false 기본값을 근거 있는 0점으로 바꾸지 않는다(`derived.py:384–389`).

L-10 세부: `0≤q_min<q_opt_low≤q_opt_high<q_max`, Q≤q_min 또는 Q≥q_max일 때 0, 중앙 구간 100, 양쪽 선형 증감이다. 단위는 m³/s, 모델은 지점·version·관측소·exact scope·authority·HTTPS 근거·검증시각·active/verified 일치를 요구한다(`conditions/models.py:366–438`, `derived.py:475–531`). 테스트의 q=10/20/30/40 등은 실제 하천 보정계수가 아니다.

## HCI 원표 주장과 실제 입력/시간 처리

원시 HCI component는 다음 코드 구간이다. upper bound는 모두 **미만**이다(`hci.py:33–76`). 아래는 코드 전사이며 원논문 확인값으로 쓰면 안 된다.

- thermal Humidex: <10→−10; <15→−5; <17→0; <18→1; <19→2; <20→3; <21→4; <22→5; <23→6; <26→7; <28→9; <31→10; <33→9; <34→8; <35→7; <36→6; <37→5; <38→4; <39→2; 나머지0.
- cloud %, [0,100] clamp: <1→8; <15→9; <26→10; <36→9; <46→8; <56→7; <66→6; <76→5; <86→4; <96→3; <101→2.
- daily rain mm, 음수0처리: 0→10; (0,3)→9; <6→8; <9→6; <12→4; <25→0; ≥25→−1.
- average wind km/h, 음수0처리: <.6→8; <10→10; <20→9; <30→8; <40→6; <50→3; <70→0; ≥70→−10.
- Humidex=T+(5/9)(e−10), e=6.11·exp[5417.7530·(1/273.16−1/(273.15+Td))](`hci.py:24–30`). RH→Td는 Magnus a=17.625,b=243.04를 사용(`derived.py:573–592`). RH와 기온이 이미 Humidex에 들어가므로 후속 모델에서 세 항을 독립 가중하면 중복정보가 된다.

`docs/water-index-methodology.md:180`은 “논문의 구간표를 그대로 사용”한다고 설명하나, **논문 전체에 대한 검증을 세 테스트 벡터로 대체할 수 없다.** 다음이 코드에 추가·변환되어 있다.

1. `hci.py:94`는 raw를 0–100으로 잘라 반올림한다. 음수 원지수와 제품 표시점수를 구분해서 기록해야 한다.
2. `derived.py:185–224`는 같은 snapshot의 기온·상대습도·SKY·PCP·일강수·풍속을 사용한다. `wind_speed_ms*3.6`은 올바른 단위 변환이지만 **시간 평균의 생성은 아니다**. 단일 기온과 RH를 원연구의 시간 집계와 일치시킨 증거도 아니다.
3. KMA SKY 1/3/4를 50/80/100% 구름 상한으로 바꾼다(`derived.py:595–612`). 범주→상한 대체는 원래 관측값이 아니며 bias·민감도 검증이 필요하다. HCI cloud optimum이 15–25%인 비단조 곡선이므로 “상한을 넣었으니 항상 보수적”이라는 보편 주장도 성립하지 않는다. 다만 현재 범주 0–50%의 상한 50은 해당 범위 대부분보다 낮은 점수를 주는 선택이라는 점과 전체 수학 명제를 구분해야 한다.
4. `kma_adapter.py:49–69`는 RN1→1시간 강수, PCP→문자 범주, POP→강수확률을 분리하고 **daily_precipitation_mm를 생성하지 않는다.** producer는 그 값 없으면 abstain한다(`derived.py:177–183`), 따라서 일강수원 없이 정상 경로가 HCI를 완성했다고 보면 안 된다.
5. `_same_kma_window`는 공통 provider/grid/scope/validity를 확인하지만 집계 방식의 일관성을 검증하는 계약은 없다(`derived.py:679–715`). 테스트는 1시간 유효창에 인위적으로 daily total를 함께 넣어 producer를 통과시킨다(`test_derived.py:249–302,406–417`). 보존·lineage 테스트이지 일별 HCI의 시간대별 타당성 검증이 아니다.
6. daily forecast는 KST **12:00 한 시점**을 평가한다(`daily_forecasts.py:50`, methodology:306–317). 하루 전체 쾌적도, 이용시간창, 아침·저녁 추천을 뜻하지 않는다.

## 입력 단위·집계·신선도

| 소스/metric | 정의·단위·시간 정보 | 보존/한계 |
|---|---|---|
| KMA T1H/TMP, TMN/TMX | 기온 °C, 최저/최고 별도 metric | TMP/T1H를 같은 기온명으로 매핑; issue/valid/grid로 snapshot group(`kma_adapter.py:49–93`). |
| KMA REH, WSD, SKY | RH %, wind m/s, SKY category | HCI와 일반 swim 곡선의 서로 다른 시간 집계 요구 주의. |
| KMA RN1/PCP/POP | 1시간 mm / provider_text 범위 / 확률 % | 서로 치환하지 않는다. 일강수는 이 adapter에서 없음. |
| KMA valid window | 관측70분, 예보1시간 | 공급 시간창을 시계열 관측 집계 길이로 오해 금지(`kma_adapter.py:23–25,114–121`). |
| KHOA beach | 공식등급, optional provider score, 최대파고m, 평균수온°C, 평균기온°C, 최대풍속m/s | `khoa_adapter.py:92–97`; swim scoring이 요구하는 wave_height_m/wind_speed_ms와 maximum 명칭 다름. 최대를 평균으로 바꾸지 않는다. |
| KHOA surf | 공식등급/상세, 평균파고m, 평균파주기s, 평균풍속m/s, 평균수온°C | `khoa_adapter.py:145–151`; 공식 numeric score 보존과 grade anchor 점수화는 별도. |
| KHOA 시간창 | 오전00:00–11:59:59.999999, 오후12:00–23:59:59.999999 KST | 알 수 없는 시간코드는 window 없음(`khoa_adapter.py:459–474`). 전 구간 실제 가능한 시각을 뜻하지 않는다. |
| KHOA 갯벌 | 공식 시작·종료, 날짜·KST | 동일시각 invalid, 밤을 넘으면 종료+1일(`khoa_adapter.py:477–492`). 간조 ±임의시간 대체 없음. |
| KHOA 이안류 | 원지수/원문 category, 관측시각, 파고m·수온°C 등 | 관측20분 freshness. 지점코드·공간·시간 일치 필요. |
| 유량 | river_flow_cms, m³/s, 관측 | 지점별 calibration+15분 신선도; 수위m를 같은 임계값에 대입 불가. |

프로파일의 **관측값 최대나이**(`profiles.py`)는 공식등급12시간, 수온·기온·UV·HCI3시간, 파고·풍속·강수·혼잡1시간, 온천운영/선호수온30분, 온천 amenity/shelter24시간, rafting 요소15분이다. 이 숫자들의 관측오차·운영지연 기반 보정 근거는 확인한 문서에서 없다. 예보는 관측 age 대신 명시적인 provider validity를 쓴다(`domain.py:154–181`). 시간창의 끝은 포함된다.

## 안전·결측·충돌 규칙

안전·적합·confidence 분리, STOP/UNKNOWN 점수 null은 유지할 설계 원칙이다. 구체적 과학·공식 임계의 타당성은 문헌/관할기관 검증과 분리했다.

| rule_id | 규칙과 코드 위치 | 값/적용 | 판단의 지위 |
|---|---|---|---|
| L-12 | `engine.py:289–303` 공식 폐쇄/통제/운영중단 | 하나라도 현재 authoritative block이면 STOP | 운영정보 우선 원칙 유지. |
| L-13 | `engine.py:304–313` 낙뢰 | 마지막 천둥 경과 <30분 STOP; 음수/NaN/해석불가 UNKNOWN | KMA 안내 연결 있음, 실제 machine feed 확보 별도. |
| L-14 | `engine.py:329–343` 이안류 | 0–120 범위; ≥55/경계·위험 STOP; ≥30/주의 CAUTION | KHOA 지수 연구/안내를 원문 검증해야 함. 과거 AUC가 현재 개인 안전확률은 아님. |
| L-15 | `engine.py:344–384` 가족/초급 swimming | 수온<15 또는>31°C STOP, 15≤T<18 CAUTION; 안전요원 없으면 CAUTION; 지정구역/성인 팔길이 감독 불가 STOP | 수온은 methodology:152가 보수적 제품정책이라고 명시. 의학적 보편 임계로 승격 금지. |
| L-16 | `engine.py:385–396` 수질 | fail/closed/unsafe 및 advisory/caution STOP | 적용 활동은 swim/surf/mudflat/rafting. 그러나 **필수 requirements에서 수질을 요구하는 것은 swim**(`148–248`). 다른 접촉활동에서 absent도 게이트를 통과할 수 있는 차이를 재검토해야 함. |
| L-17 | `engine.py:404–418` 갯벌 | 공식창 밖, 안개, route 미확인/폐쇄 STOP | 장소별 공식창·경로 운영자료 유지. 통제확인 불가와 실제 폐쇄는 UI 이유 분리 필요. |
| L-18 | `engine.py:419–433` 온수욕조 | 위생 제한 STOP, 실측수온>40°C STOP; 필수수온/위생 없음 UNKNOWN | WHO/CDC 연결. hot tub의 범위·노출·취약군 조건을 확인해서 onsen 전체와 구분. |
| L-19 | `engine.py:397–403,434–443` 래프팅 | 하천 위험 경계/위험 STOP, 주의 CAUTION; 장비 미비 STOP; 상류강우 주의 이상 STOP | 전국 공통 유량 없음. operator/기관의 승인과 실제 구간 보정이 필요. |
| L-20 | `engine.py:34,44–67,446–517`, `domain.py:154–181` 결측/신선도 | 필수 metric 결측·stale/conflict·confidence<.80·미해석 UNKNOWN, 현재 STOP이 다른 UNKNOWN보다 우선 | 불확실성을 보존하는 설계 유지. .80 자체는 과학적으로 보정된 threshold 아님. |

L-14 추가 의미 검증: `engine.py:336–341`은 원지수 숫자 비교와 문자열 등급코드 `3`/`4`→STOP, `2`→CAUTION을 같은 분기에서 처리한다. `_canonical(3)`도 `"3"`이 되므로 **원지수값 3과 3단계 범주코드를 타입/단위로 구분하지 못하는 경로**가 있다. 원지수의 낮은 숫자를 높은 범주로 읽지 않도록 입력 의미를 보존할 계약·테스트가 필요하다. 이 감사는 수정하지 않았다.

안전 observation 최대나이: 출입/운영/감독/장비/상류강우/하천위험15분, 기상·해양특보/안개10분, 낙뢰5분, 이안류20분, 시설·욕조30분, 지정경로6시간, 수영수온1시간. 수질/위생/체험창은 별도 provider expiry 없으면 current가 아니다. 항상 안전 max-age와 공급 만료 중 더 빠른 값을 사용(예보는 provider window). 단순 collector heartbeat는 이 조건들을 만족한 안전준비 상태가 아니다.

공통 스키마는 snapshot provider_record_id·ingestion_version·source URL·공간·observed/fetched/valid_from/valid_until와 typed scalar·unit·mode·state·confidence를 보존한다(`conditions/models.py:32–155`). 본 감사는 DB를 조회하지 않아 데이터의 실제 완전성·실시간성은 평가하지 않았다.

## 출처가 있는 규칙과 없는 규칙

`docs/water-index-methodology.md`는 다음 링크를 제시한다. **저장소에 링크가 있음을 확인한 목록**이며 본 감사에서 원문 검증한 references가 아니다. 연구 담당자는 검색일·접근상태·원문 주장 단위로 별도 검증해야 한다.

| 문서 위치 | 연결 출처 | 연결한 주장 | 아직 확인해야 할 것 |
|---|---|---|---|
| 27 | WHO 2021 Recreational Water Quality Vol.1, https://www.who.int/publications/i/item/9789240031302 | 위험관리·감시·위험소통 | 실제 권고와 제품 confidence/점수 분리의 관계. |
| 68 | data.go.kr 15142484/15142490/15142489/15156028 | KHOA beach/surf/mudflat/ripCurrent 계약 | 최신 제공 지점·단위·발표시각·범위 및 결측. |
| 146 | Choi & Kim 2026 DOI 10.12652/Ksce.2026.46.1.0061 | 2021–2024 9해변, 대부분 AUC .92–.99와 양의 Brier skill라는 문서 주장 | 논문 실제 표본·평가대상·AUC 범위·경보 단계·외부검증. 현재 감사의 검증 수치 아님. |
| 148 | KMA https://www.weather.go.kr/w/hazard/safety-guide/lightning.do | 마지막 천둥 후30분 | 지침 내용·적용행동·기관 관할. |
| 150 | EPA RWQC2012 https://www.epa.gov/sites/default/files/2015-10/documents/rwqc2012.pdf | 30일 GM/STV와 BAV 구분 | 한국 수질법/운영판정과 직접 등치 금지. |
| 165 | Boqué Ciurana et al.2022, https://www.mdpi.com/2071-1050/14/14/8496 | 보편 서핑 파고 임계 보류 | 결과가 적합 분류인지 선호/행동인지, 지역·숙련도 외삽. |
| 171 | Rutty et al.2020, https://fenix.igot.ulisboa.pt/downloadFile/563078802440222/Rutty%20et%20al_2020.pdf | HCI:Beach component/weights | 원래 개발·표본, 방문량 검증과 물놀이 선택 차이, 단위/집계. |
| 213 | MEIS https://meis.go.kr/mes/mudFlat/experience/view1.do; MOF docSeq34946 | 체험창/갯골 위험 | 공식 지침과 machine feed는 다른 층. |
| 227 | WHO Vol.2 https://iris.who.int/bitstream/10665/43336/1/9241546808_eng.pdf; CDC https://www.cdc.gov/control-legionella/php/toolkit/hot-tub-module.html | 온수욕조40°C·위생 | 시설 운영기준과 개인 입욕 쾌적/효용 구분. |
| 237 | Brown, Taylor & Shelby https://pubs.usgs.gov/publication/70125918; Carolli et al.2017 DOI10.1016/j.scitotenv.2016.11.049 | 유량선호 지점별 차이 | 원자료·정확한 활동·선호측정·보정계수. |
| 251 | KMA https://www.weather.go.kr/w/hazard/safety-guide/heavy-rain.do | 호우·하천안전 | 현장 운항중지 threshold와 별도. |

**출처 없는 수치**: .45/.15 등 모든 혼합 가중치, 등급앵커95/80/60/35/15, 각 piecewise 좌표, 혼잡 점수, UV 선호 점수, 추천80/고려60/주의39, coverage threshold, confidence .80, freshness seconds, 온천 tolerance5°C, 강우·유량 안정도 준비점수의 보편 눈금. 일부 항은 연구를 일반적으로 언급하지만 해당 수치가 특정 원표에서 왔다는 매핑이 없다. 문서:258–268도 주요 값을 미검증 제품 판단으로 인정한다.

## 검증·보정과 테스트 범위

`docs/water-index-methodology.md:293–304`는 운영 전 현장검수, API 지연/쿼터, 지점매핑, 과거 폐쇄·구조·특보 retrospective test, 누락/충돌 주입, UI unknown 회귀, 계절·해변별 calibration/model card가 필요하다고 명시한다. 확인한 코드·문서에서 이런 실제 결과 데이터, 표본 수, holdout 평가, 한국 사용자 만족/선택 보정 보고서는 확인되지 않았다. 존재하지 않는다고 저장소 전체에 대해 단정하지 않으며, 승인된 HydraulicCalibration 모델 존재도 실제 보정행의 존재를 증명하지 않는다.

확인한 테스트는 자동 계약 검증 중심이다. 이번 연구는 실행하지 않았다.

- `conditions/test_water_index.py`: timezone/공간/finite/예보 validity/불변 snapshot, HCI 3개 벡터(100,66,15), 공식 STOP 우선, 이안류30·55 경계, 낙뢰30분, 가족수온14.99/15/18/31.01, 감독/구역/요원, 결측 optional 가중치 재분배 금지, 온천40°C, 갯벌창, rafting 보정 없음.
- `conditions/tests.py`는 테스트 이름·구조 확인: nullable score/프로필·숙련도 identity, typed null, provider idempotence, DB 제약, 최소 provenance, 읽기전용·bounded API, expiry inclusive→UNKNOWN, 미래평가 제외, N+1 검사. 모든 본문을 세부 검토하지는 않았다.
- `ingestion/tests/test_derived.py`는 범주 parser/Magnus/사다리꼴, lineage·만료·scope 불일치, 일강수 결측 abstain, verified 시설/폐쇄/충돌, session factor 비영속, hydraulic station/scope/authority/unit/expiry를 검사한다. 일부 HCI 본문을 상세 확인했다. synthetic fixture는 현실 관측이나 사용자 선호 표본이 아니다.
- `test_khoa_adapter.py`, `test_kma_adapter.py`, `test_fusion.py`, `forecasts/test_daily.py`는 test-name inventory를 확인: 공식지수 출처·시간·지점/코드, 갯벌창 경계, typed forecast, source authority, 충돌·만료, 활동간 official product 오염 금지, 숙련도 exact match, 미래/누락날짜 abstain.
- 테스트는 개발자가 넣은 수식과 경계가 그대로 작동하는지 검증한다. 그것이 수영 쾌적도 예측, 실제 선택 설명, 안전 확률 보정, 활동별 점수의 비교 타당성에 대한 독립 empirical validation은 아니다.

## 우선 후속 결정

1. 유지 후보: 출처·시공간·단위·누락 보존, 공식 운영 통제 우선, 적합/안전/데이터확실성 분리, 활동별 official record identity, 개인 숙련도/session preference 분리, site-specific 유량 근거 요구(L-12,16–20; 일반 설계 근거).
2. 수정 후보: 단순 유형→활동 지원 매핑, HCI 입력 집계·범주 상한·표시 clip·최종 혼잡혼합, KHOA+동일 환경항의 중복반영, confidence를 확률처럼 읽히게 하는 명칭/표시, 수질 필요성의 활동별 불일치(L-02,07,11,16).
3. 보류/폐기 후보: 보편 수영 최적수온26–30°C, 가족15/18/31°C를 검증된 보편 안전선으로 취급, UV/혼잡 선호 좌표, 온천40/20/20/10/10·래프팅60/20/10/10·95/80/60/35/15를 과학적 상수로 사용, daily/noon 결과를 시간대 추천으로 확대, 활동별 0–100을 비교해 “더 좋은 활동” 추천(L-01–11,15).
4. 필요한 검증: 한국 장소·계절을 층화한 현장관측과 별도의 A 쾌적/만족, B 진술선호·의향/실제 입수·서핑선택, C 통제/조건을 수집. 사람·장비·숙련도·노출시간 공변량을 보존하고 장소/사람별 반복측정과 미참여자의 선택가능집합을 기록. 공식지수만, 물리변수만, 둘 결합 모델을 독립 장소·시기 holdout에서 비교하여 중복 가중의 성능·보정·안정성을 검토한다. 개별 지수 단순 평균/공통80점 경계로 활동 간 비교 가능성을 가정하지 않는다.
