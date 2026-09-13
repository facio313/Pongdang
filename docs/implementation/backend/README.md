# Pongdang A1–A8 백엔드 및 B AI 기반 인계

작성일: 2026-09-14 KST. 요구사항: `backend/BACKEND_GOAL.md`.
경수의 백엔드 구현 범위로 기존 수집·Water Index를 확장하고 DB→job→API→기존 결과 영역을 연결했다. 새 지도·달력·구독 설정·리뷰 입력·AI 대화 화면은 만들지 않았다. 기존 미커밋 결과를 시작 기준으로 보존했으며 운영 배포·main 병합/푸시·운영 DB 변경·host SSH gate 설치·실제 알림 발송은 수행하지 않았다.

## 기능별 상태와 한계

여기서 “구현”은 실제 처리·저장·조회 경로 및 격리 검증을 뜻한다. 모든 기능의 운영 활성화는 별도이며, 테스트 대역 결과를 실제 데이터 또는 모델 검증으로 간주하지 않는다.

| 기능 | 소프트웨어/실행 경로 | 이번 실제 자료 확인 | 프론트 연결/인계 | 모델·자료·운영 미완료 |
|---|---|---|---|---|
| A1 Water Index | 기존 판정기·불변 저장 확장; 실제 입력 producer, provenance, 명시 근거 등록, 5분 평가 job, assessments/support/coverage | 공식 예보·수온·조석을 입력으로 평가/manifest 저장 및 HTTP 읽기 | 기존 Water Index 결과 문구 연결 | **수치 환경 모델 자체는 `unimplemented`, 과학 검증은 `not_evaluated`**. 확정 파라미터·활동 지원·공식 제한/대표성 근거 부족. 임의 점수·순위 없음 |
| A2 Water Forecast | 공식 입력→불변 예보 revision→5분 projection; horizon·결측·issue time·정정 조회 | KMA 78개 예보, KHOA 20개 고저조 수신·98개 forecast revision 생성 | 기존 예보 상태/시간 문구 연결; 차트·달력 DTO 인계 | 공급자가 제공하지 않은 기간·발표시각은 생성하지 않음. 방문 추천 규칙/검증 미완료 |
| A3 Water Twin | bounded bbox·장소·활동·at/as_of·관측/예보 레이어 및 실제 A1/A2 결과 소비 | 공식 관측소 3개에서 저장→API 확인 | 기존 상세영역 연결; 실제 지도 UI 인계 | 여행 장소 대표 매핑 검수 필요. 과거 카탈로그 좌표/이름 완전 복원 미지원; null+이유 표시 |
| A4 수온 지도 | A3의 관측/예보 수온·단위·관측소·좌표·측정/수집/만료 시각 전용 조회 | KHOA 실제 수온 26건 수신·저장·조회 | 기존 지도 상세 문구와 공통 API 인계 | 관측소 직접 측정 범위만 확인. 여행지 대표성·보간·입수 안전 검증 없음 |
| A5 라이브캠 | 검수 공개 URL/조건/장소 불변 등록 CLI, 5분 HEAD 점검, 100행 조회; 101번째 이후도 순환 | 등록된 실제 검수 영상 없음→no_data | 기존 영상 영역 상태/공식 링크 연결; 재생 UI 인계 | 실제 공식 공개 URL·권리/임베드 조건·현장 연결·live 확인 필요. URL 접속 성공은 생중계 증거 아님 |
| A6 물때 타이머 | 공식 고저조 next_high/next_low/reference_at; 정정·자정 처리; 근거 있는 운영창 불변 CLI/API | KHOA 고저조 20건, 요청 기간 내 12건 HTTP 응답 | 기존 타이머 문구 연결; 공식 운영창 계약 인계 | 현장 운영창/통제 근거 미등록. 임의 간조 안전 시간창 없음 |
| A7 첫 입수 조건 알림 | SSO 소유자 구독 CRUD·연도/설정 revision·평가·이벤트·outbox·재시도·Resend adapter, 1분 job | 실제 구독/수신자 없음. 테스트 대역으로 provider 경계까지 확인 | 기존 본인 이벤트 영역 연결; 설정/해지 UI 인계 | SSO trusted header 설치·검증 수신자/발신자·발송 키 미설정. 실제 발송 꺼짐. 연간 이력 없으면 최초 unknown; 수온 조건은 입수 안전 아님 |
| A8 수질 교차검증 | SSO 현장 관찰 입력·불변 정정/철회; 부정/중복/상충·비교 조건·수치 차이 계산·15분 저장 job | 공식 관측소별 `no_review_data` 결과 저장/조회. 실제 리뷰 없음 | 기존 비교 상태 문구 연결; 리뷰 작성 UI 인계 | 실제 리뷰·비교 가능한 공인 검사·단위/방법/채수 범위 필요. 관찰 추출 NLP 현장검증 미완료; 근거 없는 신뢰도% 없음 |
| B AI 선행 | 공통 장소/활동/시간 DTO·제한 A API registry·결정적 fact 설명; 선택 Responses adapter·정확한 fact ID집합 검증·DB 호출/토큰/비용 상한 | 공식 수온→결정적 근거 설명 HTTP 확인 | 기존 화면에 새 영역 없음; GET/POST·설정 계약 인계 | 실제 모델 호출·품질/비용 실측 없음. provider/model/정확한 모델 단가/키 미설정. B1–B5 전체 제품은 범위 밖 |

## 구현 모듈·DB·job

명시적 스키마 버전은 **5**다. `python -m app.schema --initialize --remove-demo`가 기존 collection/Water Index를 보존하면서 새 테이블을 추가한다. v4→v5 보존·재실행, 기존 구버전 migration을 격리 PostgreSQL 18에서 검증한다. FastAPI startup/GET/worker startup에는 migration이나 seed가 없다. worker는 초기화를 완료한 DB에서만 실행한다.

| 모듈 | DB 추가/재사용 | 실행/주기 |
|---|---|---|
| `app/water_index/sources.py`, `producer.py` | 기존 target/input_manifest/assessment/read_manifest + station_mapping/authority_evidence/production_run | `water_index_evaluation`, 300초 |
| `app/forecast/` | `forecast_revision` | `forecast_projection`, 300초 |
| `app/twin/` | collection·station mapping·A1/A2 읽기 전용 재사용 | 요청당 bounded DB reads; 외부 호출/쓰기 없음 |
| `app/livecams/` | `livecam_revision`, `livecam_check` | 명시 등록 CLI + `livecam_checks`, 300초 |
| `app/tides/` | forecast revision + `tide_operating_window` | 고저조는 A2 projection; 운영창은 명시 CLI |
| `app/auth.py`, `app/notifications/` | subscription/evaluation/event/outbox/delivery_attempt | `condition_notifications`, 60초 |
| `app/quality/` | quality_observation/analysis/job_cursor | 인증 입력 + `quality_comparison`, 900초 |
| `app/ai/` | `ai_daily_budget` | GET 결정적 설명; 인증 POST 선택적 모델·atomic 예약 |

새 도메인 job은 `app/feature_jobs.py`에서 등록되고 기존 `app/ingestion/worker.py`의 DB advisory lock, persisted due time, 실패 backoff, heartbeat를 공유한다. processing 중 예외는 credentials를 포함하지 않는 오류 코드로 저장된다. 같은 근거의 projection 재실행은 `succeeded`, inserted=0일 수 있다. 이를 새 수집 성공 또는 자료 있음으로 해석하지 않는다.

조회 API는 `/api/data` 아래이며 기존 data_catalog allowlist·일반 자료표·폐기된 `/api/demo`, `/api/collector` 404를 보존한다. Docker DNS·컨테이너명·`postgres_data` volume·비공개 DB/API 포트도 유지한다. Compose 수정은 서버 설정 전달에 한정된다.

## API와 화면 없는 기능의 연결

- A1: `GET water-index/{assessments,support,coverage}`
- A2: `GET water-forecast/forecasts`
- A3/A4: `GET water-twin`, `GET water-temperature`
- A5: `GET livecams`; 관리 입력은 `python -m app.livecams --register <검수 JSON>`
- A6: `GET tides/events`, `GET tides/windows`; 운영창 입력은 `python -m app.tides.storage <검수 JSON>`
- A7: `GET/POST notifications/subscriptions`, `PUT/DELETE notifications/subscriptions/{id}`, `GET notifications/events`, `GET notifications/subscriptions/{id}/evaluations`
- A8: `GET quality/comparisons`, `GET/POST quality/observations`
- B: `GET ai/tools`, `GET/POST ai/explanation`

모두 상대 경로이며 배포시 `/pongdang/api/data/`를 붙인다. 실제 OpenAPI는 `/pongdang/api/openapi.json`, 이 인계의 생성본은 [openapi.json](openapi.json)이다. 페이지당 100행·기간 31일·bbox 각20도 등의 개별 상한은 schema를 확인한다. UI에 없는 장소 선택·활동/시간 변경·지도/차트·구독 관리·리뷰 입력은 동일 spot_id와 aware datetime을 DTO에 전달하면 된다.

프론트 수정 파일과 각 바인딩, null/unknown/422/503 처리, 기존 요청 취소 검증은 [frontend_handoff.md](frontend_handoff.md)에 상세히 적었다. 작업 시작 기준 CSS 8개·App·DataPage·FeatureData·useResource·navigation은 그대로다. Git HEAD 대비 큰 프론트 차이 일부는 작업 전부터 존재했으며 시작 해시는 [baseline.json](baseline.json)을 기준으로 구분한다.

## 실제 자료·검증 기록

[checks.md](checks.md)와 [checks.json](checks.json)에 최종 실행 결과·환경·제한을 기록한다. 실제 공식 호출은 이번에 새로 수행했고 [live-verification.json](live-verification.json)에 정규화된 출처/시각/결과만 저장했다. 실제 DB/수집 중인 DB는 접근 대상으로 사용하지 않았다. test-only PostgreSQL 18 `127.0.0.1:55439/pongdang_test`에만 저장했다.

첫 실자료 시도에서 동일 날짜 KHOA 저조 코드 4가 두 번 나타나는 자연키 충돌을 발견했고 실패를 성공으로 저장하지 않았다. `tide-event-slots.2`는 같은 날 고조/저조의 시간순 발생 순번을 derived ID로 보존하며 원 코드도 남긴다. 정정 전후 날짜·순서·사건수가 달라지면 같은 물리 사건임을 확정하지 못하는 한계도 명시한다. 첫 결과는 [live-verification-first.json](live-verification-first.json)에 남겼다.

추가 경계 검증은 근거 정정·과거 cutoff·만료·결측/0·GET 무쓰기·범위 상한·재시작·중복 알림·외부 오류·LLM 허구 출력·예산 경쟁과 v4 migration 보존을 포함한다. Docker가 설치되지 않아 전체 standalone Compose smoke는 로컬에서 실행하지 못했다. 기존 CI workflow의 PostgreSQL 18 및 Compose smoke를 보존했으며 향후 변경 반영 시 CI가 이를 실행해야 한다.

## 외부 의존성별 다음 검증

1. **수치 모델/지원/안전 근거:** `docs/design/water-travel-index/`와 기존 parameter/evidence registry의 미확정 목록을 연구 담당자가 확정해야 한다. 활동·대상·공간 적용범위, 공식 지원/제한, 입력 정책과 단위, 파라미터 출처를 검증한 뒤 수치 엔진과 모델 gate를 구현·검증한다. 현재 producer/평가/저장/상태 설명은 동작하지만 수치 적합도 모델 구현은 완료되지 않았다.
2. **대표 관측소/운영창:** 공식 URL·근거 ID·검수자·기간·활동·공간 범위를 확보하고 CLI 입력 후 A1/A2/A3/A6의 같은 장소/시간 결과를 확인한다. 새 HTTP import endpoint는 없다.
3. **카메라:** 공개 페이지, 권리/임베드 정책, 장소 연결, 실제 live 여부를 확인하고 서버 host allowlist와 검수 JSON을 등록한다. HEAD reachable을 live 검증으로 승격하지 않는다.
4. **SSO/알림:** `notifications.md`의 trusted proxy 헤더·Origin·verified email 계약을 기존 access-pongdang 게이트에 별도 검토하여 연결한다. 서버 secret/Resend 키/검증 발신자와 수신자를 준비한 뒤 허가된 검증 계정으로 발송을 점검한다. 이번 작업은 실제 사용자를 대상으로 보내지 않았다.
5. **수질/리뷰:** 실제 본인 관찰 또는 승인된 리뷰 입력과 같은 장소·기간·항목·방법의 공인 수질자료를 확보한다. negation·중복·대표성·측정법 차이를 실제 표본으로 검증한다.
6. **AI:** 모델명과 해당 모델의 현재 input/output 단가를 서버에 설정하고 별도 예산 아래 실제 provider timeout·응답·가격을 검증한다. 모델은 fact ID 순서만 정하므로 수치/안전/장소를 생성하지 않는다. deterministic fallback은 모델 운영 검증과 별개다.
7. **운영:** 이번 작업은 로컬 구현/격리 검증/인계까지다. 별도 배포 요청 후 dev 통합·CI 통과·main 자동 배포 및 운영 migration/collector health를 확인한다. CI/SSO/host 설치는 우회하지 않는다.

## 상세 인계

- [A1/A2/A6](assessment_forecast_tides.md): 모델 상태, 입력/매핑/공식 근거/운영창 CLI, 도메인 시간 계약
- [A3/A4/A5](spatial_livecams.md): 공간/과거 metadata/공식 영상 검수
- [A7](notifications.md): 인증 헤더, 구독/알림 상태 전이, provider, 재시도·정정 정책
- [A8](quality.md): 관찰 입력, 비교 가능 조건, 추출 버전, 측정값 비교
- [B](ai.md): 제한 서비스, fact 계약, provider·비용 설정, fallback
- [참고자료 조사](reference_inventory.md): 전체 레거시 문서 후보·중복/버전·채택/배제 근거. 레거시 코드·DB·네트워크·credentials에 의존하지 않는다.
