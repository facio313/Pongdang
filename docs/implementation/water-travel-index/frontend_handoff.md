# Water Index 백엔드 연동 인계

2026-09-14 작성. 아래 채택 계약은 기존 [공통 계약](../../design/water-travel-index/canonical_contract.md)과 [프론트 연동 설계](../../design/water-travel-index/frontend_integration.md)를 따른다. 실제 백엔드와 기존 프론트 코드를 읽어 연결점을 기록했다. 실행 결과와 명세 사례별 검사 범위는 [implementation_notes.md](implementation_notes.md)에 따로 기록한다. 프론트 소스·화면·CSS를 이 작업에서 변경하지 않는다.

## 이번 백엔드가 전달하는 범위

자체 과학적 적합도 점수·가중치·임계값과 한국 선호 보정은 준비되지 않았다. 기본 모델은 `unimplemented`이고 `score`, `environment.score`, 선호 점수·순위는 null이다. 관측 수집 성공, 장소 카탈로그 등록, enum 표시명은 활동 지원이나 안전 확인의 증거가 아니다.

장소 지원·안전 상태를 실제로 설명하려면 명시적으로 검수된 지원/검사/평가 manifest가 필요하다. 현재 수집자료에서 이를 자동 생성하거나 저장된 원등급을 독자적인 안전·선호점수로 변환하지 않는다. 확인하지 못한 자료는 unknown과 구체 이유로 남긴다. 여섯 활동의 필수 안전 확인목록은 모두 미승인이므로 현재 `caution` 또는 `no_known_restriction`으로 안전 확인을 완료하지 않는다. 지원이 확인된 활동의 적용 중인 공식 제한은 `restricted`로 표시할 수 있고, 확인된 주의 정보는 최상위 안전 상태가 unknown이어도 warnings에 보존한다.

| 연동 대상 | 채택한 논리 경로 | 자료 의미 |
|---|---|---|
| 평가 목록 | `/api/data/water-index/assessments` | 보존된 target 및 평가/평가불가 상태의 읽기 투영 |
| 장소 활동 지원 | `/api/data/water-index/support` | 검수된 지원 레코드의 원기간과 출처 |
| 자료 시간 범위 | `/api/data/water-index/coverage` | 보존된 target manifest가 보여 주는 자료의 범위·누락 |

[api.py](../../../backend/app/water_index/api.py)의 `create_water_index_router`와 [main.py](../../../backend/app/main.py)의 router 등록을 확인했다. 소스에 경로가 등록되었다는 사실은 배포·운영 데이터 준비 완료를 뜻하지 않는다. GET은 수집·평가 계산·보정·ID/manifest 생성·DB 쓰기를 수행하지 않는다.

## 현재 프론트에서 확인한 연결점

`feature/api @ d07cd23279808e74c1998d849c240a48e06d06d2`의 미커밋 변경 포함 작업 트리를 읽었다.

| 파일 | 실제 확인한 상태 | 이후 연결할 때의 경계 |
|---|---|---|
| [api.ts](../../../frontend/src/api.ts) | requestData가 BASE_URL 뒤 `api/data/`를 붙이고 no-store·AbortSignal로 요청한다. HTTP 오류는 문자열 detail을 Error로 전달한다. | 경로는 `water-index/...`만 넘긴다. 현재 `payload as T`는 런타임 DTO 검증이 아니다. |
| [useResource.ts](../../../frontend/src/useResource.ts) | 경로·revision key와 요청 취소를 사용한다. 이전 key의 결과는 새 요청의 data로 반환하지 않는다. | 새 요청 전체 조건과 고정 envelope.as_of가 key에 반영되어야 한다. |
| [data.ts](../../../frontend/src/data.ts) | Dataset/RowsResult/Row는 일반 표 계약이다. text는 null을 대시로, date는 KST로 표시한다. | 평가 envelope를 RowsResult로 단언하지 않는다. nullable 점수·시각·개수를 전용 타입/파서에서 처리한다. |
| [FeatureData.tsx](../../../frontend/src/FeatureData.tsx) | catalog와 허용 dataset을 기존 DatasetTable에 연결한다. | 원자료 표는 유지하고 평가 전용 결과와 별도로 연결한다. |
| [WaterForecastPage.tsx](../../../frontend/src/WaterForecastPage.tsx) | 평가값 없음과 계산 준비 중 문구, metrics/snapshots/forecasts 표를 표시한다. | 정상 null과 실제 자료 범위를 설명한다. 날짜·점수를 문서 예시로 채우지 않는다. |
| [WaterIndexHubPage.tsx](../../../frontend/src/WaterIndexHubPage.tsx) | 기능 링크와 원자료 표, 점수·추천 순위 미계산을 설명한다. | 이번 응답으로 활동 간 순위·최고 활동·첫 입수일을 생성하지 않는다. |

배포 경로는 `/pongdang/`를 보존한다. BASE_URL이 `/pongdang/`이면 브라우저 경로는 `/pongdang/api/data/water-index/...`이고, 개발 BASE_URL이 `/`이면 `/api/data/water-index/...`다. API prefix를 두 번 붙이지 않는다.

## 응답을 해석하는 최소 규칙

| 항목 | 화면에서 지켜야 할 의미 |
|---|---|
| `score=null` | 정상적인 값 없음. 0점·안전·이전 성공값으로 치환하지 않는다. 현재 공개 숫자는 제공하지 않는다. |
| 지원·안전·환경·선호·추천·품질 | 서로 별개 계층이다. 좋은 원자료로 공식 제한이나 확인 불가를 가리지 않는다. |
| `target_id` | nullable assessment_id 대신 사용할 안정 식별자의 일부다. 모델/파라미터 버전·전체 context와 함께 중복을 제거한다. support의 target_id는 별도 지원 레코드 키다. |
| `envelope.as_of` | 이번 읽기에 허용한 정보의 cutoff. 다음 페이지에 고정하여 재사용한다. |
| `row.as_of`, `evaluated_at` | 저장 평가의 불변 지식 cutoff와 계산 시각. 저장 평가 없는 target 행에서는 null이다. 조회 cutoff와 같게 덮어쓰지 않는다. |
| `queried_at` | 조회 시각이며 관측·예보 발표·평가 시각을 대신하지 않는다. |
| `target` | instant 또는 원래 interval이다. 요청 일부와 겹쳐도 자르거나 시간별 복제하지 않는다. |
| `coverage` | 자료의 시간 범위다. 해당 장소의 활동 운영 지원인 support와 다르다. 빈 rows는 안전이나 활동 미지원의 증거가 아니다. |
| 품질 개수 null | 요구목록 자체가 미확정이다. 0개 검사 완료·0% 신뢰도로 표시하지 않는다. |
| `inputs[].used_by=[]` | 참고·제외 진단 자료다. 점수 기여도나 과거 평가 입력으로 설명하지 않는다. |
| `mode` | 실제 사용 입력의 observation/forecast/mixed/none이다. 참고 예보만 있는 none을 예보 계산 완료로 표시하지 않는다. |

공개 숫자를 받을 수 있는 미래 조건은 validated·외부검증 통과·해당 scope·출시 게이트 통과와 지원/안전/입력 조건 충족이다. experimental/candidate/contract-fixture-only 숫자는 현재 공개 UI에서 받을 수 있는 정상 사례가 아니다. 이 문서의 규칙을 근거로 프론트에서 점수 계산이나 모델 활성화를 추가하지 않는다.

`support.source_evidence`와 `safety.warnings/restrictions`는 원기관·원레코드·적용 활동/장소·효력·확인 시각을 보존한다. 이 필드는 공급자가 임의로 올리는 공개 요청 본문이 아니라 trusted producer의 내부 계약에서 나온다. 프론트는 기관명이나 `authoritative=true` 문자열을 자체 검사하여 새로운 지원/안전 판정을 만들지 않는다. 원기관 매핑·승인 운영 절차는 아직 연결되지 않았다.

활동 지원은 원target 전체에 유효한 근거가 필요하다. 공식 주의·제한은 target 일부에만 적용되어도 버리지 않는다. 이 경우 `partial_safety_coverage`와 각 notice의 원래 valid_from/valid_until을 함께 표시한다. 행의 target을 제한 구간으로 자르거나 제한이 전체 시간에 동일하게 적용되는 것으로 늘리지 않는다. restricted는 해당 원target 전체를 제한 없는 선택으로 제시할 수 없다는 뜻이며, 실제 제한 시간은 notice에서 확인한다.

현재 순수 판정기가 생성하는 메시지는 다음과 같다. 미래 상태의 표시 어휘가 정의되었다는 사실과 현재 그 상태를 생성할 수 있다는 사실을 구분한다.

| 조건 | recommendation.status | message_code |
|---|---|---|
| 명시적 미지원 | not_supported | ACTIVITY_NOT_SUPPORTED |
| 지원 미확인 | check_required | CHECK_ACTIVITY_SUPPORT |
| 지원 확인·공식 제한 적용 | do_not_proceed | ACTIVITY_RESTRICTED |
| 지원 확인·안전 확인 미완료 | check_required | CHECK_ACTIVITY_CONDITIONS |
| 미래에 승인된 안전 검사 완료·주의 상태 | conditional_information | CONDITIONAL_ACTIVITY_INFORMATION |
| 미래에 안전 확인 완료·환경 결과 없음 | unavailable | ASSESSMENT_UNAVAILABLE |
| 미래에 지원·안전·공개 환경 결과 조건 충족 | information_only | ENVIRONMENT_INDEX_INFORMATION |

마지막 세 행은 현재 미승인 안전 목록과 미구현 수치 모델에서는 공개 평가로 도달하지 않는다. support unknown이면 독립 경고를 보존하면서도 recommendation을 `do_not_proceed`로 임의 변경하지 않는다. 함께 내려온 `recommendation.action_codes`의 공식 정보 확인 안내를 표시한다.

## 요청·오류·정상 부재

현재 [QueryParams](../../../backend/app/water_index/api.py)는 다음 요청 계약을 구현한다. [registry.py](../../../backend/app/water_index/registry.py)의 `CONTEXT_PROFILES`는 비개인화 라우팅 이름인 `general`만 등록한다.

| query | 구현 규칙 |
|---|---|
| spot_id, activity | 한 장소의 양의 정수 ID와 여섯 등록 활동 코드; 모두 필수 |
| from, until | offset을 포함한 ISO8601 시각; `[from,until)`, 양의 길이, UTC 경과시간 최대31일 |
| profile_id, mode | assessments에서는 각각 `general`, observation/forecast를 명시해야 함 |
| support/coverage의 profile_id, mode | 생략 시 general/forecast로 정규화하며 응답 query에 해당 값을 명시 |
| as_of | 선택; 생략 시 한 번 고정한 조회 시각, 미래 값 거부. 페이지 이동 시 첫 envelope 값을 재사용 |
| page, page_size | page 1–1000, 기본1; page_size 1–100, 기본25 |
| 모델 선택·개인정보·그 외 query | 공개 매개변수가 아님. 미정의/중복 매개변수 거부 |

예시는 requestData에 넘길 **상대 경로 구성법**이며 실제 장소·날짜의 데이터 존재를 보장하지 않는다. 실제 ID·원기간·등록 query를 URLSearchParams로 구성하고 offset의 `+`를 문자열로 직접 이어 붙이지 않는다. 조회를 보낸 사실만으로 지원/평가 manifest가 생성되지 않는다.

- 정상 null 평가와 정상 빈 페이지는 HTTP200이며 상세 상태를 읽는다.
- 알 수 없는 장소는404, 잘못된 시간·프로필·범위·미등록 매개변수는422다.
- 재현할 수 없는 과거 cutoff는422 `history_not_reproducible`이며 정상 null로 바꾸지 않는다.
- 중첩 목록 한계를 초과하면422 `response_scope_too_large`다. 일부 필수 lineage/경고를 자른 성공 응답을 기대하지 않는다.
- 저장 자료를 읽을 수 없는503과 네트워크 오류는 자료 부재와 다르다. 기존 Error의 안전한 detail을 표시하고 fallback 데이터는 쓰지 않는다.

알 수 없는 enum과 불변조건 위반은 해석 실패로 처리한다. 새 reason code는 원문 코드를 보존하되 ‘좋음/안전’으로 기본 해석하지 않는다. 기존 general/family 표시명에서 사용자의 나이·감독·건강·장비를 추정하지 않는다. 민감한 문맥을 GET URL에 넣지 않는다.

## 실제 구현 연결표와 인계 상태

| 확인 항목 | 상태 |
|---|---|
| route·query·DTO 구현 파일과 공개 registry | main.py에 router 등록; api.py의 QueryParams/Envelope/SupportEnvelope/SupportRow/Coverage; models.py의 AssessmentDTO; registry.py의 general만 등록을 텍스트 확인 |
| 서비스의 기본 null·지원/검사 미구현 동작 | engine.evaluate와 AssessmentDTO가 숫자 및 미승인 안전 완료 상태를 거부. 테스트별 범위는 구현 기록 참조 |
| GET 읽기 전용·기존 data API 보존 | API45·실제 저장13·service12·실제 DB→HTTP 통합1과 기존 백엔드 회귀104 포함 전체240개 통과. engine65 포함; 세부 분모/환경은 구현 기록 참조 |
| 프론트 실제 API 연결 | 이번 작업에서 변경하지 않음. 기존 프론트12테스트·lint/build 통과와 신규 평가 UI 연결 검증은 별개 |
| 한국 선호/쾌적 보정 및 출시 숫자 | 미구현·미검증; 모델 파라미터 미정 |
| 실제 장소 지원/관측소 매핑/필수 검사 운영 자료 | 검수된 manifest가 없는 범위는 준비되지 않음; 자동 활성화하지 않음 |

연동 담당자는 이 문서의 실제 DTO와 [구현 기록](implementation_notes.md), [검사 결과](checks.json)를 함께 확인하여 연결한다. [실제 HTTP 응답 사례](api_response_examples.json)는 폐기 DB의 합성 통합 검사에서 캡처한 unpublished/official_restriction/support/outside_forecast_horizon/historical_replay 5개다. 실제 DTO를 확인할 때 사용하되 production 자료·seed·네트워크 fallback으로 쓰지 않는다. 문서용 [설계 예시](../../design/water-travel-index/api_examples.json)도 운영 데이터가 아니다.
