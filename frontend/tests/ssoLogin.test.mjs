import assert from 'node:assert/strict';
import test from 'node:test';
import { beginSsoLogin, readSsoLoginState, resumeSsoLogin, signInSso, signOutSso, SsoLoginError } from '../src/ssoLogin.ts';

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

test('logout posts once and verifies the fresh anonymous browser session', async () => {
  const calls = [];
  await signOutSso('/pongdang/', new AbortController().signal, async (url, options) => {
    calls.push({ url, options });
    return json({ authenticated: false }, calls.length === 1 ? 200 : 401);
  });
  assert.deepEqual(calls.map(c => c.url), ['/pongdang/api/auth/logout', '/pongdang/api/auth/state']);
  assert.equal(calls[0].options.method, 'POST');
  assert.equal(calls[0].options.body, '{}');
  for (const call of calls) {
    assert.equal(call.options.credentials, 'same-origin');
    assert.equal(call.options.redirect, 'error');
    assert.equal(call.options.cache, 'no-store');
  }
});

for (const stage of ['logout', 'state']) {
  for (const outcome of ['still authenticated', 'HTML fallback', 'missing state', 'forbidden', 'server error']) {
    test(`${stage} ${outcome} cannot claim logout success`, async () => {
      let calls = 0;
      const invalid = () => outcome === 'HTML fallback'
        ? new Response('<html>App</html>', { headers: { 'Content-Type': 'text/html' } })
        : json(outcome === 'missing state' ? {} : { authenticated: outcome === 'still authenticated' },
          outcome === 'forbidden' ? 403 : outcome === 'server error' ? 503 : 200);
      await assert.rejects(signOutSso('/pongdang/', new AbortController().signal, async () => {
        calls++;
        return calls === (stage === 'logout' ? 1 : 2) ? invalid() : json({ authenticated: false });
      }), { message: '로그아웃하지 못했습니다. 잠시 후 다시 시도해 주세요.' });
      assert.equal(calls, stage === 'logout' ? 1 : 2);
    });
  }
}

test('inline login checks the same-origin bridge, posts credentials once and verifies the browser session', async () => {
  const calls = [];
  const fetcher = async (url, options) => {
    calls.push({ url, options });
    return calls.length === 1 ? json({ authenticated: false }, 401) : json({ authenticated: true });
  };
  await signInSso('/pongdang/', ' fixture ', 'offline-password', new AbortController().signal, fetcher);
  assert.deepEqual(calls.map(c => c.url), ['/pongdang/api/auth/state', '/pongdang/api/auth/login', '/pongdang/api/auth/state']);
  assert.deepEqual(JSON.parse(calls[1].options.body), { username: 'fixture', password: 'offline-password' });
  for (const call of calls) {
    assert.equal(call.options.credentials, 'same-origin');
    assert.equal(call.options.redirect, 'error');
    assert.equal(call.options.cache, 'no-store');
  }
});

test('HTML fallback cannot receive credentials', async () => {
  let calls = 0;
  await assert.rejects(signInSso('/', 'fixture', 'offline-password', new AbortController().signal, async () => {
    calls++; return new Response('<html>App</html>', { headers: { 'Content-Type': 'text/html' } });
  }), SsoLoginError);
  assert.equal(calls, 1);
});

test('the login state identifies a local test provider without treating a 401 body as authentication', async () => {
  const state = await readSsoLoginState('/pongdang/', new AbortController().signal, async () =>
    json({ authenticated: true, environment: 'local_test' }, 401));
  assert.deepEqual(state, { authenticated: false, localTest: true });
});

test('invalid local credentials report the test account instead of the production SSO account', async () => {
  let calls = 0;
  await assert.rejects(signInSso('/pongdang/', 'fixture', 'offline-password', new AbortController().signal, async () => {
    calls++;
    return json({ authenticated: false, environment: 'local_test' }, 401);
  }), { message: '로컬 테스트 계정의 아이디 또는 비밀번호를 확인해 주세요.' });
  assert.equal(calls, 2);
});

for (const status of [401, 403, 429, 503]) test(`inline login reports ${status} without claiming a session`, async () => {
  let calls = 0;
  await assert.rejects(signInSso('/', 'fixture', 'offline-password', new AbortController().signal, async () => {
    calls++; return json({ authenticated: false }, calls === 1 ? 401 : status);
  }), SsoLoginError);
  assert.equal(calls, 2);
});

test('first-factor/login success is insufficient when the browser cookie is not accepted', async () => {
  let calls = 0;
  await assert.rejects(signInSso('/', 'fixture', 'offline-password', new AbortController().signal, async () => {
    calls++; return calls === 2 ? json({ authenticated: true }) : json({ authenticated: false }, 401);
  }), SsoLoginError);
  assert.equal(calls, 3);
});

function fixture(path = '/#today') {
  const target = new URL(path, 'https://pongdang.site');
  const values = new Map();
  const navigations = [];
  const location = {
    origin: target.origin, pathname: target.pathname, search: target.search, hash: target.hash,
    assign: url => navigations.push(['assign', url]),
    replace: url => navigations.push(['replace', url]),
  };
  const storage = () => ({
    setItem: (key, value) => values.set(key, value),
    getItem: key => values.get(key) ?? null,
    removeItem: key => values.delete(key),
  });
  return { location, storage, values, navigations };
}

test('login uses the protected domain callback and restores root and subpath screens', () => {
  for (const path of ['/#today', '/?lang=en#first-swim', '/pongdang/#first-swim']) {
    const f = fixture(path);
    beginSsoLogin('/pongdang/', f.location, f.storage);
    assert.deepEqual(f.navigations, [['assign', '/pongdang/auth/continue']]);
    assert.equal(f.values.get('pd-return-path'), path);
    f.location.pathname = '/pongdang/auth/continue';
    resumeSsoLogin('/pongdang/', f.location, f.storage);
    assert.deepEqual(f.navigations[1], ['replace', path]);
    assert.equal(f.values.size, 0);
  }
});

test('returning without completing login never claims a callback or changes the current screen', () => {
  const f = fixture('/#today');
  beginSsoLogin('/pongdang/', f.location, f.storage);
  resumeSsoLogin('/pongdang/', f.location, f.storage);
  assert.equal(f.navigations.length, 1);
  assert.equal(f.values.get('pd-return-path'), '/#today');
});

test('callback rejects other origins, non-app paths and loops', () => {
  for (const path of ['https://other.invalid/', '//other.invalid/', '/oauth2/start', '/pongdang/auth/continue', '/unrelated/', 'https://user@pongdang.site/']) {
    const f = fixture('/pongdang/auth/continue');
    f.values.set('pd-return-path', path);
    resumeSsoLogin('/pongdang/', f.location, f.storage);
    assert.deepEqual(f.navigations, [['replace', '/pongdang/#home']]);
  }
});

test('unavailable session storage does not prevent login or returning home', () => {
  const f = fixture();
  const storage = () => { throw new Error('Storage disabled'); };
  beginSsoLogin('/pongdang/', f.location, storage);
  f.location.pathname = '/pongdang/auth/continue';
  resumeSsoLogin('/pongdang/', f.location, storage);
  assert.deepEqual(f.navigations, [['assign', '/pongdang/auth/continue'], ['replace', '/pongdang/#home']]);
});
