import assert from 'node:assert/strict';
import test from 'node:test';
import { candidateCourse, moveCandidate } from '../src/candidateCourse.ts';

const result = {
  request: { dates: ['2026-10-01'], activity: 'relax', preferred_tags: [] },
  selection_token: 'signed-selection',
  recommendations: [7, 9, 12, 15, 18].map((spot_id, index) => ({
    spot_id, rank: index + 1, name: `Place ${spot_id}`,
    confirmed: { latitude: 37 + index / 10, longitude: 128 },
  })),
};

test('drag order changes visits and origin while keeping the server-issued ranks intact', () => {
  const reordered = moveCandidate(result, 15, 7);
  assert.deepEqual(reordered.recommendations.map(row => row.spot_id), [15, 7, 9, 12, 18]);
  const input = candidateCourse(reordered, [7, 12, 15]);
  assert.deepEqual(input.stops.map(stop => stop.spot_id), [15, 7, 12]);
  assert.deepEqual(input.selected_ranks, [4, 1, 3]);
  assert.equal(input.selection_token, 'signed-selection');
  assert.equal(input.request.origin.spot_id, 15);
  assert.ok(input.stops.every(stop => stop.day === '2026-10-01'));
  assert.deepEqual(result.recommendations.map(row => row.spot_id), [7, 9, 12, 15, 18]);
});

test('unchecking the first visit picks the next checked origin; checking again restores its list position', () => {
  const moved = moveCandidate(result, 18, 9);
  const withoutFirst = candidateCourse(moved, [9, 12, 18]);
  assert.equal(withoutFirst.request.origin.spot_id, 18);
  assert.deepEqual(withoutFirst.stops.map(stop => stop.spot_id), [18, 9, 12]);
  assert.deepEqual(candidateCourse(moved, [18, 9, 12, 7]).stops.map(stop => stop.spot_id), [7, 18, 9, 12]);
  assert.equal(candidateCourse(result, []), null);
  assert.equal(candidateCourse(result, [999]), null);
});

test('missing first-place coordinates do not silently substitute another origin', () => {
  const missing = structuredClone(result);
  missing.recommendations[0].confirmed.latitude = null;
  const input = candidateCourse(missing, [7, 9]);
  assert.equal(input.request.origin, undefined);
  assert.deepEqual(input.stops.map(stop => stop.spot_id), [7, 9]);
});

test('moving to either end keeps all candidates, while invalid moves have no effect', () => {
  assert.deepEqual(moveCandidate(result, 7, 18).recommendations.map(row => row.spot_id), [9, 12, 15, 18, 7]);
  assert.equal(moveCandidate(result, 7, 7), result);
  assert.equal(moveCandidate(result, 999, 7), result);
  assert.equal(moveCandidate(result, 7, 999), result);
});
