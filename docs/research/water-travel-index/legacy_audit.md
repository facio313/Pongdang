# 기존 물 여행 규칙 감사와 문헌에 따른 판단

감사·검색 종료일: 2026-09-14 KST. 이 문서의 판단은 **설계 검토 결과이며 제품 변경이 아니다**. 수치가 코드에 있거나 테스트를 통과하도록 작성되었다는 사실을 과학적 타당성으로 취급하지 않았다. 논문 근거는 [evidence_matrix.csv](evidence_matrix.csv)의 evidence_id, 서지는 [references.bib](references.bib)의 study_id로 추적한다.

## 1. 실제 확인한 저장소와 지침

| 저장소 | 확인한 로컬 상태 | 범위와 한계 |
|---|---|---|
| facio313/Pongdang | `/Users/cksmacbook/Desktop/Develop/Project/Pongdang`, `feature/api`, `d07cd23279808e74c1998d849c240a48e06d06d2` | 현재 작업 트리 기준. 시작 때 다수의 수정·삭제·미추적 파일이 있었다. HEAD 내용만 읽었다고 간주하지 않는다. 원격 다른 브랜치를 fetch/checkout하지 않았다. |
| facio313/Multtara | `/Users/cksmacbook/Desktop/Develop/Project/Multtara`, `main`, `b160cf1c07cc0f299f9d83839557a1e987c47be4` | 읽기 전용 참고. 전체 Git 상태 명령 완료 때 변경 출력 없음. DB·런타임·Docker·자격증명을 사용하지 않았다. |

Pongdang과 Multtara 루트 AGENTS.md를 먼저 읽었다. 대상 경로의 추가 AGENTS 존재 여부를 확인했고 발견되지 않았다. Multtara의 지침에 따라 `/Users/cksmacbook/.agents/skills/vowline/SKILL.md`도 읽었다. 다른 worktree의 브랜치/커밋 목록을 본 것과 코드를 읽은 것은 구분한다. Multtara `codex`는 같은 HEAD, `cursor`는 `96248d61cf952d86708522008dc1d5fb8a685ae3`로 목록에 나타났지만 해당 worktree 구현은 감사하지 않았다.

시작 상태·기존 파일 SHA-256은 [baseline.json](working/baseline.json), 실제 확인 파일·범위는 [Pongdang 목록](working/reviewed_pongdang_files.json)과 [Multtara 목록](working/reviewed_legacy_files.json)에 기록했다. 환경에 `rg`가 없어 제한된 Python 파일 탐색·텍스트 읽기를 사용했다. 계정 자료·키 파일·실제 DB를 열지 않았다.

## 2. Pongdang의 현재 계약: 여섯 라벨과 여섯 점수 기능은 다르다

[WaterForecastPage.tsx](../../../frontend/src/WaterForecastPage.tsx), [WaterIndexHubPage.tsx](../../../frontend/src/WaterIndexHubPage.tsx)는 실제 수집 자료를 조회하며, 자체 적합도 산출·추천이 아직 구현되지 않았음을 표시한다. 이번 작업 트리에서는 프론트엔드 예시 점수를 모델의 정답으로 사용할 이유가 없다.

[codeNames.ts](../../../frontend/src/codeNames.ts)에 swim, surf, relax, mudflat, onsen, rafting 표시명과 general/family 프로필명이 있다. 이는 **표시 어휘**다. 백엔드의 activity 문자열이나 보존된 score/forecast/calibration 테이블이 여섯 활동의 검증된 지원을 보장하지 않는다. 실 DB의 장소별 지원 목록도 조회하지 않았다. 연구 범위는 이 여섯 후보로 정하되, 실제 운영 활동 지원은 장소·운영자·공식 자료와 별도로 확인해야 한다.

| 확인 대상 | 현재 구현에서 읽은 사실 | 모델 설계에 주는 제약 |
|---|---|---|
| [models.py](../../../backend/app/ingestion/models.py) / 저장 계약 | `SourceBatch`가 출처·지점·관측/예보·단위·시간대·발표시각 미상·명시적 결측을 보존한다. 실패·충돌을 성공 자료로 대체하지 않는 계약이다. | 원자료를 새 모델에 연결할 때도 이 정의를 유지한다. 채집 성공은 점수 정확성 검증이 아니다. |
| [schema.py](../../../backend/app/schema.py), [data_catalog.json](../../../backend/app/data_catalog.json) | standalone `pongdang_data`, additive schema; score 관련 구조는 계산 미구현 상태로 남아 있다. allowlist에 있는 이름과 실제 생산되는 지표를 구분한다. | legacy 계산을 가져오지 않는다. 구조만 존재하는 지표는 unknown이다. |
| [main.py](../../../backend/app/main.py), [data_reader.py](../../../backend/app/data_reader.py) | `/api/data`의 허용된 실자료 읽기, 최대 100행 페이지, 만료 자료 상태·collector heartbeat 구분. | 연구를 이유로 임의 SQL/수입 API/새 점수 endpoint를 만들지 않는다. |
| [weather.py](../../../backend/app/ingestion/weather.py) | KMA 기온 °C, RH %, 풍속 m/s, 1시간 강수 mm, POP %, SKY 코드, 부이 수온·파랑 계열을 별개 지표로 정규화. 범위형 강수 문구는 문구로 남긴다. AWS는 15분/1시간/12시간/일 누적 구분. | POP·강수량·지속시간을 치환하지 않는다. 시간 집계와 지점 대표성을 모델 입력 계약에 명시해야 한다. |
| [marine.py](../../../backend/app/ingestion/marine.py) | KHOA 해수욕/서핑/갯벌 공식 제품의 지수·등급·숙련·체험창을 원자료로 보존. 반일 12시간/날짜 24시간 유효창, 미상 발표시각 null. 최대·평균도 구분. | 반일 제품을 각 시간의 측정·예보로 정밀화할 수 없다. 공식 지수의 순서형 등급에 자체 숫자를 붙인 값은 공식 숫자가 아니다. |
| [water.py](../../../backend/app/ingestion/water.py) | KOEM/NIER 시료·환경 지표와 하천 자료를 처리. 단위 미확인·시간 간격이 긴 측정이 존재할 수 있다. | DO/pH 등으로 병원체 안전을 대신 판정하지 않는다. 수위는 구간별 보정 유량이 아니다. |
| 테스트 | data/ingestion/collection/weather/marine 및 프론트엔드 독립성 관련 테스트 소스를 확인. 원자료 보존·실패·시공간·계약을 확인하는 범위다. | 한국 사용자 선호/안전 예측의 검증 데이터가 아니다. 이번 문헌 연구에서는 실행하지 않았다. |

이는 **어댑터 코드의 수집 가능성**을 읽은 결과다. 실제 현재 운영 커버리지·지연·결측률·API 이용가능 여부는 조회하거나 재검증하지 않았다. 기존 [ingestion.md](../../ingestion.md)를 수집 계약의 별도 문서로 연결하며, 그 내용을 새 점수 명세로 대체하지 않는다.

## 3. 규칙별 최종 판단

`유지`는 명시한 구조/출처 범위에 대한 판단이다. `수정`은 적용 대상·정의·처리 계약을 바꿔야 한다는 뜻이며, 이번 작업에서 코드를 수정했다는 뜻이 아니다. `폐기`는 잘못된 해석·전이 가정을 버리는 것이고, 수치의 역사적 기록은 남긴다. `보류`는 직접 근거를 확보하기 전 운영 점수로 쓰지 않는 것이다.

| 규칙 | 판단 | 근거와 구체적 결정 |
|---|---|---|
| L-01 공식 등급→95/80/60/35/15 | **숫자 효용화 보류** | 순서형 공식 등급과 원출처는 유지. 간격·다른 활동과의 교환비율을 검증한 근거가 없다. 공식 운영정보 목적과 개인 결과를 구분한다. SW08, SW11, HC18, AC02. |
| L-02 swim 가중합 | **수정·계수 보류** | 수온·기온·파랑의 관련성은 검토할 가치가 있지만 .45/.15 등의 효과 추정은 없다. 공식 지수에 포함된 입력을 다시 합칠 경우 중복 반영 검증이 필요하다. SW01–SW06, HC06–HC08, AC12–AC15. |
| L-03 수온26–30°C 100점 및 15/31°C 급변 곡선 | **보편 곡선 보류** | 활동·장비·노출시간에 따라 열감각과 생리반응이 달라진다. 소수 성인 실험으로 일반/가족 점수 좌표를 정할 수 없다. SW01–SW03, SW06. |
| L-04 기온26°C 100점 | **결과 정의 수정·좌표 보류** | 한국 수영장 방문 자료는 집계 B2이고 제주 해변 성인 쾌적은 A다. 어느 것도 모든 입수자의 최적 기온26°C를 검증하지 않았다. HC06, HC09, KR01, AC12. |
| L-05 풍속·파고·강수·UV·혼잡 곡선 | **좌표·가중치 보류** | 낮은 바람·파랑과 해변 방문의 관계를 서핑 수행/선호에 대입할 수 없다. 강수 지속시간/일누적/1시간량/확률 구분이 필요하다. UV 위험을 선호35점으로 바꾸는 원연구는 확보하지 못했다. HC04, HC07, AC01–AC02, AC13–AC15; UV/혼잡 수치 근거 공백. |
| L-06 surf .80/.10/.10 | **공식 숙련 구분 유지·합산 보류** | 파고·주기·풍향·풍속 및 숙련의 관련성을 검토하되 정보 조회 비율은 가중치가 아니다. legacy 파서가 지원하는 한 설명과 advanced 라벨을 구분. AC01–AC02, AC11, SW08. |
| L-07 relax .90HCI+.10혼잡 | **일별 연구 비교 기준만 유지, 시간대 운영 전이 보류** | HCI:Beach의 일 집계·Humidex·구름·강수 정의를 재현하는 비교 실험은 가능하다. 단일 snapshot/SKY 상한/정오 1회/혼잡 혼합은 원지수와 다른 모델이다. HC01–HC05, HC09–HC15, HC17. |
| L-08 mudflat .85/.10/.05 | **공식 체험창 유지·효용 점수 보류** | 조석·복귀 경로·현지 통제의 필요성은 확인했으나 갯벌 만족·참여의 정량 기상함수를 확보하지 못했다. AC08–AC09. |
| L-09 onsen .40/.20/.20/.10/.10, tolerance5°C | **명시적 개인 요구 분리 유지·수치 보류** | 시설 요구는 제품 선호다. 작은 성인 입욕 실험은 방온도·수온·생리/쾌적 분리 근거이며, 이 계수나 노천온천 선호를 보정하지 않는다. AC05–AC07, SW12–SW13. **정의만 된 COOL_WEATHER_ONSEN은 활성 프로필에 없다.** |
| L-10 rafting .60/.20/.10/.10 및 Q 사다리꼴 | **구간별 보정 요구 유지·보편 곡선 보류** | 같은 강의 최적 급류와 가장 안전하다고 평가한 유량도 다르다. 보트·구간·운항조건별 자료가 필요하며 일평균 수위/유량으로 일내 운항을 보장할 수 없다. AC03–AC04, AC10. |
| L-11 lower/upper, confidence .80, 추천80/60/39 | **통계 의미·활동 간 순위 해석 폐기; 표시값 보류** | 결측 가능한 수학 범위는 CI가 아니며 가중 신뢰값은 보정된 확률이 아니다. 서로 다른 활동 점수의 공통 효용척도나 한국 선택 타당성은 확보하지 못했다. HC02, HC10, HC18, AC03–AC04. |
| L-12 공식 폐쇄/통제 우선 | **유지** | 현재 관할·지점·시간이 맞는 통제는 선호 점수와 독립 적용. 공식 안내 SW08–SW10, AC09. 수치 가중으로 상쇄하지 않는다. |
| L-13 마지막 천둥 후30분 | **KMA 지침 범위 유지** | 기상청 원 안내 확인. 특보가 없다는 사실은 낙뢰가 없다는 뜻이 아니다. 실제 현재 낙뢰/천둥 정보의 확보는 별도 과제. SW09. |
| L-14 이안류 원지수/등급·30/55 | **타입 계약 수정·자체 임계 재사용 보류** | 원지수 3을 범주코드3으로 읽을 수 있는 경로를 문서화했다. 한국 영상 판별 성능은 개인 익수확률 검증이 아니다. 단계값은 최신 공식 계약·운영 관할 확인 후 처리한다. SW08, SW11. |
| L-15 가족15/18/31°C | **과학적 보편 안전선 해석 폐기·수치 보류** | legacy도 보수적 제품 정책이라고 썼다. 현재 성인 수영 생리 자료가 아동·고령자를 포함하지 않으며 그 세 경계를 검증하지 않는다. 감독·구역 정책은 별도 공식 근거 확인 대상. SW01–SW03, SW06. |
| L-16 수질 STOP 및 필요자료 | **유지·필수 입력 일관성 수정** | 물접촉 활동의 수질 위험은 독립된 결과다. swim에만 필수 입력을 둔 상태는 다른 활동의 결측 안전 판정과 불일치한다. 강수/과거 평균을 현재 적합 수질로 대체하지 않는다. SW04–SW07. |
| L-17 갯벌 창·안개·경로 | **지역 통제 유지·unknown/폐쇄 구분 수정** | 공식 체험창과 현장 경로를 따르되 간조 전후 고정 시간만으로 안전을 보장하지 않는다. AC08–AC09. |
| L-18 hot tub >40°C | **대상을 좁혀 수정·유지** | CDC 원지침은 hot tub/spa에 해당한다. 일반 해수 수영이나 모든 온천에 대한 법적 상한으로 확대하지 않는다. 40°C 이하도 안전 보증이 아니다. SW12–SW13. WHO2006 원PDF는403으로 확인하지 못했다. |
| L-19 하천·장비·상류 강우 | **현지 운항 통제 유지·범용 점수 보류** | 승인된 구간/운영자 기준 및 실제 일내 수문 자료를 필요조건으로 둔다. 다른 하천의 cfs/m³/s 값을 복제하지 않는다. AC03–AC04, AC10, SW10. |
| L-20 unknown/stale/conflict | **구조 유지·초 단위 임계와 .80은 보류** | 관측·예보·통제 유효성의 차이를 보존한다. 신선도 숫자는 공식 지침이나 생리실험에서 추정된 값이 아니다. 현지 공급 지연·오판 비용 평가가 필요하다. SW07–SW11, AC10; 저장소 계약 목록. |

## 4. 출처 문구와 원출처 검증의 차이

Multtara `docs/water-index-methodology.md`는 HCI:Beach, Somo 서핑 지수, Choi & Kim의 이안류 연구, WHO/CDC/KMA, 하천 유량 문헌 등을 연결한다. 이번에 실제 확인한 원문 범위는 각각 HC01–HC02, AC11, SW11, SW09–SW10, SW12–SW13, AC03–AC04이며, Carolli는 AC10의 초록 범위다. Dolores에 대해서는 별도 원자료 Shelby & Whittaker(1995)를 확인했으며, 저장소가 연결한 Brown, Taylor & Shelby의 모든 원문을 확인했다는 뜻은 아니다. WHO2006은 서지·접근 실패만 기록했다. WHO2021, EPA2012, 연결된 모든 data.go.kr 계약·MEIS 문서까지 원문 확인했다고 주장하지 않는다.

`research_informed_engineering_curve`, `product_preference`, `family_swim_engineering_curve` 같은 문자열은 **출처 유형 표기**일 뿐 해당 수치가 원표에서 추출되었다는 증거가 아니다. 가중치·등급앵커·각 곡선 좌표·혼잡/UV 점수·추천 경계·coverage·confidence·freshness·온천 tolerance는 검증 대상이다.

확인한 테스트·문서에 한국 사용자/장소의 독립 보정 결과를 찾지 못했다. 이것은 확인한 범위의 결론이다. 모델/보정 테이블 존재, 테스트 fixture, HCI 테스트 벡터를 실제 외부 검증 표본으로 계수하지 않았다.

## 5. 정확한 코드 값과 파일 위치

아래 부록은 읽기 전용 코드 전사다. `연구 전 판단` 열은 인벤토리 작성 단계의 표시이며, 최종 문헌 판단은 위 표가 우선한다. 원문 확인 없이 저장소가 인용한 설명은 `저장소의 주장`으로 읽어야 한다.

아래 부록의 `backend/services/…`, `backend/apps/…`, `docs/water-index-methodology.md` 및 축약 파일명은 모두 **Multtara main @ b160cf1c07cc0f299f9d83839557a1e987c47be4의 경로**다. Pongdang의 실행 경로가 아니다.

<!-- CODE_INVENTORY_APPENDIX -->

### 활동·장소·대상자: 실제 구현과 지원 주장 구분

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

### 수식·곡선·가중치 인벤토리

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

### HCI 원표 주장과 실제 입력/시간 처리

원시 HCI component는 다음 코드 구간이다. upper bound는 모두 **미만**이다(`hci.py:33–76`). 아래는 코드 전사이며 원논문 확인값으로 쓰면 안 된다.

- thermal Humidex: <10→−10; <15→−5; <17→0; <18→1; <19→2; <20→3; <21→4; <22→5; <23→6; <26→7; <28→9; <31→10; <33→9; <34→8; <35→7; <36→6; <37→5; <38→4; <39→2; 나머지0.
- cloud %, [0,100] clamp: <1→8; <15→9; <26→10; <36→9; <46→8; <56→7; <66→6; <76→5; <86→4; <96→3; <101→2.
- daily rain mm, 음수0처리: 0→10; (0,3)→9; <6→8; <9→6; <12→4; <25→0; ≥25→−1.
- average wind km/h, 음수0처리: <.6→8; <10→10; <20→9; <30→8; <40→6; <50→3; <70→0; ≥70→−10.
- `Humidex=T+(5/9)(e−10)`, `e=6.11·exp[5417.7530·(1/273.16−1/(273.15+Td))]` (`hci.py:24–30`). RH→Td는 Magnus a=17.625,b=243.04를 사용(`derived.py:573–592`). RH와 기온이 이미 Humidex에 들어가므로 후속 모델에서 세 항을 독립 가중하면 중복정보가 된다.

`docs/water-index-methodology.md:180`은 “논문의 구간표를 그대로 사용”한다고 설명하나, **논문 전체에 대한 검증을 세 테스트 벡터로 대체할 수 없다.** 다음이 코드에 추가·변환되어 있다.

1. `hci.py:94`는 raw를 0–100으로 잘라 반올림한다. 음수 원지수와 제품 표시점수를 구분해서 기록해야 한다.
2. `derived.py:185–224`는 같은 snapshot의 기온·상대습도·SKY·PCP·일강수·풍속을 사용한다. `wind_speed_ms*3.6`은 올바른 단위 변환이지만 **시간 평균의 생성은 아니다**. 단일 기온과 RH를 원연구의 시간 집계와 일치시킨 증거도 아니다.
3. KMA SKY 1/3/4를 50/80/100% 구름 상한으로 바꾼다(`derived.py:595–612`). 범주→상한 대체는 원래 관측값이 아니며 bias·민감도 검증이 필요하다. 현재 KMA 범주를 0–50%, 60–80%, 90–100%로 해석하면 상한 50/80/100%의 HCI cloud score 7/4/2는 각각 범주 내 최저점이다. 현재 범주에 대한 보수적 점수 대체라는 산술적 설명은 성립한다. 다만 정확한 구름 관측값으로 바뀌거나 점추정의 편향·한국 선호 타당성이 검증된 것은 아니다.
4. `kma_adapter.py:49–69`는 RN1→1시간 강수, PCP→문자 범주, POP→강수확률을 분리하고 **daily_precipitation_mm를 생성하지 않는다.** producer는 그 값 없으면 abstain한다(`derived.py:177–183`), 따라서 일강수원 없이 정상 경로가 HCI를 완성했다고 보면 안 된다.
5. `_same_kma_window`는 공통 provider/grid/scope/validity를 확인하지만 집계 방식의 일관성을 검증하는 계약은 없다(`derived.py:679–715`). 테스트는 1시간 유효창에 인위적으로 daily total를 함께 넣어 producer를 통과시킨다(`test_derived.py:249–302,406–417`). 보존·lineage 테스트이지 일별 HCI의 시간대별 타당성 검증이 아니다.
6. daily forecast는 KST **12:00 한 시점**을 평가한다(`daily_forecasts.py:50`, methodology:306–317). 하루 전체 쾌적도, 이용시간창, 아침·저녁 추천을 뜻하지 않는다.

### 입력 단위·집계·신선도

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

### 안전·결측·충돌 규칙

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

### 출처가 있는 규칙과 없는 규칙

`docs/water-index-methodology.md`는 다음 링크를 제시한다. 아래 표는 **저장소 인벤토리 추출 당시의 출처 연결과 검증 질문**이다. 각 링크의 이번 연구 최종 열람 상태·검증 결과는 §4와 evidence_matrix.csv를 따른다. 표의 연결 문구나 수치는 그 자체로 원문 확인 결과가 아니다.

| 문서 위치 | 연결 출처 | 연결한 주장 | 아직 확인해야 할 것 |
|---|---|---|---|
| 27 | WHO 2021 Recreational Water Quality Vol.1, https://www.who.int/publications/i/item/9789240031302 | 위험관리·감시·위험소통 | 실제 권고와 제품 confidence/점수 분리의 관계. |
| 68 | data.go.kr 15142484/15142490/15142489/15156028 | KHOA beach/surf/mudflat/ripCurrent 계약 | 최신 제공 지점·단위·발표시각·범위 및 결측. |
| 146 | Choi & Kim 2026 DOI 10.12652/Ksce.2026.46.1.0061 | 2021–2024 9해변, 대부분 AUC .92–.99와 양의 Brier skill라는 문서 주장 | 논문 실제 표본·평가대상·AUC 범위·경보 단계·외부검증. 저장소의 당시 요약이며 이번 원문 검토 결과는 SW11을 따른다. |
| 148 | KMA https://www.weather.go.kr/w/hazard/safety-guide/lightning.do | 마지막 천둥 후30분 | 지침 내용·적용행동·기관 관할. |
| 150 | EPA RWQC2012 https://www.epa.gov/sites/default/files/2015-10/documents/rwqc2012.pdf | 30일 GM/STV와 BAV 구분 | 한국 수질법/운영판정과 직접 등치 금지. |
| 165 | Boqué Ciurana et al.2022, https://www.mdpi.com/2071-1050/14/14/8496 | 보편 서핑 파고 임계 보류 | 결과가 적합 분류인지 선호/행동인지, 지역·숙련도 외삽. 최종 AC11 참조. |
| 171 | Rutty et al.2020, https://fenix.igot.ulisboa.pt/downloadFile/563078802440222/Rutty%20et%20al_2020.pdf | HCI:Beach component/weights | 원래 개발·표본, 방문량 검증과 물놀이 선택 차이, 단위/집계. 최종 HC01–HC02 참조. |
| 213 | MEIS https://meis.go.kr/mes/mudFlat/experience/view1.do; MOF docSeq34946 | 체험창/갯골 위험 | 공식 지침과 machine feed는 다른 층. |
| 227 | WHO Vol.2 https://iris.who.int/bitstream/10665/43336/1/9241546808_eng.pdf; CDC https://www.cdc.gov/control-legionella/php/toolkit/hot-tub-module.html | 온수욕조40°C·위생 | 시설 운영기준과 개인 입욕 쾌적/효용 구분. |
| 237 | Brown, Taylor & Shelby https://pubs.usgs.gov/publication/70125918; Carolli et al.2017 DOI10.1016/j.scitotenv.2016.11.049 | 유량선호 지점별 차이 | 원자료·정확한 활동·선호측정·보정계수. |
| 251 | KMA https://www.weather.go.kr/w/hazard/safety-guide/heavy-rain.do | 호우·하천안전 | 현장 운항중지 threshold와 별도. |

**출처 없는 수치**: .45/.15 등 모든 혼합 가중치, 등급앵커95/80/60/35/15, 각 piecewise 좌표, 혼잡 점수, UV 선호 점수, 추천80/고려60/주의39, coverage threshold, confidence .80, freshness seconds, 온천 tolerance5°C, 강우·유량 안정도 준비점수의 보편 눈금. 일부 항은 연구를 일반적으로 언급하지만 해당 수치가 특정 원표에서 왔다는 매핑이 없다. 문서:258–268도 주요 값을 미검증 제품 판단으로 인정한다.

### 검증·보정과 테스트 범위

`docs/water-index-methodology.md:293–304`는 운영 전 현장검수, API 지연/쿼터, 지점매핑, 과거 폐쇄·구조·특보 retrospective test, 누락/충돌 주입, UI unknown 회귀, 계절·해변별 calibration/model card가 필요하다고 명시한다. 확인한 코드·문서에서 이런 실제 결과 데이터, 표본 수, holdout 평가, 한국 사용자 만족/선택 보정 보고서는 확인되지 않았다. 존재하지 않는다고 저장소 전체에 대해 단정하지 않으며, 승인된 HydraulicCalibration 모델 존재도 실제 보정행의 존재를 증명하지 않는다.

확인한 테스트는 자동 계약 검증 중심이다. 이번 연구는 실행하지 않았다.

- `conditions/test_water_index.py`: timezone/공간/finite/예보 validity/불변 snapshot, HCI 3개 벡터(100,66,15), 공식 STOP 우선, 이안류30·55 경계, 낙뢰30분, 가족수온14.99/15/18/31.01, 감독/구역/요원, 결측 optional 가중치 재분배 금지, 온천40°C, 갯벌창, rafting 보정 없음.
- `conditions/tests.py`는 테스트 이름·구조 확인: nullable score/프로필·숙련도 identity, typed null, provider idempotence, DB 제약, 최소 provenance, 읽기전용·bounded API, expiry inclusive→UNKNOWN, 미래평가 제외, N+1 검사. 모든 본문을 세부 검토하지는 않았다.
- `ingestion/tests/test_derived.py`는 범주 parser/Magnus/사다리꼴, lineage·만료·scope 불일치, 일강수 결측 abstain, verified 시설/폐쇄/충돌, session factor 비영속, hydraulic station/scope/authority/unit/expiry를 검사한다. 일부 HCI 본문을 상세 확인했다. synthetic fixture는 현실 관측이나 사용자 선호 표본이 아니다.
- `test_khoa_adapter.py`, `test_kma_adapter.py`, `test_fusion.py`, `forecasts/test_daily.py`는 test-name inventory를 확인: 공식지수 출처·시간·지점/코드, 갯벌창 경계, typed forecast, source authority, 충돌·만료, 활동간 official product 오염 금지, 숙련도 exact match, 미래/누락날짜 abstain.
- 테스트는 개발자가 넣은 수식과 경계가 그대로 작동하는지 검증한다. 그것이 수영 쾌적도 예측, 실제 선택 설명, 안전 확률 보정, 활동별 점수의 비교 타당성에 대한 독립 empirical validation은 아니다.

