import test from 'node:test';
import assert from 'node:assert/strict';
import { assertConfiguredResource, listenProvider, TEST_RESOURCE } from '../src/provider.mjs';

test('oidc-provider publishes coherent AS metadata and resource support', async (t) => {
  const instance = await listenProvider();
  t.after(() => instance.close());

  const response = await fetch(`${instance.issuer}/.well-known/openid-configuration`);
  assert.equal(response.status, 200);
  const metadata = await response.json();
  assert.equal(metadata.issuer, instance.issuer);
  assert.equal(metadata.authorization_endpoint, `${instance.issuer}/auth`);
  assert.equal(metadata.token_endpoint, `${instance.issuer}/token`);
  assert.equal(metadata.code_challenge_methods_supported.includes('S256'), true);
  assert.equal(metadata.client_id_metadata_document_supported, true);
  assert.equal(metadata.registration_endpoint !== undefined, true);
  assert.equal(metadata.revocation_endpoint, `${instance.issuer}/token/revocation`);
  assert.equal(metadata.jwks_uri, `${instance.issuer}/jwks`);
});

test('resource indicators are accepted only for the exact configured site endpoint', async (t) => {
  const instance = await listenProvider();
  t.after(() => instance.close());

  assert.doesNotThrow(() => assertConfiguredResource(TEST_RESOURCE));
  assert.throws(() => assertConfiguredResource('https://site-b.example.test/wp-json/wp-auto/mcp'), /invalid_target/);

  const allowed = new URL(`${instance.issuer}/auth`);
  allowed.searchParams.set('client_id', 'codex-test-client');
  allowed.searchParams.set('response_type', 'code');
  allowed.searchParams.set('redirect_uri', 'http://127.0.0.1/callback');
  allowed.searchParams.set('scope', 'openid mcp:read');
  allowed.searchParams.set('code_challenge', 'A'.repeat(43));
  allowed.searchParams.set('code_challenge_method', 'S256');
  allowed.searchParams.set('resource', TEST_RESOURCE);
  const response = await fetch(allowed, { redirect: 'manual' });
  assert.notEqual(response.status, 400);

  const denied = new URL(allowed);
  denied.searchParams.set('resource', 'https://site-b.example.test/wp-json/wp-auto/mcp');
  const deniedResponse = await fetch(denied, { redirect: 'manual' });
  assert.equal(deniedResponse.status, 303);
});

test('dynamic registration only provisions bounded public clients', async (t) => {
  const instance = await listenProvider();
  t.after(() => instance.close());
  const metadata = await (await fetch(`${instance.issuer}/.well-known/openid-configuration`)).json();
  const response = await fetch(metadata.registration_endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      client_name: 'conformance-dcr-client',
      redirect_uris: ['http://127.0.0.1/callback'],
      response_types: ['code'],
      grant_types: ['authorization_code', 'refresh_token'],
      token_endpoint_auth_method: 'none'
    })
  });
  assert.equal(response.status, 201);
  const client = await response.json();
  assert.equal(typeof client.client_id, 'string');
  assert.ok(client.client_id.length >= 32);
  assert.equal(client.token_endpoint_auth_method, 'none');

});

test('authorization rejects missing PKCE and non-HTTPS redirect metadata', async (t) => {
  const instance = await listenProvider();
  t.after(() => instance.close());
  const missingPkce = new URL(`${instance.issuer}/auth`);
  missingPkce.search = new URLSearchParams({
    client_id: 'codex-test-client', response_type: 'code', redirect_uri: 'http://127.0.0.1/callback',
    scope: 'openid mcp:read', resource: TEST_RESOURCE
  }).toString();
  const response = await fetch(missingPkce, { redirect: 'manual' });
  assert.equal(response.status, 303);
  assert.match(response.headers.get('location') ?? '', /error=/);
});

test('pre-registered native client accepts only a loopback callback port variance', async (t) => {
  const instance = await listenProvider();
  t.after(() => instance.close());
  const authorization = new URL(`${instance.issuer}/auth`);
  authorization.search = new URLSearchParams({
    client_id: 'codex-test-client', response_type: 'code', redirect_uri: 'http://127.0.0.1:51033/callback',
    scope: 'openid mcp:read', resource: TEST_RESOURCE, code_challenge: 'A'.repeat(43), code_challenge_method: 'S256'
  }).toString();
  const accepted = await fetch(authorization, { redirect: 'manual' });
  assert.notEqual(accepted.status, 400);

  authorization.searchParams.set('redirect_uri', 'http://127.0.0.1:51033/other');
  const rejected = await fetch(authorization, { redirect: 'manual' });
  assert.ok([400, 303].includes(rejected.status));
  if (rejected.status === 303) assert.match(rejected.headers.get('location') ?? '', /error=/);
});
