import assert from 'node:assert/strict';
import { generateKeyPairSync, verify } from 'node:crypto';
import { chmod, mkdtemp, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { decodeProtectedHeader, jwtVerify } from 'jose';
import {
  KeyCustodyUnavailableError,
  LocalPkcs8KeyCustody,
  localPkcs8KeyCustodyFromEnvironment,
  signingKeyDescriptorFromPublicJwk
} from '../src/index.js';

async function fixture(modulusLength = 3072): Promise<{ directory: string; key: string; passphrase: string }> {
  const directory = await mkdtemp(join(tmpdir(), 'wepuu-key-'));
  const key = join(directory, 'key.pem');
  const passphrase = join(directory, 'passphrase');
  const secret = 'test-passphrase-at-least-16-bytes';
  const pair = generateKeyPairSync('rsa', { modulusLength });
  await writeFile(key, pair.privateKey.export({ format: 'pem', type: 'pkcs8', cipher: 'aes-256-cbc', passphrase: secret }), { mode: 0o600 });
  await writeFile(passphrase, secret, { mode: 0o600 });
  return { directory, key, passphrase };
}

test('local PKCS8 custody derives RFC 7638 kid and signs RS256 without exposing private JWK', async () => {
  const files = await fixture();
  const custody = await LocalPkcs8KeyCustody.load({ privateKeyFile: files.key, passphraseFile: files.passphrase });
  const descriptor = await custody.describeSigningKey();
  const input = Buffer.from('protected.payload');
  assert.equal(verify('RSA-SHA256', input, descriptor.publicKey, await custody.sign(input)), true);
  assert.match(descriptor.kid, /^[A-Za-z0-9_-]{43}$/u);
  for (const member of ['d', 'p', 'q', 'dp', 'dq', 'qi']) assert.equal(descriptor.publicJwk[member], undefined);
  const token = await custody.consentRequestSigner().sign({ kind: 'consent_request', iss: 'https://auth.example.test' });
  assert.deepEqual(decodeProtectedHeader(token), {
    alg: 'RS256', typ: 'wepuu-consent-request+jwt', kid: descriptor.kid
  });
  assert.equal((await jwtVerify(token, descriptor.publicKey, { algorithms: ['RS256'] })).payload['kind'], 'consent_request');
});

test('local PKCS8 custody rejects weak keys, wrong passphrases, symlinks and kid mismatches', async () => {
  const weak = await fixture(2048);
  await assert.rejects(LocalPkcs8KeyCustody.load({ privateKeyFile: weak.key, passphraseFile: weak.passphrase }), KeyCustodyUnavailableError);
  const files = await fixture();
  const wrong = join(files.directory, 'wrong');
  await writeFile(wrong, 'incorrect-passphrase-value', { mode: 0o600 });
  await assert.rejects(LocalPkcs8KeyCustody.load({ privateKeyFile: files.key, passphraseFile: wrong }), KeyCustodyUnavailableError);
  await assert.rejects(LocalPkcs8KeyCustody.load({ privateKeyFile: files.key, passphraseFile: files.passphrase, expectedKid: 'wrong_kid' }), KeyCustodyUnavailableError);
  const unencrypted = join(files.directory, 'unencrypted.pem');
  const plain = generateKeyPairSync('rsa', { modulusLength: 3072 }).privateKey.export({ format: 'pem', type: 'pkcs8' });
  await writeFile(unencrypted, plain, { mode: 0o600 });
  await assert.rejects(LocalPkcs8KeyCustody.load({ privateKeyFile: unencrypted, passphraseFile: files.passphrase }), KeyCustodyUnavailableError);
  if (process.platform !== 'win32') {
    const link = join(files.directory, 'key-link.pem');
    await symlink(files.key, link);
    await assert.rejects(LocalPkcs8KeyCustody.load({ privateKeyFile: link, passphraseFile: files.passphrase }), KeyCustodyUnavailableError);
  }
});

test('production custody rejects group-readable secret files', async () => {
  if (process.platform === 'win32') return;
  const files = await fixture();
  await chmod(files.key, 0o640);
  await assert.rejects(LocalPkcs8KeyCustody.load({
    privateKeyFile: files.key, passphraseFile: files.passphrase, production: true
  }), KeyCustodyUnavailableError);
});

test('keyring resolves a logical slot and public-only descriptors accept no private members', async () => {
  const files = await fixture();
  const keyring = join(files.directory, 'keyring.json');
  await writeFile(keyring, JSON.stringify({ keys: [{ slot: 'primary', privateKeyFile: files.key, passphraseFile: files.passphrase }] }), { mode: 0o600 });
  const custody = await localPkcs8KeyCustodyFromEnvironment({ WEPUU_SIGNING_KEYRING_FILE: keyring }, 'primary');
  const descriptor = await custody.describeSigningKey();
  assert.equal((await signingKeyDescriptorFromPublicJwk(descriptor.publicJwk)).kid, descriptor.kid);
  await assert.rejects(signingKeyDescriptorFromPublicJwk({ ...descriptor.publicJwk, d: 'secret' }), KeyCustodyUnavailableError);
  assert.equal((await signingKeyDescriptorFromPublicJwk({ ...descriptor.publicJwk, kid: 'legacy-kms-key' }, false)).kid, 'legacy-kms-key');
});

test('revocation signer preserves the exact RS256 content-free profile', async () => {
  const files = await fixture();
  const custody = await LocalPkcs8KeyCustody.load({ privateKeyFile: files.key, passphraseFile: files.passphrase });
  const descriptor = await custody.describeSigningKey();
  const now = new Date('2026-10-08T00:00:00Z');
  const token = await custody.revocationEventSigner().sign({
    issuer: 'https://auth.example.test', resource: 'https://site.example.test/wp-json/wp-auto/mcp',
    tenantId: '11111111-1111-4111-8111-111111111111', siteId: 'site_12345678', sequence: 1,
    eventType: 'grant', grantId: 'grant_12345678', reason: 'grant_revoked'
  }, now);
  assert.equal(decodeProtectedHeader(token).typ, 'wepuu-revocation+jwt');
  const verified = await jwtVerify(token, descriptor.publicKey, {
    algorithms: ['RS256'], issuer: 'https://auth.example.test',
    audience: 'https://site.example.test/wp-json/wp-auto/mcp', currentDate: now
  });
  assert.equal(verified.payload['kind'], 'revocation');
});
