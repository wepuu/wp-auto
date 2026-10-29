import { AsyncLocalStorage } from 'node:async_hooks';
import type { ServerResponse } from 'node:http';
import { errors, type Configuration, type KoaContextWithOIDC } from 'oidc-provider';
import type { OidcAdapterConstructor } from './index.js';
import { PersistentAuthorizationPolicy } from './persistent-policy.js';

type Payload = Record<string, unknown>;
type Model = 'AuthorizationCode' | 'RefreshToken';
export interface PersistentBinding {
  readonly subjectId: string;
  readonly tenantId: string;
  readonly siteId: string;
  readonly grantId: string;
  readonly clientId: string;
  readonly resource: string;
  readonly scopes: readonly ['mcp:read'];
}
export interface PersistentReceipt extends PersistentBinding {
  readonly id: string;
  readonly interactionUid: string;
  readonly explicitApproval: boolean;
  readonly version: 1;
  readonly approvedAt: number;
  readonly issueExpiresAt: number;
  readonly authorizationExpiresAt: number;
  readonly revoked: boolean;
}
export interface PersistentLink {
  readonly receiptId: string;
  readonly interactionUid: string;
  readonly binding: PersistentBinding;
  readonly sessionUid: string;
}
export interface ArtifactLookups {
  current(value: string): string;
  candidates(value: string): readonly string[];
}
/**
 * Trusted storage port. Linked persistence must be atomic with artifact storage.
 * consumeCode must atomically guard Code, receipt, Session expiry/account/Client
 * Grant and one-use transition. A memory implementation is NOT PostgreSQL proof.
 * New links contain only HMAC references/control metadata, never raw artifacts.
 */
export interface PersistentReceiptStore {
  classification(model: Model, keys: readonly string[]): Promise<Readonly<{
    version: 1; mode: 'SESSION_BOUND' | 'NATIVE_OFFLINE' | 'PERSISTENT_READONLY';
  }>>;
  assertCompatible(): Promise<void>;
  consent(interactionUid: string): Promise<PersistentReceipt | undefined>;
  receipt(id: string): Promise<PersistentReceipt | undefined>;
  link(model: Model, keys: readonly string[]): Promise<PersistentLink | undefined>;
  saveLinked(model: Model, id: string, payload: Payload, ttl: number | undefined,
    lookup: string, link: PersistentLink, parent: Readonly<{ model: Model; keys: readonly string[] }> | undefined): Promise<void>;
  consumeCode(id: string, keys: readonly string[]): Promise<void>;
}
export interface PersistentReadOnlyOptions {
  readonly policy?: PersistentAuthorizationPolicy;
  readonly clientId: string;
  readonly resource: string;
  readonly store: PersistentReceiptStore;
  readonly lookups: ArtifactLookups;
  resolveBinding(subjectId: string, grantId: string): Promise<PersistentBinding | undefined>;
  readonly nowSeconds?: () => number;
}
interface Frame {
  active: boolean;
  code?: PersistentLink;
  source?: { readonly model: Model; readonly keys: readonly string[]; readonly link: PersistentLink };
  nativeSource?: { readonly model: Model; readonly keys: readonly string[] };
}
const denied = (): never => { throw new errors.InvalidGrant(); };
const idOk = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_-]{8,256}$/u.test(value);
const bindingFields = ['subjectId', 'tenantId', 'siteId', 'grantId', 'clientId', 'resource'] as const;
const readOnly = (value: unknown): boolean => Array.isArray(value) && value.length === 1 && value[0] === 'mcp:read';

/** Guarded persistent authorization wired by the service only for its trusted Client/resource. */
export class PersistentReadOnlyRuntime {
  readonly #options: PersistentReadOnlyOptions;
  readonly #frames = new AsyncLocalStorage<Frame>();
  readonly #now: () => number;
  readonly #policy: PersistentAuthorizationPolicy;

  constructor(options: PersistentReadOnlyOptions) {
    const url = new URL(options.resource);
    if (!idOk(options.clientId) || url.protocol !== 'https:' || url.href !== options.resource
      || url.username !== '' || url.password !== '' || url.search !== '' || url.hash !== '') {
      throw new Error('invalid_persistent_policy');
    }
    this.#options = options;
    this.#policy = options.policy ?? new PersistentAuthorizationPolicy();
    this.#now = options.nowSeconds ?? (() => Math.floor(Date.now() / 1000));
  }

  /** Required startup precondition in both A and B. Never fall back on failure. */
  async assertCompatible(): Promise<void> { await this.#options.store.assertCompatible(); }

  /** One frame per HTTP response, explicitly cleared on finish/close or throw. */
  runRequest<T>(response: Pick<ServerResponse, 'once' | 'removeListener'>, operation: () => T): T {
    const frame: Frame = { active: true };
    const clear = (): void => {
      frame.active = false;
      delete frame.code;
      delete frame.source;
      delete frame.nativeSource;
      response.removeListener('finish', clear);
      response.removeListener('close', clear);
    };
    response.once('finish', clear);
    response.once('close', clear);
    try { return this.#frames.run(frame, operation); }
    catch (error) { clear(); throw error; }
  }

  #frame(): Frame {
    const frame = this.#frames.getStore();
    return frame?.active === true ? frame : denied();
  }
  #eligible(source: Payload): boolean {
    return source['clientId'] === this.#options.clientId && source['resource'] === this.#options.resource
      && source['scope'] === 'mcp:read' && source['rar'] === undefined;
  }
  #matches(receipt: PersistentReceipt, binding: PersistentBinding, issuing: boolean): boolean {
    const now = this.#now();
    const controls = receipt as unknown as Payload;
    return Number.isSafeInteger(now) && idOk(receipt.id) && idOk(receipt.interactionUid)
      && controls['version'] === 1 && controls['explicitApproval'] === true && controls['revoked'] === false
      && readOnly(receipt.scopes) && readOnly(binding.scopes)
      && bindingFields.every((field) => receipt[field] === binding[field])
      && bindingFields.filter((field) => field !== 'resource').every((field) => idOk(receipt[field]))
      && receipt.clientId === this.#options.clientId && receipt.resource === this.#options.resource
      && Number.isSafeInteger(receipt.approvedAt) && receipt.approvedAt <= now
      && Number.isSafeInteger(receipt.issueExpiresAt) && receipt.issueExpiresAt > receipt.approvedAt
      && receipt.issueExpiresAt - receipt.approvedAt <= 300
      && (!issuing || receipt.issueExpiresAt > now)
      && Number.isSafeInteger(receipt.authorizationExpiresAt) && receipt.authorizationExpiresAt > now
      && receipt.authorizationExpiresAt - receipt.approvedAt <= 90 * 86400;
  }
  async #binding(context: KoaContextWithOIDC, source: Payload): Promise<PersistentBinding> {
    const subject = source['accountId'], grantId = source['grantId'];
    if (!this.#eligible(source) || !idOk(subject) || !idOk(grantId)) return denied();
    const binding = await this.#options.resolveBinding(subject, grantId);
    const grant = await context.oidc.provider.Grant.find(grantId);
    if (binding === undefined || binding.subjectId !== subject || binding.grantId !== grantId
      || binding.clientId !== this.#options.clientId || binding.resource !== this.#options.resource
      || !readOnly(binding.scopes) || grant === undefined || grant.accountId !== subject
      || grant.clientId !== binding.clientId || grant.jti !== grantId
      || Object.keys(grant.resources ?? {}).length !== 1
      || grant.getResourceScope(binding.resource) !== 'mcp:read'
      || grant.getOIDCScope() !== '' || grant.getOIDCClaims().length !== 0 || grant.rar !== undefined) return denied();
    return binding;
  }
  async #session(context: KoaContextWithOIDC, source: Payload, link: PersistentLink): Promise<void> {
    if (!idOk(source['sessionUid']) || source['sessionUid'] !== link.sessionUid) return denied();
    const session = await context.oidc.provider.Session.findByUid(link.sessionUid);
    if (session === undefined || session.accountId !== source['accountId']
      || session.grantIdFor(this.#options.clientId) !== source['grantId']) return denied();
  }

  readonly expiresWithSession: NonNullable<Configuration['expiresWithSession']> = async (context, code) => {
    const source = code as unknown as Payload;
    if (source['kind'] !== 'AuthorizationCode' || !this.#eligible(source)) return !code.scopes.has('offline_access');
    try {
      const frame = this.#frame();
      const uid = context.oidc.entities.Interaction?.uid;
      // Reuse without an explicit fresh interaction is not a persistent opt-in.
      if (uid === undefined) return true;
      const receipt = await this.#options.store.consent(uid);
      if (receipt === undefined || (receipt as unknown as Payload)['explicitApproval'] === false) return true;
      this.#policy.assertNewAuthorization();
      const binding = await this.#binding(context, source);
      if (receipt.interactionUid !== uid || !this.#matches(receipt, binding, true)
        || !idOk(source['sessionUid'])) return denied();
      frame.code = Object.freeze({ receiptId: receipt.id, interactionUid: uid,
        binding: Object.freeze({ ...binding, scopes: Object.freeze(['mcp:read'] as const) }), sessionUid: source['sessionUid'] });
      // The replacement Adapter guard, not native token lookup, protects this Code.
      return false;
    } catch { return denied(); }
  };

  async verifySource(context: KoaContextWithOIDC, accountId: string, token: unknown): Promise<void> {
    const source = token as Payload | undefined;
    if (source === undefined) return;
    try {
      const model = source['kind'];
      if (model !== 'AuthorizationCode' && model !== 'RefreshToken') return;
      if (!idOk(source['jti'])) return denied();
      const keys = this.#options.lookups.candidates(source['jti']);
      const classification = await this.#options.store.classification(model, keys);
      const link = await this.#options.store.link(model, keys);
      if ((classification as { readonly version: unknown }).version !== 1) return denied();
      if (classification.mode !== 'PERSISTENT_READONLY') {
        if (link !== undefined || !['SESSION_BOUND', 'NATIVE_OFFLINE'].includes(classification.mode)) return denied();
        if (classification.mode === 'NATIVE_OFFLINE') this.#frame().nativeSource = { model, keys: Object.freeze([...keys]) };
        return;
      }
      if (!this.#eligible(source) || source['expiresWithSession'] === true) return denied();
      const binding = await this.#binding(context, source);
      if (link === undefined || accountId !== binding.subjectId) return denied();
      const receipt = await this.#options.store.receipt(link.receiptId);
      if (receipt === undefined || !this.#matches(receipt, binding, model === 'AuthorizationCode')
        || receipt.interactionUid !== link.interactionUid
        || bindingFields.some((field) => link.binding[field] !== binding[field]) || !readOnly(link.binding.scopes)
        || link.sessionUid !== source['sessionUid']) return denied();
      if (model === 'AuthorizationCode') await this.#session(context, source, link);
      this.#frame().source = { model, keys: Object.freeze([...keys]), link };
    } catch { return denied(); }
  }

  readonly issueRefreshToken: NonNullable<Configuration['issueRefreshToken']> = async (context, client, code) => {
    const source = code as unknown as Payload;
    if (source['kind'] !== 'AuthorizationCode' || !this.#eligible(source)) {
      return client.grantTypeAllowed('refresh_token') && code.scopes.has('offline_access');
    }
    if (source['expiresWithSession'] === true) return false;
    try {
      await this.verifySource(context, String(source['accountId']), source);
      return client.clientAuthMethod === 'none' && client.grantTypeAllowed('refresh_token')
        && context.oidc.params?.['grant_type'] === 'authorization_code';
    } catch { return denied(); }
  };

  adapter(Base: OidcAdapterConstructor): OidcAdapterConstructor {
    return ((runtime: PersistentReadOnlyRuntime): OidcAdapterConstructor => class PersistentAdapter {
      readonly #model: string;
      readonly #base: InstanceType<OidcAdapterConstructor>;
      constructor(model: string) { this.#model = model; this.#base = new Base(model); }
      async upsert(id: string, payload: Payload, ttl?: number): Promise<void> {
        const frame = runtime.#frames.getStore();
        if ((this.#model === 'AuthorizationCode' || this.#model === 'RefreshToken')
          && (frame?.code !== undefined && this.#model === 'AuthorizationCode'
            || frame?.source !== undefined && this.#model === 'RefreshToken')) {
          try {
            if (!runtime.#eligible(payload)) return denied();
            const frame = runtime.#frame();
            const model = this.#model;
            if (model === 'AuthorizationCode') runtime.#policy.assertNewAuthorization();
            const link = model === 'AuthorizationCode' ? frame.code : frame.source?.link;
            if (link === undefined || payload['sessionUid'] !== link.sessionUid
              || bindingFields.some((field) => field !== 'subjectId' && field !== 'tenantId' && field !== 'siteId'
                && payload[field] !== link.binding[field])
              || payload['accountId'] !== link.binding.subjectId) return denied();
            await runtime.#options.store.saveLinked(model, id, payload, ttl, runtime.#options.lookups.current(id), link,
              model === 'AuthorizationCode' ? undefined : frame.source === undefined ? undefined : {
                model: frame.source.model, keys: frame.source.keys
              });
            return;
          } catch { return denied(); }
        }
        if (this.#model === 'RefreshToken') {
          const parent = runtime.#frame().nativeSource;
          if (parent === undefined || this.#base.upsertNativeRefresh === undefined) return denied();
          return this.#base.upsertNativeRefresh(id, payload, ttl, parent);
        }
        await this.#base.upsert(id, payload, ttl);
      }
      find(id: string): Promise<Payload | undefined> { return this.#base.find(id); }
      findByUid(uid: string): Promise<Payload | undefined> { return this.#base.findByUid(uid); }
      findByUserCode(code: string): Promise<Payload | undefined> { return this.#base.findByUserCode(code); }
      destroy(id: string): Promise<void> { return this.#base.destroy(id); }
      revokeByGrantId(id: string): Promise<void> { return this.#base.revokeByGrantId(id); }
      async consume(id: string): Promise<void> {
        // The SQL consumption function classifies before choosing the existing guard.
        await this.#base.consume(id);
      }
    })(this);
  }
}
