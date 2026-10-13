# 공모전 개선: 방문 시간대 반영 — 2026-10-13

- 범위: `VisitIntent.part_of_day`를 경로의 실제 방문 시각에 적용하고 여행 날짜를 보존한다. 프런트·환경 비교 구현은 다른 작업자가 담당한다.
- `backend/app/travel/models.py`의 `VISIT_TIME_WINDOWS`를 공통 기준으로 사용한다. KST 오전 기본 09시·종료 12시, 오후 기본 13시·종료 18시, 저녁 기본 18시·종료 다음 날 00시다. 장소 영업시간이나 활동 가능 여부의 증거가 아닌 일정 계산 기본값이다.
- `backend/app/travel/routing.py`: 기본시각 이전 도착은 대기를 더하고, 이후 도착은 실제 도착부터 체류한다. 체류가 요청 시간대 끝을 넘으면 `visit_time_window_unreachable` 충돌로 거절한다. `any`·미지정은 기존 연속 일정을 유지한다. 대기 시간은 귀가 마감에도 반영한다.
- 경로 `items[].arrival_at`는 대기 이후 방문 시작이다. 도로 `legs[].arrival_at`는 현장 도착을 유지한다. 시간대 지정 항목에만 `visit_timing`을 추가해 요청 시간대·기본 시작·종료 한계·현장 도착·대기 분·상태를 전달한다. 거절된 순서에는 충돌 장소와 동일 메타데이터를 남긴다. 대화 결과는 대기/충돌을 명시한다.
- 서명된 저장 경로는 기존 `route_snapshot`이 전체 경로를 보존하며, `plan_input`은 요청 날짜를 유지한다. 새 API 호출·의존성·DB 마이그레이션 없음. 유료 경로 제공자는 검증에서 모두 모의 객체로 대체했다.
- 날짜 계약 점검: `EnvironmentReader.at`는 대상이 미래이면 `forecast`, 과거/현재이면 `observation`을 사용하며 대상시각을 그대로 전달한다. `read_conditions`의 SQL은 요청 mode를 제한하므로 미래 요청을 오늘 관측으로 대체하지 않는다. `ConditionQuery.product_times`의 explicit `as_of` 제한은 이 raw 읽기에는 적용되지 않는다. 별도 `PublishedEnvironmentReader`에서의 미래 조회 수정/검증은 환경 담당 작업 범위다.
- 검증: 독립 PostgreSQL 18을 loopback 포트 49693, 전용 `pongdang_test`로 생성한 뒤 `ops/verify_local.py`에 변경 Python 3파일과 `--test backend/tests/test_travel_route_order.py`를 명시했다. Ruff check/format 통과, `test_travel_route_visits.py` 18개 + `test_travel_route_order.py` 12개 = **30개 통과**. 해당 테스트는 저장소·DB·경로 제공자 경계가 모의 객체여서 외부 요청 없음. 초기 줄 길이 lint 실패는 수정했고 최종 검사 통과. 기존 Starlette/httpx 관련 deprecation 경고 2개 유지.
- 회귀 근거: 09/13/18 기본시각, 대기 이후 환경 비교, 귀가 마감, 시간대 넘김, 오전 방문 뒤 오후 방문 후 다시 오전 방문 충돌, 미지정 일정 유지, +6일 요청 날짜 보존을 확인했다. 운영 배포·커밋·푸시는 실행하지 않았다.
