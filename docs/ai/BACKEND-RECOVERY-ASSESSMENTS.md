# 평가 게시 중 만료 경계 복구

- 담당 범위: `backend/app/water_index/producer.py`, `feature_jobs.py`의 평가 잡 연결, `test_assessment_forecast_tides_integration.py`. 프론트, 조건 점수 producer/storage, 평가 storage 계약 및 운영 상태는 변경하지 않는다.
- 재현: 최신 원자료 선별 수정 상태에서도 운영 복제 전용 DB에서 `produce_assessments`가 100.287초 후 53번째 그룹에서 `CheckViolation`(SQLSTATE 23514)로 실패했다. 입력 2,412개, 평가 request 4,926개, 앞서 작성한 artifact 14,338개까지 전체 롤백되었다. 진단 연결은 종료 시 항상 롤백했다.
- 원인: 생산 시작 시각만으로 expiry를 확인하므로 장시간 계산/저장 중 만료된 읽기 manifest를 게시했다. 실제 `created_at=clock_timestamp()`에 적용되는 `read_valid_until > created_at` CHECK가 전체 transaction을 실패시킨다.
- 변경: 그룹 시작 때 실제 DB 시각으로 만료된 입력을 제외한다. 게시 전에도 실제 시각으로 다시 확인한다. 저장 중 만료 race는 그룹 savepoint로만 되돌린다. 정확한 만료 CHECK(`water_index_read_manifest_check1`)와 실제 만료를 함께 확인하며 다른 무결성 오류는 그대로 실패시킨다. 이미 만료된 자료에 성공 기록을 남기거나 유효기간을 연장하지 않는다.
- 규모 검증 중 발견한 운영 문제: 만료 수정 후 운영 복제 DB에서 전체 pass를 실행했으나 조건 generation 복사와 경합하며 635.6초에 100그룹·37,330 artifact까지만 진행했다. 이 지점까지 예외는 없었지만 직렬 collector를 오래 점유하므로 root 지시에 따라 진단 프로세스만 중단하고 해당 transaction 전체를 롤백했다. 전체 pass 완료 증거로 사용하지 않는다. 초기 입력은 2,358개, 직접 그룹 상한은 182개(관측 66·예보 116, mapping 0개)였다.
- 추가 변경: 명시적 CLI/`produce_assessments` 전체 처리·정수 반환 계약은 유지한다. 주기 job만 `produce_assessment_batch`를 사용하여 60초가 지나면 현재 그룹까지 마치고 완료된 배치를 커밋한다. 미처리·가장 오래 처리한 그룹을 `run_id`로 우선하여 자주 갱신되는 앞쪽 원자료의 독점을 막는다. 남은 작업은 `partial / ASSESSMENT_BACKFILL_PENDING`과 30초 후 재개로 보고한다. 정상 완료 주기는 기존 600초이다.
- 검증 완료: 전용 disposable `pongdang_test` localhost:32770에서 기존 평가/예보/조석, 만료 경계·관련 없는 CHECK 오류, 시간 제한 후 재개·잦은 원자료 변경에 대한 공정성·feature job 계약 회귀 테스트 10개 통과(38.75초). DB가 실제 반환한 만료 제약 이름은 `water_index_read_manifest_check1`임을 새 회귀 테스트에서 확인했다. Ruff lint/format 3파일 통과. 기존 FastAPI/httpx 폐기 예정 경고 2개가 있다.
- 운영 규모 복제 검증: localhost:32768에서 새 bounded job을 두 번 실제 실행했다. 시작 시 `production_run`이 0행이어서 앞선 장기 진단 중단의 전체 rollback도 확인했다. 첫 배치는 66.060초, 28그룹·8,218 artifact를 커밋했고 마지막 그룹 저장의 최대 시간은 6.797초였다. 두 번째 배치는 61.307초, 33그룹·9,984 artifact를 커밋했다. 두 번 모두 예외 없이 `partial / ASSESSMENT_BACKFILL_PENDING / next_run_seconds=30`을 반환했다. 전체 채움 완료로 보고하지 않으며 다음 배치가 이어받는다.
- 위 두 배치 전후 `condition_source_revision=0`, 원자료 snapshot 81,309행·metric 265,684행은 동일했다. 평가 파생 테이블에만 총 61개 production run과 18,202개 artifact가 저장되었다. 복제 DB를 condition 담당자의 최종 단독 게시 검증에 반환했으며 추가 DB 작업하지 않는다.
- 운영 DB 쓰기·수집 실행·재시작·커밋·푸시는 하지 않았다.
