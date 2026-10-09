import assert from 'node:assert/strict';
import test from 'node:test';
import {
  INTERACTION_REFERRER_POLICY,
  CONSENT_INTERACTION_CSP,
  CONSENT_SUBMISSION_SCRIPT,
  consentGrantUpdatePlan,
  interactionResource,
  interactionSubmissionHeaderRejection,
  normalizeAuthorizationResources,
  safeOAuthFailure
} from './server.js';

const resource = 'https://site.example.test/wp-json/wp-auto/mcp';

test('interaction form preserves a verifiable Origin without disclosing its path', () => {
  assert.equal(INTERACTION_REFERRER_POLICY, 'strict-origin');
});

test('consent submission locks after the first decision under a hash-pinned CSP', () => {
  assert.match(CONSENT_SUBMISSION_SCRIPT, /dataset\.submitting === 'true'/u);
  assert.match(CONSENT_SUBMISSION_SCRIPT, /button\.disabled = true/u);
  assert.match(CONSENT_SUBMISSION_SCRIPT, /decision\.value = submitter\.value/u);
  assert.match(CONSENT_INTERACTION_CSP, /script-src 'self' 'sha256-[A-Za-z0-9+/=]+'/u);
  assert.doesNotMatch(CONSENT_INTERACTION_CSP, /unsafe-inline/u);
});

test('interaction resource accepts a string or bounded identical repetitions', () => {
  assert.equal(interactionResource({ resource }), resource);
  assert.equal(interactionResource({ resource: [resource, resource] }), resource);
  assert.equal(interactionResource({ resource: [resource, resource, resource, resource] }), resource);
});

test('interaction resource rejects ambiguity, invalid types and excessive repetitions', () => {
  assert.equal(interactionResource({}), undefined);
  assert.equal(interactionResource({ resource: [] }), undefined);
  assert.equal(interactionResource({ resource: [resource, 'https://other.example.test/mcp'] }), undefined);
  assert.equal(interactionResource({ resource: [resource, 1] }), undefined);
  assert.equal(interactionResource({ resource: Array(5).fill(resource) }), undefined);
});

test('authorization entrypoint folds only bounded identical resource parameters', () => {
  const duplicated = new URL(`https://platform.example.test/auth?resource=${encodeURIComponent(resource)}&resource=${encodeURIComponent(resource)}`);
  assert.equal(normalizeAuthorizationResources(duplicated), true);
  assert.deepEqual(duplicated.searchParams.getAll('resource'), [resource]);

  const distinct = new URL(`https://platform.example.test/auth?resource=${encodeURIComponent(resource)}&resource=${encodeURIComponent('https://other.example.test/mcp')}`);
  assert.equal(normalizeAuthorizationResources(distinct), false);
  const excessive = new URL('https://platform.example.test/auth');
  for (let index = 0; index < 5; index += 1) excessive.searchParams.append('resource', resource);
  assert.equal(normalizeAuthorizationResources(excessive), false);
  assert.equal(normalizeAuthorizationResources(new URL('https://platform.example.test/auth?resource=')), false);
});

test('interaction submission headers require a same-origin URL-encoded POST', () => {
  const expectedOrigin = 'https://auth.example.test';
  assert.equal(interactionSubmissionHeaderRejection({
    method: 'POST', contentType: 'application/x-www-form-urlencoded', origin: expectedOrigin, expectedOrigin
  }), undefined);
  assert.equal(interactionSubmissionHeaderRejection({
    method: 'POST', contentType: 'application/x-www-form-urlencoded;charset=UTF-8', origin: expectedOrigin, expectedOrigin
  }), undefined);
  assert.deepEqual(interactionSubmissionHeaderRejection({
    method: 'GET', contentType: undefined, origin: undefined, expectedOrigin
  }), { status: 405, reason: 'method_or_content_type' });
  assert.deepEqual(interactionSubmissionHeaderRejection({
    method: 'POST', contentType: 'application/x-www-form-urlencoded', origin: 'https://other.example.test', expectedOrigin
  }), { status: 403, reason: 'origin_unexpected' });
  assert.deepEqual(interactionSubmissionHeaderRejection({
    method: 'POST', contentType: 'application/x-www-form-urlencoded', origin: undefined, expectedOrigin
  }), { status: 403, reason: 'origin_missing' });
  assert.deepEqual(interactionSubmissionHeaderRejection({
    method: 'POST', contentType: 'application/x-www-form-urlencoded', origin: 'null', expectedOrigin
  }), { status: 403, reason: 'origin_null' });
});

test('OAuth failure diagnostics expose only bounded class and machine code', () => {
  const error = Object.assign(new TypeError('token and request detail must not be logged'), {
    code: 'ERR_SAFE_CODE', error: 'invalid_request'
  });
  assert.deepEqual(safeOAuthFailure(error), {
    name: 'TypeError', code: 'ERR_SAFE_CODE', oauthError: 'invalid_request'
  });
  assert.deepEqual(safeOAuthFailure(Object.assign(new Error('secret'), { name: 'SessionNotFound' })), {
    name: 'SessionNotFound'
  });
  assert.deepEqual(safeOAuthFailure(Object.assign(new Error('invalid_request'), {
    name: 'SessionNotFound',
    error: 'invalid_request',
    error_description: 'authorization session and cookie identifier mismatch'
  })), {
    name: 'SessionNotFound', oauthError: 'invalid_request', reason: 'authorization_cookie_mismatch'
  });
  assert.deepEqual(safeOAuthFailure(Object.assign(new Error('invalid_request'), {
    name: 'SessionNotFound',
    error_description: 'attacker-controlled detail must not be logged'
  })), { name: 'SessionNotFound' });
  assert.deepEqual(safeOAuthFailure(Object.assign(new Error('secret'), { code: 'unsafe-detail' })), { name: 'Error' });
  assert.deepEqual(safeOAuthFailure({ message: 'secret' }), { name: 'UnknownError' });
});

test('consent grant update reuses the exactly bound grant and only missing approved values', () => {
  assert.deepEqual(consentGrantUpdatePlan({
    providerGrantId: 'grant_000000000000000000000001',
    platformGrantId: 'grant_000000000000000000000001',
    resource,
    scopes: ['mcp:read'],
    promptDetails: {
      missingOIDCScope: ['openid', 'offline_access'],
      missingOIDCClaims: ['sub']
    }
  }), {
    existingGrantId: 'grant_000000000000000000000001',
    oidcScopes: ['openid', 'offline_access'],
    oidcClaims: ['sub'],
    resourceScopes: []
  });

  assert.deepEqual(consentGrantUpdatePlan({
    providerGrantId: undefined,
    platformGrantId: 'grant_000000000000000000000001',
    resource,
    scopes: ['mcp:read'],
    promptDetails: { missingResourceScopes: { [resource]: ['mcp:read'] } }
  }), {
    oidcScopes: [], oidcClaims: [], resourceScopes: [{ resource, scopes: ['mcp:read'] }]
  });
});

test('consent grant update fails closed on grant, resource, scope and OIDC expansion', () => {
  const base = {
    providerGrantId: 'grant_other',
    platformGrantId: 'grant_expected',
    resource,
    scopes: ['mcp:read'],
    promptDetails: {}
  } as const;
  assert.throws(() => consentGrantUpdatePlan(base), /grant_binding_mismatch/u);
  assert.throws(() => consentGrantUpdatePlan({
    ...base, providerGrantId: undefined, promptDetails: { missingOIDCScope: ['profile'] }
  }), /unapproved_oidc_scope/u);
  assert.throws(() => consentGrantUpdatePlan({
    ...base, providerGrantId: undefined,
    promptDetails: { missingResourceScopes: { 'https://other.example.test/mcp': ['mcp:read'] } }
  }), /resource_binding_mismatch/u);
  assert.throws(() => consentGrantUpdatePlan({
    ...base, providerGrantId: undefined,
    promptDetails: { missingResourceScopes: { [resource]: ['mcp:content.write'] } }
  }), /scope_binding_mismatch/u);
});
