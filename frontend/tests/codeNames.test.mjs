import { test } from 'node:test';
import assert from 'node:assert/strict';
import { codeName, isCodeField } from '../src/codeNames.ts';

test('metric codes have Korean names without changing the original value', () => {
  assert.equal(codeName('metrics', 'name', 'air_temperature_c'), '기온');
  assert.equal(codeName('metrics', 'name', 'relative_humidity_pct'), '상대 습도');
  assert.equal(codeName('metrics', 'unit', 'degC'), '섭씨 (°C)');
});
test('dictionaries are scoped to dataset and field', () => {
  assert.equal(codeName('spots', 'name', 'air_temperature_c'), undefined);
  assert.equal(codeName('facilities', 'type', 'parking'), '주차장');
  assert.equal(codeName('spots', 'type', 'parking'), '미등록 코드');
  assert.equal(isCodeField('metrics', 'value'), false);
});
test('unknown, empty and prototype keys never acquire invented meanings', () => {
  assert.equal(codeName('metrics', 'name', 'future_metric'), '미등록 코드');
  assert.equal(codeName('metrics', 'name', 'toString'), '미등록 코드');
  assert.equal(codeName('metrics', 'name', ''), undefined);
});
test('unregistered provider and task codes do not acquire invented meanings', () => {
  assert.equal(codeName('metrics', 'source', 'new-provider'), '미등록 코드');
  assert.equal(codeName('runs', 'task_name', 'unknown-task'), '미등록 코드');
  assert.equal(codeName('runs', 'task_name', 'weather-nowcast'), '현재 기상 수집');
});

test('all newly connected collector jobs have scoped display names', () => {
  const names = {
    khoa_tide_timeseries: '국립해양조사원 조석 시계열 예보',
    khoa_hf_current: '국립해양조사원 HF 해수유동 실측',
    khoa_current_timeseries: '국립해양조사원 조류 시계열 예보',
    khoa_roms: '국립해양조사원 ROMS 표층 예측',
    airkorea_stations: '에어코리아 측정소 목록',
    airkorea_observations: '에어코리아 대기오염 관측',
    kasi_rise_set: '한국천문연구원 출몰시각',
    kma_forecast_zones: '기상청 예보구역 목록',
    kma_uv_forecast: '기상청 자외선 예보',
    koem_wemo_catalog: '해양환경공단 특별관리해역 자동수질 정점 목록',
    koem_wemo_water_quality: '해양환경공단 특별관리해역 자동수질 관측',
    tourapi_english: '한국관광공사 영문 관광정보',
    tourapi_japanese: '한국관광공사 일문 관광정보',
    tourapi_chinese_simplified: '한국관광공사 중문 간체 관광정보',
    tourapi_chinese_traditional: '한국관광공사 중문 번체 관광정보',
    tourapi_daily_visitors: '한국관광공사 지역별 일 방문통계',
    kwater_dam_release: '한국수자원공사 수문 방류정보',
  };
  for (const [raw, label] of Object.entries(names)) {
    assert.equal(codeName('runs', 'task_name', raw), label);
    assert.equal(codeName('collection-jobs', 'task_name', raw), label);
    assert.equal(codeName('runs', 'error_code', raw), '미등록 코드');
  }
});

test('API provider names remain distinct from differently named scheduler jobs', () => {
  for (const dataset of ['snapshots', 'source-stations', 'source-places']) {
    assert.equal(codeName(dataset, 'provider', 'AIRKOREA'), '에어코리아 대기환경·측정소');
    assert.equal(codeName(dataset, 'provider', 'airkorea_observations'), '미등록 코드');
    assert.equal(codeName(dataset, 'provider', 'KMA_UV'), '기상청 자외선 예보');
    assert.equal(codeName(dataset, 'provider', 'khoa_roms'), '국립해양조사원 ROMS 표층 예측');
  }
  assert.equal(codeName('metrics', 'source', 'tourapi_daily_visitors'), '한국관광공사 지역별 일 방문통계');
  assert.equal(codeName('spots', 'catalog_source', 'KMA_FORECAST_ZONE'), '기상청 예보구역');
  assert.equal(codeName('spots', 'catalog_source', 'future-provider'), '미등록 코드');
});

test('disabled does not incorrectly imply a missing key when approval or implementation is pending', () => {
  assert.equal(codeName('collection-jobs', 'state', 'disabled'), '비활성화');
  assert.equal(codeName('runs', 'status', 'disabled'), '비활성화');
  const reasons = {
    KEY_NOT_CONFIGURED: '서버에 필요한 API 키가 설정되지 않음',
    APPROVAL_PENDING: '제공처 서비스 심의·승인 대기',
    SERVICE_APPROVAL_UNCONFIRMED: '해당 서비스 승인·인증 성공 확인 필요',
    ADAPTER_PENDING: '자동 수집 연결 구현 대기',
  };
  for (const [raw, label] of Object.entries(reasons)) {
    assert.equal(codeName('collection-jobs', 'last_error', raw), label);
    assert.equal(codeName('runs', 'error_code', raw), label);
  }
});

test('new physical units and forecasts have distinct names without inferring safety or units', () => {
  assert.equal(codeName('metrics', 'unit', 'cm/s'), '초당 센티미터');
  assert.equal(codeName('metrics', 'unit', 'm/s'), '초당 미터');
  assert.equal(codeName('metrics', 'unit', '16-point'), '16방위');
  assert.equal(codeName('metrics', 'unit', 'degree'), '각도 (°)');
  assert.equal(codeName('metrics', 'name', 'current_direction'), '유향');
  assert.equal(codeName('metrics', 'name', 'uv_index'), '자외선 지수');
  assert.equal(codeName('metrics', 'name', 'pm10_24h_predicted_moving'), '미세먼지 24시간 예측 이동 농도');
  assert.equal(codeName('metrics', 'name', 'daily_visitors'), '지역별 일 방문자 수');
  assert.equal(codeName('metrics', 'unit', ''), undefined);
  assert.equal(codeName('metrics', 'name', 'future_safe_score'), '미등록 코드');
});
