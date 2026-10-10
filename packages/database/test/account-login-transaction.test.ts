import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import test from 'node:test';
import { Database, PostgresAccountLoginTransactionStore } from '../src/index.js';

const connectionString = process.env['WEPUU_TEST_DATABASE_URL'];
const csrf = () => randomBytes(32).toString('base64url');

test('login transactions reject tamper, expiry and replay while supporting independent tabs', {
  skip: connectionString === undefined
}, async (t) => {
  assert.ok(connectionString);
  const database = new Database({ connectionString, applicationName: 'wepuu-account-login-transaction-test' });
  t.after(() => database.close());
  await database.migrate();
  const admin = database.poolForMigrationsAndTests;
  await admin.query('TRUNCATE platform.account_login_transactions');
  await admin.query('TRUNCATE platform.accounts CASCADE');
  await admin.query('TRUNCATE auth."user" CASCADE');
  await admin.query(
    `INSERT INTO auth."user" ("id", "name", "email", "emailVerified")
     VALUES ('auth_user_login_transaction', 'Login User', 'login-transaction@example.test', true)`
  );
  const store = new PostgresAccountLoginTransactionStore(database);
  const now = new Date('2026-10-10T01:00:00.000Z');

  const protectedCsrf = csrf();
  const transaction = await store.create('/interaction/first', protectedCsrf, now);
  await assert.rejects(store.bindEmail(transaction.token, csrf(), 'login-transaction@example.test', now), {
    message: 'account_login_transaction_invalid'
  });
  await store.bindEmail(transaction.token, protectedCsrf, 'login-transaction@example.test', now);
  await assert.rejects(store.bindEmail(transaction.token, protectedCsrf, 'different@example.test', now), {
    message: 'account_login_email_mismatch'
  });
  await assert.rejects(
    store.complete(transaction.token, protectedCsrf, 'auth_user_login_transaction', new Date(now.getTime() + 600_001)),
    { message: 'account_login_transaction_expired' }
  );
  const mismatchedCsrf = csrf();
  const mismatched = await store.create('/interaction/email-bound', mismatchedCsrf, now);
  await store.bindEmail(mismatched.token, mismatchedCsrf, 'different@example.test', now);
  await assert.rejects(
    store.complete(mismatched.token, mismatchedCsrf, 'auth_user_login_transaction', now),
    { message: 'account_login_email_mismatch' }
  );

  const firstCsrf = csrf();
  const secondCsrf = csrf();
  const [first, second] = await Promise.all([
    store.create('/interaction/tab-one', firstCsrf, now),
    store.create('/interaction/tab-two', secondCsrf, now)
  ]);
  const [firstResult, secondResult] = await Promise.all([
    store.complete(first.token, firstCsrf, 'auth_user_login_transaction', now),
    store.complete(second.token, secondCsrf, 'auth_user_login_transaction', now)
  ]);
  assert.equal(firstResult.returnPath, '/interaction/tab-one');
  assert.equal(secondResult.returnPath, '/interaction/tab-two');
  assert.equal(firstResult.accountId, secondResult.accountId);
  assert.equal(firstResult.homeTenantId, secondResult.homeTenantId);
  await assert.rejects(store.complete(first.token, firstCsrf, 'auth_user_login_transaction', now), {
    message: 'account_login_transaction_consumed'
  });
  const counts = await admin.query<{ accounts: string; homes: string; memberships: string; links: string }>(
    `SELECT
       (SELECT count(*) FROM platform.accounts)::text AS accounts,
       (SELECT count(*) FROM platform.account_home_tenants)::text AS homes,
       (SELECT count(*) FROM platform.tenant_memberships)::text AS memberships,
       (SELECT count(*) FROM platform.account_auth_links)::text AS links`
  );
  assert.deepEqual(counts.rows[0], { accounts: '1', homes: '1', memberships: '1', links: '1' });
});

test('failed account bootstrap leaves the login transaction retryable', {
  skip: connectionString === undefined
}, async (t) => {
  assert.ok(connectionString);
  const database = new Database({ connectionString, applicationName: 'wepuu-account-login-recovery-test' });
  t.after(() => database.close());
  await database.migrate();
  const admin = database.poolForMigrationsAndTests;
  await admin.query('TRUNCATE platform.account_login_transactions');
  await admin.query('TRUNCATE platform.accounts CASCADE');
  await admin.query('TRUNCATE auth."user" CASCADE');
  const store = new PostgresAccountLoginTransactionStore(database);
  const transactionCsrf = csrf();
  const transaction = await store.create('/app', transactionCsrf);

  await assert.rejects(store.complete(transaction.token, transactionCsrf, 'auth_user_recovery'));
  const pending = await admin.query<{ consumed_at: Date | null }>(
    'SELECT consumed_at FROM platform.account_login_transactions'
  );
  assert.equal(pending.rows[0]?.consumed_at, null);
  await admin.query(
    `INSERT INTO auth."user" ("id", "name", "email", "emailVerified")
     VALUES ('auth_user_recovery', 'Recovery User', 'recovery@example.test', true)`
  );
  const recovered = await store.complete(transaction.token, transactionCsrf, 'auth_user_recovery');
  assert.equal(recovered.returnPath, '/app');
  assert.equal(recovered.accountStatus, 'active');
});
