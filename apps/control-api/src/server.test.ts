import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AccountPrincipal, GrantView, SiteView, TenantContext, TenantView } from '@wepuu/contracts';
import type { SecurityEventView } from '@wepuu/database';
import type { SecurityAuditEvent, SecurityAuditSink } from '@wepuu/security-audit';
import { AccountLoginError } from '@wepuu/account-identity';
import {
  buildControlApi,
  SessionAccountIdentityProvider,
  type AccountIdentityProvider,
  type ControlStore,
  type PairingOperations
} from './server.js';

const tenantId = '018f47a8-66e9-7b24-a43d-8a84a9b3f822';

class MemoryAudit implements SecurityAuditSink {
  readonly events: SecurityAuditEvent[] = [];
  write(event: SecurityAuditEvent): Promise<void> { this.events.push(event); return Promise.resolve(); }
}

class StaticIdentity implements AccountIdentityProvider {
  readonly #principal: AccountPrincipal | undefined;
  constructor(principal?: AccountPrincipal) { this.#principal = principal; }
  authenticate(): Promise<AccountPrincipal | undefined> { return Promise.resolve(this.#principal); }
}

class StaticStore implements ControlStore {
  readonly contexts: TenantContext[] = [];
  revokedGrant: string | undefined;
  findTenant(context: TenantContext): Promise<TenantView> {
    this.contexts.push(context);
    return Promise.resolve({ id: context.tenantId, status: 'active', createdAt: '2026-09-16T00:00:00.000Z' });
  }
  listSecurityEvents(): Promise<readonly SecurityEventView[]> { return Promise.resolve([]); }
  listSites(): Promise<readonly SiteView[]> { return Promise.resolve([]); }
  findActiveSite(): Promise<SiteView | undefined> { return Promise.resolve(undefined); }
  listGrants(): Promise<readonly GrantView[]> { return Promise.resolve([]); }
  revokeGrant(_context: TenantContext, grantId: string): Promise<boolean> {
    this.revokedGrant = grantId;
    return Promise.resolve(true);
  }
  disconnectSite(): Promise<boolean> { return Promise.resolve(true); }
}

class StaticAccountLogin {
  loggedOutToken: string | undefined;
  failWith: Error | undefined;
  start() {
    if (this.failWith !== undefined) return Promise.reject(this.failWith);
    return Promise.resolve({
      authorizationUrl: new URL('https://identity.example.test/authorize?request=redacted'),
      transactionCookie: 'a.b.c.d.e'
    });
  }
  complete() {
    if (this.failWith !== undefined) return Promise.reject(this.failWith);
    return Promise.resolve({
      accountId: 'account_12345678',
      sessionToken: 's'.repeat(43),
      returnTo: '/v1/account/session',
      expiresAt: new Date(Date.now() + 60_000)
    });
  }
  logout(token: string) { this.loggedOutToken = token; return Promise.resolve(); }
}

class StaticPairing implements PairingOperations {
  input: { resource: string; verifier: string } | undefined;
  context: TenantContext | undefined;
  pair(context: TenantContext, input: { readonly resource: string; readonly verifier: string }) {
    this.context = context;
    this.input = input;
    return Promise.resolve({ siteId: 'site_00000001' });
  }
}

class StaticGrants {
  startInput: Record<string, unknown> | undefined;
  completeInput: Record<string, unknown> | undefined;
  start(_context: TenantContext, input: Record<string, unknown>) {
    this.startInput = input;
    return Promise.resolve({
      grantId: 'grant_00000001',
      consentUrl: 'https://site.example.test/wp-admin/admin-post.php?action=wp_auto_connector_consent_start#request=redacted',
      expiresAt: new Date('2026-09-23T00:02:00.000Z')
    });
  }
  complete(_context: TenantContext, input: Record<string, unknown>) {
    this.completeInput = input;
    return Promise.resolve();
  }
}

void test('denies requests without a server-authenticated account and never reflects content', async () => {
  const audit = new MemoryAudit();
  const app = buildControlApi({ identityProvider: new StaticIdentity(), store: new StaticStore(), audit });
  const canary = 'MCP_TOOL_INPUT_MUST_NOT_ENTER_CONTROL_PLANE';
  const response = await app.inject({ method: 'GET', url: `/v1/tenants/${tenantId}?body=${canary}` });
  assert.equal(response.statusCode, 401);
  assert.deepEqual(response.json(), { error: 'unauthenticated' });
  assert.equal(JSON.stringify(audit.events).includes(canary), false);
  await app.close();
});

void test('consent completion bootstrap consumes only a fragment and never reflects result data', async () => {
  const app = buildControlApi({ identityProvider: new StaticIdentity(), store: new StaticStore(), audit: new MemoryAudit() });
  const response = await app.inject({ method: 'GET', url: '/v1/consent/complete' });
  assert.equal(response.statusCode, 200);
  assert.match(response.headers['content-security-policy'] ?? '', /sha256-/u);
  assert.equal(response.headers['cache-control'], 'no-store');
  assert.equal(response.body.includes('location.hash'), true);
  assert.equal(response.body.includes('MCP_TOOL_INPUT'), false);
  await app.close();
});

void test('grant start and completion require exact origin, exact scopes and idempotency', async () => {
  const grants = new StaticGrants();
  const audit = new MemoryAudit();
  const app = buildControlApi({
    identityProvider: new StaticIdentity({ accountId: 'account_12345678', authenticationTime: 1, authenticationMethod: 'oidc' }),
    store: new StaticStore(), audit, publicOrigin: 'https://platform.example.test', grants
  });
  const path = `/v1/tenants/${tenantId}/sites/site_00000001/grants`;
  const denied = await app.inject({ method: 'POST', url: path, headers: { origin: 'https://evil.example.test', 'idempotency-key': 'idempotency_00000001' }, payload: { client_id: 'client_00000001', scopes: ['mcp:read'] } });
  assert.equal(denied.statusCode, 403);
  const invalid = await app.inject({ method: 'POST', url: path, headers: { origin: 'https://platform.example.test', 'idempotency-key': 'idempotency_00000001' }, payload: { client_id: 'client_00000001', scopes: ['mcp:content.write', 'mcp:read'] } });
  assert.equal(invalid.statusCode, 400);
  const started = await app.inject({ method: 'POST', url: path, headers: { origin: 'https://platform.example.test', 'idempotency-key': 'idempotency_00000001' }, payload: { client_id: 'client_00000001', scopes: ['mcp:read', 'mcp:content.write'] } });
  assert.equal(started.statusCode, 201);
  assert.equal(grants.startInput?.['siteId'], 'site_00000001');

  const completed = await app.inject({ method: 'POST', url: `/v1/tenants/${tenantId}/grants/grant_00000001/complete`, headers: { origin: 'https://platform.example.test', 'idempotency-key': 'idempotency_00000002' }, payload: { proof: 'a.b.c', challenge: 'c'.repeat(43), decision: 'denied' } });
  assert.equal(completed.statusCode, 204);
  assert.equal(grants.completeInput?.['decision'], 'denied');
  assert.equal(JSON.stringify(audit.events).includes('a.b.c'), false);
  await app.close();
});

void test('derives tenant context from route plus authenticated principal', async () => {
  const store = new StaticStore();
  const app = buildControlApi({
    identityProvider: new StaticIdentity({ accountId: 'account_12345678', authenticationTime: 1, authenticationMethod: 'oidc' }),
    store,
    audit: new MemoryAudit()
  });
  const response = await app.inject({ method: 'GET', url: `/v1/tenants/${tenantId}` });
  assert.equal(response.statusCode, 200);
  const context = store.contexts[0];
  assert.ok(context);
  assert.equal(context.tenantId, tenantId);
  assert.equal(context.accountId, 'account_12345678');
  await app.close();
});

void test('readiness fails closed and exposes no dependency details', async () => {
  const app = buildControlApi({
    identityProvider: new StaticIdentity(),
    store: new StaticStore(),
    audit: new MemoryAudit(),
    readiness: () => Promise.reject(new Error('database secret detail'))
  });
  const response = await app.inject({ method: 'GET', url: '/health/ready' });
  assert.equal(response.statusCode, 503);
  assert.deepEqual(response.json(), { error: 'temporarily_unavailable' });
  assert.equal(response.body.includes('secret'), false);
  await app.close();
});

void test('hashed server-side session authenticates mutations and idempotency key is mandatory', async () => {
  const store = new StaticStore();
  const identity = new SessionAccountIdentityProvider({
    resolve(sessionHash) {
      assert.equal(sessionHash.byteLength, 32);
      return Promise.resolve({ accountId: 'account_12345678', authenticationTime: 1 });
    }
  });
  const app = buildControlApi({ identityProvider: identity, store, audit: new MemoryAudit() });
  const url = `/v1/tenants/${tenantId}/grants/grant_00000001/revoke`;
  const cookie = `__Host-wepuu_session=${'s'.repeat(43)}`;
  assert.equal((await app.inject({ method: 'POST', url, headers: { cookie } })).statusCode, 400);
  const response = await app.inject({
    method: 'POST',
    url,
    headers: { cookie, 'idempotency-key': 'idempotency_0000000001' }
  });
  assert.equal(response.statusCode, 204);
  assert.equal(store.revokedGrant, 'grant_00000001');
  await app.close();
});

void test('OIDC login and callback use secure host cookies and local redirects', async () => {
  const login = new StaticAccountLogin();
  const app = buildControlApi({
    identityProvider: new StaticIdentity(),
    store: new StaticStore(),
    audit: new MemoryAudit(),
    accountLogin: login,
    publicOrigin: 'https://platform.example.test'
  });
  const start = await app.inject({ method: 'GET', url: '/v1/account/oidc/login?return_to=%2Fv1%2Faccount%2Fsession' });
  assert.equal(start.statusCode, 302);
  assert.equal(start.headers.location, 'https://identity.example.test/authorize?request=redacted');
  assert.match(String(start.headers['set-cookie']), /__Host-wepuu_oidc_tx=.*Secure.*HttpOnly.*SameSite=Lax/u);
  assert.equal(start.headers['cache-control'], 'no-store');

  const callback = await app.inject({
    method: 'GET',
    url: '/v1/account/oidc/callback?code=redacted&state=redacted',
    headers: { cookie: '__Host-wepuu_oidc_tx=a.b.c.d.e' }
  });
  assert.equal(callback.statusCode, 303);
  assert.equal(callback.headers.location, '/v1/account/session');
  const cookies = String(callback.headers['set-cookie']);
  assert.match(cookies, /__Host-wepuu_oidc_tx=; Max-Age=0/u);
  assert.match(cookies, /__Host-wepuu_session=s{43}/u);
  assert.equal(callback.body, '');
  await app.close();
});

void test('OIDC callback errors fail closed without reflecting provider detail', async () => {
  const login = new StaticAccountLogin();
  login.failWith = new Error('provider_token_and_subject_must_not_leak');
  const audit = new MemoryAudit();
  const app = buildControlApi({
    identityProvider: new StaticIdentity(),
    store: new StaticStore(),
    audit,
    accountLogin: login,
    publicOrigin: 'https://platform.example.test'
  });
  const response = await app.inject({
    method: 'GET',
    url: '/v1/account/oidc/callback?code=secret-code&state=secret-state',
    headers: { cookie: '__Host-wepuu_oidc_tx=a.b.c.d.e' }
  });
  assert.equal(response.statusCode, 503);
  assert.deepEqual(response.json(), { error: 'temporarily_unavailable' });
  const evidence = `${response.body}${JSON.stringify(audit.events)}`;
  assert.equal(evidence.includes('secret-code'), false);
  assert.equal(evidence.includes('secret-state'), false);
  assert.equal(evidence.includes('provider_token'), false);

  login.failWith = new AccountLoginError('unauthenticated');
  const denied = await app.inject({
    method: 'GET', url: '/v1/account/oidc/callback?error=access_denied',
    headers: { cookie: '__Host-wepuu_oidc_tx=a.b.c.d.e' }
  });
  assert.equal(denied.statusCode, 401);
  await app.close();
});

void test('session status and logout require server session and exact origin', async () => {
  const login = new StaticAccountLogin();
  let resolveCalls = 0;
  const identity = new SessionAccountIdentityProvider({
    resolve() {
      resolveCalls += 1;
      return Promise.resolve({ accountId: 'account_12345678', authenticationTime: 1 });
    }
  });
  const app = buildControlApi({
    identityProvider: identity,
    store: new StaticStore(),
    audit: new MemoryAudit(),
    accountLogin: login,
    publicOrigin: 'https://platform.example.test'
  });
  const cookie = `__Host-wepuu_session=${'s'.repeat(43)}`;
  assert.equal((await app.inject({
    method: 'GET', url: '/v1/account/session', headers: { cookie: '__Host-wepuu_session=malformed' }
  })).statusCode, 401);
  assert.equal(resolveCalls, 0);
  assert.deepEqual((await app.inject({ method: 'GET', url: '/v1/account/session', headers: { cookie } })).json(), {
    authenticated: true
  });
  assert.equal((await app.inject({
    method: 'POST', url: '/v1/account/logout', headers: { cookie, origin: 'https://attacker.example' }
  })).statusCode, 403);
  const logout = await app.inject({
    method: 'POST', url: '/v1/account/logout', headers: { cookie, origin: 'https://platform.example.test' }
  });
  assert.equal(logout.statusCode, 204);
  assert.equal(login.loggedOutToken, 's'.repeat(43));
  assert.match(String(logout.headers['set-cookie']), /__Host-wepuu_session=; Max-Age=0/u);
  await app.close();
});

void test('pairing start page consumes fragment client-side without reflecting verifier', async () => {
  const app = buildControlApi({ identityProvider: new StaticIdentity(), store: new StaticStore(), audit: new MemoryAudit() });
  const response = await app.inject({ method: 'GET', url: '/v1/pairing/start' });
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.includes('PAIRING_VERIFIER_CANARY'), false);
  assert.match(response.body, /history\.replaceState/u);
  assert.match(response.headers['content-security-policy'] ?? '', /script-src 'sha256-/u);
  assert.equal(response.headers['referrer-policy'], 'no-referrer');
  await app.close();
});

void test('pairing mutation requires exact origin and server-authenticated tenant context', async () => {
  const pairing = new StaticPairing();
  const audit = new MemoryAudit();
  const app = buildControlApi({
    identityProvider: new StaticIdentity({ accountId: 'account_12345678', authenticationTime: 1, authenticationMethod: 'oidc' }),
    store: new StaticStore(), audit, pairing, publicOrigin: 'https://platform.example.test'
  });
  const payload = { resource: 'https://site.example.test/wp-json/wp-auto/mcp', verifier: 'v'.repeat(43) };
  assert.equal((await app.inject({ method: 'POST', url: `/v1/tenants/${tenantId}/pairing`, payload })).statusCode, 403);
  const response = await app.inject({
    method: 'POST', url: `/v1/tenants/${tenantId}/pairing`,
    headers: { origin: 'https://platform.example.test' }, payload
  });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { site_id: 'site_00000001', status: 'active' });
  assert.equal(pairing.context?.tenantId, tenantId);
  assert.deepEqual(pairing.input, payload);
  assert.equal(JSON.stringify(audit.events).includes(payload.verifier), false);
  await app.close();
});
