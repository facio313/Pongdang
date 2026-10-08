import assert from 'node:assert/strict';
import test from 'node:test';
import { once } from 'node:events';
import { createDomainServer, authorizePongdang } from './pongdang-domain-auth.mjs';
import { registerPongdangAccount, registrationInput } from './pongdang-registration.mjs';

const digest = '$argon2id$v=19$m=65536,t=3,p=4$b2ZmbGluZXNhbHQ$b2ZmbGluZWhhc2g';
const input = () => ({ username: 'new-user', displayName: 'New user', email: 'new@example.invalid', password: 'Offline-password123!' });
const headers = { 'X-Portfolio-Edge-Secret': 'offline-test-edge-secret-not-used-in-production', 'X-Original-Host': 'pongdang.site', Origin: 'https://pongdang.site', 'X-Real-IP': '127.0.0.1', 'Content-Type': 'application/json' };

// An isolated contract double for the central serialized writer. Nothing is
// connected to a real account file, database, credential service or SSO server.
function fixture() {
  let database = { users: { existing: { disabled: false, displayname: 'Existing', email: 'existing@example.invalid', password: digest, groups: ['user', 'portfolio-v2', 'access-pongdang'] } } };
  let revision = 0;
  const writes = [];
  const audits = [];
  const serializeUserDatabase = value => {
    for (const user of Object.values(value.users)) {
      assert.deepEqual(user.groups, ['user', 'portfolio-v2', 'access-pongdang']);
      assert.match(user.password, /^\$argon2id\$/);
    }
    return JSON.stringify(value);
  };
  const store = {
    read: async () => structuredClone(database),
    readVersioned: async () => ({ database: structuredClone(database), revision: String(revision) }),
    mutate: async mutation => {
      if (mutation.expectedRevision !== String(revision)) throw new Error('stale revision');
      const candidate = structuredClone(database);
      await mutation.transform(candidate);
      if (mutation.expectedRevision !== String(revision)) throw new Error('stale revision');
      serializeUserDatabase(candidate);
      database = candidate;
      revision++;
      writes.push({ actor: mutation.actor, action: mutation.action, target: mutation.target });
    },
  };
  return {
    store, writes, audits, serializeUserDatabase, registrationEnabled: true,
    groupsForAssignment: (role, apps) => { assert.equal(role, 'user'); assert.deepEqual(apps, ['pongdang']); return ['user', 'portfolio-v2', 'access-pongdang']; },
    edgeSecret: headers['X-Portfolio-Edge-Secret'], normalizeUsername: value => value.trim().toLowerCase(),
    refreshApplications() {}, fetchAuth: async () => new Response(null, { status: 401 }),
    hashPassword: async password => { assert.equal(password, input().password); return digest; },
    audit: code => audits.push(code),
    signal: AbortSignal.timeout(5000),
  };
}

async function withServer(run, update = {}) {
  const dependencies = { ...fixture(), ...update };
  const server = createDomainServer(dependencies);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try { await run(`http://127.0.0.1:${server.address().port}`, dependencies); }
  finally { server.closeAllConnections(); server.close(); await once(server, 'close'); }
}

test('new accounts are active immediately, receive only the Pongdang grant and pass the unchanged login gate', async () => {
  const dependencies = fixture();
  const credentials = { ...input(), username: ' NEW-USER ', email: ' NEW@example.invalid ' };
  await registerPongdangAccount(credentials, dependencies);
  assert.equal(credentials.password, '');
  const database = await dependencies.store.read();
  assert.deepEqual(database.users['new-user'], { disabled: false, displayname: 'New user', email: 'new@example.invalid', password: digest, groups: ['user', 'portfolio-v2', 'access-pongdang'] });
  assert.equal(dependencies.writes.length, 1);
  assert.equal(dependencies.writes[0].action, 'register_pongdang_user');
  assert.ok(!JSON.stringify(dependencies.writes).includes(input().password));
  let status;
  await authorizePongdang({ headers: Object.fromEntries(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value])) }, {
    writeHead(value, responseHeaders) { status = value; assert.equal(responseHeaders['X-Pongdang-Grants'], 'user,portfolio-v2,access-pongdang'); return this; }, end() {},
  }, { ...dependencies, fetchAuth: async () => new Response(null, { status: 202, headers: {
    'X-Auth-Request-Preferred-Username': 'new-user', 'X-Auth-Request-Email': 'new@example.invalid', 'X-Auth-Request-Groups': 'user,portfolio-v2,access-pongdang',
  } }) });
  assert.equal(status, 200);
});

for (const changes of [{ username: ' EXISTING ' }, { email: ' EXISTING@example.invalid ' }]) {
  test('a duplicate identity never replaces its password or grants', async () => {
    const dependencies = fixture();
    const before = await dependencies.store.read();
    await assert.rejects(registerPongdangAccount({ ...input(), ...changes }, dependencies), error => error.status === 409);
    assert.deepEqual(await dependencies.store.read(), before);
    assert.equal(dependencies.writes.length, 0);
  });
}

test('concurrent duplicate submissions cannot create two accounts or replace the first', async () => {
  const dependencies = fixture();
  const results = await Promise.allSettled([registerPongdangAccount(input(), dependencies), registerPongdangAccount(input(), dependencies)]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(dependencies.writes.length, 1);
});

for (const [name, changes] of [
  ['reserved guest', { username: 'anonymous-guest' }],
  ['reserved local operator', { username: 'local-operator' }],
  ['prototype name', { username: '__proto__' }],
  ['oversized username', { username: 'a'.repeat(65) }],
  ['invalid email', { email: 'a@b' }],
  ['blank name', { displayName: ' ' }],
  ['control characters', { displayName: 'name\n' }],
  ['short password', { password: 'Short1!' }],
  ['weak password', { password: 'longbutalllowercase' }],
  ['space instead of symbol', { password: 'Offline password123' }],
  ['too long password', { password: `Aa1!${'a'.repeat(125)}` }],
  ['extra grants', { groups: ['chief-admin'] }],
  ['extra roles', { roles: ['user', 'developer', 'admin'] }],
  ['disabled override', { disabled: false }],
  ['upstream URL', { targetURL: 'https://outside.invalid' }],
]) test(`${name} fails before hashing or writing`, async () => {
  const dependencies = fixture();
  dependencies.hashPassword = () => assert.fail('must not hash');
  await assert.rejects(registerPongdangAccount({ ...input(), ...changes }, dependencies), error => error.status === 400);
  assert.equal(dependencies.writes.length, 0);
});

test('a rejected central grant contract, failed hasher or cancelled request cannot persist an account', async () => {
  for (const failure of ['contract', 'hash', 'cancelled', 'broad grants', 'legacy role']) {
    const dependencies = fixture();
    if (failure === 'contract') dependencies.serializeUserDatabase = () => { throw new Error('unsupported central contract'); };
    if (failure === 'broad grants') dependencies.groupsForAssignment = () => ['user', 'portfolio-v2', 'access-pongdang', 'access-blog'];
    if (failure === 'legacy role') dependencies.groupsForAssignment = () => ['user'];
    if (failure === 'hash') dependencies.hashPassword = async () => { throw new Error('private hash failure'); };
    if (failure === 'cancelled') dependencies.signal = AbortSignal.abort();
    const credentials = input();
    await assert.rejects(registerPongdangAccount(credentials, dependencies));
    assert.equal(credentials.password, '');
    assert.equal(dependencies.writes.length, 0);
  }
});

test('the HTTP endpoint confirms persistence but does not create a browser session or expose a password', async () => withServer(async (url, dependencies) => {
  const state = await fetch(`${url}/inline/state`, { headers });
  assert.equal((await state.json()).registration_available, true);
  const response = await fetch(`${url}/inline/register`, { method: 'POST', headers, body: JSON.stringify(input()) });
  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), { authenticated: false, registered: true });
  assert.equal(response.headers.get('set-cookie'), null);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(dependencies.audits, ['inline-registration-completed']);
  const duplicate = await fetch(`${url}/inline/register`, { method: 'POST', headers, body: JSON.stringify(input()) });
  assert.equal(duplicate.status, 409);
  assert.equal((await duplicate.json()).detail, 'SSO_REGISTRATION_CONFLICT');
}));

for (const [name, update, status] of [
  ['missing edge secret', { 'X-Portfolio-Edge-Secret': '' }, 401],
  ['wrong host', { 'X-Original-Host': 'outside.invalid' }, 401],
  ['other origin', { Origin: 'https://outside.invalid' }, 403],
  ['missing origin', { Origin: '' }, 403],
  ['cross-site', { 'Sec-Fetch-Site': 'cross-site' }, 403],
  ['form request', { 'Content-Type': 'application/x-www-form-urlencoded' }, 415],
  ['missing trusted IP', { 'X-Real-IP': '' }, 403],
]) test(`registration rejects ${name} without changing accounts`, async () => withServer(async (url, dependencies) => {
  const response = await fetch(`${url}/inline/register`, { method: 'POST', headers: { ...headers, ...update }, body: JSON.stringify(input()) });
  assert.equal(response.status, status);
  assert.equal(response.headers.get('set-cookie'), null);
  assert.equal(dependencies.writes.length, 0);
}));

test('disabled registration fails closed and is not advertised', async () => withServer(async (url, dependencies) => {
  const state = await fetch(`${url}/inline/state`, { headers });
  assert.equal((await state.json()).registration_available, false);
  const response = await fetch(`${url}/inline/register`, { method: 'POST', headers, body: JSON.stringify(input()) });
  assert.equal(response.status, 503);
  assert.equal(dependencies.writes.length, 0);
}, { registrationEnabled: false }));

test('registration rejects non-POST methods, bounds request size and limits attempts', async () => withServer(async (url, dependencies) => {
  assert.equal((await fetch(`${url}/inline/register`, { headers })).status, 405);
  const large = await fetch(`${url}/inline/register`, { method: 'POST', headers, body: 'x'.repeat(9000) });
  assert.equal(large.status, 413);
  for (let index = 0; index < 4; index++) {
    const invalid = await fetch(`${url}/inline/register`, { method: 'POST', headers, body: '{}' });
    assert.equal(invalid.status, 400);
  }
  const limited = await fetch(`${url}/inline/register`, { method: 'POST', headers, body: JSON.stringify(input()) });
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get('retry-after'), '60');
  assert.equal(dependencies.writes.length, 0);
}));

test('malformed registration data cannot bypass the exact input contract', () => {
  for (const value of [null, [], {}, { ...input(), username: null }]) assert.throws(() => registrationInput(value));
});
