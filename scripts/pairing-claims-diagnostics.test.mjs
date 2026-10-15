import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { CompactSign, exportJWK, generateKeyPair } from '../packages/pairing/node_modules/jose/dist/webapi/index.js';
import { canonicalizeResource, pairingDiagnostic, PairingDiagnosticError, verifySiteProof } from '../packages/pairing/dist/index.js';
import { safeProcess } from './test-real-site-proof.mjs';

const now = new Date('2026-10-15T12:00:00Z');
const n = Math.floor(now.getTime() / 1000);
const resource = canonicalizeResource('https://site.example.test/wp-json/wp-auto/mcp');
const expected = {
  kind: 'pairing', platformIssuer: 'https://auth.example.test',
  tenantId: '11111111-1111-4111-8111-111111111111', resource,
  challenge: 'c'.repeat(43), pairingAttemptId: 'attempt_00000001', siteId: 'site_00000001',
  platformSigningKid: 'platform-key-0001', platformSigningKeySha256: 'x'.repeat(43), now
};
const claims = {
  kind: 'pairing', protocol_version: '1', iss: 'site.example.test',
  platform_issuer: expected.platformIssuer, tenant_id: expected.tenantId, resource,
  challenge: expected.challenge, pairing_attempt_id: expected.pairingAttemptId, site_id: expected.siteId,
  platform_signing_kid: expected.platformSigningKid, platform_signing_key_sha256: expected.platformSigningKeySha256,
  iat: n, exp: n + 60
};
const { privateKey, publicKey } = await generateKeyPair('EdDSA', { crv: 'Ed25519' });
const jwk = { ...await exportJWK(publicKey), kid: 'site-key-0001', alg: 'EdDSA', use: 'sig' };
async function sign(payload, header = {}) {
  return new CompactSign(Buffer.from(typeof payload === 'string' ? payload : JSON.stringify(payload)))
    .setProtectedHeader({ alg: 'EdDSA', kid: jwk.kid, typ: 'wepuu-site-proof+jwt', ...header }).sign(privateKey);
}
async function outcome(proof, input = expected, publicInput = jwk, verify = verifySiteProof) {
  try { await verify(proof, publicInput, input); return { pass: true }; }
  catch (error) { return { pass: false, ...pairingDiagnostic(error) }; }
}

// Read the pinned pre-change source, not an approximate reimplementation of its predicates.
// CI checkout must retain this commit. Missing history is a failure, never a skipped gate.
const baseline = 'e8778da33d850303d1ccbdfbebf088610bf6ac5f';
const original = execFileSync('git', ['show', `${baseline}:packages/pairing/src/index.ts`], { encoding: 'utf8' });
const requirePairing = createRequire(new URL('../packages/pairing/package.json', import.meta.url));
const transpiled = ts.transpileModule(original, { compilerOptions: {
  target: ts.ScriptTarget.ES2024, module: ts.ModuleKind.ESNext
} }).outputText.replace(/from ['"]([^'"]+)['"]/g, (match, specifier) => specifier.startsWith('node:')
  ? match : `from ${JSON.stringify(pathToFileURL(requirePairing.resolve(specifier)).href)}`);
const legacy = await import(`data:text/javascript;base64,${Buffer.from(transpiled).toString('base64')}`);

const cases = [
  ['valid', {}, undefined],
  ['expired boundary', { exp: n }, 'claims.time_expired'],
  ['future allowed boundary', { iat: n + 5, exp: n + 65 }, undefined],
  ['future rejected boundary', { iat: n + 6, exp: n + 66 }, 'claims.time_future'],
  ['lifetime allowed boundary', { exp: n + 60 }, undefined],
  ['lifetime rejected boundary', { exp: n + 61 }, 'claims.time_window_invalid'],
  ['float iat', { iat: n + 0.5 }, 'claims.schema_invalid'],
  ['null optional', { grant_id: null }, 'claims.schema_invalid'],
  ['missing required', { tenant_id: undefined }, 'claims.schema_invalid'],
  ['wrong type', { exp: String(n + 60) }, 'claims.schema_invalid'],
  ['extra field', { SECRET_EXTRA: 'SECRET_PAYLOAD' }, 'claims.schema_invalid'],
  ['wrong protocol', { protocol_version: '2' }, 'claims.schema_invalid'],
  ['wrong kind', { kind: 'consent' }, 'claims.other_binding_mismatch'],
  ['issuer', { iss: 'other.example.test' }, 'claims.issuer_mismatch'],
  ['platform issuer', { platform_issuer: 'https://other.example.test' }, 'claims.issuer_mismatch'],
  ['tenant', { tenant_id: '22222222-2222-4222-8222-222222222222' }, 'claims.tenant_mismatch'],
  ['resource', { resource: 'https://other.example.test/wp-json/wp-auto/mcp' }, 'claims.resource_mismatch'],
  ['challenge', { challenge: 'd'.repeat(43) }, 'claims.challenge_mismatch'],
  ['attempt', { pairing_attempt_id: 'attempt_00000002' }, 'claims.site_binding_mismatch'],
  ['site', { site_id: 'site_00000002' }, 'claims.site_binding_mismatch'],
  ['key hash', { platform_signing_key_sha256: 'y'.repeat(43) }, 'claims.platform_key_binding_mismatch'],
  ['key kid', { platform_signing_kid: 'platform-key-0002' }, 'claims.platform_key_binding_mismatch'],
  ['grant', { grant_id: 'grant_00000001' }, 'claims.other_binding_mismatch'],
  ['client', { client_id: 'client_00000001' }, 'claims.other_binding_mismatch'],
  ['subject', { subject_id: 'subject_00000001' }, 'claims.other_binding_mismatch'],
  ['audience', { aud: resource }, 'claims.other_binding_mismatch'],
  ['decision', { decision: 'approved' }, 'claims.other_binding_mismatch'],
  // Existing acceptance quirks are deliberately retained, not silently hardened in diagnostics.
  ['unrequested valid scope retained', { scope: ['mcp:read'] }, undefined],
  ['nonpositive interval retained', { iat: n + 5, exp: n + 1 }, undefined],
  ['first failure follows original order', { exp: n, iat: n + 6, iss: 'other.example.test' }, 'claims.time_expired']
];
for (const [name, changes, detail] of cases) {
  test(`claims diagnostic and pinned-baseline parity: ${name}`, async () => {
    const proof = await sign({ ...claims, ...changes });
    const before = await outcome(proof, expected, jwk, legacy.verifySiteProof);
    const after = await outcome(proof);
    assert.equal(after.pass, before.pass, 'ACCEPTANCE_PARITY');
    assert.equal(after.pass, detail === undefined, 'EXPECTED_DECISION');
    if (detail !== undefined) {
      assert.equal(after.code, 'proof.claims_invalid');
      assert.equal(after.detail, detail);
    }
  });
}

test('optional binding fields may be absent when expected absent', async () => {
  const payload = { ...claims };
  const input = { ...expected };
  for (const [claim, key] of [['site_id', 'siteId'], ['pairing_attempt_id', 'pairingAttemptId'],
    ['platform_signing_kid', 'platformSigningKid'], ['platform_signing_key_sha256', 'platformSigningKeySha256']]) {
    delete payload[claim]; delete input[key];
  }
  assert.equal((await outcome(await sign(payload), input)).pass, true);
});

test('JSON, header, signature and key errors retain distinct codes and no raw causes', async () => {
  const invalidJson = await sign('{SECRET_INVALID_JSON');
  assert.equal((await outcome(invalidJson)).detail, 'claims.json_invalid');
  const badHeader = await outcome(await sign(claims, { typ: 'wrong' }));
  assert.equal(badHeader.code, 'proof.header_invalid'); assert.equal(badHeader.detail, undefined);
  const valid = await sign(claims);
  const parts = valid.split('.');
  parts[2] = `${parts[2][0] === 'A' ? 'B' : 'A'}${parts[2].slice(1)}`;
  assert.equal((await outcome(parts.join('.'))).code, 'proof.signature_invalid');
  assert.equal((await outcome(valid, expected, { ...jwk, x: 'bad' })).code, 'proof.key_invalid');
  try { await verifySiteProof(invalidJson, jwk, expected); assert.fail('EXPECTED_REJECTION'); }
  catch (error) {
    assert.equal(error.cause, undefined);
    assert.equal(JSON.stringify(error).includes('SECRET_'), false);
  }
});

test('unknown exceptions remain fixed unknown, and diagnostic detail is runtime allowlisted', async () => {
  const result = await outcome(await sign(claims), { ...expected, resource: 'not a URL SECRET_DETAIL' });
  assert.equal(result.detail, 'unknown');
  assert.equal(JSON.stringify(result).includes('SECRET_'), false);
  assert.equal(pairingDiagnostic(new PairingDiagnosticError('proof', 'proof.claims_invalid', undefined, 'SECRET_BAD_ENUM')).detail, 'unknown');
  assert.equal(pairingDiagnostic(new PairingDiagnosticError('network', 'network.failed', undefined, 'claims.schema_invalid')).detail, undefined);
});

test('Consent proof regression retains exact audience, scope, decision and subject checks', async () => {
  const consent = { ...claims, kind: 'consent', pairing_attempt_id: undefined,
    platform_signing_kid: undefined, platform_signing_key_sha256: undefined,
    aud: resource, scope: ['mcp:read'], decision: 'approved', grant_id: 'grant_00000001',
    subject_id: 'subject_00000001', client_id: 'client_00000001' };
  const input = { ...expected, kind: 'consent', pairingAttemptId: undefined,
    platformSigningKid: undefined, platformSigningKeySha256: undefined,
    scopes: ['mcp:read'], decision: 'approved', grantId: consent.grant_id,
    subjectId: consent.subject_id, clientId: consent.client_id };
  for (const changes of [{}, { aud: 'https://other.example.test/wp-json/wp-auto/mcp' },
    { scope: ['mcp:write'] }, { decision: 'denied' }, { subject_id: 'subject_00000002' }]) {
    const proof = await sign({ ...consent, ...changes });
    assert.equal((await outcome(proof, input)).pass, (await outcome(proof, input, jwk, legacy.verifySiteProof)).pass);
    assert.equal((await outcome(proof, input)).pass, Object.keys(changes).length === 0);
  }
});

test('subprocess failures, bounded output and timeout never expose child sentinel output', async () => {
  for (const [code, options, expectedError] of [
    ["process.stderr.write('SECRET_CHILD');process.exit(7)", {}, 'CHILD_FAILED_EXIT_7'],
    ["process.stdout.write('SECRET_CHILD'.repeat(10000))", { maxBytes: 64 }, 'CHILD_OUTPUT_LIMIT'],
    ["process.stdout.write('SECRET_CHILD');setInterval(()=>{},1000)", { timeoutMs: 300 }, 'CHILD_TIMEOUT']
  ]) {
    await assert.rejects(safeProcess(process.execPath, ['-e', code], options), error => error.message === expectedError);
  }
});

test('test ZIP identity and runtime image exclusion rules are fixed', async () => {
  const archive = await readFile(new URL('../tests/fixtures/p3e1a/wepuu-auto-connector.zip', import.meta.url));
  assert.equal(createHash('sha256').update(archive).digest('hex'), 'f59406eaa07c8d6d8518ef5d5d71cd496a7952fa781b263d7bc306ec5fd3d960');
  const ignore = await readFile(new URL('../.dockerignore', import.meta.url), 'utf8');
  assert.match(ignore, /^tests\/fixtures\/p3e1a\/$/m);
  assert.match(ignore, /^\.tmp$/m);
});
