import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool, type PoolClient, type PoolConfig } from 'pg';
import {
  McpScopeSetSchema,
  TenantContextSchema,
  type GrantView,
  type SiteView,
  type TenantContext,
  type TenantView
} from '@wepuu/contracts';
import type {
  GrantRepository,
  PairingAttemptRecord,
  PairingRepository,
  PendingGrantRecord,
  VerifiedSiteProof
} from '@wepuu/pairing';
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

  async withSessionReader<T>(operation: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.#pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL ROLE wepuu_session_reader');
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

  async withIdentityWriter<T>(operation: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.#pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL ROLE wepuu_identity_writer');
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

export class PostgresAccountSessionStore {
  readonly #database: Database;

  constructor(database: Database) {
    this.#database = database;
  }

  async resolve(sessionHash: Uint8Array): Promise<{ accountId: string; authenticationTime: number } | undefined> {
    return this.#database.withSessionReader(async (client) => {
      const result = await client.query<{ account_id: string; authenticated_at: Date }>(
        `SELECT session_record.account_id, session_record.authenticated_at
         FROM platform.account_sessions session_record
         JOIN platform.accounts account_record ON account_record.id = session_record.account_id
         WHERE session_record.session_hash = $1 AND session_record.expires_at > now()
           AND session_record.revoked_at IS NULL AND account_record.status = 'active'`,
        [Buffer.from(sessionHash)]
      );
      const row = result.rows[0];
      return row === undefined ? undefined : {
        accountId: row.account_id,
        authenticationTime: Math.floor(row.authenticated_at.getTime() / 1_000)
      };
    });
  }

  async createSession(input: {
    readonly candidateAccountId: string;
    readonly identityIssuer: string;
    readonly identitySubjectHash: string;
    readonly sessionHash: Uint8Array;
    readonly authenticatedAt: Date;
    readonly expiresAt: Date;
  }): Promise<{ readonly accountId: string } | undefined> {
    return this.#database.withIdentityWriter(async (client) => {
      await client.query(
        `INSERT INTO platform.accounts (id, status, identity_issuer, identity_subject_hash)
         VALUES ($1, 'active', $2, $3)
         ON CONFLICT DO NOTHING`,
        [input.candidateAccountId, input.identityIssuer, input.identitySubjectHash]
      );
      const accountResult = await client.query<{ id: string; status: 'active' | 'suspended' | 'deleted' }>(
        `SELECT id, status FROM platform.accounts
         WHERE identity_issuer = $1 AND identity_subject_hash = $2`,
        [input.identityIssuer, input.identitySubjectHash]
      );
      const account = accountResult.rows[0];
      if (account === undefined || account.status !== 'active') return undefined;
      await client.query(
        `INSERT INTO platform.account_sessions
          (session_hash, account_id, identity_issuer, authenticated_at, expires_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [Buffer.from(input.sessionHash), account.id, input.identityIssuer, input.authenticatedAt, input.expiresAt]
      );
      return { accountId: account.id };
    });
  }

  async revoke(sessionHash: Uint8Array): Promise<void> {
    await this.#database.withIdentityWriter((client) => client.query(
      `UPDATE platform.account_sessions
       SET revoked_at = COALESCE(revoked_at, now())
       WHERE session_hash = $1`,
      [Buffer.from(sessionHash)]
    ).then(() => undefined));
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

export class SiteRepository {
  async findActive(client: PoolClient, tenantId: string, siteId: string): Promise<SiteView | undefined> {
    const result = await client.query<{
      tenant_id: string;
      id: string;
      resource_uri: string;
      display_hostname: string;
      status: SiteView['status'];
      protocol_version: '1';
      created_at: Date;
    }>(
      `SELECT tenant_id, id, resource_uri, display_hostname, status, protocol_version, created_at
       FROM platform.sites WHERE tenant_id = $1 AND id = $2 AND status = 'active'`,
      [tenantId, siteId]
    );
    const row = result.rows[0];
    return row === undefined ? undefined : {
      tenantId: row.tenant_id,
      id: row.id,
      resource: row.resource_uri,
      displayHostname: row.display_hostname,
      status: row.status,
      protocolVersion: row.protocol_version,
      createdAt: row.created_at.toISOString()
    };
  }

  async list(client: PoolClient): Promise<readonly SiteView[]> {
    const result = await client.query<{
      tenant_id: string;
      id: string;
      resource_uri: string;
      display_hostname: string;
      status: SiteView['status'];
      protocol_version: '1';
      created_at: Date;
    }>(
      `SELECT tenant_id, id, resource_uri, display_hostname, status, protocol_version, created_at
       FROM platform.sites WHERE status <> 'deleted' ORDER BY created_at, id`
    );
    return result.rows.map((row) => ({
      tenantId: row.tenant_id,
      id: row.id,
      resource: row.resource_uri,
      displayHostname: row.display_hostname,
      status: row.status,
      protocolVersion: row.protocol_version,
      createdAt: row.created_at.toISOString()
    }));
  }

  async disconnect(client: PoolClient, tenantId: string, siteId: string): Promise<boolean> {
    const result = await client.query(
      `UPDATE platform.sites
       SET status = 'revoked', revoked_at = COALESCE(revoked_at, now()), updated_at = now()
       WHERE tenant_id = $1 AND id = $2 AND status IN ('active', 'pending', 'suspended')`,
      [tenantId, siteId]
    );
    if (result.rowCount === 1) {
      await client.query(
        `UPDATE platform.grants
         SET status = 'revoked', revoked_at = COALESCE(revoked_at, now()),
             revocation_reason = 'site_disconnected', updated_at = now()
         WHERE tenant_id = $1 AND site_id = $2 AND status IN ('pending', 'active', 'suspended')`,
        [tenantId, siteId]
      );
    }
    return result.rowCount === 1;
  }
}

export class GrantViewRepository {
  async list(client: PoolClient): Promise<readonly GrantView[]> {
    const result = await client.query<{
      tenant_id: string;
      id: string;
      site_id: string;
      subject_id: string;
      client_id: string;
      scopes: string[];
      status: GrantView['status'];
      consent_version: string;
      created_at: Date;
    }>(
      `SELECT tenant_id, id, site_id, subject_id, client_id, scopes, status, consent_version, created_at
       FROM platform.grants ORDER BY created_at, id`
    );
    return result.rows.map((row) => ({
      tenantId: row.tenant_id,
      id: row.id,
      siteId: row.site_id,
      subjectId: row.subject_id,
      clientId: row.client_id,
      scopes: McpScopeSetSchema.parse(row.scopes),
      status: row.status,
      consentVersion: row.consent_version,
      createdAt: row.created_at.toISOString()
    }));
  }

  async revoke(client: PoolClient, tenantId: string, grantId: string): Promise<boolean> {
    const result = await client.query(
      `UPDATE platform.grants
       SET status = 'revoked', revoked_at = COALESCE(revoked_at, now()),
           revocation_reason = 'platform_user_revoked', updated_at = now()
       WHERE tenant_id = $1 AND id = $2 AND status IN ('pending', 'active', 'suspended')`,
      [tenantId, grantId]
    );
    return result.rowCount === 1;
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

export class PostgresPairingRepository implements PairingRepository {
  readonly #database: Database;
  readonly #context: TenantContext;

  constructor(database: Database, context: TenantContext) {
    this.#database = database;
    this.#context = TenantContextSchema.parse(context);
  }

  async createAttempt(record: PairingAttemptRecord & {
    readonly initiatorAccountId: string;
    readonly correlationId: string;
  }): Promise<void> {
    await this.#database.withTenant(this.#context, (client) => client.query(
      `INSERT INTO platform.pairing_attempts
        (tenant_id, id, initiator_account_id, proposed_resource, verifier_hash, status, expires_at, correlation_id)
       VALUES ($1, $2, $3, $4, $5, 'pending', $6, $7)`,
      [record.tenantId, record.id, record.initiatorAccountId, record.resource,
        Buffer.from(record.verifierHash), record.expiresAt, record.correlationId]
    ).then(() => undefined));
  }

  async findAttemptForUpdate(tenantId: string, attemptId: string): Promise<PairingAttemptRecord | undefined> {
    return this.#database.withTenant(this.#context, async (client) => {
      const result = await client.query<{
        tenant_id: string;
        id: string;
        proposed_resource: string;
        verifier_hash: Buffer;
        status: PairingAttemptRecord['status'];
        expires_at: Date;
      }>(
        `SELECT tenant_id, id, proposed_resource, verifier_hash, status, expires_at
         FROM platform.pairing_attempts
         WHERE tenant_id = $1 AND id = $2 AND status IN ('pending', 'verifying')`,
        [tenantId, attemptId]
      );
      const row = result.rows[0];
      return row === undefined ? undefined : {
        tenantId: row.tenant_id,
        id: row.id,
        resource: row.proposed_resource,
        verifierHash: row.verifier_hash,
        status: row.status,
        expiresAt: row.expires_at
      };
    });
  }

  async markVerifying(tenantId: string, attemptId: string): Promise<boolean> {
    return this.#database.withTenant(this.#context, async (client) => {
      const result = await client.query(
        `UPDATE platform.pairing_attempts SET status = 'verifying', updated_at = now()
         WHERE tenant_id = $1 AND id = $2 AND status = 'pending' AND expires_at > now()`,
        [tenantId, attemptId]
      );
      return result.rowCount === 1;
    });
  }

  async fail(tenantId: string, attemptId: string, reason: string): Promise<void> {
    await this.#database.withTenant(this.#context, (client) => client.query(
      `UPDATE platform.pairing_attempts
       SET status = 'failed', failure_code = $3, updated_at = now()
       WHERE tenant_id = $1 AND id = $2 AND status = 'verifying'`,
      [tenantId, attemptId, reason.slice(0, 64)]
    ).then(() => undefined));
  }

  async complete(
    record: PairingAttemptRecord,
    proof: VerifiedSiteProof,
    siteId: string,
    idempotencyKey: string
  ): Promise<void> {
    const requestDigest = createHash('sha256')
      .update(`${record.id}\0${siteId}\0${proof.thumbprint}`, 'utf8')
      .digest();
    await this.#database.withTenant(this.#context, async (client) => {
      const existing = await client.query<{ request_digest: Buffer; result_reference: string }>(
        `SELECT request_digest, result_reference FROM platform.idempotency_records
         WHERE tenant_id = $1 AND operation = 'pairing.complete' AND idempotency_key = $2`,
        [record.tenantId, idempotencyKey]
      );
      const prior = existing.rows[0];
      if (prior !== undefined) {
        if (!prior.request_digest.equals(requestDigest) || prior.result_reference !== siteId) {
          throw new Error('idempotency_conflict');
        }
        return;
      }
      const hostname = new URL(record.resource).hostname;
      await client.query(
        `INSERT INTO platform.sites
          (tenant_id, id, resource_uri, display_hostname, status, protocol_version, site_public_jwk, site_key_thumbprint)
         VALUES ($1, $2, $3, $4, 'active', '1', $5::jsonb, $6)`,
        [record.tenantId, siteId, record.resource, hostname, JSON.stringify(proof.publicJwk), proof.thumbprint]
      );
      const consumed = await client.query(
        `UPDATE platform.pairing_attempts
         SET status = 'active', consumed_at = now(), site_id = $3, updated_at = now()
         WHERE tenant_id = $1 AND id = $2 AND status = 'verifying' AND expires_at > now()`,
        [record.tenantId, record.id, siteId]
      );
      if (consumed.rowCount !== 1) throw new Error('pairing_replay');
      await client.query(
        `INSERT INTO platform.idempotency_records
          (tenant_id, operation, idempotency_key, request_digest, result_reference, expires_at)
         VALUES ($1, 'pairing.complete', $2, $3, $4, now() + interval '24 hours')`,
        [record.tenantId, idempotencyKey, requestDigest, siteId]
      );
    });
  }
}

export class PostgresGrantRepository implements GrantRepository {
  readonly #database: Database;
  readonly #context: TenantContext;

  constructor(database: Database, context: TenantContext) {
    this.#database = database;
    this.#context = TenantContextSchema.parse(context);
  }

  async createPending(record: Omit<PendingGrantRecord, 'publicJwk' | 'status'> & {
    readonly consentVersion: string;
    readonly idempotencyKey: string;
    readonly requestDigest: Uint8Array;
    readonly createdAt: Date;
  }): Promise<{ readonly id: string; readonly createdAt: Date; readonly expiresAt: Date }> {
    return this.#database.withTenant(this.#context, async (client) => {
      await client.query(
        `SELECT pg_advisory_xact_lock(hashtextextended($1::text || ':' || $2, 0))`,
        [record.tenantId, record.idempotencyKey]
      );
      const existing = await client.query<{
        request_digest: Buffer;
        result_reference: string;
        created_at: Date;
        consent_expires_at: Date;
      }>(
        `SELECT idempotency.request_digest, idempotency.result_reference,
                grant_record.created_at, grant_record.consent_expires_at
         FROM platform.idempotency_records idempotency
         JOIN platform.grants grant_record
           ON grant_record.tenant_id = idempotency.tenant_id
          AND grant_record.id = idempotency.result_reference
         WHERE idempotency.tenant_id = $1 AND idempotency.operation = 'grant.create'
           AND idempotency.idempotency_key = $2`,
        [record.tenantId, record.idempotencyKey]
      );
      const prior = existing.rows[0];
      if (prior !== undefined) {
        if (!prior.request_digest.equals(Buffer.from(record.requestDigest))) throw new Error('idempotency_conflict');
        return { id: prior.result_reference, createdAt: prior.created_at, expiresAt: prior.consent_expires_at };
      }
      const result = await client.query(
        `INSERT INTO platform.grants
          (tenant_id, id, site_id, subject_id, client_id, scopes, consent_challenge_hash,
           consent_expires_at, status, consent_version, created_at, updated_at)
         SELECT $1, $2, site_record.id, $4, $5, $6, $7, $8, 'pending', $9, $11, $11
         FROM platform.sites site_record
         WHERE site_record.tenant_id = $1 AND site_record.id = $3
           AND site_record.resource_uri = $10 AND site_record.status = 'active'`,
        [record.tenantId, record.id, record.siteId, record.subjectId, record.clientId,
          record.scopes, Buffer.from(record.challengeHash), record.expiresAt, record.consentVersion, record.resource,
          record.createdAt]
      );
      if (result.rowCount !== 1) throw new Error('active_site_not_found');
      await client.query(
        `INSERT INTO platform.idempotency_records
          (tenant_id, operation, idempotency_key, request_digest, result_reference, expires_at)
         VALUES ($1, 'grant.create', $2, $3, $4, now() + interval '24 hours')`,
        [record.tenantId, record.idempotencyKey, Buffer.from(record.requestDigest), record.id]
      );
      return { id: record.id, createdAt: record.createdAt, expiresAt: record.expiresAt };
    });
  }

  async findPending(tenantId: string, grantId: string, idempotencyKey: string): Promise<PendingGrantRecord | undefined> {
    return this.#database.withTenant(this.#context, async (client) => {
      const result = await client.query<{
        tenant_id: string;
        id: string;
        site_id: string;
        subject_id: string;
        client_id: string;
        scopes: string[];
        resource_uri: string;
        site_public_jwk: PendingGrantRecord['publicJwk'];
        consent_challenge_hash: Buffer;
        consent_expires_at: Date;
        completion_replay: boolean;
      }>(
        `SELECT grant_record.tenant_id, grant_record.id, grant_record.site_id,
                grant_record.subject_id, grant_record.client_id, grant_record.scopes,
                grant_record.consent_challenge_hash, grant_record.consent_expires_at,
                site_record.resource_uri, site_record.site_public_jwk,
                (completion.idempotency_key IS NOT NULL) AS completion_replay
         FROM platform.grants grant_record
         JOIN platform.sites site_record
           ON site_record.tenant_id = grant_record.tenant_id AND site_record.id = grant_record.site_id
         LEFT JOIN platform.idempotency_records completion
           ON completion.tenant_id = grant_record.tenant_id
          AND completion.operation = 'grant.complete'
          AND completion.idempotency_key = $3
          AND completion.result_reference = grant_record.id
         WHERE grant_record.tenant_id = $1 AND grant_record.id = $2
           AND (grant_record.status = 'pending' OR completion.idempotency_key IS NOT NULL)
           AND site_record.status = 'active'`,
        [tenantId, grantId, idempotencyKey]
      );
      const row = result.rows[0];
      return row === undefined ? undefined : {
        tenantId: row.tenant_id,
        id: row.id,
        siteId: row.site_id,
        subjectId: row.subject_id,
        clientId: row.client_id,
        scopes: McpScopeSetSchema.parse(row.scopes),
        resource: row.resource_uri,
        publicJwk: row.site_public_jwk,
        challengeHash: row.consent_challenge_hash,
        expiresAt: row.consent_expires_at,
        status: 'pending',
        completionReplay: row.completion_replay
      };
    });
  }

  async activate(tenantId: string, grantId: string, idempotencyKey: string, proofThumbprint: string): Promise<void> {
    const digest = createHash('sha256').update(`${grantId}\0${proofThumbprint}`, 'utf8').digest();
    await this.#database.withTenant(this.#context, async (client) => {
      const existing = await client.query<{ request_digest: Buffer; result_reference: string }>(
        `SELECT request_digest, result_reference FROM platform.idempotency_records
         WHERE tenant_id = $1 AND operation = 'grant.complete' AND idempotency_key = $2`,
        [tenantId, idempotencyKey]
      );
      const prior = existing.rows[0];
      if (prior !== undefined) {
        if (!prior.request_digest.equals(digest) || prior.result_reference !== grantId) throw new Error('idempotency_conflict');
        return;
      }
      const result = await client.query(
        `UPDATE platform.grants SET status = 'active', updated_at = now()
         WHERE tenant_id = $1 AND id = $2 AND status = 'pending' AND consent_expires_at > now()`,
        [tenantId, grantId]
      );
      if (result.rowCount !== 1) throw new Error('grant_completion_replay');
      await client.query(
        `INSERT INTO platform.idempotency_records
          (tenant_id, operation, idempotency_key, request_digest, result_reference, expires_at)
         VALUES ($1, 'grant.complete', $2, $3, $4, now() + interval '24 hours')`,
        [tenantId, idempotencyKey, digest, grantId]
      );
    });
  }

  async deny(tenantId: string, grantId: string, idempotencyKey: string, proofThumbprint: string): Promise<void> {
    const digest = createHash('sha256').update(`${grantId}\0${proofThumbprint}`, 'utf8').digest();
    await this.#database.withTenant(this.#context, async (client) => {
      const existing = await client.query<{ request_digest: Buffer; result_reference: string }>(
        `SELECT request_digest, result_reference FROM platform.idempotency_records
         WHERE tenant_id = $1 AND operation = 'grant.complete' AND idempotency_key = $2`,
        [tenantId, idempotencyKey]
      );
      const prior = existing.rows[0];
      if (prior !== undefined) {
        if (!prior.request_digest.equals(digest) || prior.result_reference !== grantId) throw new Error('idempotency_conflict');
        return;
      }
      const result = await client.query(
        `UPDATE platform.grants
         SET status = 'revoked', revoked_at = now(), revocation_reason = 'consent_denied', updated_at = now()
         WHERE tenant_id = $1 AND id = $2 AND status = 'pending' AND consent_expires_at > now()`,
        [tenantId, grantId]
      );
      if (result.rowCount !== 1) throw new Error('grant_completion_replay');
      await client.query(
        `INSERT INTO platform.idempotency_records
          (tenant_id, operation, idempotency_key, request_digest, result_reference, expires_at)
         VALUES ($1, 'grant.complete', $2, $3, $4, now() + interval '24 hours')`,
        [tenantId, idempotencyKey, digest, grantId]
      );
    });
  }

  async revoke(tenantId: string, grantId: string, reason: string): Promise<boolean> {
    return this.#database.withTenant(this.#context, async (client) => {
      const result = await client.query(
        `UPDATE platform.grants
         SET status = 'revoked', revoked_at = now(), revocation_reason = $3, updated_at = now()
         WHERE tenant_id = $1 AND id = $2 AND status IN ('pending', 'active', 'suspended')`,
        [tenantId, grantId, reason.slice(0, 64)]
      );
      return result.rowCount === 1;
    });
  }
}

export class PostgresResourceRegistry {
  readonly #database: Database;

  constructor(database: Database) {
    this.#database = database;
  }

  async resolve(resource: string): Promise<{ readonly resource: string; readonly scopes: readonly string[] } | undefined> {
    return this.#database.withAuthorizationService(async (client) => {
      const result = await client.query<{ resource_uri: string }>(
        `SELECT resource_uri FROM platform.sites WHERE resource_uri = $1 AND status = 'active' LIMIT 2`,
        [resource]
      );
      const row = result.rows[0];
      if (result.rowCount !== 1 || row === undefined) return undefined;
      return {
        resource: row.resource_uri,
        scopes: ['mcp:read', 'mcp:content.write', 'mcp:media.write', 'mcp:taxonomy.write', 'mcp:seo.write']
      };
    });
  }
}

export class PostgresGrantClaimsResolver {
  readonly #database: Database;

  constructor(database: Database) {
    this.#database = database;
  }

  async resolve(subjectId: string): Promise<{
    readonly tenantId: string;
    readonly siteId: string;
    readonly grantId: string;
  } | undefined> {
    return this.#database.withAuthorizationService(async (client) => {
      const result = await client.query<{ tenant_id: string; site_id: string; id: string }>(
        `SELECT grant_record.tenant_id, grant_record.site_id, grant_record.id
         FROM platform.grants grant_record
         JOIN platform.sites site_record
           ON site_record.tenant_id = grant_record.tenant_id AND site_record.id = grant_record.site_id
         WHERE grant_record.subject_id = $1
           AND grant_record.status = 'active' AND site_record.status = 'active'
         LIMIT 2`,
        [subjectId]
      );
      const row = result.rows[0];
      if (result.rowCount !== 1 || row === undefined) return undefined;
      return { tenantId: row.tenant_id, siteId: row.site_id, grantId: row.id };
    });
  }
}
