# 실제 API 수집과 저장

## 실행 구조

`app.ingestion.worker`는 FastAPI와 별도 프로세스다. `weather_jobs`, `marine_jobs`,
`water_jobs`, `place_jobs`가 공식 제공처의 동기 어댑터를 등록한다. 앱 시작이나
HTTP 조회가 외부 수집·시드·쓰기 작업을 실행하지 않는다.

- 기상 실황·특보·부이: 5~10분
- 초단기예보: 30분, 단기·중기예보: 1시간
- 해양 최신 관측 및 이안류: 제공처별 짧은 주기
- 해양 예측·수질·관측소·장소 카탈로그: 각 작업의 등록 주기

정확한 현재 간격은 `/api/data/datasets/collection-jobs`의 `interval_seconds`와
`next_run_at`이 기준이다. 누락된 키는 `disabled`로 남으며 값을 생성하지 않는다.
일반 갱신 실패는 지수 백오프(최대24시간)하고 다른 작업을 계속 실행한다.
매 작업은 공식 HTTPS 주소·응답크기·요청 수를 제한하며 인증값/원본 응답/예외본문을
로그나 조회 테이블에 남기지 않는다.

## 자료와 테이블

| 테이블 | 의미 |
|---|---|
| `spots_waterspot` | 실제 제공처 장소 및 관측 지점의 공통 참조 |
| `collection_station` | 원본 관측소 ID, 이름, 좌표, 기준면과 제공처 |
| `conditions_observationsnapshot` | 관측 또는 예보 대상시각·발표시각·원본 ID·수집 버전 |
| `conditions_observationmetric` | 숫자/문자 지표, 단위, 원본 결측 상태, 유효기간 |
| `collection_warning` | 공식 기상특보 발표 이력. 현재 발효 상태와 구분 |
| `collection_place` | 관광·장소 API의 원본 ID, 분류, 좌표, 주소 |
| `collection_job` | 작업별 상태, 다음 실행, 실패 횟수, 수신·신규 저장 수 |
| `conditions_ingestionrun` | 실행별 성공·실패·빈 응답 이력 |
| `conditions_pipelineheartbeat` | 실행기의 최근 활동 시각 |

`SourceBatch`는 정규화된 공개 자료만 담는다. 숫자 결측과 정상 문자 자료를 구별하고
단위나 발표시각이 제공되지 않으면 NULL/빈 단위를 보존한다. 예보 목표시각을
발표시각으로 꾸미거나 가져온 시각으로 관측 유효기간을 늘리지 않는다.

스냅샷의 원본 ID와 내용 해시로 중복을 막는다. 동일 자료를 다시 받아도 원래의
수집·만료시각을 유지한다. 제공처가 같은 ID의 내용을 고친 경우 새 버전을 추가하고
이전 버전은 `superseded`로 남긴다. 관측소/장소 카탈로그는 원본 ID로 갱신한다.
각 배치는 한 트랜잭션에 저장되어 실패하면 부분 삽입되지 않는다.

메타데이터만 있고 실제 관측이 없으면 `no_data`다. 관측소 목록 자체를 가져오는
전용 카탈로그 작업만 메타데이터 수신을 자료 수신으로 취급한다.
카카오 검색 최대75개, 관광정보 최대500개 등 조회 범위 제한은 `partial`이다.
`records_received`에는 관측소 등 메타데이터도 포함되므로 관측 행 수와 다를 수 있다.
만료 자료는 조회 시 `stale`로 표시한다. 저장 성공은 안전 판정이 아니다.

## 주기 실행과 재시작

다음 시각과 연속 실패 횟수는 DB에 보존된다. 재시작해도 모든 API를 다시 호출하지
않는다. 작업별 PostgreSQL session advisory lock으로 여러 worker의 중복 실행을
방지한다. 한 작업의 실패가 다른 작업의 저장을 중단시키지 않는다.

```bash
cd backend
uv run python -m app.schema --initialize --remove-demo
uv run python -m app.ingestion.worker
# 특정 작업만 즉시 재확인
uv run python -m app.ingestion.worker --once --force --job kma_aws
# 최근 heartbeat 확인
uv run python -m app.ingestion.health
```

기존 공급자 중립 `Batch` JSON의 명시적 운영자 가져오기 도구는 유지한다.
그 도구와 달리 실제 수집기는 `SourceBatch`와 `store_batch`를 사용한다.

## DB 이전과 더미 제거

스키마 v1/v2→v3 이전은 실제 자료를 보존하며 관측소·특보·장소·작업 테이블과 출처 열을
추가한다. `--remove-demo`는 명시적으로 `pongdang_demo`만 제거하며 재실행 가능하다.
더미 생성 모듈과 더미 API는 은퇴했다. 수집 실패 시 합성 데이터 대체는 없다.
다른 스키마·공유 DB·안전 평가 데이터는 생성하거나 변경하지 않는다.

## 제공처 문서

- [기상청 단기예보](https://www.data.go.kr/data/15084084/openapi.do)
- [기상청 특보](https://www.data.go.kr/data/15000415/openapi.do)
- [기상청 API허브](https://apihub.kma.go.kr/)
- [국립해양조사원 관측부이](https://www.data.go.kr/data/15155516/openapi.do)
- [해양환경공단 관측](https://www.data.go.kr/data/15059973/openapi.do)
- [카카오 로컬 API](https://developers.kakao.com/docs/ko/local/dev-guide)

승인되지 않은 추가 API 목록과 실호출 확인 기록은 `api-recheck3-2026-09-14.md`에 있다.
