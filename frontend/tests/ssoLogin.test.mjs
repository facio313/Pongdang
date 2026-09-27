import assert from 'node:assert/strict';
import test from 'node:test';
import { signInSso } from '../src/ssoLogin.ts';

const callback = 'https://bonifacio.work/pongdang/auth/continue';
const state = () => Response.json({ status: 'OK', data: { authentication_level: 0 } });
const signIn = fetcher => signInSso(' test-user ', 'test-only-password', callback, new AbortController().signal, fetcher);

test('sign-in uses the existing same-origin SSO session and only the requested callback completes login', async () => {
  const calls = [];
  assert.equal(await signIn(async (url, options) => {
    calls.push({ url, options });
    return url.endsWith('/state') ? state() : Response.json({ status: 'OK', data: { redirect: callback } });
  }), 'authenticated');
  assert.deepEqual(calls.map(call => call.url), ['/sso/api/state', '/sso/api/firstfactor']);
  for (const { options } of calls) {
    assert.equal(options.credentials, 'same-origin');
    assert.equal(options.redirect, 'error');
    assert.equal(options.cache, 'no-store');
    assert.ok(options.signal instanceof AbortSignal);
  }
  assert.equal(calls[0].options.body, undefined);
  assert.equal(calls[1].options.method, 'POST');
  assert.deepEqual(JSON.parse(calls[1].options.body), {
    username: 'test-user', password: 'test-only-password', targetURL: callback,
    requestMethod: 'GET', keepMeLoggedIn: false,
  });
});

test('an unconfigured origin or HTML fallback cannot receive the password', async () => {
  for (const response of [
    new Response('<html>Vite fallback</html>', { headers: { 'Content-Type': 'text/html' } }),
    Response.json({ status: 'OK' }),
    Response.json({ status: 'KO', message: 'private details' }),
    Response.json({ status: 'OK' }, { status: 503 }),
  ]) {
    let count = 0;
    await assert.rejects(signIn(async () => { count++; return response; }), /로그인 서비스에 연결하지 못했습니다/);
    assert.equal(count, 1);
  }
});

test('an unfinished second factor or an unexpected redirect never counts as a completed login', async () => {
  for (const data of [undefined, {}, { redirect: 'https://bonifacio.work/sso/' }, { redirect: 'https://unexpected.invalid/' }]) {
    assert.equal(await signIn(async url => url.endsWith('/state') ? state() : Response.json({ status: 'OK', data })), 'continue');
  }
});

test('invalid credentials, rate limiting and service outages remain failures without echoing server details', async () => {
  for (const [status, message] of [[401, /아이디 또는 비밀번호/], [403, /아이디 또는 비밀번호/], [429, /시도가 너무 많습니다/], [503, /로그인 서비스/]]) {
    await assert.rejects(signIn(async url => url.endsWith('/state') ? state() : Response.json({ message: 'private upstream details' }, { status })), error => {
      assert.match(error.message, message);
      assert.doesNotMatch(error.message, /private/);
      return true;
    });
  }
  await assert.rejects(signIn(async url => url.endsWith('/state') ? state() : Response.json({ status: 'KO' })), /로그인 서비스/);
});

test('closing the form or a network error cannot become a successful sign-in', async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(signInSso('user', 'test-only-password', callback, controller.signal, async (_url, options) => {
    options.signal.throwIfAborted();
  }), { name: 'AbortError' });
  await assert.rejects(signIn(async () => { throw new TypeError('Network failure'); }), { name: 'TypeError' });
});
