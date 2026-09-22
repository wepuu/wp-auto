import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool, type PoolClient, type PoolConfig } from 'pg';
import { TenantContextSchema, type TenantContext, type TenantView } from '@wepuu/contracts';
import {
  validateSecurityEvent,
  type SecurityAuditEvent,
  type SecurityAuditSink
} from '@wepuu/security-audit';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const defaultMigrationsDirectory = resolve(packageRoot, 'migrations');

export interface DatabaseOptions {
  readonly connectionString: string;
  readonly applicationName: string;
  readonly migrationsDirectory?: string;
}

export class Database {
  readonly #pool: Pool;
  readonly #migrationsDirectory: string;

  constructor(options: DatabaseOptions) {
    const poolOptions: PoolConfig = {
      connectionString: options.connectionString,
      application_name: options.applicationName,
      max: 8,
      statement_timeout: 5_000,
      query_timeout: 6_000,
      idle_in_transaction_session_timeout: 5_000
    };
    this.#pool = new Pool(poolOptions);
    this.#migrationsDirectory = options.migrationsDirectory ?? defaultMigrationsDirectory;
  }

  async migrate(): Promise<void> {
    const client = await this.#pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock($1, $2)', [20260916, 202]);
      await client.query(`CREATE TABLE IF NOT EXISTS public.wepuu_schema_migrations (
        name text PRIMARY KEY,
        sha256 text NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now()
      )`);
      const names = (await readdir(this.#migrationsDirectory))
        .filter((name) => /^\d+_[a-z0-9_]+\.sql$/u.test(name))
        .sort();
      for (const name of names) {
        const sql = await readFile(resolve(this.#migrationsDirectory, name), 'utf8');
        const sha256 = createHash('sha256').update(sql).digest('hex');
        const existing = await client.query<{ sha256: string }>(
          'SELECT sha256 FROM public.wepuu_schema_migrations WHERE name = $1',
          [name]
        );
        if (existing.rowCount === 1) {
          if (existing.rows[0]?.sha256 !== sha256) throw new Error('migration_checksum_mismatch');
          continue;
        }
        await client.query(sql);
        await client.query(
          'INSERT INTO public.wepuu_schema_migrations (name, sha256) VALUES ($1, $2)',
          [name, sha256]
        );
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async withTenant<T>(input: TenantContext, operation: (client: PoolClient) => Promise<T>): Promise<T> {
    const context = TenantContextSchema.parse(input);
    const client = await this.#pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL ROLE wepuu_control');
      await client.query("SELECT set_config('app.tenant_id', $1, true), set_config('app.account_id', $2, true)", [
        context.tenantId,
        context.accountId
      ]);
      const result = await operation(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async withAuthorizationService<T>(operation: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.#pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL ROLE wepuu_auth');
      const result = await operation(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async withAuditWriter<T>(tenantId: string, operation: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.#pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL ROLE wepuu_audit_writer');
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
      const result = await operation(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    await this.#pool.end();
  }

  async checkReady(): Promise<void> {
    await this.#pool.query('SELECT 1');
  }

  get poolForMigrationsAndTests(): Pool {
    return this.#pool;
  }
}

export class TenantRepository {
  async findById(client: PoolClient, tenantId: string): Promise<TenantView | undefined> {
    const result = await client.query<{ id: string; status: TenantView['status']; created_at: Date }>(
      'SELECT id, status, created_at FROM platform.tenants WHERE id = $1',
      [tenantId]
    );
    const row = result.rows[0];
    if (row === undefined) return undefined;
    return { id: row.id, status: row.status, createdAt: row.created_at.toISOString() };
  }
}

export interface SecurityEventView {
  readonly id: string;
  readonly occurredAt: string;
  readonly eventName: SecurityAuditEvent['eventName'];
  readonly outcome: SecurityAuditEvent['outcome'];
  readonly reason: SecurityAuditEvent['reason'];
  readonly correlationId: string;
  readonly service: SecurityAuditEvent['service'];
}

export class SecurityEventRepository {
  async list(client: PoolClient, limit = 50): Promise<readonly SecurityEventView[]> {
    const safeLimit = Math.max(1, Math.min(100, Math.trunc(limit)));
    const result = await client.query<{
      id: string;
      occurred_at: Date;
      event_name: SecurityAuditEvent['eventName'];
      outcome: SecurityAuditEvent['outcome'];
      reason: SecurityAuditEvent['reason'];
      correlation_id: string;
      service: SecurityAuditEvent['service'];
    }>(
      `SELECT id::text, occurred_at, event_name, outcome, reason, correlation_id, service
       FROM audit.security_events ORDER BY occurred_at DESC, id DESC LIMIT $1`,
      [safeLimit]
    );
    return result.rows.map((row) => ({
      id: row.id,
      occurredAt: row.occurred_at.toISOString(),
      eventName: row.event_name,
      outcome: row.outcome,
      reason: row.reason,
      correlationId: row.correlation_id,
      service: row.service
    }));
  }
}

export class PostgresSecurityAuditSink implements SecurityAuditSink {
  readonly #database: Database;

  constructor(database: Database) {
    this.#database = database;
  }

  async write(input: SecurityAuditEvent): Promise<void> {
    const event = validateSecurityEvent(input);
    if (event.tenantId === undefined) throw new Error('tenant_context_required_for_durable_audit');
    await this.#database.withAuditWriter(event.tenantId, (client) =>
      client.query(
        `INSERT INTO audit.security_events
          (tenant_id, occurred_at, event_name, outcome, reason, correlation_id, actor_id,
           site_id, client_id, grant_id, service, service_version, duration_bucket)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [
          event.tenantId,
          event.occurredAt,
          event.eventName,
          event.outcome,
          event.reason,
          event.correlationId,
          event.actorId ?? null,
          event.siteId ?? null,
          event.clientId ?? null,
          event.grantId ?? null,
          event.service,
          event.serviceVersion,
          event.durationBucket ?? null
        ]
      ).then(() => undefined)
    );
  }
}

type ProviderPayload = Record<string, unknown>;

function payloadTenantId(payload: ProviderPayload): string | undefined {
  const tenantId = payload['tenantId'] ?? payload['tenant_id'];
  return typeof tenantId === 'string' && tenantId.length > 0 ? tenantId : undefined;
}

export class PostgresOidcAdapter {
  readonly #model: string;
  readonly #database: Database;

  constructor(model: string, database: Database) {
    this.#model = model;
    this.#database = database;
  }

  async upsert(id: string, payload: ProviderPayload, expiresIn?: number): Promise<void> {
    const tenantId = payloadTenantId(payload);
    const expiresAt = expiresIn === undefined ? null : new Date(Date.now() + expiresIn * 1_000);
    await this.#database.withAuthorizationService(async (client) => {
      await client.query(
        `INSERT INTO oauth.provider_artifacts
          (model, artifact_id, tenant_id, partition_kind, payload, expires_at)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6)
         ON CONFLICT (model, artifact_id)
         DO UPDATE SET tenant_id = EXCLUDED.tenant_id,
                       partition_kind = EXCLUDED.partition_kind,
                       payload = EXCLUDED.payload,
                       expires_at = EXCLUDED.expires_at`,
        [this.#model, id, tenantId ?? null, tenantId === undefined ? 'global' : 'tenant', JSON.stringify(payload), expiresAt]
      );
    });
  }

  async find(id: string): Promise<ProviderPayload | undefined> {
    return this.#database.withAuthorizationService(async (client) => {
      const result = await client.query<{ payload: ProviderPayload }>(
        `SELECT payload FROM oauth.provider_artifacts
         WHERE model = $1 AND artifact_id = $2
           AND (expires_at IS NULL OR expires_at > now())`,
        [this.#model, id]
      );
      return result.rows[0]?.payload;
    });
  }

  async destroy(id: string): Promise<void> {
    await this.#database.withAuthorizationService((client) =>
      client.query('DELETE FROM oauth.provider_artifacts WHERE model = $1 AND artifact_id = $2', [this.#model, id]).then(() => undefined)
    );
  }

  async consume(id: string): Promise<void> {
    const consumed = Math.floor(Date.now() / 1_000);
    await this.#database.withAuthorizationService((client) =>
      client.query(
        `UPDATE oauth.provider_artifacts
         SET payload = jsonb_set(payload, '{consumed}', to_jsonb($3::bigint), true)
         WHERE model = $1 AND artifact_id = $2`,
        [this.#model, id, consumed]
      ).then(() => undefined)
    );
  }

  async findByUid(uid: string): Promise<ProviderPayload | undefined> {
    return this.#findSecondary('uid', uid);
  }

  async findByUserCode(userCode: string): Promise<ProviderPayload | undefined> {
    return this.#findSecondary('userCode', userCode);
  }

  async #findSecondary(field: 'uid' | 'userCode', value: string): Promise<ProviderPayload | undefined> {
    return this.#database.withAuthorizationService(async (client) => {
      const result = await client.query<{ payload: ProviderPayload }>(
        `SELECT payload FROM oauth.provider_artifacts
         WHERE model = $1 AND payload->>$2 = $3
           AND (expires_at IS NULL OR expires_at > now())
         LIMIT 1`,
        [this.#model, field, value]
      );
      return result.rows[0]?.payload;
    });
  }

  async revokeByGrantId(grantId: string): Promise<void> {
    await this.#database.withAuthorizationService((client) =>
      client.query("DELETE FROM oauth.provider_artifacts WHERE payload->>'grantId' = $1", [grantId]).then(() => undefined)
    );
  }
}

export function createOidcAdapterFactory(database: Database): new (model: string) => PostgresOidcAdapter {
  return class BoundPostgresOidcAdapter extends PostgresOidcAdapter {
    constructor(model: string) {
      super(model, database);
    }
  };
}
