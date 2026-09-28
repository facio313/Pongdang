import assert from 'node:assert/strict';
import test from 'node:test';
import { comparisonPlace, distinctComparisonPlaces } from '../src/comparisonPlaces.ts';
import { conditionSummaryPath } from '../src/productData.ts';

const place = id => ({ id, name: `장소 ${id}`, type: 'beach', address: null,
  region: null, lat: 37.8, lng: 128.9, catalog_verification: null });
const water = value => ({ name: 'water_temperature', value, unit: '°C', status: 'available' });
const summary = (id, score, temperature = 23.79) => ({ spot_id: id,
  condition_score: { status: score === null ? 'unavailable' : 'evaluated', score, components: [] },
  water_temperature: water(temperature) });
const row = (id, score, temperature) => comparisonPlace(place(id), summary(id, score, temperature));

test('comparison preserves the exact hero reference and skips identical readings', () => {
  const conditions = { spot_id: 1, metrics: [water(23.79)], ...summary(1, 64.9) };
  const reference = comparisonPlace(place(1), conditions);
  const rows = distinctComparisonPlaces(reference,
    [row(2, 64.9), row(3, 64.9), row(4, 68), row(5, 70), row(6, 80)]);
  assert.deepEqual(rows.map(item => item.id), [1, 4, 5]);
  assert.equal(rows[0], reference);
  assert.equal(rows[0].conditions, conditions);
  assert.equal(rows[0].score, 64.9);
});

test('alternatives are unique by their displayed pair, with stable ties', () => {
  const rows = distinctComparisonPlaces(row(1, 64.9),
    [row(2, 68), row(3, 68), row(4, 64.9, 24), row(5, 64.9, 25)]);
  assert.deepEqual(rows.map(item => item.id), [1, 2, 4]);
});

const located = (id, district, score, count, type = 'beach') => comparisonPlace({
  ...place(id), province_code: 'gangwon', district_code: district, type,
}, { ...summary(id, score), condition_score: {
  ...summary(id, score).condition_score, available_components: count, total_components: 4,
} });

test('different districts and stronger evidence outrank distance, input order and higher scores', () => {
  const reference = located(1, 'gangneung', 64.7, 4);
  const rows = distinctComparisonPlaces(reference, [
    located(2, 'gangneung', 70, 4),
    located(3, 'goseong', 85, 1),
    located(4, 'donghae', 62, 3),
    located(5, 'donghae', 63, 4),
    located(6, 'goseong', 76, 2),
    located(7, 'yangyang', 95, 4, 'valley'),
  ]);
  assert.deepEqual(rows.map(item => item.id), [1, 5, 6]);
});

test('matching pairs and place aliases stay excluded across districts', () => {
  const reference = located(1, 'gangneung', 64.7, 4);
  const alias = { ...located(2, 'goseong', 90, 4), alias_ids: [1] };
  assert.deepEqual(distinctComparisonPlaces(reference, [
    alias, located(3, 'goseong', 64.7, 4), located(4, 'donghae', 60, 3),
    located(5, 'goseong', 60, 4), located(6, 'yangyang', 70, 1),
  ]).map(item => item.id), [1, 5, 6]);
});

test('unknown regions do not masquerade as other districts and missing coordinates do not block comparison', () => {
  const reference = { ...located(1, 'gangneung', 64.7, 4), lat: null, lng: null };
  const unknown = located(2, undefined, 90, 4);
  assert.deepEqual(distinctComparisonPlaces(reference, [
    unknown, located(3, 'goseong', 75, 1), located(4, 'donghae', 60, 3),
  ]).map(item => item.id), [1, 4, 3]);
});

test('same place identity cannot reappear with different values', () => {
  assert.deepEqual(distinctComparisonPlaces(row(1, 64.9),
    [row(1, 70), row(2, 68), row(2, 72), row(3, 75)]).map(item => item.id), [1, 2, 3]);
});

test('missing, blocked and invalid scores do not count as different readings; zero does', () => {
  const blocked = { ...summary(3, 99), condition_score: { status: 'blocked', score: 99, components: [] } };
  assert.deepEqual(distinctComparisonPlaces(row(1, 64.9), [
    comparisonPlace(place(2)), comparisonPlace(place(3), blocked), row(4, null),
    row(5, NaN), row(6, 0), row(7, 0),
  ]).map(item => item.id), [1, 6]);
});

test('only the reference remains when all alternatives match or lack scores', () => {
  assert.deepEqual(distinctComparisonPlaces(row(1, 64.9),
    [row(2, 64.9), row(3, null)]).map(item => item.id), [1]);
  assert.equal(comparisonPlace(place(1), undefined, true).loading, true);
});

test('full conditions and summary use the same displayed provisional temperature', () => {
  const metric = { ...water(22), status: 'provisional' };
  const reference = comparisonPlace(place(1), {
    ...summary(1, 70), metrics: [], display_metrics: [metric], mode: 'forecast',
  });
  const candidate = comparisonPlace(place(2), { ...summary(2, 70), water_temperature: metric });
  assert.equal(reference.waterTemperature, '22°C');
  assert.deepEqual(distinctComparisonPlaces(reference, [candidate]).map(item => item.id), [1]);
});

test('comparison summary selects the reference mode while existing observation URLs stay stable', () => {
  assert.equal(conditionSummaryPath([3, 2, 3], 'swim'),
    'water-index/conditions/summary?spot_ids=2%2C3&activity=swim');
  assert.equal(conditionSummaryPath([3, 2], 'surf', 'forecast'),
    'water-index/conditions/summary?spot_ids=2%2C3&activity=surf&mode=forecast');
  assert.equal(conditionSummaryPath([], 'swim', 'forecast'), null);
});
