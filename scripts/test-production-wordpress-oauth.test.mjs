import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  expectInvalidGrant,
  probeMcpRevocationState,
  resolveLifecyclePlan,
  validateAuthorizationCallback,
  waitForAuthorizationCode,
  waitForMcpDenial,
} from './test-production-wordpress-oauth.mjs';

const callbackIssuer = 'https://auth.example.test';

test('callback validation accepts exact issuer and both explicitly expected paths', () => {
  for (const path of ['/callback', '/callback/fixture_123456']) {
    const callback = new URL(`http://127.0.0.1:49123${path}`);
    callback.search = new URLSearchParams({ code: 'fixture-code', state: 'fixture-state', iss: callbackIssuer });
    assert.equal(validateAuthorizationCallback(callback, 'fixture-state', callbackIssuer, path), 'fixture-code');
  }
});

test('callback validation rejects missing, duplicate and non-exact issuers without sensitive errors', () => {
  for (const [query, expected] of [
    ['code=SECRET_CODE&state=fixture-state', 'oauth_callback_issuer_missing'],
    [`code=SECRET_CODE&state=fixture-state&iss=${callbackIssuer}&iss=${callbackIssuer}`, 'oauth_callback_issuer_duplicate'],
    ['code=SECRET_CODE&state=fixture-state&iss=https://SECRET_ISSUER.example', 'oauth_callback_issuer_mismatch'],
    [`code=SECRET_CODE&state=fixture-state&iss=${callbackIssuer}/`, 'oauth_callback_issuer_mismatch'],
  ]) {
    assert.throws(
      () => validateAuthorizationCallback(new URL(`http://127.0.0.1/callback?${query}`), 'fixture-state', callbackIssuer),
      (error) => error.message === expected && !error.message.includes('SECRET'),
    );
  }
});

test('callback validation retains exact state, code, provider-error and path boundaries', () => {
  for (const [path, query, expected] of [
    ['/callback/other', `code=x&state=s&iss=${callbackIssuer}`, 'oauth_callback_path_invalid'],
    ['/callback', `code=x&state=wrong&iss=${callbackIssuer}`, 'oauth_callback_state_invalid'],
    ['/callback', `code=x&state=s&state=s&iss=${callbackIssuer}`, 'oauth_callback_state_invalid'],
    ['/callback', `code=x&code=x&state=s&iss=${callbackIssuer}`, 'oauth_callback_code_invalid'],
    ['/callback', `code=&state=s&iss=${callbackIssuer}`, 'oauth_callback_code_invalid'],
    ['/callback', `error=SECRET_PROVIDER_ERROR&state=s&iss=${callbackIssuer}`, 'oauth_callback_provider_error'],
  ]) {
    assert.throws(
      () => validateAuthorizationCallback(new URL(`http://127.0.0.1${path}?${query}`), 's', callbackIssuer),
      (error) => error.message === expected,
    );
  }
});

test('real callback listener reports only issuer booleans and releases a code after validation', async () => {
  const lines = [];
  const listener = await waitForAuthorizationCode('SECRET_STATE', callbackIssuer, { report: (line) => lines.push(line) });
  const completion = listener.code();
  const callback = new URL(listener.redirectUri);
  callback.search = new URLSearchParams({ code: 'SECRET_CODE', state: 'SECRET_STATE', iss: callbackIssuer });
  const response = await fetch(callback);
  assert.equal(response.status, 200);
  assert.ok(!(await response.text()).includes('SECRET'));
  assert.equal(await completion, 'SECRET_CODE');
  assert.deepEqual(lines, ['OAUTH_CALLBACK_ISSUER_PRESENT=True', 'OAUTH_CALLBACK_ISSUER_MATCH=True']);
});

test('real callback listener fails before a simulated exchange on invalid issuer or state', async () => {
  for (const [query, expected] of [
    [{ code: 'SECRET_CODE', state: 's' }, 'oauth_callback_issuer_missing'],
    [{ code: 'SECRET_CODE', state: 's', iss: 'https://SECRET_ISSUER.example' }, 'oauth_callback_issuer_mismatch'],
    [{ code: 'SECRET_CODE', state: 'wrong', iss: callbackIssuer }, 'oauth_callback_state_invalid'],
  ]) {
    const lines = [];
    let exchanges = 0;
    const listener = await waitForAuthorizationCode('s', callbackIssuer, { report: (line) => lines.push(line) });
    const completion = listener.code().then(() => { exchanges += 1; });
    const rejected = assert.rejects(completion, (error) => error.message === expected);
    const callback = new URL(listener.redirectUri);
    callback.search = new URLSearchParams(query);
    const response = await fetch(callback);
    assert.equal(response.status, 400);
    assert.ok(!(await response.text()).includes('SECRET'));
    await rejected;
    assert.equal(exchanges, 0);
    assert.ok(!lines.join('\n').includes('SECRET'));
  }
});

test('callback listener timeout is bounded and closes without receiving an authorization', async () => {
  const listener = await waitForAuthorizationCode('s', callbackIssuer, { timeoutMs: 25, report: () => {} });
  await assert.rejects(listener.code(), /authorization_timeout/u);
  await assert.rejects(fetch(listener.redirectUri), TypeError);
});

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
