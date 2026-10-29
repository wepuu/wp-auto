// Fixed-image, network-none probe: actual compiled initializer negatives, no service main or DB connection.
import assert from 'node:assert/strict';
import { mkdir, writeFile, lstat } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { accountAuthFromEnvironment, ResendOtpEmailSender } from '/workspace/packages/account-auth/dist/index.js';
let calls = 0; globalThis.fetch = async () => { calls++; throw Error('NO_NETWORK_ALLOWED'); };
const root = '/private/probe'; await mkdir(root, { mode: 0o700 });
const apiKeyFile = root + '/fake-api-key', quotaFile = root + '/quota';
await writeFile(apiKeyFile, 're_local_synthetic_not_a_real_key_000000000000', { mode: 0o600, flag: 'wx' });
await writeFile(quotaFile, randomBytes(32).toString('base64url'), { mode: 0o600, flag: 'wx' });
for (const f of [apiKeyFile, quotaFile]) { const s = await lstat(f); assert(s.isFile() && !s.isSymbolicLink() && s.uid === process.getuid() && (s.mode & 0o077) === 0); }
const writer = { applicationName: 'r23-config-probe', databaseRole: 'wepuu_account_auth_writer' };
const env = { NODE_ENV: 'production', WEPUU_DATABASE_URL: 'postgresql://fake:fake@127.0.0.1:1/fake', WEPUU_CONTROL_PUBLIC_ORIGIN: 'https://auth.example.test',
 WEPUU_ACCOUNT_AUTH_SECRETS_FILE: root + '/not-read-in-negative-cases', WEPUU_EMAIL_DELIVERY: 'mock', WEPUU_EMAIL_OTP_SEND_ENABLED: 'false' };
await assert.rejects(accountAuthFromEnvironment(env, writer), { message: 'production_email_delivery_required' });
const resend = { ...env, WEPUU_EMAIL_DELIVERY: 'resend', WEPUU_RESEND_API_KEY_FILE: apiKeyFile, WEPUU_RESEND_FROM: 'WePuu Local <login@example.test>' };
await assert.rejects(accountAuthFromEnvironment(resend, writer), { message: 'otp_send_key_file_required' });
await writeFile(quotaFile, 'invalid');
await assert.rejects(accountAuthFromEnvironment({ ...resend, WEPUU_EMAIL_OTP_LIMIT_HMAC_KEY_FILE: quotaFile }, writer), { message: 'otp_send_key_invalid' });
new ResendOtpEmailSender({ apiKey: 're_local_synthetic_not_a_real_key_000000000000', from: 'WePuu Local <login@example.test>' });
assert.equal(calls, 0); assert.equal(process.version, 'v24.22.1'); assert.equal(process.getuid(), 1000);
console.log(JSON.stringify({ passed: true, actualProductionMockRejected: true, actualMissingQuotaRejected: true, actualInvalidQuotaRejected: true,
 constructorFetchCalls: calls, protectedFilesVerified: true, node: process.version, productionAccessed: false, serviceStarted: false }));
