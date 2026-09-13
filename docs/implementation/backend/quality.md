# A8 수질 교차검증 구현·인계

요구사항: `backend/BACKEND_GOAL.md` A8. 참고 출처와 레거시 중복 분류는 [reference_inventory.md](reference_inventory.md). 상태: **입력·저장·분석·worker·조회 코드 및 격리 시험 구현**, 공식 자료 ingestion 재사용, 실제 사용자 리뷰와 NLP 현장 검증/운영 활성화는 미완료다. 과학적 신뢰도 백분율·수영 안전 판정은 구현 결과가 아니다.

## 실행 경로와 저장

| 경로 | 역할 |
|---|---|
| `app/quality/models.py` | 리뷰/현장관찰·별도 계측·공식 시료·공개 응답 DTO 및 범위/시간 검증 |
| `app/quality/engine.py` | 결정적 관찰 신호 추출, 부정/불확실 표현, 중복 제거, 최신 revision, 장소·채수 기간·단위·방법·층 비교와 수치 차이 |
| `app/quality/storage.py` | SSO 소유자별 불변 revision 쓰기, 충돌/순서/장소 변경 차단, 읽기 projection |
| `app/quality/service.py` | 독립 worker producer `run_quality_job(settings, now=None)` |
| `app/quality/migrations.py` | `migrate(connection)`, root의 명시적 `app.schema --initialize`와 통합 |
| `app/quality/api.py` | `/api/data/quality` 조회와 인증된 관찰 변경 계약 |

실제 `pongdang_data`에 `quality_observation`, `quality_analysis`, `quality_job_cursor`를 추가한다. 앞 두 테이블은 UPDATE/DELETE를 거부하는 DB trigger로 보호한다. 철회는 `retracted=true`인 다음 revision을 추가한다. 수정이 과거 내용을 덮어쓰지 않는다. 같은 owner/review/revision의 같은 입력은 멱등 반환, 다른 입력은 `409 revision_conflict`, revision 건너뛰기/과거 revision 재삽입은 `409 revision_out_of_order`다. 장소를 수정 revision으로 바꾸지 않는다. 새 장소 관찰은 새 review_id를 사용한다.

worker는 장소를 ID 순서로 최대 100개씩 처리하고 DB cursor를 커밋한다. 장소당 최근 31일의 공식 시료 100개와 최신 리뷰 revision 100개까지 사용하며 101번째를 조회해 범위 절단을 명시한다. 각 공식 시료의 단위/층/측정법/일 단위 시각 정밀도를 보존한다. 기존 `water_index_station_mapping`의 검토된 공간 연결을 소비하며 해당 채수 구간을 포괄하는 단일 유효 mapping만 사용한다. 서로 충돌하는 mapping은 선택하지 않는다. 연결이 없으면 가까운 관측소를 자동으로 연결하지 않는다.

장소 자체가 관측점이면 `place_relation=station_observation_point`, 검토된 연결이 있으면 `representative_station`이며 원래 `source_spot_id`, station ID, mapping ID/버전/범위/공개 근거 페이지를 남긴다. 대표 관측소의 수질을 여행 장소에서 직접 채수한 것으로 표시하지 않는다.

15분 computation slot + 입력 revision identity로 재실행을 멱등 처리한다. 실행이 실패하면 트랜잭션이 롤백되며 root의 기존 worker job lock/due/backoff/heartbeat가 재시도한다. startup/GET에서 seed·수집·분석 저장을 실행하지 않는다. 31일은 저장 분석의 조회 범위이며 시료의 유효기간이나 안전 기준이 아니다. 1시간 지난 분석은 조회 시 `freshness=stale`로 표시한다. 이 1시간은 worker 지연 표시 규칙이며 수질 안전 임계값이 아니다.

## 조회 API

`GET /pongdang/api/data/quality/comparisons?spot_id=123&page=1&page_size=25`

애플리케이션 내부 prefix는 `/api/data/quality`; 배포 ingress가 `/pongdang`을 적용한다. 기존 프론트 API client의 BASE_URL과 경로를 그대로 사용한다. `spot_id`는 선택 사항이며 생략하면 장소별 최신 저장 분석을 ID 순서로 페이지 조회한다. `as_of`를 ISO8601 offset 시각으로 지정하면 그때 실제 DB에 저장되어 있던 분석만 읽는다. 미래 cutoff, 중복/미인식 쿼리, 100행 초과 요청은 `422 invalid_request`다. `as_of` 미지정은 현재 읽기 cutoff다.

응답은 OpenAPI의 `ComparisonEnvelope`와 `ComparisonRow` 스키마를 사용한다. `rows`는 최대 100행, `from`/`until`은 **해당 저장 분석의 최근 31일 관찰 범위**다. 사용자 선택 날짜를 억지로 채우거나 GET에서 새 범위 분석을 계산하지 않는다. 저장 분석이 없으면 envelope `status=analysis_pending`, `rows=[]`, reason `no_persisted_analysis_for_period`다. 분석에 실제 리뷰가 없으면 행 `status=no_review_data`다. DB 장애는 `503 quality_unavailable`로 구분한다.

| 행 status | 의미 |
|---|---|
| `no_review_data` | 범위 내 실제 활성 리뷰가 없음. 철회/범위 밖 정정은 이전 관찰을 다시 사용하지 않음 |
| `no_official_data` | 리뷰는 있으나 사용 가능한 공식 시료가 없음 |
| `not_comparable` | 장소 대표 관계가 미확인되었거나 공식 채수 기간과 겹치지 않음 |
| `conflicting_observations` | 탁함/맑음 또는 같은 신호의 있음/없음 관찰이 상충 |
| `measurements_compared` | 항목·단위·방법·대표층·채수 구간이 일치하는 계측값의 실제 차이를 계산 |
| `observation_signals_present` | 공식 시료와 비교 기간·장소가 맞는 리뷰에 탁함/냄새/쓰레기 신호가 있음. 공식 수질등급 반박이 아님 |
| `context_only` | 비교 기간·장소가 맞지만 공인 검사와 동등한 측정 결론을 낼 수 없는 관찰 문맥 |

`sample_count`는 정규화 중복을 제거한 리뷰 수다. `independent_observer_count`는 SSO subject별 수이며 실제 독립 표본을 과학적으로 인증한 숫자가 아니다. 2명 미만이면 `insufficient_independent_observers`를 추가한다. 2명 이상도 통계적 유의성/대표성 통과를 뜻하지 않는다. `comparable_review_count`, `duplicate_count`, `official_sample_count`, `latest_review_at`, `review_age_seconds`, `input_truncated`, `reason_codes`를 함께 표시한다.

`official_sources`는 공식 snapshot ID, 원 제공처 source record ID와 revision digest, 원 관측점/공간 mapping, 발표/채수/수집/만료 시각, 단위/측정법, 원 등급이다. `review_evidence`는 관찰 ID/revision/입력 종류/시각·공간 관계의 최소 공개 출처다. 전체 리뷰 원문과 소유자 키는 공개 결과로 나가지 않는다. `signals`에는 관찰 근거 ID·분석 버전·원문 offset·규칙 ID·신호 분류·있음/없음/모호함이 남는다. 본인 원문은 인증된 관찰 이력 API에서 확인할 수 있다.

`measurement_comparisons`는 `reported_value - official_value` 차이를 반환하며 알려지지 않은 단위·측정법, 다른 항목/단위/층·채수 기간, 결측·비유한 차이는 `not_comparable`와 null 차이다. 단위 변환이나 허용 오차를 추정하지 않는다. 일 단위 채수 정보는 그 일의 범위로만 비교하며 동일 순간/동일 시료임을 주장하지 않는다. `agreement=unknown`은 검증된 불확실성·허용오차 모델이 없다는 뜻이다. 공인 수질등급과 감각 표현을 수치로 환산해 빼지 않는다.

`confidence_percent=null`, `official_grade_override=null`, `safety_status=unknown`, `model_validation_status=not_validated`는 고정된 진실성 계약이다. `historical_official_samples_not_current_certification`은 과거 시료가 현재 입수 안전 인증이 아님을 나타낸다. 관찰 신호의 시각적 불일치를 공식 등급 변조로 표시하지 않는다.

## 인증된 실제 리뷰 입력

`POST /pongdang/api/data/quality/observations`와 `GET /pongdang/api/data/quality/observations?page=1&page_size=25`는 공통 `app.auth.require_principal`을 쓴다. 기존 Bonifacio SSO subject/grant를 사용하고 별도 계정·로그인·세션 DB를 만들지 않는다. origin과 서버 ingress secret 전달 설정은 [notifications.md](notifications.md)의 공통 SSO 인계를 따른다. 브라우저가 서버 token이나 다른 subject를 직접 지정해서는 안 된다. ingress 구성 확인 전에는 fail-closed(설정 없음 503, 인증 실패 401, 권한/Origin 실패 403)다.

쓰기 body:

- `review_id`: 작성자 안에서 안정적인 `[A-Za-z0-9_-]` ID, 최대 120자.
- `revision`: 1부터 시작하는 연속 정수. 수정·철회 모두 다음 정수.
- `spot_id`: 실제 `spots_waterspot` ID.
- `kind`: `review` 또는 `field_observation`.
- `observed_at`, 선택적 `observed_until`: offset 시각. 관찰 구간은 양수이며 최대 하루, 미래 관찰은 거부.
- `timezone`: 유효 IANA timezone, 기본 `Asia/Seoul`.
- `spatial_relation`: 작성자가 신고한 `at_spot`/`nearby`/`unknown`. 본인 신고 자체가 공인 지점 확인은 아니다.
- `text`: 실제 관찰 내용 1–4000자.
- `source_record_id`: 선택적 원자료 식별자(credential/URL을 넣지 않음).
- `measurements`: 선택적 최대 20개. `item`, nullable `value/unit/method/scope`, `sampled_at`, nullable `sampled_until`, `sample_precision`을 입력. 관찰 구간 밖 채수는 거부.
- `retracted`: 기본 false, 철회 revision에서 true.

POST는 원문 입력 API이지 원제공처 payload/SQL/임의 URL import API가 아니다. 제공기관/공식등급을 클라이언트가 지정할 수 없다. receipt의 `analysis_pending`은 worker가 아직 후속 분석을 저장하지 않았다는 뜻이다. 본인 이력은 자신의 모든 revision만 반환한다. 다른 사람의 review_id를 아는 것만으로 그 사람의 기록을 조회·수정할 수 없다.

## 프론트 연결

기존 `frontend/src/WaterQualityPage.tsx`의 `교차검증 결과` 패널에 comparisons를 전용 DTO/hook으로 바인딩할 수 있다. 기존 FeatureData 원자료 표는 유지한다. `no_review_data`를 “실제 리뷰 없음”, `analysis_pending`을 “저장 분석 대기”, `quality_unavailable`을 오류로 구분한다. 결과를 일반 자료표 타입으로 단언하거나 confidence null을 0%로 변환하지 않는다. 리뷰 작성/수정/철회 화면은 현재 없으므로 위 API와 OpenAPI 스키마로 별도 프론트 작업에 인계한다.

## 검증과 남은 의존성

- `test_quality_engine.py`: 격리 엔진 36개 테스트 통과 확인. 부정/복수부정/절 경계, 중복, revision/철회, 장소/채수 시각, 단위/방법/층/항목, delta, 결측/만료/미래근거를 검증했다.
- `test_quality_api.py`: 쿼리 상한/중복/미래 cutoff, DB 장애, OpenAPI, 인증 실패, 소유자 주입, 충돌·오류 노출 방지 시험.
- `test_quality_integration.py`: disposable `pongdang_test`만 허용. SourceBatch→정규화 저장→인증 입력→job→HTTP 결과→provider 정정→as_of replay→철회·불변 trigger·GET 무쓰기 시험. 최종 통합 실행 결과는 root 전체 검증 기록으로 갱신한다.
- `ruff check` 및 `ruff format`을 A8 소유 코드/테스트에 실행했다.

소프트웨어 테스트는 테스트 fixture에 대한 실행 증거이며 실제 리뷰나 실측/현장검증 자료가 아니다. 실제 운영 리뷰를 생성하거나 기존 퇴역 synthetic seed를 복구하지 않았다. KOEM/NIER ingestion의 기존 성공 보고를 이번 작업의 실수신 증거로 다시 주장하지 않는다.

실제 데이터 연결을 검증하려면 기존 수질 API 승인·서버 키, 해당 장소/채수 시점에 맞는 검토된 station mapping, 이용 동의를 받은 실제 리뷰, 검사 방법·단위 메타데이터를 제공해야 한다. 현 한국어/영어 규칙은 명시적 부정·모호함의 보수적 baseline이며 sarcasm/복잡한 문장/시간지시/다국어를 모두 해결한 NLP 모델이 아니다. 전문가 라벨이 있는 비식별 리뷰 gold set으로 precision/recall 및 부정·시간·장소 오류를 검증하기 전에는 확률·등급 판정으로 승격하지 않는다. 운영 쓰기 활성화는 기존 SSO ingress 전달 설정과 Origin 설정을 검토한 뒤 별도 운영 절차에서 한다.

2026-09-14 추가 검증: 임시 격리 Python 3.14.4 runtime에서 엔진 38개 + API 4개 = **42개 통과**. 수치 차이 overflow와 시간지시어 모호함 시험을 추가했다. 전체 root DB 검증에서 A8 `test_quality_integration.py`도 통과했다. 로컬 `.venv` 파일 hydration 지연으로 최초 HTTP test 시작이 늦어져 `/tmp/pongdang-runtime-20260914/bin/python`을 사용했다. 이 환경 차이는 테스트 생략이나 결과 대체가 아니다. 전체 suite의 최종 수치는 root의 전체 검증 기록을 따른다.
