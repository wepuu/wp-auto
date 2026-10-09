import { createHash, randomBytes } from 'node:crypto';
import { unlink, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const requireFromKeyCustody = createRequire(
  new URL('../packages/key-custody/package.json', import.meta.url),
);
const { createRemoteJWKSet, decodeProtectedHeader, jwtVerify } = await import(
  pathToFileURL(requireFromKeyCustody.resolve('jose')).href
);

const EXPECTED_TOOLS = [
  'wp-auto-site-health',
  'wp-auto-site-info',
  'wp-auto-posts-search',
  'wp-auto-post-get',
  'wp-auto-pages-search',
  'wp-auto-page-get',
  'wp-auto-categories-list',
  'wp-auto-tags-list',
  'wp-auto-post-create-draft',
  'wp-auto-page-create-draft',
  'wp-auto-post-update',
  'wp-auto-page-update',
  'wp-auto-media-search',
  'wp-auto-media-get',
  'wp-auto-media-upload',
  'wp-auto-media-update',
  'wp-auto-media-set-featured',
  'wp-auto-media-import-url',
  'wp-auto-category-create',
  'wp-auto-tag-create',
  'wp-auto-taxonomy-assign',
  'wp-auto-seo-get',
  'wp-auto-seo-update',
];

function readArguments(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index];
    const value = argv[index + 1];
    if (!name?.startsWith('--') || value === undefined) throw new Error('invalid_arguments');
    values.set(name.slice(2), value);
  }
  const required = ['issuer', 'resource', 'client-id', 'tenant-id', 'site-id'];
  for (const name of required) {
    if (!values.has(name)) throw new Error(`missing_${name}`);
  }
  return Object.fromEntries(values);
}

function assertHttpsUrl(value, label) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw new Error(`invalid_${label}`);
  }
  return url;
}

function base64url(input) {
  return Buffer.from(input).toString('base64url');
}

async function fetchJson(url, options) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(20_000) });
  const body = await response.json().catch(() => undefined);
  if (!response.ok) throw new Error(`http_${response.status}_${url.pathname}`);
  if (typeof body !== 'object' || body === null) throw new Error(`invalid_json_${url.pathname}`);
  return { response, body };
}

async function waitForAuthorizationCode(expectedState) {
  let settle;
  const completed = new Promise((resolve, reject) => { settle = { resolve, reject }; });
  const server = createServer((request, response) => {
    const callback = new URL(request.url ?? '/', 'http://127.0.0.1');
    if (callback.pathname !== '/callback') {
      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      response.end('Not found.');
      return;
    }
    const state = callback.searchParams.get('state');
    const code = callback.searchParams.get('code');
    const error = callback.searchParams.get('error');
    if (state !== expectedState || code === null || error !== null) {
      response.writeHead(400, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' });
      response.end('Authorization failed. You may close this tab.');
      settle.reject(new Error(error ?? 'invalid_authorization_callback'));
      return;
    }
    response.writeHead(200, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' });
    response.end('WePuu OAuth validation received the code. You may close this tab.');
    settle.resolve(code);
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('callback_listener_failed');
  const timer = setTimeout(() => settle.reject(new Error('authorization_timeout')), 5 * 60_000);
  timer.unref();
  return {
    redirectUri: `http://127.0.0.1:${address.port}/callback`,
    async code() {
      try {
        return await completed;
      } finally {
        clearTimeout(timer);
        await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
      }
    },
  };
}

async function verifyAccessToken(token, context) {
  const header = decodeProtectedHeader(token);
  if (header.alg !== 'RS256' || header.typ !== 'at+jwt' || typeof header.kid !== 'string') {
    throw new Error('invalid_access_token_header');
  }
  for (const forbidden of ['jwk', 'jku', 'x5u', 'crit']) {
    if (header[forbidden] !== undefined) throw new Error(`forbidden_access_token_${forbidden}`);
  }
  const verified = await jwtVerify(token, context.jwks, {
    algorithms: ['RS256'],
    issuer: context.issuer,
    audience: context.resource,
    requiredClaims: ['sub', 'client_id', 'tenant_id', 'site_id', 'grant_id', 'scope', 'nbf'],
  });
  const claims = verified.payload;
  if (claims.client_id !== context.clientId || claims.tenant_id !== context.tenantId
      || claims.site_id !== context.siteId || claims.scope !== 'mcp:read') {
    throw new Error('access_token_binding_mismatch');
  }
  if (typeof claims.grant_id !== 'string' || claims.grant_id.length < 8) {
    throw new Error('access_token_grant_missing');
  }
  return { grantId: claims.grant_id, kid: header.kid };
}

function parseEvent(event) {
  const data = event.split(/\r?\n/u)
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trim())
    .join('\n');
  return !data || data === '[DONE]' ? undefined : JSON.parse(data);
}

async function readMcpMessage(response) {
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) return response.json();
  if (!contentType.includes('text/event-stream') || !response.body) {
    throw new Error('invalid_mcp_response_type');
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const events = buffer.split(/\r?\n\r?\n/u);
      buffer = events.pop() ?? '';
      for (const event of events) {
        const message = parseEvent(event);
        if (message) return message;
      }
      if (done) {
        const message = parseEvent(buffer);
        if (message) return message;
        throw new Error('empty_mcp_response');
      }
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}

async function probeMcp(resource, token) {
  let sessionId;
  let protocolVersion;
  async function request(payload, expectMessage = true) {
    const headers = {
      accept: 'application/json, text/event-stream',
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    };
    if (sessionId) headers['mcp-session-id'] = sessionId;
    if (protocolVersion) headers['mcp-protocol-version'] = protocolVersion;
    const response = await fetch(resource, {
      method: 'POST', headers, body: JSON.stringify(payload), signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error(`mcp_http_${response.status}`);
    sessionId = response.headers.get('mcp-session-id') ?? sessionId;
    if (!expectMessage) {
      await response.body?.cancel();
      return undefined;
    }
    return readMcpMessage(response);
  }
  const initialized = await request({
    jsonrpc: '2.0', id: 1, method: 'initialize',
    params: {
      protocolVersion: '2025-06-18', capabilities: {},
      clientInfo: { name: 'wepuu-production-oauth-probe', version: '0.1.0' },
    },
  });
  protocolVersion = initialized?.result?.protocolVersion;
  if (protocolVersion !== '2025-06-18') throw new Error('mcp_protocol_mismatch');
  await request({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} }, false);
  const listed = await request({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
  const tools = listed?.result?.tools?.map((tool) => tool.name);
  if (!Array.isArray(tools) || tools.length !== EXPECTED_TOOLS.length
      || tools.some((tool, index) => tool !== EXPECTED_TOOLS[index])) {
    throw new Error('mcp_tool_contract_mismatch');
  }
  const health = await request({
    jsonrpc: '2.0', id: 3, method: 'tools/call',
    params: { name: 'wp-auto-site-health', arguments: {} },
  });
  if (!health?.result || health.result.isError) throw new Error('mcp_site_health_failed');
}

const args = readArguments(process.argv.slice(2));
const issuerUrl = assertHttpsUrl(args.issuer, 'issuer');
const resourceUrl = assertHttpsUrl(args.resource, 'resource');
const issuer = issuerUrl.href.replace(/\/$/u, '');
const resource = resourceUrl.href;
const accessOnly = args['access-only'] === 'true';
const state = base64url(randomBytes(32));
const verifier = base64url(randomBytes(64));
const challenge = base64url(createHash('sha256').update(verifier, 'ascii').digest());
const listener = await waitForAuthorizationCode(state);
const authorizationUrl = new URL('/auth', issuer);
authorizationUrl.search = new URLSearchParams({
  response_type: 'code',
  client_id: args['client-id'],
  redirect_uri: listener.redirectUri,
  code_challenge: challenge,
  code_challenge_method: 'S256',
  resource,
  scope: accessOnly ? 'mcp:read' : 'openid offline_access mcp:read',
  state,
}).toString();
if (!accessOnly) authorizationUrl.searchParams.set('prompt', 'consent');

console.log('OAUTH_CALLBACK_LISTENING=True');
console.log(`AUTHORIZATION_URL=${authorizationUrl.href}`);
const authorizationUrlFile = args['authorization-url-file'];
if (authorizationUrlFile !== undefined) {
  await writeFile(authorizationUrlFile, `${authorizationUrl.href}\n`, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
}
let code;
try {
  code = await listener.code();
} finally {
  if (authorizationUrlFile !== undefined) await unlink(authorizationUrlFile).catch(() => undefined);
}
const tokenUrl = new URL('/token', issuer);
const first = await fetchJson(tokenUrl, {
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    grant_type: 'authorization_code', code, client_id: args['client-id'],
    redirect_uri: listener.redirectUri, code_verifier: verifier, resource,
  }),
});
if (typeof first.body.access_token !== 'string' || first.body.token_type !== 'Bearer') {
  throw new Error('invalid_token_response');
}

const jwks = createRemoteJWKSet(new URL('/jwks', issuer));
const context = {
  jwks, issuer, resource, clientId: args['client-id'],
  tenantId: args['tenant-id'], siteId: args['site-id'],
};
const firstBinding = await verifyAccessToken(first.body.access_token, context);

if (accessOnly) {
  await probeMcp(resource, first.body.access_token);
  console.log('OAUTH_AUTHORIZATION_CODE_PKCE=True');
  console.log('OAUTH_ACCESS_TOKEN_RS256=True');
  console.log('OAUTH_ACCESS_TOKEN_BINDINGS=True');
  console.log('OAUTH_DIRECT_WORDPRESS_MCP=True');
  console.log(`OAUTH_GRANT_ID=${firstBinding.grantId}`);
  console.log(`OAUTH_SIGNING_KID=${firstBinding.kid}`);
  process.exit(0);
}

if (typeof first.body.refresh_token !== 'string') throw new Error('refresh_token_missing');

const refreshed = await fetchJson(tokenUrl, {
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    grant_type: 'refresh_token', refresh_token: first.body.refresh_token,
    client_id: args['client-id'], resource,
  }),
});
if (typeof refreshed.body.access_token !== 'string' || typeof refreshed.body.refresh_token !== 'string'
    || refreshed.body.refresh_token === first.body.refresh_token) {
  throw new Error('refresh_rotation_failed');
}
const refreshedBinding = await verifyAccessToken(refreshed.body.access_token, context);
if (refreshedBinding.grantId !== firstBinding.grantId || refreshedBinding.kid !== firstBinding.kid) {
  throw new Error('refresh_binding_changed');
}
await probeMcp(resource, refreshed.body.access_token);

const revocationUrl = new URL('/token/revocation', issuer);
const revoked = await fetch(revocationUrl, {
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    token: refreshed.body.refresh_token, token_type_hint: 'refresh_token', client_id: args['client-id'],
  }),
  signal: AbortSignal.timeout(20_000),
});
if (!revoked.ok) throw new Error(`revocation_http_${revoked.status}`);
await revoked.body?.cancel();

console.log('OAUTH_AUTHORIZATION_CODE_PKCE=True');
console.log('OAUTH_ACCESS_TOKEN_RS256=True');
console.log('OAUTH_ACCESS_TOKEN_BINDINGS=True');
console.log('OAUTH_REFRESH_ROTATION=True');
console.log('OAUTH_REFRESH_REVOCATION=True');
console.log('OAUTH_DIRECT_WORDPRESS_MCP=True');
console.log(`OAUTH_GRANT_ID=${firstBinding.grantId}`);
console.log(`OAUTH_SIGNING_KID=${firstBinding.kid}`);
