import { createHash, randomBytes } from 'node:crypto';
import Fastify, { LogController, type FastifyInstance, type FastifyRequest } from 'fastify';
import { z } from 'zod';
import { AccountLoginError, type AccountLoginCompletion, type AccountLoginStart } from '@wepuu/account-identity';
import {
  AccountPrincipalSchema,
  McpScopeSetSchema,
  OAuthClientIdSchema,
  OpaqueIdSchema,
  PlatformError,
  TenantContextSchema,
  type AccountPrincipal,
  type GrantView,
  type McpScope,
  type SiteView,
  type TenantContext,
  type TenantView
} from '@wepuu/contracts';
import {
  SecurityEventRepository,
  GrantViewRepository,
  SiteRepository,
  TenantRepository,
  type Database,
  type SecurityEventView
} from '@wepuu/database';
import type { SecurityAuditEvent, SecurityAuditSink } from '@wepuu/security-audit';

const TenantParamsSchema = z.object({ tenantId: z.uuid() });
const ObjectParamsSchema = TenantParamsSchema.extend({ objectId: OpaqueIdSchema });
const SiteParamsSchema = TenantParamsSchema.extend({ siteId: OpaqueIdSchema });
const GrantParamsSchema = TenantParamsSchema.extend({ grantId: OpaqueIdSchema });
const IdempotencyKeySchema = z.string().regex(/^[A-Za-z0-9_-]{16,128}$/u);
const AccountLoginQuerySchema = z.object({ return_to: z.string().max(2_048).optional() }).strict();
const PairingBodySchema = z.object({
  resource: z.string().min(1).max(2_048),
  verifier: z.string().regex(/^[A-Za-z0-9_-]{43,128}$/u)
}).strict();
const GrantStartBodySchema = z.object({
  client_id: OAuthClientIdSchema,
  scopes: McpScopeSetSchema
}).strict();
const GrantCompletionBodySchema = z.object({
  proof: z.string().min(1).max(16 * 1_024),
  challenge: z.string().regex(/^[A-Za-z0-9_-]{43}$/u),
  decision: z.enum(['approved', 'denied'])
}).strict();
const SESSION_COOKIE = '__Host-wepuu_session';
const TRANSACTION_COOKIE = '__Host-wepuu_oidc_tx';

export interface AccountIdentityProvider {
  authenticate(request: FastifyRequest): Promise<AccountPrincipal | undefined>;
}

export class DenyAllAccountIdentityProvider implements AccountIdentityProvider {
  authenticate(): Promise<undefined> {
    return Promise.resolve(undefined);
  }
}

export interface AccountSessionStore {
  resolve(sessionHash: Uint8Array): Promise<{ accountId: string; authenticationTime: number } | undefined>;
}

function requestCookie(request: FastifyRequest, cookieName: string): string | undefined {
  const header = request.headers.cookie;
  if (header === undefined || header.length > 4_096) return undefined;
  for (const part of header.split(';')) {
    const [name, ...value] = part.trim().split('=');
    if (name === cookieName) return value.join('=');
  }
  return undefined;
}

function sessionCookie(request: FastifyRequest): string | undefined {
  return requestCookie(request, SESSION_COOKIE);
}

function secureCookie(name: string, value: string, maxAgeSeconds: number): string {
  return `${name}=${value}; Max-Age=${String(Math.max(0, Math.trunc(maxAgeSeconds)))}; Path=/; Secure; HttpOnly; SameSite=Lax`;
}

function clearCookie(name: string): string {
  return secureCookie(name, '', 0);
}

export class SessionAccountIdentityProvider implements AccountIdentityProvider {
  readonly #sessions: AccountSessionStore;

  constructor(sessions: AccountSessionStore) {
    this.#sessions = sessions;
  }

  async authenticate(request: FastifyRequest): Promise<AccountPrincipal | undefined> {
    const token = sessionCookie(request);
    if (token === undefined || !/^[A-Za-z0-9_-]{43,128}$/u.test(token)) return undefined;
    const session = await this.#sessions.resolve(createHash('sha256').update(token, 'utf8').digest());
    return session === undefined ? undefined : AccountPrincipalSchema.parse({
      accountId: session.accountId,
      authenticationTime: session.authenticationTime,
      authenticationMethod: 'oidc'
    });
  }
}

export interface ControlStore {
  findTenant(context: TenantContext): Promise<TenantView | undefined>;
  listSecurityEvents(context: TenantContext, limit: number): Promise<readonly SecurityEventView[]>;
  listSites(context: TenantContext): Promise<readonly SiteView[]>;
  findActiveSite(context: TenantContext, siteId: string): Promise<SiteView | undefined>;
  listGrants(context: TenantContext): Promise<readonly GrantView[]>;
  revokeGrant(context: TenantContext, grantId: string): Promise<boolean>;
  disconnectSite(context: TenantContext, siteId: string): Promise<boolean>;
}

export class PostgresControlStore implements ControlStore {
  readonly #database: Database;
  readonly #tenants = new TenantRepository();
  readonly #events = new SecurityEventRepository();
  readonly #sites = new SiteRepository();
  readonly #grants = new GrantViewRepository();

  constructor(database: Database) {
    this.#database = database;
  }

  async findTenant(context: TenantContext): Promise<TenantView | undefined> {
    return this.#database.withTenant(context, (client) => this.#tenants.findById(client, context.tenantId));
  }

  async listSecurityEvents(context: TenantContext, limit: number): Promise<readonly SecurityEventView[]> {
    return this.#database.withTenant(context, (client) => this.#events.list(client, limit));
  }

  async listSites(context: TenantContext): Promise<readonly SiteView[]> {
    return this.#database.withTenant(context, (client) => this.#sites.list(client));
  }

  async findActiveSite(context: TenantContext, siteId: string): Promise<SiteView | undefined> {
    return this.#database.withTenant(context, (client) => this.#sites.findActive(client, context.tenantId, siteId));
  }

  async listGrants(context: TenantContext): Promise<readonly GrantView[]> {
    return this.#database.withTenant(context, (client) => this.#grants.list(client));
  }

  async revokeGrant(context: TenantContext, grantId: string): Promise<boolean> {
    return this.#database.withTenant(context, (client) => this.#grants.revoke(client, context.tenantId, grantId));
  }

  async disconnectSite(context: TenantContext, siteId: string): Promise<boolean> {
    return this.#database.withTenant(context, (client) => this.#sites.disconnect(client, context.tenantId, siteId));
  }
}

export interface ControlApiOptions {
  readonly identityProvider: AccountIdentityProvider;
  readonly store: ControlStore;
  readonly audit: SecurityAuditSink;
  readonly readiness?: () => Promise<void>;
  readonly accountLogin?: {
    start(returnTo?: string): Promise<AccountLoginStart>;
    complete(currentUrl: URL, transactionCookie: string): Promise<AccountLoginCompletion>;
    logout(sessionToken: string): Promise<void>;
  };
  readonly publicOrigin?: string;
  readonly pairing?: PairingOperations;
  readonly grants?: GrantOperations;
}

export interface PairingOperations {
  pair(context: TenantContext, input: { readonly resource: string; readonly verifier: string }): Promise<{
    readonly siteId: string;
  }>;
}

export interface GrantOperations {
  start(context: TenantContext, input: {
    readonly siteId: string;
    readonly clientId: string;
    readonly scopes: readonly McpScope[];
    readonly idempotencyKey: string;
  }): Promise<{ readonly grantId: string; readonly consentUrl: string; readonly expiresAt: Date }>;
  complete(context: TenantContext, input: {
    readonly grantId: string;
    readonly proof: string;
    readonly challenge: string;
    readonly decision: 'approved' | 'denied';
    readonly idempotencyKey: string;
  }): Promise<void>;
}

const pairingStartScript = `(() => {
  const key = 'wepuu_pairing_payload';
  const status = document.getElementById('status');
  const fromFragment = new URLSearchParams(location.hash.slice(1)).get('payload');
  if (fromFragment !== null) {
    if (fromFragment.length > 4096) { history.replaceState(null, '', '/v1/pairing/start'); status.textContent = 'Invalid pairing request.'; return; }
    sessionStorage.setItem(key, fromFragment);
    history.replaceState(null, '', '/v1/pairing/start');
  }
  const encoded = sessionStorage.getItem(key);
  if (encoded === null) { status.textContent = 'No pending pairing request.'; return; }
  try {
    const padded = encoded.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - encoded.length % 4) % 4);
    const bytes = Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
    const input = JSON.parse(new TextDecoder().decode(bytes));
    if (typeof input !== 'object' || input === null || typeof input.tenant_id !== 'string' || typeof input.resource !== 'string' || typeof input.verifier !== 'string') throw new Error();
    fetch('/v1/tenants/' + encodeURIComponent(input.tenant_id) + '/pairing', {
      method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ resource: input.resource, verifier: input.verifier })
    }).then((response) => {
      if (response.status === 401) {
        location.assign('/v1/account/oidc/login?return_to=%2Fv1%2Fpairing%2Fstart');
        return;
      }
      sessionStorage.removeItem(key);
      status.textContent = response.ok ? 'Pairing completed. You may return to WordPress.' : 'Pairing failed. Return to WordPress and start again.';
    }).catch(() => { sessionStorage.removeItem(key); status.textContent = 'Pairing failed. Return to WordPress and start again.'; });
  } catch { sessionStorage.removeItem(key); status.textContent = 'Invalid pairing request.'; }
})();`;

const consentCompleteScript = `(() => {
  const key = 'wepuu_consent_result';
  const status = document.getElementById('status');
  const fromFragment = new URLSearchParams(location.hash.slice(1)).get('result');
  if (fromFragment !== null) {
    if (fromFragment.length > 32768) { history.replaceState(null, '', '/v1/consent/complete'); status.textContent = 'Invalid consent result.'; return; }
    sessionStorage.setItem(key, fromFragment);
    history.replaceState(null, '', '/v1/consent/complete');
  }
  const encoded = sessionStorage.getItem(key);
  if (encoded === null) { status.textContent = 'No pending consent result.'; return; }
  try {
    const padded = encoded.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - encoded.length % 4) % 4);
    const bytes = Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
    const input = JSON.parse(new TextDecoder().decode(bytes));
    if (typeof input !== 'object' || input === null || typeof input.tenant_id !== 'string' || typeof input.grant_id !== 'string' || typeof input.proof !== 'string' || typeof input.challenge !== 'string' || typeof input.decision !== 'string' || typeof input.idempotency_key !== 'string') throw new Error();
    fetch('/v1/tenants/' + encodeURIComponent(input.tenant_id) + '/grants/' + encodeURIComponent(input.grant_id) + '/complete', {
      method: 'POST', credentials: 'same-origin',
      headers: { 'content-type': 'application/json', 'idempotency-key': input.idempotency_key },
      body: JSON.stringify({ proof: input.proof, challenge: input.challenge, decision: input.decision })
    }).then((response) => {
      if (response.status === 401) { location.assign('/v1/account/oidc/login?return_to=%2Fv1%2Fconsent%2Fcomplete'); return; }
      sessionStorage.removeItem(key);
      status.textContent = response.ok ? (input.decision === 'approved' ? 'Consent completed.' : 'Consent denied.') : 'Consent completion failed.';
    }).catch(() => { status.textContent = 'Consent completion failed. You may retry this page.'; });
  } catch { sessionStorage.removeItem(key); status.textContent = 'Invalid consent result.'; }
})();`;

function correlationId(): string {
  return randomBytes(18).toString('base64url');
}

export function buildControlApi(options: ControlApiOptions): FastifyInstance {
  const app = Fastify({
    logger: false,
    bodyLimit: 16 * 1024,
    logController: new LogController({ disableRequestLogging: true })
  });

  async function safeAudit(event: SecurityAuditEvent): Promise<void> {
    try {
      await options.audit.write(event);
    } catch {
      // Audit failure must not disclose internals or turn a denied request into an allowed request.
    }
  }

  async function requestContext(request: FastifyRequest): Promise<TenantContext> {
    const principal = await options.identityProvider.authenticate(request);
    const parsed = TenantParamsSchema.safeParse(request.params);
    const requestCorrelationId = correlationId();
    if (principal === undefined) {
      await safeAudit({
        occurredAt: new Date().toISOString(),
        eventName: 'account.authentication_denied',
        outcome: 'denied',
        reason: 'identity_missing',
        correlationId: requestCorrelationId,
        ...(parsed.success ? { tenantId: parsed.data.tenantId } : {}),
        service: 'control-api',
        serviceVersion: '0.3.0'
      });
      throw new PlatformError('unauthenticated', 401);
    }
    const identity = AccountPrincipalSchema.parse(principal);
    if (!parsed.success) throw new PlatformError('invalid_request', 400);
    return TenantContextSchema.parse({
      tenantId: parsed.data.tenantId,
      accountId: identity.accountId,
      correlationId: requestCorrelationId
    });
  }

  app.get('/health/live', async (_request, reply) => reply.header('cache-control', 'no-store').send({ status: 'live' }));

  app.get('/health/ready', async (_request, reply) => {
    try {
      if (options.readiness === undefined) throw new Error('readiness_not_configured');
      await options.readiness();
      await reply.header('cache-control', 'no-store').send({ status: 'ready' });
    } catch {
      await reply.status(503).header('cache-control', 'no-store').send({ error: 'temporarily_unavailable' });
    }
  });

  app.get('/v1/pairing/start', async (_request, reply) => {
    const scriptHash = createHash('sha256').update(pairingStartScript, 'utf8').digest('base64');
    return reply
      .header('cache-control', 'no-store')
      .header('referrer-policy', 'no-referrer')
      .header('content-security-policy', `default-src 'none'; script-src 'sha256-${scriptHash}'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'`)
      .type('text/html; charset=utf-8')
      .send(`<!doctype html><html lang="en"><meta charset="utf-8"><title>WePuu pairing</title><body><main><h1>WePuu site pairing</h1><p id="status">Verifying the site...</p></main><script>${pairingStartScript}</script></body></html>`);
  });

  app.get('/v1/consent/complete', async (_request, reply) => {
    const scriptHash = createHash('sha256').update(consentCompleteScript, 'utf8').digest('base64');
    return reply
      .header('cache-control', 'no-store')
      .header('referrer-policy', 'no-referrer')
      .header('content-security-policy', `default-src 'none'; script-src 'sha256-${scriptHash}'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'`)
      .type('text/html; charset=utf-8')
      .send(`<!doctype html><html lang="en"><meta charset="utf-8"><title>WePuu consent</title><body><main><h1>WePuu consent</h1><p id="status">Completing consent...</p></main><script>${consentCompleteScript}</script></body></html>`);
  });

  app.get('/v1/account/oidc/login', async (request, reply) => {
    if (options.accountLogin === undefined || options.publicOrigin === undefined) {
      throw new PlatformError('temporarily_unavailable', 503);
    }
    const query = AccountLoginQuerySchema.safeParse(request.query);
    if (!query.success) throw new PlatformError('invalid_request', 400);
    try {
      const result = await options.accountLogin.start(query.data.return_to);
      return await reply
        .status(302)
        .header('cache-control', 'no-store')
        .header('referrer-policy', 'no-referrer')
        .header('content-security-policy', "default-src 'none'; frame-ancestors 'none'")
        .header('set-cookie', secureCookie(TRANSACTION_COOKIE, result.transactionCookie, 300))
        .header('location', result.authorizationUrl.href)
        .send();
    } catch (error) {
      if (error instanceof AccountLoginError && error.code === 'invalid_request') {
        throw new PlatformError('invalid_request', 400);
      }
      throw new PlatformError('temporarily_unavailable', 503);
    }
  });

  app.get('/v1/account/oidc/callback', async (request, reply) => {
    if (options.accountLogin === undefined || options.publicOrigin === undefined) {
      throw new PlatformError('temporarily_unavailable', 503);
    }
    const transactionCookie = requestCookie(request, TRANSACTION_COOKIE);
    if (transactionCookie === undefined) {
      return await reply
        .status(401)
        .header('cache-control', 'no-store')
        .header('referrer-policy', 'no-referrer')
        .header('set-cookie', clearCookie(TRANSACTION_COOKIE))
        .send({ error: 'unauthenticated' });
    }
    try {
      const currentUrl = new URL(request.raw.url ?? '/v1/account/oidc/callback', options.publicOrigin);
      const result = await options.accountLogin.complete(currentUrl, transactionCookie);
      const maxAge = Math.max(0, Math.floor((result.expiresAt.getTime() - Date.now()) / 1_000));
      return await reply
        .status(303)
        .header('cache-control', 'no-store')
        .header('referrer-policy', 'no-referrer')
        .header('content-security-policy', "default-src 'none'; frame-ancestors 'none'")
        .header('set-cookie', [
          clearCookie(TRANSACTION_COOKIE),
          secureCookie(SESSION_COOKIE, result.sessionToken, maxAge)
        ])
        .header('location', result.returnTo)
        .send();
    } catch (error) {
      const code = error instanceof AccountLoginError ? error.code : 'temporarily_unavailable';
      await safeAudit({
        occurredAt: new Date().toISOString(),
        eventName: 'account.authentication_denied',
        outcome: code === 'temporarily_unavailable' ? 'error' : 'denied',
        reason: code === 'temporarily_unavailable' ? 'identity_missing' : 'invalid_input',
        correlationId: correlationId(),
        service: 'control-api',
        serviceVersion: '0.3.0'
      });
      return reply
        .status(code === 'temporarily_unavailable' ? 503 : 401)
        .header('cache-control', 'no-store')
        .header('referrer-policy', 'no-referrer')
        .header('set-cookie', clearCookie(TRANSACTION_COOKIE))
        .send({ error: code });
    }
  });

  app.get('/v1/account/session', async (request, reply) => {
    const principal = await options.identityProvider.authenticate(request);
    if (principal === undefined) {
      return reply.status(401).header('cache-control', 'no-store').send({ error: 'unauthenticated' });
    }
    return reply.header('cache-control', 'no-store').send({ authenticated: true });
  });

  app.post('/v1/account/logout', async (request, reply) => {
    if (options.accountLogin === undefined || options.publicOrigin === undefined) {
      throw new PlatformError('temporarily_unavailable', 503);
    }
    if (request.headers.origin !== options.publicOrigin) throw new PlatformError('forbidden', 403);
    const token = sessionCookie(request);
    if (token !== undefined) await options.accountLogin.logout(token);
    return reply.status(204).header('cache-control', 'no-store').header('set-cookie', clearCookie(SESSION_COOKIE)).send();
  });

  app.get('/v1/tenants/:tenantId', async (request, reply) => {
    const context = await requestContext(request);
    const tenant = await options.store.findTenant(context);
    if (tenant === undefined) {
      await safeAudit({
        occurredAt: new Date().toISOString(),
        eventName: 'tenant.access_denied',
        outcome: 'denied',
        reason: 'membership_missing',
        correlationId: context.correlationId,
        tenantId: context.tenantId,
        actorId: context.accountId,
        service: 'control-api',
        serviceVersion: '0.3.0'
      });
      throw new PlatformError('not_found', 404);
    }
    return reply.header('cache-control', 'no-store').send({ tenant });
  });

  app.post('/v1/tenants/:tenantId/pairing', async (request, reply) => {
    if (options.pairing === undefined || options.publicOrigin === undefined) {
      throw new PlatformError('temporarily_unavailable', 503);
    }
    if (request.headers.origin !== options.publicOrigin) throw new PlatformError('forbidden', 403);
    const context = await requestContext(request);
    const body = PairingBodySchema.safeParse(request.body);
    if (!body.success) throw new PlatformError('invalid_request', 400);
    try {
      const result = await options.pairing.pair(context, body.data);
      await safeAudit({
        occurredAt: new Date().toISOString(), eventName: 'pairing.verified', outcome: 'success', reason: 'none',
        correlationId: context.correlationId, tenantId: context.tenantId, actorId: context.accountId,
        siteId: result.siteId, service: 'control-api', serviceVersion: '0.3.0'
      });
      return await reply.header('cache-control', 'no-store').send({ site_id: result.siteId, status: 'active' });
    } catch {
      await safeAudit({
        occurredAt: new Date().toISOString(), eventName: 'pairing.denied', outcome: 'denied', reason: 'proof_invalid',
        correlationId: context.correlationId, tenantId: context.tenantId, actorId: context.accountId,
        service: 'control-api', serviceVersion: '0.3.0'
      });
      throw new PlatformError('invalid_request', 400);
    }
  });

  app.get('/v1/tenants/:tenantId/security-events', async (request, reply) => {
    const context = await requestContext(request);
    const events = await options.store.listSecurityEvents(context, 50);
    return reply.header('cache-control', 'no-store').send({ events });
  });

  app.get('/v1/tenants/:tenantId/sites', async (request, reply) => {
    const context = await requestContext(request);
    return reply.header('cache-control', 'no-store').send({ sites: await options.store.listSites(context) });
  });

  app.get('/v1/tenants/:tenantId/grants', async (request, reply) => {
    const context = await requestContext(request);
    return reply.header('cache-control', 'no-store').send({ grants: await options.store.listGrants(context) });
  });

  app.post('/v1/tenants/:tenantId/sites/:siteId/grants', async (request, reply) => {
    if (options.grants === undefined || options.publicOrigin === undefined) {
      throw new PlatformError('temporarily_unavailable', 503);
    }
    if (request.headers.origin !== options.publicOrigin) throw new PlatformError('forbidden', 403);
    const context = await requestContext(request);
    const params = SiteParamsSchema.safeParse(request.params);
    const body = GrantStartBodySchema.safeParse(request.body);
    const idempotencyKey = IdempotencyKeySchema.safeParse(request.headers['idempotency-key']);
    if (!params.success || !body.success || !idempotencyKey.success) throw new PlatformError('invalid_request', 400);
    try {
      const result = await options.grants.start(context, {
        siteId: params.data.siteId,
        clientId: body.data.client_id,
        scopes: body.data.scopes,
        idempotencyKey: idempotencyKey.data
      });
      await safeAudit({
        occurredAt: new Date().toISOString(), eventName: 'grant.created', outcome: 'success', reason: 'none',
        correlationId: context.correlationId, tenantId: context.tenantId, actorId: context.accountId,
        siteId: params.data.siteId, clientId: body.data.client_id, grantId: result.grantId,
        service: 'control-api', serviceVersion: '0.3.0'
      });
      return await reply.status(201).header('cache-control', 'no-store').send({
        grant_id: result.grantId,
        consent_url: result.consentUrl,
        expires_at: result.expiresAt.toISOString()
      });
    } catch {
      throw new PlatformError('invalid_request', 400);
    }
  });

  app.post('/v1/tenants/:tenantId/grants/:grantId/complete', async (request, reply) => {
    if (options.grants === undefined || options.publicOrigin === undefined) {
      throw new PlatformError('temporarily_unavailable', 503);
    }
    if (request.headers.origin !== options.publicOrigin) throw new PlatformError('forbidden', 403);
    const context = await requestContext(request);
    const params = GrantParamsSchema.safeParse(request.params);
    const body = GrantCompletionBodySchema.safeParse(request.body);
    const idempotencyKey = IdempotencyKeySchema.safeParse(request.headers['idempotency-key']);
    if (!params.success || !body.success || !idempotencyKey.success) throw new PlatformError('invalid_request', 400);
    try {
      await options.grants.complete(context, {
        grantId: params.data.grantId,
        proof: body.data.proof,
        challenge: body.data.challenge,
        decision: body.data.decision,
        idempotencyKey: idempotencyKey.data
      });
      await safeAudit({
        occurredAt: new Date().toISOString(),
        eventName: body.data.decision === 'approved' ? 'grant.created' : 'grant.revoked',
        outcome: body.data.decision === 'approved' ? 'success' : 'denied',
        reason: body.data.decision === 'approved' ? 'none' : 'consent_denied',
        correlationId: context.correlationId, tenantId: context.tenantId, actorId: context.accountId,
        grantId: params.data.grantId, service: 'control-api', serviceVersion: '0.3.0'
      });
      return await reply.status(204).header('cache-control', 'no-store').send();
    } catch {
      throw new PlatformError('invalid_request', 400);
    }
  });

  app.post('/v1/tenants/:tenantId/grants/:objectId/revoke', async (request, reply) => {
    const context = await requestContext(request);
    const params = ObjectParamsSchema.safeParse(request.params);
    const idempotencyKey = IdempotencyKeySchema.safeParse(request.headers['idempotency-key']);
    if (!params.success || !idempotencyKey.success) throw new PlatformError('invalid_request', 400);
    await options.store.revokeGrant(context, params.data.objectId);
    return reply.status(204).send();
  });

  app.post('/v1/tenants/:tenantId/sites/:objectId/disconnect', async (request, reply) => {
    const context = await requestContext(request);
    const params = ObjectParamsSchema.safeParse(request.params);
    const idempotencyKey = IdempotencyKeySchema.safeParse(request.headers['idempotency-key']);
    if (!params.success || !idempotencyKey.success) throw new PlatformError('invalid_request', 400);
    await options.store.disconnectSite(context, params.data.objectId);
    return reply.status(204).send();
  });

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof PlatformError) {
      void reply.status(error.status).header('cache-control', 'no-store').send({ error: error.code });
      return;
    }
    void reply.status(500).header('cache-control', 'no-store').send({ error: 'temporarily_unavailable' });
  });

  return app;
}
