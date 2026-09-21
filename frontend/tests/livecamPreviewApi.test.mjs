import assert from 'node:assert/strict';
import test from 'node:test';
import { cameraCategories, loadWebcamCatalog, requestWebcamPreview, webcamCategories } from '../src/livecamPreviewApi.ts';
import { previewPlayerUrl } from '../src/livecamApi.ts';

test('explicit POST uses the base path and only the selected spot, no API key', async () => {
  const signal = new AbortController().signal;
  let calls = 0;
  const fetcher = async (url, init) => {
    assert.equal(url, '/pongdang/api/data/livecams/preview');
    assert.equal(init.method, 'POST');
    assert.equal(init.signal, signal);
    assert.equal(init.credentials, 'same-origin');
    assert.equal(init.body, calls++ === 0 ? '{}' : '{"spot_id":7}');
    assert.deepEqual(init.headers, { 'Content-Type': 'application/json' });
    return new Response(JSON.stringify({ contract_version: 'livecams.preview.v1', rows: [] }));
  };
  await requestWebcamPreview('/pongdang/', undefined, signal, fetcher);
  await requestWebcamPreview('/pongdang/', 7, signal, fetcher);
});

test('failures and malformed results never surface upstream payloads', async () => {
  const signal = new AbortController().signal;
  await assert.rejects(requestWebcamPreview('/', undefined, signal, async () => new Response('{"detail":"PRIVATE_SECRET"}', { status: 502 })), error => !error.message.includes('PRIVATE_SECRET'));
  await assert.rejects(requestWebcamPreview('/', undefined, signal, async () => new Response('{"detail":"constructor"}', { status: 502 })), /웹캠 조회에 실패/);
  await assert.rejects(requestWebcamPreview('/', undefined, signal, async () => new Response('{"detail":"WINDY_NOT_CONFIGURED"}', { status: 503 })), /연동 미설정/);
  await assert.rejects(requestWebcamPreview('/', undefined, signal, async () => new Response('{"detail":"WEBCAM_CATALOG_UNAVAILABLE"}', { status: 503 })), /저장된 웹캠 목록을 불러오지 못했습니다/);
  await assert.rejects(requestWebcamPreview('/', undefined, signal, async () => new Response('{}')), /응답 형식/);
});

test('webcam diagnostics retain authentication failures during backoff and local budget reset time', async () => {
  const signal = new AbortController().signal;
  await assert.rejects(requestWebcamPreview('/', undefined, signal, async () => new Response('{"detail":"WINDY_BACKOFF"}', {
    status: 429, headers: { 'X-Webcam-Failure-Code': 'WINDY_HTTP_401', 'Retry-After': '900' },
  })), error => /Webcams API 전용 키/.test(error.message) && /15분/.test(error.message));
  await assert.rejects(requestWebcamPreview('/', undefined, signal, async () => new Response('{"detail":"WINDY_DAILY_BUDGET"}', {
    status: 429, headers: { 'Retry-After': '120' },
  })), error => /퐁당 서버에 설정된/.test(error.message) && /2분/.test(error.message));
  await assert.rejects(requestWebcamPreview('/', undefined, signal, async () => new Response('{"detail":"WINDY_BACKOFF"}', {
    status: 429, headers: { 'X-Webcam-Failure-Code': 'PRIVATE_SECRET', 'Retry-After': 'PRIVATE_SECRET' },
  })), error => !error.message.includes('PRIVATE_SECRET'));
});

test('SSO expiry and network timeouts explain the action without leaking redirected HTML', async () => {
  const signal = new AbortController().signal;
  await assert.rejects(requestWebcamPreview('/', undefined, signal, async () => new Response('PRIVATE_SSO_HTML', { status: 401 })), /다시 로그인/);
  const redirected = new Response('PRIVATE_SSO_HTML', { headers: { 'Content-Type': 'text/html' } });
  Object.defineProperty(redirected, 'redirected', { value: true });
  await assert.rejects(requestWebcamPreview('/', undefined, signal, async () => redirected), error => /다시 로그인/.test(error.message) && !error.message.includes('PRIVATE'));
  await assert.rejects(requestWebcamPreview('/', undefined, signal, async () => { throw new TypeError('PRIVATE_TRANSPORT_ERROR'); }), error => /서버에 연결하지 못했습니다/.test(error.message) && !error.message.includes('PRIVATE'));
  await assert.rejects(requestWebcamPreview('/', undefined, AbortSignal.abort(), async () => { throw new DOMException('PRIVATE', 'AbortError'); }), /요청이 취소/);
});

test('preview accepts stored official players while temporary place metadata still expires', () => {
  const camera = { provider_camera_id: '42', timelapse_period: 'day', timelapse_player: 'https://webcams.windy.com/webcams/public/embed/player/42/day' };
  const now = Date.parse('2026-09-15');
  assert.equal(previewPlayerUrl(camera, null, now), camera.timelapse_player);
  assert.equal(previewPlayerUrl(camera, '2026-09-16', now), camera.timelapse_player);
  for (const expiry of ['2026-09-14', 'unknown']) assert.equal(previewPlayerUrl(camera, expiry, now), null);
  assert.equal(previewPlayerUrl({ ...camera, timelapse_period: 'live', timelapse_player: camera.timelapse_player.replace('/day', '/live') }, '2026-09-16', now), null);
  assert.equal(previewPlayerUrl({ ...camera, timelapse_player: camera.timelapse_player + '?key=secret' }, '2026-09-16', now), null);
});

test('stored catalogs prefer a safe provider live link without claiming playback verification', () => {
  const camera = {
    provider_camera_id: '42',
    live_player: 'https://webcams.windy.com/webcams/public/embed/player/42/live',
    timelapse_period: 'day',
    timelapse_player: 'https://webcams.windy.com/webcams/public/embed/player/42/day',
  };
  assert.equal(previewPlayerUrl(camera, null), camera.live_player);
  for (const live_player of [camera.live_player + '?token=private', camera.live_player.replace('/42/', '/43/'), 'https://evil.test/live']) {
    assert.equal(previewPlayerUrl({ ...camera, live_player }, null), camera.timelapse_player);
  }
  assert.equal(previewPlayerUrl(camera, '2026-01-01', Date.parse('2026-09-15')), null);
});

test('persistent database catalogs survive remounts after the old ten-minute cache duration', async (context) => {
  let calls = 0;
  const result = { contract_version: 'livecams.preview.v1', scope: 'korea_list', rows: [], storage: 'database', fetched_at: '2026-01-01T00:00:00Z', valid_until: null };
  const fetcher = async () => {
    calls++;
    return new Response(JSON.stringify(result));
  };
  const first = await loadWebcamCatalog('/stored-catalog/', 1, '', 42, fetcher);
  const now = Date.now();
  context.mock.method(Date, 'now', () => now + 11 * 60 * 1000);
  assert.equal(await loadWebcamCatalog('/stored-catalog/', 1, '', 42, fetcher), first);
  assert.equal(calls, 1);
  assert.equal(first.valid_until, null);
  assert.equal(first.fetched_at, result.fetched_at);
});

test('temporary catalog compatibility does not reuse expired metadata', async (context) => {
  let calls = 0;
  let now = Date.parse('2026-09-15T00:00:00Z');
  context.mock.method(Date, 'now', () => now);
  const fetcher = async () => {
    calls++;
    return new Response(JSON.stringify({
      contract_version: 'livecams.preview.v1', rows: [], storage: 'temporary',
      valid_until: new Date(now + 600000).toISOString(),
    }));
  };
  const first = await loadWebcamCatalog('/temporary-catalog/', 1, '', 42, fetcher);
  assert.equal(await loadWebcamCatalog('/temporary-catalog/', 1, '', 42, fetcher), first);
  now += 600001;
  assert.notEqual(await loadWebcamCatalog('/temporary-catalog/', 1, '', 42, fetcher), first);
  assert.equal(calls, 2);
});

test('catalog remounts share one request and do not prefetch subsequent pages', async () => {
  let calls = 0;
  let resolve;
  const fetcher = async (url, init) => {
    calls++;
    assert.equal(url, '/pongdang/api/data/livecams/preview');
    assert.deepEqual(JSON.parse(init.body), { page: 2, shuffle_seed: 77, category: 'coast' });
    return new Promise(done => { resolve = done; });
  };
  const first = loadWebcamCatalog('/pongdang/', 2, 'coast', 77, fetcher);
  const second = loadWebcamCatalog('/pongdang/', 2, 'coast', 77, fetcher);
  assert.equal(first, second);
  assert.equal(calls, 1);
  resolve(new Response(JSON.stringify({ contract_version: 'livecams.preview.v1', rows: [] })));
  await Promise.all([first, second]);
  assert.equal(calls, 1);
});

test('different shuffles queue behind an active lookup and preserve their own results', async () => {
  const pending = new Map();
  const bodies = [];
  let startedSecond;
  const secondStarted = new Promise(resolve => { startedSecond = resolve; });
  const fetcher = async (_url, init) => {
    const body = JSON.parse(init.body);
    bodies.push(body);
    if (body.shuffle_seed === 13) startedSecond();
    return new Promise(resolve => pending.set(body.shuffle_seed, resolve));
  };
  const first = loadWebcamCatalog('/random/', 1, '', 12, fetcher);
  const shuffled = loadWebcamCatalog('/random/', 1, '', 13, fetcher);
  assert.notEqual(first, shuffled);
  assert.deepEqual(bodies, [{ page: 1, shuffle_seed: 12 }]);
  pending.get(12)(new Response(JSON.stringify({
    contract_version: 'livecams.preview.v1', rows: [], shuffle_seed: 12,
  })));
  assert.equal((await first).shuffle_seed, 12);
  await secondStarted;
  assert.deepEqual(bodies, [{ page: 1, shuffle_seed: 12 }, { page: 1, shuffle_seed: 13 }]);
  pending.get(13)(new Response(JSON.stringify({
    contract_version: 'livecams.preview.v1', rows: [], shuffle_seed: 13,
  })));
  assert.equal((await shuffled).shuffle_seed, 13);
});

test('a failed catalog lookup does not block the next queued shuffle', async () => {
  let failFirst;
  const first = loadWebcamCatalog('/retry/', 1, '', 1, async () => new Promise(resolve => { failFirst = resolve; }));
  const failed = assert.rejects(first, /조회에 실패/);
  const second = loadWebcamCatalog('/retry/', 1, '', 2, async () => new Response(JSON.stringify({
    contract_version: 'livecams.preview.v1', rows: [], shuffle_seed: 2,
  })));
  failFirst(new Response('{}', { status: 503 }));
  await failed;
  assert.equal((await second).shuffle_seed, 2);
});

test('provider categories are readable without inventing missing classifications', () => {
  assert.deepEqual(Object.keys(webcamCategories), ['beach', 'coast', 'port', 'lake', 'river']);
  assert.equal(cameraCategories(['coast', 'port']), '해안 · 항구');
  assert.equal(cameraCategories(['river']), '하천');
  assert.equal(cameraCategories([]), '미분류');
  assert.equal(cameraCategories(['provider-new-kind']), 'provider-new-kind');
});
