import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AccountPrincipal, GrantView, SiteView, TenantContext, TenantView } from '@wepuu/contracts';
import type { SecurityEventView } from '@wepuu/database';
import type { SecurityAuditEvent, SecurityAuditSink } from '@wepuu/security-audit';
import {
  buildControlApi,
  SessionAccountIdentityProvider,
  type AccountIdentityProvider,
  type ControlStore
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
  listGrants(): Promise<readonly GrantView[]> { return Promise.resolve([]); }
  revokeGrant(_context: TenantContext, grantId: string): Promise<boolean> {
    this.revokedGrant = grantId;
    return Promise.resolve(true);
  }
  disconnectSite(): Promise<boolean> { return Promise.resolve(true); }
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
