import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  MCP_RESOURCE,
  OAUTH_CALLBACK_URL,
  OAUTH_CLIENT_ID,
  OAUTH_ISSUER,
  createServerName,
  parseDesktopManifest,
  prepareDesktopProject,
  probePublicOAuthMetadata,
  renderProjectConfig,
  resolveDefaultManifestPath,
  validateAuthorizationMetadata,
  validateChallenge,
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
  await writeFile(manifestPath, manifest, 'utf8');
  const prepared = await prepareDesktopProject({
    manifestPath,
    outputRoot: root,
    now: new Date('2026-10-12T00:00:00Z'),
    random: '0123abcd',
    fetchImpl: successfulFetch()
  });
  assert.equal(path.dirname(path.dirname(prepared.configPath)), prepared.projectDirectory);
  assert.equal(await readFile(prepared.configPath, 'utf8'), renderProjectConfig(prepared.serverName));
  await assert.rejects(() => prepareDesktopProject({
    manifestPath,
    outputRoot: root,
    now: new Date('2026-10-12T00:00:00Z'),
    random: '0123abcd',
    fetchImpl: successfulFetch()
  }), /EEXIST/u);
});

test('preflight source never reads or copies user credential files', async () => {
  const source = await readFile(new URL('./prepare-codex-desktop-preflight.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /auth\.json|\.credentials\.json|Copy-Item|USERPROFILE|CODEX_HOME/u);
});
