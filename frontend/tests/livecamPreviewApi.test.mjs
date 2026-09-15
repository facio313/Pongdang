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
  await assert.rejects(requestWebcamPreview('/', undefined, signal, async () => new Response('{"detail":"WINDY_NOT_CONFIGURED"}', { status: 503 })), /연동 미설정/);
  await assert.rejects(requestWebcamPreview('/', undefined, signal, async () => new Response('{}')), /응답 형식/);
});

test('preview allows only unexpired official timelapse embeds', () => {
  const camera = { provider_camera_id: '42', timelapse_period: 'day', timelapse_player: 'https://webcams.windy.com/webcams/public/embed/player/42/day' };
  const now = Date.parse('2026-09-15');
  assert.equal(previewPlayerUrl(camera, '2026-09-16', now), camera.timelapse_player);
  for (const expiry of ['2026-09-14', 'unknown']) assert.equal(previewPlayerUrl(camera, expiry, now), null);
  assert.equal(previewPlayerUrl({ ...camera, timelapse_period: 'live', timelapse_player: camera.timelapse_player.replace('/day', '/live') }, '2026-09-16', now), null);
  assert.equal(previewPlayerUrl({ ...camera, timelapse_player: camera.timelapse_player + '?key=secret' }, '2026-09-16', now), null);
});

test('catalog remounts share one request and do not prefetch subsequent pages', async () => {
  let calls = 0;
  let resolve;
  const fetcher = async (url, init) => {
    calls++;
    assert.equal(url, '/pongdang/api/data/livecams/preview');
    assert.deepEqual(JSON.parse(init.body), { page: 2, category: 'coast' });
    return new Promise(done => { resolve = done; });
  };
  const first = loadWebcamCatalog('/pongdang/', 2, 'coast', fetcher);
  const second = loadWebcamCatalog('/pongdang/', 2, 'coast', fetcher);
  assert.equal(first, second);
  assert.equal(calls, 1);
  resolve(new Response(JSON.stringify({ contract_version: 'livecams.preview.v1', rows: [] })));
  await Promise.all([first, second]);
  assert.equal(calls, 1);
});

test('provider categories are readable without inventing missing classifications', () => {
  assert.deepEqual(Object.keys(webcamCategories), ['beach', 'coast', 'port', 'lake', 'river']);
  assert.equal(cameraCategories(['coast', 'port']), '해안 · 항구');
  assert.equal(cameraCategories(['river']), '하천');
  assert.equal(cameraCategories([]), '미분류');
  assert.equal(cameraCategories(['provider-new-kind']), 'provider-new-kind');
});
