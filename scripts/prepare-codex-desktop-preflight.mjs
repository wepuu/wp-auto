import { createHash, randomBytes } from 'node:crypto';
import { execFile as execFileCallback } from 'node:child_process';
import { lstat, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import readline from 'node:readline';
import { withBoundedProcess } from './test-codex-issuer-compat.mjs';

const execFile = promisify(execFileCallback);

export const DESKTOP_PACKAGE_NAME = 'OpenAI.CodexBeta';
export const DESKTOP_PACKAGE_NAMES = ['OpenAI.Codex', DESKTOP_PACKAGE_NAME];
export const EXISTING_DESKTOP_SERVER_NAME = 'wepuu-p3b1-desktop-20261012-8f57f886';
export const MCP_RESOURCE = 'https://test.wpauto.cc/wp-json/wp-auto/mcp';
export const RESOURCE_METADATA_URL = 'https://test.wpauto.cc/.well-known/oauth-protected-resource/wp-json/wp-auto/mcp';
export const OAUTH_ISSUER = 'https://auth.wpauto.cc';
export const OAUTH_CLIENT_ID = 'wepuu-e2e-codex';
export const OAUTH_CALLBACK_URL = 'http://127.0.0.1/callback';
export const OAUTH_SCOPES = ['mcp:read'];
export const ADVERTISED_MCP_SCOPES = [
  'mcp:read',
  'mcp:content.write',
  'mcp:media.write',
  'mcp:taxonomy.write',
  'mcp:seo.write'
];

function assertRecord(value, code) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error(code);
  return value;
}

function assertExactStringArray(value, expected, code) {
  if (!Array.isArray(value) || value.length !== expected.length
      || value.some((item, index) => item !== expected[index])) {
    throw new Error(code);
  }
}

export function parseDesktopManifest(xml) {
  const identity = xml.match(/<Identity\s+[^>]*\/?\s*>/u)?.[0];
  const name = identity?.match(/\bName="([^"]+)"/u)?.[1];
  const version = identity?.match(/\bVersion="([^"]+)"/u)?.[1];
  if (!DESKTOP_PACKAGE_NAMES.includes(name) || version === undefined) {
    throw new Error('codex_desktop_manifest_invalid');
  }
  if (!/^\d+\.\d+\.\d+\.\d+$/u.test(version)) throw new Error('codex_desktop_version_invalid');
  return { packageName: name, version };
}

export function configDigest(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function expectedDesktopServer(callbackUrl) {
  return { url: MCP_RESOURCE, oauth_resource: MCP_RESOURCE, scopes: [...OAUTH_SCOPES],
    default_tools_approval_mode: 'prompt',
    oauth: { client_id: OAUTH_CLIENT_ID, callback_url: validateDesktopCallbackUrl(callbackUrl) } };
}

export function inspectDesktopServer(server, expectedCallbackDigest) {
  const present = server !== null && typeof server === 'object' && !Array.isArray(server);
  const callback = present && typeof server.oauth?.callback_url === 'string' ? server.oauth.callback_url : undefined;
  let callbackValid = false;
  if (callback !== undefined) {
    try { validateDesktopCallbackUrl(callback); callbackValid = true; } catch { /* fixed booleans only */ }
  }
  const allowed = ['url', 'oauth_resource', 'scopes', 'default_tools_approval_mode', 'oauth', 'enabled', 'auth'];
  const unexpectedFields = present && (Object.keys(server).some((key) => !allowed.includes(key))
    || Object.keys(server.oauth ?? {}).some((key) => !['client_id', 'callback_url'].includes(key)));
  const evidence = {
    present,
    enabled: present && server.enabled !== false,
    resourceMatch: present && server.url === MCP_RESOURCE && server.oauth_resource === MCP_RESOURCE,
    clientMatch: present && server.oauth?.client_id === OAUTH_CLIENT_ID,
    readScopeOnly: present && Array.isArray(server.scopes) && server.scopes.length === 1 && server.scopes[0] === 'mcp:read',
    callbackValid,
    callbackDigest: callbackValid ? configDigest(callback) : null,
    callbackMatch: callbackValid && configDigest(callback) === expectedCallbackDigest,
    approvalMatch: present && server.default_tools_approval_mode === 'prompt',
    oauthMode: present && (server.auth === undefined || server.auth === 'oauth'),
    unexpectedFields: Boolean(unexpectedFields),
  };
  return { ...evidence, matches: present && evidence.enabled && evidence.resourceMatch && evidence.clientMatch
    && evidence.readScopeOnly && evidence.callbackMatch && evidence.approvalMatch && evidence.oauthMode && !unexpectedFields };
}

export function summarizeDesktopConfigRead(result, serverName, expectedCallbackDigest) {
  if (!Array.isArray(result?.layers)) throw new Error('codex_config_layers_missing');
  const targetLayers = result.layers.filter((layer) => layer.config?.mcp_servers?.[serverName] !== undefined);
  const enabled = targetLayers.filter((layer) => !layer.disabledReason);
  // config/read's typed config omits MCP fields in this pinned backend. Inspect its
  // raw layers, refusing differing/partial definitions rather than guessing merges.
  const checks = enabled.map((layer) => inspectDesktopServer(layer.config.mcp_servers[serverName], expectedCallbackDigest));
  return {
    serverName,
    projectLayerDisabled: targetLayers.some((layer) => layer.name?.type === 'project' && Boolean(layer.disabledReason)),
    disabledProjectTrustMention: targetLayers.some((layer) => layer.name?.type === 'project'
      && /trust/iu.test(layer.disabledReason ?? '')),
    enabledTargetLayerTypes: enabled.map((layer) => layer.name?.type ?? 'unknown'),
    targetPresent: enabled.length > 0,
    targetMatches: checks.length > 0 && checks.every((check) => check.matches),
    callbackDigest: checks.length > 0 && checks.every((check) => check.callbackMatch) ? expectedCallbackDigest : null,
  };
}

export async function readDesktopConfig(executable, cwd, serverName, expectedCallbackDigest, options = {}) {
  if (!path.isAbsolute(executable) || !path.isAbsolute(cwd)) throw new Error('codex_config_absolute_paths_required');
  const runProcess = options.runProcess ?? withBoundedProcess;
  return await runProcess(executable, ['app-server', '--stdio'], { cwd, env: options.env, timeoutMs: 15_000 },
    async ({ child, signal }) => {
      const reader = readline.createInterface({ input: child.stdout });
      let nextId = 0;
      const pending = new Map();
      reader.on('line', (line) => {
        let message;
        try { message = JSON.parse(line); } catch { return; }
        const resolve = pending.get(message.id);
        if (resolve) { pending.delete(message.id); resolve(message); }
      });
      const call = (method, params) => new Promise((resolve) => {
        const id = ++nextId;
        pending.set(id, resolve);
        child.stdin.write(`${JSON.stringify({ id, method, params })}\n`);
      });
      try {
        const initialized = await call('initialize', { clientInfo: { name: 'wepuu_config_probe', version: '0.1.0' },
          capabilities: { experimentalApi: true } });
        if (initialized.error) throw new Error('codex_config_initialize_failed');
        child.stdin.write('{"method":"initialized"}\n');
        const response = await call('config/read', { cwd, includeLayers: true });
        if (response.error) throw new Error('codex_config_read_failed');
        signal.throwIfAborted();
        const summary = summarizeDesktopConfigRead(response.result, serverName, expectedCallbackDigest);
        const userLayers = response.result.layers.filter((layer) => layer.name?.type === 'user' && !layer.disabledReason);
        if (userLayers.length !== 1) throw new Error('codex_user_config_layer_ambiguous');
        return { summary, userServer: userLayers[0].config?.mcp_servers?.[serverName] };
      } finally { reader.close(); }
    });
}

export function planTemporaryGlobalConfig(contents, callbackUrl, existingServer) {
  const name = EXISTING_DESKTOP_SERVER_NAME;
  const expectedDigest = configDigest(validateDesktopCallbackUrl(callbackUrl));
  if (existingServer !== undefined) {
    if (!inspectDesktopServer(existingServer, expectedDigest).matches) throw new Error('codex_global_server_conflict');
    return { changed: false, contents, receipt: null };
  }
  // A trusted-project path can contain the same server name without declaring
  // that server. Check only a target MCP table in addition to parser absence.
  const targetTable = new RegExp(`^\\s*\\[\\s*mcp_servers\\s*\\.\\s*(?:"${name}"|'${name}'|${name})\\s*(?:\\]|\\.)`, 'mu');
  if (targetTable.test(contents)) throw new Error('codex_global_server_conflict');
  const newline = contents.includes('\r\n') ? '\r\n' : '\n';
  const baselineDigest = configDigest(contents);
  const marker = `# WPAuto P3-B1B temporary MCP; baseline ${baselineDigest}`;
  const block = `${marker}\n${renderProjectConfig(name, callbackUrl)}`.replaceAll('\n', newline);
  const separator = contents.endsWith(newline) || contents.length === 0 ? '' : newline;
  const appended = `${separator}${newline}${block}`;
  const updated = contents + appended;
  return { changed: true, contents: updated, appended,
    receipt: { serverName: name, baselineDigest, afterDigest: configDigest(updated), appendedDigest: configDigest(appended) } };
}

export function assertGlobalConfigUnchanged(contents, expectedDigest) {
  if (configDigest(contents) !== expectedDigest) throw new Error('codex_global_config_concurrent_change');
}

export function planTemporaryGlobalRollback(contents, registration) {
  if (!registration.changed || registration.receipt === null) return { changed: false, contents };
  const { appended, receipt } = registration;
  if (configDigest(appended) !== receipt.appendedDigest || !contents.endsWith(appended)) {
    throw new Error('codex_global_rollback_conflict');
  }
  // Remove only our exact suffix; retain unrelated user changes before it.
  return { changed: true, contents: contents.slice(0, -appended.length) };
}

export function createServerName(now = new Date(), random = randomBytes(4).toString('hex')) {
  if (!/^[a-f0-9]{8}$/u.test(random)) throw new Error('server_name_random_invalid');
  const day = now.toISOString().slice(0, 10).replaceAll('-', '');
  return `wepuu-p3b1-desktop-${day}-${random}`;
}

export function validateDesktopCallbackUrl(value) {
  if (value === OAUTH_CALLBACK_URL) return value;
  if (value.length > 256 || !/^http:\/\/127\.0\.0\.1\/callback\/[A-Za-z0-9_-]{8,64}$/u.test(value)) {
    throw new Error('codex_desktop_callback_invalid');
  }
  const parsed = new URL(value);
  if (parsed.href !== value || parsed.port !== '' || parsed.search !== '' || parsed.hash !== ''
      || parsed.username !== '' || parsed.password !== '') throw new Error('codex_desktop_callback_invalid');
  return value;
}

export async function readDesktopCallbackFile(filePath) {
  const details = await lstat(filePath);
  if (!details.isFile() || details.isSymbolicLink() || details.size < 1 || details.size > 300) {
    throw new Error('codex_desktop_callback_file_invalid');
  }
  const contents = await readFile(filePath, 'utf8');
  if (!/^[^\r\n]+(?:\r?\n)?$/u.test(contents)) throw new Error('codex_desktop_callback_file_invalid');
  return validateDesktopCallbackUrl(contents.replace(/\r?\n$/u, ''));
}

export function renderProjectConfig(serverName, callbackUrl = OAUTH_CALLBACK_URL) {
  if (!/^wepuu-p3b1-desktop-\d{8}-[a-f0-9]{8}$/u.test(serverName)) {
    throw new Error('server_name_invalid');
  }
  const validatedCallback = validateDesktopCallbackUrl(callbackUrl);
  return `[mcp_servers.${serverName}]\n`
    + `url = "${MCP_RESOURCE}"\n`
    + `oauth_resource = "${MCP_RESOURCE}"\n`
    + `scopes = ["${OAUTH_SCOPES[0]}"]\n`
    + 'default_tools_approval_mode = "prompt"\n\n'
    + `[mcp_servers.${serverName}.oauth]\n`
    + `client_id = "${OAUTH_CLIENT_ID}"\n`
    + `callback_url = "${validatedCallback}"\n`;
}

export function validateChallenge(status, authenticate) {
  if (status !== 401) throw new Error('mcp_challenge_status_invalid');
  const match = authenticate?.match(/\bresource_metadata="([^"]+)"/u);
  if (match?.[1] !== RESOURCE_METADATA_URL) throw new Error('mcp_resource_metadata_challenge_invalid');
}

export function validateResourceMetadata(metadata) {
  const value = assertRecord(metadata, 'resource_metadata_invalid');
  if (value.resource !== MCP_RESOURCE) throw new Error('resource_metadata_resource_mismatch');
  assertExactStringArray(value.authorization_servers, [OAUTH_ISSUER], 'resource_metadata_issuer_mismatch');
  assertExactStringArray(value.scopes_supported, ADVERTISED_MCP_SCOPES, 'resource_metadata_scopes_mismatch');
  assertExactStringArray(value.bearer_methods_supported, ['header'], 'resource_metadata_bearer_method_mismatch');
}

export function validateAuthorizationMetadata(metadata) {
  const value = assertRecord(metadata, 'authorization_metadata_invalid');
  if (value.issuer !== OAUTH_ISSUER) throw new Error('authorization_metadata_issuer_mismatch');
  if (value.authorization_response_iss_parameter_supported !== true) {
    throw new Error('authorization_response_issuer_binding_missing');
  }
  if (!Array.isArray(value.code_challenge_methods_supported)
      || !value.code_challenge_methods_supported.includes('S256')) {
    throw new Error('pkce_s256_missing');
  }
  if (!Array.isArray(value.token_endpoint_auth_methods_supported)
      || !value.token_endpoint_auth_methods_supported.includes('none')) {
    throw new Error('public_client_auth_method_missing');
  }
}

async function request(fetchImpl, url, options = {}) {
  return await fetchImpl(url, { signal: AbortSignal.timeout(10_000), ...options });
}

export async function probePublicOAuthMetadata(fetchImpl = fetch) {
  const challenge = await request(fetchImpl, MCP_RESOURCE, { redirect: 'error' });
  validateChallenge(challenge.status, challenge.headers.get('www-authenticate'));
  await challenge.body?.cancel();

  const initial = await request(fetchImpl, RESOURCE_METADATA_URL, { redirect: 'manual' });
  let resourceResponse = initial;
  let redirectObserved = false;
  if (initial.status >= 300 && initial.status < 400) {
    redirectObserved = true;
    const location = initial.headers.get('location');
    const expected = `${RESOURCE_METADATA_URL}/`;
    if (location !== expected) throw new Error('resource_metadata_redirect_invalid');
    await initial.body?.cancel();
    resourceResponse = await request(fetchImpl, expected, { redirect: 'error' });
  }
  if (resourceResponse.status !== 200) throw new Error('resource_metadata_status_invalid');
  validateResourceMetadata(await resourceResponse.json());

  const authorizationResponse = await request(fetchImpl, `${OAUTH_ISSUER}/.well-known/openid-configuration`, {
    redirect: 'error'
  });
  if (authorizationResponse.status !== 200) throw new Error('authorization_metadata_status_invalid');
  validateAuthorizationMetadata(await authorizationResponse.json());
  return { redirectObserved };
}

export async function prepareDesktopProject({
  manifestPath,
  outputRoot = tmpdir(),
  now,
  random,
  fetchImpl,
  callbackFile
} = {}) {
  if (manifestPath === undefined) throw new Error('codex_desktop_manifest_path_required');
  const manifest = parseDesktopManifest(await readFile(manifestPath, 'utf8'));
  const callbackUrl = callbackFile === undefined ? OAUTH_CALLBACK_URL : await readDesktopCallbackFile(callbackFile);
  const serverName = createServerName(now, random);
  const projectDirectory = path.resolve(outputRoot, serverName);
  const expectedParent = `${path.resolve(outputRoot)}${path.sep}`;
  if (!projectDirectory.startsWith(expectedParent)) throw new Error('temporary_project_path_invalid');
  const configDirectory = path.join(projectDirectory, '.codex');
  await mkdir(projectDirectory, { recursive: false });
  await mkdir(configDirectory, { recursive: false });
  const configPath = path.join(configDirectory, 'config.toml');
  await writeFile(configPath, renderProjectConfig(serverName, callbackUrl), { encoding: 'utf8', flag: 'wx', mode: 0o600 });
  const probe = await probePublicOAuthMetadata(fetchImpl);
  return {
    manifest,
    serverName,
    projectDirectory,
    configPath,
    callbackDigest: createHash('sha256').update(callbackUrl, 'utf8').digest('hex'),
    ...probe
  };
}

export async function resolveDefaultManifestPath(execFileImpl = execFile, platform = process.platform) {
  if (platform !== 'win32') throw new Error('codex_desktop_windows_required');
  const result = await execFileImpl('where.exe', ['codex'], { windowsHide: true, timeout: 5_000 });
  const candidates = result.stdout.split(/\r?\n/u).map((value) => value.trim()).filter(Boolean);
  const executable = candidates.find((value) => /\\OpenAI\.Codex(?:Beta)?_[^\\]+\\app\\resources\\codex(?:\.exe)?$/iu.test(value));
  if (executable === undefined) throw new Error('codex_desktop_executable_not_found');
  const resources = path.win32.dirname(executable);
  const packageRoot = path.win32.dirname(path.win32.dirname(resources));
  return path.win32.join(packageRoot, 'AppxManifest.xml');
}

async function main() {
  const prepared = await prepareDesktopProject({
    manifestPath: process.env.WEPUU_CODEX_APPX_MANIFEST ?? await resolveDefaultManifestPath(),
    callbackFile: process.env.WEPUU_CODEX_DESKTOP_CALLBACK_FILE
  });
  process.stdout.write(`CODEX_DESKTOP_VERSION=${prepared.manifest.version}\n`);
  process.stdout.write(`CODEX_DESKTOP_SERVER_NAME=${prepared.serverName}\n`);
  process.stdout.write(`CODEX_DESKTOP_PROJECT_DIR=${prepared.projectDirectory}\n`);
  process.stdout.write(`CODEX_DESKTOP_CONFIG_PATH=${prepared.configPath}\n`);
  process.stdout.write(`CODEX_DESKTOP_CALLBACK_DIGEST=${prepared.callbackDigest}\n`);
  process.stdout.write(`RESOURCE_METADATA_SAME_ORIGIN_REDIRECT=${String(prepared.redirectObserved)}\n`);
  process.stdout.write('CODEX_DESKTOP_STATIC_COMPATIBILITY_PASS=True\n');
  process.stdout.write('CODEX_DESKTOP_OAUTH_STARTED=False\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    const code = error instanceof Error && /^[a-z0-9_.:-]+$/u.test(error.message) ? error.message : 'unknown';
    process.stderr.write(`CODEX_DESKTOP_PREFLIGHT_FAILED=${code}\n`);
    process.exitCode = 1;
  });
}
