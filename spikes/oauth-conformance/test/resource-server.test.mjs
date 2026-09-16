import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { listenProvider, TEST_CLIENT_ID, TEST_REDIRECT_URI, TEST_RESOURCE } from '../src/provider.mjs';
import { listenResourceServer } from '../src/resource-server.mjs';

function b64(bytes) { return Buffer.from(bytes).toString('base64url'); }
function cookiesFrom(response, jar) {
  for (const value of response.headers.getSetCookie?.() ?? []) {
    const [pair] = value.split(';', 1);
    const [name, cookie] = pair.split('=', 2);
    if (name && cookie !== undefined) jar.set(name, cookie);
  }
}
function cookieHeader(jar) { return [...jar].map(([name, value]) => `${name}=${value}`).join('; '); }

async function issueToken(provider) {
  const jar = new Map();
  const verifier = b64(randomBytes(32));
  const challenge = b64(createHash('sha256').update(verifier).digest());
  const authorization = new URL(`${provider.issuer}/auth`);
  authorization.search = new URLSearchParams({
    client_id: TEST_CLIENT_ID,
    response_type: 'code',
    redirect_uri: TEST_REDIRECT_URI,
    scope: 'openid mcp:read',
    prompt: 'consent',
    code_challenge: challenge,
    code_challenge_method: 'S256',
    resource: TEST_RESOURCE,
    state: 'resource-state'
  }).toString();
  let current = authorization.toString();
  for (let i = 0; i < 8; i += 1) {
    const headers = {};
    const cookie = cookieHeader(jar);
    if (cookie) headers.cookie = cookie;
    const response = await fetch(current, { redirect: 'manual', headers });
    cookiesFrom(response, jar);
    assert.ok(response.status >= 300 && response.status < 400);
    current = new URL(response.headers.get('location'), current).toString();
    if (new URL(current).pathname === '/callback') break;
  }
  const callback = new URL(current);
  const response = await fetch(`${provider.issuer}/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code', client_id: TEST_CLIENT_ID, redirect_uri: TEST_REDIRECT_URI,
      code: callback.searchParams.get('code'), code_verifier: verifier, resource: TEST_RESOURCE
    })
  });
  assert.equal(response.status, 200);
  return (await response.json()).access_token;
}

test('resource server publishes path-specific PRM and challenges without token', async (t) => {
  const provider = await (await import('../src/provider.mjs')).listenProvider();
  const resource = await listenResourceServer({ issuer: provider.issuer, resource: TEST_RESOURCE, jwksUri: `${provider.issuer}/jwks` });
  t.after(async () => { await resource.close(); await provider.close(); });

  const metadataResponse = await fetch(resource.metadata);
  assert.equal(metadataResponse.status, 200);
  const metadata = await metadataResponse.json();
  assert.equal(metadata.resource, TEST_RESOURCE);
  assert.deepEqual(metadata.authorization_servers, [provider.issuer]);

  const response = await fetch(resource.endpoint);
  assert.equal(response.status, 401);
  assert.match(response.headers.get('www-authenticate'), /resource_metadata=/);
  assert.equal(resource.traces.at(-1).path, '/wp-json/wp-auto/mcp');
  assert.equal(resource.traces.at(-1).status, 401);
  assert.equal(Object.hasOwn(resource.traces.at(-1), 'authorization'), false);
});

test('resource server verifies provider JWT directly and rejects query tokens', async (t) => {
  const provider = await (await import('../src/provider.mjs')).listenProvider();
  const resource = await listenResourceServer({ issuer: provider.issuer, resource: TEST_RESOURCE, jwksUri: `${provider.issuer}/jwks` });
  t.after(async () => { await resource.close(); await provider.close(); });
  const token = await issueToken(provider);

  const accepted = await fetch(resource.endpoint, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { tool_results: ['must not enter trace'] } })
  });
  assert.equal(accepted.status, 200);
  assert.equal(accepted.headers.get('mcp-protocol-version'), '2025-11-25');
  const queryToken = await fetch(`${resource.endpoint}?access_token=${encodeURIComponent(token)}`);
  assert.equal(queryToken.status, 401);
  assert.equal(resource.traces.at(-1).status, 401);
  assert.equal(resource.traces.some((trace) => Object.hasOwn(trace, 'body')), false);
});

test('resource server returns 403 insufficient_scope without forwarding MCP data to control-plane traces', async (t) => {
  const provider = await (await import('../src/provider.mjs')).listenProvider();
  const resource = await listenResourceServer({
    issuer: provider.issuer,
    resource: TEST_RESOURCE,
    jwksUri: `${provider.issuer}/jwks`,
    requiredScopes: ['mcp:content.write']
  });
  t.after(async () => { await resource.close(); await provider.close(); });
  const token = await issueToken(provider);
  const response = await fetch(resource.endpoint, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'site-info' } })
  });
  assert.equal(response.status, 403);
  assert.match(response.headers.get('www-authenticate') ?? '', /insufficient_scope/);
  assert.equal(resource.traces.at(-1).status, 403);
  assert.equal(resource.traces.some((trace) => Object.hasOwn(trace, 'body')), false);
});
