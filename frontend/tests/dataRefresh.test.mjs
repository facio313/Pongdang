import assert from 'node:assert/strict';
import test from 'node:test';
import { readDataRefresh, refreshFinished, requestDataRefresh } from '../src/dataRefreshApi.ts';
import { invalidateResources, resourceRefreshGeneration, subscribeResourceRefresh, RESOURCE_REFRESH_INTERVAL } from '../src/resourceRefresh.ts';

const job = {
  request_id: 'refresh-123', status: 'queued', requested_at: '2026-09-21T03:00:00Z',
  finished_at: null, failed_jobs: [],
};

test('manual refresh submits an empty same-origin request and polls its own job', async () => {
  const calls = [];
  const fetcher = async (url, options) => {
    calls.push({ url, options });
    return Response.json(job, { status: options.method === 'POST' ? 202 : 200 });
  };
  assert.deepEqual(await requestDataRefresh('/pongdang/', fetcher), job);
  assert.equal(calls[0].url, '/pongdang/api/data/refresh');
  assert.equal(calls[0].options.method, 'POST');
  assert.equal(calls[0].options.body, '{}');
  assert.equal(calls[0].options.credentials, 'same-origin');
  assert.deepEqual(calls[0].options.headers, { 'Content-Type': 'application/json' });
  await readDataRefresh('/pongdang/', 'refresh/123', fetcher);
  assert.equal(calls[1].url, '/pongdang/api/data/refresh/refresh%2F123');
  assert.equal(calls[1].options.method, 'GET');
  assert.equal(calls[1].options.body, undefined);
});

test('accepting a request is not completion and partial results retain their status', async () => {
  for (const status of ['queued', 'running']) assert.equal(refreshFinished({ ...job, status }), false);
  for (const status of ['succeeded', 'partial', 'failed']) assert.equal(refreshFinished({ ...job, status }), true);
  const partial = { ...job, status: 'partial', finished_at: '2026-09-21T03:01:00Z', failed_jobs: ['weather'] };
  assert.deepEqual(await readDataRefresh('/pongdang/', job.request_id, async () => Response.json(partial)), partial);
});

test('authentication and invalid status responses never claim a completed refresh', async () => {
  await assert.rejects(requestDataRefresh('/pongdang/', async () => Response.json({ detail: 'unknown' }, { status: 401 })), /SSO/);
  await assert.rejects(requestDataRefresh('/pongdang/', async () => new Response('<html>login</html>', { headers: { 'content-type': 'text/html' } })), /SSO/);
  for (const response of [{}, { ...job, status: 'accepted' }, { ...job, failed_jobs: null }, { ...job, requested_at: 'invalid' }]) {
    await assert.rejects(requestDataRefresh('/pongdang/', async () => Response.json(response)), /응답 형식/);
  }
});

test('common reads use thirty minutes and one invalidation notifies all active consumers', () => {
  assert.equal(RESOURCE_REFRESH_INTERVAL, 1800000);
  const before = resourceRefreshGeneration();
  const seen = [];
  const unsubscribeA = subscribeResourceRefresh(() => seen.push(['a', resourceRefreshGeneration()]));
  const unsubscribeB = subscribeResourceRefresh(() => seen.push(['b', resourceRefreshGeneration()]));
  invalidateResources();
  assert.deepEqual(seen, [['a', before + 1], ['b', before + 1]]);
  unsubscribeA();
  unsubscribeB();
  invalidateResources();
  assert.equal(seen.length, 2);
});
