# 수동 수집 및 점수 갱신 연결

- 목표: 사용자의 수동 갱신을 기존 worker의 외부 동적 자료 수집과 공통 점수 재계산까지 연결한다. HTTP 요청에서는 외부 제공처를 호출하지 않는다.
- `app.refresh.api.create_router(settings)`를 root가 main에 등록했고, `app.refresh.migrations.migrate_refresh(connection)`를 explicit schema migration에 연결했다. 요청의 SSO, access-pongdang grant, Origin/CSRF 검증은 기존 require_principal을 재사용한다.
- POST `/api/data/refresh`의 빈 JSON은 durable 요청을 만들며, 진행 중 요청은 하나로 합친다. GET `/api/data/refresh/{request_id}`는 read-only 상태 조회다. 사용자 식별자·키·외부 payload는 저장 또는 노출하지 않는다.
- worker는 동적 자료 job → forecast_projection → water_index_evaluation → quality_comparison → condition_projection 순으로 수동 작업을 처리한다. 정적 장소·관측소 카탈로그·사진·상세·행정 주소·알림 발송은 수동 대상에서 제외했다. configured dynamic provider가 전혀 없거나 condition_projection이 없으면 실패로 표시한다.
- per-job advisory lock, persisted next_run/backoff/heartbeat를 보존한다. 이미 요청 이후 시작해 끝난 자동 작업은 재호출 없이 합친다. 실패 backoff 중인 작업은 강제로 재시도하지 않으며 실패 목록에 반영한다. partial/no_data도 전체 성공으로 표시하지 않는다.
- 자동 외부 수집 및 외부 continuation의 최소 간격은 600초이고 기존 긴 간격은 유지한다. 내부 알림·heartbeat 주기는 별도다. queue는 유휴 시 최대 2초, 자동 실행 중에는 개별 job 경계에서 확인한다.
- condition_projection은 자동 전체 job 목록 마지막에 실행한다. root의 `condition_storage.projection_due(connection)`로 원자료 개정이나 새 날짜를 확인하여 저장 점수가 무효면 즉시 재계산하되 기존 실패 backoff는 유지한다.
- 검증: 전용 disposable PostgreSQL18 `pongdang_test`에서 새 refresh 테스트 19개(원자료 변경 시 자동 점수 재계산 및 실패 backoff 포함), 기존 collection/feature worker 회귀 23개를 함께 실행하여 42 passed(13.75초). Ruff 관련 파일 통과.
- workspace `.venv`의 pydantic pyc와 이후 app pyc 읽기에 pytest가 정체되어 해당 테스트 프로세스만 종료했다. 이미 설치된 cache Python3.14 환경과 `/tmp/pongdang-refresh-pycache` bytecode 경로로 live workspace 소스를 최종 검증했다. 외부 API 키는 테스트 환경에서 비웠고 실제 외부 요청·배포·운영 DB 접근은 수행하지 않았다.

## 기존 조건·추천 회귀 fixture 후속 보완

- 대상은 `test_condition_score.py`, `test_condition_score_integration.py`, `test_activity_score_integration.py`, `test_recommendation_integration.py`, `test_default_place.py`, `test_feature_migration.py` 여섯 파일이다.
- 저장 snapshot GET 전에 테스트 setup에서 `produce_conditions`를 명시 실행하고, 실제 GET 전후의 기존 read-only·점수·결측·상태 assertion은 그대로 유지했다. 같은 HTTP client 안에서 원자료를 바꾼 뒤 다시 GET하는 경우에도 worker pass를 명시했다. 사용자 기준 POST 및 과거 as_of 검증은 기존 raw 경로를 유지한다.
- unit fixture는 저장 reader mock을 추가했다. v4 migration fixture는 기존 place-details/catalog skip을 보존하고 score-refresh migration도 skip하여 실제 v4 시작 상태를 유지한다.
- 여섯 파일 첫 실행: 144개 중 142 passed, default-place fallback 2개 failed. default-place도 저장 점수를 사용하므로 누락된 worker setup을 보완했고, 해당 파일 5개 전체 통과. 마지막 setup 순서·중복 monkeypatch 정리 영향 대상 10개를 다시 실행해 10 passed(3.42초), 관련 Ruff 통과. 실패 기대값·assertion을 약화하거나 삭제하지 않았고 별도 production 코드 수정은 없었다.

## 기존 브라우저 계약 검증

- `browser_contract_server.py`의 모든 수집 fixture setup 뒤, create_app 이전에 `produce_conditions(settings)`를 한 번 실행하도록 추가했다. 운영 startup이나 HTTP에서 계산하는 코드는 추가하지 않았다.
- Node24.19 및 cache Python3.14로 별도 임시 Playwright config를 사용했다. 프런트5177·백엔드8165, 전용 PostgreSQL18 pongdang_test만 사용했고 서버 Settings는 `_env_file=None`, provider 키는 빈 값이었다. 브라우저는 loopback 이외의 요청을 폐쇄된 로컬 proxy로 보내 실제 upstream 접근을 차단했다. 기존 production Playwright 설정은 변경하지 않았다.
- 기존 browser159개 전체1회:154 passed/5 failed(7.3분). 실패중3개는 바뀐 계약의 fixture에 맞춰 최소 수정했다: default-place 요청관찰에 조건series 포함, 알림자동갱신 clock600초, 병행 알림UI의 실제 loading 문구. 점수/장소ID/저장성공·재조회·저장행 assertion은 보존했다.
- 나머지2개(데스크톱 코스reload, 여러화면sidebar순회)는 첫실행 도중 frontend notification source HMR이 있었으며, 소스가 안정된 뒤 테스트수정 없이 통과했다. HMR이 실제 원인이었는지는 단정하지 않는다.
- 실패했던5개만 다시 실행해5 passed(21.7초). 전체159개를 반복실행하지 않았다. 변경browser3파일 ESLint, backendfixture Ruff 및 관련 diffcheck 통과. 임시web서버는 테스트종료와함께 내려갔다.
- 임시 config·trace·screenshots는 `/Users/cksmacbook/.cache/pongdang-refresh-frontend-20260921`에 있으며 첫전체실행은 `test-results-score-contracts`, 재검증은 `test-results-score-failed-retry`에 남겼다.

## 명시적 과거 조회의 API 호환

- `/conditions`와 추천의 활동 reader는 공통 `is_historical_query` 판정을 사용한다. 명시적 `as_of`, 명시적 observation `at`, KST 오늘 자정 이전 forecast `at`는 기존 읽기 전용 원자료 경로를 유지한다. 미래 관측·31일 범위 검증도 그대로다.
- `at`를 생략한 현재 조회와 오늘 이후 예보는 worker 저장 결과를 읽는다. `read_activities`와 단독 `read_activity` 모두 현재 관측·예보 fallback을 한 SELECT로 읽으며, series API·계산식·모델·프런트는 변경하지 않았다.
- 새 DB fixture 2개로 같은 날 10분 전 관측과 전날 예보를 각각 조회했다. 단일 conditions 및 추천의 모든 활동 응답이 기존 raw reader의 전체 JSON과 같고, 더 최근의 다른 값으로 대체되지 않으며, 원자료·점수 저장 행 수가 조회 전후 동일함을 검증했다.
- 첫 관련 검사 95개 중 94개 통과. 남은 1개는 첫 fixture에 이전 browser 실행의 generation 1개가 남아 있어 `generation=0`을 단정한 테스트 오류였다. 새 테스트의 목적대로 조회 전후 저장 행 수가 같음을 확인하도록 수정했다. 현재 GET 무계산 회귀와 KST 경계 unit 검사는 이 첫 실행에서 통과했다.
- 보완 후 실행은 중단 시점에 최종 로그·종료코드를 회수할 수 없어 통과로 집계하지 않았다. 재개 후 해당 프로세스가 없고 최종 출력이 유실된 것을 확인한 다음, 새 역사조회·현재 활동 single-SELECT 6개와 기존 조건·추천 integration만 실행해 **41 passed, 38.72초** 및 종료코드 0을 확인했다. 이미 통과한 unit·현재 GET 무계산 검사는 반복하지 않았다.
- 변경 production·test 4개 파일 Ruff와 관련 diffcheck 통과. 전용 51654 `pongdang_test`와 빈 provider 키만 사용했다. 최종 로그는 `/tmp/pongdang-historical-refresh-pytest.log`, JUnit은 `/tmp/pongdang-historical-refresh-junit.xml`에 남겼다. DB 종료는 부모 작업에서 처리한다.
