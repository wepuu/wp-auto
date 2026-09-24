import assert from 'node:assert/strict';
import test from 'node:test';
import { CompactSign, exportJWK, generateKeyPair } from 'jose';
import {
  HttpsSiteVerificationClient,
  GrantService,
  PairingService,
  canonicalizeResource,
  createPinnedAddressLookup,
  isPublicAddress,
  secretHash,
  verifySiteProof,
  type PairingAttemptRecord,
  type PairingRepository,
  type GrantRepository,
  type PendingGrantRecord,
  type SiteProofResponse,
  type VerifiedSiteProof
} from '../src/index.js';

const now = new Date('2026-09-22T00:00:00.000Z');
const tenantId = '11111111-1111-4111-8111-111111111111';
const resource = canonicalizeResource('https://site.example.test/wp-json/wp-auto/mcp');
const platformSigningKeyPem = '-----BEGIN PUBLIC KEY-----\nQUJD\n-----END PUBLIC KEY-----\n';
const platformSigningKeySha256 = 'WH-y9qoJvhltMGeuZ5urj2--GkBrSPXQU6VAtE5tZp4';
const platformSigningKid = 'kms-key-0001';

async function signedProof(overrides: Record<string, unknown> = {}): Promise<SiteProofResponse> {
  const { privateKey, publicKey } = await generateKeyPair('EdDSA', { crv: 'Ed25519' });
  const publicJwk = { ...(await exportJWK(publicKey)), kid: 'site-key-0001', alg: 'EdDSA', use: 'sig' };
  const claims = {
    kind: 'pairing',
    protocol_version: '1',
    iss: 'site.example.test',
    platform_issuer: 'https://auth.example.test',
    tenant_id: tenantId,
    pairing_attempt_id: 'attempt_00000001',
    site_id: 'site_00000001',
    platform_signing_key_sha256: platformSigningKeySha256,
    platform_signing_kid: platformSigningKid,
    resource,
    challenge: 'challenge_00000000000000000000000',
    iat: Math.floor(now.getTime() / 1_000),
    exp: Math.floor(now.getTime() / 1_000) + 60,
    ...overrides
  };
  const proof = await new CompactSign(Buffer.from(JSON.stringify(claims)))
    .setProtectedHeader({ alg: 'EdDSA', typ: 'wepuu-site-proof+jwt', kid: publicJwk.kid })
    .sign(privateKey);
  return { proof, publicJwk };
}

test('canonical resource rejects credentials, query, fragment, port and trailing slash variants', () => {
  assert.equal(canonicalizeResource('https://SITE.example.test/wp-json/wp-auto/mcp'), resource);
  for (const value of [
    'http://site.example.test/wp-json/wp-auto/mcp',
    'https://user@site.example.test/wp-json/wp-auto/mcp',
    'https://site.example.test:8443/wp-json/wp-auto/mcp',
    'https://site.example.test/wp-json/wp-auto/mcp?x=1',
    'https://site.example.test/wp-json/wp-auto/mcp#x',
    'https://site.example.test/wp-json/wp-auto/mcp/'
  ]) assert.throws(() => canonicalizeResource(value));
});

test('SSRF policy rejects local, private, link-local, documentation and mapped addresses', () => {
  for (const address of ['127.0.0.1', '10.0.0.1', '169.254.169.254', '192.168.1.1', '::1', 'fc00::1', 'fe80::1', '::ffff:127.0.0.1', '192.0.2.1']) {
    assert.equal(isPublicAddress(address), false, address);
  }
  assert.equal(isPublicAddress('8.8.8.8'), true);
  assert.equal(isPublicAddress('2606:4700:4700::1111'), true);
});

test('pinned lookup returns the Node 26 all-address shape without changing the pinned IP', async () => {
  const lookup = createPinnedAddressLookup('8.8.8.8');
  const single = await new Promise<{ address: string | object[]; family?: number }>((resolve, reject) => {
    lookup('site.example.test', { all: false }, (error, address, family) => {
      if (error !== null) reject(error);
      else resolve({ address, family });
    });
  });
  assert.deepEqual(single, { address: '8.8.8.8', family: 4 });

  const all = await new Promise<string | object[]>((resolve, reject) => {
    lookup('site.example.test', { all: true }, (error, address) => {
      if (error !== null) reject(error);
      else resolve(address);
    });
  });
  assert.deepEqual(all, [{ address: '8.8.8.8', family: 4 }]);
  assert.throws(() => createPinnedAddressLookup('not-an-ip'), /pinned_address_invalid/u);
});

test('site proof binds algorithm, type, issuer, tenant, resource, challenge and lifetime', async () => {
  const response = await signedProof();
  const verified = await verifySiteProof(response.proof, response.publicJwk, {
    kind: 'pairing',
    platformIssuer: 'https://auth.example.test',
    tenantId,
    resource,
    challenge: 'challenge_00000000000000000000000',
    pairingAttemptId: 'attempt_00000001',
    siteId: 'site_00000001',
    platformSigningKeySha256,
    platformSigningKid,
    now
  });
  assert.equal(verified.claims.resource, resource);
  await assert.rejects(verifySiteProof(response.proof, response.publicJwk, {
    kind: 'pairing',
    platformIssuer: 'https://evil.example.test',
    tenantId,
    resource,
    challenge: 'challenge_00000000000000000000000',
    pairingAttemptId: 'attempt_00000001', platformSigningKid,
    now
  }), /issuer_mismatch/u);
  const expired = await signedProof({ exp: Math.floor(now.getTime() / 1_000) - 1 });
  await assert.rejects(verifySiteProof(expired.proof, expired.publicJwk, {
    kind: 'pairing', platformIssuer: 'https://auth.example.test', tenantId, resource,
    challenge: 'challenge_00000000000000000000000', pairingAttemptId: 'attempt_00000001', platformSigningKid, now
  }), /proof_time_invalid/u);
});

test('HTTPS verifier pins a prevalidated public address and fixed proof path', async () => {
  const issuedAt = Math.floor(Date.now() / 1_000);
  const response = await signedProof({ iat: issuedAt, exp: issuedAt + 60 });
  let observedPath = '';
  let observedAddress = '';
  let observedBody: Record<string, unknown> = {};
  const verifier = new HttpsSiteVerificationClient({
    resolve: async () => ['8.8.8.8'],
    request: async (url, body, address) => {
      observedPath = url.pathname;
      observedAddress = address;
      observedBody = JSON.parse(Buffer.from(body).toString('utf8')) as Record<string, unknown>;
      return response;
    }
  });
  await verifier.verify({
    resource,
    platformIssuer: 'https://auth.example.test',
    tenantId,
    pairingAttemptId: 'attempt_00000001',
    siteId: 'site_00000001',
    platformSigningKeyPem,
    platformSigningKid,
    verifier: 'v'.repeat(43),
    challenge: 'challenge_00000000000000000000000'
  });
  assert.equal(observedPath, '/wp-json/wp-auto/v1/pairing/proof');
  assert.equal(observedAddress, '8.8.8.8');
  assert.equal(observedBody['tenant_id'], tenantId);
  assert.equal(observedBody['site_id'], 'site_00000001');
  assert.equal(observedBody['platform_signing_key_pem'], platformSigningKeyPem);
  assert.equal(observedBody['platform_signing_kid'], platformSigningKid);
});

test('pairing attempt stores only a verifier hash and permits one completion', async () => {
  let record: PairingAttemptRecord | undefined;
  let completed = false;
  const repository: PairingRepository = {
    async createAttempt(input) { record = input; },
    async findAttemptForUpdate() { return record; },
    async markVerifying() {
      if (record?.status !== 'pending') return false;
      record = { ...record, status: 'verifying' };
      return true;
    },
    async fail() {},
    async complete() { completed = true; }
  };
  const expectedProof = { claims: { resource }, publicJwk: {}, thumbprint: 'thumbprint' } as unknown as VerifiedSiteProof;
  const service = new PairingService({
    repository,
    verifier: { verify: async () => expectedProof },
    platformIssuer: 'https://auth.example.test',
    platformSigningKeyPem,
    platformSigningKid,
    now: () => now
  });
  const verifier = 'v'.repeat(43);
  await service.begin({
    tenantId, attemptId: 'attempt_00000001', accountId: 'account_00000001',
    correlationId: 'correlation_00000001', resource, verifier
  });
  assert.deepEqual(record?.verifierHash, secretHash(verifier));
  assert.equal(JSON.stringify(record).includes(verifier), false);
  await service.verify({
    tenantId, attemptId: 'attempt_00000001', verifier,
    siteId: 'site_00000001', idempotencyKey: 'idempotency_0000000001'
  });
  assert.equal(completed, true);
  await assert.rejects(service.verify({
    tenantId, attemptId: 'attempt_00000001', verifier,
    siteId: 'site_00000001', idempotencyKey: 'idempotency_0000000001'
  }), /pairing_replay/u);
});

test('grant consent binds site, subject, client, scopes, challenge and activates once', async () => {
  let pending: PendingGrantRecord | undefined;
  let signedRequest: Readonly<Record<string, unknown>> | undefined;
  let createdGrant: { id: string; createdAt: Date; expiresAt: Date } | undefined;
  let activations = 0;
  const repository: GrantRepository = {
    async createPending(record) {
      if (createdGrant !== undefined) return createdGrant;
      pending = { ...record, publicJwk: {} as never, status: 'pending' };
      createdGrant = { id: record.id, createdAt: record.createdAt, expiresAt: record.expiresAt };
      return createdGrant;
    },
    async findPending() { return pending; },
    async activate() { activations += 1; pending = undefined; },
    async deny() { pending = undefined; },
    async revoke() { return true; }
  };
  const service = new GrantService({
    repository,
    signer: { sign(payload) { signedRequest = payload; return Promise.resolve('signed.consent.request'); } },
    platformIssuer: 'https://auth.example.test',
    now: () => now,
    challengeFactory: () => 'c'.repeat(43)
  });
  const started = await service.begin({
    tenantId, grantId: 'grant_00000001', siteId: 'site_00000001', subjectId: 'account_00000001',
    clientId: 'client_00000001', scopes: ['mcp:read', 'mcp:content.write'], resource, consentVersion: '1',
    idempotencyKey: 'idempotency_0000000000'
  });
  assert.equal(started.request, 'signed.consent.request');
  assert.equal(signedRequest?.['challenge'], started.challenge);
  assert.deepEqual(pending?.challengeHash, secretHash(started.challenge));
  const replayed = await service.begin({
    tenantId, grantId: 'grant_ignored0001', siteId: 'site_00000001', subjectId: 'account_00000001',
    clientId: 'client_00000001', scopes: ['mcp:read', 'mcp:content.write'], resource, consentVersion: '1',
    idempotencyKey: 'idempotency_0000000000'
  });
  assert.equal(replayed.grantId, 'grant_00000001');
  assert.equal(replayed.challenge, started.challenge);
  assert.equal(replayed.expiresAt.toISOString(), started.expiresAt.toISOString());

  const response = await signedProof({
    kind: 'consent', pairing_attempt_id: undefined, platform_signing_key_sha256: undefined,
    platform_signing_kid: undefined, aud: resource, decision: 'approved',
    grant_id: 'grant_00000001',
    subject_id: 'account_00000001', client_id: 'client_00000001',
    scope: ['mcp:read', 'mcp:content.write'], challenge: started.challenge
  });
  assert.ok(pending);
  pending = { ...pending, publicJwk: response.publicJwk };
  await service.complete({
    tenantId, grantId: 'grant_00000001', proof: response.proof, challenge: started.challenge,
    decision: 'approved',
    idempotencyKey: 'idempotency_0000000002'
  });
  assert.equal(activations, 1);

  await assert.rejects(service.complete({
    tenantId, grantId: 'grant_00000001', proof: response.proof, challenge: started.challenge,
    decision: 'approved',
    idempotencyKey: 'idempotency_0000000002'
  }), /grant_not_pending/u);
});
