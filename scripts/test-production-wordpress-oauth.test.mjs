import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  probeMcpRevocationState,
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
