import assert from 'node:assert/strict';
import test from 'node:test';
import { Database, PostgresAccountWorkspaceStore } from '../src/index.js';

const connectionString = process.env['WEPUU_TEST_DATABASE_URL'];

test('personal workspace bootstrap is concurrent, idempotent and account scoped', { skip: connectionString === undefined }, async (t) => {
  assert.ok(connectionString);
  const database = new Database({ connectionString, applicationName: 'wepuu-account-workspace-test' });
  t.after(() => database.close());
  await database.migrate();
  const admin = database.poolForMigrationsAndTests;
  await admin.query('TRUNCATE platform.accounts CASCADE');
  await admin.query(
    `INSERT INTO platform.accounts (id, status, identity_issuer, identity_subject_hash)
     VALUES ('account_WORKSPACE_A', 'active', 'https://identity.example.test/', $1),
            ('account_WORKSPACE_B', 'active', 'https://identity.example.test/', $2)`,
    ['a'.repeat(64), 'b'.repeat(64)]
  );
  const store = new PostgresAccountWorkspaceStore(database);
  const concurrent = await Promise.all(Array.from({ length: 12 }, () => store.ensurePersonalWorkspace('account_WORKSPACE_A')));
  assert.equal(new Set(concurrent.map((membership) => membership.tenantId)).size, 1);
  assert.ok(concurrent.every((membership) => membership.role === 'owner' && membership.isHome));
  assert.deepEqual(await store.listMemberships('account_WORKSPACE_B'), []);
  const second = await store.ensurePersonalWorkspace('account_WORKSPACE_B');
  assert.notEqual(second.tenantId, concurrent[0]?.tenantId);
  assert.deepEqual((await store.listMemberships('account_WORKSPACE_A')).map((membership) => membership.tenantId), [concurrent[0]?.tenantId]);
  await assert.rejects(
    database.withAccountWorkspace('account_WORKSPACE_A', (client) => client.query('SELECT identity_issuer FROM platform.accounts')),
    (error: unknown) => typeof error === 'object' && error !== null && 'code' in error && error.code === '42501'
  );
});
