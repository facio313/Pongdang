import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers/promises';
import test from 'node:test';
import { loadResource } from '../src/useResource.ts';
import { invalidateResources, RESOURCE_REFRESH_INTERVAL } from '../src/resourceRefresh.ts';

const path = id => `datasets/spots?page_size=1&filter_column=id&filter_value=${id}`;
const place = (id, name = `장소 ${id}`, type = 'tourism') => ({ rows: [{ id, name, type }], total: 1 });

test('saved-place reads share concurrent requests, cached rows, and the three-slot queue', async t => {
  invalidateResources();
  const started = [], finish = [];
  let active = 0, maximum = 0;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    const id = Number(new URL(url, 'https://test.invalid').searchParams.get('filter_value'));
    assert.equal(options.method, 'GET');
    assert.equal(options.credentials, 'same-origin');
    started.push(id);
    maximum = Math.max(maximum, ++active);
    await new Promise(resolve => { finish[id] = resolve; });
    active--;
    return Response.json(place(id, `장소 ${id}`, id === 2 ? 'restaurant' : 'lodging'));
  });
  const reads = Array.from({ length: 8 }, (_, id) => loadResource('/pongdang/', path(id + 1)));
  const duplicate = loadResource('/pongdang/', path(2));
  await setImmediate();
  assert.deepEqual(started, [1, 2, 3]);
  for (let id = 1; id <= 8; id++) { finish[id](); await setImmediate(); }
  const results = await Promise.all(reads);
  assert.equal(maximum, 3);
  assert.deepEqual(started, [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.deepEqual(await duplicate, results[1]);
  assert.equal(results[1].data.rows[0].type, 'restaurant');
  assert.equal(results[2].data.rows[0].type, 'lodging');
  assert.deepEqual((await loadResource('/pongdang/', path(2))).data, results[1].data);
  assert.equal(started.length, 8);
});

test('thirty-minute expiry and a manual refresh each re-read saved places', async t => {
  invalidateResources();
  t.mock.timers.enable({ apis: ['Date'], now: Date.now() });
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => Response.json(place(21, `이름 ${++calls}`)));
  assert.equal((await loadResource('/pongdang/', path(21))).data.rows[0].name, '이름 1');
  t.mock.timers.tick(RESOURCE_REFRESH_INTERVAL - 1);
  await loadResource('/pongdang/', path(21));
  assert.equal(calls, 1);
  t.mock.timers.tick(1);
  assert.equal((await loadResource('/pongdang/', path(21))).data.rows[0].name, '이름 2');
  invalidateResources();
  assert.equal((await loadResource('/pongdang/', path(21))).data.rows[0].name, '이름 3');
});

test('a pre-refresh request cannot replace the newer shared result', async t => {
  invalidateResources();
  const finish = [];
  t.mock.method(globalThis, 'fetch', () => new Promise(resolve => finish.push(resolve)));
  const old = loadResource('/pongdang/', path(22));
  await setImmediate();
  invalidateResources();
  const current = loadResource('/pongdang/', path(22));
  await setImmediate();
  finish[1](Response.json(place(22, '새 이름')));
  await current;
  finish[0](Response.json(place(22, '이전 이름')));
  await old;
  assert.equal((await loadResource('/pongdang/', path(22))).data.rows[0].name, '새 이름');
  assert.equal(finish.length, 2);
});

test('failed saved-place reads report errors and retry instead of caching empty success', async t => {
  invalidateResources();
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => ++calls === 1
    ? Response.json({ detail: 'unavailable' }, { status: 503 })
    : Response.json(place(23)));
  const failed = await loadResource('/pongdang/', path(23));
  assert.equal(failed.data, undefined);
  assert.equal(typeof failed.error, 'string');
  assert.deepEqual((await loadResource('/pongdang/', path(23))).data, place(23));
  assert.equal(calls, 2);
});
