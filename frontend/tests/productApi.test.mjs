import assert from 'node:assert/strict';
import test from 'node:test';
import { calendarDays, conditionPath, metricText, forecastInputText, qualityValues, qualityGrade, kstDate, waterQualityLabel, waterQualityDescription } from '../src/productData.ts';
import { travelJson, recommendationPlan, selectedActivities, directionLink } from '../src/travelApi.ts';

test('product dates use KST, including midnight and year boundaries', () => {
  assert.equal(kstDate('2026-12-31T16:00:00Z'), '2027-01-01');
  assert.deepEqual(calendarDays('2026-12-31T16:00:00Z', 2).map(day => day.id), ['2027-01-01', '2027-01-02']);
  assert.equal(conditionPath(undefined), null);
  assert.match(conditionPath(7), /spot_id=7&activity=swim&mode=observation/);
});
test('missing, conflicting, and stale observations never become zero or another station’s value', () => {
  const value = { name: 'water_temperature', status: 'available', value: 0, unit: '°C' };
  assert.equal(metricText({ metrics: [value] }, 'water_temperature'), '0°C');
  assert.equal(metricText({ metrics: [{ ...value, status: 'stale' }] }, 'water_temperature'), '–');
  assert.equal(metricText({ metrics: [value, { ...value, value: 24 }] }, 'water_temperature'), '–');
  assert.equal(metricText(undefined, 'water_temperature'), '–');
  assert.equal(qualityGrade([]), '–');
  assert.equal(qualityValues([])[0].confidence, null);
});
test('activity labels map to backend IDs and over-limit selections cannot be silently dropped', () => {
  assert.deepEqual(selectedActivities(['서핑', '온천', '카페']), ['surf', 'onsen']);
  assert.deepEqual(selectedActivities(['서핑 강습', '온천 마무리', 'SUP 체험']), ['surf', 'onsen']);
  assert.throws(() => selectedActivities(['서핑', '수영', '래프팅', '온천']), /최대 3개/);
});
test('plan saves preserve real IDs, signed selections, and selected date', () => {
  const result = { request: { dates: ['2026-09-16'] }, recommendations: [{ spot_id: 417, rank: 2 }], selection_token: 'fixture-token' };
  const plan = recommendationPlan(result, '2026-09-17');
  assert.equal(plan.stops[0].spot_id, 417);
  assert.equal(plan.stops[0].day, '2026-09-17');
  assert.deepEqual(plan.selected_ranks, [2]);
  assert.equal(plan.selection_token, 'fixture-token');
  assert.throws(() => recommendationPlan({ ...result, selection_token: null }, '2026-09-17'));
  assert.equal(directionLink('missing', null, null), null);
  assert.match(directionLink('실제 장소', 37.5, 129), /^https:\/\/map.kakao.com\/link\/to\//);
});
test('private mutations preserve the deployment base and same-origin SSO without client credentials', async () => {
  let request;
  await travelJson('/pongdang/', 'travel/plans', 'POST', { stops: [] }, undefined, async (url, options) => { request = { url, options }; return new Response(JSON.stringify({ plan_id: 'fixture' })); });
  assert.equal(request.url, '/pongdang/api/data/travel/plans');
  assert.equal(request.options.credentials, 'same-origin');
  assert.deepEqual(Object.keys(request.options.headers), ['Content-Type']);
  for (const status of [401, 403, 409, 422, 503]) await assert.rejects(travelJson('/', 'travel/plans', 'POST', {}, undefined, async () => new Response('private database password', { status })), error => !error.message.includes('password'));
  assert.equal(await travelJson('/', 'travel/signals/id', 'DELETE', undefined, undefined, async () => new Response(null, { status: 204 })), undefined);
});

test('server-selected context displays wave and zero rainfall without scoring rainfall', () => {
  const data = { metrics: [], display_metrics: [
    { name: 'wave_height', status: 'available', value: 0.4, unit: 'm' },
    { name: 'precipitation', status: 'available', value: 0, unit: 'mm/1h' },
  ] };
  assert.equal(metricText(data, 'wave_height'), '0.4m');
  assert.equal(metricText(data, 'precipitation'), '0mm/1h');
  assert.equal(metricText({ ...data, display_metrics: data.display_metrics.map(m => ({ ...m, status: 'conflict' })) }, 'precipitation'), '–');
});

test('water quality always labels historical station samples and never fills invalid grades', () => {
  const data = { status: 'historical', grade: 2, label: '좋음', wqi: null, station_name: '강릉4', relation: 'nearby_station_context', distance_km: 1.94, observed_at: '2025-11-19T15:00:00Z', age_days: 300 };
  assert.equal(waterQualityLabel(data), '2등급 · 과거');
  assert.match(waterQualityDescription(data), /강릉4 관측소 1.9km · 2025-11-20 검사 · 300일 전 과거 자료/);
  assert.match(waterQualityDescription(data), /오늘 해변의 수질·입수 안전 판정은 아닙니다/);
  for (const grade of [0, 6, NaN, 2.5, null]) assert.equal(waterQualityLabel({ ...data, grade }), '검사 자료 없음');
  assert.equal(waterQualityLabel({ ...data, status: 'conflict' }), '자료 상충');
  assert.equal(waterQualityLabel({ ...data, grade: null, status: 'unsupported' }), '평가 기준 없음');
  assert.equal(waterQualityLabel(undefined), '검사 자료 없음');
});

test('forecast display preserves rainfall categories and maximum wave labels', () => {
  const rainfall = { state: 'recorded', numeric_value: null, text_value: 'PCP=강수없음', unit: 'mm/1h' };
  assert.equal(forecastInputText(rainfall, 'available'), 'PCP=강수없음');
  assert.equal(forecastInputText({ ...rainfall, numeric_value: 0 }, 'available'), '0mm/1h');
  assert.equal(forecastInputText(rainfall, 'stale'), '–');
  assert.equal(forecastInputText({ ...rainfall, state: 'missing' }, 'available'), '–');
  const data = { metrics: [], display_metrics: [
    { name: 'precipitation', status: 'text', value: null, text_value: '1.0mm 미만', unit: 'mm/1h' },
    { name: 'maximum_wave_height', status: 'provisional', value: 0.4, unit: 'm' },
  ] };
  assert.equal(metricText(data, 'precipitation'), '1.0mm 미만');
  assert.equal(metricText(data, 'wave_height'), '최대 0.4m');
  assert.equal(metricText({ ...data, metrics: [{ name: 'wave_height', status: 'conflict', value: null, unit: 'm' }] }, 'wave_height'), '–');
});
