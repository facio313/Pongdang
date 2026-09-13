# Water Index 읽기 API 계약

상태: **설계안 · 미구현**. 이 문서는 현재 서비스가 아래 제안 route나 평가 DTO를 제공한다고 주장하지 않는다. 제품 코드·DB 스키마·수집기·프론트엔드·배포를 변경하지 않았다. [source_baseline.json](source_baseline.json)의 로컬 작업 트리를 읽어 작성했으며 실제 API·DB 호출은 하지 않았다. 상태·평가 필드의 단일 기준은 [canonical_contract.md](canonical_contract.md), 화면 연결은 [frontend_integration.md](frontend_integration.md), 실행 불가능한 문서 예시는 [api_examples.json](api_examples.json)이다.

## 현재 계약과 제안 계약의 경계

현재 `backend/app/data_reader.py`는 `/api/data/catalog`, `/api/data/summary`, `/api/data/datasets/{key}`의 GET을 제공한다. 마지막 route는 allowlist인 `data_catalog.json`의 전체 허용 열을 `RowsResult` 형태로 반환한다. `page=1..1000`, `page_size=1..100`(API 기본25), bounded 문자열 검색과 허용 열 정렬·필터를 지원한다. DB는 repeatable-read/read-only 트랜잭션으로 조회한다. DB 실패는503이고 없는 dataset은404, 잘못된 정렬·필터·범위는422다. 현재 테스트 파일이 이 동작을 검사하는 것을 읽었으나 이번 단계에서 DB 테스트를 실행하지 않았다.

현재 `scores`와 `forecasts`는 평가 구조가 카탈로그에 존재할 뿐 계산기는 미구현으로 명시되어 있다. 저장 행 존재 여부도 이번에 조회하지 않았다. `summary.forecasts` 건수나 `confidence`, `score`, `availability` 열 이름을 검증된 평가의 증거로 사용하지 않는다. 새 DTO는 기존 공개 열을 삭제하거나 뜻을 바꾸지 않는 별도 읽기 투영이다.

제안 route의 공통 논리 prefix는 `/api/data/water-index/`다. 브라우저의 실제 배포 경로는 기존 base/root 설정에 따라 `/pongdang/api/data/water-index/`이고, 클라이언트는 `requestData(BASE_URL, "water-index/…", signal)` 형태의 상대 경로를 사용한다. `/api/demo`나 `/api/collector`로 fallback하지 않는다. Multtara 모듈·DB·네트워크·자격증명은 사용하지 않는다.

모든 제안 API는 **이미 저장된 자료와 평가 산출물의 bounded 읽기 투영**이다. GET에서 외부 API 호출, 수집 작업 생성, 점수 계산·보정, seed, DB 쓰기를 하지 않는다. 평가 산출물이 없으면 정상적인 제공 불가 상태 또는 빈 조회 결과를 돌려준다. 별도 평가 작업이 준비되지 않은 채 이 문서를 근거로 점수를 만들어 반환하면 계약 위반이다.

## 제안 GET route와 요청

| 논리 route | 반환하는 자료 | 반환하지 않는 기능 |
|---|---|---|
| `/api/data/water-index/assessments` | 고정된 target manifest의 평가 행과 기간 coverage | 즉석 점수 계산, 추천 순위, 새 슬롯 생성 |
| `/api/data/water-index/support` | 같은 장소·활동·대상 기간의 지원 범위와 출처가 고정된 support 투영 | 장소 종류로 추정한 지원, 일시 통제를 영구 미지원으로 바꾼 결과 |
| `/api/data/water-index/coverage` | 보존된 제공처·변수·평가 target manifest에서 확인한 조회 가능 시간창 | 고정 N일 예보 약속, 현재 관측을 연장한 미래 데이터 |

공통 요청은 `spot_id`, `activity`, `from`, `until`, `as_of`, `page`, `page_size`이며 assessments에는 `profile_id`, `mode`를 추가한다. `support`와 `coverage`도 assessments와 같은 문맥을 확인해야 할 때 동일한 등록 프로필·모드를 사용한다. 기본 공개 모델은 서버의 승인 registry가 정한다. 임의 `model_id`, `model_version`, `experimental=true` 등을 받아 오프라인 모델을 켜지 않는다. 모델 버전 선택을 이후 공개한다면 공개 승인 allowlist 내 선택만 허용하며 현재는 이 매개변수를 정의하지 않는다.

| 매개변수 | 타입·필수성·검증 |
|---|---|
| `spot_id` | 단일 양의 정수, 필수. 현재 장소 `id`와 동일하다. CSV식 다중 ID는 허용하지 않는다. |
| `activity` | 필수; swim/surf/relax/mudflat/onsen/rafting의 등록 후보 코드. 알려진 코드가 장소 미지원인 경우 정상 support 응답으로 구분한다. |
| `from`, `until` | offset이 있는 ISO8601, 모두 필수. `[from,until)`, 양의 길이, 최대31×24시간. 달력의31일짜리 예보를 제공한다는 뜻이 아니다. |
| `as_of` | 조회의 지식 cutoff인 offset ISO8601, 선택. 생략하면 요청 시작 때 한 번 고정한 서버 기준시각을 envelope.as_of에 반영한다. 저장된 평가의 row.as_of를 바꾸지 않는다. 미래 시각 거부. 다음 페이지에는 첫 envelope 값을 반드시 재사용한다. |
| `profile_id` | assessments 필수, 승인 registry 식별자. 임의 건강 정보/아동·성인 속성을 query로 추정하지 않는다. 프로필 자체가 미등록이면422, 등록 프로필이 모델 적용 범위 밖이면 정상 null 평가와 이유를 반환한다. |
| `mode` | assessments 필수; observation/forecast. 조회 의도이며 출력 `mode`의 observation/forecast/mixed/none과 구별한다. mixed 입력 허용 여부는 승인 모델의 입력 계약에 따른다. |
| `page` |1..1000, 기본1. `PAR_API_PAGE_MAX`에 대응한다.|
| `page_size` |1..100, 기본25. `PAR_API_PAGE_SIZE_MAX`, `PAR_API_PAGE_SIZE_DEFAULT`; 현재 UI 기본100은 `PAR_API_PAGE_SIZE_UI`다.|

31일 제한은 `PAR_API_MAX_WINDOW_DAYS`의 API 부하 설계값이다. 실제 target 간격·예보 horizon·자료 age 기준은 이 수치에서 파생하지 않는다. 31일 범위를 timezone 변화와 무관하게 UTC 경과시간으로 검사한다. 미정의 query, 무제한 전체 조회, 자유 SQL·JSON 필터·임의 정렬은422로 거부한다.

`PAR_API_NESTED_ITEMS_MAX=100`은 중첩 목록별 부하 상한이다. inputs, components, 경고/통제, support evidence refs, coverage의 시간창/결손 target 등 모든 응답 목록에도 적용한다. 목록을100개로 자르거나 불완전한 목록을 complete처럼 반환하지 않는다. 상한을 넘는 응답은 HTTP422, `error_code=response_scope_too_large`로 거부하고 조회 기간/페이지 크기를 줄이도록 안내한다. 한 target 자체가 상한을 넘으면 더 작게 조회해도 해결되지 않을 수 있으므로 서버 모델/manifest 설계를 수정하기 전 해당 투영을 공개하지 않는다. 이 값도 과학적 임계값이 아니다.

한 평가는 provider/model에 이미 정의되어 보존된 `target`에 대응한다. `target_id`는 해당 장소·활동·대상 창을 식별하는 불변 target manifest의 문자열 키다. instant target은 `from <= start_at < until`이면 선택한다. interval target은 요청과 겹치는 경우 선택하되 **원래 start/end를 자르거나 집계값을 재비례하지 않는다**. 순서는 `target.start_at ASC`, `target.end_at ASC`(null 우선), `target_id ASC`, 고정된 모델/문맥 식별 튜플 순으로 결정한다. 필터 전에 manifest의 안정적인 순서키가 있어야 한다.

응답은 `target_id × model.model_id × model.model_version × model.parameter_set_version × context`당 한 행이다. context 비교는 registry의 고정 식별자·값 전체를 사용한다. 같은 키에 여러 저장 평가 revision이 있으면 아래 조회 cutoff와 승인된 selection policy에 맞는 하나만 선택한다. 인접한 조회 구간에 걸친 긴 interval은 두 조회에 모두 나타날 수 있으므로 이 튜플로 중복을 제거한다. **assessment_id가null인 행도 target_id로 안정적으로 식별**한다. 같은 응답 내부와 같은 manifest 페이지 사이에는 중복 행을 만들지 않는다. GET에서 assessment_id를 만들기 위한 평가·상태 행 삽입이나 target_id의 즉석 생성은 하지 않는다.

## 응답 envelope와 행

제안 세 route는 `contract_version`, `as_of`, `queried_at`, `query`, `coverage`, `rows`, `total`, `page`, `page_size`의 envelope를 사용한다. 기존 `RowsResult`와 shape가 다르며 `dataset`을 임의로 붙여 기존 표 타입에 위장하지 않는다. `total`은 고정된 manifest에서 선택한 행 수로 예측된 이용객 수·자료 수집 성공 건수가 아니다. 요청 페이지에 행이 없으면 빈 `rows`를 반환한다. 수집된 모든 지표를 매번 포함한 무제한 응답 대신 평가에 연결된 bounded manifest 입력만 반환한다.

`query`는 검증·정규화한 `spot_id`, `activity`, `profile_id`(해당 없음 null), `mode`(해당 없음 null), `from`, `until`이다. `coverage`는 다음 필드를 갖는다.

- `status`: available/partial/unavailable/unknown. 과학적 검증 상태가 아니라 이 요청에 대한 시간창 정보를 읽을 수 있는 정도다.
- `supported_windows`: `start_at`, `end_at`의 반개구간 목록. **자료 target의 시간 coverage**이며 활동 운영 지원을 뜻하는 support 계층과 다르다. 보존된 provider/model의 target manifest로 확인한 기간만 넣는다. 여러 disjoint 기간은 하나의 최소/최대 기간으로 메우지 않는다.
- `uncovered_windows`: 요청 중 지원 범위 밖인 구간. 지원 범위를 알 수 없으면 임의 계산하지 않고 빈 목록과 unknown 사유를 쓴다.
- `missing_targets`: 자료 지원 manifest에는 있지만 평가/필수 입력이 없는 target 목록. 각 항목은 불변 `target_id`와 원래 target의 kind/start_at/end_at/timezone을 보존한다. 해당 target은 assessments의 정상 null 행으로도 반환한다.
- `reason_codes`: 예를 들어 `outside_forecast_horizon`, `target_manifest_unavailable`, `input_missing`. 코드별 의미와 사용자 문구는 아래와 canonical 계약에 따른다.

자료 지원 기간 **내부**에서 manifest가 기대한 target의 자료가 없으면 행을 숨기지 않고 점수null과 결손 사유를 명시한다. 지원·안전·모델의 선행 조건이 모두 충족됐을 때는 `assessment_status=not_evaluable`이며, 안전 미확인 등 더 높은 우선순위의 상태가 있으면 그것을 보존한다. 이는 수치 예시나 새로운 시간 슬롯을 생성하는 일이 아니라 이미 보존된 target의 결손 상태를 읽는 투영이다. target manifest 자체가 없으면 `rows=[]`, `coverage.status=unknown`, `target_manifest_unavailable`을 반환한다. 마지막 행을 복제하거나 매시/매일 간격의 날짜를 생성하지 않는다.

범위 전체가 확인된 forecast horizon 밖이면 `rows=[]`, `coverage.status=unavailable`, `outside_forecast_horizon`과 실제 `supported_windows`/`uncovered_windows`를 반환한다. 일부만 밖이면 안쪽 target만 반환하고 밖 부분을 coverage로 알린다. 미리 저장된 평가 행 자체가 범위 밖 판정을 가진 경우에는 canonical의 `assessment_status=outside_forecast_horizon`을 보존할 수 있으나 API가 범위 밖 날짜별 가짜 평가 행을 생성하지 않는다.

assessments 행은 canonical 계약의 다음 필드를 모두 명시한다. null 가능 필드도 생략하여0/빈 값과 혼동시키지 않는다.

| 필드 | 계약 |
|---|---|
| `target_id` | 불변 target manifest의 필수 문자열 키. 저장된 평가가 없어서 assessment_id가null이어도 유지한다. 매 요청마다 새 ID를 만들지 않는다. |
| `assessment_id`, `input_manifest_id` | 저장된 불변 평가/평가불가 상태 행과 사용 입력 manifest 식별자. 저장된 결과가 없으면null. evaluated_at=null이어도 보존된 상태 행 ID는 존재할 수 있다. 고정 target manifest만 있고 식별된 사용 입력이 없으면 input_manifest_id는null이다. 기존 raw score의 `id`와 자동으로 동일시하지 않는다. |
| `spot_id`, `activity`, `context` | 평가 대상과 registry 프로필. context의 프로필·장비·숙련·노출 기간은 확인된 값 또는 명시null이다. |
| `target` | `kind`, `start_at`, `end_at`, `timezone`. 관측/예보 원자료 집계창과 동일하다고 가정하지 않는다. |
| `as_of`, `evaluated_at`, `queried_at`, `valid_from`, `valid_until` | 행 as_of는 **저장된 평가의 불변 지식 cutoff**이며 non-null일 때 envelope.as_of 이하이다. 평가 레코드가 없으면 행 as_of와 evaluated_at은null이다. evaluated_at과 사용 input manifest를 읽기 시각으로 고치지 않는다. queried_at은 이번 조회 시각이며 계산 시각을 대체하지 않는다. 평가 유효 기간은 별도다. |
| `mode`, `availability`, `assessment_status`, `reason_codes` | 입력 구성·자료 가용성·평가 상태를 분리한 canonical enum. |
| `score`, `safety_status` | 각각 environment.score, safety.status와 정확히 일치하는 호환 요약. null을 다른 층의 점수로 채우지 않는다. |
| `support`, `safety`, `environment`, `preference`, `recommendation` | canonical 독립 계층. 공식 통제와 support 미지원은 다른 상태다. preference와 recommendation의 ranking은현재null. |
| `data_quality`, `model` | 승인 요구목록의 계수·결손 목록과 모델 상태·검증 범위·게이트. 요구목록 미승인·미상일 때 required_total/required_usable/optional_total/optional_usable은null이다. 0개 확인 완료로 바꾸지 않는다. 별도의 확률 confidence로 환산하지 않는다. |
| `inputs` | 실제 사용 입력 manifest 및 별도로 식별된 참고/제외 진단 자료의 원자료 식별자·원값·단위·시간역할·집계창·공간 매핑·사용 계층. used_by가빈 목록이면 사용 입력이 아니다. |

support route의 행은 `target_id`, `spot_id`, `activity`, `target`, `support`로 제한한다. **support route의 target_id는 지원 레코드 출처·유효 기간을 식별하는 별도 불변 키**이고, target은 그 레코드가 적용되는 원래 기간이다. assessments의 평가 target_id와 같다고 가정하거나 두 ID를 직접 join하지 않는다. 지원 근거를 평가 시간 슬롯으로 복제하지 않고, 관계는 평가 manifest에 검증되어 보존된 support.evidence_refs와 기간 범위로 확인한다. coverage route는 같은 envelope의 `coverage`로 기간을 설명하고 `rows=[]`, `total=0`이다. 어느 route도 세부 평가를 읽지 않았는데 `safety=no_known_restriction`을 합성하지 않는다.

## 상태 불변조건과 사유 코드

정상 응답의 `score:null`은 흔한 기본 상태다. 공개 모델은 현재 `unimplemented`이며 첫 출시 전에 숫자 점수를 보장하지 않는다. 지원/안전 게이트가 미완료이거나 제한이 있으면 해당 계층이 우선한다. 실행되지 않은 모델의 빈 응답을 `evaluated`로 바꾸지 않는다.

`assessment_status`의 우선순위는 `unsupported` → `support_unknown` → safety restricted에 따른 `withheld` → `outside_forecast_horizon` → safety unknown/not_assessed에 따른 `withheld` → `model_unimplemented` → 공개 모델 출시 게이트 미통과의 `withheld`(`model_not_released`) → 환경 입력·문맥·파라미터 미충족의 `not_evaluable` → `evaluated`다. 환경값이나 낮은 우선순위의 사유가 safety/recommendation의 알려진 제한·경고를 제거하지 않는다. 점수가null이고 validity도null인 unknown 응답은 정상이다. 계층별 사유를 버려 최상위 사유 하나만 남기지 않는다.

| 사유 코드 | 의미 | 기본 응답 위치 |
|---|---|---|
| `model_unimplemented` | 저장·검증된 실행 모델 없음 | assessment/environment/model |
| `activity_unsupported` | 알려진 장소가 알려진 활동을 지원하지 않는 근거 있음 | support/assessment |
| `activity_support_unknown` | 장소 활동 지원 근거 부족 | support/assessment |
| `official_restriction` | 관할·장소·활동·유효 기간이 맞는 공식 제한 | safety/recommendation |
| `required_safety_check_missing` | 필수 안전 확인이 누락됨 | safety/data_quality |
| `input_missing`, `input_stale`, `input_conflict`, `issue_time_unknown` | 승인 입력 계약에 따라 이용할 수 없는 이유 | inputs/data_quality/environment |
| `input_unit_unknown` | 입력의 물리량·단위 정의가 확정되지 않음 | inputs/environment |
| `input_aggregation_unknown` | 순간·평균·누적 등 집계 방식 또는 집계창 미상 | inputs/environment |
| `station_mapping_unverified` | 관측소와 평가 장소의 공간 연결이 검증되지 않음 | inputs/environment |
| `context_missing` | 해당 모델에 필요한 프로필·장비·숙련·노출 문맥 부족 | assessment/environment |
| `parameter_unresolved` | 사용할 곡선·임계·가중치 등의 승인 파라미터 미정 | assessment/environment/model |
| `model_outside_validated_scope` | 요청 장소·활동·계절·대상 결과 등이 모델의 검증 범위 밖 | assessment/environment/model |
| `cross_activity_comparison_unvalidated` | 활동 간 비교할 공통 결과·척도가 검증되지 않음 | preference/recommendation |
| `outside_forecast_horizon` | 확인된 예보 지원 시간창 밖 | coverage, 보존된 판정이 있을 때assessment |
| `target_manifest_unavailable` | 기대 target 범위 자체를 재현할 manifest 없음 | coverage |
| `profile_outside_scope` | 등록 프로필이 승인 모델 범위를 벗어남 | assessment/environment |
| `model_not_released` | 모델 상태·외부 검증·해당 범위 출시 게이트가 공개 숫자 조건을 충족하지 못함 | assessment/environment/model |
| `preference_not_modelled` | 별도 선택/선호 모델 없음 | preference |
| `experimental_index_only` | 공개 서비스 모델이 아닌 문서용 오프라인 실험 지수 설명 | 문서 예시 environment/model; 공개 요청으로 활성화 불가 |
| `history_not_reproducible` | 해당 as_of의 평가·입력·지원/통제 이력을 재현할 수 없음 | HTTP422 error_code |
| `response_scope_too_large` | page 또는 중첩 목록을 허용 상한 이내로 반환할 수 없음 | HTTP422 error_code |

`no_known_restriction`은 승인된 비어 있지 않은 필수 점검 목록을 전부 충족한 범위 내에서만 가능하다. 요구목록 미승인·0개이면 unknown이다. `safety`가 restricted/unknown/not_assessed이거나 support가 supported가 아니면 공개 숫자 점수는null이다. 학술 지수 재현을 위한 내부 오프라인 수치는 공개 DTO와 다른 사용 조건이며, 문서 예시의 숫자를 현재 실행 가능한 출력이라고 표현하지 않는다. `contract-fixture-only` 실험 숫자 사례는 **공개 endpoint가 반환하면 계약 위반**이며 공개 UI는 차단해야 한다. 정상 공개200 응답으로 수용할 수 있다는 뜻이 아니다. 예시 파일의 `offline_only=true`는 HTTP 모양만 설명하는 별도 문서 사례를 구분한다.

공개 숫자 점수는 이 조건들에 더해 `model.status=validated`, `validation_status=external_validation_passed`, 해당 장소·프로필·기간·결과 범위의 출시 게이트 통과를 모두 요구한다. experimental뿐 아니라 candidate도 공개 숫자 점수를 제공하지 않는다. 공개 registry 승인이 없으면 query로 활성화할 수 없으며, 공개 투영이 허용된 상태 설명에는 점수null과 `model_not_released`를 둔다. environment는withheld다. 현재 index_0_100은 규칙 기반 환경지수에만 해당한다. 향후 만족도·활동 선택 예측값은 다른 결과 정의·척도·검증·DTO 버전을 설계해야 하며 이 필드의 의미를 바꾸지 않는다.

## 원본 필드 보존과 투영

| 현재 원천 | 공개 보존 필드 | 의미와 추가 투영의 조건 |
|---|---|---|
| `spots` | `id`, 이름·유형·좌표·카탈로그 검증 필드 | `id`가 장소 참조인 `spot_id`와 연결된다. 관측소도 장소 공통 참조를 가진다. `type` 또는 `catalog_verification=source_record`는 활동 지원을 증명하지 않는다. |
| `snapshots` | `id`, `spot_id`, `provider`, `source_record_id`, `provider_record_id`, `station_id`, `observed_at`, `issued_at`, `fetched_at`, `valid_from`, `valid_until`, `spatial_scope`, `ingestion_version` | 현재 SourceBatch 저장에서 `provider_record_id`는 reading digest이고 실제 제공처 식별자는 `source_record_id`에 저장된다. 기존 이름을 반대로 해석하지 않는다. `issued_at=null`은 발표 시각 미상이다. |
| `metrics` | `id`, `snapshot_id`, `name`, `numeric_value`, `text_value`, `boolean_value`, `unit`, `mode`, `state`, `source`, `observed_at`, `fetched_at`, `valid_until`, `station_id`, `spatial_scope` | `mode`는 observation/forecast다. 숫자·문자 원값은 서로 대체하지 않는다. `state=missing` 및 null을0으로 바꾸지 않는다. metric의 `station_id`는 제공처 문자열 코드이고 snapshot의 동명 필드는 내부 숫자 참조이므로 타입을 보존한다. |
| `weather-warnings` | `id`, `provider`, `source_id`, `issued_at`, `effective_at`, `ended_at`, `status`, `fetched_at`, 지역·제목·종류 | `bulletin`은 현재 active 통제가 아니다. 단순 제목/지역 문자열 일치만으로 장소·활동 통제를 확정하지 않는다. 미래 투영에는 공식 정보의 적용 범위와 유효성 검증이 별도로 필요하다. |
| `scores`, `forecasts` | 기존 `id`, `spot_id`, `activity`, `participant_profile`, `score`, `confidence`, 평가·대상·유효 시각 등 | 기존 행을 새 방법으로 자동 승격하지 않는다. 새 평가의 상태·입력 manifest·방법 버전·결과변수·적용 범위가 완전할 때만 별도 DTO와 연결한다. |

원본 `observed_at`은 예보 metric에서는 예보 대상 시각으로 사용되고 있다. DTO의 의미상 `target_at`을 추가하더라도 원래 필드를 삭제하거나 실제 관측이었다고 라벨링하지 않는다. 기간 평균·누적·순간값은 입력 계약의 원본 집계 방식으로 구분한다. 변환이 필요하면 원값·변환값·변환식/버전·단위를 함께 보존한다. 강수확률을 강수량으로, 일 누적량을 매시 강수량으로, 유의파고를 최대파고로 조용히 바꾸지 않는다.

입력 투영의 `metric_id`는 기존 metrics.id, `snapshot_id`는 snapshots.id의 명시적인 참조 이름이다. `inputs[].spot_id`는 **원본 snapshot의 장소 ID**이며 평가 대상 최상위 spot_id와 다를 수 있다. `snapshot_station_id`는 원본 snapshot의 내부 숫자 station_id, 입력의 `station_id`는 원본 metric의 제공처 문자열 관측소 코드다. 기존 raw row의 필드명·타입·ID를 변경하지 않는다. `boolean_value`는 boolean|null로 함께 보존한다. 관측소→장소 변환은 mapping_version이 설명해야 하고 ID가 다르다는 이유로 잘못된 자료라거나 같다는 이유로 대표성이 입증됐다고 추정하지 않는다.

`inputs[].used_by=[]`는 참고·제외 진단 자료다. 데이터가 응답에 보인다는 이유만으로 평가에 사용됐다고 보지 않는다. 사용 입력은 불변 row.as_of가 있어야 하며 그 cutoff로 검증한다. 참고 전용 자료는 envelope.as_of까지 읽을 수 있지만, row.as_of 이후 자료라면 과거 평가의 입력이었던 것처럼 설명하거나 그 평가를 개선하는 데 사용하지 않는다. `used_by`가 비어 있지 않은 입력의 mode 구성만으로 최상위 mode를 결정한다. 예를 들어 사용되지 않은 원본 forecast 지표만 참고로 있고 어떤 입력도 평가에 사용하지 않았다면 `mode=none`이다. 이때 숫자 점수와 입력 기여도를 만들지 않는다. 필요한 quality_flags와 사유는 남기되 제외된 자료의 유효 종료가 계산된 출력의 validity를 제한하는 입력인 것처럼 취급하지 않는다.

현재의 `valid_until`은 provider/adapter가 보존한 자료 유효성 필드다. 별도의 자료 신선도 정책이나 모델 적용 가능 기간을 자동으로 증명하지 않는다. 공개 `confidence` 열도 검증된 사건 확률·정식 근거 평가·수질 안전 확률이 아니다.

모델에 직접 넣는 검수된 집계 입력과 그 입력을 만든 시간별 원자료 lineage를 구분한다. 예를 들어 일 집계가 필요한 모델에서는 요구된 원자료의 temporal coverage·집계법을 검수해 일 집계 입력을 먼저 고정한다. 서로 다른 시간의 원자료 유효창을 모두 직접 교집합해 일 집계가 항상 불가능해지는 규칙으로 만들지 않는다. 평가 applicability의 교집합은 직접 모델 입력·지원·안전·모델 정책을 대상으로 하고, 원자료의 집계 충분성과 이용 가능 이력은 따로 보존한다. 현재 generic 데이터 API가 조회 시각에 표시하는 stale은 역사적 as_of에서의 입력 사용 가능성과 별개다.

## 시각과 as_of의 의미

모든 입출력 시각은 timezone offset이 있는 ISO8601 문자열이다. 서버 비교는 UTC instant로 하고 한국 화면의 표시만 KST로 변환한다. 관측/예보 대상 시각, 발표 시각, 수집 시각, 평가 생성 시각, 응답 조회 시각을 분리한다. 클라이언트 시계를 이용해 제공처 발표 시각을 채우지 않는다.

요청의 `as_of` 매개변수와 **envelope.as_of는 읽기의 지식 cutoff**다. 재현을 위해 첫 응답의 envelope 값을 다음 페이지 요청에 그대로 전달한다. 각 **row.as_of는 저장된 평가의 불변 지식 cutoff**이고, non-null일 때 `row.as_of <= envelope.as_of <= queried_at`이다. 두 as_of를 같게 만들기 위해 기존 행의 시각이나 input manifest를 재작성하지 않는다. 평가 레코드가 없는 고정 target의 결손 행은 `assessment_id=null`, `row.as_of=null`, `evaluated_at=null`이며 target_id로 식별한다. 과거 cutoff를 모르는 레코드에 조회 cutoff를 채워 넣지 않는다.

선택할 평가 레코드 자체도 envelope cutoff까지 저장·이용 가능했음을 보존된 이력으로 확인해야 한다. row.as_of가 오래됐다는 사실만으로 나중에 생성된 평가를 과거 조회에 넣을 수 없다. 저장된 evaluated_at과 input manifest를 보존하고, 승인된 freshness·target applicability·selection policy를 충족한 레코드만 현재 요청의 평가로 선택한다. 유효한 레코드가 없거나 선택 정책이 미승인이라면 고정 target의 점수null과 결손/미정 사유를 제공하며 이전 값을 현재 평가로 재포장하지 않는다. 이전 점수나 ‘제한 없음’을 유지하기 위해 새로운 공식 경고를 무시하지 않는다. 현재 상태를 결정할 새 근거 처리가 필요해도 GET에서 평가 작업을 실행하지 않는다.

`queried_at`은 이번 조회의 실제 시각이다. 미래 envelope.as_of는 거부한다. 지원하지 않는 과거 이력 조회는 HTTP422와 `error_code=history_not_reproducible`로 고정하고 정상 null 평가와 혼용하지 않는다. 평가·지원·통제·조회 selection manifest의 당시 이용 가능 이력을 재현할 수 없으면 최신 자료를 과거 결과처럼 반환하지 않는다.

- 사용한 관측값은 관측 시각과 실제 수집/이용 가능 시각이 **row.as_of** 이하이어야 한다. 뒤늦게 도착한 관측은 과거 평가 입력에 넣지 않는다. 참고 전용 관측을 별도로 표시할 때는 envelope cutoff를 사용한다.
- 사용한 예보값은 대상 시각이 미래일 수 있으나 발표 시각과 수집/이용 가능 시각은 **row.as_of** 이하이어야 한다. 미상 발표 시각을 수집 시각으로 덮어쓰지 않는다. 역사적 가용성을 입증할 수 없으면 점수 입력으로 쓰지 않는다. 참고 전용 예보는 envelope cutoff까지 읽을 수 있으나 사용 입력으로 승격하지 않는다.
- 선택한 예보 revision은 동일 제공처·원본 ID·관측소·대상 시각의 **당시에 이용 가능했던** revision이다. 오늘의 `superseded` 플래그로 과거 revision을 일괄 제외하거나 오늘의 최종 수정값으로 대체하지 않는다.
- 공식 통제는 발표/수집 시각과 장소·활동·대상 기간의 적용 조건이 모두 맞아야 한다. 뒤늦은 종료 정보로 과거 통제 상태를 소급 삭제하지 않는다.
- 공간 연결·활동 지원·방법 버전·참여자 프로필도 당시 평가 manifest에 고정해야 한다. 현재 장소 카탈로그 수정이 과거 평가 의미를 바꾸지 않아야 한다.

현재 `storage.py`는 snapshot/metric의 `state`와 장소/관측소 메타데이터를 갱신할 수 있고, 원상 복귀 A→B→A에서 A의 최초 fetch 시각을 보존한다. 따라서 기존 테이블의 현재 값과 `fetched_at` 필터만으로 완전한 과거 재현을 약속할 수 없다. 후속 구현은 평가 시점의 불변 입력 manifest 또는 필요한 변경 이력을 갖춰야 한다. 이러한 저장 설계가 완료되기 전 historical as_of 지원을 광고하지 않는다.

대상 기간은 반개구간 `[from, until)`이다. `from < until`이며 `until`과 정확히 같은 시각에 시작하는 다음 슬롯은 이 응답에 포함되지 않는다. 겹치는 interval은 앞의 선택 규칙대로 원래 target을 보존한다. 예보 지원 범위는 고정 ‘7일’ 같은 숫자로 추정하지 않고 제공처·변수·발표본·평가 방법이 실제 지원하는 범위의 교집합에서 결정한다. 일별 요약은 별도 집계 명세가 있기 전 시간 슬롯의 평균·최댓값으로 생성하지 않는다.

## 오류와 자료 부재의 구분

기존 클라이언트는 문자열 `detail`만 읽으므로 제안 오류 응답도 사람이 읽을 수 있는 안전한 `detail`을 보존한다. 구조화된 `error_code`와 추가 context는 후속 클라이언트가 소비할 수 있지만 DB SQL·자격증명·원문 응답·인증된 upstream URL을 포함하지 않는다. 실패에는 대체 점수를 넣지 않는다.

| HTTP | 상황 | 의미 |
|---|---|---|
|200|정상적으로 해석한 요청이나 평가 점수가 null|점수 미제공은 데이터/모델 상태다. 응답 상태와 사유를 읽는다.|
|200|정상 조회의 빈 페이지|저장된 대상 행 없음. 안전하거나 활동 가능하다는 뜻이 아니다.|
|404|존재하지 않는 장소 또는 지원하지 않는 route|알려진 장소의 알려진 활동 미지원과 구분한다.|
|422|시간대 없는 시각, 역전 기간, 미래 as_of, 범위/페이지 제한 위반, 미등록 활동 코드·프로필·정렬, 재현 불가능한 historical as_of|요청을 수정해야 한다. 알려진 활동의 장소 미지원은 정상 응답 상태로 표현한다.|
|405|쓰기 메서드|읽기 계약에 쓰기 작업은 없다.|
|503|저장 자료/투영을 읽을 수 없는 서비스 실패|자료 없음과 다르다. 성공 응답을 만들지 않는다.|

지원 범위 안의 슬롯에 입력이 없으면 해당 슬롯을 명시적인 null 평가와 이유로 보존하는 정책이 필요하다. 지원 범위 밖 요청은 내부 결측과 다른 계약 상태로 알려야 한다. API·예시에서 구체 상태 이름과 필드는 canonical 계약을 따른다.

## 구현 전 검증 기준

계약 검증은 저장 자료를 이용한 후속 테스트에서 수행할 계획이다. 이번 산출물의 JSON 문법 검사는 실제 API 검증을 대신하지 않는다.

- 같은 envelope.as_of와 보존된 조회/selection manifest, 방법 버전의 페이지 조회에서 결과 집합과 순서가 고정된다. row.as_of와 evaluated_at, input manifest를 조회 때 갱신하지 않는다.
- assessment_id=null인 결손 행도 target_id·모델/버전·문맥 튜플로 안정적으로 정렬·중복 제거되며, GET에서 식별자를 만들기 위한 쓰기가 없다.
- 발표 미상, 지연 도착, 제공처 수정, A→B→A, 공식 통제 종료의 as_of 사례에서 미래 정보가 섞이지 않는다.
- `[from,until)` 경계, 기간 안 결측, 범위 밖 예보, 활동 미지원, 알 수 없는 장소가 구별된다.
- 원값과 단위 및 숫자/문자 타입이 보존되며 NaN/Infinity는 유효 점수가 아니다.
- 정상 null, 공식 통제와 유리한 환경값의 동시 존재, 실험 점수, 오류 응답이 각각 DTO 불변조건을 만족한다.
- GET의 DB 쓰기/수집 호출/외부 요청이 없고 bounded 조회·allowlist·비밀정보 비노출이 유지된다.
