import assert from 'node:assert/strict';
import test from 'node:test';
import { Database, PostgresAccountAuthLinkStore } from '../src/index.js';

const connectionString = process.env['WEPUU_TEST_DATABASE_URL'];

test('Better Auth user projection is atomic, concurrent and fail-closed', { skip: connectionString === undefined }, async (t) => {
  assert.ok(connectionString);
  const database = new Database({ connectionString, applicationName: 'wepuu-account-auth-link-test' });
  t.after(() => database.close());
  await database.migrate();
  await database.migrate();
  const admin = database.poolForMigrationsAndTests;
  await admin.query('TRUNCATE platform.accounts CASCADE');
  await admin.query('TRUNCATE auth."user" CASCADE');
  await admin.query(
    `INSERT INTO auth."user" ("id", "name", "email", "emailVerified")
     VALUES ('auth_user_concurrent', 'Test User', 'account-auth@example.test', true)`
  );

  const store = new PostgresAccountAuthLinkStore(database);
  const links = await Promise.all(Array.from({ length: 12 }, () => store.provision('auth_user_concurrent')));
  assert.equal(new Set(links.map((link) => link.accountId)).size, 1);
  assert.equal(new Set(links.map((link) => link.homeTenantId)).size, 1);
  const accountId = links[0]?.accountId;
  assert.ok(accountId);

  const counts = await admin.query<{
    accounts: string;
    homes: string;
    memberships: string;
    links: string;
  }>(
    `SELECT
       (SELECT count(*) FROM platform.accounts)::text AS accounts,
       (SELECT count(*) FROM platform.account_home_tenants)::text AS homes,
       (SELECT count(*) FROM platform.tenant_memberships)::text AS memberships,
       (SELECT count(*) FROM platform.account_auth_links)::text AS links`
  );
  assert.deepEqual(counts.rows[0], { accounts: '1', homes: '1', memberships: '1', links: '1' });
  assert.equal((await store.resolve('auth_user_concurrent'))?.accountStatus, 'active');

  await admin.query("UPDATE platform.accounts SET status = 'suspended' WHERE id = $1", [accountId]);
  assert.equal((await store.resolve('auth_user_concurrent'))?.accountStatus, 'suspended');
  assert.equal((await store.provision('auth_user_concurrent')).accountStatus, 'suspended');
  assert.equal(await store.resolve('unknown_auth_user'), undefined);

  await admin.query(
    `INSERT INTO auth."user" ("id", "name", "email", "emailVerified")
     VALUES ('auth_user_other', 'Other User', 'other-account-auth@example.test', true)`
  );
  await admin.query(
    `INSERT INTO auth."account" ("id", "accountId", "providerId", "userId", "createdAt", "updatedAt")
     VALUES ('provider_link_one', 'upstream_subject', 'auth0', 'auth_user_concurrent', now(), now())`
  );
  await assert.rejects(
    admin.query(
      `INSERT INTO auth."account" ("id", "accountId", "providerId", "userId", "createdAt", "updatedAt")
       VALUES ('provider_link_two', 'upstream_subject', 'auth0', 'auth_user_other', now(), now())`
    ),
    (error: unknown) => typeof error === 'object' && error !== null && 'code' in error && error.code === '23505'
  );

  await assert.rejects(
    database.withAccountAuthReader((client) => client.query(
      `INSERT INTO auth."user" ("id", "name", "email", "emailVerified")
       VALUES ('forbidden', 'Forbidden', 'forbidden@example.test', false)`
    )),
    (error: unknown) => typeof error === 'object' && error !== null && 'code' in error && error.code === '42501'
  );
  await assert.rejects(
    admin.query('DELETE FROM auth."user" WHERE "id" = $1', ['auth_user_concurrent']),
    (error: unknown) => typeof error === 'object' && error !== null && 'code' in error && error.code === '23503'
  );
});
