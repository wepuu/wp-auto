import test from 'node:test';
import assert from 'node:assert/strict';
import { assertTraceIsContentFree, makeClientInteropResult, makeConformanceCase, redactTrace, TEST_PROFILE } from '../src/adapter.mjs';

test('provider-neutral conformance cases redact credentials and content', () => {
  const trace = redactTrace({
    method: 'POST',
    url: 'https://auth.example.test/token?code=secret&state=stable',
    authorization: 'Bearer secret',
    body: { access_token: 'secret', tool_results: ['content'] },
    status: 200
  });
  assert.equal(trace.authorization, '[REDACTED]');
  assert.equal(trace.body, '[REDACTED]');
  assert.match(trace.url, /code=%5BREDACTED%5D/);
  assert.doesNotThrow(() => assertTraceIsContentFree({ method: 'GET', path: '/jwks', status: 200 }));
  assert.throws(() => assertTraceIsContentFree({ body: 'tool_results' }), /trace_contains_forbidden_field/);
});

test('client interop results use a finite registration and conclusion vocabulary', () => {
  const result = makeClientInteropResult({
    client: 'Codex',
    clientVersion: '0.154.0',
    registrationMode: 'dcr',
    conclusion: 'supported',
    evidence: [{ method: 'GET', path: '/.well-known/openid-configuration', status: 200 }]
  });
  assert.equal(result.conclusion, 'supported');
  assert.throws(() => makeClientInteropResult({ client: 'x', clientVersion: '1', registrationMode: 'private', conclusion: 'supported' }), /invalid_registration_mode/);
  assert.throws(() => makeClientInteropResult({ client: 'x', clientVersion: '1', registrationMode: 'dcr', conclusion: 'pending' }), /invalid_client_interop_conclusion/);
});

test('conformance case enforces the finite status vocabulary and profile defaults', () => {
  const result = makeConformanceCase({
    id: 'P01',
    candidate: 'node-oidc-provider@9.12.2',
    client: 'Codex 0.154.0',
    expected: { status: 200 },
    actual: { status: 200 },
    status: 'pass',
    evidence: [{ method: 'GET', path: '/.well-known/oauth-protected-resource/mcp', status: 200 }]
  });
  assert.equal(result.status, 'pass');
  assert.equal(result.evidence[0].status, 200);
  assert.equal(TEST_PROFILE.accessTokenTtl, 300);
  assert.equal(TEST_PROFILE.authorizationCodeTtl, 90);
  assert.equal(TEST_PROFILE.refreshReuseLeeway, 0);
  assert.throws(() => makeConformanceCase({ id: 'X', candidate: 'x', status: 'pending' }), /invalid_conformance_status/);
});
