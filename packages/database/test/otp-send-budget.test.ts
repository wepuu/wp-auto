import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import test from 'node:test';
import { Pool } from 'pg';
import { createAccountAuth, normalizeAccountEmail, PostgresOtpSendQuota,
  ACCOUNT_AUTH_CLIENT_IP_HEADER, ACCOUNT_AUTH_DELIVERY_ID_HEADER, type OtpSendEvent } from '../../account-auth/src/index.js';
import { ContentFreeMetrics } from '../../../apps/control-api/src/operations.js';
import { buildControlApi, PostgresControlStore } from '../../../apps/control-api/src/server.js';
import { PostgresAccountLoginTransactionStore, PostgresSecurityAuditSink } from '../src/index.js';
import { p3dDatabaseUrl, p3dFixture } from './p3d-fixture.js';

test('P3-D PostgreSQL rolling reservations are atomic, durable, isolated from Better Auth pruning and fail closed', {
  skip: p3dDatabaseUrl === undefined, timeout: 90_000
}, async (t) => {
  const { database, pool, databaseUrl, cleanup } = await p3dFixture(t);
  const target = new URL(databaseUrl);
  target.searchParams.set('options', '-c role=wepuu_account_auth_writer');
  const writer = new Pool({ connectionString: target.href, max: 8, statement_timeout: 5000 });
  const writer2 = new Pool({ connectionString: target.href, max: 8, statement_timeout: 5000 });
  cleanup(() => writer.end());
  cleanup(() => writer2.end());
  const key = randomBytes(32);
  const limits = { recipientHourlyMax: 3, recipientDailyMax: 6, globalDailyMax: 10 };
  const one = new PostgresOtpSendQuota(writer, key, limits);
  const two = new PostgresOtpSendQuota(writer2, key, limits);
  const migrated = await pool.query<{ name: string }>('SELECT name FROM public.wepuu_schema_migrations ORDER BY name');
  assert.equal(migrated.rows.length, 14, '001_013_plus_015');
  assert.equal(migrated.rows.some((row) => row.name.startsWith('014_')), false);

  await t.test('same normalized mailbox shares quota across instances; other mailbox is independent', async () => {
    const attempts = await Promise.all(Array.from({ length: 30 }, (_, i) =>
      (i % 2 === 0 ? one : two).reserve(normalizeAccountEmail(i % 2 === 0 ? ' USER@example.test ' : 'user@example.test'))));
    assert.equal(attempts.filter((r) => r.allowed).length, 3);
    assert.equal((await two.reserve('other@example.test')).allowed, true);
    const reused = attempts.find((r) => r.allowed);
    assert.ok(reused?.allowed);
    assert.equal(await one.claim(reused.id), true);
    assert.equal(await two.claim(reused.id), false);
    await one.finish(reused.id, 'unknown');
    assert.equal(await two.remaining(), 6, 'unknown_and_unattempted_reservations_remain_charged');
  });
  await t.test('rolling hour and day expire by database time, never by calendar boundaries', async () => {
    await pool.query('TRUNCATE auth.otp_send_reservations');
    for (let i = 0; i < 3; i++) await one.reserve('window@example.test');
    const denied = await one.reserve('window@example.test');
    assert.equal(denied.allowed, false);
    if (!denied.allowed) assert.equal(denied.retryAfterSeconds > 3500, true);
    await pool.query("UPDATE auth.otp_send_reservations SET reserved_at=clock_timestamp()-interval '59 minutes 59 seconds'");
    assert.equal((await one.reserve('window@example.test')).allowed, false, 'inside_hour');
    await pool.query("UPDATE auth.otp_send_reservations SET reserved_at=clock_timestamp()-interval '1 hour 1 second'");
    for (let i = 0; i < 3; i++) assert.equal((await one.reserve('window@example.test')).allowed, true);
    await pool.query("UPDATE auth.otp_send_reservations SET reserved_at=clock_timestamp()-interval '23 hours 59 minutes'");
    const day = await one.reserve('window@example.test');
    assert.equal(day.allowed, false);
    if (!day.allowed) assert.equal(day.dimension, 'recipient_day');
    await pool.query("UPDATE auth.otp_send_reservations SET reserved_at=clock_timestamp()-interval '24 hours 1 second'");
    assert.equal((await one.reserve('window@example.test')).allowed, true, 'outside_day');
    await pool.query('DELETE FROM auth."rateLimit"');
    assert.equal(await two.remaining(), 9, 'better_auth_pruning_does_not_reset_budget');
    await pool.query("UPDATE auth.otp_send_reservations SET reserved_at=clock_timestamp()-interval '49 hours'");
    await one.reserve('new@example.test');
    assert.equal((await pool.query<{ n: number }>('SELECT count(*)::int AS n FROM auth.otp_send_reservations')).rows[0]?.n, 1, 'own_retention_only');
  });
  await t.test('concurrent global budget is shared across recipients and restarted store', async () => {
    await pool.query('TRUNCATE auth.otp_send_reservations');
    const outcomes = await Promise.all(Array.from({ length: 40 }, (_, i) =>
      (i % 2 === 0 ? one : two).reserve(`recipient${i}@example.test`)));
    assert.equal(outcomes.filter((r) => r.allowed).length, 10);
    assert.equal(await new PostgresOtpSendQuota(writer2, key, limits).remaining(), 0);
    const no = await one.reserve('extra@example.test');
    assert.equal(no.allowed, false);
    if (!no.allowed) assert.equal(no.dimension, 'global_day');
  });
  await t.test('lock timeout, deferred commit error, missing privilege and reader role fail closed', async () => {
    await pool.query('TRUNCATE auth.otp_send_reservations');
    const lock = await pool.connect();
    try {
      await lock.query('BEGIN');
      await lock.query('SELECT pg_advisory_xact_lock(20261015,301)');
      await assert.rejects(one.reserve('lock@example.test'), { message: 'otp_send_storage_unavailable' });
    } finally { await lock.query('ROLLBACK'); lock.release(); }
    await pool.query(`CREATE FUNCTION auth.p3d_commit_fail() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'SECRET_COMMIT_SENTINEL'; END $$;
      CREATE CONSTRAINT TRIGGER p3d_commit_fail AFTER INSERT ON auth.otp_send_reservations
      DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION auth.p3d_commit_fail()`);
    await assert.rejects(one.reserve('commit@example.test'), { message: 'otp_send_storage_unavailable' });
    await pool.query('DROP TRIGGER p3d_commit_fail ON auth.otp_send_reservations; DROP FUNCTION auth.p3d_commit_fail()');
    assert.equal(await one.remaining(), 10, 'uncommitted_reservation_not_visible');
    await pool.query('REVOKE INSERT ON auth.otp_send_reservations FROM wepuu_account_auth_writer');
    try {
      await assert.rejects(one.reserve('denied@example.test'), { message: 'otp_send_storage_unavailable' });
      await assert.rejects(one.remaining(), { message: 'otp_send_storage_unavailable' });
    }
    finally { await pool.query('GRANT INSERT ON auth.otp_send_reservations TO wepuu_account_auth_writer'); }
    await assert.rejects(database.withAccountAuthReader((client) => client.query('SELECT * FROM auth.otp_send_reservations')),
      (error: unknown) => typeof error === 'object' && error !== null && 'code' in error && error.code === '42501');
  });
});

test('P3-D real Better Auth handler preserves OTP on blocked resend, observes outcomes and protects metrics', {
  skip: p3dDatabaseUrl === undefined, timeout: 90_000
}, async (t) => {
  const { database, pool, databaseUrl, cleanup } = await p3dFixture(t, true);
  const issuer = 'https://p3d.example.test';
  const secrets = [{ version: 1, value: randomBytes(48).toString('base64url') }];
  const key = randomBytes(32);
  const metrics = new ContentFreeMetrics();
  const events: OtpSendEvent[] = [];
  let sends = 0;
  let otp = '';
  const auth = createAccountAuth({ databaseUrl, publicOrigin: issuer, applicationName: 'p3d-http', secrets,
    databaseRole: 'wepuu_account_auth_writer',
    otpSendProtection: { key, limits: { recipientHourlyMax: 1, recipientDailyMax: 2, globalDailyMax: 10 } },
    otpSendObserver(event) { events.push(event); metrics.recordOtp(event); },
    emailSender: { async send(input) {
      sends++; otp = input.otp;
      assert.equal(typeof input.idempotencyKey === 'string', true, 'provider_idempotency_key');
      return input.email.startsWith('reject') ? 'rejected' : input.email.startsWith('unknown') ? 'unknown' : 'accepted';
    } }
  });
  cleanup(() => auth.close());
  let requestId = 0;
  const send = (email: string, ip: string, accountAuth = auth) => accountAuth.handle(new Request(`${issuer}/api/auth/email-otp/send-verification-otp`, {
    method: 'POST', headers: { origin: issuer, 'content-type': 'application/json',
      [ACCOUNT_AUTH_CLIENT_IP_HEADER]: ip, [ACCOUNT_AUTH_DELIVERY_ID_HEADER]: `delivery_P3D_${String(++requestId).padStart(12, '0')}` },
    body: JSON.stringify({ email, type: 'sign-in' })
  }));
  assert.equal((await send('first@example.test', '192.0.2.1')).status, 200);
  const firstOtp = otp;
  const fingerprint = async () => JSON.stringify((await pool.query('SELECT identifier,value,"expiresAt" FROM auth.verification ORDER BY id')).rows);
  const before = await fingerprint();
  assert.equal((await send('first@example.test', '192.0.2.1')).status, 429, 'built_in_ip_limit');
  const limited = await send(' FIRST@example.test ', '192.0.2.2');
  assert.equal(limited.status, 429, 'normalized_recipient_across_ip');
  assert.equal(Number(limited.headers.get('retry-after')) > 3500, true);
  assert.equal(await fingerprint() === before, true, 'blocked_resend_did_not_rotate_otp');
  const disabled = createAccountAuth({ databaseUrl, publicOrigin: issuer, applicationName: 'p3d-disabled', secrets,
    otpSendProtection: { key, enabled: false }, emailSender: { async send() { throw new Error('SECRET_UNEXPECTED_SEND'); } } });
  cleanup(() => disabled.close());
  assert.equal((await send('first@example.test', '192.0.2.3', disabled)).status, 503);
  assert.equal(await fingerprint() === before, true, 'disabled_send_preserves_otp');
  const broken = createAccountAuth({ databaseUrl, publicOrigin: issuer, applicationName: 'p3d-broken', secrets,
    otpSendQuota: { async reserve() { throw new Error('SECRET_STORAGE_SENTINEL'); },
      async claim() { return false; }, async finish() {}, async remaining() { throw new Error('SECRET_STORAGE_SENTINEL'); } },
    emailSender: { async send() { throw new Error('SECRET_UNEXPECTED_SEND'); } } });
  cleanup(() => broken.close());
  const failed = await send('first@example.test', '192.0.2.4', broken);
  assert.equal(failed.status, 503);
  assert.equal((await failed.text()).includes('SECRET_'), false);
  assert.equal(await fingerprint() === before, true, 'storage_failure_preserves_otp');
  assert.equal(sends, 1);
  const login = await auth.handle(new Request(`${issuer}/api/auth/sign-in/email-otp`, {
    method: 'POST', headers: { origin: issuer, 'content-type': 'application/json', [ACCOUNT_AUTH_CLIENT_IP_HEADER]: '192.0.2.5' },
    body: JSON.stringify({ email: 'first@example.test', otp: firstOtp })
  }));
  assert.equal(login.status, 200, 'previous_otp_still_verifies');
  assert.equal(login.headers.getSetCookie().some((cookie) => cookie.startsWith('__Host-wepuu_session=')), true);
  // The official internal handler can acknowledge a callback rejection; the
  // public Control form uses the private outcome channel to return 503.
  assert.equal((await send('reject@example.test', '192.0.2.6')).status, 200);
  assert.equal(auth.takeDeliveryOutcome(`delivery_P3D_${String(requestId).padStart(12, '0')}`), 'rejected');
  assert.equal((await send('unknown@example.test', '192.0.2.7')).status, 200);
  assert.equal(sends, 3);
  const outcomes = await pool.query<{ outcome: string }>('SELECT outcome FROM auth.otp_send_reservations ORDER BY reserved_at');
  assert.deepEqual(outcomes.rows.map((row) => row.outcome), ['accepted', 'rejected', 'unknown']);
  assert.equal(events.some((event) => event.kind === 'limited' && event.dimension === 'ip'), true);
  assert.equal(events.some((event) => event.kind === 'limited' && event.dimension === 'recipient_hour'), true);
  assert.equal(await auth.otpBudgetRemaining?.(), 7);
  const app = buildControlApi({ identityProvider: { async authenticate() { return undefined; } },
    store: new PostgresControlStore(database), audit: new PostgresSecurityAuditSink(database), accountAuth: auth,
    loginTransactions: new PostgresAccountLoginTransactionStore(database), publicOrigin: issuer,
    operationsMetricsToken: 'p3d-test-only-metrics-token-00000000000', metrics });
  cleanup(() => app.close());
  assert.equal((await app.inject({ method: 'GET', url: '/internal/metrics' })).statusCode, 404);
  const report = await app.inject({ method: 'GET', url: '/internal/metrics', headers: { authorization: 'Bearer p3d-test-only-metrics-token-00000000000' } });
  assert.equal(report.statusCode, 200);
  assert.equal(report.body.includes('wepuu_otp_budget_remaining 7'), true);
  assert.equal(report.body.includes('wepuu_otp_send_attempt_total 3'), true);
  for (const secret of ['first@example.test', firstOtp, 'SECRET_', ...outcomes.rows.map(() => key.toString('base64url'))]) {
    assert.equal(report.body.includes(secret), false, 'metrics_are_content_free');
  }
  const loginPage = await app.inject({ method: 'GET', url: '/v1/account/login' });
  const csrf = /name="csrf" value="([A-Za-z0-9_-]{43})"/u.exec(loginPage.body)?.[1];
  const transaction = /name="transaction" value="([A-Za-z0-9_-]{43})"/u.exec(loginPage.body)?.[1];
  assert.ok(csrf && transaction);
  const limitedPage = await app.inject({ method: 'POST', url: '/v1/account/email/resend',
    headers: { origin: issuer, cookie: `__Host-wepuu_csrf=${csrf}`, 'content-type': 'application/x-www-form-urlencoded' },
    payload: new URLSearchParams({ csrf, transaction, email: 'first@example.test' }).toString() });
  assert.equal(limitedPage.statusCode, 429, 'control_translates_quota_limit');
  assert.equal(Number(limitedPage.headers['retry-after']) > 0, true);
  assert.equal(limitedPage.body.includes('/v1/account/email/verify'), true, 'verification_form_remains_available');
  assert.equal(limitedPage.body.includes('recipient_hour'), false, 'internal_quota_reason_not_public');
  const unavailable = buildControlApi({ identityProvider: { async authenticate() { return undefined; } },
    store: new PostgresControlStore(database), audit: new PostgresSecurityAuditSink(database), accountAuth: broken,
    publicOrigin: issuer, operationsMetricsToken: 'p3d-test-only-metrics-token-00000000000' });
  cleanup(() => unavailable.close());
  const absent = await unavailable.inject({ method: 'GET', url: '/internal/metrics', headers: { authorization: 'Bearer p3d-test-only-metrics-token-00000000000' } });
  assert.equal(absent.statusCode, 503);
  assert.equal(absent.body.includes('wepuu_otp_budget_remaining'), false, 'no_fabricated_gauge');
  for (const [guardedAuth, remoteAddress] of [[disabled, '192.0.2.201'], [broken, '192.0.2.202']] as const) {
    const guarded = buildControlApi({ identityProvider: { async authenticate() { return undefined; } },
      store: new PostgresControlStore(database), audit: new PostgresSecurityAuditSink(database), accountAuth: guardedAuth,
      loginTransactions: new PostgresAccountLoginTransactionStore(database), publicOrigin: issuer });
    cleanup(() => guarded.close());
    const page = await guarded.inject({ method: 'GET', url: '/v1/account/login', remoteAddress });
    const formCsrf = /name="csrf" value="([A-Za-z0-9_-]{43})"/u.exec(page.body)?.[1];
    const formTransaction = /name="transaction" value="([A-Za-z0-9_-]{43})"/u.exec(page.body)?.[1];
    assert.ok(formCsrf && formTransaction);
    const denied = await guarded.inject({ method: 'POST', url: '/v1/account/email/send', remoteAddress,
      headers: { origin: issuer, cookie: `__Host-wepuu_csrf=${formCsrf}`, 'content-type': 'application/x-www-form-urlencoded' },
      payload: new URLSearchParams({ csrf: formCsrf, transaction: formTransaction, email: 'first@example.test' }).toString() });
    assert.equal(denied.statusCode, 503);
    assert.equal(denied.body.includes('/v1/account/email/verify'), true, 'paused_or_unavailable_send_keeps_verification_ui');
    assert.equal(denied.body.includes('SECRET_'), false);
  }
  const quota = new PostgresOtpSendQuota(pool, key, { recipientHourlyMax: 3, recipientDailyMax: 6, globalDailyMax: 10 });
  let retainedSends = 0;
  const retained = createAccountAuth({ databaseUrl, publicOrigin: issuer, applicationName: 'p3d-outcome-write-failed', secrets,
    otpSendQuota: { reserve: (email) => quota.reserve(email), claim: (id) => quota.claim(id),
      async finish() { throw new Error('SECRET_OUTCOME_SENTINEL'); }, remaining: () => quota.remaining() },
    otpSendObserver() { throw new Error('SECRET_METRICS_SENTINEL'); },
    emailSender: { async send() { retainedSends++; return 'accepted'; } } });
  cleanup(() => retained.close());
  assert.equal((await send('retained@example.test', '192.0.2.8', retained)).status, 200, 'known_accepted_not_rewritten_on_persistence_failure');
  assert.equal(retainedSends, 1, 'no_retry_on_observer_or_outcome_failure');
  assert.equal(await quota.remaining(), 6, 'unresolved_result_remains_charged');
  for (const [email, remoteAddress, expectedStatus] of [
    ['rejectui@example.test', '192.0.2.100', 503], ['unknownui@example.test', '192.0.2.101', 202]
  ] as const) {
    const page = await app.inject({ method: 'GET', url: '/v1/account/login', remoteAddress });
    const formCsrf = /name="csrf" value="([A-Za-z0-9_-]{43})"/u.exec(page.body)?.[1];
    const formTransaction = /name="transaction" value="([A-Za-z0-9_-]{43})"/u.exec(page.body)?.[1];
    assert.ok(formCsrf && formTransaction);
    const result = await app.inject({ method: 'POST', url: '/v1/account/email/send', remoteAddress,
      headers: { origin: issuer, cookie: `__Host-wepuu_csrf=${formCsrf}`, 'content-type': 'application/x-www-form-urlencoded' },
      payload: new URLSearchParams({ csrf: formCsrf, transaction: formTransaction, email }).toString() });
    assert.equal(result.statusCode, expectedStatus, 'public_delivery_status');
    assert.equal(result.body.includes('SECRET_'), false);
  }
  assert.equal(sends, 5, 'public_forms_send_once_each');
  assert.equal(await quota.remaining(), 4, 'public_unknown_and_rejection_charged');
});
