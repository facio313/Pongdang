# Water Index 구현 범위와 검증 기록

2026-09-14 작성. **구현·소프트웨어 검사 완료, 수치 모델·한국 외부검증 미완료**. 프론트 인계는 [frontend_handoff.md](frontend_handoff.md), 채택 상태·필드는 [canonical 계약](../../design/water-travel-index/canonical_contract.md), 연구 근거는 [근거 종합](../../research/water-travel-index/synthesis.md)을 참조한다. 기존 연구·설계 문서를 이번 구현 기록으로 덮어쓰지 않는다.

## 목표와 현재 제한

이번 구현은 독립적인 Pongdang의 저장된 근거·지원·평가 상태에 대한 읽기 경로와 명시적 처리 경계를 마련한다. Multtara 런타임·DB·네트워크·자격증명·모듈을 가져오지 않는다. 실제 점수 곡선·가중치·한국 사용자 보정이 미정이므로 기본 모델은 unimplemented이며 공개 점수·선호 순위는 null이다.

현재 raw 수집의 성공·자료 존재·관측소 등록으로 장소 활동 지원, 필수 안전 검사 목록의 승인, 확인된 제한의 부재를 자동 생성하지 않는다. trusted manifest는 운영자가 검수한 근거를 표현하는 기술 계약이며 파일 형식 검증 자체가 과학적·공식 검수를 대신하지 않는다. 실제 미생물 수질·이안류/낙뢰 통제·구간 유량 모델·장비/대상자 정보가 준비되지 않은 범위는 unknown/미평가로 남는다.

## 확인한 기준과 코드 경계

작업 브랜치는 `feature/api`, HEAD는 `d07cd23279808e74c1998d849c240a48e06d06d2`다. 미커밋 변경이 있는 작업 트리를 읽었으며 commit 내용만을 구현 기준으로 간주하지 않는다. 이번 구현의 [시작 파일 해시](source_baseline.json), [보존·검사 기록](checks.json)을 함께 확인했다. 시작 기준 229개 파일 중 main.py·schema.py·test_collection.py 3개는 이번 구현이 추가로 변경했고 나머지 226개는 보존되었다. 프론트·연구·설계·의존성·lockfile은 변경하지 않았다.

| 영역 | 소유/확인 범위 | 현재 기록 |
|---|---|---|
| API·라우터·요청 검증 | 총괄 구현 | [api.py](../../../backend/app/water_index/api.py)의 create_water_index_router, QueryParams, Envelope/SupportEnvelope, _public_rows; main.py의 등록 확인. 실행 결과는 아래 별도 기록 |
| DTO·기본 모델 registry | 판정 구현 담당 | [models.py](../../../backend/app/water_index/models.py)의 AssessmentDTO/Target/Context/InputDTO/EvaluationRequest, [registry.py](../../../backend/app/water_index/registry.py)의 DEFAULT_MODEL/PROFILES/CONTEXT_PROFILES, [engine.py](../../../backend/app/water_index/engine.py)의 순수 evaluate/diagnostic_assessment/inspect_input 확인 |
| 명시적 manifest 저장·읽기·스키마 | 저장 구현 담당 | [storage.py](../../../backend/app/water_index/storage.py)의 TargetRecord/InputManifest/ReadManifest/StorageBundle, store_bundle, read_projection과 [migrations.py](../../../backend/app/water_index/migrations.py)의 migrate_water_index 확인 |
| 내부 준비/원자료 adapter | 총괄 구현 | [service.py](../../../backend/app/water_index/service.py)의 prepare_evaluation/evaluate_and_store, [adapters.py](../../../backend/app/water_index/adapters.py)의 input_from_records 확인 |
| 기존 collection/data API | 기존 계약 보존 | 기존 백엔드 104개 검사 통과; 전체 240개 실행과 구분은 아래 표 참조 |
| 프론트 | 읽기 후 인계 문서 작성 | 화면·타입·CSS 변경 없음 |
| 연구·설계 | 채택 근거로 읽기 | 이 작업에서 수정 없음 |

## 명시적인 운영 경계

- GET은 저장된 자료의 읽기 투영이며 수집·평가·보정·시드·ID/manifest 저장을 실행하지 않는다.
- 자료/target manifest가 없으면 새 날짜 슬롯이나 예시 점수를 생성하지 않는다.
- 평가의 row.as_of와 조회의 envelope.as_of를 분리하고, 과거 이력 재현이 불가능한 요청을 현재값으로 채우지 않는다.
- 지원·안전·환경·품질은 별도 계층이다. 공식 제한은 높은 환경값으로 상쇄할 수 없다.
- required 목록 미정은 nullable 개수와 미확인 상태다. 빈 목록의 all() 통과를 안전 확인으로 사용하지 않는다.
- 공개 숫자 모델은 자동 활성화하지 않는다. 구현 동작 테스트가 한국 사용자 선호·쾌적·사고 위험의 경험적 검증을 대체하지 않는다.

입력 단계의 구조 검사와 외부 진실성의 검수는 다르다. AuthorityEvidence의 authoritative·기관·원레코드·scope·mapping_version은 trusted producer가 제공한 주장이다. 코드가 이름만으로 공식 기관이나 관할을 인증하지 않는다. 실제 원기관/장소/활동 매핑과 승인 절차, 자료 수집에서 이 내부 계약으로 넘어오는 운영 producer는 연결되지 않았다.

현재 evaluate는 승인된 직접 지원 근거와 적용 중인 공식 주의/제한을 보존하지만 required 안전 목록은 모두 미승인이다. 따라서 supported+적용 중인 제한은 restricted, 그 외 supported 상태의 안전은 unknown이다. 지원 미확인/미지원이면 활동 안전은 not_assessed이고 독립적으로 확인된 경고·제한은 보존한다. caution/no_known_restriction 완료 상태와 모든 숫자를 AssessmentDTO에서도 거부하여 손으로 만든 DTO로 우회 저장하지 못하게 한다. 공식 주의/제한은 target 일부의 실제 겹침도 보존하고 partial_safety_coverage를 남긴다. 지원 근거는 전체 target을 덮어야 하며, 제한의 raw input_refs는 주장한 겹침 구간을 덮어야 한다. 미래 수치 모델의 작동은 구현하지 않았다.

## 근거 묶음과 명시적 저장 경로

[parameters.json](../../../backend/app/water_index/parameters.json)은 채택 파라미터166행과 주장 단위 근거47행 및 원본 CSV 해시를 패키지에 보존한다. 이는166개 모델 계수나47개 독립 연구가 아니다. registry는 이 파일의 버전·ID 중복·근거 연결을 검사하고 get_parameter/get_evidence에서 격리된 복사본을 반환한다. 실행 중 docs/research나 Multtara 저장소를 읽는 의존성은 없다. 미정 값의 출처를 전달하는 기능이며 계산 가능·승인·검증 완료를 뜻하지 않는다.

현재 PROFILES의 여섯 활동은 모두 `status=unapproved`, required_safety_checks와 required_environment_inputs가 None이다. CONTEXT_PROFILES는 general 하나이며 나이·장비·감독을 추정하지 않는다. DEFAULT_MODEL의 공개 수치 계산은 제공하지 않고 게이트는 pending이다. [units.py](../../../backend/app/water_index/units.py)의 convert_exact는 지정 물리량의 단위비 산술 보조만 제공하며 승인된 모델 변환·공간 매핑·집계로 자동 채택하지 않는다.

[adapters.py](../../../backend/app/water_index/adapters.py)는 이미 읽은 snapshot/metric의 참조·시각 일치를 검사하고 원본 digest와 provider 원ID, 서로 다른 snapshot/metric station ID 타입, 숫자0·문자·단위·결측을 InputDTO에 보존한다. DB를 조회하거나 좌표/활동/원등급을 추론하지 않는다. mapping_version과 aggregation을 받지 않으면 미상으로 남긴다. provider_record_id와 source_record_id는 역할이 다르므로 표시·추적에서도 구분한다.

[service.py](../../../backend/app/water_index/service.py)의 prepare_evaluation은 등록된 general 문맥·관측/예보 요청을 다시 검증하고 요청 전체와 registry provenance의 정규화 해시로 평가/입력 manifest ID를 준비한다. target_id는 공급자가 이미 정한 불변 target 키를 사용한다. evaluate_and_store는 순수 평가와 원요청 보존을 명시적으로 실행하지만 read manifest를 만들지 않아 자동 공개되지 않는다. 이 진입점은 HTTP·수집 job·시작 hook에 등록되지 않았다.

명시적 store_bundle 경로는 trusted producer가 준비한 DTO/manifest를 한 트랜잭션에 append한다. 이 Python 함수는 공개 HTTP 가져오기 endpoint나 시작 시 시드 경로가 아니다. 동일 ID·동일 내용의 재저장은 기존 수집·공개 가능 시각을 갱신하지 않고 다른 내용은 거부한다. 대상·입력 manifest·평가·읽기 selection manifest는 별도 레코드다. 평가만 저장했다고 공개되지는 않으며 해당 조회 문맥을 선택한 read manifest가 필요하다.

평가 저장에는 InputManifest의 전체 evaluation_request와 bundled registry provenance가 필요하다. 필터링·제외 전 직접 지원/안전 근거, forecast_coverage, 원입력과 시각·버전을 내부에 보존하고, 평가 DTO를 순수 evaluate 재실행 결과와 대조한 다음 append한다. 이 대조는 **명시적 저장 경로에서만** 실행하며 GET에서는 평가하지 않는다. 지원·주의·제한의 공개 DTO에도 source attestation을 보존하되, 내부 요청 전체나 제공처 원본 응답은 공개하지 않는다. 따라서 재현 입력 보존과 공식성에 대한 운영 승인 완료를 혼동하지 않는다.

명시적 schema 초기화/이전 경로는 스키마 v4의 빈 water_index_target, water_index_input_manifest, water_index_assessment, water_index_read_manifest를 추가한다. 모델 평가나 장소 지원을 생성하지 않는다. available_at은 DB의 저장 시각에 의해 정해지며 원자료의 과거 시각을 넣어 현재 생성한 레코드를 과거에 존재한 것으로 만들지 않는다. 업데이트·삭제 방지 트리거로 저장 이력을 유지한다. 최신 읽기 manifest가 좁아지거나 만료되면 오래된 넓은 manifest로 되돌아가 빈 범위를 채우지 않는다. 운영 DB에 이 변경이 적용되었다는 확인은 별도 실행 기록 없이는 주장하지 않는다.

## 검증 계획 44개 사례와 구현 테스트의 대응

기준은 [validation_plan.md](../../design/water-travel-index/validation_plan.md)의 44개 명세 사례다. 소프트웨어 사례와 별도로 계획된 A/B1/B2/C 한국 현장 검증은 이번 코드 테스트에 포함되지 않는다.

아래는 실제 테스트 본문을 읽은 대응표다. **직접**은 해당 사례의 현재 구현 경계를 명시적으로 assert한다는 뜻이며, **부분**은 공통 경계 일부만 검사하거나 승인 모델·운영 매핑이 없어 나머지를 실행할 수 없다는 뜻이다. **후속**은 대응하는 모델 기능이 아직 없어 직접 검사가 없다는 뜻이다. 한 테스트가 여러 사례를 다룰 수 있으므로 표 행 수를 테스트 통과 수로 더하지 않는다. 모든 테스트의 자료·기관·나이 정책 상수는 격리된 계약 사례이며 현장 표본이나 승인된 운영 기준이 아니다.

표에서 함수명의 `test_` 접두사는 생략했다. 파일 약어: E=[판정/DTO](../../../backend/tests/test_water_index_engine.py), P=[HTTP API](../../../backend/tests/test_water_index_api.py), S=[실제 폐기 DB 저장/읽기](../../../backend/tests/test_water_index_storage.py), C=[기존 collection](../../../backend/tests/test_collection.py), I=[기존 ingestion](../../../backend/tests/test_ingestion.py), W=[기존 weather](../../../backend/tests/test_weather.py), M=[기존 marine](../../../backend/tests/test_marine.py), Q=[기존 water](../../../backend/tests/test_water.py), R=[기존 data](../../../backend/tests/test_data.py), N=[기존 demo/시드 없음](../../../backend/tests/test_demo.py), H=[내부 service/adapter](../../../backend/tests/test_water_index_service.py), Z=[실제 DB→HTTP 통합](../../../backend/tests/test_water_index_integration.py). P는 storage를 대역으로 바꾼 HTTP 계약 검사이고 S는 실제 read-only 트랜잭션을 검사한다. Z의 `evaluation_storage_api_contract_and_immutable_read`는 별도 실제 폐기 DB에서 순수 판정→저장→명시적 공개→HTTP→history/support/범위 밖 흐름을 검사한다.

| 명세 사례 | 수준 | 실제 테스트 함수·확인 범위와 남은 한계 |
|---|---|---|
| V-S01 | 직접 | E: `default_has_no_score_or_inferred_population`, `support_does_not_approve_unresolved_safety`, `unsupported_and_temporary_restriction_are_distinct`. explicit 지원·미지원·unknown을 구분한다. 실제 장소 지원 목록의 정확성은 검증하지 않았다. |
| V-S02 | 부분 | E: `default_has_no_score_or_inferred_population`, `unresolved_input_policies_cannot_be_filled_from_legacy`; S: `no_target_inference_and_unknown_place`. 자동 지원 추정은 없으나 pool→onsen/lake→rafting의 실제 장소 fixture 및 운영 승인 매핑은 없다. |
| V-S03 | 부분 | E: `input_definition_contract`, `inapplicable_authority_is_not_an_active_restriction`; M: `activity_does_not_map_unknown_or_far_coordinates_to_collection_point`. 범위/매핑 불일치를 거부하지만 전국 공식 장소 매핑의 검수는 후속이다. |
| V-S04 | 직접 | E: `empty_required_list_is_not_sufficient_quality`, `clear_statement_does_not_complete_an_unapproved_checklist`, `manual_complete_safety_cannot_bypass_unapproved_registry`, `default_has_no_score_or_inferred_population`. 미승인 목록은 완료·sufficient가 되지 않으며 required 개수는 null이다. |
| V-S05 | 부분 | E: `support_does_not_approve_unresolved_safety`, `caution_is_preserved_while_overall_safety_is_unknown`. 미확인 요구와 이미 알려진 주의를 보존한다. 승인된 유한 목록 중 일부 완료의 운영 사례는 없다. |
| V-S06 | 직접 | E: `explicit_restriction_overrides_missing_and_good_environment`, `support_unknown_retains_independent_official_warning`. 제한·결손·출처가 함께 보존되고 점수로 상쇄하지 않는다. |
| V-S07 | 직접 | E: `inapplicable_authority_is_not_an_active_restriction`, `clear_statement_does_not_complete_an_unapproved_checklist`; W: `historical_warning_is_bulletin_not_active`, `empty_success_is_empty_evidence`. source 상태와 공백을 구분한다. |
| V-S08 | 부분 | E: `inapplicable_authority_is_not_an_active_restriction`. 활동·장소·현재 효력·수집시점·권한 flag를 검사한다. 실제 기관의 관할 진실성은 trusted producer의 검수에 남는다. |
| V-D01 | 부분 | E: `input_definition_contract`, `explicit_restriction_overrides_missing_and_good_environment`, `duplicate_input_semantic_identity_preserves_conflict`. 입력 결손/노후/충돌/단위·범위와 제한을 검사하나 활동별 환경 required 목록은 미승인이다. |
| V-D02 | 후속 | E: `unresolved_input_policies_cannot_be_filled_from_legacy`는 미정 정책의 사용만 금지한다. 승인된 optional 처리·가중치·대체값 모델은 없으므로 선택 입력 누락의 수치 결과를 검증하지 않았다. |
| V-D03 | 직접 | P: `empty_data_is_unknown_not_a_synthetic_score`; S: `no_target_inference_and_unknown_place`; C: `metadata_without_observations_is_no_data`; N: `startup_and_catalog_never_seed_or_collect`. 결손·메타데이터·빈 요청에서 seed/점수/안전을 생성하지 않는다. |
| V-D04 | 직접 | S: `idempotence_conflict_and_no_creation_time_refresh`; C: `fetch_time_changes_do_not_duplicate_or_extend_evidence`; I: `atomic_idempotent_import_preserves_expiry_and_missing`; W: `nowcast_validity_uses_observation_not_fetch`. 재요청·재저장으로 효력이 연장되지 않는다. |
| V-D05 | 부분 | S: `database_rejects_history_mutation`, `read_cutoff_uses_storage_availability_not_old_evaluation_time`, `complete_request_snapshot_and_provenance_are_required`. 저장된 평가·입력 요청은 불변이다. 과거 raw revision·당시 매핑을 복원하는 자동 producer와 회고 모델 실행은 없다. |
| V-D06 | 직접 | E: `conflicting_support_is_unknown_independent_of_order`, `duplicate_input_semantic_identity_preserves_conflict`, `known_restriction_survives_conflicting_clear_with_same_reference`, `evaluate_is_deterministic_and_performs_no_io`; C: `conflicting_records_or_station_metadata_are_not_order_dependent`. 충돌·출처 선택의 현재 경계와 순서 불변을 검사한다. |
| V-D07 | 부분 | E: `input_definition_contract`, `unit_helper_rejects_nonfinite_and_cross_dimension_inference`; Q: `koem_joins_provider_station_and_preserves_layers_historical_date_and_units`, `hrfco_keeps_station_datum_exact_time_and_flow_unit`. 원자료 층/기준면 보존은 검사하지만 승인된 모델 입력 공간·층 매핑은 없다. |
| V-D08 | 부분 | M: `activity_forecast_keeps_grade_skill_halfday_and_unknown_issue_time`; E: `unresolved_input_policies_cannot_be_filled_from_legacy`. 원등급은 보존하며 공통 점수로 바꾸지 않는다. 이안류 원지수3/등급3의 전용 비교·승인 해석기는 없다. |
| V-D09 | 직접 | E: `input_numeric_types_are_strict_and_finite`, `zero_is_a_measurement_but_is_not_a_default_score`; H: `collection_ids_units_zero_and_unknowns_are_preserved`, `incompatible_or_conflicting_raw_records_fail`; M: `survey_splits_actual_and_predicted_tide_and_preserves_negative_level`; Q: `nier_nested_envelope_dms_and_non_numeric_lab_result_are_preserved`; W: `missing_source_values_remain_explicit_even_with_raw_text`. 숫자·음수·센티널·문자의 수집/DTO 경계를 검사한다. |
| V-D10 | 직접 | E: `evaluate_is_deterministic_and_performs_no_io`, `used_input_mode_and_provenance_are_retained`, `bundled_provenance_is_complete_and_source_hashes_match`; S: `complete_request_snapshot_and_provenance_are_required`. H: `stable_ids_include_context_target_time_and_provenance`, `internal_orchestration_captures_request_without_publication`; Z도 저장된 원요청과 registry 해시를 확인한다. 현재 미구현 수치 모델의 상태 결과·입력·버전 재현을 확인한다. |
| V-T01 | 직접 | E: `inapplicable_authority_is_not_an_active_restriction`, `future_daily_aggregate_is_not_historical_observation`; S: `read_cutoff_uses_storage_availability_not_old_evaluation_time`. 미래 지식과 늦게 저장한 평가의 소급 노출을 막는다. |
| V-T02 | 직접 | E: `unknown_issue_is_not_replaced_by_fetch_time`, `reference_only_forecast_keeps_mode_none_and_unknown_issue`; M: `activity_forecast_keeps_grade_skill_halfday_and_unknown_issue_time`. issue 미상을 그대로 보존한다. |
| V-T03 | 직접 | E: `half_day_coverage_is_not_a_new_hourly_target`; M: `activity_forecast_keeps_grade_skill_halfday_and_unknown_issue_time`, `extrema_seven_days_are_forecast_events_with_original_codes`; W: `mid_outlook_text_is_preserved_without_invented_daily_forecasts`. 원기간/사건/서술을 보존한다. |
| V-T04 | 직접 | S: `interval_overlap_preserves_original_window_and_excludes_right_boundary`, `newer_narrower_view_never_resurrects_an_older_wide_view`; E: `explicit_empty_forecast_coverage_is_not_unknown_coverage`. E: `partial_interval_restriction_keeps_its_actual_scope`, `adjacent_restriction_does_not_overlap_half_open_target`는 부분 제한의 실제 창도 검사한다. 일부 겹침의 원interval·페이지 경계와 unknown 범위를 검사한다. |
| V-T05 | 직접 | E: `age_boundary_is_inclusive_but_expiry_is_exclusive`, `naive_times_extra_fields_and_wrong_time_roles_are_rejected`; P: `exact_window_boundary_and_historical_cutoff`; W: `issue_time_crosses_kst_date_with_publication_delay`; S: `interval_overlap_preserves_original_window_and_excludes_right_boundary`. aware time과 경계를 검사한다. |
| V-T06 | 직접 | E: `future_daily_aggregate_is_not_historical_observation`. 관측 일집계의 종료시점이 cutoff 뒤면 거부한다. 실제 HCI 재현이나 예측 실험은 수행하지 않았다. |
| V-T07 | 부분 | W: `forecast_preserves_issue_target_range_and_missing`, `valid_precipitation_text_is_not_marked_missing`; E: `unit_helper_rejects_nonfinite_and_cross_dimension_inference`. H: `missing_and_textual_rain_are_not_numeric_zero`도 원문/결측을 보존한다. 원 강수 범위/단위를 보존한다. PoP·누적량·지속시간을 쓰는 승인 모델과 구간 연산은 없다. |
| V-T08 | 부분 | E: `age_boundary_is_inclusive_but_expiry_is_exclusive`, `partial_restriction_reference_needs_only_the_claimed_overlap`, `partial_restriction_reference_must_cover_the_same_overlap`; S: `support_fields_and_duration_are_validated_before_publication`. 직접 근거의 창과 효력 연장 거부를 검사한다. 여러 승인된 집계 환경 입력의 교집합 및 선택 요인 전체 포함은 직접 검사하지 않았다. |
| V-T09 | 직접 | E: `forecast_age_uses_issue_time_not_future_target_or_fetch`, `unknown_issue_is_not_replaced_by_fetch_time`, `naive_times_extra_fields_and_wrong_time_roles_are_rejected`. H: `forecast_target_is_not_relabelled_as_observation`. 미래 forecast target과 발표 최신성을 분리한다. 사용한 TTL은 test-only다. |
| V-T10 | 직접 | P: `known_read_failure_keeps_status_and_machine_code`, `exact_window_boundary_and_historical_cutoff`; S: `read_cutoff_uses_storage_availability_not_old_evaluation_time`, `newer_narrower_view_never_resurrects_an_older_wide_view`. 재현 불가 history는422이며 현재 null로 대체하지 않는다. |
| V-T11 | 부분 | E: `aggregation_recipe_and_coverage_are_separate_from_validity`, `future_daily_aggregate_is_not_historical_observation`, `unresolved_input_policies_cannot_be_filled_from_legacy`. 집계 메타·coverage 검사만 존재한다. 원시 샘플 집계기·승인 recipe·HCI 일자료 재현은 없다. |
| V-T12 | 직접 | S: `read_cutoff_uses_storage_availability_not_old_evaluation_time`, `missing_target_stays_identifiable_without_evaluation_or_get_write`; E: `reference_only_forecast_keeps_mode_none_and_unknown_issue`, `used_input_mode_and_provenance_are_retained`; P: `null_target_identity_is_preserved_without_evaluation_on_get`. Z도 첫 조회와 고정 cutoff 재조회에서 queried_at만 제외한 저장행 전체가 같은지 확인한다. row/read cutoff·실제 사용 mode·null target을 구분한다. |
| V-A01 | 직접 | R: `pagination_filter_search_and_null_values`, `source_queries_use_read_only_transactions`, `legacy_api_is_not_mounted`; S: `additive_upgrade_preserves_source_rows`. 일반 data 계약과 추가 스키마의 기존 자료 보존을 검사한다. |
| V-A02 | 직접 | E: `unsupported_and_temporary_restriction_are_distinct`, `support_does_not_approve_unresolved_safety`, `explicit_restriction_overrides_missing_and_good_environment`, `zero_is_a_measurement_but_is_not_a_default_score`. 현재 상태의 원인을 분리한다. |
| V-A03 | 부분 | E: `default_has_no_score_or_inferred_population`; M: `activity_forecast_keeps_grade_skill_halfday_and_unknown_issue_time`. 현 버전에서 null 선호/품질과 원등급을 유지한다. 별도 개인 요구·불확실성 범위를 계산하는 모델/UI는 없다. |
| V-A04 | 직접 | P: `unknown_or_promoted_model_cannot_enter_public_api`; E: `mutating_returned_registry_copies_does_not_change_registry`, `bundled_provenance_is_complete_and_source_hashes_match`. 정확한 현재 registry와 버전만 공개하며 요청을 최신 버전으로 바꾸지 않는다. |
| V-A05 | 직접 | P: `null_target_identity_is_preserved_without_evaluation_on_get`, `database_outage_is_not_empty_success_or_secret_error`, `write_methods_not_accepted_and_openapi_documents_routes`; S: `missing_target_stays_identifiable_without_evaluation_or_get_write`, `support_fields_and_duration_are_validated_before_publication`; N: `startup_and_catalog_never_seed_or_collect`. H: `internal_orchestration_captures_request_without_publication`; Z도 저장만으로 공개되지 않고 GET 전후 평가 행 수가 같음을 확인한다. 읽기·오류 경계와 임의 원본문서 필드 거부를 검사한다. |
| V-A06 | 직접 | E: `default_has_no_score_or_inferred_population`와 PreferenceDTO/RecommendationDTO의 null 타입; P: `empty_data_is_unknown_not_a_synthetic_score`. 선호·활동 순위를 계산하지 않는다. |
| V-A07 | 부분 | E: `zero_is_a_measurement_but_is_not_a_default_score`, `persisted_dto_cannot_override_safety_routing_or_numeric_score`. 현재 숫자0도 공개 점수로 거부한다. 미래 evaluated=0의 오프라인 contract fixture/수치 모델은 이번 구현에 없다. |
| V-A08 | 직접 | P: `invalid_query_is_bounded_and_does_not_reach_storage`, `unknown_or_promoted_model_cannot_enter_public_api`; E: `persisted_dto_cannot_override_safety_routing_or_numeric_score`. query·저장 DTO로 실험 숫자를 노출하지 못한다. |
| V-A09 | 부분 | E: `unsupported_and_temporary_restriction_are_distinct`, `support_unknown_retains_independent_official_warning`, `explicit_restriction_overrides_missing_and_good_environment`, `caution_is_preserved_while_overall_safety_is_unknown`. 현재 도달하는 우선순위를 검사한다. 승인 safety=caution 및 evaluated 환경의 미래 분기는 공개 도달 불가다. |
| V-A10 | 직접 | E: `caution_is_preserved_while_overall_safety_is_unknown`, `support_unknown_retains_independent_official_warning`, `known_restriction_survives_conflicting_clear_with_same_reference`, `persisted_dto_cannot_override_safety_routing_or_numeric_score`. 알림/제한·결손과 상위 요약을 보존한다. 프론트 렌더링 변경은 하지 않았다. |
| V-A11 | 부분 | E: `restriction_precedes_outside_forecast_but_both_reasons_remain`, `explicit_empty_forecast_coverage_is_not_unknown_coverage`, `unsupported_and_temporary_restriction_are_distinct`; P: `unknown_or_promoted_model_cannot_enter_public_api`. 현재 우선순위와 모든 공개 모델 우회 거부를 검사한다. 미래 model_not_released 대 입력 결손의 상태 분기는 구현하지 않았다. |
| V-A12 | 부분 | E: `manual_complete_safety_cannot_bypass_unapproved_registry`, `caution_is_preserved_while_overall_safety_is_unknown`, `support_does_not_approve_unresolved_safety`. 내부 통과를 외부검증으로 승격하지 않는다. 승인 safety=caution+환경 결손 조합은 현재 거부하므로 미래 동작 검사는 없다. |
| V-A13 | 부분 | P: `unknown_or_promoted_model_cannot_enter_public_api`; E: `mutating_returned_registry_copies_does_not_change_registry`. 현재 모든 비기본 모델·숫자를 차단한다. validated scope·출시 게이트의 개별 통과 조합과 실제 수치 공개 구현은 후속이다. |
| V-A14 | 직접 | E: `diagnostic_has_only_caller_supplied_target_identity`; S: `missing_target_stays_identifiable_without_evaluation_or_get_write`, `interval_overlap_preserves_original_window_and_excludes_right_boundary`, `no_target_inference_and_unknown_place`; P: `null_target_identity_is_preserved_without_evaluation_on_get`. 공급된 불변 target ID·null 평가 ID·원기간과 페이지 분리를 검사한다. Z도 지원 레코드 키를 평가 target 키와 별도로 확인한다. 실제 프론트 dedup 연결은 후속이다. |

이 대응표는 한국 A/B1/B2/C 외부검증, 수치 모델 보정, 출시 게이트 통과 기록이 아니다. 직접 검사로 표시된 사례에서도 외부 기관 데이터의 진실성·전국 적용 범위나 미구현 UI를 검증했다고 확대하지 않는다.

## 실제 실행과 결과

총괄이 실행하고 저장한 [checks.json](checks.json), [명령·환경 기록](backend_run.json), [pytest 로그](backend_test_results.txt), [JUnit 결과](backend_junit.xml)를 이 문서 담당자가 읽어 대조했다. 문서 담당자가 같은 검사를 독립 실행했다는 뜻은 아니다. JUnit에서 전체 240개, 실패/오류/건너뜀 각각0을 확인했다. 44개 설계 사례와 pytest 매개변수 확장 실행 수는 다른 분모다.

| 검사 | 확인된 결과 | 결과의 범위 |
|---|---|---|
| 판정/DTO 단위 | 65 passed | 파라미터 확장 포함. 실제 scope/시각/부분 공식 제한/충돌/nullable/단위 경계를 검사; 현장 성능 아님 |
| HTTP API 계약 | 45 passed | storage 대역을 사용한 요청 allowlist·일관성·오류·공개 차단 검사 |
| 내부 service/adapter | 12 passed | 원자료 투영·정규화 해시·명시적 저장 호출; 자동 publication 없음 |
| 실제 DB 저장/읽기 | 13 passed | PostgreSQL18.3의 폐기 가능한 pongdang_test; 불변 이력·원자성·기간·미확인 이력·read-only 검사 |
| 실제 판정→DB→HTTP 통합 | 1 passed | 미공개 저장→명시적 read manifest→공식 제한/지원/범위 밖/history 재조회 및 원요청 추적 |
| 기존 백엔드 회귀 | 104 passed | 수집·환경 provider adapter·자료 API·독립성·시드 없음·health 검사 |
| 백엔드 전체 | **240 passed, 2 warnings, 3.49초** | 신규136+기존104; failures/errors/skipped=0 |
| 백엔드 Ruff | lint 통과, format 검사 43 files already formatted | 전체 검토 범위의 정적 검사 |
| 기존 프론트 | **12 tests passed; lint/build 통과** | 기존 코드 검사. 평가 API를 프론트에 새로 연결한 검증은 아님 |
| 한국 현장 A/B1/B2/C 검증 | 미실행 | 결과별 표본·보정·장소/계절 외부검증과 게이트 승인이 필요함 |
| 운영 DB·배포·push·자동 모델 활성화 | 미실행 | 운영 데이터가 준비되거나 사이트에 반영되었다고 주장하지 않음 |

백엔드는 저장소의 기존 가상환경에서 일부 dependency 읽기가 멈춰, 변경하지 않은 lockfile로 마련한 임시 환경의 Python3.14.4를 사용했다. 전체 실행은 backend 디렉터리에서 `/tmp/pongdang-be-check-i7qimhac/.venv/bin/python -m pytest -q`에 basetemp와 JUnit 출력 옵션을 명시했으며 정확한 인수는 backend_run.json에 보존했다. DB는 TCP를 열지 않은 별도 PostgreSQL18.3 Unix socket의 `pongdang_test`다. 테스트를 통과시키기 위해 운영 DB에 접속하거나 기존 자료를 지우지 않았다.

경고2개는 Starlette의 httpx TestClient와 AnyIO BlockingPortal alias 사용 중단 예고다. 실패로 은폐하지 않았고 이번 작업에서 dependency/lockfile을 바꾸지 않았다. 프론트는 Node24.19.0에서 저장소 `npm test`가 통과했으며, 원 node_modules의 dataless 파일 읽기 지연 때문에 lint/build는 소스·lockfile을 임시 사본에 복사한 뒤 `npm ci --ignore-scripts --no-audit --no-fund`, `npm run lint`, `APP_BASE_PATH=/pongdang/ npm run build`로 검사했다. 원 프론트 파일과 사용자 개발 서버를 수정하지 않았다.

[api_response_examples.json](api_response_examples.json)은 위 실제 통합 검사에서 HTTP로 얻은 5개 응답이다: unpublished, official_restriction, support, outside_forecast_horizon, historical_replay. 파일의 documentation_only/synthetic_integration_cases/not_production_data/not_seed_or_fallback 표시는 필수 해석 경계다. 원기관 이름·장소·시각·제한은 합성 소프트웨어 사례이며 실자료, API fallback, DB seed, 모델 학습자료로 사용할 수 없다.

최종 대응표는 **44개 유일 사례: 직접26·부분17·후속1**이다. 인계 문서와 이 표의 모든 로컬 링크, 인용한 실제 test 함수명의 존재를 정적으로 확인했다. 직접26이라는 수는 연구적 타당성이나 출시 완료율이 아니다. 운영 근거 producer/기관·장소 매핑, 여섯 활동의 승인된 required/optional 정책, 원자료 집계 recipe, 수치 모델/비교 기준 재현, 한국 결과 자료, 외부검증·출시 게이트와 실제 프론트 연결은 여전히 별도 작업이다.
