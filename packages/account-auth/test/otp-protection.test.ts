import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { accountAuthFromEnvironment, DEFAULT_OTP_SEND_LIMITS, validateOtpSendLimits } from '../src/index.js';

test('OTP limits have explicit bounds and daily quota cannot be below hourly quota', () => {
  assert.deepEqual(validateOtpSendLimits(DEFAULT_OTP_SEND_LIMITS), { recipientHourlyMax: 3, recipientDailyMax: 6, globalDailyMax: 100 });
  for (const limits of [
    { recipientHourlyMax: 0, recipientDailyMax: 6, globalDailyMax: 100 },
    { recipientHourlyMax: 21, recipientDailyMax: 21, globalDailyMax: 100 },
    { recipientHourlyMax: 3, recipientDailyMax: 2, globalDailyMax: 100 },
    { recipientHourlyMax: 3, recipientDailyMax: 101, globalDailyMax: 100 },
    { recipientHourlyMax: 3, recipientDailyMax: 6, globalDailyMax: 10_001 },
    { recipientHourlyMax: 3, recipientDailyMax: 6, globalDailyMax: Number.NaN }
  ]) assert.throws(() => validateOtpSendLimits(limits), { message: 'otp_send_limits_invalid' });
});

test('runtime writer requires protected quota key and bounded config; reader needs no send secret', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'wepuu-otp-config-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const secretsFile = join(directory, 'auth.json');
  const keyFile = join(directory, 'quota.secret');
  await writeFile(secretsFile, JSON.stringify({ secrets: [{ version: 1, value: randomBytes(48).toString('base64url') }] }));
  await writeFile(keyFile, randomBytes(32).toString('base64url'));
  const env = { NODE_ENV: 'test', WEPUU_DATABASE_URL: 'postgresql://unused:unused@127.0.0.1:1/unused',
    WEPUU_CONTROL_PUBLIC_ORIGIN: 'https://config.example.test', WEPUU_ACCOUNT_AUTH_SECRETS_FILE: secretsFile };
  const writer = { applicationName: 'otp-config-test', databaseRole: 'wepuu_account_auth_writer' as const };
  await assert.rejects(accountAuthFromEnvironment(env, writer), { message: 'otp_send_key_file_required' });
  await assert.rejects(accountAuthFromEnvironment({ ...env, WEPUU_EMAIL_OTP_LIMIT_HMAC_KEY_FILE: keyFile,
    WEPUU_EMAIL_OTP_GLOBAL_DAILY_MAX: '0' }, writer), { message: 'WEPUU_EMAIL_OTP_GLOBAL_DAILY_MAX_invalid' });
  await assert.rejects(accountAuthFromEnvironment({ ...env, WEPUU_EMAIL_OTP_LIMIT_HMAC_KEY_FILE: keyFile,
    WEPUU_EMAIL_OTP_SEND_ENABLED: 'yes' }, writer), { message: 'otp_send_enabled_invalid' });
  await writeFile(keyFile, 'SECRET_BAD_KEY_SENTINEL');
  await assert.rejects(accountAuthFromEnvironment({ ...env, WEPUU_EMAIL_OTP_LIMIT_HMAC_KEY_FILE: keyFile }, writer), { message: 'otp_send_key_invalid' });
  const reader = await accountAuthFromEnvironment(env, { applicationName: 'otp-reader-test', databaseRole: 'wepuu_account_auth_reader' });
  assert.equal('otpBudgetRemaining' in reader, false);
  await reader.close();
});

test('pinned Resend SDK classifies responses and uses idempotency without raw production logs or retries', () => {
  // A production-mode child exercises the actual SDK's logging behavior. Its
  // fetch replacement is unconditional, so even unexpected requests cannot escape.
  const source = `
    import { ResendOtpEmailSender } from './packages/account-auth/src/index.ts';
    const sentinel = 'SECRET_RESEND_SENTINEL';
    const cases = [
      { status: 200, body: { id: 'mock-id' } },
      { status: 200, body: { id: '' } },
      { status: 422, body: { name: 'validation_error', statusCode: 422, message: sentinel } },
      { status: 429, body: { name: 'rate_limit_exceeded', statusCode: 429, message: sentinel } },
      { status: 500, body: { name: 'application_error', statusCode: 500, message: sentinel } },
      { status: 200, body: {} },
      { throw: true }
    ];
    let calls = 0;
    globalThis.fetch = async (url, options) => {
      if (url !== 'https://api.resend.com/emails') throw new Error(sentinel);
      if (options.headers.get('Idempotency-Key') !== 'test-reservation-id') throw new Error(sentinel);
      if (!(options.signal instanceof AbortSignal)) throw new Error(sentinel);
      const current = cases[calls++];
      if (current.throw) throw new Error(sentinel);
      return new Response(JSON.stringify(current.body), { status: current.status });
    };
    const sender = new ResendOtpEmailSender({ apiKey: 'test-api-key-not-real-0000', from: 'login@example.test' });
    const outcomes = [];
    for (const unused of cases) outcomes.push(await sender.send({ email: 'private@example.test', otp: '123456', idempotencyKey: 'test-reservation-id' }));
    process.stdout.write(JSON.stringify({ outcomes, calls }));
  `;
  const child = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', source], {
    cwd: process.cwd(), env: { ...process.env, NODE_ENV: 'production', RESEND_BASE_URL: 'https://api.resend.com' },
    encoding: 'utf8', timeout: 30_000
  });
  assert.equal(child.status, 0, 'isolated_sdk_child_success');
  assert.equal(child.stderr, '', 'no_raw_sdk_error_output');
  const result = JSON.parse(child.stdout) as { outcomes: string[]; calls: number };
  assert.deepEqual(result.outcomes, ['accepted', 'unknown', 'rejected', 'rejected', 'unknown', 'unknown', 'unknown']);
  assert.equal(result.calls, 7, 'one_call_per_send_no_retry');
  for (const secret of ['SECRET_', 'private@example.test', '123456', 'test-api-key']) {
    assert.equal((child.stdout + child.stderr).includes(secret), false, 'no_secret_output');
  }
});
