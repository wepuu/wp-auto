import assert from 'node:assert/strict';
import test from 'node:test';
import {
  INTERACTION_REFERRER_POLICY,
  CONSENT_INTERACTION_CSP,
  CONSENT_SUBMISSION_SCRIPT,
  authorizationErrorDiagnostic,
  consentBootstrapLocation,
  consentInteractionCsp,
  consentInteractionResult,
  consentGrantUpdatePlan,
  createGrantRevocationContext,
  interactionResource,
  interactionSubmissionHeaderRejection,
  normalizeAuthorizationResources,
  oauthConsentBootstrapMatches,
  oauthResumeStageDiagnostic,
  providerGrantRevocationReason,
  safeOAuthFailure,
  serverErrorDiagnostic
} from './server.js';

const resource = 'https://site.example.test/wp-json/wp-auto/mcp';

test('provider request context identifies only an explicit consumed refresh replay', () => {
  assert.equal(providerGrantRevocationReason({
    oidc: {
      route: 'token',
      params: { grant_type: 'refresh_token' },
      entities: { RefreshToken: { consumed: 1_760_000_000 } }
    }
  }), 'refresh_replay');
  for (const context of [
    undefined,
    { oidc: { route: 'revocation', params: {}, entities: { RefreshToken: { consumed: 1 } } } },
    { oidc: { route: 'token', params: { grant_type: 'authorization_code' }, entities: {} } },
    { oidc: { route: 'token', params: { grant_type: 'refresh_token' }, entities: { RefreshToken: {} } } }
  ]) {
    assert.equal(providerGrantRevocationReason(context), 'token_revoked');
  }
});

test('provider revocation contexts remain isolated across concurrent requests', async () => {
  const context = createGrantRevocationContext();
  let releaseReplay!: () => void;
  const replayBarrier = new Promise<void>((resolve) => { releaseReplay = resolve; });
  const replay = context.run({
    oidc: {
      route: 'token', params: { grant_type: 'refresh_token' },
      entities: { RefreshToken: { consumed: 1 } }
    }
  }, async () => {
    await replayBarrier;
    return context.resolve();
  });
  const revocation = context.run({
    oidc: { route: 'revocation', params: {}, entities: { RefreshToken: { consumed: 1 } } }
  }, async () => {
    releaseReplay();
    await Promise.resolve();
    return context.resolve();
  });
  assert.deepEqual(await Promise.all([replay, revocation]), ['refresh_replay', 'token_revoked']);
  assert.equal(context.resolve(), 'token_revoked');
});

test('OAuth resume stage diagnostics contain no request or tenant data', () => {
  assert.deepEqual(oauthResumeStageDiagnostic('interaction_ended'), {
    event: 'oauth.interaction_ended'
  });
  assert.deepEqual(oauthResumeStageDiagnostic('authorization_accepted'), {
    event: 'oauth.authorization_accepted'
  });
  assert.deepEqual(oauthResumeStageDiagnostic('authorization_success'), {
    event: 'oauth.authorization_success'
  });
});

test('interaction form preserves a verifiable Origin without disclosing its path', () => {
  assert.equal(INTERACTION_REFERRER_POLICY, 'strict-origin');
});

test('consent submission locks after the first decision under a hash-pinned CSP', () => {
  assert.match(CONSENT_SUBMISSION_SCRIPT, /dataset\.submitting === 'true'/u);
  assert.match(CONSENT_SUBMISSION_SCRIPT, /setAttribute\('aria-disabled', 'true'\)/u);
  assert.doesNotMatch(CONSENT_SUBMISSION_SCRIPT, /\.disabled = true/u);
  assert.match(CONSENT_SUBMISSION_SCRIPT, /decision\.value = submitter\.value/u);
  assert.match(CONSENT_INTERACTION_CSP, /script-src 'self' 'sha256-[A-Za-z0-9+/=]+'/u);
  assert.doesNotMatch(CONSENT_INTERACTION_CSP, /unsafe-inline/u);
});

test('consent CSP allows only the exact validated callback origin', () => {
  const loopback = consentInteractionCsp('http://127.0.0.1:49152/callback?client=value');
  assert.match(loopback ?? '', /form-action 'self' http:\/\/127\.0\.0\.1:49152/u);
  assert.doesNotMatch(loopback ?? '', /callback|client=value|\*/u);

  const web = consentInteractionCsp('https://client.example.test/oauth/callback');
  assert.match(web ?? '', /form-action 'self' https:\/\/client\.example\.test/u);
  assert.doesNotMatch(web ?? '', /oauth\/callback/u);
});

test('consent CSP rejects unsafe or ambiguous callback origins', () => {
  assert.equal(consentInteractionCsp('http://client.example.test/callback'), undefined);
  assert.equal(consentInteractionCsp('http://127.0.0.1/callback'), undefined);
  assert.equal(consentInteractionCsp('https://user:secret@client.example.test/callback'), undefined);
  assert.equal(consentInteractionCsp('https://client.example.test/callback#fragment'), undefined);
  assert.equal(consentInteractionCsp('not-a-url'), undefined);
  assert.equal(consentInteractionCsp(undefined), undefined);
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

test('authorization error diagnostics remain content-free and omit error detail', () => {
  const error = Object.assign(new TypeError('token, redirect URI and request detail must not be logged'), {
    code: 'ERR_SAFE_CODE', error: 'invalid_request', error_description: 'attacker-controlled detail'
  });
  const diagnostic = authorizationErrorDiagnostic(error);
  assert.deepEqual(diagnostic, {
    event: 'oauth.authorization_error',
    name: 'TypeError',
    code: 'ERR_SAFE_CODE',
    oauthError: 'invalid_request'
  });
  assert.doesNotMatch(JSON.stringify(diagnostic), /token|redirect|attacker/u);
});

test('server error diagnostics remain content-free and omit internal detail', () => {
  const diagnostic = serverErrorDiagnostic(new Error('database, account and request detail must not be logged'));
  assert.deepEqual(diagnostic, { event: 'oauth.server_error', name: 'Error' });
  assert.doesNotMatch(JSON.stringify(diagnostic), /database|account|request/u);
});

test('consent result follows the oidc-provider example for new and existing grants', () => {
  assert.deepEqual(consentInteractionResult(undefined, 'grant_new'), {
    consent: { grantId: 'grant_new' }
  });
  assert.deepEqual(consentInteractionResult('grant_existing', 'grant_existing'), {
    consent: {}
  });
});

test('missing platform consent carries only an opaque signed request in the URL fragment', () => {
  const request = 'eyJhbGciOiJSUzI1NiJ9.eyJraW5kIjoib2F1dGhfY29uc2VudF9ib290c3RyYXAifQ.signature';
  const location = consentBootstrapLocation(request);
  assert.equal(location, `/v1/consent/start#request=${request}`);
  assert.equal(location.includes(resource), false);
});

test('local WordPress denial can resume only the exact originating OAuth interaction', () => {
  const expected = {
    interactionUid: 'interaction_12345678', clientId: 'client_00000001', resource, scopes: ['mcp:read']
  };
  assert.equal(oauthConsentBootstrapMatches(expected, expected), true);
  assert.equal(oauthConsentBootstrapMatches({ ...expected, interactionUid: 'interaction_other1' }, expected), false);
  assert.equal(oauthConsentBootstrapMatches({ ...expected, clientId: 'client_other001' }, expected), false);
  assert.equal(oauthConsentBootstrapMatches({ ...expected, resource: 'https://other.example.test/mcp' }, expected), false);
  assert.equal(oauthConsentBootstrapMatches({ ...expected, scopes: ['mcp:content.write'] }, expected), false);
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
  assert.throws(() => consentGrantUpdatePlan(base), (error: unknown) =>
    error instanceof Error && 'category' in error && error.category === 'grant.binding_mismatch');
  assert.throws(() => consentGrantUpdatePlan({
    ...base, providerGrantId: undefined, promptDetails: { missingOIDCScope: ['profile'] }
  }), (error: unknown) => error instanceof Error && 'category' in error && error.category === 'grant.scope_mismatch');
  assert.throws(() => consentGrantUpdatePlan({
    ...base, providerGrantId: undefined,
    promptDetails: { missingResourceScopes: { 'https://other.example.test/mcp': ['mcp:read'] } }
  }), (error: unknown) => error instanceof Error && 'category' in error && error.category === 'grant.resource_mismatch');
  assert.throws(() => consentGrantUpdatePlan({
    ...base, providerGrantId: undefined,
    promptDetails: { missingResourceScopes: { [resource]: ['mcp:content.write'] } }
  }), (error: unknown) => error instanceof Error && 'category' in error && error.category === 'grant.scope_mismatch');
});
