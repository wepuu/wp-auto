import process from 'node:process';
import { canonicalizeResource, verifySiteProof } from '../packages/pairing/dist/index.js';

let input = '';
for await (const chunk of process.stdin) input += chunk;
const fixture = JSON.parse(input);
await verifySiteProof(fixture.proof, fixture.publicJwk, {
  kind: 'pairing',
  platformIssuer: 'https://auth.example.test',
  tenantId: '11111111-1111-4111-8111-111111111111',
  resource: canonicalizeResource('https://site.example.test/wp-json/wp-auto/mcp'),
  challenge: 'challenge_00000000000000000000000',
  pairingAttemptId: 'attempt_00000001'
});
process.stdout.write('PHP_SITE_PROOF_INTEROP=pass\n');
