// Optional integration check inside the installed central image. Only a new
// temporary user database is written; the production account path is never used.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import { registerPongdangAccount } from './pongdang-registration.mjs';

const library = process.env.PONGDANG_CENTRAL_TEST_LIBRARY;
test('installed central writer hashes, persists and authenticates a Pongdang-only account', { skip: !library }, async () => {
  const central = await import(pathToFileURL(library).href);
  central.refreshApplications();
  const directory = await mkdtemp(join(tmpdir(), 'pongdang-registration-test-'));
  let password = `Aa1!${randomBytes(24).toString('base64url')}`;
  try {
    const digest = await central.hashPassword(password);
    const admin = { disabled: false, displayname: 'Isolated test admin', email: 'admin@example.invalid', password: digest, groups: central.groupsForAssignment('chief-admin', []) };
    const path = join(directory, 'users_database.yml');
    await writeFile(path, central.serializeUserDatabase({ users: { 'offline-admin': admin } }), { mode: 0o600 });
    const store = new central.UserStore(path, { minimumWriteIntervalMs: 0 });
    const input = { username: 'offline-new-user', displayName: 'Isolated new user', email: 'new@example.invalid', password };
    await registerPongdangAccount(input, { ...central, store, signal: AbortSignal.timeout(25000) });
    assert.equal(input.password, '');
    const database = await store.read();
    assert.deepEqual(database.users['offline-admin'], admin);
    const record = database.users['offline-new-user'];
    assert.equal(record.disabled, false);
    assert.deepEqual(record.groups, ['user', 'portfolio-v2', 'access-pongdang']);
    assert.deepEqual(central.assignmentFromGroups(record.groups).applications, ['pongdang']);
    assert.equal(await central.verifyPassword(password, record.password), true);
    assert.equal(await central.verifyPassword(`${password}x`, record.password), false);
    await assert.rejects(registerPongdangAccount({ ...input, username: 'OFFLINE-NEW-USER', password }, { ...central, store, signal: AbortSignal.timeout(5000) }), error => error.status === 409);
    assert.deepEqual(await store.read(), database);
    const audit = await readFile(store.auditPath, 'utf8');
    assert.ok(audit.includes('register_pongdang_user'));
    assert.ok(!audit.includes(password));
    assert.ok(!audit.includes(record.password));
  } finally {
    password = '';
    await rm(directory, { recursive: true, force: true });
  }
});
