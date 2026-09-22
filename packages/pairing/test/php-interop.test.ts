import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';
import { canonicalizeResource, verifySiteProof } from '../src/index.js';

const execFileAsync = promisify(execFile);

test('PHP sodium Ed25519 proof verifies in TypeScript JOSE', {
  skip: process.env['WEPUU_PHP_INTEROP'] !== '1'
}, async () => {
  const { stdout, stderr } = await execFileAsync(process.env['PHP_BIN'] ?? 'php', [
    resolve(import.meta.dirname, 'php-site-proof.php')
  ], { encoding: 'utf8', windowsHide: true, timeout: 10_000, maxBuffer: 32 * 1_024 });
  assert.equal(stderr, '');
  const fixture = JSON.parse(stdout) as { proof: string; publicJwk: unknown };
  const verified = await verifySiteProof(fixture.proof, fixture.publicJwk, {
    kind: 'pairing',
    platformIssuer: 'https://auth.example.test',
    tenantId: '11111111-1111-4111-8111-111111111111',
    resource: canonicalizeResource('https://site.example.test/wp-json/wp-auto/mcp'),
    challenge: 'challenge_00000000000000000000000',
    pairingAttemptId: 'attempt_00000001'
  });
  assert.equal(verified.claims.iss, 'site.example.test');
  assert.equal('d' in verified.publicJwk, false);
});
