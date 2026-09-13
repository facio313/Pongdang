# 물 여행 지수 백엔드 구현 기록

2026-09-14 · 채택 계약 `water-assessment.v1-draft` · 숫자 모델과 실서비스 자동 활성화 없음

현재 구현은 **결정론적 지원·제한·입력 상태 판정, 불변 평가 근거 저장, 저장된 평가의 읽기 API**다. 활동별 점수 곡선·가중치와 필수 안전 확인목록이 미정이므로 환경 점수·선호 순위는 null, 모델의 과학적 검증 상태는 unimplemented/not_evaluated다. 구현 테스트의 성공으로 이를 validated로 바꾸지 않는다.

| 문서 | 내용 |
|---|---|
| [implementation_notes.md](implementation_notes.md) | 구현 범위, 근거·버전·저장 경계, 명세 44사례와 실제 테스트의 대응, 확보되지 않은 자료와 활성화 조건 |
| [frontend_handoff.md](frontend_handoff.md) | 기존 디자인을 유지하는 최소 연동, 실제 필드·시간·문구·nullable 값, general 프로필과 관측/예보 요청 |
| [api_response_examples.json](api_response_examples.json) | 폐기용 DB의 합성 소프트웨어 통합 사례를 실제 HTTP로 읽은 응답. 운영 데이터·seed·fallback·선호 성능 자료가 아님 |
| [checks.json](checks.json) / [backend_test_results.txt](backend_test_results.txt) | 실행 명령·환경·검사 결과 및 기존 파일 보존 기록 |
| [source_baseline.json](source_baseline.json) | 시작 브랜치·커밋과 기존 파일229개 해시. 기존 미커밋 변경을 포함한 작업 트리 기준 |

## 구현 경로

- [engine.py](../../../backend/app/water_index/engine.py)의 `evaluate(EvaluationRequest)`는 명시적으로 주어진 시각·근거·대상을 검사하는 순수 함수다. DB·네트워크·현재 시각·난수·런타임 LLM을 호출하지 않는다. 직접 공식 제한은 알려진 범위로 보존하며, 필수 확인자료 부재를 안전으로 해석하지 않는다.
- [adapters.py](../../../backend/app/water_index/adapters.py)의 `input_from_records`는 기존 정규화된 snapshot/metric을 원ID·숫자·단위·관측/예보·시각 의미를 보존해 투영한다. 자료 수집, 장소 매핑 승인, 수치 보간·등급 점수화를 수행하지 않는다.
- [service.py](../../../backend/app/water_index/service.py)의 `prepare_evaluation`은 전체 요청과 모델 근거 묶음으로 결정론적 식별자를 만든다. `evaluate_and_store`는 그 요청을 평가하고 [storage.py](../../../backend/app/water_index/storage.py)를 통해 target·전체 입력 요청·원기관 근거·파라미터/근거 hash·평가를 원자적으로 저장한다.
- 평가를 저장하는 것과 공개 조회 대상을 선택하는 것은 별도다. 준비된 producer가 정확한 대상·활동·문맥·제공창·만료·선택을 담은 `ReadManifest`를 명시적으로 저장해야 읽기에 나타난다. 동일 ID의 내용을 바꾸거나 재저장으로 유효기간을 연장할 수 없다. 현재 실제 기관 자료를 이 manifest로 승인·연결하는 자동 producer는 활성화하지 않았다.
- [api.py](../../../backend/app/water_index/api.py)는 `/api/data/water-index/assessments`, `/support`, `/coverage`를 제공한다. GET은 읽기 전용이며 점수 계산·수집·ID/manifest 쓰기를 하지 않는다. 기존 `/api/data/catalog`, `/summary`, `/datasets/{key}`를 유지한다. 평가 API는 결과 캐시를 두지 않고 `Cache-Control: no-store`를 반환한다.
- [migrations.py](../../../backend/app/water_index/migrations.py)는 비어 있는 이력 테이블4개를 더하는 schema v4다. [app.schema](../../../backend/app/schema.py)의 명시적 초기화/이전 경로에서만 적용하며 앱 시작과 GET에서 migration·seed를 실행하지 않는다. 운영 DB 적용은 수행하지 않았다.

## 채택 명세를 구체화한 사항

명세의 source reference를 실제로 추적할 수 있게 지원 응답의 `source_evidence`와 안전 notice에 원기관 ID·발표/수집·적용 범위를 추가했다. 계산을 실행한 평가의 `input_manifest_id`는 실제 선택 입력뿐 아니라 제외 입력과 **전체 평가 요청**을 고정한다. 입력이 없는 상태를 판정했어도 해당 요청과 미정 파라미터를 재현한다. 아직 평가를 실행하지 않은 target-only 행의 assessment_id/as_of/evaluated_at/input_manifest_id는 모두 null이다. 사용 입력 여부와 최상위 mode는 여전히 `inputs[].used_by`로 구분한다.

지원 근거는 활동의 전체 대상 기간을 확인해야 한다. 공식 제한·주의가 대상의 일부 기간에만 적용되는 경우에는 원래 제한 구간과 부분 적용 사유를 보존하고 그 영향을 숨기지 않는다. 대상 기간을 잘라 새로운 예보/점수로 만들지 않는다.

기본 공개 registry는 `general` 문맥 하나다. 나이·건강·장비·숙련 정보가 확인됐다는 뜻이 아니다. assessments는 profile_id와 mode를 필수로 받고, support/coverage는 생략 시 general/forecast의 저장 조회 문맥으로 정규화한다. 임의 모델·버전·experimental query를 허용하지 않는다. 새로운 문맥이나 모델 버전은 별도 검수·registry 변경·새 manifest가 필요하며, 기존 식별자의 의미를 변경하지 않는다.

API 페이지·시간창·중첩 목록 상한은 채택 운영 파라미터를 따른다. 내부 읽기 manifest의 최대 target 선택 수100,000은 페이지 최대1,000×최대100의 저장 부하 상한이며 과학적 모델 파라미터나 예보 기간이 아니다. 원시 시간 집계, 제공처/관측소 매핑, 새 단위 변환을 모델 입력으로 승인하는 정책은 이번 산술 helper 구현만으로 활성화되지 않는다.

## 실행·활성화의 경계

프론트엔드 실행 코드·CSS·디자인, 기존 연구·설계 산출물, 수집 adapter와 worker, DB allowlist, 배포 설정은 변경하지 않았다. 기존 수정 파일 중 이번 구현이 덧붙인 것은 main.py의 router 등록, schema.py의 v4 분기, 기존 schema 버전 검사 테스트의 상수 참조다. 그 밖의 변경은 새 water_index 패키지·테스트와 이 문서 디렉터리다.

실제 서비스에서 평가를 제공하려면 독립 Pongdang DB의 명시적 v4 migration, 운영 근거를 검수해 불변 manifest를 만드는 producer, 실제 장소·활동 지원과 공식 제한의 구역/효력/신선도 계약이 필요하다. 숫자 지수를 제공하려면 추가로 활동·대상별 파라미터 확정, 한국 사용자 결과 자료와 장소/계절을 분리한 외부 검증, 출시 게이트 승인이 필요하다. 현재 구현·합성 테스트는 이 조건을 대신하지 않는다. 운영 배포·main 푸시·운영 DB 변경은 이번 작업에 포함하지 않았다.
