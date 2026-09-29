import { ExternalSigningKey, Provider, errors, type ClientMetadata } from 'oidc-provider';
import { z } from 'zod';
import type { KeyCustody, SigningKeyDescriptor } from '@wepuu/key-custody';

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

export interface OidcAdapterShape {
  upsert(id: string, payload: Record<string, unknown>, expiresIn?: number): Promise<void>;
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
    custody: KeyCustody;
    status: 'published' | 'retiring';
  }>[];
  readonly adapter: OidcAdapterConstructor;
  readonly resourceRegistry: ResourceRegistry;
  readonly grantClaimsResolver: GrantClaimsResolver;
  readonly accountRegistry: AccountRegistry;
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

export async function createAuthorizationProvider(options: AuthorizationProviderOptions): Promise<Provider> {
  const issuer = assertHttpsUrl(options.issuer, 'issuer');
  if (options.cookieKeys.length < 2 || options.cookieKeys.some((key) => key.length < 32)) {
    throw new Error('cookie_key_rotation_set_required');
  }
  const descriptor = await options.keyCustody.describeSigningKey();
  const externalKey = new CustodyExternalSigningKey(options.keyCustody, descriptor);
  const verificationKeys = await Promise.all((options.verificationKeys ?? []).map(async ({ custody }) =>
    new CustodyExternalSigningKey(custody, await custody.describeSigningKey())));
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
    adapter: options.adapter,
    // oidc-provider selects the first compatible key for signing. The sole
    // active custody is first; published/retiring keys are verification-only.
    jwks: { keys: [externalKey, ...verificationKeys] },
    clients,
    scopes: oidcScopes,
    pkce: { required: () => true },
    rotateRefreshToken: true,
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
    async findAccount(_context, accountId) {
      if (!await options.accountRegistry.isActive(accountId)) return undefined;
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
