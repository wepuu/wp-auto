import { z } from 'zod';
import type { Database, SecretArtifactCodec } from './index.js';

const opaque = z.string().regex(/^[A-Za-z0-9_-]{8,256}$/u);
const bindingSchema = z.object({ subjectId: opaque, tenantId: z.uuid(), siteId: opaque,
  grantId: opaque, clientId: opaque, resource: z.url().refine(value => value.startsWith('https://')),
  scopes: z.tuple([z.literal('mcp:read')]) });
const receiptSchema = bindingSchema.extend({ id: opaque, interactionUid: opaque,
  version: z.literal(1), explicitApproval: z.boolean(), approvedAt: z.number().int(),
  issueExpiresAt: z.number().int(), authorizationExpiresAt: z.number().int(), revoked: z.boolean() });
export type SqlPersistentBinding = Readonly<Omit<z.infer<typeof bindingSchema>, 'scopes'>> & {
  readonly scopes: readonly ['mcp:read'];
};
export type SqlPersistentReceipt = SqlPersistentBinding & Readonly<Omit<z.infer<typeof receiptSchema>, keyof SqlPersistentBinding>>;
interface Link { readonly receiptId: string; readonly interactionUid: string; readonly binding: SqlPersistentBinding; readonly sessionUid: string }
type Model = 'AuthorizationCode' | 'RefreshToken';
const lookupSchema = z.string().regex(/^[1-9][0-9]{0,4}:[a-f0-9]{64}$/u);
const denied = (): never => { throw new Error('persistent_storage_denied'); };
function decodeLookup(value: string): { version: number; digest: Buffer } {
  lookupSchema.parse(value);
  const [version, hex] = value.split(':');
  const number = Number(version);
  if (!Number.isSafeInteger(number) || number < 1 || number > 32767 || hex === undefined) return denied();
  return { version: number, digest: Buffer.from(hex, 'hex') };
}

/** SQL receipt/link port. It never obtains credentials or performs migrations. */
export class PostgresPersistentReceiptStore {
  readonly #db: Database;
  readonly #codec: SecretArtifactCodec;
  readonly #diagnostic: ((event: Readonly<{ operation: string; sqlstate?: string; category: string }>) => void) | undefined;
  constructor(db: Database, codec: SecretArtifactCodec,
    diagnostic?: (event: Readonly<{ operation: string; sqlstate?: string; category: string }>) => void) {
    this.#db = db; this.#codec = codec; this.#diagnostic = diagnostic;
  }
  #failure(error: unknown, operation: string): never {
    const record = error as { code?: unknown; name?: unknown } | undefined;
    const sqlstate = typeof record?.code === 'string' && /^[A-Z0-9]{5}$/u.test(record.code) ? record.code : undefined;
    const event = { operation, ...(sqlstate === undefined ? {} : { sqlstate }),
      category: record?.name === 'ZodError' ? 'SHAPE_DENIED' : 'STORAGE_DENIED' };
    try { this.#diagnostic?.(event); } catch { /* Observation must not alter denial. */ }
    return denied();
  }
  lookups(): { current(value: string): string; candidates(value: string): readonly string[] } {
    const encode = (item: { version: number; digest: Uint8Array }): string => `${String(item.version)}:${Buffer.from(item.digest).toString('hex')}`;
    return { current: value => encode(this.#codec.current(value)), candidates: value => this.#codec.candidates(value).map(encode) };
  }
  async classification(model: Model, keys: readonly string[]): Promise<Readonly<{
    version: 1; mode: 'SESSION_BOUND' | 'NATIVE_OFFLINE' | 'PERSISTENT_READONLY';
  }>> {
    try {
      return await this.#db.withAuthorizationService(async client => {
        const row = await client.query<{ value: unknown }>('SELECT oauth.artifact_classify($1,$2::text[]) AS value', [model, keys]);
        return z.object({ version: z.literal(1), mode: z.enum(['SESSION_BOUND', 'NATIVE_OFFLINE', 'PERSISTENT_READONLY']) })
          .parse(row.rows[0]?.value);
      });
    } catch (error) { return this.#failure(error, 'read_classification'); }
  }
  /** Structural/permission gate, not an attestation of release or migration hashes. */
  async assertCompatible(): Promise<void> {
    try {
      await this.#db.withAuthorizationService(async client => {
        const result = await client.query<{ tables: number; functions: number }>(`SELECT
          (SELECT count(*)::int FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
           WHERE n.nspname='oauth' AND c.relname IN ('persistent_consents','persistent_links')
           AND c.relrowsecurity AND c.relforcerowsecurity) AS tables,
          (SELECT count(*)::int FROM pg_catalog.pg_proc p WHERE p.oid IN (
           to_regprocedure('oauth.create_persistent_consent(text,text,uuid,text,text,text,text,text,boolean)'),
           to_regprocedure('oauth.withdraw_persistent_consent(text,text)'),
           to_regprocedure('oauth.issue_persistent_artifact(text,smallint,bytea,text[],jsonb,timestamptz,text,text,text,text,text)'),
           to_regprocedure('oauth.consume_classified_artifact(text,text[],bytea)'),
           to_regprocedure('oauth.artifact_classify(text,text[])'))
           AND p.prosecdef AND p.proconfig IN (ARRAY['search_path=pg_catalog']::text[],ARRAY['search_path=pg_catalog, pg_temp']::text[])
           AND has_function_privilege(current_user,p.oid,'EXECUTE')) AS functions`);
        if (result.rows[0]?.tables !== 2 || result.rows[0].functions !== 5) return denied();
        const permissions = await client.query<{ unsafe: boolean }>(`SELECT
          has_table_privilege(current_user,'oauth.secret_artifacts','INSERT,UPDATE,DELETE')
          OR has_table_privilege(current_user,'oauth.artifact_classifications','INSERT,UPDATE,DELETE')
          OR pg_has_role(current_user,'wepuu_artifact_owner','MEMBER') AS unsafe`);
        if (permissions.rows[0]?.unsafe !== false) return denied();
        await client.query(`SELECT id,interaction_uid,policy_version,subject_id,tenant_id,site_id,grant_id,
          client_id,resource_uri,scopes,explicit_approval,approved_at,issue_expires_at,authorization_expires_at,revoked
          FROM oauth.persistent_consents LIMIT 0`);
        await client.query(`SELECT model,artifact_lookup,receipt_id,interaction_uid,session_uid,parent_model,parent_lookup
          FROM oauth.persistent_links LIMIT 0`);
        const versions = await client.query<{ invalid: boolean }>('SELECT EXISTS(SELECT 1 FROM oauth.persistent_consents WHERE policy_version<>1) AS invalid');
        if (versions.rows[0]?.invalid !== false) return denied();
      });
    } catch (error) { return this.#failure(error, 'schema_compatibility'); }
  }
  async createConsent(input: SqlPersistentBinding & { readonly id: string; readonly interactionUid: string; readonly explicitApproval: unknown }): Promise<SqlPersistentReceipt> {
    try {
      const binding = bindingSchema.parse(input);
      if (input.explicitApproval !== true) return denied();
      return await this.#db.withAuthorizationService(async client => {
        const result = await client.query<{ receipt: unknown }>(
          'SELECT oauth.create_persistent_consent($1,$2,$3::uuid,$4,$5,$6,$7,$8,$9) AS receipt',
          [opaque.parse(input.id), opaque.parse(input.interactionUid), binding.tenantId, binding.siteId,
            binding.grantId, binding.subjectId, binding.clientId, binding.resource, true]);
        return receiptSchema.parse(result.rows[0]?.receipt);
      });
    } catch (error) { return this.#failure(error, 'create_consent'); }
  }
  /** Active business Grant is the accepted local-Consent authority, with fresh membership. */
  async resolveApprovedBinding(input: Readonly<{ subjectId: string; clientId: string; resource: string }>): Promise<SqlPersistentBinding | undefined> {
    try {
      const binding = await this.#db.withAuthorizationService(async client => {
        const result = await client.query<{ binding: unknown }>(`SELECT jsonb_build_object(
          'subjectId',g.subject_id,'tenantId',g.tenant_id::text,'siteId',g.site_id,'grantId',g.id,
          'clientId',g.client_id,'resource',s.resource_uri,'scopes',to_jsonb(g.scopes)) AS binding
          FROM platform.grants g JOIN platform.sites s ON s.tenant_id=g.tenant_id AND s.id=g.site_id
          JOIN platform.accounts a ON a.id=g.subject_id
          JOIN oauth.clients c ON c.client_id=g.client_id
          WHERE g.subject_id=$1 AND g.client_id=$2 AND s.resource_uri=$3
          AND g.scopes=ARRAY['mcp:read']::text[] AND g.status='active' AND s.status='active'
          AND a.status='active' AND c.status='active' LIMIT 2`,
          [opaque.parse(input.subjectId), opaque.parse(input.clientId), input.resource]);
        if (result.rows.length > 1) return denied();
        return result.rows[0] === undefined ? undefined : bindingSchema.parse(result.rows[0].binding);
      });
      if (binding === undefined) return undefined;
      const allowed = await this.#db.withAccountWorkspace(binding.subjectId, async client => {
        const result = await client.query<{ allowed: boolean }>(`SELECT EXISTS(
          SELECT 1 FROM platform.list_current_account_tenants() WHERE tenant_id=$1::uuid
          AND membership_status='active' AND membership_role IN ('owner','administrator')) AS allowed`, [binding.tenantId]);
        return result.rows[0]?.allowed === true;
      });
      return allowed ? binding : undefined;
    } catch (error) { return this.#failure(error, 'approved_binding'); }
  }
  async consent(interactionUid: string): Promise<SqlPersistentReceipt | undefined> {
    return this.#read('interaction_uid', opaque.parse(interactionUid));
  }
  async receipt(id: string): Promise<SqlPersistentReceipt | undefined> { return this.#read('id', opaque.parse(id)); }
  async #read(field: 'id' | 'interaction_uid', value: string): Promise<SqlPersistentReceipt | undefined> {
    try {
      return await this.#db.withAuthorizationService(async client => {
        const result = await client.query<{ receipt: unknown }>(
          `SELECT oauth.persistent_receipt_json(c) AS receipt FROM oauth.persistent_consents c WHERE ${field}=$1`, [value]);
        return result.rows[0] === undefined ? undefined : receiptSchema.parse(result.rows[0].receipt);
      });
    } catch (error) { return this.#failure(error, 'read_consent'); }
  }
  async withdraw(id: string, subjectId: string): Promise<boolean> {
    try { return await this.#db.withAuthorizationService(async client => {
      const result = await client.query<{ revoked: boolean }>('SELECT oauth.withdraw_persistent_consent($1,$2) AS revoked', [opaque.parse(id), opaque.parse(subjectId)]);
      return result.rows[0]?.revoked === true;
    }); } catch (error) { return this.#failure(error, 'withdraw'); }
  }
  async link(model: Model, keys: readonly string[]): Promise<Link | undefined> {
    try {
      if (!['AuthorizationCode', 'RefreshToken'].includes(model) || keys.length < 1 || keys.length > 2) return denied();
      keys.forEach(key => decodeLookup(key));
      return await this.#db.withAuthorizationService(async client => {
        const result = await client.query<{ receipt: unknown; interaction_uid: string; session_uid: string }>(
          `SELECT oauth.persistent_receipt_json(c) AS receipt,l.interaction_uid,l.session_uid
           FROM oauth.persistent_links l JOIN oauth.persistent_consents c ON c.id=l.receipt_id
           WHERE l.model=$1 AND l.artifact_lookup=ANY($2::text[])`, [model, keys]);
        if (result.rows.length > 1) return denied();
        const row = result.rows[0];
        if (row === undefined) return undefined;
        const receipt = receiptSchema.parse(row.receipt);
        if (row.interaction_uid !== receipt.interactionUid) return denied();
        return { receiptId: receipt.id, interactionUid: opaque.parse(row.interaction_uid),
          sessionUid: opaque.parse(row.session_uid), binding: bindingSchema.parse(receipt) };
      });
    } catch (error) { return this.#failure(error, 'read_link'); }
  }
  async saveLinked(model: Model, id: string, payload: Record<string, unknown>, ttl: number | undefined,
    lookup: string, link: Link, parent: Readonly<{ model: Model; keys: readonly string[] }> | undefined): Promise<void> {
    try {
      const lookups = this.lookups();
      if (lookups.current(id) !== lookup || ttl === undefined || !Number.isSafeInteger(ttl) || ttl < 1) return denied();
      const receipt = await this.receipt(link.receiptId);
      if (receipt === undefined || receipt.interactionUid !== link.interactionUid) return denied();
      const binding = bindingSchema.parse(link.binding);
      for (const field of ['subjectId', 'tenantId', 'siteId', 'grantId', 'clientId', 'resource'] as const) {
        if (binding[field] !== receipt[field]) return denied();
      }
      const key = decodeLookup(lookup);
      const stored = { ...payload }; delete stored['jti'];
      let parentKey: string | null = null;
      if (parent !== undefined) {
        const found = await this.link(parent.model, parent.keys);
        if (found === undefined || found.receiptId !== link.receiptId) return denied();
        parentKey = await this.#db.withAuthorizationService(async client => {
          const result = await client.query<{ artifact_lookup: string }>(
            'SELECT artifact_lookup FROM oauth.persistent_links WHERE model=$1 AND artifact_lookup=ANY($2::text[])', [parent.model, parent.keys]);
          if (result.rows.length !== 1) return denied();
          return result.rows[0]?.artifact_lookup ?? denied();
        });
      }
      await this.#db.withAuthorizationService(async client => {
        await client.query('SELECT oauth.issue_persistent_artifact($1,$2::smallint,$3,$4::text[],$5::jsonb,$6,$7,$8,$9,$10,$11)',
          [model, key.version, key.digest, lookups.candidates(id), JSON.stringify(stored), new Date(Date.now() + ttl * 1000),
            receipt.id, link.interactionUid, link.sessionUid, parent?.model ?? null, parentKey]);
      });
    } catch (error) { return this.#failure(error, 'save_link'); }
  }
  async consumeCode(id: string, keys: readonly string[]): Promise<void> {
    try {
      const expected = this.lookups().candidates(id);
      if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) return denied();
      await this.#db.withAuthorizationService(async client => {
        const result = await client.query<{ artifact_lookup: string }>(
          `SELECT artifact_lookup FROM oauth.persistent_links
           WHERE model='AuthorizationCode' AND artifact_lookup=ANY($1::text[])`, [keys]);
        if (result.rows.length !== 1) return denied();
        const consumed = await client.query<{ value: string }>('SELECT oauth.consume_classified_artifact($1,$2::text[],NULL) AS value',
          ['AuthorizationCode', keys]);
        if (consumed.rows[0]?.value !== 'consumed') return denied();
      });
    } catch (error) { return this.#failure(error, 'consume_code'); }
  }
}
