import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertAuthorizationTokenResource,
  assertAccessTokenHeader,
  assertBearerHeaderOnly,
  assertGrantBinding,
  assertExactAudience,
  assertNoContentFields,
  assertPkceS256,
  assertRedirectUri,
  canonicalResource,
  intersectScopes,
  rotateRefreshFamily,
  validateAccessTokenClaims
} from '../src/profile.mjs';

const RESOURCE = 'https://site-a.example.test/wp-json/wp-auto/mcp';
const ISSUER = 'https://auth.example.test';

test('canonicalizes and accepts an exact HTTPS MCP resource', () => {
  assert.equal(canonicalResource(RESOURCE), RESOURCE);
  assert.throws(() => canonicalResource('http://site-a.example.test/wp-json/wp-auto/mcp'), /invalid_resource/);
  assert.throws(() => canonicalResource('https://user:pass@site-a.example.test/mcp'), /invalid_resource/);
  assert.throws(() => canonicalResource(`${RESOURCE}#fragment`), /invalid_resource/);
  assert.throws(() => canonicalResource(`${RESOURCE}?scope=mcp:read`), /invalid_resource/);
});

test('requires an exact single audience, not an origin or sibling path', () => {
  assertExactAudience(RESOURCE, RESOURCE);
  assert.throws(() => assertExactAudience('https://site-a.example.test', RESOURCE), /invalid_audience/);
  assert.throws(() => assertExactAudience(`${RESOURCE}/other`, RESOURCE), /invalid_audience/);
  assert.throws(() => assertExactAudience(['https://site-a.example.test'], RESOURCE), /invalid_audience/);
});

test('binds authorization and token resources exactly', () => {
  assert.equal(assertAuthorizationTokenResource(RESOURCE, RESOURCE), RESOURCE);
  assert.throws(() => assertAuthorizationTokenResource(RESOURCE, 'https://site-b.example.test/wp-json/wp-auto/mcp'), /invalid_target/);
});

test('allows only the narrowly defined loopback callback-port variance', () => {
  assertRedirectUri('http://127.0.0.1/callback', 'http://127.0.0.1:49152/callback', { allowLoopbackPort: true });
  assert.throws(() => assertRedirectUri('http://127.0.0.1/callback', 'http://127.0.0.1:49152/other', { allowLoopbackPort: true }), /invalid_redirect_uri/);
  assert.throws(() => assertRedirectUri('https://client.example/callback', 'https://evil.example/callback', { allowLoopbackPort: true }), /invalid_redirect_uri/);
});

test('requires PKCE S256', () => {
  assertPkceS256('S256', 'A'.repeat(43));
  assert.throws(() => assertPkceS256('plain', 'A'.repeat(43)), /invalid_pkce/);
  assert.throws(() => assertPkceS256('S256', 'short'), /invalid_pkce/);
});

test('accepts bearer only in Authorization header', () => {
  assertBearerHeaderOnly({ authorizationHeader: 'Bearer abc123', query: {}, cookie: {} });
  assert.throws(() => assertBearerHeaderOnly({ authorizationHeader: 'Bearer abc123', query: { access_token: 'abc123' }, cookie: {} }), /invalid_token_transport/);
  assert.throws(() => assertBearerHeaderOnly({ authorizationHeader: undefined, query: {}, cookie: {} }), /invalid_token_transport/);
});

test('requires an explicit RS256 at+jwt header and published kid', () => {
  assert.doesNotThrow(() => assertAccessTokenHeader({ alg: 'RS256', typ: 'at+jwt', kid: 'key-1' }));
  assert.throws(() => assertAccessTokenHeader({ alg: 'none', typ: 'at+jwt', kid: 'key-1' }), /invalid_token_header/);
  assert.throws(() => assertAccessTokenHeader({ alg: 'RS256', typ: 'JWT', kid: 'key-1' }), /invalid_token_header/);
  assert.throws(() => assertAccessTokenHeader({ alg: 'RS256', typ: 'at+jwt' }), /invalid_token_header/);
});

test('validates the minimum access-token claims and exact audience', () => {
  const claims = {
    iss: ISSUER,
    aud: RESOURCE,
    sub: 'sub_opaque',
    site_id: 'site_opaque',
    grant_id: 'grant_opaque',
    scope: 'mcp:read',
    iat: 1000,
    nbf: 1000,
    exp: 1120,
    jti: 'jti_opaque'
  };
  assert.doesNotThrow(() => validateAccessTokenClaims(claims, { issuer: ISSUER, resource: RESOURCE, now: 1050, skew: 0 }));
  assert.throws(() => validateAccessTokenClaims({ ...claims, aud: 'https://site-a.example.test' }, { issuer: ISSUER, resource: RESOURCE, now: 1050, skew: 0 }), /invalid_audience/);
  assert.throws(() => validateAccessTokenClaims({ ...claims, email: 'user@example.test' }, { issuer: ISSUER, resource: RESOURCE, now: 1050, skew: 0 }), /forbidden_claim/);
  assert.throws(() => validateAccessTokenClaims({ ...claims, exp: 3000 }, { issuer: ISSUER, resource: RESOURCE, now: 1050, skew: 0 }), /access_token_too_long/);
  assert.throws(() => validateAccessTokenClaims({ ...claims, nbf: 1100 }, { issuer: ISSUER, resource: RESOURCE, now: 1050, skew: 0 }), /invalid_time/);
  assert.throws(() => validateAccessTokenClaims({ ...claims, scope: 'mcp:unknown' }, { issuer: ISSUER, resource: RESOURCE, now: 1050, skew: 0 }), /invalid_scope_claim/);
});

test('intersects requested scopes with every independent ceiling', () => {
  assert.deepEqual(intersectScopes(['mcp:read', 'mcp:content.write'], ['mcp:read', 'mcp:content.write'], ['mcp:read']), ['mcp:read']);
  assert.throws(() => intersectScopes(['mcp:unknown'], ['mcp:read']), /invalid_scope/);
});

test('refresh rotation has one winning generation and revokes on replay', () => {
  assert.deepEqual(rotateRefreshFamily({ status: 'active', generation: 4 }, 4), { status: 'rotated', generation: 5 });
  assert.deepEqual(rotateRefreshFamily({ status: 'active', generation: 4 }, 3), { status: 'revoked', reason: 'refresh_reuse_or_invalid_generation' });
  assert.deepEqual(rotateRefreshFamily({ status: 'revoked', generation: 4 }, 4), { status: 'revoked', reason: 'refresh_reuse_or_invalid_generation' });
});

test('control-plane records reject content and credential fields', () => {
  assert.doesNotThrow(() => assertNoContentFields({ site_id: 'site_opaque', scope: 'mcp:read' }));
  assert.throws(() => assertNoContentFields({ site_id: 'site_opaque', tool_results: ['post body'] }), /forbidden_control_plane_data/);
  assert.throws(() => assertNoContentFields({ site_id: 'site_opaque', email: 'user@example.test' }), /forbidden_control_plane_data/);
});

test('tenant, site, grant, and subject bindings fail closed on cross-boundary claims', () => {
  const claims = { tenant_id: 'tenant-a', site_id: 'site-a', grant_id: 'grant-a', sub: 'subject-a' };
  assert.doesNotThrow(() => assertGrantBinding(claims, {
    tenantId: 'tenant-a', siteId: 'site-a', grantId: 'grant-a', subject: 'subject-a'
  }));
  assert.throws(() => assertGrantBinding({ ...claims, site_id: 'site-b' }, {
    tenantId: 'tenant-a', siteId: 'site-a', grantId: 'grant-a', subject: 'subject-a'
  }), /invalid_site_id/);
  assert.throws(() => assertGrantBinding({ ...claims, tenant_id: 'tenant-b' }, { tenantId: 'tenant-a' }), /invalid_tenant_id/);
});
