# A1·A2·A6 실행 경로와 인계

2026-09-14 작업 기록. 테스트 fixture와 실제 수신 자료를 구분한다. 이 문서의 상태는 소프트웨어 구현 상태이며 검증된 수치 점수나 운영 배포의 완료 선언이 아니다.

| 기능 | 코드와 실행 경로 | 데이터·모델·운영 상태 | 검증과 다음 작업 |
|---|---|---|---|
| A1 Water Index | 기존 판정기 재사용, `water_index.producer`의 실수집 입력 변환→평가→입력 manifest→평가→read manifest 원자 저장. 승인된 대표 관측소·지원·통제의 명시적 입력 경로 추가 | station 자체 자료는 자동 연결. 여행 장소 대표성은 검수 mapping 필요. 지원·통제 근거 미등록은 unknown. 숫자 모델은 기존 registry의 unimplemented/외부 검증 미완료 그대로 | 독립 단위검사 통과. 실제 PostgreSQL18 통합검사는 root 실행 기록에 통합. 수치 파라미터·필수 안전항목·외부 검증은 별도 필요 |
| A2 Water Forecast | 기존 KMA/KHOA SourceBatch 수집→`forecast.storage.project_forecasts`→불변 `forecast_revision`→조회 API. A1과 동일 대상시각/원자료 사용 | 실제 공급한 구간만 노출. 자료 없는 날 생성 없음. provider 발표시각 없으면 null. 추천 규칙 검증 전 방문 순위 없음 | 정정 자연키·결측·관측/예보 분리 단위검사. DB 테스트는 101개 원래 대상의 페이지 분할까지 포함 |
| A6 Tide Timer | 기존 고저조 예측→A2 불변 revision→고저조 분류·다음 사건·countdown. 별도 검수 운영시간 입력→불변 저장→상태 판정 | 조석 사건은 활동 허용이나 안전 판정이 아님. 실제 운영 시간과 통제 근거 없으면 `no_official_operating_window` | KST 자정, 공식 극치 코드, 정정, 명시 운영시간·통제·만료 단위검사. 실제 운영시간과 대표 관측소 근거 등록 필요 |

## 채택 근거와 제외한 레거시 판단

먼저 `AGENTS.md`, `backend/BACKEND_GOAL.md`, 현재 ingestion/water_index 코드, `docs/ingestion.md`, `docs/design/water-travel-index/{canonical_contract,model_spec,parameter_register,validation_plan}.md`, `docs/implementation/water-travel-index/{README,implementation_notes,frontend_handoff}.md`와 API 확인 문서 목록을 확인했다.

읽기 전용 Multtara의 문서 목록에는 루트 기획서/플랜, `docs/water-index-methodology.md`, `docs/recommendation-methodology.md`, `backend/services/{recommendation,catalog}/README.md`, 운영 문서와 worktrees 내 복제본이 있다. 방법론의 계층 분리, 공식 시간창과 원출처 보존이라는 요구만 참고했다. 기존 방법론의 95/80/60/35/15 표시 앵커나 0.80 신뢰도 임계값, Accepted/Implemented 상태는 Pongdang 검증 근거로 채택하지 않았다. worktrees의 복제된 과거 문서는 현재 실행 지시나 독립 근거로 사용하지 않았다. 레거시 코드·DB·네트워크·자격증명을 읽어 구현에 의존하지 않았다.

현재 공식 명세는 [국립해양조사원 조석예보(고·저조)](https://www.data.go.kr/data/15156018/openapi.do)의 Swagger를 이번 작업에서 재조회했다. `extrSe`의 1·3은 고조, 2·4는 저조이며 각각 오전/오후 구분이다. unknown 코드는 unknown으로 유지한다. 같은 공식 페이지는 KHOA 제공기관, 검색 날짜별 사건 시각·조위, 출처표시 이용조건, 운영 심의 조건을 명시한다. 공식 [갯벌체험지수](https://www.data.go.kr/data/15142489/openapi.do)는 기존 ingestion 경로를 재사용하며, 확인되지 않은 운영 상태 코드를 임의의 허용 판정으로 바꾸지 않는다. 이번 구현 과정의 공식 문서 접근을 실제 인증 API 자료 수신 성공으로 보고하지 않는다.

## DB와 worker 통합 계약

모든 테이블은 `pongdang_data`에 추가된다. 앱 시작/GET에서 생성하지 않는다. root의 `app.schema` v5 migration이 다음 함수를 호출한다.

- `water_index.sources.migrate_assessment_sources`: `water_index_station_mapping`, `water_index_authority_evidence`
- `water_index.producer.migrate_assessment_producer`: `water_index_production_run`
- `forecast.migrations.migrate_forecast`: `forecast_revision`
- `tides.storage.migrate_tides`: `tide_operating_window`

모든 이력 테이블은 기존 `water_index_immutable` trigger로 UPDATE/DELETE를 차단한다. 수정은 새 ID와 이전 revision 참조를 추가한다. source collection의 정정은 기존 ingestion의 superseded 정책을 따른다. KHOA 고저조 `source_id`는 공식 사건 슬롯인 `derived:` 접두어와 관측소+KST날짜+고조/저조+시간순 occurrence를 사용한다. 실제 공식 응답에서 같은 날짜에 극치코드4가 두 번 나타나므로 코드만으로 병합하지 않는다. 시간순 사건 슬롯이 유지되는 시각 정정과 A→B→A 복귀는 하나의 원자료 이력으로 처리된다. 원예측 시각은 `observed_at`/target 필드에 그대로 남는다.

이 사건 ID는 제공기관이 발행한 불변 사건 ID가 아니라 `tide-event-slots.2` adapter의 파생 식별자다. 시간순 ordinal 변경, 사건의 날짜 이동, 제공된 사건 수 변화에서는 동일 물리 사건임을 확정할 수 없다. 그 경우 원자료 revision/시각/실제 provider code를 보존하고 새 슬롯으로 표현할 수 있으며, 같은 사건의 정정이라고 단정하거나 안전 시간창을 이어 붙이지 않는다. 빈 응답을 이전 사건의 철회 증거로 추정하지 않고 기존 예측의 원래 유효기간을 연장하지 않는다. 신adapter로 해당 날짜를 수집한 뒤에는 구adapter의 timestamp 식별자가 같은 미래 날짜 응답에 중복 노출되지 않도록 선택하며 구자료와 이미 저장한 역사 projection은 삭제하지 않는다. `ForecastRecord.adapter_version`과 조회 cutoff 기준 effective selection으로 이미 projection된 v1 레코드도 그 날짜의 v2 capture가 보이는 시점부터 현재 응답에서 제외한다. v2 기록 이전 as_of에서는 구 projection을 그대로 조회한다.

이번 공식 소량 read에서는 2026-09-16 같은 관측소의12:44·23:51 저조가 모두 code4였음을 확인했다. 이 경계를 격리 fixture로 재현하여 두 사건 보존을 검사했고, 최종 실제 SourceBatch 정규화·test DB 저장·API 연결 성공은 root의 `live-verification.json`에 따로 기록한다.

독립 feature worker는 다음 순서로 기존 job lock/due/backoff/heartbeat 체계에서 실행한다.

1. 공식 SourceBatch 수집과 저장
2. `project_forecasts(settings)` — 정규화 실자료만 소비, 변화 없는 반복은 0건
3. `produce_assessments(settings)` — 입력/매핑/authority/모델 fingerprint가 바뀐 그룹만 새 평가. 평가와 publication, production marker가 한 DB 트랜잭션

한 pass는 최대5000 normalized snapshot을 읽고 초과 시 명시 실패한다. 한 평가 입력은 원래 snapshot의 최대100 metrics이며 페이지당 최대100 결과를 반환한다. 예보 coverage는 실제 인접 구간만 합치고 내부 빈 구간을 채우지 않는다. nested coverage/support가100개를 넘으면 조용히 자르지 않고 작업 실패를 남긴다. 101개 연속 예보 target의 저장 및 두 페이지 조회를 통합검사한다.

## 검수 자료 입력

서버 권한이 있는 담당자가 근거를 검토한 뒤 아래 CLI로 명시 등록한다. HTTP import endpoint는 없다. JSON은 `EvidenceBundle`의 `mappings`/`authorities` 배열 계약이며 Pydantic 모델이 전체 계약을 정의한다. URI에는 HTTPS 공식 공개 페이지를 사용하고 인증 사용자정보·query·fragment는 금지한다.

```bash
cd backend
uv run python -m app.schema --initialize
uv run python -m app.water_index.producer --evidence /reviewed/path/evidence.json
uv run python -m app.tides.storage /reviewed/path/operating-window.json
# 외부 수집 없이 현재 독립 DB의 실제 collection 자료를 투영
uv run python -m app.water_index.producer
```

`StationMapping` 필수값은 `mapping_id`, 실제 `spot_id`·`station_id`, `spatial_scope`, `mapping_version`, `evidence_ref`, `source_url`, `authority`, `reviewed_by`, `activities`, `valid_from/valid_until`이다. 대표 관측소의 실제 대표성·활동·시간 범위를 검수해야 한다. 수정은 새 mapping_id와 `supersedes_id`를 사용한다. 같은 장소/관측소/활동에 기간이 겹치는 별도 active mapping은 명시 정정 없이 등록할 수 없고 자체 관측소 장소는 직접 관계를 사용한다. 본문은 불변 JSON이며 `InputDTO.mapping_evidence_ref`가 그 mapping_id를 참조한다. `InputDTO.spot_id`는 원자료의 관측 지점 그대로이고 평가의 spot_id로 덮어쓰지 않는다.

`AuthorityRecord`는 `evidence_id`, 공개 출처, 검수자와 기존 `SupportEvidence` 또는 `SafetyEvidence`를 포함한다. 장소·활동·공식 책임기관·적용 기간·수집/발표시각·현재 발효 상태를 명시한다. 자체 관측소의 존재나 장소 분류를 지원 증명으로 변환하지 않는다. 검수 근거가 있으면 기존 엔진이 supported/unsupported와 restricted를 실제 판정하며 필수 안전확인 목록 미검증은 계속 unknown이다. 같은 ID의 내용 충돌은 실패하고 유효기간을 연장하지 않는다.

`OperatingWindow`는 별개 모델이다. 실제 시작·종료(자정 통과 가능, 최대24시간), source_key/불변 window_id, 장소/활동, 기관 원자료 ID/출처/시각/만료, 운영 상태와 통제 확인 근거가 필요하다. 관측소를 지정하면 자체 장소 또는 검수된 대표성 mapping이 있어야 한다. `open` 및 근거가 있는 `confirmed`일 때만 `official_operating_window`다. 이것은 운영자가 제공한 활동 시간 정보이고 수영 안전 판정이 아니다. 간조±임의 시간 규칙은 없다.

## 프론트/API 인계

기존 화면 구조/CSS를 유지하고 API client·DTO·기존 결과 영역 바인딩만 root가 연결한다. 이 하위 작업은 프론트 파일을 수정하지 않았다. BASE_URL `/pongdang/` 구성은 기존 `api.ts` 방식으로 처리하며 아래 경로를 중복 접두어 없이 연결한다.

A1의 현재 publication은 입력이 참조한 검수 mapping의 정정도 확인한다. 수정으로 활동이 삭제되거나 적용기간이 축소되어 producer에서 해당 그룹이 사라져도, 과거 mapping을 참조하는 기존 read manifest는 `station_mapping_changed`와 빈 rows/unknown coverage로 차단한다. GET에서 평가나 쓰기를 실행하지 않고 불변 mapping revision의 `available_at<=as_of`만 검사한다. 정정 전 as_of는 기존 평가와 원본 입력을 그대로 재현하며 저장된 assessment/read manifest를 수정하거나 삭제하지 않는다.

공통 조회는 `spot_id`, `activity`, offset ISO8601 `from`/`until`, 선택 `as_of`, `page`, `page_size`다. 양의 기간은 최대31일, page≤1000, page_size≤100. `as_of`는 미래일 수 없다. 모든 endpoint는 읽기 전용 DB transaction이며 외부 API 호출·평가 저장·migration을 실행하지 않는다.

| endpoint | 의미 | null/empty 처리 |
|---|---|---|
| `/api/data/water-index/assessments` | `profile_id=general`, `mode=forecast/observation`을 명시. 실제 불변 평가와 원자료 입력·mapping ref 반환 | score null을0으로 바꾸지 않는다. support_unknown/withheld/model_unimplemented 사유 보존 |
| `/api/data/water-index/support` | 같은 publication의 검수된 장소/활동 지원 근거 | 지원 근거 미등록은 빈 rows/unknown이며 unsupported와 다름 |
| `/api/data/water-index/coverage` | 실제 입력 구간과 빈 구간 | 관측 coverage는 미래예보 범위로 해석하지 않는다 |
| `/api/data/water-forecast/forecasts` | 실제 provider target interval별 원자료, 발표/수집/저장시각, revision·이전revision·station·단위 | `no_forecast_data`, `outside_forecast_horizon`, `missing_within_horizon` 구분. horizon 양끝 사이가 빈틈없다는 뜻은 아니다 |
| `/api/data/tides/events` | 고저조 사건, `next_high/next_low`, countdown 기준·시각 | `reference_at`은 from≤reference<until. 사건없음은 null. unknown 극치코드는 next high/low로 채택하지 않는다 |
| `/api/data/tides/windows` | 검수 운영시간과 통제 근거를 별도로 제공 | 미등록=`no_official_operating_window`, 미확인=`unknown`, 종료=`expired`, 통제=`restricted` |

예보 row는 `issued_at=null`이면 `provider_issue_time_unknown`을 남기며 fetched_at로 대체하지 않는다. `data_kind=official_forecast`이므로 관측이나 보간으로 표시하지 않는다. `spatial_relation=station_observation_point/representative_station`은 장소 직접 측정 여부를 구분한다. 대표 연결은 `mapping_evidence_ref`로 검수된 불변 mapping_id를 반환하며 직접 관측소는 null이다. `revision_id`와 `previous_revision_id`는 정정 연결이고 원 `provider_record_id`/`source_record_id`도 보존한다. 과거 as_of는 projection이 실제 DB에 기록된 `available_at` 이후 이력에만 적용된다. projection 도입 전 자료를 뒤늦게 과거에 존재했던 응답처럼 만들지 않는다.

조석 `event_id`는 source 자연키와 revision을 포함하므로 A7 이벤트의 근거로 공유 가능하다. notification 중복 방지는 source_key/사용자 조건을 사용하고 근거 정정 여부는 revision_id로 구분한다. `seconds_until`은 기준시각에 대한 비음수 초 단위이며 프론트는 API의 `reference_at/event_at`과 자체 monotonic 경과시간을 이용해 갱신할 수 있다. API가 제공하지 않은 다음날 사건을 주기성 가정으로 생성하지 않는다.

## 검사 상태와 재실행

`/tmp/pongdang-runtime-20260914/bin/python`은 이번 호스트에서 iCloud dataless `.venv` import 지연을 피한 Python3.14 실행 환경이다. 의존성 lockfile이나 애플리케이션 버전을 바꾸지 않았다.

- A1/A2/A6 및 기존 Water Index engine/service/api 단위 회귀 묶음: **158 passed**.
- `tests/test_assessment_forecast_tides.py`: **22 passed**. 마지막 수정 묶음은 기존 Water Index API/Marine과 함께 **84 passed**이며, 매핑 정정 조회 차단3건을 포함한다. source 변환/결측, official 코드, KST 자정, mapping 부적합, 지원 판정, 운영시간, URL 검증, 요청 범위/GET 전용 계약.
- 기존 `tests/test_marine.py`와 함께 실행한 최종 검사: **36 passed** (신규19 + marine17). tide 시간정정·A→B→A와 오후저조 코드4 중복 보존을 포함한다.
- `tests/test_assessment_forecast_tides_integration.py`: SourceBatch부터 HTTP까지, immutable 수정 차단/정정/as_of, 101 targets, 검수 입력/매핑/지원/운영시간. 폐기 가능한 `pongdang_test`에서 root 직렬 실행으로 **3 passed**를 확인했다(당시 전체360 passed). 이후 활동삭제/기간축소 정정에서 A1 publication 차단·정정 전 as_of·원본 불변, 구adapter projection 뒤 v2 수집에서 신·구 사건 중복 차단과 역사 재현 시험을 추가하여 이 파일은 현재5개 통합 case다. 해당 후속 결과와 최종 전체 결과는 공통 검사 기록에 갱신한다.
- 기존 `test_water_index_storage`의 과거버전 fixture는 실제 구스키마 형태를 재현하도록 새로운 production_run FK 테이블을 먼저 제거하도록 갱신했다. migration 동작을 약화하지 않았다.

```bash
cd backend
# 아래 POSTGRES_*는 폐기 가능한 PostgreSQL18 pongdang_test 전용 값이어야 한다.
uv run pytest tests/test_assessment_forecast_tides.py tests/test_assessment_forecast_tides_integration.py tests/test_marine.py
uv run ruff check app/forecast app/tides app/water_index tests/test_assessment_forecast_tides*.py
uv run ruff format --check app/forecast app/tides app/water_index tests/test_assessment_forecast_tides*.py
```

공식 데이터 실수신/운영 활성화는 별도 근거가 필요하다. 이 문서의 fixtures는 격리 테스트에만 존재하고 운영 seed/샘플 fallback이 없다. 공식 API 키·서비스 승인과 장소 대표성/운영 근거를 제공한 후 독립 수집 job→projection/evaluation job→해당 spot_id API를 다시 확인한다. 수치 환경지수·방문 추천·완전한 안전 판정의 출시는 기존 연구 설계에 따른 파라미터 검수, 한국 현장 결과, 활동별 요구자료·검증범위 확정과 외부 검증을 추가로 요구한다.
