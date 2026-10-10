import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AccountPrincipal, GrantView, SiteView, TenantContext, TenantMembershipView, TenantView } from '@wepuu/contracts';
import type { SecurityEventView } from '@wepuu/database';
import type { SecurityAuditEvent, SecurityAuditSink } from '@wepuu/security-audit';
import { createAccountAuth, MockOtpEmailSender, type AccountAuth } from '@wepuu/account-auth';
import { Database, PostgresAccountLoginTransactionStore } from '@wepuu/database';
import {
  buildControlApi,
  SessionAccountIdentityProvider,
  type AccountIdentityProvider,
  type AccountLoginTransactionStore,
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
  session: Awaited<ReturnType<AccountAuth['getSession']>> = undefined;
  sessionAfterHandle: Awaited<ReturnType<AccountAuth['getSession']>> = undefined;
  deliveryOutcome: ReturnType<AccountAuth['takeDeliveryOutcome']> = 'accepted';
  lastRequest: { method: string; url: string; contentType?: string; clientIp?: string; origin?: string; body: string } | undefined;
  async handle(request: Request) {
    this.lastRequest = {
      method: request.method,
      url: request.url,
      ...(request.headers.get('content-type') === null ? {} : { contentType: request.headers.get('content-type') ?? '' }),
      ...(request.headers.get('x-wepuu-client-ip') === null ? {} : { clientIp: request.headers.get('x-wepuu-client-ip') ?? '' }),
      ...(request.headers.get('origin') === null ? {} : { origin: request.headers.get('origin') ?? '' }),
      body: await request.text()
    };
    const headers = new Headers({ 'content-type': 'application/json' });
    headers.append('set-cookie', '__Host-wepuu_state=state; Secure; HttpOnly; Path=/');
    headers.append('set-cookie', '__Host-wepuu_nonce=nonce; Secure; HttpOnly; Path=/');
    if (request.url.endsWith('/sign-in/email-otp') && this.sessionAfterHandle !== undefined) {
      this.session = this.sessionAfterHandle;
      headers.append('set-cookie', '__Host-wepuu_session=new-session; Secure; HttpOnly; SameSite=Lax; Path=/');
    }
    return new Response('{"ok":true}', {
      status: 200,
      headers
    });
  }
  getSession() { return Promise.resolve(this.session); }
  takeDeliveryOutcome() { return this.deliveryOutcome; }
  signOut() {
    this.signedOut = true;
    return Promise.resolve(new Response(null, {
      status: 204,
      headers: { 'set-cookie': '__Host-wepuu_session=; Max-Age=0; Path=/; Secure; HttpOnly; SameSite=Lax' }
    }));
  }
  close() { return Promise.resolve(); }
}

class MemoryLoginTransactions implements AccountLoginTransactionStore {
  token = 't'.repeat(43);
  returnPath = '/app';
  boundEmail: string | undefined;
  completed = false;
  failCompletion = false;
  create(returnPath: string) {
    this.returnPath = returnPath;
    return Promise.resolve({ token: this.token, returnPath, expiresAt: new Date(Date.now() + 600_000) });
  }
  bindEmail(_token: string, _csrf: string, email: string) {
    this.boundEmail = email;
    return Promise.resolve();
  }
  restart() {
    this.token = 'r'.repeat(43);
    this.boundEmail = undefined;
    return Promise.resolve({ token: this.token, returnPath: this.returnPath, expiresAt: new Date(Date.now() + 600_000) });
  }
  complete() {
    if (this.failCompletion) return Promise.reject(new Error('bootstrap_failed'));
    this.completed = true;
    return Promise.resolve({
      accountId: 'account_12345678', homeTenantId: tenantId, accountStatus: 'active' as const,
      returnPath: this.returnPath
    });
  }
}

void test('raw Better Auth routes are not public', async () => {
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
  assert.equal(response.statusCode, 404);
  assert.equal(accountAuth.lastRequest, undefined);
  await app.close();
});

void test('real Fastify HTTP ingress enforces Better Auth database limits and completes Email OTP', {
  skip: process.env['WEPUU_TEST_DATABASE_URL'] === undefined
}, async (t) => {
  const connectionString = process.env['WEPUU_TEST_DATABASE_URL'];
  assert.ok(connectionString);
  const database = new Database({ connectionString, applicationName: 'wepuu-email-otp-http-test' });
  t.after(() => database.close());
  await database.migrate();
  const admin = database.poolForMigrationsAndTests;
  await admin.query('TRUNCATE platform.account_login_transactions');
  await admin.query('TRUNCATE platform.accounts CASCADE');
  await admin.query('TRUNCATE auth."user" CASCADE');
  await admin.query('TRUNCATE auth."rateLimit"');
  let deliveredOtp: string | undefined;
  let deliveryCount = 0;
  const accountAuth = createAccountAuth({
    databaseUrl: connectionString,
    applicationName: 'wepuu-email-otp-http-auth-test',
    publicOrigin: 'https://platform.example.test',
    secrets: [{ version: 1, value: 'email-otp-http-test-secret-value-000000000000000000' }],
    databaseRole: 'wepuu_account_auth_writer',
    emailSender: new MockOtpEmailSender(({ otp }) => {
      deliveryCount += 1;
      deliveredOtp = otp;
      return Promise.resolve('accepted');
    }),
    rateLimit: { sendWindowSeconds: 60, sendMax: 1, verifyWindowSeconds: 300, verifyMax: 5 }
  });
  t.after(() => accountAuth.close());
  const app = buildControlApi({
    identityProvider: new StaticIdentity(), store: new StaticStore(), audit: new MemoryAudit(),
    accountAuth,
    loginTransactions: new PostgresAccountLoginTransactionStore(database),
    publicOrigin: 'https://platform.example.test'
  });
  let observedError: Error | undefined;
  app.addHook('onError', (_request, _reply, error, done) => {
    observedError = error;
    done();
  });
  const address = await app.listen({ host: '127.0.0.1', port: 0 });
  t.after(() => app.close());

  const start = await fetch(`${address}/v1/account/login?return_to=%2Fapp`, { redirect: 'manual' });
  assert.equal(start.status, 200, observedError?.stack);
  const page = await start.text();
  const transaction = /name="transaction" value="([A-Za-z0-9_-]{43})"/u.exec(page)?.[1];
  const csrfToken = /name="csrf" value="([A-Za-z0-9_-]{43})"/u.exec(page)?.[1];
  assert.ok(transaction);
  assert.ok(csrfToken);
  const csrfCookie = start.headers.getSetCookie().find((value) => value.startsWith('__Host-wepuu_csrf='));
  assert.ok(csrfCookie);
  const cookie = csrfCookie.split(';', 1)[0] ?? '';
  const sendBody = new URLSearchParams({ transaction, csrf: csrfToken, email: ' Http@Test.Example ' });
  const send = await fetch(`${address}/v1/account/email/send`, {
    method: 'POST', redirect: 'manual',
    headers: {
      origin: 'https://platform.example.test', cookie,
      'content-type': 'application/x-www-form-urlencoded',
      'x-forwarded-for': '203.0.113.99'
    },
    body: sendBody
  });
  assert.equal(send.status, 200);
  assert.equal(deliveryCount, 1);
  assert.match(deliveredOtp ?? '', /^\d{6}$/u);

  const concurrent = await Promise.all(Array.from({ length: 6 }, () => fetch(
    `${address}/v1/account/email/resend`, {
      method: 'POST', redirect: 'manual',
      headers: {
        origin: 'https://platform.example.test', cookie,
        'content-type': 'application/x-www-form-urlencoded',
        'x-forwarded-for': `${Math.floor(Math.random() * 200) + 1}.0.0.1`
      },
      body: sendBody
    }
  )));
  assert.deepEqual(concurrent.map((response) => response.status), [429, 429, 429, 429, 429, 429]);
  assert.equal(deliveryCount, 1);
  const persistedLimit = await admin.query<{ key: string; count: number }>(
    'SELECT "key", "count" FROM auth."rateLimit" WHERE "key" LIKE $1',
    ['127.0.0.1|%send-verification-otp']
  );
  assert.equal(persistedLimit.rowCount, 1);

  const verify = await fetch(`${address}/v1/account/email/verify`, {
    method: 'POST', redirect: 'manual',
    headers: {
      origin: 'https://platform.example.test', cookie,
      'content-type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({ transaction, csrf: csrfToken, email: 'http@test.example', otp: deliveredOtp ?? '' })
  });
  assert.equal(verify.status, 303);
  assert.equal(verify.headers.get('location'), '/app');
  const sessionCookie = verify.headers.getSetCookie().find((value) => value.startsWith('__Host-wepuu_session='));
  assert.ok(sessionCookie);
  assert.match(sessionCookie, /Secure/u);
  assert.match(sessionCookie, /HttpOnly/u);
  assert.match(sessionCookie, /SameSite=Lax/ui);
  assert.doesNotMatch(sessionCookie, /Domain=/ui);
  assert.equal(JSON.stringify((await admin.query('SELECT "identifier", "value" FROM auth."verification"')).rows)
    .includes(deliveredOtp ?? 'missing'), false);
  assert.equal((await admin.query('SELECT 1 FROM platform.account_auth_links')).rowCount, 1);

  await admin.query('TRUNCATE auth."rateLimit"');
  const secondStart = await fetch(`${address}/v1/account/login?return_to=%2Finteraction%2Fretry`, { redirect: 'manual' });
  const secondPage = await secondStart.text();
  const secondTransaction = /name="transaction" value="([A-Za-z0-9_-]{43})"/u.exec(secondPage)?.[1];
  const secondCsrf = /name="csrf" value="([A-Za-z0-9_-]{43})"/u.exec(secondPage)?.[1];
  const secondCookieHeader = secondStart.headers.getSetCookie()
    .find((value) => value.startsWith('__Host-wepuu_csrf='));
  assert.ok(secondTransaction);
  assert.ok(secondCsrf);
  assert.ok(secondCookieHeader);
  const secondCookie = secondCookieHeader.split(';', 1)[0] ?? '';
  const secondEmail = 'attempt-limit@example.test';
  const secondSend = await fetch(`${address}/v1/account/email/send`, {
    method: 'POST', redirect: 'manual',
    headers: {
      origin: 'https://platform.example.test', cookie: secondCookie,
      'content-type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({ transaction: secondTransaction, csrf: secondCsrf, email: secondEmail })
  });
  assert.equal(secondSend.status, 200);
  const verificationLifetime = await admin.query<{ lifetime: string }>(
    `SELECT extract(epoch FROM ("expiresAt" - "createdAt"))::text AS lifetime
     FROM auth."verification" ORDER BY "createdAt" DESC LIMIT 1`
  );
  const lifetimeSeconds = Number(verificationLifetime.rows[0]?.lifetime);
  assert.ok(lifetimeSeconds >= 299 && lifetimeSeconds <= 300);
  const wrongBody = new URLSearchParams({
    transaction: secondTransaction, csrf: secondCsrf, email: secondEmail,
    otp: deliveredOtp === '000000' ? '111111' : '000000'
  });
  const wrongStatuses: number[] = [];
  for (let attempt = 0; attempt < 6; attempt += 1) {
    wrongStatuses.push((await fetch(`${address}/v1/account/email/verify`, {
      method: 'POST', redirect: 'manual',
      headers: {
        origin: 'https://platform.example.test', cookie: secondCookie,
        'content-type': 'application/x-www-form-urlencoded'
      },
      body: wrongBody
    })).status);
  }
  assert.deepEqual(wrongStatuses.slice(0, 5), [400, 400, 400, 400, 400]);
  assert.equal(wrongStatuses[5], 429);
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

void test('Email OTP login protects return state and reaches Better Auth through the HTTP handler', async () => {
  const accountAuth = new StaticAccountAuth();
  const transactions = new MemoryLoginTransactions();
  const app = buildControlApi({
    identityProvider: new StaticIdentity({ accountId: 'account_12345678', authenticationTime: 1, authenticationMethod: 'oidc' }),
    store: new StaticStore(),
    audit: new MemoryAudit(),
    accountAuth,
    loginTransactions: transactions,
    publicOrigin: 'https://platform.example.test'
  });
  const start = await app.inject({ method: 'GET', url: '/v1/account/login?return_to=%2Fv1%2Faccount%2Fsession' });
  assert.equal(start.statusCode, 200);
  assert.match(start.body, /Welcome Back/u);
  assert.equal(start.body.includes('return_to'), false);
  const csrf = /name="csrf" value="([A-Za-z0-9_-]{43})"/u.exec(start.body)?.[1];
  const transaction = /name="transaction" value="([A-Za-z0-9_-]{43})"/u.exec(start.body)?.[1];
  assert.ok(csrf);
  assert.equal(transaction, transactions.token);
  const cookie = String(start.headers['set-cookie']).split(';', 1)[0];
  const sent = await app.inject({
    method: 'POST', url: '/v1/account/email/send',
    headers: {
      origin: 'https://platform.example.test', cookie,
      'content-type': 'application/x-www-form-urlencoded',
      'x-forwarded-for': '203.0.113.77'
    },
    payload: new URLSearchParams({ csrf, transaction, email: ' User@Example.Test ' }).toString()
  });
  assert.equal(sent.statusCode, 200);
  assert.match(sent.body, /Check Your Inbox/u);
  assert.equal(transactions.boundEmail, 'user@example.test');
  assert.deepEqual(accountAuth.lastRequest, {
    method: 'POST',
    url: 'https://platform.example.test/api/auth/email-otp/send-verification-otp',
    contentType: 'application/json',
    clientIp: '127.0.0.1',
    origin: 'https://platform.example.test',
    body: '{"email":"user@example.test","type":"sign-in"}'
  });
  assert.deepEqual(sent.headers['set-cookie'], [
    '__Host-wepuu_state=state; Secure; HttpOnly; Path=/',
    '__Host-wepuu_nonce=nonce; Secure; HttpOnly; Path=/'
  ]);
  const external = await app.inject({ method: 'GET', url: '/v1/account/login?return_to=https%3A%2F%2Fevil.example' });
  assert.equal(external.statusCode, 400);
  await app.close();
});

void test('removed Auth0 routes are absent and never reflect provider parameters', async () => {
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
  assert.equal(response.statusCode, 404);
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

void test('bootstrap failure preserves the Better Auth session and offers an idempotent retry', async () => {
  const accountAuth = new StaticAccountAuth();
  accountAuth.sessionAfterHandle = {
    userId: 'auth_user_retry', createdAt: new Date(), expiresAt: new Date(Date.now() + 60_000)
  };
  const transactions = new MemoryLoginTransactions();
  transactions.failCompletion = true;
  const app = buildControlApi({
    identityProvider: new StaticIdentity(), store: new StaticStore(), audit: new MemoryAudit(),
    accountAuth, loginTransactions: transactions, publicOrigin: 'https://platform.example.test'
  });
  const start = await app.inject({ method: 'GET', url: '/v1/account/login?return_to=%2Fapp' });
  const csrfToken = /name="csrf" value="([A-Za-z0-9_-]{43})"/u.exec(start.body)?.[1];
  const transaction = /name="transaction" value="([A-Za-z0-9_-]{43})"/u.exec(start.body)?.[1];
  assert.ok(csrfToken);
  assert.ok(transaction);
  const cookie = String(start.headers['set-cookie']).split(';', 1)[0];
  const failed = await app.inject({
    method: 'POST', url: '/v1/account/email/verify',
    headers: {
      origin: 'https://platform.example.test', cookie,
      'content-type': 'application/x-www-form-urlencoded'
    },
    payload: new URLSearchParams({
      csrf: csrfToken, transaction, email: 'retry@example.test', otp: '123456'
    }).toString()
  });
  assert.equal(failed.statusCode, 503);
  assert.match(failed.body, /do not need another code/u);
  assert.match(failed.body, /Retry account setup/u);
  assert.match(String(failed.headers['set-cookie']), /__Host-wepuu_session=new-session/u);
  assert.equal(transactions.completed, false);
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
