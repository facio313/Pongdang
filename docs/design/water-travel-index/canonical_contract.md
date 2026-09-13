# 공통 용어·상태·버전 계약

2026-09-14 작성. **설계 초안이며 현재 서버에서 제공하는 DTO가 아니다.** 모델·API·연동·검증 문서 사이의 이름과 불변조건을 고정한다. 제품 코드 변경 없음. 기존 연구는 `../../research/water-travel-index/`를 읽기 전용으로 참조한다.

## 식별자와 버전

- 문서/응답 계약: `contract_version = water-assessment.v1-draft`.
- 기본 모델 ID: `pongdang-water-assessment`, `model_version = 0.1.0-draft`, 현재 상태 `unimplemented`.
- 규칙 초안: `ruleset_version = safety-support.0.1.0-draft`.
- 파라미터 집합: `parameter_set_version = params.0.1.0-draft`.
- 근거 패키지: `evidence_version = water-evidence.2026-09-14.1`; 연구 파일 SHA-256과 연결한다.
- 실험 후보: `hci-beach-reproduction`, `model_version = 0.1.0-experimental-draft`. 일별 해변 관광 기후 대리지표의 오프라인 재현 후보이며 개별 활동 추천 모델이 아니다. 원표/집계 검수 전 실행 가능한 모델이 아니다.
- `parameter_id`: `PAR_`로 시작하는 대문자 snake_case. `value`는 JSON 값 또는 null. source origin은 `원문직접`, `연구종합`, `설계가정`, `미검증기존` 중 하나다.
- 출시 게이트 ID: `G_SUPPORT`, `G_INPUT_CONTRACT`, `G_PARAMETER_TRACE`, `G_RULE_VERIFICATION`, `G_EXTERNAL_VALIDATION`, `G_FE_RELEASE`, `G_OPERATIONS`. 게이트 상태는 pass/fail/pending/not_applicable; pending은 pass가 아니다.

## 평가 단위와 외곽 필드

평가 하나는 `spot_id × activity × target × model_id × model_version × parameter_set_version × context`다. 같은 원자료 ID와 모델 버전·지식 시점을 lineage로 보존한다.

- 기존 장소 기본키에 맞춰 `spot_id`는 숫자. 타입의 `type`은 장소 분류이고 활동 허용 증거가 아니다.
- `activity`: swim/surf/relax/mudflat/onsen/rafting의 후보 어휘. activity enum 존재는 기능 지원 완료가 아니다.
- `target`: `kind`(instant/interval), `start_at`, `end_at`(instant이면 null), `timezone`(장소의 IANA time zone). ISO8601 offset 필수. 기간은 `[start_at,end_at)`.
- 행의 `as_of`: 저장된 평가에 허용한 자료의 불변 지식 기준시각. envelope의 `as_of`는 조회에서 허용한 지식의 상한이다. 행 as_of가 non-null이면 행 as_of≤envelope as_of여야 하며 두 값이 반드시 같지는 않다. 평가 레코드가 없는 target의 진단 행은 as_of=null이다. 사용 입력이 있는 평가에는 불변 행 as_of가 필수다. `evaluated_at`: 평가 계산 시각 또는 미계산 null. `queried_at`: API 조회시각. 평가 레코드 자체도 envelope cutoff까지 저장·이용 가능했어야 하며, 오래된 row.as_of만으로 나중에 생성된 평가를 과거 조회에 넣지 않는다. 기존 평가의 as_of/evaluated_at/input manifest를 조회시각으로 재작성하지 않는다. 공개 대상의 신선도·선택 정책을 충족하지 못한 저장 평가를 최신 평가로 재포장하지 않는다.
- `mode`: observation/forecast/mixed/none은 **평가에 사용한 입력 구성**. 각 입력의 mode는 기존 observation/forecast만 유지한다. 예보가 끼면 실시간 관측으로 표시하지 않는다.
- `score`: number|null은 `environment.score`의 호환 요약 필드다. 두 값은 항상 같고 추천·안전·전체 효용 점수로 쓰지 않는다. 첫 출시 전 기본값 null.
- `availability`: available/partial/unavailable/unsupported/unknown는 응답자료 가용성 요약이며 기존 raw 테이블 availability의 자동 변환이 아니다. authoritative block을 뜻하지 않는다.
- `assessment_status`: evaluated/not_evaluable/withheld/unsupported/support_unknown/outside_forecast_horizon/model_unimplemented.
- `reason_codes`: 안정된 기계 코드 목록. 한국어 문장·표시 단위는 프론트에서 설명 코드와 숫자로 렌더한다.
- `score`가 숫자인 경우 assessment_status=evaluated. 숫자0도 평가 완료이며 null과 다르다. evaluated의 environment.status=evaluated; null에 임의0/50을 채우지 않는다.
- `assessment_id`: 저장된 불변 평가/평가불가 상태 레코드의 opaque ID, 아직 저장된 결과가 없으면 null. evaluated_at=null이라고 assessment_id=null이 강제되지는 않는다. `input_manifest_id`는 고정된 실제 사용 입력의 manifest ID 또는 미확정 null이며 target manifest만으로 만들어내지 않는다. 현재 raw scores 테이블id를 다른 의미의 문자열로 덮어쓰지 않는다.
- `target_id`: 저장된 target manifest의 불변 opaque ID. 평가 레코드가 아직 없더라도 해당 대상의 안정된 식별자이며 GET에서 ID를 얻기 위해 새 레코드를 생성하지 않는다. 동일 조회 view에서 target_id와 context·model/parameter 버전 조합당 행 하나를 반환한다. 인접 구간의 중복 표시는 이 키로 제거하며 nullable assessment_id 하나로 제거하지 않는다.
- `context`: profile_id, equipment_profile_id, skill_profile_id, exposure_duration_minutes. 허용된 비민감 registry context를 쓰며 미지정은 null. general/family 표시명만으로 나이·감독·장비를 추정하지 않는다.
- 최상위 valid_from/valid_until은 평가의 전체 적용 교집합이며 null 가능. 각 계층의 적용창도 별도로 보존한다.
- 대표 assessment_status 순서: support.unsupported → unsupported; support.unknown → support_unknown; safety.restricted → withheld; 실제 예보범위 밖 → outside_forecast_horizon; safety.unknown/not_assessed → withheld; model.unimplemented → model_unimplemented; 공개 모델/범위 게이트 미통과 → withheld(model_not_released); 필수 환경/문맥/파라미터 불충족 → not_evaluable; 나머지 정상 계산 → evaluated. 다른 계층 사유는 순위에서 밀려도 삭제하지 않는다. contract-fixture-only 오프라인 사례의 가상 계산은 공개 게이트를 통과했다는 뜻이 아니다.

## 독립 계층

### support

`status`: supported/unsupported/unknown. `reason_codes`, `evidence_refs`, `valid_from`, `valid_until`을 가진다. 장소-활동-운영 범위가 확인되어야 supported. 카탈로그 등록/장소 유형/공식 관측소 존재만으로 지원을 만들지 않는다. 미지원과 공식 일시 폐쇄를 구분한다.

### safety

`status`: restricted/unknown/caution/no_known_restriction/not_assessed.

- supported 활동에서 현재 관할·범위·시간이 맞는 금지 근거가 있으면 restricted. 좋은 환경은 이를 상쇄하지 않는다.
- 금지가 없고 필수 확인항목 하나라도 부족/노후/충돌/미구현이면 unknown.
- 금지/필수 결손이 없고 주의 조건이 확인되면 caution.
- no_known_restriction은 **승인된 비어 있지 않은 필수 확인목록을 모두 충족한 범위 안에서 확인된 제한이 없음**만 뜻한다. safe/안전보장/사고확률0이 아니다.
- 지원 평가에서 중단되면 not_assessed. 지원 unknown 상태에서도 독립된 공식 장소 경고는 표시할 수 있으나 활동 안전 평가가 완료된 것은 아니다.
- `required_checks_complete`: boolean, `checked_rule_ids`, `missing_check_ids`, `warnings`, `restrictions`, `valid_from`, `valid_until`, `reason_codes`. known warning은 unknown 상태에서도 잃지 않는다.
- `safety_status` 최상위 요약은 safety.status와 일치한다.

### environment

`status`: evaluated/not_evaluable/withheld/not_applicable/model_unimplemented.

`score`, `score_scale`(index_0_100/null), `score_semantics`, `components`, `reason_codes`, `valid_from`, `valid_until`.

- 점수는 검수된 특정 모델의 규칙상 환경지수다. 만족/참여/안전 확률이 아니다. 활동 간 비교 가능한 척도라고 선언하지 않는다.
- safety restricted/unknown/not_assessed 또는 support≠supported이면 **공개 응답의 score는 null**, environment.status는 withheld 또는 not_applicable. 필수 환경 입력 미충족은 not_evaluable. 현재 모델 미구현은 model_unimplemented.
- 내부 오프라인 진단은 제한과 환경을 별도로 분석할 수 있으나 공개 점수로 승격하지 않는다. 기여도 없는 모델에 기여도 숫자를 만들지 않는다.
- components는 input_refs, parameter_ids, evidence_ids, explanation_codes, contribution(null 가능), contribution_unit(null 가능), direction(positive/negative/neutral/unknown/not_scored)을 가진다. 인과효과나 SHAP로 부르지 않는다.

### preference

`status`: not_modelled/not_evaluable/withheld/evaluated; 현재는 not_modelled. `score:null`, `ranking:null`, `comparison_scope:null`, `reason_codes`. 별도의 한국 공동 선택 검증 전 환경 점수 정렬을 선호 순위로 제공하지 않는다.

### recommendation

`status`: not_supported/unavailable/do_not_proceed/check_required/conditional_information/information_only.

결정 우선순위: support unsupported→not_supported; support unknown→check_required; safety restricted→do_not_proceed; safety unknown/not_assessed→check_required; safety caution→conditional_information; 환경 미평가/모델미구현/범위밖→unavailable; 나머지→information_only. 이는 메시지 라우팅 설계이며 사용자 선호 모델이 아니다.

`message_code`, `reason_codes`, `activity`, `action_codes`, `ranking:null`. 현재 계약에 recommended/best_activity를 넣지 않는다. 메시지는 점수만으로 생성하지 않는다.

### data_quality

`status`: sufficient/partial/insufficient/unknown. `required_total`, `required_usable`, `optional_total`, `optional_usable`, `missing_input_ids`, `stale_input_ids`, `conflicting_input_ids`, `unknown_issue_input_ids`.

숫자는 계층/활동별 승인된 요구목록의 개수이며, 확률 confidence나 가중 평균 품질 점수로 변환하지 않는다. required_total=0 또는 요구목록 미승인 시 sufficient 금지. 계층별 support/safety/environment quality도 별도로 반환한다. 선택 입력 누락에 따라 필수 입력의 가중치를 재분배하지 않는다.

각 개수는 nullable이다. 요구목록 자체를 확정하지 못했으면 required_total/required_usable 등 관련 개수는 null로 두며,0개 요구를 모두 만족한 것으로 만들지 않는다. 계층별 값은 `by_layer.support`, `by_layer.safety`, `by_layer.environment`에 같은 구조로 담는다.

### model

`model_id`, `model_version`, `ruleset_version`, `parameter_set_version`, `evidence_version`, `status`(unimplemented/experimental/candidate/validated/retired), `validation_status`(not_evaluated/internal_only/external_validation_passed), `evidence_level`(direct/indirect/mixed/insufficient), `validated_scope`, `gate_results`.

코드 테스트만으로 validated 승격 금지. validated는 명시한 대상/장소/계절/결과에 한정한다. 근거 수준은 자체 문헌 평가이며 GRADE/공인 인증이 아니다. 최신 자료와 모델 검증 수준은 서로 독립이다.

공개 숫자 점수는 status=validated, validation_status=external_validation_passed, 해당 validated_scope와 모든 적용 출시 게이트를 충족할 때만 허용한다(PAR_PUBLIC_SCORE_RELEASE_POLICY). unimplemented/experimental/candidate/retired는 공개 숫자 점수 불가. 이 조건을 만족해도 지원·안전·입력 조건이 미충족이면 여전히 null이다. 문서용 contract-fixture-only의 오프라인 수치 예시는 이 출시 판정의 실제 통과 사례가 아니다.

## 입력과 시간 의미

- `inputs[]`: `input_id`, 기존 snapshot_id/metric_id/provider/provider_record_id/source_record_id/station_id/name/numeric_value/text_value/boolean_value/unit/mode/state, observed_at/issued_at/fetched_at/valid_from/valid_until, `time_role`, `aggregation`, `spatial_scope`, `mapping_version`, `quality_flags`, `used_by`. 원본 snapshot의 spot_id는 inputs.spot_id, 숫자 station 참조는 snapshot_station_id로 명시한다. 평가 대상 최상위spot_id 또는 metric.station_id의 제공처 문자열코드와 혼동하지 않는다.
- inputs에는 사용한 직접 입력과 사용하지 못한 참조/진단용 원자료를 구분해 실을 수 있다. used_by=[]는 점수/안전 평가에 사용하지 않은 자료이며 품질 사유를 보존한다. 평가 mode는 실제 사용한 관측/예보 구성이고 참조용 forecast가 있어도 사용 입력이 없으면 none이다. 참조값을 기여도나 검증된 모델 입력으로 설명하지 않는다.
- observation의 observed_at는 관측시각. 기존 forecast의 observed_at는 예보 대상 시작시각을 담으므로 time_role=forecast_target_start로 명시한다. 임의로 진짜 관측시각을 만들지 않는다. aggregation.start_at/end_at/method가 미확인이면 null이며 valid window 길이로 추정하지 않는다.
- used_by가 비어 있지 않은 입력은 행 as_of를, 미사용 참조 입력은 envelope as_of를 지식 상한으로 검사한다. issued_at 미제공은 null; fetched_at로 대체 금지. 늦게 들어온 자료는 as_of 이전 평가에 사용할 수 없다. 상호 모순된 제공자 수정본은 최신값이라는 이유만으로 덮어쓰지 않는다.
- 역사 as_of 요청은 불변 assessment/input manifest 또는 동등한 시간 버전 이력이 있을 때만 제공한다. 현재 state 투영/갱신 가능한 장소 메타데이터로 재현할 수 없는 요청은 HTTP422, error_code=history_not_reproducible이다. 현재 값으로 과거 평가를 채우거나200 null 성공과 혼용하지 않는다.
- 관측 age는 해당 평가의 as_of와 관측시각, 예보는 issue freshness(미상 별도)와 대상 구간을 분리한다. 모델별 age/spatial tolerance가 미정이면 그 조건을 평가할 수 없고 unknown을 반환한다.
- 예보 coverage는 실제 제공·보존된 지점/변수/모델별 시간창에서 계산한다. 반일/일 제품을 시간별 독립 예보로 복제하거나 영역 밖 날짜를 채우지 않는다. 운영 통제의 현재 부재로 미래 전체의 제한 없음을 만들지 않는다.
- 파생 평가 valid_until은 **모델의 직접 입력으로 정렬/집계된** 필수 근거·지원·안전·정책의 유효 종료 중 가장 이른 값, valid_from은 시작 중 가장 늦은 값. 시간창 교집합이 비면 평가 불가. 선택 요인이 계산에 사용됐다면 그것도 출력 validity와 lineage를 제한한다.
- 원시 시계열 집계는 별도 승인된 PAR_AGGREGATION_POLICY에 따라 먼저 처리한다. 일집계는 원시 샘플의 관측 구간 coverage와 지식 시점을 검사하며, 하루의 모든 원시 샘플 validity를 동시에 교집합해 일집계를 정의하지 않는다. 집계 방법/충족도/대상 기간/계산 시점과 모든 원시 lineage를 보존한다. 집계로 관측·공식 통제 효력을 미래로 연장할 수 없다. 과거 원시값이 현재 stale이라는 이유로 역사적 사실을 삭제하거나, stale 상태를 현재 사용 가능한 상태로 고쳐 쓰지 않는다. 과거 재현은 고정 manifest로 해당 집계 정책을 검증한다. 현재 집계 정책은 미정이며 HCI를 실행 가능한 것으로 만들지 않는다.
- 수질 시료의 장기대표성, 관측소→장소 매핑, 일별집계의 충분한 관측 coverage 등은 별도 승인된 파라미터가 필요하다.

## API 운영값과 미구현 경계

후보 routes: `/api/data/water-index/assessments`, `/api/data/water-index/support`, `/api/data/water-index/coverage`. 기존 generic datasets를 바꾸지 않는 추가 read-only 투영이다. 런타임 구현·스키마 변경은 이번 단계에서 수행하지 않는다.

- PAR_API_PAGE_SIZE_MAX=100, PAR_API_PAGE_MAX=1000, PAR_API_PAGE_SIZE_DEFAULT=25, PAR_API_PAGE_SIZE_UI=100은 현행 조회 제한을 잇는 설계값이다.
- PAR_API_MAX_WINDOW_DAYS=31은 **조회 부하를 위한 설계 상한**이며 제공 예보가31일이라는 뜻이 아니다. 단일 spot_id와 activity씩 조회한다. 별도의 다장소 배치는 이 초안에서 제공하지 않는다.
- PAR_API_NESTED_ITEMS_MAX=100은 개별 중첩 목록의 부하 제한이다. 초과시422 response_scope_too_large로 범위 축소/미지원 이유를 알리고 필수 lineage나 경고를 조용히 자르지 않는다. 더 작은 요청으로도 표현 불가능한 단일 평가 manifest는 이 버전 API에서 지원하지 않는다.
- 일정한 시간 슬롯 간격을 새로 정하지 않는다. 실제 provider/model target window를 반환하며 빈 날짜 생성 금지.
- assessments query의 from/until은 offset이 포함된 시각이며 `[from,until)` 요청이다. instant는 해당 구간 안의 target만, interval은 요청과 겹치는 **원래 interval 그대로** 반환한다. 공급 interval을 잘라 새 예보처럼 만들지 않으며 요청 구간 전체의 단일 점수 요약은 제공하지 않는다. 부분 겹침과 coverage gap을 표시하고 인접 페이지/요청은 위 target/context/model 키로 중복을 제거한다.
- 모델 선택은 승인된 registry allowlist. 공개 클라이언트가 experimental 모델을 query로 활성화할 수 없다. 오프라인 모델/예시를 서버의 실자료로 제공하지 않는다.
- 예시 JSON은 별도 명세 사례로 명시하며 DB fixture, seed, fallback data로 쓰지 않는다. 숫자 점수 사례가 있으면 `contract-fixture-only` 가상 오프라인 버전의 스키마 설명임을 밝히고, 현재 실행 가능한/검증된 모델의 출력이라고 하지 않는다.
