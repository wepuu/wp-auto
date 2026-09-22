import assert from 'node:assert/strict';
import test from 'node:test';
import { CompactSign, exportJWK, generateKeyPair } from 'jose';
import {
  HttpsSiteVerificationClient,
  PairingService,
  canonicalizeResource,
  isPublicAddress,
  secretHash,
  verifySiteProof,
  type PairingAttemptRecord,
  type PairingRepository,
  type SiteProofResponse,
  type VerifiedSiteProof
} from '../src/index.js';

const now = new Date('2026-09-22T00:00:00.000Z');
const tenantId = '11111111-1111-4111-8111-111111111111';
const resource = canonicalizeResource('https://site.example.test/wp-json/wp-auto/mcp');

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

test('site proof binds algorithm, type, issuer, tenant, resource, challenge and lifetime', async () => {
  const response = await signedProof();
  const verified = await verifySiteProof(response.proof, response.publicJwk, {
    kind: 'pairing',
    platformIssuer: 'https://auth.example.test',
    tenantId,
    resource,
    challenge: 'challenge_00000000000000000000000',
    pairingAttemptId: 'attempt_00000001',
    now
  });
  assert.equal(verified.claims.resource, resource);
  await assert.rejects(verifySiteProof(response.proof, response.publicJwk, {
    kind: 'pairing',
    platformIssuer: 'https://evil.example.test',
    tenantId,
    resource,
    challenge: 'challenge_00000000000000000000000',
    pairingAttemptId: 'attempt_00000001',
    now
  }), /issuer_mismatch/u);
  const expired = await signedProof({ exp: Math.floor(now.getTime() / 1_000) - 1 });
  await assert.rejects(verifySiteProof(expired.proof, expired.publicJwk, {
    kind: 'pairing', platformIssuer: 'https://auth.example.test', tenantId, resource,
    challenge: 'challenge_00000000000000000000000', pairingAttemptId: 'attempt_00000001', now
  }), /proof_time_invalid/u);
});

test('HTTPS verifier pins a prevalidated public address and fixed proof path', async () => {
  const issuedAt = Math.floor(Date.now() / 1_000);
  const response = await signedProof({ iat: issuedAt, exp: issuedAt + 60 });
  let observedPath = '';
  let observedAddress = '';
  const verifier = new HttpsSiteVerificationClient({
    resolve: async () => ['8.8.8.8'],
    request: async (url, _body, address) => {
      observedPath = url.pathname;
      observedAddress = address;
      return response;
    }
  });
  await verifier.verify({
    resource,
    platformIssuer: 'https://auth.example.test',
    tenantId,
    pairingAttemptId: 'attempt_00000001',
    verifier: 'v'.repeat(43),
    challenge: 'challenge_00000000000000000000000'
  });
  assert.equal(observedPath, '/wp-json/wp-auto/v1/pairing/proof');
  assert.equal(observedAddress, '8.8.8.8');
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
