import assert from 'node:assert/strict';
import test from 'node:test';
import { once } from 'node:events';
import { authorizePongdang, completeInlineLogin, createDomainServer } from './pongdang-domain-auth.mjs';

const origin = 'https://pongdang.site';
const sso = 'https://bonifacio.work/sso';
const gate = 'http://pongdang-oauth2:4180';
const edgeSecret = 'offline-test-edge-secret-not-used-in-production';
const headers = { 'X-Portfolio-Edge-Secret': edgeSecret, 'X-Original-Host': 'pongdang.site', Origin: origin, 'X-Real-IP': '127.0.0.1', 'Content-Type': 'application/json' };
const account = { email: 'fixture@example.invalid', groups: ['portfolio-v2', 'access-pongdang'], disabled: false };
const deps = () => ({
  edgeSecret, normalizeUsername: value => value.toLowerCase(), refreshApplications() {},
  store: { read: async () => ({ users: { fixture: account } }) },
  fetchAuth: async (_url, options) => options.headers.Cookie.includes('valid-oauth')
    ? new Response(null, { status: 202, headers: { 'X-Auth-Request-Preferred-Username': 'fixture', 'X-Auth-Request-Email': account.email, 'X-Auth-Request-Groups': account.groups.join(',') } })
    : new Response(null, { status: 401 }),
});

function protocol(change = {}) {
  const calls = [];
  const authorization = new URL(`${sso}/api/oidc/authorization`);
  authorization.search = new URLSearchParams({ client_id: 'pongdang-site', redirect_uri: `${origin}/oauth2/callback`, response_type: 'code', code_challenge_method: 'S256', code_challenge: 'offline-challenge', state: 'offline-state', nonce: 'offline-nonce' }).toString();
  const sessionCookie = '__Host-pongdang_session=valid-oauth; Path=/; Secure; HttpOnly; SameSite=Lax';
  const fetchUpstream = async (url, options) => {
    calls.push({ url, options });
    assert.equal(options.redirect, 'manual');
    assert.ok(options.signal);
    if (calls.length === 1) return new Response(null, { status: 302, headers: { Location: change.authorization ?? authorization.href, 'Set-Cookie': '__Host-pongdang_session_nonce_csrf=offline-csrf; Path=/; Secure; HttpOnly' } });
    if (calls.length === 2) {
      assert.equal(url, `${sso}/api/firstfactor`);
      assert.equal(options.headers.Cookie, '');
      assert.deepEqual(JSON.parse(options.body), { username: 'fixture', password: 'offline-password', keepMeLoggedIn: false });
      return new Response(JSON.stringify({ status: change.loginResult ?? 'OK' }), { status: change.loginStatus ?? 200, headers: { 'Content-Type': 'application/json', 'Set-Cookie': 'central_session=central-only; Path=/sso; Secure; HttpOnly' } });
    }
    if (calls.length === 3) {
      assert.equal(url, authorization.href);
      assert.equal(options.headers.Cookie, 'central_session=central-only');
      assert.ok(!('body' in options));
      return new Response(null, { status: 302, headers: { Location: change.callback ?? `${origin}/oauth2/callback?code=offline-code&state=offline-state` } });
    }
    assert.equal(url, `${gate}/oauth2/callback?code=offline-code&state=offline-state`);
    assert.equal(options.headers.Cookie, '__Host-pongdang_session_nonce_csrf=offline-csrf');
    return new Response(null, { status: 302, headers: { Location: `${origin}/pongdang/auth/continue`, 'Set-Cookie': change.cookie ?? sessionCookie } });
  };
  return { fetchUpstream, calls, sessionCookie };
}

test('inline exchange keeps PKCE/state, separates cookies and checks the existing gate before issuing a session', async () => {
  const p = protocol();
  const credentials = { username: 'fixture', password: 'offline-password' };
  let checks = 0;
  const cookies = await completeInlineLogin(credentials, { fetchUpstream: p.fetchUpstream, signal: AbortSignal.timeout(1000), authorize: async cookie => {
    checks++; assert.ok(cookie.includes('valid-oauth')); assert.ok(!cookie.includes('central-only')); return 200;
  } });
  assert.deepEqual(cookies, [p.sessionCookie]);
  assert.equal(credentials.password, '');
  assert.equal(checks, 1);
  assert.equal(p.calls.length, 4);
});

for (const [name, change, expected, count] of [
  ['invalid credentials', { loginStatus: 401 }, 401, 2],
  ['central rate limit', { loginStatus: 429 }, 429, 2],
  ['central failure', { loginStatus: 503 }, 503, 2],
  ['unexpected SSO response', { loginResult: 'KO' }, 503, 2],
  ['unexpected authorization origin', { authorization: 'https://outside.invalid/authorize' }, 503, 1],
  ['state mismatch', { callback: `${origin}/oauth2/callback?code=offline-code&state=wrong` }, 503, 3],
  ['external callback', { callback: 'https://outside.invalid/callback' }, 503, 3],
  ['consent/second factor', { callback: `${sso}/?flow=oidc` }, 409, 3],
  ['access denied by OIDC', { callback: `${origin}/oauth2/callback?error=access_denied` }, 403, 3],
  ['insecure cookie', { cookie: '__Host-pongdang_session=valid-oauth; Path=/; HttpOnly' }, 503, 4],
  ['central domain cookie', { cookie: '__Host-pongdang_session=valid-oauth; Domain=bonifacio.work; Path=/; Secure; HttpOnly' }, 503, 4],
  ['no HttpOnly cookie', { cookie: '__Host-pongdang_session=valid-oauth; Path=/; Secure' }, 503, 4],
]) test(`inline exchange rejects ${name} without exposing a session`, async () => {
  const p = protocol(change);
  const credentials = { username: 'fixture', password: 'offline-password' };
  await assert.rejects(completeInlineLogin(credentials, { fetchUpstream: p.fetchUpstream, signal: AbortSignal.timeout(1000), authorize: () => { assert.fail('must not reach authorization'); } }), error => error.status === expected);
  assert.equal(credentials.password, '');
  assert.equal(p.calls.length, count);
});

test('a signed OAuth session without current Pongdang permission is never returned', async () => {
  const p = protocol();
  await assert.rejects(completeInlineLogin({ username: 'fixture', password: 'offline-password' }, { fetchUpstream: p.fetchUpstream, signal: AbortSignal.timeout(1000), authorize: async () => 403 }), error => error.status === 403);
});

async function withServer(run, changes = {}) {
  const p = protocol();
  const server = createDomainServer({ ...deps(), fetchUpstream: p.fetchUpstream, ...changes });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try { await run(`http://127.0.0.1:${server.address().port}`, p); }
  finally { server.closeAllConnections(); server.close(); await once(server, 'close'); }
}

test('real HTTP handler uses JSON 401 for anonymous state and returns only verified host cookies on login', async () => withServer(async (url) => {
  const state = await fetch(`${url}/inline/state`, { headers });
  assert.equal(state.status, 401);
  assert.equal(state.headers.get('location'), null);
  assert.deepEqual(await state.json(), { authenticated: false, detail: 'SSO_AUTHENTICATION_REQUIRED' });
  const response = await fetch(`${url}/inline/login`, { method: 'POST', headers, body: JSON.stringify({ username: 'fixture', password: 'offline-password' }) });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { authenticated: true });
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.ok(response.headers.getSetCookie().every(cookie => cookie.startsWith('__Host-pongdang_session=')));
  const signedIn = await fetch(`${url}/inline/state`, { headers: { ...headers, Cookie: '__Host-pongdang_session=valid-oauth' } });
  assert.equal(signedIn.status, 200);
}));

for (const [name, update, status] of [
  ['missing edge secret', { 'X-Portfolio-Edge-Secret': '' }, 401],
  ['wrong host', { 'X-Original-Host': 'outside.invalid' }, 401],
  ['cross-origin POST', { Origin: 'https://outside.invalid' }, 403],
  ['missing Origin', { Origin: '' }, 403],
  ['cross-site request', { 'Sec-Fetch-Site': 'cross-site' }, 403],
  ['form POST', { 'Content-Type': 'application/x-www-form-urlencoded' }, 415],
  ['untrusted address', { 'X-Real-IP': '' }, 403],
]) test(`HTTP handler refuses ${name} before contacting SSO`, async () => withServer(async (url, p) => {
  const response = await fetch(`${url}/inline/login`, { method: 'POST', headers: { ...headers, ...update }, body: JSON.stringify({ username: 'fixture', password: 'offline-password' }) });
  assert.equal(response.status, status);
  assert.equal(response.headers.get('set-cookie'), null);
  assert.equal(p.calls.length, 0);
}));

test('arbitrary upstream URLs, oversized bodies and repeated attempts fail closed', async () => withServer(async (url, p) => {
  for (const body of [JSON.stringify({ username: 'fixture', password: 'x', targetURL: 'https://outside.invalid' }), 'bad json', '{}', '{}', '{}', '{}']) {
    const response = await fetch(`${url}/inline/login`, { method: 'POST', headers, body });
    assert.ok([400, 429].includes(response.status));
    await response.body.cancel();
  }
  assert.equal(p.calls.length, 0);
  const blocked = await fetch(`${url}/inline/login`, { method: 'POST', headers, body: '{}' });
  assert.equal(blocked.status, 429);
  assert.equal(blocked.headers.get('retry-after'), '60');
  const large = await fetch(`${url}/inline/login`, { method: 'POST', headers: { ...headers, 'X-Real-IP': '127.0.0.2' }, body: 'x'.repeat(9000) });
  assert.equal(large.status, 413);
}));

test('existing authz still rejects stale claims, disabled accounts and revoked grants', async () => {
  for (const record of [{ ...account, disabled: true }, { ...account, groups: ['portfolio-v2'] }, { ...account, email: 'changed@example.invalid' }]) {
    let status;
    const dependencies = { ...deps(), store: { read: async () => ({ users: { fixture: record } }) } };
    await authorizePongdang({ headers: { 'x-portfolio-edge-secret': edgeSecret, 'x-original-host': 'pongdang.site', cookie: 'valid-oauth' } }, { writeHead(value) { status = value; return this; }, end() {} }, dependencies);
    assert.equal(status, 403);
  }
});

test('logout expires only Pongdang host session cookies including every supplied chunk', async () => withServer(async (url, p) => {
  const response = await fetch(`${url}/inline/logout`, { method: 'POST', headers: { ...headers,
    Cookie: '__Host-pongdang_session=valid-oauth; __Host-pongdang_session_0=chunk; __Host-pongdang_session_1=chunk; central_session=unrelated; other_app=unrelated; __Host-pongdang_session_extra=unrelated',
  }, body: '{}' });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { authenticated: false });
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const cookies = response.headers.getSetCookie();
  assert.deepEqual(cookies.map(cookie => cookie.split('=', 1)[0]), ['__Host-pongdang_session', '__Host-pongdang_session_0', '__Host-pongdang_session_1']);
  assert.ok(cookies.every(cookie => cookie.endsWith('=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Secure; HttpOnly; SameSite=Lax')));
  assert.equal(p.calls.length, 0);
  const repeated = await fetch(`${url}/inline/logout`, { method: 'POST', headers, body: '{}' });
  assert.equal(repeated.status, 200);
  assert.deepEqual(await repeated.json(), { authenticated: false });
}));

for (const [name, update, status] of [
  ['missing edge secret', { 'X-Portfolio-Edge-Secret': '' }, 401],
  ['wrong host', { 'X-Original-Host': 'outside.invalid' }, 401],
  ['cross-origin POST', { Origin: 'https://outside.invalid' }, 403],
  ['missing Origin', { Origin: '' }, 403],
  ['cross-site request', { 'Sec-Fetch-Site': 'cross-site' }, 403],
  ['form POST', { 'Content-Type': 'application/x-www-form-urlencoded' }, 415],
]) test(`logout refuses ${name} without changing cookies`, async () => withServer(async (url) => {
  const response = await fetch(`${url}/inline/logout`, { method: 'POST', headers: { ...headers, ...update }, body: '{}' });
  assert.equal(response.status, status);
  assert.equal(response.headers.get('set-cookie'), null);
}));

test('logout is never triggered by a GET navigation', async () => withServer(async (url) => {
  const response = await fetch(`${url}/inline/logout`, { headers });
  assert.equal(response.status, 405);
  assert.equal(response.headers.get('set-cookie'), null);
}));
