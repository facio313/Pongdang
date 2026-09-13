# 파라미터 근거 등록부

작성일: 2026-09-14 KST. 파라미터 묶음 `params.0.1.0-draft`. **설계 문서이며 런타임 설정 파일이 아니다.** 기본 모델 `pongdang-water-assessment@0.1.0-draft`는 `unimplemented`이고 자체 점수·선호·순위의 공개 기본값은 null이다. CSV에 값이 존재한다는 사실은 그 값을 제품에 적용했다는 뜻이 아니다.

[공통 계약](canonical_contract.md), [모델 명세](model_spec.md), [API 계약](api_contract.md), [프론트 연동](frontend_integration.md), [검증 계획](validation_plan.md)에서 사용하는 파라미터를 [parameter_evidence.csv](parameter_evidence.csv)에 등록했다. 앞선 [근거표](../../research/water-travel-index/evidence_matrix.csv), [규칙 감사](../../research/water-travel-index/legacy_audit.md), [근거 종합](../../research/water-travel-index/synthesis.md)은 변경하지 않았다. 새로운 문헌 검색·모델 실행·학습·현장 실험·DB 접속은 이 등록 작업에서 수행하지 않았다.

## 1. 행과 필드의 의미

한 행은 독립적으로 승인·보류·폐기할 수 있는 파라미터 또는 불변조건이다. 한 곡선의 모든 좌표, 동일 목적의 등급표·활동별 metric TTL 집합은 구조화한 JSON 한 값으로 보존한다. 긴 배열의 원소를 서로 다른 연구에서 온 독립 효과처럼 세지 않는다. 문헌의 모든 보고 통계량을 파라미터로 복제하지 않으며, 수치 전이가 특히 오해되기 쉬운 후보만 비채택 항목으로 명시했다.

| 필드 | 규약 |
|---|---|
| parameter_id | `PAR_`로 시작하는 유일한 대문자 snake_case. 삭제한 ID를 다른 의미로 재사용하지 않는다. |
| parameter_family / purpose | 값이 필요한 기능과 목적. 모델 계수, 운영 정책, API 부하 제한, 검증 합격선, 기존 코드 기록을 구분한다. |
| value | 엄격한 JSON 값. 숫자·문자열·객체·배열 또는 `null`. JSON 객체의 키는 설명용 구조이며 원코드의 직렬화 DTO라고 주장하지 않는다. 실제 원입력 alias를 전사한 행은 별도로 명시했다. |
| status | 아래의 다섯 상태 중 하나. 연구의 근거 강도와 다른 축이다. |
| unit / scope | 물리량·시간 집계·점수 단위와 활동/장소/대상/장비/노출/결과 범위. 단위가 여러 개인 곡선은 JSON/notes의 x/y 정의를 함께 읽는다. |
| evidence_ids | 기존 근거표의 ID를 세미콜론으로 연결한다. 해당 값의 직접 출처인지, 전이를 반박하거나 범위를 제한한 근거인지는 origin_type·adoption_reason으로 구분한다. 비어 있으면 검증 논문 출처가 없는 설계/코드 항목이다. |
| origin_type | `원문직접`, `연구종합`, `설계가정`, `미검증기존` 중 하나. 출처 유형이며 정식 GRADE나 인증·출시 승인 등급이 아니다. |
| adoption_reason / alternatives | 채택 또는 보류 이유와 가능한 대안. 모든 미정값에 기본 숫자를 채우는 대안은 허용하지 않는다. |
| uncertainty / sensitivity / calibration | 추정·입력·전이의 한계, 후속 민감도 검증과 보정/승인 계획. 아직 실행한 결과가 아니다. |
| model_version | 신규 기본/실험 모델과 파라미터 묶음, 공식 정책 ruleset 또는 기존 코드 commit을 명시한다. |
| release_gate | 공통 계약의 게이트 ID와 현재 상태. 이 문서의 미실행 검증은 모두 pending이다. 기존 코드 행은 비채택 기록이며 게이트 검수만으로 신규 모델로 승격하지 않는다. |
| legacy_rule_ids / source_locator | 기존 L-01–L-20 연결, 실제 코드 파일·행 또는 근거표·명세 절. 범위형 행 번호는 출처 위치 표시이며 전체 파일 확인 주장과 다르다. |
| live_default | 현재 제품에 이 새 등록부를 적용한 런타임 값이 없음을 나타내는 JSON `null`. API 정책 value=100도 신규 평가 endpoint가 구현되어 있다는 뜻은 아니다. |
| notes | 경계 포함/제외, 정의만 되고 미사용인 곡선, 원문값과 코드값, 변환·시험 사례 등 추가 의미를 보존한다. |

CSV는 UTF-8, 단일 헤더, 고정20열, 한 parameter_id당 한 레코드다. 텍스트 셀의 쉼표·따옴표는 CSV quoting을 사용한다. JSON `null`, 빈 evidence_ids, 유효한 숫자0은 다른 뜻이다. 수식은 JSON 안의 설명 문자열로 보존하며 이 CSV를 실행 가능한 코드나 스프레드시트 수식으로 평가하지 않는다.

## 2. 상태와 적용 경계

| status | 행 수 | 현재 의미 |
| adopted_design_constraint | 25 | 명세상의 불변조건 또는 API 운영값으로 채택한 초안. 제품 구현/출시 완료를 뜻하지 않는다. |
| experimental_offline | 4 | HCI 재현 후보의 확인된 부분과 실험 범위. 필수 원표/열지수/집계 검수 미완료로 현재 실행 불가. |
| draft_operational_policy | 3 | 출처 범위를 한정한 운영 규칙 초안. 관할·시설·자료 계약 검수 전 자동 집행하지 않는다. |
| unresolved | 60 | 정의나 수치가 필요한 결정 항목. value=null이며 해당 조건에 의존하는 평가는 보류한다. |
| retired_or_not_adopted | 74 | 기존 코드 또는 잘못된 문헌 전이를 역사·반례로 보존한다. 새 평가에 사용하지 않는다. |

총 166행이다. 이 중 `PAR_LEGACY_` 71행은 기존 구현 값이며, 별도의 문헌 전이 비채택 항목 3행과 함께 비채택 상태다. 숫자가 있는 항목 수를 논문의 수, 독립 표본 수 또는 검증된 계수 수로 세지 않는다.

`PAR_PUBLIC_SCORE_RELEASE_POLICY`는 공개 숫자를 모델 validated, external_validation_passed, 해당 범위의 게이트 승인, 지원 확인, 필수 안전·환경·파라미터 충족에 한정한다. 게이트의 pending은 pass가 아니다. not_applicable은 해당 범위에서 적용하지 않는 명시적 이유와 승인이 필요하며 미구현을 통과시키는 수단이 아니다. experimental/candidate의 숫자는 공개 API query로 활성화할 수 없다. 현재 기본 모델은 미구현이므로 공개 기본 점수는 계속 null이다.

`PAR_SAFETY_NON_COMPENSATION`, `PAR_SAFETY_KNOWLEDGE_ORDER`, `PAR_SAFETY_CHECK_NONEMPTY`는 알려진 제한을 환경 점수가 상쇄하지 못하게 한다. 필수 확인목록이 미승인이거나 비어 있으면 no_known_restriction과 data_quality.sufficient를 만들지 않는다. unknown이어도 확인된 경고는 남긴다. no_known_restriction은 확인한 범위에서 제한이 발견되지 않았다는 의미이며 안전 확률을 제공하지 않는다. `PAR_CROSS_ACTIVITY_COMPARISON`의 공통 효용·순위는 null이다. HC02, HC18, KR01의 방문/진술 연구로 실제 수영 선택이나 활동 간 효용을 검증했다고 할 수 없다.

## 3. HCI:Beach 후보에서 확정된 것과 빠진 것

`hci-beach-reproduction@0.1.0-experimental-draft`는 일별 해변 관광 기후 대리지표의 오프라인 재현 후보다. `PAR_HCI_WEIGHTS`의 `2TC+4A+3P+W`는 HC01 원명세에서 확인한 계수다. 한국 이용자 회귀로 추정한 가중치가 아니다. `PAR_HCI_INPUT_DEFINITIONS`는 일최고기온·평균 RH를 사용하는 Humidex, 구름%, 일강수량mm, 평균풍속km/h를 보존한다. 0–100은 규칙상 지수의 표시 척도이며 만족·참여·사고 확률이 아니다. HC01–HC04, HC10–HC14.

현재 근거표는 원문 Tables3–6의 모든 구간/끝점과 실행용 열지수 방법을 전사·검수 완료한 테이블로 제공하지 않는다. 따라서 다음 일곱 항목은 독립된 `unresolved` 행이다.

- `PAR_HCI_COMPONENT_TABLE_TRANSCRIPTION`: 모든 band/rating과 경계.
- `PAR_HCI_THERMAL_METHOD`: Humidex 방법·상수·입력 범위.
- `PAR_HCI_DAY_BOUNDARY`: 원 재현의 날짜 경계와 시간대.
- `PAR_HCI_DAILY_COVERAGE`: 일최고/평균/누적 집계의 충분한 관측 coverage.
- `PAR_HCI_CLOUD_AGGREGATION`: 구름%의 공급 정의와 시간 집계.
- `PAR_HCI_DISPLAY_TRANSFORM`: raw와 clip/round/표시 변환.
- `PAR_HCI_PARTIAL_DAY_MIXED`: 부분 관측과 남은 예보를 결합하는 별도 후보의 정의.

이 항목을 legacy 표·정오값·SKY 상한·시간 강수 또는 강수확률로 채우지 않는다. 원표 전사 후에는 경계와 경계 양쪽, 입력범위 밖, 음수 원지수와 표시값, 원예제의 재현을 독립 계산해 검수한다. 그 검수가 통과해도 일별 지수 재현만 확인한 것이며 한국 만족/선택·시간대 추천·활동 간 비교를 검증한 것은 아니다. 새 한국 모델에서 원HCI를 바꾸면 별도 model_id와 파라미터 묶음으로 기록한다.

## 4. 한정 운영정책 초안

| parameter_id | 출처에서 확인한 값 | 범위와 보류 사항 |
|---|---|---|
| PAR_POLICY_THUNDER_WAIT | 마지막 천둥 후 최소30분 | SW09의 한국 국민행동요령. 해당 야외 노출·마지막 천둥의 실제 지식·지역 범위가 확인되어야 한다. 낙뢰 감지반경/시각을 천둥 청취와 자동 동일시하지 않는다. 30분 경과는 안전 보증이나 법적 재개 허가가 아니다. |
| PAR_POLICY_HOT_TUB_TEMPERATURE | 물 >40°C 제한 후보; 출처는104°F(40°C) 병기 | SW12의 CDC hot tub/spa 지침. >와 ≥를 구분한다. 실제 시설을 확인해야 하며 한국 모든 온천·일반 수영의 법적 상한으로 전용하지 않는다. 40°C 이하도 전체 안전·선호를 승인하지 않는다. |
| PAR_POLICY_HOT_TUB_MIN_AGE | 5세 미만 hot tub 사용 금지 | SW12. family 라벨로 연령을 추정하지 않는다. 5세 이상 사용을 무조건 승인하지 않으며 한국 시설 적용과 입력 계약은 별도 검토한다. |

세 행의 origin_type은 원문직접이지만 status는 draft_operational_policy다. 출처가 공식이라는 점과 Pongdang에서 집행할 준비가 됐다는 점을 분리한다. SW13의50세 이상은 레지오넬라 감염 취약군 설명이며 수온 감점계수가 아니다(`PAR_NOT_ADOPTED_CDC_50_THERMAL_COEFFICIENT`). 온천의 선호 수온·방온도·입욕/퇴수 쾌적 연구는 별도의 A 결과로 다룬다. AC05–AC07, SW12–SW13.

## 5. 활동별 미정 파라미터

활동 enum은 후보 어휘다. Pongdang의 실제 장소별 제공/허용·자료 확보를 검증한 목록이 아니다. 아래 각 셀은 별도 CSV 행이며 현재 value=null이다. model_spec.md §5의 변수 목록은 승인 전 후보이고 빈 필수 목록을 뜻하지 않는다.

| 활동 | 필수 안전 확인목록 | 입력별 나이/예보 발표 신선도 | 공간 대표성 | 환경 필수 입력 | 결과별 함수/가중치 |
| swim | PAR_SWIM_SAFETY_REQUIRED_CHECKS | PAR_SWIM_DATA_MAX_AGE | PAR_SWIM_SPATIAL_TOLERANCE | PAR_SWIM_ENVIRONMENT_REQUIRED_INPUTS | PAR_SWIM_RESPONSE_FUNCTION |
| surf | PAR_SURF_SAFETY_REQUIRED_CHECKS | PAR_SURF_DATA_MAX_AGE | PAR_SURF_SPATIAL_TOLERANCE | PAR_SURF_ENVIRONMENT_REQUIRED_INPUTS | PAR_SURF_RESPONSE_FUNCTION |
| relax | PAR_RELAX_SAFETY_REQUIRED_CHECKS | PAR_RELAX_DATA_MAX_AGE | PAR_RELAX_SPATIAL_TOLERANCE | PAR_RELAX_ENVIRONMENT_REQUIRED_INPUTS | PAR_RELAX_RESPONSE_FUNCTION |
| mudflat | PAR_MUDFLAT_SAFETY_REQUIRED_CHECKS | PAR_MUDFLAT_DATA_MAX_AGE | PAR_MUDFLAT_SPATIAL_TOLERANCE | PAR_MUDFLAT_ENVIRONMENT_REQUIRED_INPUTS | PAR_MUDFLAT_RESPONSE_FUNCTION |
| onsen | PAR_ONSEN_SAFETY_REQUIRED_CHECKS | PAR_ONSEN_DATA_MAX_AGE | PAR_ONSEN_SPATIAL_TOLERANCE | PAR_ONSEN_ENVIRONMENT_REQUIRED_INPUTS | PAR_ONSEN_RESPONSE_FUNCTION |
| rafting | PAR_RAFTING_SAFETY_REQUIRED_CHECKS | PAR_RAFTING_DATA_MAX_AGE | PAR_RAFTING_SPATIAL_TOLERANCE | PAR_RAFTING_ENVIRONMENT_REQUIRED_INPUTS | PAR_RAFTING_RESPONSE_FUNCTION |

자료 나이는 관측시각의 age와 예보 발표 신선도를 분리한다. worker 주기·수집 성공·legacy TTL을 과학적 허용나이로 채택하지 않는다. 공간 허용은 거리 하나뿐 아니라 수심·조위 기준면·해안 방향·상류/하류·실제 이용구역을 포함할 수 있다. 미정 반경을0 또는 가장 가까운 관측소로 대체하지 않는다. HC01, SW07, SW11, AC03–AC04, AC10–AC11.

추가 미정항목은 수질 시료의 대표성(`PAR_WATER_QUALITY_VALIDITY`), 한국 관할별 미생물 기준(`PAR_KOREA_MICROBIAL_THRESHOLDS`), 현지 유량/수위 관계(`PAR_RAFTING_SITE_HYDRAULICS`), 서핑 브레이크 전이(`PAR_SURF_BREAK_TRANSFER`), 갯벌 실제 귀환 여유(`PAR_MUDFLAT_RETURN_MARGIN`), 대상/장비/노출 범위(`PAR_USER_CONTEXT_VALIDATED_SCOPE`)다. 이 값들을 정하려면 현장 운영자의 구역·기간·기준, 제공자 자료 계약과 원시 센서 대표성, 대상별 A/B/C 결과의 보정이 필요하다. 해외 강의 cfs, 연구 조사조건의 수온, 해변 방문자 수의 풍속 경계는 그대로 이전하지 않는다.

집계와 단위는 각각 `PAR_AGGREGATION_POLICY`, `PAR_INPUT_UNIT_TRANSFORMS`로 관리한다. 원시 표본을 집계할 때 시간 coverage와 대표성을 검수한 recipe로 직접 모델 입력을 만든 뒤, 그 입력과 지원·안전·정책의 적용창을 `PAR_VALIDITY_INTERSECTION`으로 결합한다. 일평균의 모든 원시 표본 순간 유효창을 교집합하는 규칙이 아니다. 원래 값/단위/집계창과 변환 결과/recipe/lineage를 모두 보존한다. 정확한 단위 변환이 최대→평균, 수위→유량 또는 순간→일평균 전환을 허용하지 않는다.

## 6. 기존 L-01–L-20 보존과 비채택

기존값의 기준은 Multtara `main @ b160cf1c07cc0f299f9d83839557a1e987c47be4`와 앞선 [세부 인벤토리](../../research/water-travel-index/working/legacy_inventory.md), [확인 파일 목록](../../research/water-travel-index/working/reviewed_legacy_files.json)이다. 코드의 methodology string은 `engine.py:33`의 `water-index-v1.0.0`임을 국소 재확인했지만 CSV의 model_version 주식별자는 commit이다. 새 모델 버전과 섞지 않는다. legacy source_locator의 축약 파일명은 인벤토리의 `Multtara/backend/services/water_index/`와 해당 ingestion/apps 경로에 연결된다.

`profiles.py:48–75`의 공식 등급과 혼잡 alias를 국소 재확인해 CSV에 전부 보존했다. `fair`와 `moderate`는 별개의 실제 입력 alias이며 `fair_or_moderate`라는 입력 토큰은 없다. 한글/영문 alias가 같은 앵커를 가지는 것은 실제 코드 사실이고, 앵커95/80/60/35/15가 공식 효용 점수라는 뜻은 아니다. 국소 재확인 대상은 profiles.py:1–95, engine/domain/__init__의 version 문자열이며 다른 브랜치나 운영 DB를 읽었다고 주장하지 않는다.

다음 표는 CSV `legacy_rule_ids` 필터의 연결표다. 모든 기존 값은 별도 PAR_LEGACY ID이며, 현대 설계의 유지 원칙이나 공식 정책 초안과 ID를 공유하지 않는다.

| 기존 규칙 | 보존 범위 | 대표 parameter_id / 조회 방법 |
|---|---|---|
| L-01 | 모든 공식등급 alias와95/80/60/35/15 | PAR_LEGACY_OFFICIAL_GRADE_ANCHORS |
| L-02 | swim 전체8항 가중치와 필수군 | PAR_LEGACY_SWIM_WEIGHTS; PAR_LEGACY_REQUIRED_FACTOR_GROUPS |
| L-03 | 수영 수온12좌표와 선형/끝점 보간 | PAR_LEGACY_CURVE_SWIM_WATER_TEMPERATURE |
| L-04 | 기온8좌표 | PAR_LEGACY_CURVE_OUTDOOR_AIR_COMFORT |
| L-05 | 풍속·파고·1h강수·UV·혼잡·user rating 좌표 | PAR_LEGACY_CURVE_CALM_WIND 등; legacy_rule_ids=L-05 |
| L-06 | surf .80/.10/.10와 숙련 parser 범위 | PAR_LEGACY_SURF_WEIGHTS; PAR_LEGACY_SURF_GRADE_SKILL_SCOPE |
| L-07 | HCI 모든 band·열변환·SKY·집계/clip/round·relax .90/.10·정오·시험벡터 | PAR_LEGACY_HCI_*; PAR_LEGACY_RELAX_WEIGHTS; legacy_rule_ids=L-07 |
| L-08 | mudflat .85/.10/.05와 필수군 | PAR_LEGACY_MUDFLAT_WEIGHTS |
| L-09 | onsen .40/.20/.20/.10/.10·session fit·5°C·facility 검증/TTL·미사용곡선 | PAR_LEGACY_ONSEN_*; PAR_LEGACY_CURVE_COOL_WEATHER_ONSEN |
| L-10 | rafting .60/.20/.10/.10·사다리꼴·현장 calibration identity·시험 q | PAR_LEGACY_RAFTING_* |
| L-11 | coverage·confidence·하한/상한·floor·80/60/39·합계 산술허용오차 | PAR_LEGACY_MINIMUM_COVERAGE; PAR_LEGACY_SCORE_*; PAR_LEGACY_RECOMMENDATION_THRESHOLDS; PAR_LEGACY_PROFILE_NUMERIC_CHECKS |
| L-12 | 현재 공식 폐쇄/통제 우선·weather/marine 규칙 | PAR_LEGACY_OFFICIAL_OPERATION_BLOCK; PAR_LEGACY_WEATHER_MARINE_RULES |
| L-13 | <30분과 안전 요구목록 | PAR_LEGACY_LIGHTNING_MINUTES; 별도 신규 PAR_POLICY_THUNDER_WAIT |
| L-14 | 이안류0–120/30/55와 숫자/문자3·4 충돌 | PAR_LEGACY_RIP_INDEX_THRESHOLDS |
| L-15 | 가족 수온15/18/31°C와 감독/구역/요원 규칙 | PAR_LEGACY_FAMILY_WATER_TEMPERATURE; PAR_LEGACY_FAMILY_SUPERVISION_RULES |
| L-16 | 접촉4활동 수질 block과 swim만 필수인 불일치 | PAR_LEGACY_WATER_QUALITY_BLOCK; PAR_LEGACY_SAFETY_REQUIREMENTS |
| L-17 | 갯벌 공식창/안개/경로와 야간·동일시각 경계 | PAR_LEGACY_MUDFLAT_GATES; PAR_LEGACY_MUDFLAT_WINDOW_BOUNDARY |
| L-18 | >40°C·위생 제한 | PAR_LEGACY_HOT_TUB_LIMIT; PAR_LEGACY_HOT_TUB_HYGIENE; 신규 정책 ID 별도 |
| L-19 | 하천/상류강우/장비 위험 규칙 | PAR_LEGACY_RAFTING_HAZARD_GATES |
| L-20 | 활동별 metric age, safety age·.80·expiry·STOP/UNKNOWN 순서 | PAR_LEGACY_*_FACTOR_MAX_AGE; PAR_LEGACY_SAFETY_*; PAR_LEGACY_EXPIRY_RULE |

각 곡선은 배열의 좌표 순서와 경계, x/y 단위를 보존한다. HCI upper band는 코드의 미만 경계이며 원논문 전사 완료값이 아니다. 수영31→31.01°C의 급격한 하락은 코드 경계이고 생리학적 임계 추정이 아니다. `COOL_WEATHER_ONSEN`과 `USER_RATING`은 정의되어 있으나 당시 PROFILES에서 사용되지 않았다는 상태를 보존한다. “추우면 온천 가점”을 현재 실행 규칙으로 만들지 않는다. 시험 HCI100/66/15와 rafting10/20/30/40도 연구 표본·현지 보정값이 아니다.

기존 confidence .80, lower/upper 범위, coverage, 관측 TTL은 통계적 확률·신뢰구간·안전 보장으로 재명명하지 않는다. 새 설계는 데이터 개수·구체 결손과 승인 목록을 표시한다. 기존값의 비교는 후속 독립 오프라인 재구현에서만 고려하며 Multtara module import, DB, Docker 네트워크, 자격증명 의존을 만들지 않는다.

## 7. API 운영값과 검증 합격선

API 운영값은 `PAR_API_PAGE_SIZE_MAX=100`, `PAR_API_PAGE_MAX=1000`, `PAR_API_PAGE_SIZE_DEFAULT=25`, `PAR_API_PAGE_SIZE_UI=100`, `PAR_API_MAX_WINDOW_DAYS=31`, `PAR_API_NESTED_ITEMS_MAX`의 목록당100이다. 중첩 목록을 초과하면422 `response_scope_too_large`이며 근거를 조용히 잘라내지 않는다. 31일은 조회 부하 상한이고 실제 예보가31일 제공된다는 뜻이 아니다. 이 값들의 origin_type은 설계가정이며 논문 근거로 꾸미지 않는다.

다음 검증 파라미터9개는 각각 value=null이다. 활동/결과별 주지표·단위·불확실성·합격선 또는 표본 계획을 사전에 고정하기 위한 항목이며 모든 활동에 같은 숫자를 넣는 칸이 아니다.

- `PAR_VALIDATION_A_ERROR`, `PAR_VALIDATION_B1_CHOICE`, `PAR_VALIDATION_B2_PREDICT`: 열감각/쾌적/만족, 진술선택, 실제 행동 각각의 지표와 기준 대비 성능.
- `PAR_VALIDATION_C_RECALL`, `PAR_VALIDATION_C_LATENCY`: 명시한 운영·위험정보의 누락/오차/unknown과 지연. 개인 사고 확률의 검증과 다르다.
- `PAR_VALIDATION_COVERAGE`, `PAR_VALIDATION_SUBGROUP`, `PAR_VALIDATION_STABILITY`: 전체 요청 분모의 평가 가능률, 사전 하위집단, 입력/경계/누락 민감도.
- `PAR_VALIDATION_N_SAMPLE_PLAN`: pilot의 분산·발생률·반복/군집 상관·탈락과 목표 정밀도에 따른 사람/세션/장소/일/사건 표본 계획.

문헌의 N, 상관계수, R² 또는 기존80/60/39 경계를 합격선으로 복사하지 않는다. 평가셋을 본 뒤 유리한 지표/문턱을 선택하면 새 계획·후보로 기록한다. 상세한 한국 표집, 반복측정, 장소/시즌/시간 holdout, 비교 기준과 실패 분석은 [검증 계획](validation_plan.md) §4–7을 따른다.

## 8. 변경과 검수 기록

2026-09-14 최초 작성: 기존 코드71행, 미채택 문헌 전이3행, 설계 불변조건/API값25행, HCI 확인부분4행, 미정60행, 운영정책 초안3행. 본문/CSV의 ID·상태·원값과 변환·범위·출처를 함께 관리한다. 기존값을 채택하려면 해당 PAR_LEGACY 행을 덮어쓰지 않고 신규 parameter_id와 근거·승인·버전을 추가한다.

스프레드시트 스킬의 과학 연구 지침에 따라 원값/미정값/0, 단위·시기·출처를 구분해 검수했다. 사용자가 지정한 기계 판독 CSV 형식을 유지하며 워크북·서식·차트·Excel 계산 기능은 생성하지 않았다. 이 산출물에는 계산 수식 엔진이 없으므로 Excel 재계산이나 시각 렌더를 검증했다고 하지 않는다. CSV 구조, JSON 파싱, ID 유일성, 상태/origin enum, 근거 ID 존재, L-01–L-20 연결, 로컬 문서 링크를 확인했다. 이는 연구의 독립 이중 검토, 모델 타당성 검증, 제품 테스트 통과를 뜻하지 않는다.

참조한 연구 파일 SHA-256은 다음과 같다. 근거 내용이 바뀌면 evidence_version과 파라미터 연결의 영향도 함께 검토한다.

| 연구 파일 | SHA-256 |
|---|---|
| evidence_matrix.csv | 4c77a9e4fe0cdc809a321fefe75e0b63753c14d63785a83e32ab0bbb448c60c6 |
| legacy_audit.md | a6233fd97dd174bef14c7e4ac8986976aadf9a9b569c4a4306bc98c0459d4191 |
| synthesis.md | 9915e9e655319738cde019ba480a849a5d6ca399d083bb38644e0e180bc0d641 |
