import assert from 'node:assert/strict';
import test from 'node:test';
import { courseCandidateRanks, courseInputForSelection, moveCoursePlace } from '../src/courseEditing.ts';

const input = {
  request: {
    dates: ['2026-09-29'], activity: 'relax', preferred_tags: ['beach'],
    must_include: [7, 9, 10, 11], origin: { label: 'Old origin', spot_id: 7 },
  },
  stops: [7, 9, 10, 11].map((spot_id, index) => ({
    item_id: `stop-${spot_id}`, spot_id, day: '2026-09-29',
    stay_minutes: 30 + index * 10, fixed: index === 2,
    requested_arrival: index === 2 ? '15:00' : null, role: 'visit',
  })),
  selection_token: 'previous-selection', selected_ranks: [1, 2, 3, 4],
  route_token: 'previous-route',
};
const places = [7, 9, 10, 11].map((id, index) => ({
  id, name: `Place ${id}`, lat: 37 + index / 100, lng: 128,
}));

test('edited selection preserves stop details and picks the first checked origin without reusing old receipts', () => {
  const before = structuredClone(input);
  const edited = courseInputForSelection(input, [10, 7, 11], places);
  assert.deepEqual(edited.stops, [input.stops[2], input.stops[0], input.stops[3]]);
  assert.deepEqual(edited.request.must_include, [10, 7, 11]);
  assert.deepEqual(edited.request.origin, {
    label: 'Place 10', spot_id: 10, latitude: 37.02, longitude: 128,
  });
  assert.equal(edited.request.activity, 'relax');
  assert.equal(edited.selection_token, undefined);
  assert.equal(edited.selected_ranks, undefined);
  assert.equal(edited.route_token, undefined);
  assert.deepEqual(input, before);
});

test('an empty, duplicate or unknown selection cannot silently save a partial course', () => {
  assert.equal(courseInputForSelection(input, [], places), null);
  assert.equal(courseInputForSelection(input, [7, 7], places), null);
  assert.equal(courseInputForSelection(input, [7, 999], places), null);
  assert.equal(courseInputForSelection(null, [7], places), null);
});

test('missing first-stop coordinates never substitute a different starting place', () => {
  const missing = places.map(place => place.id === 10 ? { ...place, lat: null } : place);
  const edited = courseInputForSelection(input, [10, 7], missing);
  assert.equal(edited.request.origin, undefined);
  assert.deepEqual(edited.stops.map(stop => stop.spot_id), [10, 7]);
});

test('new signed candidate ranks follow the edited visit order even when recommendation ranks differ', () => {
  const result = { recommendations: [7, 9, 11, 10].map((spot_id, index) => ({ spot_id, rank: index + 1 })) };
  assert.deepEqual(courseCandidateRanks(result, [10, 7, 11]), [4, 1, 3]);
  assert.deepEqual(courseCandidateRanks(result, [10, 999, 11]), [4, 3]);
});

test('moving a place in either direction keeps the remaining order and leaves the saved list untouched', () => {
  const order = [7, 9, 10, 11];
  assert.deepEqual(moveCoursePlace(order, 11, 7), [11, 7, 9, 10]);
  assert.deepEqual(moveCoursePlace(order, 7, 11), [9, 10, 11, 7]);
  assert.deepEqual(moveCoursePlace(order, 9, 9), order);
  assert.deepEqual(moveCoursePlace(order, 999, 7), order);
  assert.deepEqual(moveCoursePlace(order, 7, 999), order);
  assert.deepEqual(order, [7, 9, 10, 11]);
});
