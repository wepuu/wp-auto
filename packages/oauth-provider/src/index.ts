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
  resolve(accountId: string): Promise<GrantClaims | undefined>;
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

export interface AuthorizationProviderOptions {
  readonly issuer: string;
  readonly cookieKeys: readonly string[];
  readonly keyCustody: KeyCustody;
  readonly adapter: OidcAdapterConstructor;
  readonly resourceRegistry: ResourceRegistry;
  readonly grantClaimsResolver: GrantClaimsResolver;
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
  const clients: ClientMetadata[] = (options.clients ?? []).map((client) => ({
    client_id: client.clientId,
    redirect_uris: [...client.redirectUris],
    response_types: ['code'] as const,
    grant_types: ['authorization_code', 'refresh_token'],
    token_endpoint_auth_method: 'none'
  }));

  return new Provider(issuer, {
    adapter: options.adapter,
    jwks: { keys: [externalKey] },
    clients,
    scopes: OAuthScopeSchema.options,
    pkce: { required: () => true },
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
      RefreshToken: 7_776_000,
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
      const claims = await options.grantClaimsResolver.resolve(accountId);
      if (claims === undefined) throw new errors.AccessDenied();
      return {
        nbf: Math.floor(Date.now() / 1_000),
        tenant_id: claims.tenantId,
        site_id: claims.siteId,
        grant_id: claims.grantId
      };
    },
    async findAccount(_context, accountId) {
      const claims = await options.grantClaimsResolver.resolve(accountId);
      if (claims === undefined) return undefined;
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
