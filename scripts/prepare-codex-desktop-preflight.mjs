import { randomBytes } from 'node:crypto';
import { execFile as execFileCallback } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

const execFile = promisify(execFileCallback);

export const DESKTOP_PACKAGE_NAME = 'OpenAI.CodexBeta';
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
  const identity = xml.match(/<Identity\s+[^>]*\bName="([^"]+)"[^>]*\bVersion="([^"]+)"[^>]*\/?\s*>/u);
  if (identity?.[1] !== DESKTOP_PACKAGE_NAME || identity[2] === undefined) {
    throw new Error('codex_desktop_manifest_invalid');
  }
  if (!/^\d+\.\d+\.\d+\.\d+$/u.test(identity[2])) throw new Error('codex_desktop_version_invalid');
  return { packageName: identity[1], version: identity[2] };
}

export function createServerName(now = new Date(), random = randomBytes(4).toString('hex')) {
  if (!/^[a-f0-9]{8}$/u.test(random)) throw new Error('server_name_random_invalid');
  const day = now.toISOString().slice(0, 10).replaceAll('-', '');
  return `wepuu-p3b1-desktop-${day}-${random}`;
}

export function renderProjectConfig(serverName) {
  if (!/^wepuu-p3b1-desktop-\d{8}-[a-f0-9]{8}$/u.test(serverName)) {
    throw new Error('server_name_invalid');
  }
  return `[mcp_servers.${serverName}]\n`
    + `url = "${MCP_RESOURCE}"\n`
    + `oauth_resource = "${MCP_RESOURCE}"\n`
    + `scopes = ["${OAUTH_SCOPES[0]}"]\n`
    + 'default_tools_approval_mode = "prompt"\n\n'
    + `[mcp_servers.${serverName}.oauth]\n`
    + `client_id = "${OAUTH_CLIENT_ID}"\n`
    + `callback_url = "${OAUTH_CALLBACK_URL}"\n`;
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

export async function prepareDesktopProject({ manifestPath, outputRoot = tmpdir(), now, random, fetchImpl } = {}) {
  if (manifestPath === undefined) throw new Error('codex_desktop_manifest_path_required');
  const manifest = parseDesktopManifest(await readFile(manifestPath, 'utf8'));
  const serverName = createServerName(now, random);
  const projectDirectory = path.resolve(outputRoot, serverName);
  const expectedParent = `${path.resolve(outputRoot)}${path.sep}`;
  if (!projectDirectory.startsWith(expectedParent)) throw new Error('temporary_project_path_invalid');
  const configDirectory = path.join(projectDirectory, '.codex');
  await mkdir(projectDirectory, { recursive: false });
  await mkdir(configDirectory, { recursive: false });
  const configPath = path.join(configDirectory, 'config.toml');
  await writeFile(configPath, renderProjectConfig(serverName), { encoding: 'utf8', flag: 'wx', mode: 0o600 });
  const probe = await probePublicOAuthMetadata(fetchImpl);
  return { manifest, serverName, projectDirectory, configPath, ...probe };
}

export async function resolveDefaultManifestPath(execFileImpl = execFile, platform = process.platform) {
  if (platform !== 'win32') throw new Error('codex_desktop_windows_required');
  const result = await execFileImpl('where.exe', ['codex'], { windowsHide: true, timeout: 5_000 });
  const candidates = result.stdout.split(/\r?\n/u).map((value) => value.trim()).filter(Boolean);
  const executable = candidates.find((value) => /\\OpenAI\.CodexBeta_[^\\]+\\app\\resources\\codex(?:\.exe)?$/iu.test(value));
  if (executable === undefined) throw new Error('codex_desktop_executable_not_found');
  const resources = path.dirname(executable);
  const packageRoot = path.dirname(path.dirname(resources));
  return path.join(packageRoot, 'AppxManifest.xml');
}

async function main() {
  const prepared = await prepareDesktopProject({
    manifestPath: process.env.WEPUU_CODEX_APPX_MANIFEST ?? await resolveDefaultManifestPath()
  });
  process.stdout.write(`CODEX_DESKTOP_VERSION=${prepared.manifest.version}\n`);
  process.stdout.write(`CODEX_DESKTOP_SERVER_NAME=${prepared.serverName}\n`);
  process.stdout.write(`CODEX_DESKTOP_PROJECT_DIR=${prepared.projectDirectory}\n`);
  process.stdout.write(`CODEX_DESKTOP_CONFIG_PATH=${prepared.configPath}\n`);
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
