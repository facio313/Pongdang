import assert from 'node:assert/strict';
import test from 'node:test';
import { beginSsoLogin, resumeSsoLogin } from '../src/ssoLogin.ts';

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
