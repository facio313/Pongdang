import assert from 'node:assert/strict';
import test from 'node:test';

let moduleNumber = 0;

async function fixture(t) {
  const scripts = [];
  const document = {
    head: { appendChild(script) { scripts.push(script); } },
    createElement(tag) {
      assert.equal(tag, 'script');
      return { onload: null, onerror: null, removed: false, remove() { this.removed = true; } };
    },
  };
  const window = {};
  Object.defineProperty(globalThis, 'window', { value: window, configurable: true });
  Object.defineProperty(globalThis, 'document', { value: document, configurable: true });
  t.after(() => { delete globalThis.window; delete globalThis.document; });
  const module = await import(`../src/kakaoMaps.ts?test=${moduleNumber++}`);
  const ready = () => {
    const maps = {
      Map() {}, LatLng() {}, LatLngBounds() {}, CustomOverlay() {}, ZoomControl() {},
      ControlPosition: { RIGHT: 3 },
      event: { addListener() {}, removeListener() {}, preventMap() {} },
    };
    window.kakao = { maps: { load(callback) { window.kakao.maps = maps; callback(); } } };
    scripts.at(-1).onload();
    return maps;
  };
  const started = async () => { await Promise.resolve(); };
  return { ...module, scripts, window, document, ready, started };
}

test('missing keys and an aborted consumer never inject the SDK', async (t) => {
  const f = await fixture(t);
  await assert.rejects(f.loadKakaoMaps('  '), { code: 'MISSING_KEY' });
  await assert.rejects(f.loadKakaoMaps('public-js-key', AbortSignal.abort()), { name: 'AbortError' });
  assert.equal(f.scripts.length, 0);
});

test('concurrent mounts share one HTTPS SDK request and wait for maps.load', async (t) => {
  const f = await fixture(t);
  const first = f.loadKakaoMaps('public-js-key');
  assert.equal(f.loadKakaoMaps('public-js-key'), first);
  await f.started();
  assert.equal(f.scripts.length, 1);
  const url = new URL(f.scripts[0].src);
  assert.equal(url.origin, 'https://dapi.kakao.com');
  assert.equal(url.pathname, '/v2/maps/sdk.js');
  assert.equal(url.searchParams.get('appkey'), 'public-js-key');
  assert.equal(url.searchParams.get('autoload'), 'false');
  const maps = f.ready();
  assert.equal(await first, maps);
  assert.equal(await f.loadKakaoMaps('public-js-key'), maps);
  assert.equal(f.scripts.length, 1);
});

test('unmounting one consumer leaves the shared load available to another', async (t) => {
  const f = await fixture(t);
  const controller = new AbortController();
  const aborted = f.loadKakaoMaps('public-js-key', controller.signal);
  const survivor = f.loadKakaoMaps('public-js-key');
  controller.abort();
  await assert.rejects(aborted, { name: 'AbortError' });
  const maps = f.ready();
  assert.equal(await survivor, maps);
  assert.equal(f.scripts[0].removed, false);
});

test('network failure removes the failed script and allows an explicit retry', async (t) => {
  const f = await fixture(t);
  const failed = f.loadKakaoMaps('public-js-key');
  await f.started();
  f.scripts[0].onerror(new Error('request contains public-js-key'));
  await assert.rejects(failed, (error) => error.code === 'LOAD_FAILED' && !error.message.includes('public-js-key'));
  assert.equal(f.scripts[0].removed, true);
  const retry = f.loadKakaoMaps('public-js-key');
  await f.started();
  assert.equal(f.scripts.length, 2);
  const maps = f.ready();
  assert.equal(await retry, maps);
});

test('a script response without Kakao Maps and SDK bootstrap exceptions stay sanitized', async (t) => {
  const f = await fixture(t);
  const missing = f.loadKakaoMaps('public-js-key');
  await f.started();
  f.scripts[0].onload();
  await assert.rejects(missing, { code: 'LOAD_FAILED' });
  const broken = f.loadKakaoMaps('public-js-key');
  await f.started();
  f.window.kakao = { maps: { load() { throw new Error('request contains public-js-key'); } } };
  f.scripts[1].onload();
  await assert.rejects(broken, (error) => error.code === 'LOAD_FAILED' && !error.message.includes('public-js-key'));
});

test('a stalled SDK callback times out and a late callback cannot replace a retry', async (t) => {
  const f = await fixture(t);
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const timedOut = f.loadKakaoMaps('public-js-key');
  await f.started();
  let lateCallback;
  f.window.kakao = { maps: { load(callback) { lateCallback = callback; } } };
  f.scripts[0].onload();
  t.mock.timers.tick(15_000);
  await assert.rejects(timedOut, { code: 'LOAD_TIMEOUT' });
  assert.equal(f.scripts[0].removed, true);
  const retry = f.loadKakaoMaps('public-js-key');
  await f.started();
  lateCallback();
  const maps = f.ready();
  assert.equal(await retry, maps);
});

test('changing a key after SDK loading begins requires reload and never echoes it', async (t) => {
  const f = await fixture(t);
  const first = f.loadKakaoMaps('public-js-key');
  await f.started();
  await assert.rejects(f.loadKakaoMaps('other-js-key'), (error) => error.code === 'KEY_CHANGED' && !error.message.includes('other-js-key'));
  f.ready();
  await first;
  assert.equal(f.scripts.length, 1);
});
