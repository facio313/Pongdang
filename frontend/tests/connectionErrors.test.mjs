import assert from 'node:assert/strict';
import test from 'node:test';
import { routeReasonsText, travelJson } from '../src/travelApi.ts';

const call = (response) => travelJson('/pongdang/', 'travel/plans', 'POST', {}, undefined, async () => response);

test('an ingress login redirect cannot become a successful API result', async () => {
  await assert.rejects(call(new Response('<html>sign in</html>', {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })), /SSO 로그인/);
  await assert.rejects(call({ redirected: true, headers: new Headers() }), /SSO 로그인/);
});

test('known setup and storage failures retain an actionable diagnosis', async () => {
  for (const [detail, message] of [
    ['AUTH_NOT_CONFIGURED', /로그인 연동/],
    ['SSO_ORIGINS_NOT_CONFIGURED', /요청 출처/],
    ['TRAVEL_STORAGE_UNAVAILABLE', /저장소/],
    ['route_calculation_timeout', /길찾기 응답/],
  ]) {
    await assert.rejects(call(new Response(JSON.stringify({ detail }), { status: 503 })), message);
  }
});

test('HTML gateway outages retain the HTTP failure instead of implying an expired login', async () => {
  for (const status of [502, 503, 504]) {
    await assert.rejects(call(new Response('<html>upstream unavailable</html>', {
      status, headers: { 'Content-Type': 'text/html' },
    })), (error) => /서버에 연결하지 못했거나/.test(error.message) && !/SSO/.test(error.message));
  }
});

test('unknown server details and prototype property names are never echoed', async () => {
  for (const detail of ['private token secret', 'constructor', { internal: 'secret' }]) {
    await assert.rejects(call(new Response(JSON.stringify({ detail }), { status: 503 })),
      (error) => !/secret|constructor/.test(error.message));
  }
  assert.deepEqual(await call(new Response(JSON.stringify({ plan_id: 'actual' }))), { plan_id: 'actual' });
});

test('route setup, authentication and unsupported transport have distinct explanations', () => {
  assert.match(routeReasonsText(['route_provider_unconfigured']), /REST 키 설정/);
  assert.match(routeReasonsText(['route_provider_authentication_failed']), /인증에 실패/);
  assert.match(routeReasonsText(['route_transport_not_configured']), /자동차/);
  assert.doesNotMatch(routeReasonsText(['secret upstream url', 'constructor']), /secret|constructor/);
});
