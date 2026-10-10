import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AccountPrincipal, GrantView, SiteView, TenantContext, TenantMembershipView, TenantView } from '@wepuu/contracts';
import type { SecurityEventView } from '@wepuu/database';
import type { SecurityAuditEvent, SecurityAuditSink } from '@wepuu/security-audit';
import type { AccountAuth } from '@wepuu/account-auth';
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
  readonly sites: SiteView[] = [];
  readonly grants: GrantView[] = [];
  readonly events: SecurityEventView[] = [];
  revokedGrant: string | undefined;
  findTenant(context: TenantContext): Promise<TenantView> {
    this.contexts.push(context);
    return Promise.resolve({ id: context.tenantId, status: 'active', createdAt: '2026-09-16T00:00:00.000Z' });
  }
  listSecurityEvents(
    _context: TenantContext,
    limit: number,
    offset = 0,
    outcome?: SecurityEventView['outcome']
  ): Promise<readonly SecurityEventView[]> {
    const filtered = outcome === undefined ? this.events : this.events.filter((event) => event.outcome === outcome);
    return Promise.resolve(filtered.slice(offset, offset + limit));
  }
  listSites(): Promise<readonly SiteView[]> { return Promise.resolve(this.sites); }
  findActiveSite(): Promise<SiteView | undefined> { return Promise.resolve(undefined); }
  listGrants(): Promise<readonly GrantView[]> { return Promise.resolve(this.grants); }
  revokeGrant(_context: TenantContext, grantId: string): Promise<boolean> {
    this.revokedGrant = grantId;
    return Promise.resolve(true);
  }
  disconnectSite(): Promise<boolean> { return Promise.resolve(true); }
}

class StaticAccountAuth implements AccountAuth {
  signedOut = false;
  failWith: Error | undefined;
  lastRequest: { method: string; url: string; contentType?: string; body: string } | undefined;
  async handle(request: Request) {
    this.lastRequest = {
      method: request.method,
      url: request.url,
      ...(request.headers.get('content-type') === null ? {} : { contentType: request.headers.get('content-type') ?? '' }),
      body: await request.text()
    };
    const headers = new Headers({ 'content-type': 'application/json' });
    headers.append('set-cookie', '__Host-wepuu_state=state; Secure; HttpOnly; Path=/');
    headers.append('set-cookie', '__Host-wepuu_nonce=nonce; Secure; HttpOnly; Path=/');
    return new Response('{"ok":true}', {
      status: 200,
      headers
    });
  }
  getSession() { return Promise.resolve(undefined); }
  startTemporaryAuth0() {
    if (this.failWith !== undefined) return Promise.reject(this.failWith);
    return Promise.resolve(new Response(null, {
      status: 302,
      headers: {
        location: 'https://identity.example.test/authorize?request=redacted',
        'set-cookie': '__Host-wepuu_state=a.b.c; Max-Age=300; Path=/; Secure; HttpOnly; SameSite=Lax'
      }
    }));
  }
  signOut() {
    this.signedOut = true;
    return Promise.resolve(new Response(null, {
      status: 204,
      headers: { 'set-cookie': '__Host-wepuu_session=; Max-Age=0; Path=/; Secure; HttpOnly; SameSite=Lax' }
    }));
  }
  close() { return Promise.resolve(); }
}

void test('Fastify adapter preserves request semantics and separate Set-Cookie headers', async () => {
  const accountAuth = new StaticAccountAuth();
  const app = buildControlApi({
    identityProvider: new StaticIdentity(), store: new StaticStore(), audit: new MemoryAudit(),
    accountAuth, publicOrigin: 'https://platform.example.test'
  });
  const response = await app.inject({
    method: 'POST',
    url: '/api/auth/example?mode=test',
    headers: { 'content-type': 'application/json' },
    payload: { safe: true }
  });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { ok: true });
  assert.deepEqual(accountAuth.lastRequest, {
    method: 'POST',
    url: 'https://platform.example.test/api/auth/example?mode=test',
    contentType: 'application/json',
    body: '{"safe":true}'
  });
  assert.deepEqual(response.headers['set-cookie'], [
    '__Host-wepuu_state=state; Secure; HttpOnly; Path=/',
    '__Host-wepuu_nonce=nonce; Secure; HttpOnly; Path=/'
  ]);
  await app.close();
});

class StaticWorkspace {
  ensuredAccount: string | undefined;
  readonly membership: TenantMembershipView = {
    tenantId, role: 'owner', status: 'active', createdAt: '2026-09-16T00:00:00.000Z', isHome: true
  };
  ensurePersonalWorkspace(accountId: string): Promise<TenantMembershipView> {
    this.ensuredAccount = accountId;
    return Promise.resolve(this.membership);
  }
  listMemberships(): Promise<readonly TenantMembershipView[]> { return Promise.resolve([this.membership]); }
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
  assert.match(response.headers['content-security-policy'] ?? '', /script-src 'self'/u);
  assert.equal(response.headers['cache-control'], 'no-store');
  const script = await app.inject({ method: 'GET', url: '/assets/consent-complete-v1.js' });
  assert.equal(script.body.includes('location.hash'), true);
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
  const app = buildControlApi({
    identityProvider: identity, store, audit: new MemoryAudit(), publicOrigin: 'https://platform.example.test'
  });
  const url = `/v1/tenants/${tenantId}/grants/grant_00000001/revoke`;
  const cookie = `__Host-wepuu_session=${'s'.repeat(43)}`;
  assert.equal((await app.inject({ method: 'POST', url, headers: { cookie, origin: 'https://platform.example.test' } })).statusCode, 400);
  const response = await app.inject({
    method: 'POST',
    url,
    headers: { cookie, origin: 'https://platform.example.test', 'idempotency-key': 'idempotency_0000000001' }
  });
  assert.equal(response.statusCode, 204);
  assert.equal(store.revokedGrant, 'grant_00000001');
  await app.close();
});

void test('Better Auth login uses secure cookies, strict returns and a local bootstrap', async () => {
  const accountAuth = new StaticAccountAuth();
  const app = buildControlApi({
    identityProvider: new StaticIdentity({ accountId: 'account_12345678', authenticationTime: 1, authenticationMethod: 'oidc' }),
    store: new StaticStore(),
    audit: new MemoryAudit(),
    accountAuth,
    publicOrigin: 'https://platform.example.test'
  });
  const alias = await app.inject({ method: 'GET', url: '/v1/account/oidc/login?return_to=%2Fv1%2Faccount%2Fsession' });
  assert.equal(alias.statusCode, 303);
  assert.equal(alias.headers.location, '/v1/account/login?return_to=%2Fv1%2Faccount%2Fsession');
  const start = await app.inject({ method: 'GET', url: '/v1/account/login?return_to=%2Fv1%2Faccount%2Fsession' });
  assert.equal(start.statusCode, 302);
  assert.equal(start.headers.location, 'https://identity.example.test/authorize?request=redacted');
  assert.match(String(start.headers['set-cookie']), /__Host-wepuu_state=.*Secure.*HttpOnly.*SameSite=Lax/u);

  const bootstrap = await app.inject({ method: 'GET', url: '/v1/account/bootstrap?return_to=%2Fv1%2Faccount%2Fsession' });
  assert.equal(bootstrap.statusCode, 303);
  assert.equal(bootstrap.headers.location, '/v1/account/session');
  const external = await app.inject({ method: 'GET', url: '/v1/account/login?return_to=https%3A%2F%2Fevil.example' });
  assert.equal(external.statusCode, 400);
  await app.close();
});

void test('legacy OIDC callback is closed and never reflects provider parameters', async () => {
  const app = buildControlApi({
    identityProvider: new StaticIdentity(),
    store: new StaticStore(),
    audit: new MemoryAudit(),
    accountAuth: new StaticAccountAuth(),
    publicOrigin: 'https://platform.example.test'
  });
  const response = await app.inject({
    method: 'GET',
    url: '/v1/account/oidc/callback?code=secret-code&state=secret-state',
    headers: { cookie: '__Host-wepuu_oidc_tx=a.b.c.d.e' }
  });
  assert.equal(response.statusCode, 410);
  assert.deepEqual(response.json(), { error: 'invalid_request' });
  const evidence = response.body;
  assert.equal(evidence.includes('secret-code'), false);
  assert.equal(evidence.includes('secret-state'), false);
  await app.close();
});

void test('SSR workspace redirects unauthenticated users and renders a content-free grant view', async () => {
  const denied = buildControlApi({ identityProvider: new StaticIdentity(), store: new StaticStore(), audit: new MemoryAudit() });
  const redirect = await denied.inject({ method: 'GET', url: '/app' });
  assert.equal(redirect.statusCode, 303);
  assert.equal(redirect.headers.location, '/v1/account/login?return_to=%2Fapp');
  await denied.close();

  const store = new StaticStore();
  store.grants.push({
    id: 'grant_00000001', tenantId, siteId: 'site_00000001', subjectId: 'subject_CANARY',
    clientId: 'client_00000001', scopes: ['mcp:read'], status: 'active', consentVersion: '1',
    createdAt: '2026-09-16T00:00:00.000Z'
  });
  const app = buildControlApi({
    identityProvider: new StaticIdentity({ accountId: 'account_12345678', authenticationTime: 1, authenticationMethod: 'oidc' }),
    store, workspace: new StaticWorkspace(), audit: new MemoryAudit(), publicOrigin: 'https://platform.example.test'
  });
  const page = await app.inject({ method: 'GET', url: `/app/tenants/${tenantId}/grants` });
  assert.equal(page.statusCode, 200);
  assert.match(page.headers['content-security-policy'] ?? '', /default-src 'none'/u);
  assert.equal(page.body.includes('subject_CANARY'), false);
  assert.equal(page.body.includes('client_00000001'), true);
  assert.equal(page.body.includes('MCP data travels direct'), true);
  const csrf = /name="csrf" value="([A-Za-z0-9_-]{43})"/u.exec(page.body)?.[1];
  assert.ok(csrf);
  const cookie = String(page.headers['set-cookie']).split(';')[0];
  const action = `/app/tenants/${tenantId}/grants/grant_00000001/revoke`;
  const payload = new URLSearchParams({ csrf, idempotency_key: 'idempotency_00000001' }).toString();
  const crossOrigin = await app.inject({
    method: 'POST', url: action,
    headers: { cookie, origin: 'https://evil.example.test', 'content-type': 'application/x-www-form-urlencoded' }, payload
  });
  assert.equal(crossOrigin.statusCode, 403);
  const revoked = await app.inject({
    method: 'POST', url: action,
    headers: { cookie, origin: 'https://platform.example.test', 'content-type': 'application/x-www-form-urlencoded' }, payload
  });
  assert.equal(revoked.statusCode, 303);
  assert.equal(revoked.headers.location, `/app/tenants/${tenantId}/grants`);
  assert.equal(store.revokedGrant, 'grant_00000001');
  await app.close();
});

void test('bootstrap fails closed when a Better Auth session has no active account mapping', async () => {
  const app = buildControlApi({
    identityProvider: new StaticIdentity(), store: new StaticStore(), audit: new MemoryAudit(),
    accountAuth: new StaticAccountAuth(), publicOrigin: 'https://platform.example.test'
  });
  const bootstrap = await app.inject({ method: 'GET', url: '/v1/account/bootstrap?return_to=%2Fapp' });
  assert.equal(bootstrap.statusCode, 401);
  assert.deepEqual(bootstrap.json(), { error: 'unauthenticated' });
  await app.close();
});

void test('session status and logout require server session and exact origin', async () => {
  const accountAuth = new StaticAccountAuth();
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
    accountAuth,
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
  assert.equal(accountAuth.signedOut, true);
  assert.match(String(logout.headers['set-cookie']), /__Host-wepuu_session=; Max-Age=0/u);
  await app.close();
});

void test('pairing start page consumes fragment client-side without reflecting verifier', async () => {
  const app = buildControlApi({ identityProvider: new StaticIdentity(), store: new StaticStore(), audit: new MemoryAudit() });
  const response = await app.inject({ method: 'GET', url: '/v1/pairing/start' });
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.includes('PAIRING_VERIFIER_CANARY'), false);
  assert.match(response.body, /pairing-v1\.js/u);
  assert.match(response.headers['content-security-policy'] ?? '', /script-src 'self'/u);
  const script = await app.inject({ method: 'GET', url: '/assets/pairing-v1.js' });
  assert.match(script.body, /history\.replaceState/u);
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

void test('release-readiness pages expose verified metadata without identity subjects or secrets', async () => {
  const store = new StaticStore();
  store.sites.push({
    id: 'site_00000001', tenantId, resource: 'https://site.example.test/wp-json/wp-auto/mcp',
    displayHostname: 'site.example.test', status: 'active', protocolVersion: '1',
    createdAt: '2026-10-07T00:00:00.000Z'
  });
  store.grants.push({
    id: 'grant_00000001', tenantId, siteId: 'site_00000001', subjectId: 'subject_MUST_NOT_RENDER',
    clientId: 'client_00000001', scopes: ['mcp:read'], status: 'active', consentVersion: '1',
    createdAt: '2026-10-07T00:00:00.000Z'
  });
  const app = buildControlApi({
    identityProvider: new StaticIdentity({ accountId: 'account_12345678', authenticationTime: 1, authenticationMethod: 'oidc' }),
    store, workspace: new StaticWorkspace(), audit: new MemoryAudit(), publicOrigin: 'https://platform.example.test',
    deploymentReadiness: {
      ready: false,
      checks: [{ id: 'signing', label: 'Local signing custody', status: 'pending', detail: 'Configure protected key files.' }]
    }
  });
  const site = await app.inject({ method: 'GET', url: `/app/tenants/${tenantId}/sites/site_00000001` });
  assert.equal(site.statusCode, 200);
  assert.match(site.body, /Changing the origin requires a new pairing/u);
  const grant = await app.inject({ method: 'GET', url: `/app/tenants/${tenantId}/grants/grant_00000001` });
  assert.equal(grant.statusCode, 200);
  assert.equal(grant.body.includes('subject_MUST_NOT_RENDER'), false);
  assert.match(grant.body, /WordPress still evaluates its local user/u);
  const compatibility = await app.inject({ method: 'GET', url: '/app/compatibility' });
  assert.equal(compatibility.statusCode, 200);
  assert.match(compatibility.body, /WorkBuddy \/ codebuddy/u);
  assert.match(compatibility.body, /No standards-compliant path verified/u);
  const readiness = await app.inject({ method: 'GET', url: '/app/readiness' });
  assert.equal(readiness.statusCode, 200);
  assert.match(readiness.body, /Public release stays locked/u);
  assert.equal(readiness.body.includes('AWS_ROLE_ARN'), false);
  await app.close();
});

void test('activity filtering and pagination use bounded content-free records', async () => {
  const store = new StaticStore();
  for (let index = 0; index < 25; index += 1) {
    store.events.push({
      id: String(index + 1), occurredAt: `2026-10-07T00:${String(index).padStart(2, '0')}:00.000Z`,
      eventName: 'account.authentication_denied', outcome: 'denied', reason: 'identity_missing',
      correlationId: `correlation_${String(index).padStart(2, '0')}`, service: 'control-api'
    });
  }
  const app = buildControlApi({
    identityProvider: new StaticIdentity({ accountId: 'account_12345678', authenticationTime: 1, authenticationMethod: 'oidc' }),
    store, workspace: new StaticWorkspace(), audit: new MemoryAudit(), publicOrigin: 'https://platform.example.test'
  });
  const first = await app.inject({ method: 'GET', url: `/app/tenants/${tenantId}/activity?outcome=denied&page=1` });
  assert.equal(first.statusCode, 200);
  assert.match(first.body, /Page 1/u);
  assert.match(first.body, />Next</u);
  const second = await app.inject({ method: 'GET', url: `/app/tenants/${tenantId}/activity?outcome=denied&page=2` });
  assert.equal(second.statusCode, 200);
  assert.match(second.body, />Previous</u);
  assert.doesNotMatch(second.body, />Next</u);
  assert.equal((await app.inject({ method: 'GET', url: `/app/tenants/${tenantId}/activity?outcome=unknown` })).statusCode, 400);
  await app.close();
});

void test('operations metrics require a dedicated token and contain no request content', async () => {
  const token = 'operations-token-that-is-at-least-32-characters';
  const app = buildControlApi({
    identityProvider: new StaticIdentity(), store: new StaticStore(), audit: new MemoryAudit(),
    operationsMetricsToken: token, readiness: () => Promise.resolve()
  });
  assert.equal((await app.inject({ method: 'GET', url: '/livez?content=WORDPRESS_CANARY' })).statusCode, 200);
  assert.equal((await app.inject({ method: 'GET', url: '/readyz' })).statusCode, 200);
  assert.equal((await app.inject({ method: 'GET', url: '/internal/metrics' })).statusCode, 404);
  assert.equal((await app.inject({ method: 'GET', url: '/internal/metrics', headers: { authorization: 'Bearer wrong' } })).statusCode, 404);
  const metrics = await app.inject({
    method: 'GET', url: '/internal/metrics', headers: { authorization: `Bearer ${token}` }
  });
  assert.equal(metrics.statusCode, 200);
  assert.match(metrics.body, /wepuu_control_requests_total/u);
  assert.equal(metrics.body.includes(token), false);
  assert.equal(metrics.body.includes('WORDPRESS_CANARY'), false);
  await app.close();
});
