import assert from 'node:assert/strict';
import { chmod, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { getCookies } from 'better-auth/cookies';
import {
  ACCOUNT_AUTH_SESSION_COOKIE,
  ACCOUNT_AUTH_SESSION_TTL_SECONDS,
  accountAuthSecurityOptions,
  loadAccountAuthSecrets
} from '../src/index.js';

test('security options produce one exact __Host session cookie with an absolute lifetime', () => {
  const options = accountAuthSecurityOptions();
  const cookies = getCookies(options);
  assert.equal(cookies.sessionToken.name, ACCOUNT_AUTH_SESSION_COOKIE);
  assert.equal(cookies.sessionToken.attributes.secure, true);
  assert.equal(cookies.sessionToken.attributes.httpOnly, true);
  assert.equal(cookies.sessionToken.attributes.sameSite, 'lax');
  assert.equal(cookies.sessionToken.attributes.path, '/');
  assert.equal(cookies.sessionToken.attributes.domain, undefined);
  assert.equal(cookies.sessionToken.attributes.maxAge, ACCOUNT_AUTH_SESSION_TTL_SECONDS);
  assert.equal(options.session.disableSessionRefresh, true);
  assert.equal(options.session.deferSessionRefresh, true);
  assert.equal(options.session.cookieCache.enabled, false);
  assert.equal(options.account.encryptOAuthTokens, true);
  assert.equal(options.account.accountLinking.disableImplicitLinking, true);
  assert.equal(options.verification.storeIdentifier, 'hashed');
});

test('secret keyring loader rejects symlinks and duplicate versions without disclosing values', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'wepuu-account-auth-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const validPath = join(directory, 'valid.json');
  await writeFile(validPath, JSON.stringify({
    secrets: [
      { version: 1, value: 'a'.repeat(40) },
      { version: 2, value: 'b'.repeat(40) }
    ]
  }), { mode: 0o600 });
  await chmod(validPath, 0o600);
  const secrets = await loadAccountAuthSecrets(validPath);
  assert.deepEqual(secrets.map((secret) => secret.version), [2, 1]);

  const duplicatePath = join(directory, 'duplicate.json');
  await writeFile(duplicatePath, JSON.stringify({
    secrets: [
      { version: 1, value: 'c'.repeat(40) },
      { version: 1, value: 'd'.repeat(40) }
    ]
  }));
  await assert.rejects(loadAccountAuthSecrets(duplicatePath), { message: 'account_auth_secret_version_duplicate' });

  const linkPath = join(directory, 'link.json');
  try {
    await symlink(validPath, linkPath, 'file');
    await assert.rejects(loadAccountAuthSecrets(linkPath), { message: 'account_auth_secret_file_invalid' });
  } catch (error) {
    if (process.platform !== 'win32') throw error;
  }
});
