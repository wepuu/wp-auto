import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { EXPECTED_TOOLS, probeMcp, verifyAccessToken } from './test-production-wordpress-oauth.mjs';
import { acquireAccessOnly, assertCrossSiteDenial, assertIsolationBindings, CLIENT_ID, MATRIX_STEPS,
  createBrowserHandoff, ISSUER, parseIsolationArguments, RESOURCE_A, RESOURCE_B,
  runIsolationAcceptance, runIsolationMatrix, secondAuthorizationTimeoutMs } from './test-production-wordpress-site-isolation.mjs';

const requireFromKeyCustody = createRequire(new URL('../packages/key-custody/package.json', import.meta.url));
const { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } = await import(
  pathToFileURL(requireFromKeyCustody.resolve('jose')).href,
);
const accountId = 'account_fixture123';
const tenantId = 'tenant_fixture123';
const now = Date.now();
const pair = () => [
  { resource: RESOURCE_A, siteId: 'site_fixture_a', token: 'SECRET_TOKEN_A',
    binding: { grantId: 'grant_fixture_a', accountId, exp: Math.floor(now / 1_000) + 120 } },
  { resource: RESOURCE_B, siteId: 'site_fixture_b', token: 'SECRET_TOKEN_B',
    binding: { grantId: 'grant_fixture_b', accountId, exp: Math.floor(now / 1_000) + 120 } },
];

test('isolation CLI requires explicit execution and fixed non-secret identity inputs', () => {
  const valid = ['--account-id', accountId, '--tenant-id', tenantId, '--site-a-id', 'site_fixture_a',
    '--site-b-id', 'site_fixture_b', '--execute', 'true'];
  assert.equal(parseIsolationArguments(valid)['account-id'], accountId);
  for (const args of [[], valid.slice(0, -2), [...valid, '--client-id', 'wepuu-e2e-codex'],
    [...valid, '--token', 'SECRET_TOKEN'], [...valid, '--execute', 'true'],
    valid.map((item) => item === 'site_fixture_b' ? 'site_fixture_a' : item)]) {
    assert.throws(() => parseIsolationArguments(args), /^(?:Error: )?isolation_/u);
  }
  let stdout;
  try { execFileSync(process.execPath, ['scripts/test-production-wordpress-site-isolation.mjs'], { encoding: 'utf8', stdio: 'pipe' }); }
  catch (error) { stdout = error.stdout + error.stderr; assert.equal(error.status, 1); }
  assert.equal(stdout.trim(), 'SITE_ISOLATION_FAILURE=isolation_explicit_execution_required');
});

test('one-use loopback handoff keeps authorization parameters out of browser process arguments', async () => {
  const authorization = new URL(`${ISSUER}/auth?state=SECRET_STATE&code_challenge=SECRET_CHALLENGE`);
  let entry;
  const handoff = await createBrowserHandoff(authorization, async (url) => {
    entry = url;
    assert.ok(!url.includes('SECRET'));
    assert.equal(new URL(url).hostname, '127.0.0.1');
    const response = await fetch(url, { redirect: 'manual' });
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('location'), authorization.href);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
    assert.equal((await fetch(url, { redirect: 'manual' })).status, 404);
  });
  await handoff.close();
  await assert.rejects(fetch(entry));
});

test('handoff launch failure is classified without raw exceptions or authorization data', async () => {
  await assert.rejects(createBrowserHandoff(new URL(`${ISSUER}/auth?state=SECRET`), () => {
    throw new Error('SECRET_EXCEPTION');
  }), { message: 'isolation_browser_launch_failed' });
});

test('real callback plus JOSE verification acquires only two access tokens with exact bindings', async () => {
  const { privateKey, publicKey } = await generateKeyPair('RS256', { modulusLength: 2048 });
  const jwk = { ...await exportJWK(publicKey), kid: 'fixture-key', alg: 'RS256', use: 'sig' };
  const jwks = createLocalJWKSet({ keys: [jwk] });
  const tokenRequests = [];
  for (const [index, resource] of [RESOURCE_A, RESOURCE_B].entries()) {
    const siteId = `site_fixture_${index}`;
    const context = { issuer: ISSUER, clientId: CLIENT_ID, resource, siteId, accountId, tenantId, jwks };
    const token = await new SignJWT({ client_id: CLIENT_ID, tenant_id: tenantId, site_id: siteId,
      grant_id: `grant_fixture_${index}`, scope: 'mcp:read' })
      .setProtectedHeader({ alg: 'RS256', typ: 'at+jwt', kid: jwk.kid }).setIssuer(ISSUER)
      .setAudience(resource).setSubject(accountId).setIssuedAt().setNotBefore('0s').setExpirationTime('2m').sign(privateKey);
    const acquired = await acquireAccessOnly(context, {
      handoff: async (url) => {
        assert.equal(url.origin, ISSUER);
        assert.equal(url.searchParams.get('client_id'), CLIENT_ID);
        assert.equal(url.searchParams.get('scope'), 'mcp:read');
        assert.equal(url.searchParams.get('resource'), resource);
        assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
        assert.equal(url.searchParams.has('prompt'), false);
        const callback = new URL(url.searchParams.get('redirect_uri'));
        assert.equal(callback.hostname, '127.0.0.1');
        assert.equal(callback.pathname, '/callback');
        callback.search = new URLSearchParams({ code: 'SECRET_CODE', state: url.searchParams.get('state'), iss: ISSUER });
        assert.equal((await fetch(callback)).status, 200);
        return { close() {} };
      },
      request: async (url, options) => {
        tokenRequests.push(url.pathname);
        assert.equal(url.origin, ISSUER);
        assert.equal(url.pathname, '/token');
        assert.equal(options.body.get('grant_type'), 'authorization_code');
        assert.equal(options.body.get('resource'), resource);
        assert.equal(options.redirect, 'error');
        return Response.json({ access_token: token, token_type: 'Bearer' });
      },
    });
    assert.equal(acquired.binding.accountId, accountId);
    assert.equal(acquired.binding.grantId, `grant_fixture_${index}`);
  }
  assert.deepEqual(tokenRequests, ['/token', '/token']);
});

test('strict JOSE bindings reject each account, tenant, site, client, audience and scope mismatch', async () => {
  const { privateKey, publicKey } = await generateKeyPair('RS256', { modulusLength: 2048 });
  const jwk = { ...await exportJWK(publicKey), kid: 'fixture-key', alg: 'RS256', use: 'sig' };
  const context = { issuer: ISSUER, resource: RESOURCE_A, siteId: 'site_fixture_a', tenantId,
    clientId: CLIENT_ID, accountId, strictBindings: true, jwks: createLocalJWKSet({ keys: [jwk] }) };
  const claims = { iss: ISSUER, aud: RESOURCE_A, sub: accountId, client_id: CLIENT_ID, tenant_id: tenantId,
    site_id: context.siteId, grant_id: 'grant_fixture_a', scope: 'mcp:read',
    iat: Math.floor(Date.now() / 1_000), nbf: Math.floor(Date.now() / 1_000), exp: Math.floor(Date.now() / 1_000) + 120 };
  for (const changed of [{ sub: 'SECRET_OTHER_ACCOUNT' }, { tenant_id: 'SECRET_OTHER_TENANT' },
    { site_id: 'SECRET_OTHER_SITE' }, { client_id: 'SECRET_OTHER_CLIENT' }, { aud: RESOURCE_B },
    { aud: [RESOURCE_A] }, { scope: 'mcp:content.write' }, { iss: 'https://other.example.test' }, { iat: undefined }]) {
    const token = await new SignJWT({ ...claims, ...changed })
      .setProtectedHeader({ alg: 'RS256', typ: 'at+jwt', kid: jwk.kid }).sign(privateKey);
    await assert.rejects(verifyAccessToken(token, context));
  }
});

test('access-only rejects unsolicited refresh tokens and closes the real listener on failures', async () => {
  let callback;
  await assert.rejects(acquireAccessOnly({ issuer: ISSUER, clientId: CLIENT_ID, resource: RESOURCE_A }, {
    handoff: async (url) => {
      callback = new URL(url.searchParams.get('redirect_uri'));
      callback.search = new URLSearchParams({ code: 'SECRET_CODE', state: url.searchParams.get('state'), iss: ISSUER });
      await fetch(callback);
      return { close() {} };
    },
    request: async () => Response.json({ access_token: 'SECRET', refresh_token: 'SECRET', token_type: 'Bearer' }),
  }), { message: 'isolation_token_response_invalid' });
  await assert.rejects(fetch(callback));
});

test('access-only masks provider/network exceptions and closes listener after browser failure', async () => {
  let callback;
  await assert.rejects(acquireAccessOnly({ issuer: ISSUER, clientId: CLIENT_ID, resource: RESOURCE_A }, {
    handoff: async (url) => {
      callback = new URL(url.searchParams.get('redirect_uri'));
      throw new Error('SECRET_EXCEPTION');
    },
  }), { message: 'isolation_authorization_failed' });
  await assert.rejects(fetch(callback));
});

test('pair bindings reject shared grants, accounts, sites, tokens and wrong resources', () => {
  const [a, b] = pair();
  assertIsolationBindings(a, b, accountId);
  for (const changed of [{ ...b, siteId: a.siteId }, { ...b, resource: RESOURCE_A },
    { ...b, token: a.token }, { ...b, binding: { ...b.binding, grantId: a.binding.grantId } },
    { ...b, binding: { ...b.binding, accountId: 'account_other' } }]) {
    assert.throws(() => assertIsolationBindings(a, changed, accountId), { message: 'isolation_pair_binding_invalid' });
  }
});

test('cross-site denial requires exact Bearer invalid_token, no redirects or shared MCP Session', async () => {
  await assertCrossSiteDenial(RESOURCE_B, 'SECRET_TOKEN_A', {
    request: async (url, options) => {
      assert.equal(url, RESOURCE_B);
      assert.equal(options.redirect, 'error');
      assert.equal(options.headers.authorization, 'Bearer SECRET_TOKEN_A');
      assert.equal(options.headers['mcp-session-id'], undefined);
      assert.equal(options.headers['mcp-protocol-version'], undefined);
      assert.ok(!url.includes('SECRET'));
      return new Response(null, { status: 401, headers: { 'www-authenticate': 'Bearer realm="mcp", error="invalid_token"' } });
    },
  });
  for (const [status, challenge] of [[200, 'Bearer error="invalid_token"'], [403, 'Bearer error="invalid_token"'],
    [429, 'Bearer error="invalid_token"'], [302, 'Bearer error="invalid_token"'], [401, 'Basic error="invalid_token"'],
    [401, 'Bearer realm="invalid_token"'], [401, 'Bearer error="insufficient_scope"'],
    [401, 'Bearer error="invalid_token", error="invalid_token"'], [401, '']]) {
    await assert.rejects(assertCrossSiteDenial(RESOURCE_B, 'SECRET', {
      request: async () => new Response(null, { status, headers: { 'www-authenticate': challenge } }),
    }), { message: 'isolation_denial_contract_invalid' });
  }
});

test('cross-site network failures and timeouts never count as denial and omit raw details', async () => {
  for (const [error, message] of [[new TypeError('SECRET_URL'), 'isolation_network_failed'],
    [new DOMException('SECRET_EXCEPTION', 'TimeoutError'), 'isolation_request_timeout']]) {
    await assert.rejects(assertCrossSiteDenial(RESOURCE_B, 'SECRET', { request: async () => { throw error; } }), { message });
  }
});

test('matrix checks positives, cross denials and renewed positives within the validity window', async () => {
  const [a, b] = pair();
  const operations = [];
  const result = await runIsolationMatrix(a, b, { now: () => now,
    probe: async (resource, token, options) => {
      operations.push([resource, token, 'positive']);
      assert.equal(options.strictTransport, true);
    },
    denial: async (resource, token) => { operations.push([resource, token, 'negative']); },
  });
  assert.deepEqual(operations, [[RESOURCE_A, a.token, 'positive'], [RESOURCE_B, b.token, 'positive'],
    [RESOURCE_B, a.token, 'negative'], [RESOURCE_A, b.token, 'negative'],
    [RESOURCE_A, a.token, 'positive'], [RESOURCE_B, b.token, 'positive']]);
  assert.deepEqual(result, { ownSites: true, crossSitesDenied: true, ownSitesStillUsable: true });
});

test('matrix never passes insufficient lifetime, natural expiry, deadline or request failure', async () => {
  const [a, b] = pair();
  await assert.rejects(runIsolationMatrix({ ...a, binding: { ...a.binding, exp: Math.floor(now / 1_000) + 59 } }, b,
    { now: () => now }), { message: 'isolation_token_lifetime_insufficient' });
  for (const [advance, message] of [[45_000, 'isolation_matrix_timeout'], [121_000, 'isolation_token_expired']]) {
    let clock = now;
    await assert.rejects(runIsolationMatrix(a, b, { now: () => clock,
      probe: async () => { clock += advance; },
    }), { message });
  }
  await assert.rejects(runIsolationMatrix(a, b, { now: () => now,
    probe: async () => { throw new DOMException('SECRET', 'TimeoutError'); },
  }), { message: 'isolation_request_timeout' });
});

test('second authorization reserves ninety seconds, caps waiting and rejects an exhausted budget', () => {
  assert.equal(secondAuthorizationTimeoutMs(1_300, 1_000_000), 210_000);
  assert.equal(secondAuthorizationTimeoutMs(2_000, 1_000_000), 300_000);
  assert.equal(secondAuthorizationTimeoutMs(1_091, 1_000_000), 1_000);
  for (const [exp, clock] of [[1_090, 1_000_000], [1_089, 1_000_000], [NaN, 0],
    [1_300.5, 1_000_000], [1_300, NaN], [1_300, 1_000_000.5]]) {
    assert.throws(() => secondAuthorizationTimeoutMs(exp, clock), { message: 'isolation_token_lifetime_insufficient' });
  }
});

test('matrix reporter emits six ordered PASS results and preserves the aggregate return contract', async () => {
  const [a, b] = pair();
  const reports = [];
  const result = await runIsolationMatrix(a, b, { now: () => now, report: (event) => reports.push(event),
    probe: async () => undefined, denial: async () => undefined });
  assert.deepEqual(reports, MATRIX_STEPS.map((step) => ({ step, status: 'PASS' })));
  assert.deepEqual(result, { ownSites: true, crossSitesDenied: true, ownSitesStillUsable: true });
  assert.ok(!JSON.stringify(reports).includes('SECRET'));
});

test('failure at any matrix step preserves PASS evidence, reports FAIL and skips all later operations', async () => {
  const [a, b] = pair();
  for (let failedIndex = 0; failedIndex < MATRIX_STEPS.length; failedIndex++) {
    let calls = 0;
    const reports = [];
    const operation = async () => {
      if (calls++ === failedIndex) throw new Error('isolation_denial_contract_invalid');
    };
    await assert.rejects(runIsolationMatrix(a, b, { now: () => now,
      probe: operation, denial: operation, report: (event) => reports.push(event) }),
    { message: 'isolation_denial_contract_invalid' });
    assert.equal(calls, failedIndex + 1);
    assert.deepEqual(reports, MATRIX_STEPS.map((step, index) => index < failedIndex
      ? { step, status: 'PASS' }
      : { step, status: index === failedIndex ? 'FAIL' : 'NOT_RUN', code: 'isolation_denial_contract_invalid' }));
  }
});

test('matrix reports insufficient lifetime as NOT_RUN and masks unexpected exception content', async () => {
  const [a, b] = pair();
  const reports = [];
  await assert.rejects(runIsolationMatrix(a, b, { now: () => a.binding.exp * 1_000 - 59_000,
    report: (event) => reports.push(event), probe: async () => assert.fail('must not run') }),
  { message: 'isolation_token_lifetime_insufficient' });
  assert.deepEqual(reports, MATRIX_STEPS.map((step) => ({ step, status: 'NOT_RUN', code: 'isolation_token_lifetime_insufficient' })));
  reports.length = 0;
  await assert.rejects(runIsolationMatrix(a, b, { now: () => now,
    report: (event) => reports.push(event), probe: async () => { throw new Error('SECRET_EXCEPTION'); } }),
  { message: 'SECRET_EXCEPTION' });
  assert.equal(reports[0].status, 'FAIL');
  assert.equal(reports[0].code, 'isolation_probe_failed');
  assert.ok(!JSON.stringify(reports).includes('SECRET'));
});

test('matrix reporting never calls a late success PASS after expiry or the global deadline', async () => {
  const [a, b] = pair();
  for (const [advance, code] of [[45_000, 'isolation_matrix_timeout'], [121_000, 'isolation_token_expired']]) {
    let clock = now;
    const reports = [];
    await assert.rejects(runIsolationMatrix(a, b, { now: () => clock, report: (event) => reports.push(event),
      probe: async () => { clock += advance; } }), { message: code });
    assert.deepEqual(reports, MATRIX_STEPS.map((step, index) => ({ step, status: index === 0 ? 'FAIL' : 'NOT_RUN', code })));
  }
});

test('acceptance retains the first Grant digest before second authorization failure and passes its budget', async () => {
  const [a] = pair();
  const lines = [];
  let calls = 0;
  await assert.rejects(runIsolationAcceptance({ issuer: ISSUER, clientId: CLIENT_ID, accountId, tenantId },
    'site_fixture_a', 'site_fixture_b', { now: () => now, report: (line) => lines.push(line),
      acquire: async (context, options) => {
        calls++;
        if (calls === 1) { assert.equal(context.resource, RESOURCE_A); return a; }
        assert.equal(context.resource, RESOURCE_B);
        assert.deepEqual(options, { timeoutMs: secondAuthorizationTimeoutMs(a.binding.exp, now) });
        assert.ok(lines.some((line) => /^SITE_A_GRANT_DIGEST=[0-9a-f]{12}$/u.test(line)));
        throw new Error('authorization_timeout');
      }, probe: async () => assert.fail('matrix must not run') }), { message: 'authorization_timeout' });
  assert.equal(calls, 2);
  assert.ok(!lines.some((line) => line.startsWith('SITE_B_GRANT_DIGEST=')));
  for (const step of MATRIX_STEPS) assert.ok(lines.includes(`MATRIX_${step}=NOT_RUN`));
  assert.ok(!lines.join('\n').includes('SECRET'));
});

test('acceptance refuses a second browser authorization when the first Token has no waiting budget', async () => {
  const [a] = pair();
  const lines = [];
  let calls = 0;
  await assert.rejects(runIsolationAcceptance({ issuer: ISSUER, clientId: CLIENT_ID, accountId, tenantId },
    'site_fixture_a', 'site_fixture_b', { now: () => a.binding.exp * 1_000 - 90_000,
      report: (line) => lines.push(line), acquire: async () => { calls++; return a; } }),
  { message: 'isolation_token_lifetime_insufficient' });
  assert.equal(calls, 1);
  assert.ok(lines.some((line) => line.startsWith('SITE_A_GRANT_DIGEST=')));
  assert.ok(!lines.includes('SITE_B_APPROVAL_REQUIRED=True'));
  for (const step of MATRIX_STEPS) assert.ok(lines.includes(`MATRIX_${step}=NOT_RUN`));
});

test('acceptance reports both Grant digests before the matrix without exposing tokens or Grant IDs', async () => {
  const [a, b] = pair();
  const lines = [];
  let calls = 0;
  await runIsolationAcceptance({ issuer: ISSUER, clientId: CLIENT_ID, accountId, tenantId },
    a.siteId, b.siteId, { now: () => now, report: (line) => lines.push(line),
      acquire: async () => [a, b][calls++], probe: async () => undefined, denial: async () => undefined });
  assert.equal(calls, 2);
  assert.ok(lines.findIndex((line) => line.startsWith('SITE_A_GRANT_DIGEST=')) < lines.indexOf('SITE_B_APPROVAL_REQUIRED=True'));
  assert.ok(lines.findIndex((line) => line.startsWith('SITE_B_GRANT_DIGEST=')) < lines.indexOf('MATRIX_A_TO_A_PRE=PASS'));
  for (const step of MATRIX_STEPS) assert.ok(lines.includes(`MATRIX_${step}=PASS`));
  assert.ok(lines.includes('SAME_TENANT_CROSS_SITE_RESOURCE_GRANT_ISOLATION=True'));
  assert.ok(lines.includes('REVOCATION_PROPAGATION_ISOLATION_TESTED=False'));
  assert.ok(!lines.join('\n').includes('SECRET'));
  assert.ok(!lines.join('\n').includes(a.binding.grantId));
  assert.ok(!lines.join('\n').includes(b.binding.grantId));
});

test('real Node Responses preserve exact tool order and use independent MCP sessions', async () => {
  const sessions = [];
  for (const [index, resource] of [RESOURCE_A, RESOURCE_B].entries()) {
    await probeMcp(resource, 'SECRET', { strictTransport: true,
      request: async (url, options) => {
        assert.equal(url, resource);
        assert.equal(options.redirect, 'error');
        const body = JSON.parse(options.body);
        sessions.push([index, body.method, options.headers['mcp-session-id']]);
        if (body.method === 'initialize') return Response.json({ result: { protocolVersion: '2025-06-18' } },
          { headers: { 'mcp-session-id': `session_${index}` } });
        if (body.method === 'notifications/initialized') return new Response(null, { status: 202 });
        if (body.method === 'tools/list') return Response.json({ result: { tools: EXPECTED_TOOLS.map((name) => ({ name })) } });
        assert.equal(body.method, 'tools/call');
        assert.deepEqual(body.params, { name: 'wp-auto-site-health', arguments: {} });
        return Response.json({ result: { isError: false, content: [{ text: 'SECRET_CONTENT' }] } });
      },
    });
  }
  assert.equal(sessions[0][2], undefined);
  assert.equal(sessions[4][2], undefined);
  assert.equal(sessions[1][2], 'session_0');
  assert.equal(sessions[5][2], 'session_1');
  await assert.rejects(probeMcp(RESOURCE_A, 'SECRET', { strictTransport: true,
    request: async () => new Response(null, { status: 302 }),
  }), { message: 'mcp_http_302' });
  for (const tools of [EXPECTED_TOOLS.slice(1), [...EXPECTED_TOOLS].reverse(), [...EXPECTED_TOOLS, 'unexpected_tool']]) {
    await assert.rejects(probeMcp(RESOURCE_A, 'SECRET', { strictTransport: true,
      request: async (_url, options) => {
        const body = JSON.parse(options.body);
        if (body.method === 'initialize') return Response.json({ result: { protocolVersion: '2025-06-18' } });
        if (body.method === 'notifications/initialized') return new Response(null, { status: 202 });
        assert.equal(body.method, 'tools/list');
        return Response.json({ result: { tools: tools.map((name) => ({ name })) } });
      },
    }), { message: 'mcp_tool_contract_mismatch' });
  }
});

test('local HTTP integration runs the complete matrix without token serialization or lifecycle calls', async () => {
  const [a, b] = pair();
  const methods = [];
  const server = createServer(async (request, response) => {
    const expected = request.url === '/a/mcp' ? a : request.url === '/b/mcp' ? b : undefined;
    assert.ok(expected, 'only two MCP resource paths are allowed');
    let raw = '';
    for await (const chunk of request) raw += chunk;
    assert.ok(!raw.includes('SECRET_TOKEN'));
    const body = JSON.parse(raw);
    methods.push(body.method);
    if (request.headers.authorization !== `Bearer ${expected.token}`) {
      assert.equal(request.headers['mcp-session-id'], undefined);
      response.writeHead(401, { 'www-authenticate': 'Bearer error="invalid_token"' });
      response.end();
      return;
    }
    if (body.method === 'notifications/initialized') { response.writeHead(202); response.end(); return; }
    response.setHeader('content-type', 'application/json');
    if (body.method === 'initialize') response.end(JSON.stringify({ result: { protocolVersion: '2025-06-18' } }));
    else if (body.method === 'tools/list') response.end(JSON.stringify({ result: { tools: EXPECTED_TOOLS.map((name) => ({ name })) } }));
    else {
      assert.equal(body.method, 'tools/call');
      assert.equal(body.params.name, 'wp-auto-site-health');
      response.end(JSON.stringify({ result: { isError: false, content: [{ text: 'SECRET_WP_CONTENT' }] } }));
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    await runIsolationMatrix(a, b, { request: (resource, options) => {
      assert.ok([RESOURCE_A, RESOURCE_B].includes(resource));
      return fetch(`http://127.0.0.1:${server.address().port}/${resource === RESOURCE_A ? 'a' : 'b'}/mcp`, options);
    } });
    assert.equal(methods.filter((method) => method === 'tools/call').length, 4);
    assert.equal(methods.filter((method) => method === 'initialize').length, 6);
  } finally { await new Promise((resolve) => server.close(resolve)); }
});
