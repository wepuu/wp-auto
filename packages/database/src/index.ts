import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool, type PoolClient, type PoolConfig } from 'pg';
import {
  MCP_SCOPE_ORDER,
  McpScopeSetSchema,
  TenantContextSchema,
  type GrantView,
  type SiteView,
  type TenantContext,
  type TenantMembershipView,
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

  async withAccountWorkspace<T>(accountId: string, operation: (client: PoolClient) => Promise<T>): Promise<T> {
    if (!/^[A-Za-z0-9_-]{8,128}$/u.test(accountId)) throw new Error('account_context_invalid');
    const client = await this.#pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL ROLE wepuu_account_workspace');
      await client.query("SELECT set_config('app.account_id', $1, true)", [accountId]);
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

export type DeletionScope =
  | Readonly<{ kind: 'account'; accountId: string }>
  | Readonly<{ kind: 'tenant'; tenantId: string }>
  | Readonly<{ kind: 'site'; tenantId: string; siteId: string }>;

export interface DeletionJob {
  readonly jobId: string;
  readonly scope: DeletionScope;
  readonly status: 'pending';
}

export interface DeletionReport {
  readonly jobId: string;
  readonly scopeKind: DeletionScope['kind'];
  readonly scopeId: string;
  readonly status: 'waiting' | 'complete' | 'failed';
  readonly safeAfter?: string;
  readonly completedAt?: string;
  readonly failureCode?: string;
  readonly counts: Readonly<Record<string, unknown>>;
}

function deletionScopeArgs(scope: DeletionScope): readonly [DeletionScope['kind'], string, string | null] {
  if (scope.kind === 'account') return [scope.kind, scope.accountId, null];
  if (scope.kind === 'tenant') return [scope.kind, scope.tenantId, scope.tenantId];
  return [scope.kind, scope.siteId, scope.tenantId];
}

function parseDeletionReport(value: unknown): DeletionReport {
  if (typeof value !== 'object' || value === null) throw new Error('deletion_report_invalid');
  const record = value as Record<string, unknown>;
  const jobId = record['jobId'];
  const scopeKind = record['scopeKind'];
  const scopeId = record['scopeId'];
  const status = record['status'];
  if (typeof jobId !== 'string' || typeof scopeKind !== 'string' || typeof scopeId !== 'string'
    || (scopeKind !== 'account' && scopeKind !== 'tenant' && scopeKind !== 'site')
    || (status !== 'waiting' && status !== 'complete' && status !== 'failed')) {
    throw new Error('deletion_report_invalid');
  }
  const counts = record['counts'];
  if (typeof counts !== 'object' || counts === null || Array.isArray(counts)) throw new Error('deletion_report_invalid');
  const result: DeletionReport = {
    jobId,
    scopeKind,
    scopeId,
    status,
    counts: { ...(counts as Record<string, unknown>) }
  };
  if (typeof record['safeAfter'] === 'string') (result as { safeAfter?: string }).safeAfter = record['safeAfter'];
  if (typeof record['completedAt'] === 'string') (result as { completedAt?: string }).completedAt = record['completedAt'];
  if (typeof record['failureCode'] === 'string') (result as { failureCode?: string }).failureCode = record['failureCode'];
  return result;
}

/** Internal, content-free deletion workflow used by the recovery qualification harness. */
export class DataLifecycleService {
  readonly #database: Database;
  readonly #now: () => Date;

  constructor(options: Readonly<{ database: Database; now?: () => Date }>) {
    this.#database = options.database;
    this.#now = options.now ?? (() => new Date());
  }

  async begin(scope: DeletionScope, requestedBy: string): Promise<DeletionJob> {
    const [scopeKind, scopeId, tenantId] = deletionScopeArgs(scope);
    const jobId = `deletion_${randomUUID().replaceAll('-', '')}`;
    await this.#database.withAuthorizationService((client) => client.query(
      'SELECT platform.begin_deletion_job($1, $2, $3, $4::uuid, $5)',
      [jobId, scopeKind, scopeId, tenantId, requestedBy]
    ).then(() => undefined));
    return { jobId, scope, status: 'pending' };
  }

  async advance(jobId: string, observedAt = this.#now()): Promise<DeletionReport> {
    if (!/^[A-Za-z0-9_-]{16,128}$/u.test(jobId)) throw new Error('deletion_job_invalid');
    return this.#database.withAuthorizationService(async (client) => {
      const result = await client.query<{ report: unknown }>(
        'SELECT platform.advance_deletion_job($1, $2) AS report', [jobId, observedAt]
      );
      const report = result.rows[0]?.report;
      return parseDeletionReport(report);
    });
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

type WorkspaceRow = {
  tenant_id: string;
  membership_role: TenantMembershipView['role'];
  membership_status: 'active';
  membership_created_at: Date;
  is_home: boolean;
};

function workspaceView(row: WorkspaceRow): TenantMembershipView {
  return {
    tenantId: row.tenant_id,
    role: row.membership_role,
    status: row.membership_status,
    createdAt: row.membership_created_at.toISOString(),
    isHome: row.is_home
  };
}

export class PostgresAccountWorkspaceStore {
  readonly #database: Database;

  constructor(database: Database) {
    this.#database = database;
  }

  async ensurePersonalWorkspace(accountId: string): Promise<TenantMembershipView> {
    return this.#database.withAccountWorkspace(accountId, async (client) => {
      const result = await client.query<WorkspaceRow>(
        'SELECT * FROM platform.ensure_personal_workspace($1::uuid)', [randomUUID()]
      );
      const row = result.rows[0];
      if (row === undefined || result.rowCount !== 1) throw new Error('workspace_bootstrap_failed');
      return workspaceView(row);
    });
  }

  async listMemberships(accountId: string): Promise<readonly TenantMembershipView[]> {
    return this.#database.withAccountWorkspace(accountId, async (client) => {
      const result = await client.query<WorkspaceRow>('SELECT * FROM platform.list_current_account_tenants()');
      return result.rows.map(workspaceView);
    });
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

export class PostgresAccountRegistry {
  readonly #database: Database;

  constructor(database: Database) {
    this.#database = database;
  }

  async isActive(accountId: string): Promise<boolean> {
    return this.#database.withAuthorizationService(async (client) => {
      const result = await client.query(
        `SELECT 1 FROM platform.accounts
         WHERE id = $1 AND status = 'active' LIMIT 1`,
        [accountId]
      );
      return result.rowCount === 1;
    });
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
    const result = await client.query<{ changed: boolean }>(
      'SELECT oauth.disconnect_site_with_event($1::uuid, $2) AS changed',
      [tenantId, siteId]
    );
    return result.rows[0]?.changed === true;
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
    const result = await client.query<{ changed: boolean }>(
      'SELECT oauth.revoke_grant_with_event($1::uuid, $2) AS changed',
      [tenantId, grantId]
    );
    return result.rows[0]?.changed === true;
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

class OAuthInvalidGrantError extends Error {
  readonly error = 'invalid_grant';
  readonly error_description = 'grant request is invalid';
  readonly status = 400;
  readonly statusCode = 400;
  readonly expose = true;

  constructor() {
    super('invalid_grant');
    this.name = 'InvalidGrant';
  }
}

export interface SecretArtifactLookup {
  readonly version: number;
  readonly digest: Uint8Array;
}

/** Versioned one-way lookup for OAuth bearer artifacts. Raw values never cross the storage boundary. */
export class SecretArtifactCodec {
  readonly #keys: ReadonlyArray<{ readonly version: number; readonly key: Uint8Array }>;

  constructor(keys: readonly Uint8Array[]) {
    if (keys.length < 1 || keys.length > 2 || keys.some((key) => key.byteLength < 32)) {
      throw new Error('oauth_artifact_key_rotation_set_required');
    }
    this.#keys = keys.map((key, index) => ({ version: keys.length - index, key: new Uint8Array(key) }));
  }

  current(value: string): SecretArtifactLookup {
    const current = this.#keys[0];
    if (current === undefined || value.length < 8 || value.length > 4096) throw new Error('invalid_oauth_artifact');
    return { version: current.version, digest: createHmac('sha256', current.key).update(value, 'utf8').digest() };
  }

  candidates(value: string): readonly SecretArtifactLookup[] {
    if (value.length < 8 || value.length > 4096) return [];
    return this.#keys.map(({ version, key }) => ({
      version,
      digest: createHmac('sha256', key).update(value, 'utf8').digest()
    }));
  }

  matches(value: string, lookup: SecretArtifactLookup): boolean {
    return this.candidates(value).some((candidate) => candidate.version === lookup.version
      && candidate.digest.byteLength === lookup.digest.byteLength
      && timingSafeEqual(candidate.digest, lookup.digest));
  }
}

function decodeArtifactKey(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]{43,128}$/u.test(value)) throw new Error('invalid_oauth_artifact_key');
  const decoded = Buffer.from(value, 'base64url');
  if (decoded.byteLength < 32) throw new Error('invalid_oauth_artifact_key');
  return decoded;
}

export function secretArtifactCodecFromEnvironment(environment: NodeJS.ProcessEnv): SecretArtifactCodec {
  const parsed: unknown = JSON.parse(environment['WEPUU_OAUTH_ARTIFACT_KEYS_JSON'] ?? '[]');
  if (!Array.isArray(parsed) || parsed.some((value) => typeof value !== 'string')) {
    throw new Error('invalid_oauth_artifact_key_rotation_set');
  }
  return new SecretArtifactCodec(parsed.map(decodeArtifactKey));
}

export function rateLimitSubjectCodecFromEnvironment(environment: NodeJS.ProcessEnv): RateLimitSubjectCodec {
  return new RateLimitSubjectCodec(decodeArtifactKey(environment['WEPUU_RATE_LIMIT_HMAC_KEY'] ?? ''));
}

function payloadTenantId(payload: ProviderPayload): string | undefined {
  const tenantId = payload['tenantId'] ?? payload['tenant_id'];
  return typeof tenantId === 'string' && tenantId.length > 0 ? tenantId : undefined;
}

const secretArtifactModels = new Set([
  'AccessToken',
  'AuthorizationCode',
  'BackchannelAuthenticationRequest',
  'DeviceCode',
  'InitialAccessToken',
  'PushedAuthorizationRequest',
  'RefreshToken',
  'RegistrationAccessToken'
]);

export class PostgresOidcAdapter {
  readonly #model: string;
  readonly #database: Database;
  readonly #codec: SecretArtifactCodec;
  readonly #rateLimitCodec: RateLimitSubjectCodec | undefined;

  constructor(model: string, database: Database, codec: SecretArtifactCodec, rateLimitCodec?: RateLimitSubjectCodec) {
    this.#model = model;
    this.#database = database;
    this.#codec = codec;
    this.#rateLimitCodec = rateLimitCodec;
  }

  async upsert(id: string, payload: ProviderPayload, expiresIn?: number): Promise<void> {
    const tenantId = payloadTenantId(payload);
    const expiresAt = expiresIn === undefined ? null : new Date(Date.now() + expiresIn * 1_000);
    if (!secretArtifactModels.has(this.#model)) {
      await this.#database.withAuthorizationService((client) => client.query(
        `INSERT INTO oauth.provider_artifacts
          (model, artifact_id, tenant_id, partition_kind, payload, expires_at)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6)
         ON CONFLICT (model, artifact_id)
         DO UPDATE SET tenant_id = EXCLUDED.tenant_id,
                       partition_kind = EXCLUDED.partition_kind,
                       payload = EXCLUDED.payload,
                       expires_at = EXCLUDED.expires_at`,
        [this.#model, id, tenantId ?? null, tenantId === undefined ? 'global' : 'tenant', JSON.stringify(payload), expiresAt]
      ).then(() => undefined));
      return;
    }
    const lookup = this.#codec.current(id);
    const storedPayload = { ...payload };
    delete storedPayload['jti'];
    await this.#database.withAuthorizationService(async (client) => {
      await client.query(
        `INSERT INTO oauth.secret_artifacts
          (model, lookup_version, artifact_hash, tenant_id, partition_kind, payload, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
         ON CONFLICT (model, lookup_version, artifact_hash)
         DO UPDATE SET tenant_id = EXCLUDED.tenant_id,
                       partition_kind = EXCLUDED.partition_kind,
                       payload = EXCLUDED.payload,
                       expires_at = EXCLUDED.expires_at,
                       consumed_at = NULL,
                       updated_at = now()`,
        [this.#model, lookup.version, Buffer.from(lookup.digest), tenantId ?? null,
          tenantId === undefined ? 'global' : 'tenant', JSON.stringify(storedPayload), expiresAt]
      );
    });
  }

  async find(id: string): Promise<ProviderPayload | undefined> {
    if (!secretArtifactModels.has(this.#model)) {
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
    return this.#database.withAuthorizationService(async (client) => {
      for (const lookup of this.#codec.candidates(id)) {
        const result = await client.query<{ payload: ProviderPayload; consumed_at: Date | null }>(
          `SELECT payload, consumed_at FROM oauth.secret_artifacts
           WHERE model = $1 AND lookup_version = $2 AND artifact_hash = $3
             AND (expires_at IS NULL OR expires_at > now())`,
          [this.#model, lookup.version, Buffer.from(lookup.digest)]
        );
        const row = result.rows[0];
        if (row !== undefined) return {
          ...row.payload,
          jti: id,
          ...(row.consumed_at === null ? {} : { consumed: Math.floor(row.consumed_at.getTime() / 1_000) })
        };
      }
      return undefined;
    });
  }

  async destroy(id: string): Promise<void> {
    if (!secretArtifactModels.has(this.#model)) {
      await this.#database.withAuthorizationService((client) => client.query(
        'DELETE FROM oauth.provider_artifacts WHERE model = $1 AND artifact_id = $2',
        [this.#model, id]
      ).then(() => undefined));
      return;
    }
    await this.#database.withAuthorizationService(async (client) => {
      for (const lookup of this.#codec.candidates(id)) {
        await client.query(
          'DELETE FROM oauth.secret_artifacts WHERE model = $1 AND lookup_version = $2 AND artifact_hash = $3',
          [this.#model, lookup.version, Buffer.from(lookup.digest)]
        );
      }
    });
  }

  async consume(id: string): Promise<void> {
    if (!secretArtifactModels.has(this.#model)) {
      const consumed = Math.floor(Date.now() / 1_000);
      const updated = await this.#database.withAuthorizationService((client) => client.query(
        `UPDATE oauth.provider_artifacts
         SET payload = jsonb_set(payload, '{consumed}', to_jsonb($3::bigint), true)
         WHERE model = $1 AND artifact_id = $2 AND NOT (payload ? 'consumed')`,
        [this.#model, id, consumed]
      ).then((result) => result.rowCount === 1));
      if (!updated) throw new Error('oauth_artifact_already_consumed');
      return;
    }
    const candidates = this.#codec.candidates(id);
    const consumed = await this.#database.withAuthorizationService(async (client): Promise<'consumed' | 'missing' | 'rate_limited' | 'replay'> => {
      for (const lookup of candidates) {
        if (this.#model === 'RefreshToken') {
          const stored = await client.query<{ payload: ProviderPayload }>(
            `SELECT payload FROM oauth.secret_artifacts
             WHERE model = $1 AND lookup_version = $2 AND artifact_hash = $3
               AND consumed_at IS NULL AND (expires_at IS NULL OR expires_at > now())
             FOR UPDATE`,
            [this.#model, lookup.version, Buffer.from(lookup.digest)]
          );
          const grantId = stored.rows[0]?.payload['grantId'];
          if (stored.rowCount !== 1) continue;
          if (typeof grantId !== 'string' || this.#rateLimitCodec === undefined) {
            return 'rate_limited';
          }
          const allowed = await client.query<{ allowed: boolean }>(
            'SELECT oauth.consume_rate_limit($1, $2, $3, $4, now()) AS allowed',
            ['oauth.refresh_family', Buffer.from(this.#rateLimitCodec.digest('oauth.refresh_family', grantId)), 10, 60]
          );
          if (allowed.rows[0]?.allowed !== true) return 'rate_limited';
        }
        const result = await client.query(
          `UPDATE oauth.secret_artifacts
           SET consumed_at = now(), updated_at = now()
           WHERE model = $1 AND lookup_version = $2 AND artifact_hash = $3
             AND consumed_at IS NULL AND (expires_at IS NULL OR expires_at > now())`,
          [this.#model, lookup.version, Buffer.from(lookup.digest)]
        );
        if (result.rowCount === 1) return 'consumed';
      }
      if (this.#model === 'RefreshToken') {
        for (const lookup of candidates) {
          const replay = await client.query<{ grant_id: string | null }>(
            `SELECT payload->>'grantId' AS grant_id FROM oauth.secret_artifacts
             WHERE model = $1 AND lookup_version = $2 AND artifact_hash = $3
               AND consumed_at IS NOT NULL LIMIT 1`,
            [this.#model, lookup.version, Buffer.from(lookup.digest)]
          );
          const grantId = replay.rows[0]?.grant_id;
          if (typeof grantId === 'string') {
            await client.query("SELECT oauth.revoke_refresh_grant($1, now(), 'refresh_replay')", [grantId]);
            return 'replay';
          }
        }
      }
      return 'missing';
    });
    if (consumed === 'rate_limited') throw new Error('refresh_family_rate_limited');
    if (consumed === 'replay') throw new OAuthInvalidGrantError();
    if (consumed !== 'consumed') throw new Error('oauth_artifact_already_consumed');
  }

  async findByUid(uid: string): Promise<ProviderPayload | undefined> {
    return this.#findSecondary('uid', uid);
  }

  async findByUserCode(userCode: string): Promise<ProviderPayload | undefined> {
    return this.#findSecondary('userCode', userCode);
  }

  async #findSecondary(field: 'uid' | 'userCode', value: string): Promise<ProviderPayload | undefined> {
    if (secretArtifactModels.has(this.#model)) return undefined;
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
    await this.#database.withAuthorizationService(async (client) => {
      if (this.#model === 'RefreshToken') {
        await client.query(
          "SELECT oauth.revoke_refresh_grant($1, now(), 'token_revoked')",
          [grantId]
        );
      }
      await client.query("DELETE FROM oauth.secret_artifacts WHERE payload->>'grantId' = $1", [grantId]);
      await client.query("DELETE FROM oauth.provider_artifacts WHERE payload->>'grantId' = $1", [grantId]);
    });
  }
}

export function createOidcAdapterFactory(
  database: Database,
  codec: SecretArtifactCodec,
  rateLimitCodec?: RateLimitSubjectCodec
): new (model: string) => PostgresOidcAdapter {
  return class BoundPostgresOidcAdapter extends PostgresOidcAdapter {
    constructor(model: string) {
      super(model, database, codec, rateLimitCodec);
    }
  };
}

export type RefreshRotationResult = 'rotated' | 'replay' | 'denied';

/** Narrow database boundary for the atomic refresh-family state transition. */
export class PostgresRefreshFamilyRepository {
  readonly #database: Database;

  constructor(database: Database) {
    this.#database = database;
  }

  async create(input: Readonly<{
    familyId: string;
    tenantId: string;
    siteId: string;
    grantId: string;
    clientId: string;
    subjectId: string;
    issuedAt: Date;
    absoluteExpiresAt: Date;
  }>): Promise<void> {
    if (input.absoluteExpiresAt.getTime() - input.issuedAt.getTime() > 90 * 24 * 60 * 60 * 1_000
      || input.absoluteExpiresAt <= input.issuedAt) throw new Error('invalid_refresh_family_lifetime');
    await this.#database.withAuthorizationService((client) => client.query(
      `INSERT INTO oauth.refresh_families
        (family_id, tenant_id, site_id, grant_id, client_id, subject_id, status,
         current_generation, last_used_at, absolute_expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'active', 0, $7, $8)`,
      [input.familyId, input.tenantId, input.siteId, input.grantId, input.clientId,
        input.subjectId, input.issuedAt, input.absoluteExpiresAt]
    ).then(() => undefined));
  }

  async rotate(familyId: string, expectedGeneration: number, observedAt = new Date()): Promise<RefreshRotationResult> {
    if (!Number.isInteger(expectedGeneration) || expectedGeneration < 0) return 'denied';
    return this.#database.withAuthorizationService(async (client) => {
      const result = await client.query<{ result: RefreshRotationResult }>(
        'SELECT oauth.rotate_refresh_family($1::uuid, $2::integer, $3::timestamptz) AS result',
        [familyId, expectedGeneration, observedAt]
      );
      return result.rows[0]?.result ?? 'denied';
    });
  }
}

export class RateLimitSubjectCodec {
  readonly #key: Uint8Array;

  constructor(key: Uint8Array) {
    if (key.byteLength < 32) throw new Error('rate_limit_hmac_key_required');
    this.#key = new Uint8Array(key);
  }

  digest(policy: string, subject: string): Uint8Array {
    if (!/^[a-z][a-z0-9_.-]{2,63}$/u.test(policy) || subject.length < 1 || subject.length > 2048) {
      throw new Error('invalid_rate_limit_subject');
    }
    return createHmac('sha256', this.#key).update(`${policy}\0${subject}`, 'utf8').digest();
  }
}

export interface RateLimitPolicy {
  readonly name: string;
  readonly limit: number;
  readonly windowSeconds: number;
}

/** Database-backed limiter. Dependency errors propagate so issuance fails closed. */
export class PostgresOAuthRateLimiter {
  readonly #database: Database;
  readonly #codec: RateLimitSubjectCodec;

  constructor(database: Database, codec: RateLimitSubjectCodec) {
    this.#database = database;
    this.#codec = codec;
  }

  async allow(policy: RateLimitPolicy, subject: string, observedAt = new Date()): Promise<boolean> {
    const digest = this.#codec.digest(policy.name, subject);
    if (!Number.isInteger(policy.limit) || !Number.isInteger(policy.windowSeconds)) return false;
    return this.#database.withAuthorizationService(async (client) => {
      const result = await client.query<{ allowed: boolean }>(
        'SELECT oauth.consume_rate_limit($1, $2, $3, $4, $5) AS allowed',
        [policy.name, Buffer.from(digest), policy.limit, policy.windowSeconds, observedAt]
      );
      return result.rows[0]?.allowed === true;
    });
  }
}

export interface RevocationOutboxRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly siteId: string;
  readonly resource: string;
  readonly sequence: number;
  readonly eventType: 'grant' | 'site' | 'subject' | 'token' | 'key';
  readonly grantId?: string;
  readonly keyId?: string;
  readonly reason: string;
  readonly attempts: number;
}

export class PostgresRevocationOutbox {
  readonly #database: Database;

  constructor(database: Database) {
    this.#database = database;
  }

  async claim(limit = 20): Promise<readonly RevocationOutboxRecord[]> {
    const boundedLimit = Math.max(1, Math.min(100, Math.trunc(limit)));
    return this.#database.withAuthorizationService(async (client) => {
      const result = await client.query<{
        id: string; tenant_id: string; site_id: string; resource_uri: string;
        event_sequence: string; event_type: RevocationOutboxRecord['eventType'];
        grant_id: string | null; key_id: string | null; reason: string; attempts: number;
      }>(
        `WITH candidates AS (
           SELECT id FROM oauth.revocation_outbox
           WHERE delivered_at IS NULL AND not_before <= now() AND attempts < 20
             AND (locked_at IS NULL OR locked_at < now() - interval '2 minutes')
           ORDER BY id FOR UPDATE SKIP LOCKED LIMIT $1
         )
         UPDATE oauth.revocation_outbox target
         SET locked_at = now(), attempts = attempts + 1
         FROM candidates WHERE target.id = candidates.id
         RETURNING target.id::text, target.tenant_id::text, target.site_id,
           target.resource_uri, target.event_sequence::text, target.event_type,
           target.grant_id, target.key_id, target.reason, target.attempts`,
        [boundedLimit]
      );
      return result.rows.map((row) => ({
        id: row.id,
        tenantId: row.tenant_id,
        siteId: row.site_id,
        resource: row.resource_uri,
        sequence: Number(row.event_sequence),
        eventType: row.event_type,
        ...(row.grant_id === null ? {} : { grantId: row.grant_id }),
        ...(row.key_id === null ? {} : { keyId: row.key_id }),
        reason: row.reason,
        attempts: row.attempts
      }));
    });
  }

  async markDelivered(id: string): Promise<void> {
    await this.#database.withAuthorizationService((client) => client.query(
      `UPDATE oauth.revocation_outbox SET delivered_at = now(), locked_at = NULL,
         last_error_code = NULL WHERE id = $1 AND delivered_at IS NULL`, [id]
    ).then(() => undefined));
  }

  async reschedule(id: string, errorCode: string, delaySeconds: number): Promise<void> {
    const boundedDelay = Math.max(1, Math.min(3600, Math.trunc(delaySeconds)));
    const safeCode = /^[a-z][a-z0-9_.-]{2,63}$/u.test(errorCode) ? errorCode : 'delivery_failed';
    await this.#database.withAuthorizationService((client) => client.query(
      `UPDATE oauth.revocation_outbox SET locked_at = NULL,
         not_before = now() + make_interval(secs => $2), last_error_code = $3
       WHERE id = $1 AND delivered_at IS NULL`, [id, boundedDelay, safeCode]
    ).then(() => undefined));
  }
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

export class PostgresOAuthClientRepository {
  readonly #database: Database;

  constructor(database: Database) {
    this.#database = database;
  }

  async loadActivePublicClients(): Promise<readonly {
    readonly clientId: string;
    readonly redirectUris: readonly string[];
  }[]> {
    return this.#database.withAuthorizationService(async (client) => {
      const result = await client.query<{ client_id: string; redirect_uris: unknown }>(
        `SELECT client_id, redirect_uris FROM oauth.clients
         WHERE status = 'active' ORDER BY client_id`
      );
      return result.rows.map((row) => {
        if (!Array.isArray(row.redirect_uris) || row.redirect_uris.length === 0
          || row.redirect_uris.some((uri) => typeof uri !== 'string')) {
          throw new Error('invalid_oauth_client_metadata');
        }
        return { clientId: row.client_id, redirectUris: row.redirect_uris as string[] };
      });
    });
  }
}

export interface SigningKeyLifecycleRecord {
  readonly kid: string;
  readonly custodyReference: string;
  readonly publicJwk: Readonly<Record<string, unknown>>;
  readonly status: 'published' | 'active' | 'retiring';
}

export class PostgresSigningKeyRepository {
  readonly #database: Database;

  constructor(database: Database) {
    this.#database = database;
  }

  async loadUsable(): Promise<Readonly<{
    active: SigningKeyLifecycleRecord;
    verification: readonly SigningKeyLifecycleRecord[];
  }>> {
    return this.#database.withAuthorizationService(async (client) => {
      const result = await client.query<{
        kid: string; custody_reference: string; public_jwk: Record<string, unknown>;
        status: SigningKeyLifecycleRecord['status'];
      }>(
        `SELECT kid, custody_reference, public_jwk, status
         FROM oauth.signing_key_metadata
         WHERE status IN ('published', 'active', 'retiring')
           AND publish_at <= now()
           AND (status <> 'active' OR activate_at IS NOT NULL AND activate_at <= now())
           AND (status <> 'retiring' OR retire_at IS NULL OR retire_at > now())
         ORDER BY CASE status WHEN 'active' THEN 0 WHEN 'published' THEN 1 ELSE 2 END, publish_at, kid`
      );
      const records = result.rows.map((row) => ({
        kid: row.kid,
        custodyReference: row.custody_reference,
        publicJwk: row.public_jwk,
        status: row.status
      }));
      const active = records.filter((record) => record.status === 'active');
      if (active.length !== 1 || active[0] === undefined) throw new Error('single_active_signing_key_required');
      return { active: active[0], verification: records.filter((record) => record.status !== 'active') };
    });
  }

  async isActive(kid: string): Promise<boolean> {
    return this.#database.withAuthorizationService(async (client) => {
      const result = await client.query(
        `SELECT 1 FROM oauth.signing_key_metadata
         WHERE kid = $1 AND status = 'active' AND activate_at <= now()
           AND revoke_at IS NULL LIMIT 1`,
        [kid]
      );
      return result.rowCount === 1;
    });
  }

  async publish(input: Readonly<{
    kid: string;
    custodyReference: string;
    publicJwk: Readonly<Record<string, unknown>>;
    publishedAt?: Date;
  }>): Promise<void> {
    await this.#database.withAuthorizationService((client) => client.query(
      `INSERT INTO oauth.signing_key_metadata
        (kid, algorithm, custody_provider, custody_reference, public_jwk, status, publish_at)
       VALUES ($1, 'RS256', 'aws-kms', $2, $3::jsonb, 'published', $4)`,
      [input.kid, input.custodyReference, JSON.stringify(input.publicJwk), input.publishedAt ?? new Date()]
    ).then(() => undefined));
  }

  async activate(kid: string, observedAt = new Date()): Promise<boolean> {
    return this.#database.withAuthorizationService(async (client) => {
      const result = await client.query<{ changed: boolean }>(
        'SELECT oauth.activate_signing_key($1, $2) AS changed', [kid, observedAt]
      );
      return result.rows[0]?.changed === true;
    });
  }

  async revoke(kid: string, observedAt = new Date()): Promise<boolean> {
    return this.#database.withAuthorizationService(async (client) => {
      const result = await client.query<{ changed: boolean }>(
        'SELECT oauth.revoke_signing_key($1, $2) AS changed', [kid, observedAt]
      );
      return result.rows[0]?.changed === true;
    });
  }
}

export class PostgresGrantClaimsResolver {
  readonly #database: Database;

  constructor(database: Database) {
    this.#database = database;
  }

  async resolve(subjectId: string, binding?: Readonly<{
    grantId?: string;
    clientId?: string;
    resource?: string;
  }>): Promise<{
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
           AND ($2::text IS NULL OR grant_record.id = $2)
           AND ($3::text IS NULL OR grant_record.client_id = $3)
           AND ($4::text IS NULL OR site_record.resource_uri = $4)
         LIMIT 2`,
        [subjectId, binding?.grantId ?? null, binding?.clientId ?? null, binding?.resource ?? null]
      );
      const row = result.rows[0];
      if (result.rowCount !== 1 || row === undefined) return undefined;
      return { tenantId: row.tenant_id, siteId: row.site_id, grantId: row.id };
    });
  }
}

export interface AuthorizationGrantBinding {
  readonly tenantId: string;
  readonly siteId: string;
  readonly grantId: string;
  readonly subjectId: string;
  readonly clientId: string;
  readonly resource: string;
  readonly scopes: readonly string[];
}

/** Resolves one already-consented platform grant for an OAuth interaction. */
export class PostgresAuthorizationGrantRepository {
  readonly #database: Database;

  constructor(database: Database) {
    this.#database = database;
  }

  async resolveExact(input: Readonly<{
    subjectId: string;
    clientId: string;
    resource: string;
    scopes: readonly string[];
  }>): Promise<AuthorizationGrantBinding | undefined> {
    const requested = [...new Set(input.scopes)].sort(
      (left, right) => MCP_SCOPE_ORDER.indexOf(left as typeof MCP_SCOPE_ORDER[number])
        - MCP_SCOPE_ORDER.indexOf(right as typeof MCP_SCOPE_ORDER[number])
    );
    if (requested.length === 0) return undefined;
    return this.#database.withAuthorizationService(async (client) => {
      const result = await client.query<{
        tenant_id: string; site_id: string; id: string; subject_id: string;
        client_id: string; resource_uri: string; scopes: string[];
      }>(
        `SELECT grant_record.tenant_id, grant_record.site_id, grant_record.id,
                grant_record.subject_id, grant_record.client_id,
                site_record.resource_uri, grant_record.scopes
         FROM platform.grants grant_record
         JOIN platform.sites site_record
           ON site_record.tenant_id = grant_record.tenant_id
          AND site_record.id = grant_record.site_id
         WHERE grant_record.subject_id = $1
           AND grant_record.client_id = $2
           AND site_record.resource_uri = $3
           AND grant_record.scopes = $4::text[]
           AND grant_record.status = 'active'
           AND site_record.status = 'active'
         LIMIT 2`,
        [input.subjectId, input.clientId, input.resource, requested]
      );
      const row = result.rows[0];
      if (result.rowCount !== 1 || row === undefined) return undefined;
      return {
        tenantId: row.tenant_id,
        siteId: row.site_id,
        grantId: row.id,
        subjectId: row.subject_id,
        clientId: row.client_id,
        resource: row.resource_uri,
        scopes: McpScopeSetSchema.parse(row.scopes)
      };
    });
  }
}
