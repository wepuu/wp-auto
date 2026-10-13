import { execFile as execFileCallback } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
import { probeMcp, verifyAccessToken, waitForAuthorizationCode } from './test-production-wordpress-oauth.mjs';

const execFile = promisify(execFileCallback);
const requireFromKeyCustody = createRequire(new URL('../packages/key-custody/package.json', import.meta.url));
const { createRemoteJWKSet } = await import(pathToFileURL(requireFromKeyCustody.resolve('jose')).href);

export const ISSUER = 'https://auth.wpauto.cc';
export const CLIENT_ID = 'wepuu-e2e-lifecycle';
export const RESOURCE_A = 'https://test.wpauto.cc/wp-json/wp-auto/mcp';
export const RESOURCE_B = 'https://test2.wpauto.cc/wp-json/wp-auto/mcp';
export const MATRIX_TIMEOUT_MS = 45_000;

export function parseIsolationArguments(argv) {
  const names = ['account-id', 'tenant-id', 'site-a-id', 'site-b-id', 'execute'];
  const args = {};
  for (let i = 0; i < argv.length; i += 2) {
    const name = argv[i]?.slice(2);
    if (!argv[i]?.startsWith('--') || !names.includes(name) || args[name] !== undefined
        || typeof argv[i + 1] !== 'string') throw new Error('isolation_arguments_invalid');
    args[name] = argv[i + 1];
  }
  if (names.some((name) => args[name] === undefined) || args.execute !== 'true') {
    throw new Error('isolation_explicit_execution_required');
  }
  if (names.slice(0, 4).some((name) => !/^[A-Za-z0-9_-]{8,128}$/u.test(args[name]))
      || args['site-a-id'] === args['site-b-id']) throw new Error('isolation_ids_invalid');
  return args;
}

async function launchBrowser(localUrl) {
  try {
    if (process.platform === 'win32') {
      await new Promise((resolve, reject) => {
        const child = execFileCallback('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
          'Start-Process -FilePath ([Console]::In.ReadToEnd()) -ErrorAction Stop'],
        { timeout: 15_000, windowsHide: true }, (error) => error ? reject(error) : resolve());
        child.stdin.on('error', reject);
        child.stdin.end(localUrl);
      });
    } else {
      await execFile(process.platform === 'darwin' ? 'open' : 'xdg-open', [localUrl],
        { timeout: 15_000, windowsHide: true });
    }
  }
  catch { throw new Error('isolation_browser_launch_failed'); }
}

// Only the local launch URL reaches the OS opener. The secret-bearing authorization
// URL remains in memory and is handed to the browser by a one-use, no-store 303.
export async function createBrowserHandoff(authorizationUrl, launch = launchBrowser) {
  const nonce = randomBytes(24).toString('base64url');
  let used = false;
  const server = createServer((request, response) => {
    if (request.method !== 'GET' || request.url !== `/start/${nonce}` || used) {
      response.writeHead(404, { 'cache-control': 'no-store' });
      response.end();
      return;
    }
    used = true;
    response.writeHead(303, { location: authorizationUrl.href, 'cache-control': 'no-store',
      'referrer-policy': 'no-referrer' });
    response.end();
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  let timer;
  const close = async () => {
    clearTimeout(timer);
    if (server.listening) await new Promise((resolve) => server.close(resolve));
  };
  timer = setTimeout(() => { void close(); }, 60_000);
  timer.unref();
  try { await launch(`http://127.0.0.1:${server.address().port}/start/${nonce}`); }
  catch { await close(); throw new Error('isolation_browser_launch_failed'); }
  return { close };
}

export async function acquireAccessOnly(context, options = {}) {
  const state = randomBytes(32).toString('base64url');
  const verifier = randomBytes(64).toString('base64url');
  const challenge = createHash('sha256').update(verifier, 'ascii').digest('base64url');
  const listener = await waitForAuthorizationCode(state, context.issuer, { report: () => undefined,
    timeoutMs: options.timeoutMs ?? 300_000 });
  const url = new URL('/auth', context.issuer);
  url.search = new URLSearchParams({ response_type: 'code', client_id: context.clientId,
    redirect_uri: listener.redirectUri, code_challenge: challenge, code_challenge_method: 'S256',
    resource: context.resource, scope: 'mcp:read', state }).toString();
  let handoff;
  try {
    handoff = await (options.handoff ?? createBrowserHandoff)(url);
    const code = await listener.code();
    const response = await (options.request ?? fetch)(new URL('/token', context.issuer), {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(20_000),
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'authorization_code', code,
        client_id: context.clientId, redirect_uri: listener.redirectUri, code_verifier: verifier,
        resource: context.resource }),
    });
    if (response.status !== 200) {
      await response.body?.cancel();
      throw new Error('isolation_token_exchange_failed');
    }
    const body = await response.json().catch(() => undefined);
    if (typeof body?.access_token !== 'string' || body.token_type !== 'Bearer'
        || body.refresh_token !== undefined) throw new Error('isolation_token_response_invalid');
    let binding;
    try { binding = await verifyAccessToken(body.access_token, { ...context, strictBindings: true }); }
    catch { throw new Error('isolation_token_binding_invalid'); }
    return { token: body.access_token, binding, resource: context.resource, siteId: context.siteId };
  } catch (error) {
    if (['isolation_browser_launch_failed', 'isolation_token_exchange_failed',
      'isolation_token_response_invalid', 'isolation_token_binding_invalid',
      'authorization_timeout', 'authorization_cancelled'].includes(error?.message)) throw error;
    throw new Error('isolation_authorization_failed');
  } finally {
    await listener.close();
    await handoff?.close();
  }
}

export function assertIsolationBindings(a, b, accountId) {
  if (a.resource !== RESOURCE_A || b.resource !== RESOURCE_B || a.siteId === b.siteId
      || a.binding.grantId === b.binding.grantId || a.binding.accountId !== accountId
      || b.binding.accountId !== accountId || a.token === b.token) {
    throw new Error('isolation_pair_binding_invalid');
  }
}

export async function assertCrossSiteDenial(resource, token, options = {}) {
  let response;
  try {
    response = await (options.request ?? fetch)(resource, {
      method: 'POST', redirect: 'error', signal: options.signal ?? AbortSignal.timeout(10_000),
      headers: { authorization: `Bearer ${token}`, accept: 'application/json, text/event-stream',
        'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {
        protocolVersion: '2025-06-18', capabilities: {},
        clientInfo: { name: 'wepuu-site-isolation-probe', version: '0.1.0' },
      } }),
    });
  } catch (error) {
    throw new Error(error?.name === 'TimeoutError' ? 'isolation_request_timeout' : 'isolation_network_failed');
  }
  const challenge = response.headers.get('www-authenticate') ?? '';
  await response.body?.cancel();
  const parameters = challenge.replace(/^Bearer\s+/iu, '');
  const errors = [...parameters.matchAll(/(?:^|,)\s*error\s*=\s*"([^"]*)"\s*(?=,|$)/gu)];
  // Match Bearer error syntax, not a substring in a realm or a Basic challenge.
  if (response.status !== 401 || !/^Bearer\s+/iu.test(challenge)
      || errors.length !== 1 || errors[0][1] !== 'invalid_token') {
    throw new Error('isolation_denial_contract_invalid');
  }
}

export async function runIsolationMatrix(a, b, options = {}) {
  const now = options.now ?? Date.now;
  const start = now();
  const deadline = start + MATRIX_TIMEOUT_MS;
  for (const item of [a, b]) {
    if (!Number.isSafeInteger(item.binding.exp) || item.binding.exp * 1_000 - start < 60_000) {
      throw new Error('isolation_token_lifetime_insufficient');
    }
  }
  const assertTime = () => {
    if ([a, b].some((item) => now() >= item.binding.exp * 1_000)) throw new Error('isolation_token_expired');
    if (now() >= deadline) throw new Error('isolation_matrix_timeout');
  };
  const matrixSignal = AbortSignal.timeout(MATRIX_TIMEOUT_MS);
  const probe = options.probe ?? probeMcp;
  const denial = options.denial ?? assertCrossSiteDenial;
  const step = async (operation) => {
    assertTime();
    const signal = AbortSignal.any([matrixSignal, AbortSignal.timeout(Math.min(10_000, deadline - now()))]);
    try { await operation({ request: options.request, signal, strictTransport: true }); }
    catch (error) {
      assertTime();
      if (error?.name === 'TimeoutError') throw new Error('isolation_request_timeout');
      if (error instanceof TypeError) throw new Error('isolation_network_failed');
      throw error;
    }
    assertTime();
  };
  await step((transport) => probe(a.resource, a.token, transport));
  await step((transport) => probe(b.resource, b.token, transport));
  await step((transport) => denial(b.resource, a.token, transport));
  await step((transport) => denial(a.resource, b.token, transport));
  await step((transport) => probe(a.resource, a.token, transport));
  await step((transport) => probe(b.resource, b.token, transport));
  return { ownSites: true, crossSitesDenied: true, ownSitesStillUsable: true };
}

async function main() {
  const args = parseIsolationArguments(process.argv.slice(2));
  const context = { issuer: ISSUER, clientId: CLIENT_ID, accountId: args['account-id'],
    tenantId: args['tenant-id'], jwks: createRemoteJWKSet(new URL('/jwks', ISSUER)) };
  console.log('SITE_A_APPROVAL_REQUIRED=True');
  const a = await acquireAccessOnly({ ...context, resource: RESOURCE_A, siteId: args['site-a-id'] });
  console.log('SITE_B_APPROVAL_REQUIRED=True');
  const b = await acquireAccessOnly({ ...context, resource: RESOURCE_B, siteId: args['site-b-id'] });
  assertIsolationBindings(a, b, context.accountId);
  await runIsolationMatrix(a, b);
  for (const label of ['OAUTH_PKCE_BINDINGS', 'TOOL_CATALOG_23', 'SITE_HEALTH', 'CROSS_SITE_DENIAL',
    'OWN_SITE_POSTCHECK', 'SAME_TENANT_CROSS_SITE_RESOURCE_GRANT_ISOLATION']) console.log(`${label}=True`);
  for (const [label, item] of [['A', a], ['B', b]]) {
    console.log(`SITE_${label}_GRANT_DIGEST=${createHash('sha256').update(item.binding.grantId).digest('hex').slice(0, 12)}`);
  }
  console.log('REVOCATION_PROPAGATION_ISOLATION_TESTED=False');
  console.log('TENANT_ISOLATION_INDEPENDENTLY_TESTED=False');
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { await main(); }
  catch (error) {
    const allowed = ['isolation_arguments_invalid', 'isolation_explicit_execution_required', 'isolation_ids_invalid',
      'isolation_browser_launch_failed', 'isolation_token_exchange_failed', 'isolation_token_response_invalid',
      'isolation_token_binding_invalid', 'isolation_authorization_failed', 'authorization_timeout',
      'authorization_cancelled', 'isolation_pair_binding_invalid', 'isolation_request_timeout',
      'isolation_network_failed', 'isolation_denial_contract_invalid', 'isolation_token_lifetime_insufficient',
      'isolation_token_expired', 'isolation_matrix_timeout'];
    console.error(`SITE_ISOLATION_FAILURE=${allowed.includes(error?.message) ? error.message : 'isolation_probe_failed'}`);
    process.exitCode = 1;
  }
}
