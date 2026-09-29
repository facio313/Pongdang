import assert from 'node:assert/strict';
import test from 'node:test';
import { firstSwimDataLabel, selectPlaceTemperature, selectNearbyTemperature } from '../src/firstSwimTemperature.ts';

const observedAt = '2026-09-27T15:00:00+09:00';
const validUntil = '2026-09-27T15:30:00+09:00';
function placePage() {
  return { rows: [{ spot_id: 9, lat: 37.8, lng: 128.9, stations: [{
    spot_id: 9, station_id: 14, source_id: 'TEST', name: 'TEST station',
    latitude: 37.8, longitude: 128.9, relation: 'station_observation_point', mapping: null,
  }], layers: [{ station_id: 14, provider: 'TEST', name: 'water_temperature',
    numeric_value: 23.5, unit: 'degC', mode: 'observation', is_missing: false,
    observed_at: observedAt, valid_until: validUntil, status: 'observation',
  }] }] };
}
function metric(overrides = {}, evidence = {}) {
  return { name: 'water_temperature', label: '수온', unit: '°C', value: 24.3,
    station_id: 13, station_name: 'TEST nearby station', relation: 'nearby_station_context',
    spatial_scope: 'nearby', distance_km: 4.056, status: 'available',
    evidence: [{ provider: 'TEST', observed_at: observedAt, valid_until: validUntil,
      fetched_at: observedAt, issued_at: null, mode: 'observation',
      is_missing: false, numeric_value: 24.3, unit: 'degC', ...evidence }], ...overrides };
}
function nearby(metrics = [metric()], overrides = {}) {
  return { spot_id: 9, mode: 'observation', context_metrics: metrics, ...overrides };
}

test('place observations keep their source, exact value and distance; retained data stays prior', () => {
  const page = placePage();
  const result = selectPlaceTemperature(page, 9);
  assert.equal(result.needsNearby, false);
  assert.equal(result.reading.value, 23.5);
  assert.equal(result.reading.relation, 'station_observation_point');
  assert.equal(result.reading.distanceKm, 0);
  assert.equal(result.reading.observedAt, observedAt);
  assert.equal(result.reading.validUntil, validUntil);
  assert.equal(result.reading.stale, false);
  assert.equal(selectPlaceTemperature({ ...page, retained: true }, 9).reading.stale, true);
  page.rows[0].layers[0].status = 'stale';
  assert.equal(selectPlaceTemperature(page, 9).reading.stale, true);
});

test('nearby lookup starts only after an empty observation result for the requested place', () => {
  const page = placePage();
  page.rows[0].layers = [];
  assert.equal(selectPlaceTemperature(page, 9).needsNearby, true);
  assert.equal(selectPlaceTemperature(page, 10).needsNearby, false);
  assert.equal(selectPlaceTemperature(undefined, 9).needsNearby, false);
});

test('a direct station takes precedence over a representative station without averaging', () => {
  const page = placePage();
  page.rows[0].layers.push({ ...page.rows[0].layers[0], station_id: 15, numeric_value: 20 });
  page.rows[0].stations.push({ ...page.rows[0].stations[0], station_id: 15, relation: 'representative_station' });
  assert.equal(selectPlaceTemperature(page, 9).reading.value, 23.5);
});

test('representative observations retain their relation and require a valid mapping', () => {
  const page = placePage();
  const station = page.rows[0].stations[0];
  station.relation = 'representative_station';
  station.mapping = { valid_from: '2026-09-01T00:00:00Z', valid_until: '2026-10-01T00:00:00Z' };
  assert.equal(selectPlaceTemperature(page, 9).reading.relation, 'representative_station');
  station.mapping.valid_until = observedAt;
  assert.equal(selectPlaceTemperature(page, 9).reading, undefined);
  assert.equal(selectPlaceTemperature(page, 9).needsNearby, false);
});

test('invalid or ambiguous place readings are not hidden by a nearby fallback', () => {
  for (const changes of [{ is_missing: true }, { numeric_value: null }, { numeric_value: NaN },
    { unit: 'F' }, { status: 'unknown' }, { observed_at: 'unknown' }, { valid_until: null },
    { valid_until: observedAt }]) {
    const page = placePage();
    Object.assign(page.rows[0].layers[0], changes);
    const result = selectPlaceTemperature(page, 9);
    assert.equal(result.reading, undefined, JSON.stringify(changes));
    assert.equal(result.needsNearby, false);
  }
  const page = placePage();
  page.rows[0].layers.push({ ...page.rows[0].layers[0], numeric_value: 20 });
  assert.equal(selectPlaceTemperature(page, 9).reading, undefined);
  assert.equal(selectPlaceTemperature(page, 9).needsNearby, false);
});

test('nearby data preserves station, distance, provider and observation timestamps', () => {
  const scope = '국립수산과학원 관측소 표층 · 측정 수심 5m';
  const result = selectNearbyTemperature(nearby([metric({}, { spatial_scope: scope })]), 9).reading;
  assert.equal(result.relation, 'nearby_station_context');
  assert.equal(result.stationName, 'TEST nearby station');
  assert.equal(result.distanceKm, 4.056);
  assert.equal(result.provider, 'TEST');
  assert.equal(result.value, 24.3);
  assert.equal(result.observedAt, observedAt);
  assert.equal(result.validUntil, validUntil);
  assert.equal(result.observationScope, scope);
});

test('nearest station is deterministic and duplicate feeds are not averaged', () => {
  const close = metric();
  const duplicate = metric({ station_id: 15 }, { provider: 'TEST second feed' });
  const far = metric({ station_id: 3, station_name: 'TEST far station', distance_km: 8 });
  for (const metrics of [[far, duplicate, close], [close, far, duplicate]]) {
    assert.equal(selectNearbyTemperature(nearby(metrics), 9).reading.provider, 'TEST');
    assert.equal(selectNearbyTemperature(nearby(metrics), 9).reading.value, 24.3);
  }
  const conflict = metric({ station_id: 15, value: 20 }, { numeric_value: 20 });
  const result = selectNearbyTemperature(nearby([close, conflict]), 9);
  assert.equal(result.reading, undefined);
  assert.equal(result.reason, '같은 시각의 수온 관측이 서로 다릅니다.');
});

test('a newer observation breaks a shared station distance tie', () => {
  const newer = metric({ station_id: 15, value: 24.1 }, {
    numeric_value: 24.1, observed_at: '2026-09-27T15:10:00+09:00',
  });
  assert.equal(selectNearbyTemperature(nearby([metric(), newer]), 9).reading.value, 24.1);
});

test('forecast, wrong-place, missing, conflicting and untraceable nearby data stays unknown', () => {
  for (const data of [undefined, nearby([], {}), nearby([metric()], { spot_id: 10 }),
    nearby([metric()], { mode: 'forecast' }), nearby([metric({ relation: 'containing_forecast_grid' })]),
    nearby([metric({ status: 'conflict' })]), nearby([metric({ unit: 'F' })]),
    nearby([metric({ distance_km: null })]), nearby([metric({ distance_km: -1 })]),
    nearby([metric({ value: null })]), nearby([metric({ evidence: [] })]),
    nearby([metric({}, { mode: 'forecast' })]), nearby([metric({}, { is_missing: true })]),
    nearby([metric({}, { numeric_value: 20 })]), nearby([metric({}, { unit: 'F' })]),
    nearby([metric({}, { observed_at: 'unknown' })]), nearby([metric({}, { valid_until: null })])]) {
    assert.equal(selectNearbyTemperature(data, 9).reading, undefined, JSON.stringify(data));
  }
});

test('stored and retained nearby evidence carries prior-observation status', () => {
  assert.equal(selectNearbyTemperature(nearby([metric({ status: 'stale' })]), 9).reading.stale, true);
  assert.equal(selectNearbyTemperature(nearby([metric()], { retained: true }), 9).reading.stale, true);
});

test('first-swim list labels distinguish current place data from nearby and expired observations', () => {
  const direct = selectPlaceTemperature(placePage(), 9).reading;
  const context = selectNearbyTemperature(nearby(), 9).reading;
  assert.equal(firstSwimDataLabel('available', direct), '첫 입수 자료 있음');
  assert.equal(firstSwimDataLabel('available', { ...direct, relation: 'representative_station' }), '첫 입수 자료 있음');
  assert.equal(firstSwimDataLabel('available', context), '첫 입수 · 주변 자료');
  assert.equal(firstSwimDataLabel('stale', direct), '첫 입수 · 이전 자료');
  assert.equal(firstSwimDataLabel('stale', context), '첫 입수 · 주변 이전 자료');
  assert.equal(firstSwimDataLabel('available', { ...direct, stale: true }), '첫 입수 · 이전 자료');
});

test('first-swim list labels never present an incomplete or failed read as available data', () => {
  const direct = selectPlaceTemperature(placePage(), 9).reading;
  assert.equal(firstSwimDataLabel('loading', direct), '첫 입수 자료 확인 중');
  assert.equal(firstSwimDataLabel('error', direct), '첫 입수 자료 조회 실패');
  assert.equal(firstSwimDataLabel('missing', direct), '첫 입수 자료 없음');
  assert.equal(firstSwimDataLabel('available'), '첫 입수 자료 없음');
});
