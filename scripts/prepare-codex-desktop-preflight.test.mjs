import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { PassThrough } from 'node:stream';
import {
  MCP_RESOURCE,
  OAUTH_CALLBACK_URL,
  OAUTH_CLIENT_ID,
  OAUTH_ISSUER,
  EXISTING_DESKTOP_SERVER_NAME,
  assertGlobalConfigUnchanged,
  configDigest,
  createServerName,
  expectedDesktopServer,
  inspectDesktopServer,
  parseDesktopManifest,
  planTemporaryGlobalConfig,
  planTemporaryGlobalRollback,
  prepareDesktopProject,
  probePublicOAuthMetadata,
  readDesktopCallbackFile,
  readDesktopConfig,
  renderProjectConfig,
  resolveDefaultManifestPath,
  summarizeDesktopConfigRead,
  validateAuthorizationMetadata,
  validateChallenge,
  validateDesktopCallbackUrl,
  validateResourceMetadata
} from './prepare-codex-desktop-preflight.mjs';

const manifest = '<Package><Identity Name="OpenAI.CodexBeta" ProcessorArchitecture="x64" Version="26.727.4816.0" /></Package>';
const resourceMetadata = {
  resource: MCP_RESOURCE,
  authorization_servers: [OAUTH_ISSUER],
  scopes_supported: ['mcp:read', 'mcp:content.write', 'mcp:media.write', 'mcp:taxonomy.write', 'mcp:seo.write'],
  bearer_methods_supported: ['header']
};
const authorizationMetadata = {
  issuer: OAUTH_ISSUER,
  authorization_response_iss_parameter_supported: true,
  code_challenge_methods_supported: ['S256'],
  token_endpoint_auth_methods_supported: ['none']
};

function response(body, init) {
  return new Response(body === undefined ? null : JSON.stringify(body), init);
}

function successfulFetch() {
  return async (url, options) => {
    if (url === MCP_RESOURCE) {
      assert.equal(options.redirect, 'error');
      return response({ error: 'unauthorized' }, {
        status: 401,
        headers: { 'www-authenticate': `Bearer resource_metadata="${MCP_RESOURCE.replace('/wp-json/', '/.well-known/oauth-protected-resource/wp-json/')}"` }
      });
    }
    if (url === `${MCP_RESOURCE.replace('/wp-json/', '/.well-known/oauth-protected-resource/wp-json/')}`) {
      assert.equal(options.redirect, 'manual');
      return response(undefined, { status: 301, headers: { location: `${url}/` } });
    }
    if (url === `${MCP_RESOURCE.replace('/wp-json/', '/.well-known/oauth-protected-resource/wp-json/')}/`) {
      return response(resourceMetadata, { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (url === `${OAUTH_ISSUER}/.well-known/openid-configuration`) {
      return response(authorizationMetadata, { status: 200, headers: { 'content-type': 'application/json' } });
    }
    throw new Error('unexpected_url');
  };
}

test('parses the exact installed Desktop package identity and version', () => {
  assert.deepEqual(parseDesktopManifest(manifest), { packageName: 'OpenAI.CodexBeta', version: '26.727.4816.0' });
  assert.throws(() => parseDesktopManifest(manifest.replace('OpenAI.CodexBeta', 'Other.App')), /manifest_invalid/u);
});

test('accepts the current production Desktop package with reordered manifest attributes', () => {
  assert.deepEqual(parseDesktopManifest('<Identity Version="26.1007.2314.0" Name="OpenAI.Codex" />'),
    { packageName: 'OpenAI.Codex', version: '26.1007.2314.0' });
  assert.throws(() => parseDesktopManifest('<Identity Name="OpenAI.Codex" Version="unknown" />'), /version_invalid/u);
  assert.throws(() => parseDesktopManifest('<Identity Name="OpenAI.CodexOther" Version="26.1.1.0" />'), /manifest_invalid/u);
});

test('derives the Appx manifest from the packaged Codex executable', async () => {
  const result = await resolveDefaultManifestPath(async (command, args) => {
    assert.equal(command, 'where.exe');
    assert.deepEqual(args, ['codex']);
    return {
      stdout: 'C:\\Program Files\\WindowsApps\\OpenAI.CodexBeta_26.727.4816.0_x64__2p2nqsd0c76g0\\app\\resources\\codex.exe\r\n',
      stderr: ''
    };
  }, 'win32');
  assert.equal(result, 'C:\\Program Files\\WindowsApps\\OpenAI.CodexBeta_26.727.4816.0_x64__2p2nqsd0c76g0\\AppxManifest.xml');
});

test('supports a packaged production executable without inferring the Desktop version from a cached backend', async () => {
  const root = 'C:\\Program Files\\WindowsApps\\OpenAI.Codex_26.1007.2314.0_x64__2p2nqsd0c76g0';
  assert.equal(await resolveDefaultManifestPath(async () => ({ stdout: `${root}\\app\\resources\\codex.exe` }), 'win32'),
    `${root}\\AppxManifest.xml`);
  await assert.rejects(resolveDefaultManifestPath(async () => ({ stdout: 'C:\\cached\\codex.exe' }), 'win32'),
    /executable_not_found/u);
});

const privateCallback = 'http://127.0.0.1/callback/SECRET_CALLBACK_SENTINEL';
const privateCallbackDigest = configDigest(privateCallback);

test('projects only fixed config matches and a callback digest, not sensitive fields', () => {
  const server = expectedDesktopServer(privateCallback);
  const summary = inspectDesktopServer(server, privateCallbackDigest);
  assert.equal(summary.matches, true);
  assert.equal(summary.callbackDigest, privateCallbackDigest);
  assert.ok(!JSON.stringify(summary).includes('SECRET'));
  for (const invalid of [
    { ...server, enabled: false },
    { ...server, url: 'https://other.invalid/mcp' },
    { ...server, scopes: ['mcp:read', 'mcp:content.write'] },
    { ...server, oauth: { ...server.oauth, client_id: 'other' } },
    { ...server, oauth: { ...server.oauth, callback_url: `${privateCallback}?SECRET=x` } },
    { ...server, http_headers: { Authorization: 'SECRET_TOKEN' } },
    { ...server, bearer_token_env_var: 'SECRET_TOKEN' },
    { ...server, oauth: { ...server.oauth, client_secret: 'SECRET_CREDENTIAL' } },
    { ...server, auth: 'chatgpt' },
  ]) {
    const rejected = inspectDesktopServer(invalid, privateCallbackDigest);
    assert.equal(rejected.matches, false);
    assert.ok(!JSON.stringify(rejected).includes('SECRET'));
  }
});

function configReadFixture(userServer) {
  return { config: {}, layers: [
    { name: { type: 'project' }, disabledReason: 'To load this config, trust the project SECRET_CONTEXT',
      config: { mcp_servers: { [EXISTING_DESKTOP_SERVER_NAME]: expectedDesktopServer(privateCallback) } } },
    { name: { type: 'user' }, config: { mcp_servers: { node_repl: { command: 'existing' },
      ...(userServer === undefined ? {} : { [EXISTING_DESKTOP_SERVER_NAME]: userServer }) } } },
    { name: { type: 'system' }, config: {} },
  ] };
}

test('a disabled project layer never counts as a loaded MCP server', () => {
  const summary = summarizeDesktopConfigRead(configReadFixture(), EXISTING_DESKTOP_SERVER_NAME, privateCallbackDigest);
  assert.equal(summary.projectLayerDisabled, true);
  assert.equal(summary.disabledProjectTrustMention, true);
  assert.equal(summary.targetPresent, false);
  assert.equal(summary.targetMatches, false);
  assert.ok(!JSON.stringify(summary).includes('SECRET'));
});

test('enabled user layer is validated without assuming typed config includes MCP or guessing partial merges', () => {
  const fixture = configReadFixture(expectedDesktopServer(privateCallback));
  assert.equal(summarizeDesktopConfigRead(fixture, EXISTING_DESKTOP_SERVER_NAME, privateCallbackDigest).targetMatches, true);
  fixture.layers[0].disabledReason = null;
  fixture.layers[0].config.mcp_servers[EXISTING_DESKTOP_SERVER_NAME].scopes = ['mcp:content.write'];
  assert.equal(summarizeDesktopConfigRead(fixture, EXISTING_DESKTOP_SERVER_NAME, privateCallbackDigest).targetMatches, false);
  assert.throws(() => summarizeDesktopConfigRead({}, EXISTING_DESKTOP_SERVER_NAME, privateCallbackDigest), /layers_missing/u);
});

test('registration preserves unrelated TOML bytes and permits only absent or exactly matching entries', () => {
  for (const baseline of ['', 'model = "existing"\n[mcp_servers.node_repl]\ncommand = "existing"\n',
    'model = "existing"\r\n[mcp_servers.node_repl]\r\ncommand = "existing"']) {
    const plan = planTemporaryGlobalConfig(baseline, privateCallback);
    assert.equal(plan.changed, true);
    assert.ok(plan.contents.startsWith(baseline));
    assert.ok(!JSON.stringify(plan.receipt).includes('SECRET'));
    assert.equal(planTemporaryGlobalConfig(plan.contents, privateCallback, expectedDesktopServer(privateCallback)).changed, false);
    assert.equal(planTemporaryGlobalRollback(plan.contents, plan).contents, baseline);
  }
  assert.throws(() => planTemporaryGlobalConfig('', privateCallback, { url: MCP_RESOURCE }), /server_conflict/u);
  assert.throws(() => planTemporaryGlobalConfig(`[mcp_servers."${EXISTING_DESKTOP_SERVER_NAME}"]`, privateCallback),
    /server_conflict/u);
});

test('concurrent file changes are rejected rather than overwritten', () => {
  const baseline = 'model = "existing"\n';
  const plan = planTemporaryGlobalConfig(baseline, privateCallback);
  assertGlobalConfigUnchanged(baseline, plan.receipt.baselineDigest);
  assert.throws(() => assertGlobalConfigUnchanged(`${baseline}# user edit\n`, plan.receipt.baselineDigest), /concurrent_change/u);
});

test('a trusted-project entry mentioning the server directory is not an MCP server conflict', () => {
  const baseline = `[projects."C:/temporary/${EXISTING_DESKTOP_SERVER_NAME}"]\ntrust_level = "trusted"\n`;
  const plan = planTemporaryGlobalConfig(baseline, privateCallback);
  assert.equal(plan.changed, true);
  assert.ok(plan.contents.startsWith(baseline));
});

test('rollback only removes the exact owned suffix and preserves unrelated edits', () => {
  const baseline = 'model = "existing"\n';
  const plan = planTemporaryGlobalConfig(baseline, privateCallback);
  assert.equal(planTemporaryGlobalRollback(`# user edit\n${plan.contents}`, plan).contents, `# user edit\n${baseline}`);
  assert.throws(() => planTemporaryGlobalRollback(`${plan.contents}# later edit\n`, plan), /rollback_conflict/u);
  assert.throws(() => planTemporaryGlobalRollback(plan.contents.replace('scopes = ["mcp:read"]', 'scopes = []'), plan),
    /rollback_conflict/u);
  assert.equal(planTemporaryGlobalRollback(baseline, { changed: false, receipt: null }).changed, false);
});

test('config inspection uses only initialize and config/read, never OAuth or tool invocation', async () => {
  const methods = [];
  const fixture = configReadFixture(expectedDesktopServer(privateCallback));
  const result = await readDesktopConfig(path.resolve('fixture-codex.exe'), path.resolve('fixture-project'),
    EXISTING_DESKTOP_SERVER_NAME, privateCallbackDigest, {
      runProcess: async (_executable, args, options, action) => {
        assert.deepEqual(args, ['app-server', '--stdio']);
        assert.equal(options.timeoutMs, 15_000);
        const stdout = new PassThrough();
        const stdin = new PassThrough();
        stdin.on('data', (chunk) => {
          for (const line of chunk.toString().trim().split('\n')) {
            const request = JSON.parse(line);
            methods.push(request.method);
            if (request.id !== undefined) queueMicrotask(() => stdout.write(`${JSON.stringify({ id: request.id,
              result: request.method === 'config/read' ? fixture : {} })}\n`));
          }
        });
        return await action({ child: { stdin, stdout }, signal: new AbortController().signal });
      },
    });
  assert.deepEqual(methods, ['initialize', 'initialized', 'config/read']);
  assert.equal(result.summary.targetMatches, true);
});

test('renders an isolated read-only OAuth configuration', () => {
  const name = createServerName(new Date('2026-10-12T00:00:00Z'), '0123abcd');
  const config = renderProjectConfig(name);
  assert.equal(name, 'wepuu-p3b1-desktop-20261012-0123abcd');
  assert.match(config, new RegExp(`url = "${MCP_RESOURCE.replaceAll('.', '\\.') }"`, 'u'));
  assert.match(config, /scopes = \["mcp:read"\]/u);
  assert.match(config, new RegExp(`client_id = "${OAUTH_CLIENT_ID}"`, 'u'));
  assert.match(config, new RegExp(`callback_url = "${OAUTH_CALLBACK_URL.replaceAll('.', '\\.') }"`, 'u'));
  assert.doesNotMatch(config, /token|cookie|verifier|authorization_url|auth\.json|credentials/u);
});

test('accepts only an exact callback-specific loopback path', async (t) => {
  const callback = 'http://127.0.0.1/callback/Abcd_1234-xy';
  assert.equal(validateDesktopCallbackUrl(callback), callback);
  for (const invalid of [
    'http://localhost/callback/Abcd_1234-xy',
    'http://127.0.0.1:53123/callback/Abcd_1234-xy',
    'http://127.0.0.1/callback/Abcd_1234-xy/extra',
    'http://127.0.0.1/callback/short',
    'http://127.0.0.1/callback/Abcd_1234-xy?next=1',
    'https://127.0.0.1/callback/Abcd_1234-xy'
  ]) assert.throws(() => validateDesktopCallbackUrl(invalid), /callback_invalid/u);

  const root = await mkdtemp(path.join(tmpdir(), 'wepuu-p3b1-callback-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const callbackFile = path.join(root, 'callback');
  await writeFile(callbackFile, `${callback}\n`, 'utf8');
  assert.equal(await readDesktopCallbackFile(callbackFile), callback);
  await writeFile(callbackFile, `${callback}\n${callback}\n`, 'utf8');
  await assert.rejects(() => readDesktopCallbackFile(callbackFile), /callback_file_invalid/u);
});

test('validates the strict public challenge and OAuth metadata contracts', () => {
  validateChallenge(401, `Bearer resource_metadata="${MCP_RESOURCE.replace('/wp-json/', '/.well-known/oauth-protected-resource/wp-json/')}"`);
  validateResourceMetadata(resourceMetadata);
  validateAuthorizationMetadata(authorizationMetadata);
  assert.throws(() => validateChallenge(200, ''), /challenge_status_invalid/u);
  assert.throws(() => validateResourceMetadata({ ...resourceMetadata, scopes_supported: ['mcp:read'] }), /scopes_mismatch/u);
  assert.throws(() => validateAuthorizationMetadata({ ...authorizationMetadata, code_challenge_methods_supported: ['plain'] }), /pkce_s256_missing/u);
});

test('accepts only the expected same-origin trailing-slash metadata redirect', async () => {
  assert.deepEqual(await probePublicOAuthMetadata(successfulFetch()), { redirectObserved: true });
  const badFetch = successfulFetch();
  await assert.rejects(() => probePublicOAuthMetadata(async (url, options) => {
    if (url.includes('.well-known/oauth-protected-resource') && !url.endsWith('/')) {
      return response(undefined, { status: 302, headers: { location: 'https://evil.example/metadata' } });
    }
    return await badFetch(url, options);
  }), /resource_metadata_redirect_invalid/u);
});

test('creates only a project-scoped config under the selected temporary root', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'wepuu-p3b1-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const manifestPath = path.join(root, 'AppxManifest.xml');
  const callbackPath = path.join(root, 'callback');
  const callback = 'http://127.0.0.1/callback/Abcd_1234-xy';
  await writeFile(manifestPath, manifest, 'utf8');
  await writeFile(callbackPath, callback, 'utf8');
  const prepared = await prepareDesktopProject({
    manifestPath,
    outputRoot: root,
    now: new Date('2026-10-12T00:00:00Z'),
    random: '0123abcd',
    fetchImpl: successfulFetch(),
    callbackFile: callbackPath
  });
  assert.equal(path.dirname(path.dirname(prepared.configPath)), prepared.projectDirectory);
  assert.equal(await readFile(prepared.configPath, 'utf8'), renderProjectConfig(prepared.serverName, callback));
  assert.match(prepared.callbackDigest, /^[a-f0-9]{64}$/u);
  await assert.rejects(() => prepareDesktopProject({
    manifestPath,
    outputRoot: root,
    now: new Date('2026-10-12T00:00:00Z'),
    random: '0123abcd',
    fetchImpl: successfulFetch(),
    callbackFile: callbackPath
  }), /EEXIST/u);
});

test('preflight source never reads or copies user credential files', async () => {
  const source = await readFile(new URL('./prepare-codex-desktop-preflight.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /auth\.json|\.credentials\.json|Copy-Item|USERPROFILE|CODEX_HOME/u);
});
