# 현재 프론트엔드와 평가 API의 연동 설계

상태: **설계안 · 미구현**. 이 문서는 화면이나 제품 코드를 변경하지 않는다. 2026-09-14의 로컬 작업 트리와 [source_baseline.json](source_baseline.json)을 기준으로 실제 연결점을 확인했다. 브랜치는 `feature/api`, HEAD는 `d07cd23279808e74c1998d849c240a48e06d06d2`이며 기존 미커밋 변경이 포함된 상태다. API 응답 필드와 상태의 기준은 [canonical_contract.md](canonical_contract.md), HTTP 계약은 [api_contract.md](api_contract.md)다. [api_examples.json](api_examples.json)은 문서용 가정 사례이며 실데이터·시드·서비스 응답이 아니다.

## 확인한 화면과 데이터 흐름

현재 `frontend/src/api.ts`의 `requestData<T>`는 `${baseUrl}api/data/${path}`를 `cache: "no-store"`로 조회한다. `useResource.ts`는 `import.meta.env.BASE_URL`, 요청 취소용 `AbortController`, 경로와 revision을 사용한다. 요청 변경 시 이전 응답을 새 조건의 결과처럼 노출하지 않도록 key를 비교한다. 이 함수의 `payload as T`는 TypeScript 단언이며 JSON의 런타임 검증이 아니다.

`data.ts`의 공개 타입은 `Dataset`, `RowsResult`, `Row = Record<string, Cell>` 등 범용 표 계약이다. 평가 전용 DTO는 없다. `FeatureData.tsx`는 `catalog`를 읽고 지정된 dataset key만 골라 `DatasetTable`에 연결한다. `DataPage.tsx`의 `DatasetTable`은 현재 기본 100행, 최대 1,000페이지, 서버 허용 전체 열, 문자열 검색, 열별 정확 일치 필터, 행 상세를 제공한다. 이 조회는 실제 평가의 존재를 보장하지 않는다.

| 파일 / 현재 해시 경로 | 지금 확인한 동작 | 이후 평가 계약의 최소 연결점 | 유지해야 할 제한 |
|---|---|---|---|
| `WaterForecastPage.tsx` / `#water-forecast` | 날짜·hero 영역에 평가값 없음; `metrics`, `snapshots`, `forecasts` 표 | 한 지점·활동·프로필·모드·대상 기간의 평가 슬롯을 기존 패널에서 읽기 전용으로 표시 | 실제 날짜 선택·평가 로직은 없다. 슬롯별 `null`과 기간 밖을 구분하고 일 점수를 시간별로 복제하지 않는다. |
| `WaterIndexHubPage.tsx` / `#water-index` | 6개 기능 링크와 `metrics`, `snapshots`, `spots` 표; 점수·순위 미계산 안내 | 각 기능의 자료 상태·평가 제공 여부·공식 제한 상태를 요약 | 공통 척도 검증 전 활동별 점수를 한 순위로 정렬하지 않는다. |
| `WaterIndexMapPage.tsx` / `#water-index-map` | 실제 지도 미연결; 좌표 표와 비어 있는 지점 상세 패널 | 같은 API의 한 지점 상세, 별도의 bounded 장소 목록 | 좌표 등록만으로 활동 지원·운영·안전 상태를 추정하지 않는다. 지도 SDK와 지도 구현은 별도 작업이다. |
| `FirstSwimPage.tsx` / `#first-swim` | 계산된 날짜 없음; `metrics`, `snapshots` 표 | 관측 수온의 값·시각·출처와 첫 입수 기능의 제공 불가 이유 | 이번 계약은 첫 입수일·알림 전송·연도별 판정 기능을 정의하지 않는다. 수온 임계값으로 날짜를 만들어 채우지 않는다. |
| `TideTimerPage.tsx` / `#tide` | 추천 시간 없음·밀물/썰물 전환 미확인; `metrics`, `snapshots` 표 | 관측/예보 조위와 유효 시각, 별도로 검증된 장소 활동 창이 있는 경우 그 상태 | 조위 자료만으로 갯벌 진입·탈출 시간이나 안전 타이머를 산출하지 않는다. |
| `WaterQualityPage.tsx` / `#water-quality` | 계산된 신뢰도 없음; `metrics`, `snapshots`, `calibrations`, `lineage` 표 | 지표 원값·단위·채수/대상 시각·관측소·자료 간 비교 가능 여부 | pH·DO·탁도를 병원체 검사나 수영 허가로 표시하지 않는다. 서로 다른 지점·기간은 합치지 않는다. |

`App.tsx`의 해시 메뉴, `navigation.ts`의 과거 `data` 선택 정상화, 현재 CSS와 표 중심 배치를 유지하는 연결 계획이다. 화면 재설계, 새 회원·알림 시스템, 지도 또는 외부 서비스 도입은 이 설계 범위에 포함되지 않는다. `WaterIndexHubPage.tsx`에 링크가 있다는 사실은 해당 활동 평가나 기능 지원의 증거가 아니다.

## 클라이언트 경로와 타입 경계

배포 시 `/pongdang/`를 보존한다. `requestData`에 넘길 경로는 `water-index/...`와 같은 상대 부분이며 `/api/data/` 또는 `/pongdang/`를 중복 붙이지 않는다. 예를 들어 BASE_URL이 `/pongdang/`이면 논리 API `/api/data/water-index/...`의 브라우저 URL은 `/pongdang/api/data/water-index/...`가 된다. BASE_URL이 `/`인 개발 환경에서는 `/api/data/water-index/...`다. FastAPI `root_path`와 Vite base를 이 작업에서 변경하지 않는다.

후속 구현에서는 기존 범용 `RowsResult`를 평가 DTO로 억지로 단언하지 않고 전용 파서/타입을 둔다. 알 수 없는 enum, 필수 필드 누락, `score: null`을 처리할 수 없는 응답은 검증 실패로 표시한다. 새 optional 필드 추가와 알려지지 않은 reason code는 진단 정보를 유지하며 처리하되, 새 최상위 판정 상태를 유리한 상태로 매핑하지 않는다. 숫자의 유한성, 단위, 명시적 `null`, 기간 경계, 선택한 지점·활동·프로필·모드와 응답 일치를 함께 검사한다.

공개 숫자 응답의 추가 검증은 `model.status=validated`, `validation_status=external_validation_passed`, 해당 적용 범위 게이트 통과다. experimental/candidate 또는 오프라인 contract-fixture-only의 숫자는 공개 화면에서 차단한다. 요구목록 미확정 상태의 품질 개수null은 ‘확인 항목 미정’이며0개 검사 완료나0% 신뢰도가 아니다. coverage의 supported_windows는 **자료의 시간 coverage**이고 해당 장소의 활동 지원(support)과 구별해 표시한다.

`numeric_value`, `text_value`, `unit`, `id`, `spot_id`, 원본의 시각은 원래 의미 그대로 유지한다. 프론트엔드에서 숫자 변환, 단위 추정, 날짜 보간, 위험 가중치 계산을 하지 않는다. 표현을 위해 계산한 날짜 문자열은 API 원값을 대체하지 않으며, 상세 표에서 원값과 출처를 확인할 수 있게 한다. 현재 `date()`가 KST로 출력하므로 관측·발표·수집·평가·조회 시각의 **각 라벨**을 별도로 명시한다.

응답 envelope.as_of는 ‘조회 기준 시각’, row.as_of는 ‘평가에 사용한 정보의 기준 시각’, evaluated_at은 ‘평가 생성 시각’, queried_at은 ‘이번 조회 시각’으로 구분한다. 저장된 row.as_of는 envelope.as_of보다 이를 수 있고 행마다 다를 수 있다. 단순히 두 시각이 다르다는 이유로 오류 처리하거나 row 값을 envelope 값으로 덮어쓰지 않는다. non-null인 행 cutoff가 envelope cutoff를 초과하면 계약 위반이다. 승인된 freshness·selection policy를 충족하지 못해 점수가null인 경우, 과거 평가를 최신 평가처럼 재표시하지 않는다. 평가 레코드가 없는 target의 row.as_of/evaluated_at은null이므로 ‘평가 기준 기록 없음’으로 표시한다.

리스트 key·페이지 간 중복 제거는 `target_id × model_id × model_version × parameter_set_version × context`를 사용한다. 한 응답은 이 튜플당 한 행이며 context는 registry의 고정된 전체 값으로 비교한다. assessment_id는 평가 저장 레코드의 참조일 뿐 필수 UI key가 아니다. assessment_id=null이어도 보존된 target_id로 결손 행을 계속 식별하고, API 요청을 보내 새 ID를 만들려 하지 않는다. support 응답의 target_id는 지원 근거 레코드·유효 기간의 별도 키이므로 평가 target_id와 직접 합치지 않는다.

## 상태 표시와 기본 동작

`score: null`은 정상적인 평가 응답이다. `0`, 빈 문자열, 마지막 성공 점수, 정적인 샘플 점수로 대체하지 않는다. 환경 설명과 활동 통제는 같은 축이 아니므로 공식 통제가 있으면 통제 사실을 먼저 읽을 수 있어야 한다. 환경값이 유리해 보이거나 실험 점수가 있더라도 통제 상태를 지우지 않는다. 과학적 쾌적성, 안전 상태, 자료 가용성, 평가 제공 여부를 하나의 색깔이나 등급으로 합치지 않는다.

| 수신 상황 | 화면의 의미와 최소 표시 | 하지 않을 처리 |
|---|---|---|
| HTTP 정상, 점수 미제공 | 평가값 없음 + 계약상 사유 + 원본 관련 표 | 0점 또는 안전/불안전으로 전환 |
| HTTP 정상, 필수 입력 결측·오래됨·범위 부적합 | 누락 지표·자료 시각·적용 범위 및 판단 불가 | 남은 지표 가중치 재정규화, 이전 값 연장 |
| 공식 통제와 환경 자료 함께 있음 | 적용 장소·활동·유효 기간이 맞는 공식 통제 우선 표시, 환경값은 참고 자료로 유지 | 좋은 날씨를 근거로 활동 추천 |
| 문서용 오프라인 실험 점수 | 문서/검증 하네스에서만 실험 상태·대상 결과·프로필·모델 버전·적용 범위 표현을 점검한다. **공개 UI가 수신하면 계약 위반으로 차단**한다. | 공개 allowlist 활성화, 공개 UI 점수 표시, 검증된 안전 등급이나 다른 활동과의 통합 순위로 노출 |
| 요청한 예보 기간이 지원 범위 밖 | 지원 기간과 범위 밖 사유 | 마지막 슬롯 복제·관측을 예보로 변환 |
| 장소가 요청 활동을 지원하지 않음 | 지원하지 않는 활동이라는 응답과 활동 지원 근거 | 장소 유형명만 보고 지원 활동을 추정 |
| 200 + 빈 페이지 | 조건에 맞는 저장된 행 없음; `total`·페이지 상태 표시 | 서버 실패나 해당 기간 안전으로 해석 |
| 404 / 422 / 503 / 네트워크 실패 | 조회 실패와 사용자에게 안전한 `detail` 문자열; 현재 요청의 자료는 미확인 | 예제 JSON 또는 이전 결과로 성공 표시 |
| 알 수 없는 상태/응답 구조 | 응답을 해석할 수 없음; 원본 표 경로는 유지 | `unknown`을 높은 적합도로 처리 |

로딩 상태는 기존처럼 `role="status"`, 실패는 `role="alert"`로 식별한다. 색과 아이콘 외에 텍스트를 제공한다. 표 정렬에서 null을 0으로 간주하지 않으며, 임의의 기본 프로필을 숨겨 선택하지 않는다. 주관적 선호·관측된 방문 선택·안전 제한의 결과변수 명칭을 화면에서 유지한다.

## 표시 코드 사전 초안

아래는 동료가 연결할 **문구 명세**이며 현재 코드에 추가된 번역 사전이 아니다. `reason_codes`의 wire 철자는 [api_contract.md](api_contract.md)의 소문자 코드가 기준이다. `message_code`는 상태를 사용자 문장으로 라우팅하는 대문자 코드로 별도 관리한다. 임의의 API 원문을 HTML로 삽입하지 않고, 승인된 활동 표시명과 검증된 시간·수치만 텍스트 치환한다.

활동 표시명 후보는 swim=수영, surf=서핑, relax=물가 휴식, mudflat=갯벌 체험, onsen=온천 이용, rafting=래프팅이다. enum의 표시명을 제공하는 것은 그 장소의 해당 활동 지원 선언이 아니다. `{activity}`는 해당 행 recommendation.activity와 일치한 등록 표시명, `{target}`은 원래 target 시각/기간과 KST 라벨, `{reason}`은 등록된 사유 설명, `{score}`는 검증된 공개 환경지수 값이다. 프로필 이름은 등록된 비민감 표시명만 사용한다.

| message_code | 선택 조건과 허용 치환 | 문구 초안 | 함께 연결할 주의 문구 코드 |
|---|---|---|---|
| `ACTIVITY_NOT_SUPPORTED` | recommendation=not_supported; 해당 activity | 이 지점은 {activity} 지원 대상이 아닙니다. | `SUPPORT_IS_NOT_TEMPORARY_CONTROL` |
| `CHECK_ACTIVITY_SUPPORT` | check_required + support.unknown; activity | 이 지점의 {activity} 지원 여부를 확인할 자료가 부족합니다. | `UNKNOWN_IS_NOT_PERMISSION` |
| `ACTIVITY_RESTRICTED` | do_not_proceed + 범위가 맞는 safety.restricted; activity/target/reason | {target}의 {activity}는 공식 통제 대상입니다. {reason} | `OFFICIAL_CONTROL_FIRST` |
| `CHECK_ACTIVITY_CONDITIONS` | check_required + safety.unknown/not_assessed; activity/reason | {activity} 조건을 판단할 확인 자료가 부족합니다. {reason} | `UNKNOWN_IS_NOT_PERMISSION` |
| `CONDITIONAL_ACTIVITY_INFORMATION` | conditional_information + safety.caution; activity/reason | {activity} 관련 주의 사항이 확인되었습니다. {reason} | `NO_SAFETY_GUARANTEE` |
| `ASSESSMENT_UNAVAILABLE` | unavailable; activity/reason | {activity} 평가값을 제공할 수 없습니다. {reason} | `NO_RESULT_AVAILABLE` |
| `ENVIRONMENT_INDEX_INFORMATION` | information_only + 공개 validated 환경지수; activity/target/score | {target}의 {activity} 환경지수는 {score}입니다. | `NO_SAFETY_GUARANTEE`, `NO_CROSS_ACTIVITY_RANKING` |
| `EXPERIMENTAL_INDEX_INFORMATION` | **오프라인 문서/검증 하네스 전용**; experiment label/score | 오프라인 명세 사례의 실험 지수입니다. | `OFFLINE_ONLY`, `NO_CROSS_ACTIVITY_RANKING` |

주의 문구는 상태가 실제로 해당할 때 연결한다. `SUPPORT_IS_NOT_TEMPORARY_CONTROL`=활동 미지원과 일시 통제는 다른 상태입니다. `UNKNOWN_IS_NOT_PERMISSION`=미확인은 활동 허가나 안전 확인을 뜻하지 않습니다. `OFFICIAL_CONTROL_FIRST`=환경값과 관계없이 해당 공식 통제 안내를 따르세요. `NO_SAFETY_GUARANTEE`=환경지수나 확인된 제한의 부재는 안전 보장이 아닙니다. `NO_CROSS_ACTIVITY_RANKING`=다른 활동의 점수와 비교한 추천 순위가 아닙니다. `NO_RESULT_AVAILABLE`=값 없음은0점이 아닙니다. `OFFLINE_ONLY`=실제 서비스 출력이나 검증된 점수가 아닙니다.

mode=forecast/mixed에서 `FORECAST_NOT_OBSERVATION`=예보 입력이 포함된 평가입니다를 추가한다. 참고 forecast만 있고 사용 입력이 없는 mode=none에서는 원본 자료 행에 예보임을 표시하고 평가 자체를 예보 계산 완료로 쓰지 않는다. `{reason}` 예를 들면 input_missing=필요한 자료 없음, input_stale=필요한 자료의 적용 기간 경과, issue_time_unknown=발표 시각 미확인, model_unimplemented=평가 계산 준비 중, model_not_released=검증과 공개 준비 미완료, outside_forecast_horizon=확인된 예보 지원 범위 밖이다. 수치 기준이 확정되지 않은 상태에서 구체 ‘몇 시간 경과’나 ‘몇 점 미달’ 문구를 새로 만들지 않는다.

components.explanation_codes는 특정 입력·모수·근거와 연결된 설명의 이유를 나타낸다. contribution이null이면 숫자 영향량을 표현하지 않고, 양수/음수의 인과효과나 SHAP로 해석하지 않는다.

| explanation_code | 사용자 설명 | 연결할 정보 / 금지 표현 |
|---|---|---|
| `INPUT_NOT_SCORED` | 참고 자료이며 점수 계산에 사용되지 않았습니다. | input_refs, used_by=[]; 기여도 숫자 생성 금지 |
| `INPUT_MISSING` | 필요한 입력값이 없습니다. | input_missing, 해당 지표명;0으로 대체 금지 |
| `INPUT_STALE` | 해당 평가에 사용할 수 있는 기간이 지났습니다. | 입력 시각·승인 유효 조건; 현재 조회의 stale을 과거 as_of에 그대로 복사 금지 |
| `INPUT_AGGREGATION_UNKNOWN` | 자료의 평균·누적·순간값 구분을 확인할 수 없습니다. | aggregation와 input_aggregation_unknown; 일→시간 변환 금지 |
| `INPUT_SCOPE_UNVERIFIED` | 이 관측자료가 해당 장소를 대표하는지 확인되지 않았습니다. | mapping_version와 station_mapping_unverified |
| `MODEL_NOT_RELEASED` | 모델의 검증과 공개 준비가 완료되지 않았습니다. | model 상태·게이트; 높은 점수로 대신 설명 금지 |
| `CONTRACT_EXAMPLE_NO_SCIENTIFIC_CLAIM` | 숫자와 필드 구조를 설명하는 문서용 가정입니다. | **오프라인 문서 전용**; 원문 연구의 수치나 실제 계산 결과라는 표현 금지 |

알 수 없는 설명 코드는 ‘상세 설명을 해석할 수 없음’으로 처리하고 원본 상세에서 코드를 보존한다. 사전에 없는 코드를 ‘좋음’, ‘안전’, ‘추천’으로 기본 매핑하지 않는다. 실제 공식 경고의 제목·적용 구역·유효 시각은 사전의 짧은 문구와 함께 남겨 의미를 바꾸지 않는다.

## 후속 연결의 완료 조건

아래는 이번에 실행한 제품 테스트가 아니라 **후속 구현의 수용 기준**이다.

- `api_examples.json`의 정상 null 사례가 명세와 같이 렌더링된다. 숫자 실험 사례는 오프라인 문서/검증 하네스에서만 검토하며, 공개 UI 수신 시 차단되는지를 검증한다.
- 요청 조건을 바꾼 직후 늦게 도착한 이전 응답이 새 조건 패널을 채우지 않는다. 새로고침은 조회만 수행한다.
- 요청의 as_of는 첫 응답 envelope.as_of로 고정하고 대상 기간·조회 manifest 선택을 유지해 페이지를 이동한다. 각 row.as_of는 불변 평가 cutoff로 따로 표시하며 envelope 값과 같게 강제하지 않는다. 뒤늦은 페이지가 고정된 조회 cutoff/selection을 벗어나면 검증 실패로 처리한다.
- 저장 평가가 없는 target의 assessment_id/as_of/evaluated_at이null이어도 target_id·모델/버전·문맥으로 안정적으로 렌더링하고 중복을 제거한다. 이전 평가의 시각·manifest를 현재 조회 시각으로 다시 쓰지 않는다.
- 공식 통제 사례에 추천 표현이 나오지 않는다. 오프라인 실험 사례의 설명에는 실험·프로필·대상 결과 표시가 포함되고, 공개 화면에서는 해당 응답을 표시하지 않는다.
- 관측과 예보는 서로 다른 표기와 시각 의미를 유지한다. 지원 범위 밖, 지원 기간 내부 결측, HTTP 오류의 문구가 구별된다.
- 기존 `/api/data/catalog`, `summary`, `datasets/{key}`의 전체 허용 열·100행 제한·상세 표 접근이 유지된다.
- 실제 API 연동 전 저장된 평가 투영과 필수 메타데이터가 준비되어야 한다. 미구현 API를 현재 화면에 연결해 놓거나 문서 예시를 fallback으로 번들하지 않는다.

## 확인한 소스 범위

`frontend/src/{api.ts,data.ts,useResource.ts,FeatureData.tsx,DataPage.tsx,App.tsx,navigation.ts,WaterForecastPage.tsx,WaterIndexHubPage.tsx,WaterIndexMapPage.tsx,FirstSwimPage.tsx,TideTimerPage.tsx,WaterQualityPage.tsx}`, `frontend/vite.config.ts`, `backend/app/{main.py,data_reader.py,data_catalog.json}`, `backend/app/ingestion/{__init__.py,models.py,storage.py}`, `backend/tests/test_data.py`를 읽었다. API·DB에 접속하거나 앱을 실행한 검증은 수행하지 않았다. 현재 API 테스트 파일을 읽었다는 사실을 이 설계의 동작 검증으로 보고하지 않는다.
