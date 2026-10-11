import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import {
  Database,
  PostgresAccountAuthLinkStore,
  PostgresConsoleAuthStore
} from '../src/index.js';

const connectionString = process.env['WEPUU_TEST_DATABASE_URL'];

test('console handoff is one-time, hash-only and bounded by the Better Auth session', {
  skip: connectionString === undefined
}, async (t) => {
  assert.ok(connectionString);
  const database = new Database({ connectionString, applicationName: 'wepuu-console-auth-test' });
  t.after(() => database.close());
  await database.migrate();
  await database.migrate();
  const admin = database.poolForMigrationsAndTests;
  await admin.query('TRUNCATE platform.accounts CASCADE');
  await admin.query('TRUNCATE auth."user" CASCADE');
  await admin.query(
    `INSERT INTO auth."user" ("id", "name", "email", "emailVerified")
     VALUES ('auth_user_console', 'Console User', 'console@example.test', true)`
  );
  const link = await new PostgresAccountAuthLinkStore(database).provision('auth_user_console');
  const createdAt = new Date();
  const authorityExpiry = new Date(createdAt.getTime() + 60 * 60_000);
  await admin.query(
    `INSERT INTO auth."session"
      ("id", "expiresAt", "token", "createdAt", "updatedAt", "userId")
     VALUES ('auth_session_console', $1, 'authority-token-never-selected', $2, $2, 'auth_user_console')`,
    [authorityExpiry, createdAt]
  );

  const store = new PostgresConsoleAuthStore(database);
  const login = await store.createLogin('/app/account');
  const handoff = await store.authorizeLogin({
    requestId: login.requestId,
    authSessionId: 'auth_session_console',
    accountId: link.accountId,
    authExpiresAt: authorityExpiry
  });
  const session = await store.exchangeLogin({
    requestId: login.requestId, browserSecret: login.browserSecret, code: handoff.code
  });
  assert.equal(session.accountId, link.accountId);
  assert.equal(session.returnPath, '/app/account');
  assert.ok(session.expiresAt.getTime() <= authorityExpiry.getTime());
  assert.deepEqual(await store.resolveSession(createHash('sha256').update(session.token).digest()), {
    accountId: link.accountId, authenticationTime: Math.floor(createdAt.getTime() / 1_000)
  });

  const persisted = JSON.stringify((await admin.query(
    `SELECT encode(browser_secret_hash, 'hex') AS browser, encode(handoff_code_hash, 'hex') AS code
     FROM platform.console_auth_transactions`
  )).rows);
  assert.equal(persisted.includes(login.browserSecret), false);
  assert.equal(persisted.includes(handoff.code), false);
  assert.equal(JSON.stringify((await admin.query(
    `SELECT encode(session_hash, 'hex') AS session FROM platform.console_sessions`
  )).rows).includes(session.token), false);

  await assert.rejects(store.exchangeLogin({
    requestId: login.requestId, browserSecret: login.browserSecret, code: handoff.code
  }), { message: 'console_auth_transaction_consumed' });

  await admin.query('DELETE FROM auth."session" WHERE "id" = $1', ['auth_session_console']);
  assert.equal((await admin.query('SELECT 1 FROM platform.console_sessions')).rowCount, 0);
  assert.equal((await admin.query('SELECT 1 FROM platform.console_auth_transactions')).rowCount, 0);
});
