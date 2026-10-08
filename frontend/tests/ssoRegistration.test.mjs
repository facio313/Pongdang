import assert from 'node:assert/strict';
import test from 'node:test';
import { registerSso } from '../src/ssoRegistration.ts';
import { SsoLoginError } from '../src/ssoLogin.ts';

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const input = { username: ' New-user ', displayName: ' Test name ', email: ' TEST@example.invalid ', password: 'Offline-password123!' };
const available = () => json({ authenticated: false, registration_available: true }, 401);

test('registration verifies capability and submits once on the same origin without claiming login', async () => {
  const calls = [];
  await registerSso('/pongdang/', input, new AbortController().signal, async (url, options) => {
    calls.push({ url, options });
    return calls.length === 1 ? available() : json({ registered: true, authenticated: false }, 201);
  });
  assert.deepEqual(calls.map(call => call.url), ['/pongdang/api/auth/state', '/pongdang/api/auth/register']);
  assert.deepEqual(JSON.parse(calls[1].options.body), { username: 'new-user', displayName: 'Test name', email: 'test@example.invalid', password: input.password });
  for (const { options } of calls) {
    assert.equal(options.credentials, 'same-origin');
    assert.equal(options.redirect, 'error');
    assert.equal(options.cache, 'no-store');
  }
});

for (const [name, response] of [
  ['old bridge', () => json({ authenticated: false }, 401)],
  ['disabled registration', () => json({ authenticated: false, registration_available: false }, 401)],
  ['HTML fallback', () => new Response('<html>App</html>', { headers: { 'Content-Type': 'text/html' } })],
]) test(`${name} cannot receive a registration password`, async () => {
  let calls = 0;
  await assert.rejects(registerSso('/', input, new AbortController().signal, async () => { calls++; return response(); }), SsoLoginError);
  assert.equal(calls, 1);
});

for (const [status, detail, expected] of [
  [409, 'SSO_REGISTRATION_CONFLICT', '이미 사용 중인 아이디 또는 이메일'],
  [400, 'INVALID_REGISTRATION_REQUEST', '입력한 회원가입 정보'],
  [429, 'SSO_REGISTRATION_RATE_LIMITED', '회원가입 시도가 너무 많습니다'],
  [503, 'PRIVATE_DIAGNOSTIC', '회원가입 서비스에 연결하지 못했습니다'],
]) test(`registration reports ${status} without exposing server details`, async () => {
  let calls = 0;
  await assert.rejects(registerSso('/', input, new AbortController().signal, async () => ++calls === 1 ? available() : json({ detail }, status)), error => {
    assert.ok(error instanceof SsoLoginError);
    assert.ok(error.message.includes(expected));
    assert.ok(!error.message.includes(detail));
    return true;
  });
});

for (const response of [
  () => json({ registered: true }, 200),
  () => json({ authenticated: true }, 201),
  () => json({ registered: false }, 201),
  () => new Response('<html>App</html>', { status: 201, headers: { 'Content-Type': 'text/html' } }),
]) test('only an explicit 201 registered response completes signup', async () => {
  let calls = 0;
  await assert.rejects(registerSso('/', input, new AbortController().signal, async () => ++calls === 1 ? available() : response()), SsoLoginError);
});
