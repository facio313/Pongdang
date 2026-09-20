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

test('a non-water notification destination gets the specific place classification explanation', async () => {
  await assert.rejects(call(Response.json({ detail: 'WATER_PLACE_REQUIRED' }, { status: 422 })),
    /첫 입수 알림은 분류가 확인된 해변·계곡에서만 저장할 수 있습니다/);
  await assert.rejects(call(Response.json({ detail: 'private detail' }, { status: 422 })),
    error => /요청 조건/.test(error.message) && !/private detail/.test(error.message));
});

test('HTML gateway outages retain the HTTP failure instead of implying an expired login', async () => {
  for (const status of [502, 503, 504]) {
    await assert.rejects(call(new Response('<html>upstream unavailable</html>', {
      status, headers: { 'Content-Type': 'text/html' },
    })), (error) => /요청을 처리하지 못했습니다/.test(error.message) && !/SSO/.test(error.message));
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


test('private requests distinguish grant, origin and cross-site rejection without guessing implementation state', async () => {
  for (const [detail, expected] of [
    ['SSO_GRANT_REQUIRED', /접근 권한이 없습니다/],
    ['ORIGIN_NOT_ALLOWED', /허용 출처\(Origin\)/],
    ['CROSS_SITE_REQUEST_REJECTED', /다른 사이트/],
    ['unknown private secret', /기존 SSO 세션과 접속 주소/],
  ]) {
    await assert.rejects(call(Response.json({ detail }, { status: 403 })), error => {
      assert.match(error.message, expected);
      assert.match(error.message, /공개 자료가 보여도/);
      assert.doesNotMatch(error.message, /미구현|준비되지|secret/);
      return true;
    });
  }
});

test('private writes retain same-origin credentials and let the browser supply Origin', async () => {
  await travelJson('/pongdang/', 'travel/preferences', 'PUT', { tags: [] }, undefined, async (url, init) => {
    assert.equal(url, '/pongdang/api/data/travel/preferences');
    assert.equal(init.credentials, 'same-origin');
    assert.deepEqual(init.headers, { 'Content-Type': 'application/json' });
    return Response.json({});
  });
});
