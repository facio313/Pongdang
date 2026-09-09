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
test('synthetic providers, units and tasks remain explicitly synthetic', () => {
  assert.match(codeName('metrics', 'source', 'PONGDANG_DEMO_MOE'), /수집기 미구현/);
  assert.match(codeName('metrics', 'unit', 'demo_index'), /공식 지수 아님/);
  assert.equal(codeName('runs', 'task_name', 'DEMO/weather-nowcast'), '현재 기상 수집 · 합성 예시 (실제 실행 아님)');
  assert.equal(codeName('runs', 'task_name', 'weather-nowcast'), '현재 기상 수집');
});
