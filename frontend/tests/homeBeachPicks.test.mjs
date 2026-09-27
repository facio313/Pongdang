import assert from 'node:assert/strict';
import test from 'node:test';
import { homeBeachShuffleSeed, selectHomeBeaches } from '../src/homeBeachPicks.ts';

const places = Array.from({ length: 12 }, (_, i) => ({ id: i + 1, name: `TEST beach ${i + 1}`, type: 'beach' }));
function summary(id, metric = {}, evidence = {}) {
  return { spot_id: id, retained: false, water_temperature: {
    name: 'water_temperature', value: 23.5, unit: '°C', status: 'available', station_id: 3,
    station_name: 'TEST station', relation: 'nearby_station_context', distance_km: 1.9,
    evidence: [{ provider: 'TEST', numeric_value: 23.5, unit: 'degC', is_missing: false, mode: 'observation',
      observed_at: '2026-09-27T15:00:00+09:00', valid_until: '2026-09-27T15:30:00+09:00', ...evidence }],
    ...metric,
  } };
}
const summaries = () => new Map(places.map(place => [place.id, summary(place.id)]));
const ids = rows => rows.map(row => row.id);
const withTemperatures = values => new Map(values.map((value, index) =>
  [index + 1, summary(index + 1, { value }, { numeric_value: value })]));

test('four different temperatures are chosen whenever at least four values exist', () => {
  const data = withTemperatures([20, 20, 20, 21, 21, 22, 22, 23, 23, 24, 24, 24]);
  for (const seed of [0, 1, 17, 300]) {
    const result = selectHomeBeaches(places, data, seed);
    assert.equal(result.length, 4);
    assert.equal(new Set(result.map(row => row.temperature.value)).size, 4);
    assert.equal(new Set(ids(result)).size, 4);
  }
});

test('three temperatures produce only three cards without a duplicate filler', () => {
  const data = withTemperatures([23.62, 23.62, 23.62, 24.3, 24.3, 21.5]);
  for (const seed of [0, 1, 17, 300]) {
    const result = selectHomeBeaches(places, data, seed);
    assert.equal(result.length, 3);
    const values = result.map(row => row.temperature.value);
    assert.deepEqual([...new Set(values.slice(0, 3))].sort(), [21.5, 23.62, 24.3]);
    assert.equal(new Set(ids(result)).size, 3);
  }
});

test('two available temperatures produce only two cards', () => {
  const data = withTemperatures([23.62, 23.62, 23.62, 24.3, 24.3]);
  const result = selectHomeBeaches(places, data, 17);
  assert.equal(result.length, 2);
  assert.deepEqual(result.slice(0, 2).map(row => row.temperature.value).sort(), [23.62, 24.3]);
  assert.ok(result.every(row => row.temperature.value === data.get(row.id).water_temperature.value));
  assert.equal(new Set(ids(result)).size, 2);
});

test('one shared temperature produces one randomly chosen beach instead of duplicate cards', () => {
  const result = selectHomeBeaches(places, summaries(), 1);
  assert.equal(result.length, 1);
  assert.notDeepEqual(ids(result), [1]);
  assert.ok(result.every(row => row.temperature.value === 23.5 && row.temperature.relation === 'nearby_station_context'));
  assert.deepEqual(places.map(p => p.id), Array.from({ length: 12 }, (_, i) => i + 1));
});

test('the same draw survives row reordering, response ordering and layout remounts', () => {
  const data = withTemperatures([20, 20, 21, 22, 22, 23, 24]);
  const expected = selectHomeBeaches(places, data, 17);
  const reversed = new Map([...data].reverse());
  assert.deepEqual(selectHomeBeaches([...places].reverse(), reversed, 17), expected);
  assert.equal(homeBeachShuffleSeed(), homeBeachShuffleSeed());
});

test('different seeds draw from the entire eligible set', () => {
  const draws = [1, 2, 3, 4, 5].map(seed => ids(selectHomeBeaches(places, summaries(), seed)));
  assert.ok(new Set(draws.map(draw => draw.join(','))).size > 1);
  assert.ok(new Set(draws.flat()).size > 1);
});

test('missing data never fills spare slots and non-beaches or duplicate places are excluded', () => {
  const data = new Map([[2, summary(2)], [3, summary(3, { value: 24 }, { numeric_value: 24 })]]);
  const candidates = [places[0], places[1], places[1], { ...places[2], type: 'valley' }];
  assert.deepEqual(ids(selectHomeBeaches(candidates, data, 0)), [2]);
  assert.deepEqual(selectHomeBeaches(places, new Map(), 0), []);
  assert.equal(selectHomeBeaches(places, data, 0).length, 2);
});

test('direct, representative and nearby temperatures retain the source and stale status', () => {
  for (const relation of ['station_observation_point', 'representative_station', 'nearby_station_context']) {
    const row = { ...summary(1, { relation, status: 'provisional' }), retained: true };
    const result = selectHomeBeaches(places, new Map([[1, row]]), 0)[0];
    assert.equal(result.temperature.relation, relation);
    assert.equal(result.temperature.stale, true);
    assert.equal(result.temperature.stationName, 'TEST station');
    assert.equal(result.temperature.distanceKm, 1.9);
    assert.equal(result.temperature.observedAt, '2026-09-27T15:00:00+09:00');
    assert.equal(result.temperature.validUntil, '2026-09-27T15:30:00+09:00');
  }
});

test('forecast, non-temperature, missing, conflict and invalid source evidence is ineligible', () => {
  const invalid = [
    summary(1, { value: null }), summary(1, { value: NaN }), summary(1, { name: 'air_temperature' }),
    summary(1, { status: 'conflict' }), summary(1, { status: 'unknown' }), summary(1, { unit: 'F' }),
    summary(1, { evidence: [] }), summary(1, { relation: 'containing_forecast_grid' }),
    summary(1, { distance_km: null }), summary(1, { distance_km: -1 }),
    summary(1, {}, { mode: 'forecast' }), summary(1, {}, { is_missing: true }),
    summary(1, {}, { numeric_value: 20 }), summary(1, {}, { unit: 'F' }),
    summary(1, {}, { valid_until: null }), summary(1, {}, { observed_at: 'unknown' }),
    { ...summary(1), water_temperature: null }, { ...summary(1), retention_allowed: false }, summary(2),
  ];
  for (const row of invalid) assert.deepEqual(selectHomeBeaches(places, new Map([[1, row]]), 0), [], JSON.stringify(row));
});

test('zero-degree observations are real values and remain eligible', () => {
  const row = summary(1, { value: 0 }, { numeric_value: 0 });
  assert.equal(selectHomeBeaches(places, new Map([[1, row]]), 0)[0].temperature.value, 0);
});
