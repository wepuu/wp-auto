import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { createPostgresAdapter } from '../src/postgres-adapter.mjs';
import { createTestJwks, listenProvider, TEST_CLIENT_ID, TEST_REDIRECT_URI, TEST_RESOURCE } from '../src/provider.mjs';

function b64(value) { return Buffer.from(value).toString('base64url'); }

async function authorize(instance, adapter) {
  const verifier = b64(randomBytes(32));
  const challenge = b64(createHash('sha256').update(verifier).digest());
  const jar = new Map();
  const authorization = new URL(`${instance.issuer}/auth`);
  authorization.search = new URLSearchParams({
    client_id: TEST_CLIENT_ID, response_type: 'code', redirect_uri: TEST_REDIRECT_URI,
    scope: 'openid offline_access mcp:read', prompt: 'consent', code_challenge: challenge,
    code_challenge_method: 'S256', resource: TEST_RESOURCE, state: 'persistent-state'
  }).toString();
  let current = authorization.toString();
  for (let i = 0; i < 8; i += 1) {
    const headers = {};
    if (jar.size) headers.cookie = [...jar].map(([name, value]) => `${name}=${value}`).join('; ');
    const response = await fetch(current, { redirect: 'manual', headers });
    for (const value of response.headers.getSetCookie?.() ?? []) {
      const [pair] = value.split(';', 1);
      const [name, cookie] = pair.split('=', 2);
      if (name && cookie !== undefined) jar.set(name, cookie);
    }
    assert.ok(response.status >= 300 && response.status < 400);
    current = new URL(response.headers.get('location'), current).toString();
    if (new URL(current).pathname === '/callback') break;
  }
  const callback = new URL(current);
  assert.equal(callback.searchParams.get('state'), 'persistent-state');
  const response = await fetch(`${instance.issuer}/token`, {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code', client_id: TEST_CLIENT_ID, redirect_uri: TEST_REDIRECT_URI,
      code: callback.searchParams.get('code'), code_verifier: verifier, resource: TEST_RESOURCE
    })
  });
  assert.equal(response.status, 200);
  return response.json();
}

test('PostgreSQL-backed provider keeps refresh state across a provider restart', { skip: !process.env.CONFORMANCE_DATABASE_URL }, async (t) => {
  const adapter = createPostgresAdapter(process.env.CONFORMANCE_DATABASE_URL);
  await adapter.prepare();
  const jwks = createTestJwks('persistent-key');
  const first = await listenProvider({ adapter, jwks });
  t.after(() => adapter.close());
  const tokens = await authorize(first, adapter);
  const port = new URL(first.issuer).port;
  await first.close();

  const second = await listenProvider({ adapter, jwks, port: Number(port) });
  t.after(() => second.close());
  const response = await fetch(`${second.issuer}/token`, {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', client_id: TEST_CLIENT_ID, refresh_token: tokens.refresh_token, resource: TEST_RESOURCE })
  });
  assert.equal(response.status, 200);
  const rotated = await response.json();
  assert.notEqual(rotated.refresh_token, tokens.refresh_token);
});
