import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  expectInvalidGrant,
  probeMcpRevocationState,
  resolveLifecyclePlan,
  waitForMcpDenial,
} from './test-production-wordpress-oauth.mjs';

function controlledPolling(probe, exp = 120) {
  let milliseconds = 0;
  const sleeps = [];
  return {
    options: {
      now: () => milliseconds,
      probe,
      sleep: async (delay) => {
        sleeps.push(delay);
        milliseconds += delay;
      },
    },
    sleeps,
    advance: (delay) => { milliseconds += delay; },
    exp,
  };
}

function mcpResponse(status, challenge = '') {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: new Headers(challenge === '' ? {} : { 'www-authenticate': challenge }),
    body: { cancel: async () => undefined },
  };
}

test('lifecycle plans preserve existing destructive modes and add an active positive rotation', () => {
  assert.deepEqual(resolveLifecyclePlan(undefined, false), {
    mode: 'normal',
    probeBeforeRotation: false,
    revokeBeforeRotation: false,
    replayAfterRotation: false,
    revokeAfterRotation: true,
    preserveActiveAfterRotation: false,
  });
  assert.deepEqual(resolveLifecyclePlan('replay', false), {
    mode: 'replay',
    probeBeforeRotation: false,
    revokeBeforeRotation: false,
    replayAfterRotation: true,
    revokeAfterRotation: false,
    preserveActiveAfterRotation: false,
  });
  assert.deepEqual(resolveLifecyclePlan('revocation', false), {
    mode: 'revocation',
    probeBeforeRotation: true,
    revokeBeforeRotation: true,
    replayAfterRotation: false,
    revokeAfterRotation: false,
    preserveActiveAfterRotation: false,
  });
  assert.deepEqual(resolveLifecyclePlan('positive-rotation', false), {
    mode: 'positive-rotation',
    probeBeforeRotation: true,
    revokeBeforeRotation: false,
    replayAfterRotation: false,
    revokeAfterRotation: false,
    preserveActiveAfterRotation: true,
  });
});

test('access-only probes cannot select lifecycle modes', () => {
  for (const mode of ['positive-rotation', 'replay', 'revocation']) {
    assert.throws(() => resolveLifecyclePlan(mode, true), /invalid_lifecycle_mode/u);
  }
});

test('waitForMcpDenial polls every two seconds until a valid denial arrives', async () => {
  let calls = 0;
  const request = async () => {
    calls += 1;
    return calls === 1
      ? mcpResponse(200)
      : mcpResponse(401, 'Bearer error="invalid_token"');
  };
  const polling = controlledPolling(
    (resource, token) => probeMcpRevocationState(resource, token, request),
  );

  await waitForMcpDenial('https://test.example/mcp', 'fixture-token', polling.exp, polling.options);

  assert.equal(calls, 2);
  assert.deepEqual(polling.sleeps, [2_000]);
});

test('waitForMcpDenial fails after sixty seconds when the Connector keeps accepting', async () => {
  const polling = controlledPolling(
    (resource, token) => probeMcpRevocationState(resource, token, async () => mcpResponse(200)),
  );

  await assert.rejects(
    waitForMcpDenial('https://test.example/mcp', 'fixture-token', polling.exp, polling.options),
    /connector_revocation_timeout/u,
  );
  assert.equal(polling.sleeps.reduce((total, delay) => total + delay, 0), 60_000);
  assert.ok(polling.sleeps.every((delay) => delay === 2_000));
});

test('waitForMcpDenial does not accept a denial observed after natural expiry', async () => {
  const polling = controlledPolling(async () => {
    polling.advance(5_000);
    return 'denied';
  }, 5);

  await assert.rejects(
    waitForMcpDenial('https://test.example/mcp', 'fixture-token', polling.exp, polling.options),
    /access_token_expired_before_revocation_observed/u,
  );
});

test('waitForMcpDenial reports a network request timeout without treating it as denial', async () => {
  const polling = controlledPolling(async () => {
    throw new DOMException('request timed out', 'TimeoutError');
  });

  await assert.rejects(
    waitForMcpDenial('https://test.example/mcp', 'fixture-token', polling.exp, polling.options),
    /connector_revocation_request_timeout/u,
  );
  assert.deepEqual(polling.sleeps, []);
});

test('probeMcpRevocationState rejects protocol responses other than success or invalid_token', async () => {
  await assert.rejects(
    probeMcpRevocationState(
      'https://test.example/mcp',
      'fixture-token',
      async () => mcpResponse(401, 'Bearer error="insufficient_scope"'),
    ),
    /mcp_revocation_protocol_401/u,
  );
});

test('expectInvalidGrant consumes a real Node Response exactly once', async () => {
  const response = new Response(JSON.stringify({ error: 'invalid_grant' }), {
    status: 400,
    headers: { 'content-type': 'application/json' },
  });
  await expectInvalidGrant('https://auth.example/token', {}, async () => response);
  assert.equal(response.bodyUsed, true);
});

test('expectInvalidGrant rejects success, other OAuth errors and non-JSON responses without details', async () => {
  for (const response of [
    new Response('{}', { status: 200 }),
    new Response(JSON.stringify({ error: 'invalid_client', token: 'must-not-leak' }), { status: 400 }),
    new Response('not-json-sensitive-body', { status: 400 }),
  ]) {
    await assert.rejects(
      expectInvalidGrant('https://auth.example/token', {}, async () => response),
      (error) => error instanceof Error
        && /^oauth_invalid_grant_expected_/u.test(error.message)
        && !/invalid_client|must-not-leak|not-json-sensitive-body/u.test(error.message),
    );
  }
});

test('expectInvalidGrant classifies request timeout and network failure without sensitive detail', async () => {
  await assert.rejects(
    expectInvalidGrant('https://auth.example/token', {}, async () => {
      throw new DOMException('sensitive timeout detail', 'TimeoutError');
    }),
    /oauth_invalid_grant_probe_timeout/u,
  );
  await assert.rejects(
    expectInvalidGrant('https://auth.example/token', {}, async () => {
      throw new TypeError('sensitive network detail');
    }),
    /oauth_invalid_grant_probe_network/u,
  );
});
