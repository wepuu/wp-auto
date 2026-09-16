import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { createRemoteJWKSet, decodeJwt, decodeProtectedHeader, jwtVerify } from 'jose';
import { listenProvider, TEST_CLIENT_ID, TEST_REDIRECT_URI, TEST_RESOURCE } from '../src/provider.mjs';

function base64Url(bytes) {
  return Buffer.from(bytes).toString('base64url');
}

function pkcePair() {
  const verifier = base64Url(randomBytes(32));
  const challenge = base64Url(createHash('sha256').update(verifier).digest());
  return { verifier, challenge };
}

function updateCookies(jar, response) {
  const values = response.headers.getSetCookie?.() ?? [];
  for (const value of values) {
    const [pair] = value.split(';', 1);
    const [name, cookieValue] = pair.split('=', 2);
    if (name && cookieValue !== undefined) jar.set(name, cookieValue);
  }
}

function cookieHeader(jar) {
  return [...jar.entries()].map(([name, value]) => `${name}=${value}`).join('; ');
}

async function followInteraction(instance, url, jar) {
  let current = url;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const headers = {};
    const cookies = cookieHeader(jar);
    if (cookies) headers.cookie = cookies;
    const response = await fetch(current, { redirect: 'manual', headers });
    updateCookies(jar, response);
    if (response.status < 300 || response.status >= 400) {
      throw new Error(`interaction did not redirect: ${response.status}`);
    }
    const location = response.headers.get('location');
    assert.ok(location, 'provider redirect must include location');
    current = new URL(location, current).toString();
    if (new URL(current).pathname === '/callback') return new URL(current);
  }
  throw new Error('interaction redirect limit exceeded');
}

async function formPost(url, values, jar) {
  const headers = { 'content-type': 'application/x-www-form-urlencoded' };
  const cookies = cookieHeader(jar);
  if (cookies) headers.cookie = cookies;
  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: new URLSearchParams(values),
    redirect: 'manual'
  });
  updateCookies(jar, response);
  return response;
}

test('oidc-provider completes code+PKCE and issues an exact-audience JWT', async (t) => {
  const instance = await listenProvider();
  t.after(() => instance.close());
  const jar = new Map();
  const { verifier, challenge } = pkcePair();
  const authorization = new URL(`${instance.issuer}/auth`);
  authorization.search = new URLSearchParams({
    client_id: TEST_CLIENT_ID,
    response_type: 'code',
    redirect_uri: TEST_REDIRECT_URI,
    scope: 'openid offline_access mcp:read',
    prompt: 'consent',
    code_challenge: challenge,
    code_challenge_method: 'S256',
    resource: TEST_RESOURCE,
    state: 'state-phase-2-0-1'
  }).toString();

  const callback = await followInteraction(instance, authorization, jar);
  assert.equal(callback.searchParams.get('state'), 'state-phase-2-0-1');
  assert.equal(callback.searchParams.get('iss'), instance.issuer);
  assert.ok(callback.searchParams.get('code'));

  const response = await formPost(`${instance.issuer}/token`, {
    grant_type: 'authorization_code',
    client_id: TEST_CLIENT_ID,
    redirect_uri: TEST_REDIRECT_URI,
    code: callback.searchParams.get('code'),
    code_verifier: verifier,
    resource: TEST_RESOURCE
  }, jar);
  assert.equal(response.status, 200);
  const tokens = await response.json();
  assert.equal(tokens.token_type, 'Bearer');
  assert.ok(tokens.access_token);
  assert.ok(tokens.refresh_token);
  assert.equal(decodeProtectedHeader(tokens.access_token).alg, 'RS256');
  assert.equal(decodeProtectedHeader(tokens.access_token).typ, 'at+jwt');

  const jwks = createRemoteJWKSet(new URL(`${instance.issuer}/jwks`));
  const verified = await jwtVerify(tokens.access_token, jwks, {
    issuer: instance.issuer,
    audience: TEST_RESOURCE,
    algorithms: ['RS256']
  });
  assert.equal(verified.payload.aud, TEST_RESOURCE);
  assert.equal(verified.payload.scope, 'mcp:read');
  assert.equal(typeof verified.payload.jti, 'string');
  assert.equal(typeof verified.payload.nbf, 'number');
  assert.equal(decodeJwt(tokens.access_token).site_id, 'site_opaque');
  assert.equal(decodeJwt(tokens.access_token).grant_id, 'grant_opaque');
});

test('oidc-provider rotates refresh tokens and rejects a revoked token', async (t) => {
  const instance = await listenProvider();
  t.after(() => instance.close());
  const jar = new Map();
  const { verifier, challenge } = pkcePair();
  const authorization = new URL(`${instance.issuer}/auth`);
  authorization.search = new URLSearchParams({
    client_id: TEST_CLIENT_ID,
    response_type: 'code',
    redirect_uri: TEST_REDIRECT_URI,
    scope: 'openid offline_access mcp:read',
    prompt: 'consent',
    code_challenge: challenge,
    code_challenge_method: 'S256',
    resource: TEST_RESOURCE,
    state: 'state-refresh'
  }).toString();
  const callback = await followInteraction(instance, authorization, jar);
  const initialResponse = await formPost(`${instance.issuer}/token`, {
    grant_type: 'authorization_code', client_id: TEST_CLIENT_ID, redirect_uri: TEST_REDIRECT_URI,
    code: callback.searchParams.get('code'), code_verifier: verifier, resource: TEST_RESOURCE
  }, jar);
  assert.equal(initialResponse.status, 200);
  const initial = await initialResponse.json();

  const rotatedResponse = await formPost(`${instance.issuer}/token`, {
    grant_type: 'refresh_token', client_id: TEST_CLIENT_ID,
    refresh_token: initial.refresh_token, resource: TEST_RESOURCE
  }, jar);
  assert.equal(rotatedResponse.status, 200);
  const rotated = await rotatedResponse.json();
  assert.notEqual(rotated.refresh_token, initial.refresh_token);

  const revokeResponse = await formPost(`${instance.issuer}/token/revocation`, {
    token: rotated.refresh_token, token_type_hint: 'refresh_token', client_id: TEST_CLIENT_ID
  }, jar);
  assert.equal(revokeResponse.status, 200);

  const rejected = await formPost(`${instance.issuer}/token`, {
    grant_type: 'refresh_token', client_id: TEST_CLIENT_ID,
    refresh_token: rotated.refresh_token, resource: TEST_RESOURCE
  }, jar);
  assert.equal(rejected.status, 400);
  const error = await rejected.json();
  assert.equal(error.error, 'invalid_grant');
});
