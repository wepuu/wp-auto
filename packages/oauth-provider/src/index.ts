import { ExternalSigningKey, Provider, errors, type ClientMetadata, type Configuration, type Grant } from 'oidc-provider';
import { z } from 'zod';
import type { KeyCustody, SigningKeyDescriptor } from '@wepuu/key-custody';
import type { PersistentReadOnlyRuntime } from './persistent-readonly.js';
export { PersistentAuthorizationPolicy } from './persistent-policy.js';
export { PersistentReadOnlyRuntime } from './persistent-readonly.js';

export const OAuthScopeSchema = z.enum([
  'openid',
  'offline_access',
  'mcp:read',
  'mcp:content.write',
  'mcp:media.write',
  'mcp:taxonomy.write',
  'mcp:seo.write'
]);

// oidc-provider treats every top-level configured scope as an OIDC scope when
// evaluating consent. Resource-specific MCP scopes are supplied exclusively by
// getResourceServerInfo below so a grant does not have to duplicate them as
// both OIDC and RFC 8707 resource scopes.
const oidcScopes = ['openid', 'offline_access'] as const;

export interface ResourceServerPolicy {
  readonly resource: string;
  readonly scopes: readonly string[];
}

export interface ResourceRegistry {
  resolve(resource: string): Promise<ResourceServerPolicy | undefined>;
}

export interface GrantClaims {
  readonly tenantId: string;
  readonly siteId: string;
  readonly grantId: string;
}

export interface GrantClaimsResolver {
  resolve(accountId: string, binding?: Readonly<{
    grantId?: string;
    clientId?: string;
    resource?: string;
  }>): Promise<GrantClaims | undefined>;
}

export interface AccountRegistry {
  isActive(accountId: string): Promise<boolean>;
}

export type GrantDiagnosticStage = 'interaction' | 'binding' | 'grant_load' | 'consent_plan' | 'grant_save' | 'interaction_finish';
export const GRANT_DIAGNOSTIC_CODES = [
  'grant.binding_mismatch', 'grant.account_mismatch', 'grant.client_mismatch', 'grant.resource_mismatch',
  'grant.scope_mismatch', 'grant.provider_missing', 'grant.lookup_failed', 'grant.save_failed',
  'interaction.finish_failed', 'unknown'
] as const;
export type GrantDiagnosticCode = typeof GRANT_DIAGNOSTIC_CODES[number];
const stages = new Set<GrantDiagnosticStage>(['interaction', 'binding', 'grant_load', 'consent_plan', 'grant_save', 'interaction_finish']);
const codes = new Set<string>(GRANT_DIAGNOSTIC_CODES);

/** Never serialize cause, message, IDs, or Provider request context. */
export class GrantDiagnosticError extends Error {
  constructor(readonly stage: GrantDiagnosticStage, readonly category: GrantDiagnosticCode, cause?: unknown) {
    super('oauth_grant_failed', { cause });
    this.name = 'GrantDiagnosticError';
  }
}

export function grantFailureDiagnostic(error: unknown, fallbackStage: GrantDiagnosticStage = 'interaction'): Readonly<{
  occurredAt: string; event: 'oauth.grant_failed'; stage: GrantDiagnosticStage; category: GrantDiagnosticCode;
}> {
  const valid = error instanceof GrantDiagnosticError && stages.has(error.stage) && codes.has(error.category);
  const stage = valid ? error.stage : fallbackStage;
  const fallback: Partial<Record<GrantDiagnosticStage, GrantDiagnosticCode>> = {
    binding: 'grant.lookup_failed', grant_load: 'grant.lookup_failed',
    grant_save: 'grant.save_failed', interaction_finish: 'interaction.finish_failed'
  };
  return { occurredAt: new Date().toISOString(), event: 'oauth.grant_failed', stage,
    category: valid ? error.category : fallback[stage] ?? 'unknown' };
}

export interface ResourceGrantResolver {
  resolveExact(input: Readonly<{ subjectId: string; clientId: string; resource: string; scopes: readonly string[] }>):
    Promise<Readonly<{ grantId: string; subjectId: string; clientId: string; resource: string; scopes: readonly string[] }> | undefined>;
}

export type ResourceGrantLoader = NonNullable<Configuration['loadExistingGrant']>;
const mcpScopes = ['mcp:read', 'mcp:content.write', 'mcp:media.write', 'mcp:taxonomy.write', 'mcp:seo.write'] as const;
function scopeSet(value: readonly string[]): string { return [...new Set(value)].sort().join(' '); }

/** Select by authoritative resource binding, never by the Session's last Client Grant. */
export function createResourceGrantLoader(resolver: ResourceGrantResolver, accounts: AccountRegistry): ResourceGrantLoader {
  return async (context) => {
    const accountId = context.oidc.account?.accountId;
    const clientId = context.oidc.client?.clientId;
    if (typeof clientId !== 'string') throw new GrantDiagnosticError('grant_load', 'grant.client_mismatch');
    const rawResource = context.oidc.params?.['resource'];
    const resource: unknown = Array.isArray(rawResource) && rawResource.length === 1 ? rawResource[0] : rawResource;
    if (typeof accountId !== 'string') throw new GrantDiagnosticError('grant_load', 'grant.account_mismatch');
    if (typeof resource !== 'string') throw new GrantDiagnosticError('grant_load', 'grant.resource_mismatch');
    try {
      if (assertExactResource(resource) !== resource) throw new Error('noncanonical');
    } catch { throw new GrantDiagnosticError('grant_load', 'grant.resource_mismatch'); }
    const rawScope = context.oidc.params?.['scope'];
    if (typeof rawScope !== 'string') throw new GrantDiagnosticError('grant_load', 'grant.scope_mismatch');
    const requested = rawScope.split(' ').filter(Boolean);
    if (requested.some((scope) => ![...mcpScopes, 'openid', 'offline_access'].includes(scope))) {
      throw new GrantDiagnosticError('grant_load', 'grant.scope_mismatch');
    }
    const scopes = requested.filter((scope) => (mcpScopes as readonly string[]).includes(scope));
    if (scopes.length === 0) throw new GrantDiagnosticError('grant_load', 'grant.scope_mismatch');
    let binding: Awaited<ReturnType<ResourceGrantResolver['resolveExact']>>;
    try {
      if (!await accounts.isActive(accountId)) throw new GrantDiagnosticError('grant_load', 'grant.account_mismatch');
      binding = await resolver.resolveExact({ subjectId: accountId, clientId, resource, scopes: [...new Set(scopes)] });
    } catch (cause) {
      if (cause instanceof GrantDiagnosticError) throw cause;
      throw new GrantDiagnosticError('grant_load', 'grant.lookup_failed', cause);
    }
    const submittedId = context.oidc.result?.consent?.grantId;
    if (submittedId !== undefined && (binding === undefined || submittedId !== binding.grantId)) {
      throw new GrantDiagnosticError('grant_load', 'grant.binding_mismatch');
    }
    if (binding === undefined) return undefined;
    if (binding.subjectId !== accountId) throw new GrantDiagnosticError('grant_load', 'grant.account_mismatch');
    if (binding.clientId !== clientId) throw new GrantDiagnosticError('grant_load', 'grant.client_mismatch');
    if (binding.resource !== resource) throw new GrantDiagnosticError('grant_load', 'grant.resource_mismatch');
    if (scopeSet(binding.scopes) !== scopeSet(scopes)) throw new GrantDiagnosticError('grant_load', 'grant.scope_mismatch');
    let grant: Grant | undefined;
    try { grant = await context.oidc.provider.Grant.find(binding.grantId); }
    catch (cause) { throw new GrantDiagnosticError('grant_load', 'grant.lookup_failed', cause); }
    if (grant === undefined) {
      if (submittedId !== undefined) throw new GrantDiagnosticError('grant_load', 'grant.provider_missing');
      return undefined; // business Consent exists; normal interaction persists the Provider Grant
    }
    if (grant.jti !== binding.grantId) throw new GrantDiagnosticError('grant_load', 'grant.binding_mismatch');
    if (grant.accountId !== accountId) throw new GrantDiagnosticError('grant_load', 'grant.account_mismatch');
    if (grant.clientId !== clientId) throw new GrantDiagnosticError('grant_load', 'grant.client_mismatch');
    const grantedResources = Object.keys(grant.resources ?? {});
    if (grantedResources.length !== 1 || grantedResources[0] !== resource) {
      throw new GrantDiagnosticError('grant_load', 'grant.resource_mismatch');
    }
    if (scopeSet(grant.getResourceScope(resource).split(' ').filter(Boolean)) !== scopeSet(binding.scopes)
      || grant.getOIDCScope().split(' ').filter(Boolean).some((scope) => !['openid', 'offline_access'].includes(scope))
      || grant.getOIDCClaims().some((claim) => claim !== 'sub') || grant.rar !== undefined) {
      throw new GrantDiagnosticError('grant_load', 'grant.scope_mismatch');
    }
    return grant;
  };
}

export interface OidcAdapterShape {
  upsert(id: string, payload: Record<string, unknown>, expiresIn?: number): Promise<void>;
  upsertNativeRefresh?(id: string, payload: Record<string, unknown>, expiresIn: number | undefined,
    parent: Readonly<{ model: 'AuthorizationCode' | 'RefreshToken'; keys: readonly string[] }>): Promise<void>;
  find(id: string): Promise<Record<string, unknown> | undefined>;
  destroy(id: string): Promise<void>;
  consume(id: string): Promise<void>;
  findByUid(uid: string): Promise<Record<string, unknown> | undefined>;
  findByUserCode(userCode: string): Promise<Record<string, unknown> | undefined>;
  revokeByGrantId(grantId: string): Promise<void>;
}

export type OidcAdapterConstructor = new (model: string) => OidcAdapterShape;

export interface PublicClientDefinition {
  readonly clientId: string;
  readonly redirectUris: readonly string[];
}

function nativeLoopbackRedirectMatches(registered: string, candidate: string): boolean {
  let expected: URL;
  let observed: URL;
  try {
    expected = new URL(registered);
    observed = new URL(candidate);
  } catch {
    return false;
  }
  return expected.protocol === 'http:'
    && expected.hostname === '127.0.0.1'
    && expected.port === ''
    && expected.username === ''
    && expected.password === ''
    && observed.protocol === expected.protocol
    && observed.hostname === expected.hostname
    && observed.port !== ''
    && observed.username === ''
    && observed.password === ''
    && observed.pathname === expected.pathname
    && observed.search === expected.search
    && observed.hash === ''
    && expected.hash === '';
}

export async function allowRegisteredNativeLoopbackPort(
  provider: Provider,
  authorizationUrl: URL
): Promise<boolean> {
  const clientId = authorizationUrl.searchParams.get('client_id');
  const redirectUri = authorizationUrl.searchParams.get('redirect_uri');
  if (clientId === null || redirectUri === null) return false;
  const client = await provider.Client.find(clientId);
  if (client === undefined) return false;
  const redirectUris = client.redirectUris as string[] | undefined;
  if (redirectUris === undefined) return false;
  if (redirectUris.includes(redirectUri)) return true;
  if (!redirectUris.some((registered) => nativeLoopbackRedirectMatches(registered, redirectUri))) {
    return false;
  }
  redirectUris.push(redirectUri);
  const dynamicVariants = redirectUris.filter((current) =>
    redirectUris.some((registered) => nativeLoopbackRedirectMatches(registered, current)));
  if (dynamicVariants.length > 8) {
    const oldest = dynamicVariants[0];
    if (oldest !== undefined) redirectUris.splice(redirectUris.indexOf(oldest), 1);
  }
  return true;
}

export interface AuthorizationProviderOptions {
  readonly issuer: string;
  readonly cookieKeys: readonly string[];
  readonly keyCustody: KeyCustody;
  readonly verificationKeys?: readonly Readonly<{
    descriptor: SigningKeyDescriptor;
    status: 'published' | 'retiring';
  }>[];
  readonly adapter: OidcAdapterConstructor;
  readonly resourceRegistry: ResourceRegistry;
  readonly grantClaimsResolver: GrantClaimsResolver;
  readonly accountRegistry: AccountRegistry;
  readonly resourceGrantResolver?: ResourceGrantResolver;
  /** Isolated opt-in only; no service caller supplies this local mechanism. */
  readonly persistentReadOnly?: PersistentReadOnlyRuntime;
  readonly clients?: readonly PublicClientDefinition[];
}

function assertHttpsUrl(value: string, label: string): string {
  const parsed = new URL(value);
  if (parsed.protocol !== 'https:' || parsed.username !== '' || parsed.password !== '' || parsed.hash !== '') {
    throw new Error(`invalid_${label}`);
  }
  return parsed.href.replace(/\/$/u, '');
}

function assertExactResource(value: string): string {
  const parsed = new URL(value);
  if (
    parsed.protocol !== 'https:' ||
    parsed.username !== '' ||
    parsed.password !== '' ||
    parsed.hash !== '' ||
    parsed.search !== '' ||
    (parsed.port !== '' && parsed.port !== '443')
  ) {
    throw new errors.InvalidTarget();
  }
  return parsed.href;
}

const refreshInactivitySeconds = 30 * 24 * 60 * 60;
const refreshAbsoluteSeconds = 90 * 24 * 60 * 60;

export function refreshTokenTtl(token: Readonly<{ iiat?: unknown }>, nowSeconds = Math.floor(Date.now() / 1_000)): number {
  const initialIssuedAt = typeof token.iiat === 'number' && Number.isSafeInteger(token.iiat)
    ? token.iiat
    : nowSeconds;
  const absoluteRemaining = initialIssuedAt + refreshAbsoluteSeconds - nowSeconds;
  if (absoluteRemaining <= 0) return 1;
  return Math.min(refreshInactivitySeconds, absoluteRemaining);
}

class CustodyExternalSigningKey extends ExternalSigningKey {
  readonly #custody: KeyCustody;
  readonly #descriptor: SigningKeyDescriptor;

  constructor(custody: KeyCustody, descriptor: SigningKeyDescriptor) {
    super();
    this.#custody = custody;
    this.#descriptor = descriptor;
  }

  override get kid(): string {
    return this.#descriptor.kid;
  }

  override get alg(): string {
    return this.#descriptor.algorithm;
  }

  override keyObject(): SigningKeyDescriptor['publicKey'] {
    return this.#descriptor.publicKey;
  }

  override async sign(data: Uint8Array): Promise<Uint8Array> {
    return this.#custody.sign(data);
  }
}

class PublicExternalSigningKey extends ExternalSigningKey {
  constructor(private readonly descriptor: SigningKeyDescriptor) { super(); }
  override get kid(): string { return this.descriptor.kid; }
  override get alg(): string { return this.descriptor.algorithm; }
  override keyObject(): SigningKeyDescriptor['publicKey'] { return this.descriptor.publicKey; }
  override async sign(): Promise<Uint8Array> { return await Promise.reject(new Error('verification_only_key')); }
}

export async function createAuthorizationProvider(options: AuthorizationProviderOptions): Promise<Provider> {
  await options.persistentReadOnly?.assertCompatible();
  const issuer = assertHttpsUrl(options.issuer, 'issuer');
  if (options.cookieKeys.length < 2 || options.cookieKeys.some((key) => key.length < 32)) {
    throw new Error('cookie_key_rotation_set_required');
  }
  const descriptor = await options.keyCustody.describeSigningKey();
  const externalKey = new CustodyExternalSigningKey(options.keyCustody, descriptor);
  const verificationKeys = (options.verificationKeys ?? []).map(({ descriptor }) =>
    new PublicExternalSigningKey(descriptor));
  const keyIds = [externalKey, ...verificationKeys].map((key) => key.kid);
  if (new Set(keyIds).size !== keyIds.length) throw new Error('duplicate_signing_kid');
  const clients: ClientMetadata[] = (options.clients ?? []).map((client) => ({
    client_id: client.clientId,
    redirect_uris: [...client.redirectUris],
    response_types: ['code'] as const,
    grant_types: ['authorization_code', 'refresh_token'],
    token_endpoint_auth_method: 'none'
  }));

  return new Provider(issuer, {
    adapter: options.persistentReadOnly?.adapter(options.adapter) ?? options.adapter,
    // oidc-provider selects the first compatible key for signing. The sole
    // active custody is first; published/retiring keys are verification-only.
    jwks: { keys: [externalKey, ...verificationKeys] },
    clients,
    ...(options.resourceGrantResolver === undefined ? {} : {
      loadExistingGrant: createResourceGrantLoader(options.resourceGrantResolver, options.accountRegistry)
    }),
    scopes: oidcScopes,
    pkce: { required: () => true },
    rotateRefreshToken: true,
    ...(options.persistentReadOnly === undefined ? {} : {
      expiresWithSession: options.persistentReadOnly.expiresWithSession,
      issueRefreshToken: options.persistentReadOnly.issueRefreshToken
    }),
    clockTolerance: 60,
    features: {
      externalSigningSupport: { enabled: true, ack: 'experimental-01' },
      devInteractions: { enabled: false },
      registration: { enabled: false },
      revocation: { enabled: true, allowedPolicy: () => Promise.resolve(true) },
      resourceIndicators: {
        enabled: true,
        async getResourceServerInfo(_context, resourceIndicator) {
          const exactResource = assertExactResource(resourceIndicator);
          const policy = await options.resourceRegistry.resolve(exactResource);
          if (policy === undefined || policy.resource !== exactResource) throw new errors.InvalidTarget();
          return {
            scope: policy.scopes.join(' '),
            audience: exactResource,
            accessTokenFormat: 'jwt'
          };
        }
      }
    },
    ttl: {
      AccessToken: 300,
      AuthorizationCode: 90,
      RefreshToken: (_context, token) => refreshTokenTtl(token),
      Interaction: 300,
      Session: 600,
      Grant: 7_776_000,
      IdToken: 300
    },
    claims: { openid: ['sub'] },
    async extraTokenClaims(_context, token) {
      if (token.kind !== 'AccessToken') return undefined;
      const accountId = token.accountId;
      if (typeof accountId !== 'string') throw new errors.AccessDenied();
      const tokenRecord = token as unknown as Record<string, unknown>;
      const binding: { grantId?: string; clientId?: string; resource?: string } = {};
      if (typeof token.grantId === 'string') binding.grantId = token.grantId;
      if (typeof token.clientId === 'string') binding.clientId = token.clientId;
      if (typeof tokenRecord['resource'] === 'string') binding.resource = tokenRecord['resource'];
      const claims = await options.grantClaimsResolver.resolve(accountId, binding);
      if (claims === undefined) throw new errors.AccessDenied();
      return {
        nbf: Math.floor(Date.now() / 1_000),
        client_id: token.clientId,
        scope: token.scope,
        tenant_id: claims.tenantId,
        site_id: claims.siteId,
        grant_id: claims.grantId
      };
    },
    async findAccount(context, accountId, source) {
      if (!await options.accountRegistry.isActive(accountId)) return undefined;
      await options.persistentReadOnly?.verifySource(context, accountId, source);
      return { accountId, claims: () => Promise.resolve({ sub: accountId }) };
    },
    interactions: {
      url(_context, interaction) {
        return `/interaction/${interaction.uid}`;
      }
    },
    cookies: { keys: [...options.cookieKeys] }
  });
}

export class DenyAllResourceRegistry implements ResourceRegistry {
  resolve(): Promise<undefined> {
    return Promise.resolve(undefined);
  }
}

export class DenyAllGrantClaimsResolver implements GrantClaimsResolver {
  resolve(): Promise<undefined> {
    return Promise.resolve(undefined);
  }
}

export class DenyAllAccountRegistry implements AccountRegistry {
  isActive(): Promise<false> {
    return Promise.resolve(false);
  }
}
