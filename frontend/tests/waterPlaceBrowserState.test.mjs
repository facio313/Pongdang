import assert from 'node:assert/strict';
import test from 'node:test';
import { getWaterPlaceBrowserState, parseWaterPlaceBrowserState, subscribeWaterPlaceBrowser, updateWaterPlaceBrowserState, waterPlaceBrowserPage, WATER_PLACE_BROWSER_KEY } from '../src/waterPlaceBrowserState.ts';

test('a saved catalogue scope survives remounts and reloads without exceeding API bounds', () => {
  const stored = new Map([[WATER_PLACE_BROWSER_KEY, JSON.stringify({ search: '속초', district: 'sokcho', kind: 'beach', page: 2 })]]);
  globalThis.window = { sessionStorage: { getItem: key => stored.get(key), setItem: (key, value) => stored.set(key, value) } };
  assert.deepEqual(getWaterPlaceBrowserState(), { search: '속초', district: 'sokcho', kind: 'beach', page: 2, pageSize: 100 });
  let updates = 0;
  const unsubscribe = subscribeWaterPlaceBrowser(() => updates++);
  updateWaterPlaceBrowserState({ district: 'yangyang', search: '', page: 1 });
  assert.equal(updates, 1);
  assert.deepEqual(parseWaterPlaceBrowserState(stored.get(WATER_PLACE_BROWSER_KEY)), getWaterPlaceBrowserState());
  unsubscribe();
  window.sessionStorage.setItem = () => { throw new Error('storage denied'); };
  updateWaterPlaceBrowserState({ page: 2 });
  assert.equal(getWaterPlaceBrowserState().page, 2);
  delete globalThis.window;
});

test('malformed persisted filters cannot produce unbounded or malformed requests', () => {
  const initial = { search: '', district: '', kind: '', page: 1, pageSize: 100 };
  for (const value of [null, 'broken', 'null', '[]', '42']) assert.deepEqual(parseWaterPlaceBrowserState(value), initial);
  assert.deepEqual(parseWaterPlaceBrowserState(JSON.stringify({ search: 'a'.repeat(101), district: '<script>', kind: 'unknown', page: 10001 })), { ...initial, search: 'a'.repeat(100) });
});

test('ten-row list pages retain their place range across detail, layout and map navigation', () => {
  const saved = parseWaterPlaceBrowserState(JSON.stringify({ page: 11, pageSize: 10 }));
  assert.equal(waterPlaceBrowserPage(saved, 10), 11);
  assert.equal(waterPlaceBrowserPage(saved, 100), 2);
  assert.equal(waterPlaceBrowserPage({ ...saved, page: 2, pageSize: 100 }, 10), 11);
  assert.equal(waterPlaceBrowserPage({ ...saved, page: 1 }, 100), 1);
  assert.equal(waterPlaceBrowserPage({ ...saved, page: 10000, pageSize: 100 }, 10), 10000);
  assert.equal(parseWaterPlaceBrowserState(JSON.stringify({ pageSize: 100000 })).pageSize, 100);
});
