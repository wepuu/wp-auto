import assert from 'node:assert/strict';
import test from 'node:test';
import { JsonLineAuditSink, validateSecurityEvent } from '../src/index.js';

const base = {
  occurredAt: '2026-09-16T00:00:00.000Z',
  eventName: 'tenant.access_denied',
  outcome: 'denied',
  reason: 'membership_missing',
  correlationId: 'correlation_1234',
  service: 'control-api',
  serviceVersion: '0.2.0'
} as const;

test('security events accept only the content-free allow-list', () => {
  assert.deepEqual(validateSecurityEvent(base), base);
  for (const forbidden of [
    'authorization', 'cookie', 'body', 'token', 'wordpressUserId', 'toolArguments',
    'pairingVerifier', 'siteProof', 'consentProof'
  ]) {
    assert.throws(() => validateSecurityEvent({ ...base, [forbidden]: 'canary-secret-content' }));
  }
});

test('JSON audit sink serializes only validated events', async () => {
  const lines: string[] = [];
  const sink = new JsonLineAuditSink((line) => lines.push(line));
  await sink.write(validateSecurityEvent(base));
  assert.equal(lines.length, 1);
  assert.equal(lines[0]?.includes('canary-secret-content'), false);
});
