import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import path from 'node:path';
import test from 'node:test';
import {
  createMockAuthorizationServer,
  isolatedEnvironment,
  parseArguments,
  publicEvidence,
  withBoundedProcess,
} from './test-codex-issuer-compat.mjs';

test('client probe requires an explicit absolute executable and accepts no network target override', () => {
  const executable = path.resolve('fixture-codex.exe');
  assert.equal(parseArguments(['--codex-exe', executable]), executable);
  for (const args of [[], ['--codex-exe', 'codex'], ['--codex-exe', executable, '--resource', 'https://production.invalid']]) {
    assert.throws(() => parseArguments(args), /codex_absolute_executable_required/u);
  }
});

test('child environment contains only OS paths and the isolated home', () => {
  const env = isolatedEnvironment('fixture-home', {
    PATH: 'fixture-path', USERPROFILE: 'fixture-profile',
    OPENAI_API_KEY: 'SECRET_API_KEY', CODEX_HOME: 'SECRET_EXISTING_HOME',
    HTTPS_PROXY: 'https://SECRET_PROXY.invalid', CODEX_AUTH_JSON: 'SECRET_CREDENTIAL_PATH',
  });
  assert.deepEqual(env, { CODEX_HOME: 'fixture-home', RUST_LOG: 'off', PATH: 'fixture-path', USERPROFILE: 'fixture-profile' });
  assert.ok(!JSON.stringify(env).includes('SECRET'));
});

test('real mock HTTP fixture publishes issuer binding and rejects invalid PKCE without revealing test secrets', async (t) => {
  const mock = await createMockAuthorizationServer();
  t.after(() => mock.close());
  const challenged = await fetch(`${mock.base}/mcp`);
  assert.equal(challenged.status, 401);
  assert.equal(challenged.headers.get('www-authenticate'),
    `Bearer resource_metadata="${mock.base}/.well-known/oauth-protected-resource/mcp"`);
  await challenged.text();
  const metadata = await (await fetch(`${mock.base}/.well-known/oauth-authorization-server`)).json();
  assert.equal(metadata.issuer, mock.base);
  assert.equal(metadata.authorization_response_iss_parameter_supported, true);
  const authorize = new URL(`${mock.base}/authorize`);
  authorize.search = new URLSearchParams({
    client_id: 'wepuu-local-probe', resource: `${mock.base}/mcp`, scope: 'mcp:read',
    code_challenge_method: 'S256', code_challenge: createHash('sha256').update('SECRET_VERIFIER').digest('base64url'),
    state: 'SECRET_STATE', redirect_uri: 'http://127.0.0.1:49123/callback',
  });
  const callback = mock.callback(authorize.href, 'matching', '/callback');
  assert.equal(callback.searchParams.get('iss'), mock.base);
  const denied = await fetch(`${mock.base}/token`, {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code: callback.searchParams.get('code'), grant_type: 'authorization_code', client_id: 'wepuu-local-probe',
      redirect_uri: 'http://127.0.0.1:49123/callback', resource: `${mock.base}/mcp`, code_verifier: 'WRONG_SECRET_VERIFIER',
    }),
  });
  assert.equal(denied.status, 400);
  assert.equal(await denied.text(), '{"error":"invalid_grant"}');
  assert.equal(mock.tokenRequests, 1);
  assert.equal(mock.tokenAccepted, 0);
});

test('mock callback refuses external authorization origins, redirect hosts and path changes', async (t) => {
  const mock = await createMockAuthorizationServer();
  t.after(() => mock.close());
  const authorize = new URL(`${mock.base}/authorize`);
  authorize.search = new URLSearchParams({ client_id: 'wepuu-local-probe', scope: 'mcp:read',
    resource: `${mock.base}/mcp`, code_challenge_method: 'S256', code_challenge: 'fixture', state: 's',
    redirect_uri: 'http://127.0.0.1:49123/callback' });
  assert.throws(() => mock.callback(authorize.href.replace(mock.base, 'https://production.invalid'), 'matching', '/callback'),
    /mock_authorization_invalid/u);
  for (const redirect of ['http://localhost:49123/callback', 'https://remote.invalid/callback', 'http://127.0.0.1:49123/other']) {
    authorize.searchParams.set('redirect_uri', redirect);
    assert.throws(() => mock.callback(authorize.href, 'matching', '/callback'), /mock_callback_invalid/u);
  }
});

test('bounded process stops a hung real child and does not expose child output on timeout', async () => {
  let pid;
  await assert.rejects(withBoundedProcess(process.execPath, [
    '-e', 'console.log("SECRET_CHILD_OUTPUT"); setInterval(() => {}, 1000)',
  ], { timeoutMs: 150 }, async ({ child, exit }) => {
    pid = child.pid;
    return await exit;
  }), (error) => error.message === 'codex_probe_timeout');
  assert.ok(pid);
  assert.throws(() => process.kill(pid, 0), (error) => error.code === 'ESRCH');
});

test('bounded process completes normally and retains output only in its private result', async () => {
  const result = await withBoundedProcess(process.execPath, ['-e', 'process.stdout.write("SECRET_CHILD_OUTPUT")'],
    { timeoutMs: 5_000 }, async ({ exit, output }) => {
      const exitCode = await exit;
      return { exitCode, ...output() };
    });
  assert.equal(result.exitCode, 0);
  assert.equal(result.stdout, 'SECRET_CHILD_OUTPUT');
});

test('public probe evidence excludes callback, token, URL and captured process output', () => {
  const evidence = publicEvidence({ version: 'codex-cli 0.162.0-alpha.17.2', executableSha256: 'a'.repeat(64),
    credential: 'SECRET_CREDENTIAL' }, {
    mode: 'cli', scenario: 'matching', callbackShape: 'specific', success: true, tokenRequests: 1, passed: true,
    callback: 'SECRET_CALLBACK', token: 'SECRET_TOKEN', stdout: 'SECRET_STDOUT', stderr: 'SECRET_STDERR',
  });
  assert.ok(!JSON.stringify(evidence).includes('SECRET'));
  assert.deepEqual(Object.keys(evidence), ['version', 'executableSha256', 'mode', 'scenario', 'callbackShape',
    'success', 'tokenRequests', 'passed', 'failureClass']);
});
