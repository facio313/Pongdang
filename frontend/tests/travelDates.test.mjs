import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultRouteDeparture, isTravelDate, travelDates } from '../src/travelDates.ts';
import { visitTimingText } from '../src/travelApi.ts';
import { recentCatalogVerification } from '../src/catalogVerification.ts';

test('travel dates use seven Korean calendar days across month boundaries', () => {
  const now = '2026-10-31T15:30:00Z';
  assert.deepEqual(travelDates(now).map(day => day.id), [
    '2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04',
    '2026-11-05', '2026-11-06', '2026-11-07',
  ]);
  assert.equal(isTravelDate('2026-10-31', now), false);
  assert.equal(isTravelDate('2026-11-08', now), false);
});

test('future trips default to morning and today stays on the chosen date', () => {
  assert.equal(defaultRouteDeparture('2026-10-14', '2026-10-13T04:00:00Z'), '2026-10-14T09:00');
  assert.equal(defaultRouteDeparture('2026-10-13', '2026-10-13T04:00:00Z'), '2026-10-13T13:10');
  assert.equal(defaultRouteDeparture('2026-10-13', '2026-10-13T14:55:00Z'), '2026-10-13T23:59');
});

test('tourism verification needs complete server evidence and expires without marking older places', () => {
  const now = Date.parse('2026-10-13T04:00:00Z');
  assert.equal(recentCatalogVerification(true, '2026-10-12T04:00:00Z', now), true);
  assert.equal(recentCatalogVerification(false, '2026-10-12T04:00:00Z', now), false);
  assert.equal(recentCatalogVerification(true, '2026-10-11T04:00:00Z', now), false);
  assert.equal(recentCatalogVerification(true, '2026-10-14T04:00:00Z', now), false);
  assert.equal(recentCatalogVerification(true, null, now), false);
});


test('visit timing distinguishes physical arrival and waiting from activity start', () => {
  assert.equal(visitTimingText({}), '');
  assert.equal(visitTimingText({ visit_timing: { part_of_day: 'afternoon', physical_arrival_at: '2026-10-13T12:30:00+09:00', wait_minutes: 30 } }), '12:30 도착 후 30분 대기 · 오후 방문');
  assert.equal(visitTimingText({ visit_timing: { part_of_day: 'morning', wait_minutes: 0 } }), '오전 방문 시간대 반영');
});
