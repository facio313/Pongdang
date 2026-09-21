import assert from 'node:assert/strict';
import test from 'node:test';
import { calendarDays, conditionPath, conditionSeriesPath, metricText, forecastInputText, qualityValues, qualityGrade, kstDate, waterQualityLabel, waterQualityDescription, placeRegionLabel, productPlaces } from '../src/productData.ts';
import { travelJson, recommendationPlan, keywordSelection, directionLink } from '../src/travelApi.ts';

test('place region display uses verified districts or addresses without changing provider codes', () => {
  const original = Object.freeze({ region: '51:820', province_code: 'gangwon', district_code: 'goseong', place_kind: 'beach' });
  const place = productPlaces([original]).rows[0];
  assert.equal(placeRegionLabel(place), '고성군');
  assert.equal(place.region, '51:820');
  assert.equal(original.region, '51:820');
  assert.equal(placeRegionLabel({ region: '32:2', address: '강원도 고성군 죽왕면' }), '고성군');
  assert.equal(placeRegionLabel({ region: '51:210', confirmed: { address: '강원특별자치도 속초시 조양동' } }), '속초시');
});

test('unverified region codes stay unknown while readable source regions remain visible', () => {
  for (const region of ['51:820', '51:999', '32:2', '51']) {
    assert.equal(placeRegionLabel({ region }), '지역 미확인');
  }
  assert.equal(placeRegionLabel({ region: '51:999', district_code: 'unknown' }), '지역 미확인');
  assert.equal(placeRegionLabel({ region: '51:999', province_code: 'gangwon' }), '강원도');
  assert.equal(placeRegionLabel({ region: '부산' }), '부산');
  assert.equal(placeRegionLabel({ region: '51:820', address: 'Goseong, Gangwon' }), 'Goseong, Gangwon');
});

test('product dates use KST, including midnight and year boundaries', () => {
  assert.equal(kstDate('2026-12-31T16:00:00Z'), '2027-01-01');
  assert.deepEqual(calendarDays('2026-12-31T16:00:00Z', 2).map(day => day.id), ['2027-01-01', '2027-01-02']);
  // 장소를 아직 모르는 것은 「해당 없음」(null)이 아니라 「조회 중」입니다.
  // useResource 가 둘을 갈라 읽으므로 undefined 여야 합니다 -- null 이면 첫
  // 페인트가 묻지도 않은 것을 「자료 없음」으로 그립니다.
  assert.equal(conditionPath(undefined), undefined);
  assert.match(conditionPath(7), /spot_id=7&activity=swim&mode=observation/);
});
test('calendar and hourly targets travel together in one stored-score query', () => {
  const targets = calendarDays('2026-09-21T03:00:00Z', 7).map(day => day.at);
  const path = conditionSeriesPath(7, 'surf', targets);
  const query = new URL(path, 'https://example.test/').searchParams;
  assert.equal(query.get('spot_id'), '7');
  assert.equal(query.get('activity'), 'surf');
  assert.deepEqual(query.get('targets').split(','), targets);
  assert.equal(query.has('at'), false);
  assert.equal(conditionSeriesPath(undefined, 'surf', targets), undefined);
  assert.equal(conditionSeriesPath(7, 'surf', []), null);
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
test('고른 키워드는 서버 카테고리로 묶이고, 상한을 넘으면 말없이 버리지 않는다', () => {
  // 화면은 서버가 발행한 id 를 그대로 들고 다닙니다. 예전에는 「서핑 강습」
  // 같은 프런트가 만든 라벨을 활동 id 로 되돌렸고, 되돌릴 수 없는 이름
  // (「카페」·「SUP 체험」)은 조용히 사라졌습니다.
  const categories = [
    { id: 'place_type', max_selections: 4 },
    { id: 'activity', max_selections: 3 },
  ];
  const categoryOf = id => ({ beach: 'place_type', surf: 'activity', onsen: 'activity', swim: 'activity', rafting: 'activity' })[id];
  assert.deepEqual(keywordSelection(['beach', 'surf', 'onsen'], categoryOf, categories), [
    { category: 'place_type', values: ['beach'] },
    { category: 'activity', values: ['surf', 'onsen'] },
  ]);
  // 서버가 모르는 id 는 어느 카테고리에도 담기지 않습니다.
  assert.deepEqual(keywordSelection(['unknown'], categoryOf, categories), []);
  assert.throws(() => keywordSelection(['surf', 'swim', 'rafting', 'onsen'], categoryOf, categories), /최대 3개/);
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
