import { createHash, randomBytes } from 'node:crypto';
import Fastify, { LogController, type FastifyInstance, type FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  AccountPrincipalSchema,
  OpaqueIdSchema,
  PlatformError,
  TenantContextSchema,
  type AccountPrincipal,
  type GrantView,
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
const IdempotencyKeySchema = z.string().regex(/^[A-Za-z0-9_-]{16,128}$/u);

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

function sessionCookie(request: FastifyRequest): string | undefined {
  const header = request.headers.cookie;
  if (header === undefined || header.length > 4_096) return undefined;
  for (const part of header.split(';')) {
    const [name, ...value] = part.trim().split('=');
    if (name === '__Host-wepuu_session') return value.join('=');
  }
  return undefined;
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
}

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
