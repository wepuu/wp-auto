import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import test from 'node:test';
import { betterAuth } from 'better-auth';
import { emailOTP } from 'better-auth/plugins';
import { PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import { createAccountAuth, ACCOUNT_AUTH_CLIENT_IP_HEADER, ACCOUNT_AUTH_DELIVERY_ID_HEADER,
  type OtpSendEvent } from '../src/index.js';
import { buildControlApi, PostgresControlStore } from '../../../apps/control-api/src/server.js';
import { PostgresAccountLoginTransactionStore, PostgresSecurityAuditSink } from '../../database/src/index.js';
import { p3dDatabaseUrl, p3dFixture } from '../../database/test/p3d-fixture.js';

test('existing-only OTP: unknown addresses never send, reserve, register or obtain Sessions; existing users still log in', {
  skip: p3dDatabaseUrl === undefined, timeout: 90_000
}, async (t) => {
  const { database, pool, databaseUrl, cleanup } = await p3dFixture(t, true);
  const issuer = 'https://existing-only.example.test';
  const known = 'existing@example.test', absent = 'unregistered@example.test';
  await pool.query('INSERT INTO auth."user" (id,name,email,"emailVerified") VALUES ($1,$2,$3,true)',
    ['existing-only-fixture', 'Existing', known]);
  let sends = 0, otp = '';
  const events: OtpSendEvent[] = [];
  const auth = createAccountAuth({ databaseUrl, applicationName: 'existing-only-test', publicOrigin: issuer,
    secrets: [{ version: 1, value: randomBytes(48).toString('base64url') }],
    databaseRole: 'wepuu_account_auth_writer', otpSendProtection: { key: randomBytes(32), enabled: true },
    otpSendObserver: (event) => { events.push(event); },
    emailSender: { async send(input) { sends++; otp = input.otp; return 'accepted'; } } });
  cleanup(() => auth.close());
  let sequence = 0;
  const request = async (path: string, body: object, ip: string) => {
    const id = `existing_only_delivery_${String(++sequence).padStart(8, '0')}`;
    const response = await auth.handle(new Request(issuer + '/api/auth' + path, {
      method: 'POST', headers: { origin: issuer, 'content-type': 'application/json',
        [ACCOUNT_AUTH_CLIENT_IP_HEADER]: ip, [ACCOUNT_AUTH_DELIVERY_ID_HEADER]: id }, body: JSON.stringify(body)
    }));
    return { response, outcome: auth.takeDeliveryOutcome(id) };
  };
  const unknown = await request('/email-otp/send-verification-otp', { email: absent, type: 'sign-in' }, '192.0.2.10');
  assert.equal(unknown.response.status, 200);
  assert.equal(unknown.outcome, 'suppressed');
  assert.equal(sends, 0); assert.equal(events.length, 0);
  assert.equal((await pool.query('SELECT 1 FROM auth.otp_send_reservations')).rowCount, 0);
  assert.equal((await pool.query('SELECT 1 FROM auth.verification')).rowCount, 0);
  assert.equal((await pool.query('SELECT 1 FROM auth."session"')).rowCount, 0);
  assert.equal((await pool.query('SELECT 1 FROM auth."user"')).rowCount, 1);
  assert.equal((await pool.query('SELECT 1 FROM platform.accounts')).rowCount, 0);
  assert.equal((await pool.query('SELECT 1 FROM platform.account_home_tenants')).rowCount, 0);

  const again = await request('/email-otp/send-verification-otp', { email: absent, type: 'sign-in' }, '192.0.2.10');
  assert.equal(again.response.status, 429, 'unknown recipient still obeys IP rate limit');
  assert.equal(again.outcome, undefined);

  // Even a valid pre-existing unknown-address OTP cannot trigger automatic signup.
  // Seed via the official test-only Better Auth adapter on an isolated database,
  // never add plaintext codes or hand-built hashes to production storage.
  const seedPool = new Pool({ connectionString: databaseUrl });
  cleanup(() => seedPool.end());
  const generator = betterAuth({ database: { dialect: new PostgresDialect({ pool: seedPool }),
    type: 'postgres', casing: 'camel', transaction: true, schemaName: 'auth' },
    baseURL: issuer, secret: randomBytes(48).toString('base64url'),
    plugins: [emailOTP({ storeOTP: 'hashed', async sendVerificationOTP() {} })], telemetry: { enabled: false } });
  const oldOtp = await generator.api.createVerificationOTP({ body: { email: absent, type: 'sign-in' } });
  const forbidden = await request('/sign-in/email-otp', { email: absent, otp: oldOtp }, '192.0.2.11');
  assert.equal(forbidden.response.status, 400);
  assert.equal(forbidden.response.headers.getSetCookie().some(x => x.startsWith('__Host-wepuu_session=')), false);
  assert.equal((await pool.query('SELECT 1 FROM auth."user"')).rowCount, 1);
  assert.equal((await pool.query('SELECT 1 FROM auth."session"')).rowCount, 0);

  const sent = await request('/email-otp/send-verification-otp', { email: ' Existing@Example.Test ', type: 'sign-in' }, '192.0.2.12');
  assert.equal(sent.response.status, 200); assert.equal(sent.outcome, 'accepted');
  assert.equal(sends, 1); assert.match(otp, /^\d{6}$/u);
  const login = await request('/sign-in/email-otp', { email: known, otp }, '192.0.2.13');
  assert.equal(login.response.status, 200);
  assert(login.response.headers.getSetCookie().some(x => x.startsWith('__Host-wepuu_session=')));
  assert.equal((await pool.query('SELECT 1 FROM auth."user"')).rowCount, 1);
  const session = (await pool.query<{ seconds: number }>('SELECT extract(epoch FROM ("expiresAt"-"createdAt"))::float8 AS seconds FROM auth."session"')).rows[0];
  assert.ok(session && Math.abs(session.seconds - 43_200) < 2, 'absolute Session lifetime unchanged');

  const app = buildControlApi({ publicOrigin: issuer, accountAuth: auth,
    identityProvider: { async authenticate() { return undefined; } }, store: new PostgresControlStore(database),
    audit: new PostgresSecurityAuditSink(database), loginTransactions: new PostgresAccountLoginTransactionStore(database) });
  cleanup(() => app.close());
  const publicSend = async (email: string, remoteAddress: string) => {
    const page = await app.inject({ method: 'GET', url: '/v1/account/login', remoteAddress });
    const csrf = /name="csrf" value="([A-Za-z0-9_-]{43})"/u.exec(page.body)?.[1];
    const transaction = /name="transaction" value="([A-Za-z0-9_-]{43})"/u.exec(page.body)?.[1];
    assert.ok(csrf && transaction);
    return await app.inject({ method: 'POST', url: '/v1/account/email/send', remoteAddress,
      headers: { origin: issuer, cookie: `__Host-wepuu_csrf=${csrf}`, 'content-type': 'application/x-www-form-urlencoded' },
      payload: new URLSearchParams({ csrf, transaction, email }).toString() });
  };
  const hidden = await publicSend(absent, '192.0.2.14');
  const visible = await publicSend(known, '192.0.2.15');
  assert.equal(hidden.statusCode, 200); assert.equal(visible.statusCode, 200);
  const neutral = 'If this email belongs to an existing account, check your inbox for a verification code.';
  assert(hidden.body.includes(neutral)); assert(visible.body.includes(neutral));
  assert(!hidden.body.includes('suppressed'));
  assert.equal(sends, 2, 'only existing mailbox calls the mock Provider');
  assert.equal((await pool.query('SELECT 1 FROM auth.otp_send_reservations')).rowCount, 2);
  assert.equal((await pool.query('SELECT 1 FROM auth.otp_send_reservations WHERE outcome=\'reserved\'')).rowCount, 0);
  assert.equal((await app.inject({ method: 'POST', url: '/api/auth/sign-up/email', payload: {} })).statusCode, 404);
  const invalid = await app.inject({ method: 'POST', url: '/v1/account/email/send',
    headers: { origin: 'https://attacker.invalid', 'content-type': 'application/x-www-form-urlencoded' }, payload: 'email=existing@example.test' });
  assert.equal(invalid.statusCode, 403); assert.equal(sends, 2);
});
