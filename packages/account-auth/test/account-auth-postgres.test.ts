import assert from 'node:assert/strict';
import test from 'node:test';
import { betterAuth } from 'better-auth';
import { emailOTP } from 'better-auth/plugins';
import { setTokenUtil } from 'better-auth/oauth2';
import { PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import { Database } from '../../database/src/index.js';
import {
  ACCOUNT_AUTH_SESSION_TTL_SECONDS,
  accountAuthSecurityOptions,
  createAccountAuth
} from '../src/index.js';

const connectionString = process.env['WEPUU_TEST_DATABASE_URL'];

test('Better Auth session is absolute, authoritative and revocable; sensitive provider values are encrypted', {
  skip: connectionString === undefined
}, async (t) => {
  assert.ok(connectionString);
  const migrations = new Database({ connectionString, applicationName: 'wepuu-account-auth-test-migrations' });
  await migrations.migrate();
  await migrations.close();
  const pool = new Pool({ connectionString, application_name: 'wepuu-account-auth-test' });
  t.after(() => pool.end());
  await pool.query('TRUNCATE platform.accounts CASCADE');
  await pool.query('TRUNCATE auth."user" CASCADE');

  let deliveredOtp: string | undefined;
  const auth = betterAuth({
    appName: 'WePuu Test',
    baseURL: 'https://platform.example.test',
    basePath: '/api/auth',
    trustedOrigins: ['https://platform.example.test'],
    secrets: [{ version: 1, value: 'test-only-better-auth-secret-value-0000000000000000' }],
    database: {
      dialect: new PostgresDialect({ pool }),
      type: 'postgres',
      casing: 'camel',
      transaction: true,
      schemaName: 'auth'
    },
    ...accountAuthSecurityOptions(),
    emailAndPassword: { enabled: true },
    plugins: [emailOTP({
      storeOTP: 'hashed',
      async sendVerificationOTP({ otp }) { deliveredOtp = otp; }
    })],
    telemetry: { enabled: false }
  });
  const context = await auth.$context;
  const signUp = await auth.api.signUpEmail({
    headers: new Headers({ origin: 'https://platform.example.test' }),
    body: { name: 'Session Test', email: 'session@example.test', password: 'correct horse battery staple' },
    asResponse: true
  });
  assert.equal(signUp.status, 200);
  const setCookie = signUp.headers.getSetCookie().find((value) => value.startsWith('__Host-wepuu_session='));
  assert.ok(setCookie);
  assert.match(setCookie, /Secure/u);
  assert.match(setCookie, /HttpOnly/u);
  assert.match(setCookie, /SameSite=Lax/ui);
  assert.match(setCookie, /Path=\//u);
  assert.doesNotMatch(setCookie, /Domain=/ui);
  const requestHeaders = new Headers({ cookie: setCookie.split(';', 1)[0] ?? '' });
  const userResult = await pool.query<{ id: string }>(
    'SELECT "id" FROM auth."user" WHERE "email" = $1', ['session@example.test']
  );
  const userId = userResult.rows[0]?.id;
  assert.ok(userId);

  const persisted = await pool.query<{
    token: string;
    createdAt: Date;
    updatedAt: Date;
    expiresAt: Date;
  }>('SELECT "token", "createdAt", "updatedAt", "expiresAt" FROM auth."session" WHERE "userId" = $1', [userId]);
  const row = persisted.rows[0];
  assert.ok(row);
  // Better Auth 1.7.7 intentionally persists the opaque token. ADR-018 records
  // this accepted difference from the legacy digest-only session table.
  assert.equal(setCookie.includes(row.token), true);
  assert.ok(Math.abs((row.expiresAt.getTime() - row.createdAt.getTime()) / 1_000
    - ACCOUNT_AUTH_SESSION_TTL_SECONDS) < 2);

  const session = await auth.api.getSession({
    headers: requestHeaders,
    query: { disableCookieCache: true, disableRefresh: true }
  });
  assert.equal(session?.user.id, userId);
  const readerAuth = createAccountAuth({
    databaseUrl: connectionString,
    applicationName: 'wepuu-account-auth-reader-test',
    publicOrigin: 'https://platform.example.test',
    secrets: [{ version: 1, value: 'test-only-better-auth-secret-value-0000000000000000' }],
    databaseRole: 'wepuu_account_auth_reader'
  });
  t.after(() => readerAuth.close());
  assert.equal((await readerAuth.getSession(requestHeaders))?.userId, userId);
  const afterRead = await pool.query<{ updatedAt: Date }>(
    'SELECT "updatedAt" FROM auth."session" WHERE "userId" = $1', [userId]
  );
  assert.equal(afterRead.rows[0]?.updatedAt.getTime(), row.updatedAt.getTime());
  await pool.query('UPDATE auth."session" SET "expiresAt" = now() - interval \'1 second\' WHERE "userId" = $1', [userId]);
  assert.equal(await readerAuth.getSession(requestHeaders), undefined);
  assert.equal((await pool.query('SELECT 1 FROM auth."session" WHERE "userId" = $1', [userId])).rowCount, 1);
  await pool.query('UPDATE auth."session" SET "expiresAt" = now() + interval \'1 hour\' WHERE "userId" = $1', [userId]);

  const accessCanary = 'provider-access-token-canary';
  const refreshCanary = 'provider-refresh-token-canary';
  await assert.rejects(context.internalAdapter.createAccount({
    id: 'account_auth_plaintext_rejected', accountId: 'external-plain', providerId: 'auth0', userId,
    accessToken: accessCanary, refreshToken: refreshCanary
  }), { message: 'account_auth_unencrypted_provider_token' });
  await context.internalAdapter.createAccount({
    id: 'account_auth_encryption_test',
    accountId: 'external-subject',
    providerId: 'auth0',
    userId,
    accessToken: await setTokenUtil(accessCanary, context as unknown as Parameters<typeof setTokenUtil>[1]),
    refreshToken: await setTokenUtil(refreshCanary, context as unknown as Parameters<typeof setTokenUtil>[1]),
    idToken: 'provider-id-token-canary'
  });
  const providerTokens = await pool.query<{ accessToken: string; refreshToken: string; idToken: string | null }>(
    'SELECT "accessToken", "refreshToken", "idToken" FROM auth."account" WHERE "id" = $1',
    ['account_auth_encryption_test']
  );
  assert.notEqual(providerTokens.rows[0]?.accessToken, accessCanary);
  assert.notEqual(providerTokens.rows[0]?.refreshToken, refreshCanary);
  assert.equal(JSON.stringify(providerTokens.rows).includes(accessCanary), false);
  assert.equal(JSON.stringify(providerTokens.rows).includes(refreshCanary), false);
  assert.equal(providerTokens.rows[0]?.idToken, null);

  await auth.api.sendVerificationOTP({
    body: { email: 'otp@example.test', type: 'sign-in' }
  });
  assert.match(deliveredOtp ?? '', /^\d{6}$/u);
  const verification = await pool.query<{ identifier: string; value: string }>(
    'SELECT "identifier", "value" FROM auth."verification" ORDER BY "createdAt" DESC LIMIT 1'
  );
  assert.equal(JSON.stringify(verification.rows).includes(deliveredOtp ?? 'missing'), false);
  assert.equal(JSON.stringify(verification.rows).includes('otp@example.test'), false);

  const logout = await auth.api.signOut({ headers: requestHeaders, asResponse: true });
  assert.equal(logout.status, 200);
  assert.equal(await auth.api.getSession({ headers: requestHeaders }), null);
});
