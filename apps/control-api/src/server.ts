import { randomBytes } from 'node:crypto';
import Fastify, { LogController, type FastifyInstance, type FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  AccountPrincipalSchema,
  PlatformError,
  TenantContextSchema,
  type AccountPrincipal,
  type TenantContext,
  type TenantView
} from '@wepuu/contracts';
import {
  SecurityEventRepository,
  TenantRepository,
  type Database,
  type SecurityEventView
} from '@wepuu/database';
import type { SecurityAuditEvent, SecurityAuditSink } from '@wepuu/security-audit';

const TenantParamsSchema = z.object({ tenantId: z.uuid() }).strict();

export interface AccountIdentityProvider {
  authenticate(request: FastifyRequest): Promise<AccountPrincipal | undefined>;
}

export class DenyAllAccountIdentityProvider implements AccountIdentityProvider {
  authenticate(): Promise<undefined> {
    return Promise.resolve(undefined);
  }
}

export interface ControlStore {
  findTenant(context: TenantContext): Promise<TenantView | undefined>;
  listSecurityEvents(context: TenantContext, limit: number): Promise<readonly SecurityEventView[]>;
}

export class PostgresControlStore implements ControlStore {
  readonly #database: Database;
  readonly #tenants = new TenantRepository();
  readonly #events = new SecurityEventRepository();

  constructor(database: Database) {
    this.#database = database;
  }

  async findTenant(context: TenantContext): Promise<TenantView | undefined> {
    return this.#database.withTenant(context, (client) => this.#tenants.findById(client, context.tenantId));
  }

  async listSecurityEvents(context: TenantContext, limit: number): Promise<readonly SecurityEventView[]> {
    return this.#database.withTenant(context, (client) => this.#events.list(client, limit));
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
        serviceVersion: '0.2.0'
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
        serviceVersion: '0.2.0'
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

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof PlatformError) {
      void reply.status(error.status).header('cache-control', 'no-store').send({ error: error.code });
      return;
    }
    void reply.status(500).header('cache-control', 'no-store').send({ error: 'temporarily_unavailable' });
  });

  return app;
}
