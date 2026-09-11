# Pongdang 수집 개발 안내

## 현재 범위

구현된 것은 공급자 중립 공통 수집 계약과 저장 경로다. 기존 API 어댑터·스케줄러·평가
엔진을 이전한 상태가 아니다. API 교체 계획에 따라 제공처와 주기는 추후 선정한다.
실제 API 호출은 현재 없으며, JSON 가져오기는 운영자가 검증한 정규화 근거를 저장하는
도구다. 임의 JSON을 공식 관측으로 검증하거나 보증하는 기능이 아니다.

`Provider.fetch() -> Batch`를 구현하면 `collect(settings, provider)`가 다음 단계를 처리한다.

1. 공통 계약 검증: 제한된 크기·필드·유한 수치·타임존·중복 레코드/지표
2. 자체 PostgreSQL의 실제 장소 ID 참조 확인
3. 스냅샷 → 지표 → 배치 중복 방지 기록 → 성공 이력을 한 트랜잭션에 저장
4. `/api/data`에서 동일 조회 UI로 표시

API 주소·인증·요청 타임아웃·페이지 수·할당량·원본 응답 해석은 어댑터 책임이다.
어댑터는 SQL/UI에 의존하지 않는다. 응답 전체나 인증 정보를 공통 레코드에 넣지 않는다.
자동 재시도/주기 실행은 기본 제공하지 않는다. 제공처 선정 후 상한과 정책을 함께 결정한다.
실패는 호출자에게 반환하며 성공 이력이나 유효 기간을 갱신하지 않는다.
현재 실패 로그/스케줄러 상태 저장은 미구현이다.

## 데이터 계약

| 객체 | 필수 내용 |
|---|---|
| Batch | provider, batch_key, adapter_version, observations (1~100개) |
| Observation | record_id, spot_id, observed_at, fetched_at, valid_until, spatial_scope, metrics (1~100개) |
| Metric | name, numeric_value 또는 NULL, unit, mode (observation/forecast) |

`numeric_value=NULL`은 누락이다. 값이 있고 만료되지 않았으면 `recorded`, 만료됐으면
`stale`로 저장한다. `recorded`는 저장됐다는 뜻이며 안전함이나 검증된 실시간 관측이라는
보장이 아니다. 조회자는 보존된 유효 종료 시각도 확인해야 한다.
실측 시각은 수집 시각보다 미래일 수 없고 예보는 대상 시각과 원본의 의미를 보존한다.
원본 유효 기간을 가져온 시각 기준으로 임의 연장하지 않는다.

`provider + batch_key`가 같고 내용도 같으면 재처리는 아무것도 변경하지 않는다.
같은 키에 다른 내용이 들어오면 거부한다. 동일 제공처 레코드/장소도 중복 삽입하지 않는다.
점수·안전 상태·예보 결과·시설 정보는 이 도구가 생성하지 않는다.
더미 제공처는 거부하며 실험 데이터는 `pongdang_demo`에만 넣는다.

## 명시적 실행

먼저 `python -m app.schema --initialize`로 자체 DB에 빈 스키마를 준비한다.
실제 장소 카탈로그 등록은 API 선정 시 구현해야 한다. 현재 자동 장소 복사나
레거시 데이터 이관은 하지 않으며 관측의 spot_id가 없으면 전체 배치를 거부한다.

검증된 입력 JSON을 준비한 운영자만 아래 명령을 실행한다. 파일 크기 상한은 1 MB다.
HTTP 업로드 API나 외부 URL을 읽는 기능은 제공하지 않는다.

```bash
cd backend
uv run python -m app.ingestion --file /absolute/path/observations.json --confirm-live-import
```

테스트 예시는 `backend/tests/test_ingestion.py`에 있으며 폐기 가능한 테스트 DB에서만
사용한다. 운영 DB에 테스트·더미 관측을 가져오지 않는다.
