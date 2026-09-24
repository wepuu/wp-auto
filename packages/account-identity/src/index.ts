import { createHash, createHmac, randomBytes } from 'node:crypto';
import { EncryptJWT, jwtDecrypt } from 'jose';
import * as oidc from 'openid-client';
import { z } from 'zod';

const TRANSACTION_TTL_SECONDS = 300;
const SESSION_TTL_SECONDS = 12 * 60 * 60;
const MAX_RETURN_PATH_LENGTH = 2_048;

const EnvironmentSchema = z.object({
  WEPUU_ACCOUNT_OIDC_ISSUER: z.string().min(1),
  WEPUU_ACCOUNT_OIDC_CLIENT_ID: z.string().min(8).max(256),
  WEPUU_ACCOUNT_OIDC_CLIENT_SECRET: z.string().min(16).max(4_096),
  WEPUU_ACCOUNT_OIDC_REDIRECT_URI: z.string().min(1),
  WEPUU_ACCOUNT_OIDC_SCOPES: z.literal('openid'),
  WEPUU_ACCOUNT_OIDC_CLIENT_AUTH_METHOD: z.literal('client_secret_basic'),
  WEPUU_CONTROL_PUBLIC_ORIGIN: z.string().min(1),
  WEPUU_OIDC_TRANSACTION_KEYS_JSON: z.string().min(1),
  WEPUU_IDENTITY_SUBJECT_HMAC_KEY: z.string().min(1)
}).strict();

const TransactionClaimsSchema = z.object({
  v: z.literal(1),
  codeVerifier: z.string().min(43).max(128),
  state: z.string().min(32).max(256),
  nonce: z.string().min(32).max(256),
  returnTo: z.string().min(1).max(MAX_RETURN_PATH_LENGTH),
  iat: z.number().int().nonnegative(),
  exp: z.number().int().positive()
});
const TransactionKeysSchema = z.tuple([z.string(), z.string()]);

export interface AccountOidcRuntimeConfig {
  readonly issuer: URL;
  readonly clientId: string;
  readonly clientSecret: string;
  readonly redirectUri: URL;
  readonly publicOrigin: URL;
  readonly scopes: 'openid';
  readonly transactionKeys: readonly [Uint8Array, Uint8Array];
  readonly identitySubjectHmacKey: Uint8Array;
  readonly transactionTtlSeconds: number;
  readonly sessionTtlSeconds: number;
}

function exactHttpsUrl(value: string, kind: 'issuer' | 'redirect' | 'origin'): URL {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username !== '' || url.password !== '' || url.search !== '' || url.hash !== '') {
    throw new Error(`${kind}_url_invalid`);
  }
  if (url.port !== '' && url.port !== '443') throw new Error(`${kind}_url_invalid`);
  if (kind === 'origin' && url.pathname !== '/') throw new Error('origin_url_invalid');
  if (kind === 'issuer' && !url.pathname.endsWith('/')) throw new Error('issuer_url_invalid');
  return url;
}

function decodeKey(value: string, name: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]{43}$/u.test(value)) throw new Error(`${name}_invalid`);
  const decoded = Buffer.from(value, 'base64url');
  if (decoded.byteLength !== 32 || decoded.toString('base64url') !== value) throw new Error(`${name}_invalid`);
  return decoded;
}

export function loadAccountOidcConfig(environment: NodeJS.ProcessEnv): AccountOidcRuntimeConfig {
  const picked = {
    WEPUU_ACCOUNT_OIDC_ISSUER: environment['WEPUU_ACCOUNT_OIDC_ISSUER'],
    WEPUU_ACCOUNT_OIDC_CLIENT_ID: environment['WEPUU_ACCOUNT_OIDC_CLIENT_ID'],
    WEPUU_ACCOUNT_OIDC_CLIENT_SECRET: environment['WEPUU_ACCOUNT_OIDC_CLIENT_SECRET'],
    WEPUU_ACCOUNT_OIDC_REDIRECT_URI: environment['WEPUU_ACCOUNT_OIDC_REDIRECT_URI'],
    WEPUU_ACCOUNT_OIDC_SCOPES: environment['WEPUU_ACCOUNT_OIDC_SCOPES'],
    WEPUU_ACCOUNT_OIDC_CLIENT_AUTH_METHOD: environment['WEPUU_ACCOUNT_OIDC_CLIENT_AUTH_METHOD'],
    WEPUU_CONTROL_PUBLIC_ORIGIN: environment['WEPUU_CONTROL_PUBLIC_ORIGIN'],
    WEPUU_OIDC_TRANSACTION_KEYS_JSON: environment['WEPUU_OIDC_TRANSACTION_KEYS_JSON'],
    WEPUU_IDENTITY_SUBJECT_HMAC_KEY: environment['WEPUU_IDENTITY_SUBJECT_HMAC_KEY']
  };
  const parsed = EnvironmentSchema.parse(picked);
  const issuer = exactHttpsUrl(parsed.WEPUU_ACCOUNT_OIDC_ISSUER, 'issuer');
  const redirectUri = exactHttpsUrl(parsed.WEPUU_ACCOUNT_OIDC_REDIRECT_URI, 'redirect');
  const publicOrigin = exactHttpsUrl(parsed.WEPUU_CONTROL_PUBLIC_ORIGIN, 'origin');
  if (redirectUri.origin !== publicOrigin.origin || redirectUri.pathname !== '/v1/account/oidc/callback') {
    throw new Error('redirect_uri_invalid');
  }
  let serializedKeys: readonly [string, string];
  try {
    serializedKeys = TransactionKeysSchema.parse(JSON.parse(parsed.WEPUU_OIDC_TRANSACTION_KEYS_JSON) as unknown);
  } catch {
    throw new Error('transaction_keys_invalid');
  }
  const firstKey = serializedKeys[0];
  const secondKey = serializedKeys[1];
  if (firstKey === secondKey) {
    throw new Error('transaction_keys_invalid');
  }
  return {
    issuer,
    clientId: parsed.WEPUU_ACCOUNT_OIDC_CLIENT_ID,
    clientSecret: parsed.WEPUU_ACCOUNT_OIDC_CLIENT_SECRET,
    redirectUri,
    publicOrigin,
    scopes: 'openid',
    transactionKeys: [decodeKey(firstKey, 'transaction_key'), decodeKey(secondKey, 'transaction_key')],
    identitySubjectHmacKey: decodeKey(parsed.WEPUU_IDENTITY_SUBJECT_HMAC_KEY, 'identity_hmac_key'),
    transactionTtlSeconds: TRANSACTION_TTL_SECONDS,
    sessionTtlSeconds: SESSION_TTL_SECONDS
  };
}

export function validateReturnPath(value: string | undefined): string {
  if (value === undefined || value === '') return '/';
  if (value.length > MAX_RETURN_PATH_LENGTH || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) {
    throw new AccountLoginError('invalid_request');
  }
  const parsed = new URL(value, 'https://platform.invalid');
  if (parsed.origin !== 'https://platform.invalid' || parsed.username !== '' || parsed.password !== '') {
    throw new AccountLoginError('invalid_request');
  }
  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}

export interface OidcTransaction {
  readonly codeVerifier: string;
  readonly state: string;
  readonly nonce: string;
  readonly returnTo: string;
}

export class OidcTransactionCodec {
  readonly #keys: readonly [Uint8Array, Uint8Array];
  readonly #issuer: string;
  readonly #audience: string;
  readonly #ttlSeconds: number;
  readonly #now: () => number;

  constructor(options: {
    readonly keys: readonly [Uint8Array, Uint8Array];
    readonly issuer: string;
    readonly audience: string;
    readonly ttlSeconds?: number;
    readonly now?: () => number;
  }) {
    this.#keys = options.keys;
    this.#issuer = options.issuer;
    this.#audience = options.audience;
    this.#ttlSeconds = options.ttlSeconds ?? TRANSACTION_TTL_SECONDS;
    this.#now = options.now ?? (() => Math.floor(Date.now() / 1_000));
  }

  async encode(transaction: OidcTransaction): Promise<string> {
    const now = this.#now();
    return new EncryptJWT({
      v: 1,
      codeVerifier: transaction.codeVerifier,
      state: transaction.state,
      nonce: transaction.nonce,
      returnTo: validateReturnPath(transaction.returnTo)
    })
      .setProtectedHeader({ alg: 'dir', enc: 'A256GCM', typ: 'wepuu-oidc-transaction+jwt' })
      .setIssuer(this.#issuer)
      .setAudience(this.#audience)
      .setIssuedAt(now)
      .setExpirationTime(now + this.#ttlSeconds)
      .setJti(randomBytes(18).toString('base64url'))
      .encrypt(this.#keys[0]);
  }

  async decode(value: string): Promise<OidcTransaction> {
    if (value.length < 100 || value.length > 4_096) throw new AccountLoginError('unauthenticated');
    for (const key of this.#keys) {
      try {
        const result = await jwtDecrypt(value, key, {
          keyManagementAlgorithms: ['dir'],
          contentEncryptionAlgorithms: ['A256GCM'],
          issuer: this.#issuer,
          audience: this.#audience,
          clockTolerance: 5
        });
        if (result.protectedHeader.typ !== 'wepuu-oidc-transaction+jwt') continue;
        const claims = TransactionClaimsSchema.parse(result.payload);
        if (claims.exp - claims.iat !== this.#ttlSeconds) throw new Error('transaction_lifetime_invalid');
        return {
          codeVerifier: claims.codeVerifier,
          state: claims.state,
          nonce: claims.nonce,
          returnTo: validateReturnPath(claims.returnTo)
        };
      } catch {
        // Try the immediately previous key before failing closed.
      }
    }
    throw new AccountLoginError('unauthenticated');
  }
}

export interface ExternalIdentity {
  readonly issuer: string;
  readonly subject: string;
}

export interface OidcAuthorizationStart {
  readonly authorizationUrl: URL;
  readonly transaction: OidcTransaction;
}

export interface OidcRelyingParty {
  start(returnTo: string): Promise<OidcAuthorizationStart>;
  complete(currentUrl: URL, transaction: OidcTransaction): Promise<ExternalIdentity>;
}

export class OpenIdClientRelyingParty implements OidcRelyingParty {
  readonly #configuration: oidc.Configuration;
  readonly #issuer: string;
  readonly #redirectUri: string;
  readonly #scope: string;

  private constructor(configuration: oidc.Configuration, config: AccountOidcRuntimeConfig) {
    this.#configuration = configuration;
    this.#issuer = config.issuer.href;
    this.#redirectUri = config.redirectUri.href;
    this.#scope = config.scopes;
  }

  static async create(config: AccountOidcRuntimeConfig): Promise<OpenIdClientRelyingParty> {
    const configuration = await oidc.discovery(
      config.issuer,
      config.clientId,
      {
        client_secret: config.clientSecret,
        token_endpoint_auth_method: 'client_secret_basic',
        id_token_signed_response_alg: 'RS256'
      },
      oidc.ClientSecretBasic(config.clientSecret),
      { timeout: 5 }
    );
    configuration.timeout = 5;
    const metadata = configuration.serverMetadata();
    const requiredEndpoints = [metadata.authorization_endpoint, metadata.token_endpoint, metadata.jwks_uri];
    if (metadata.issuer !== config.issuer.href || requiredEndpoints.some((value) => {
      if (value === undefined) return true;
      const endpoint = new URL(value);
      return endpoint.protocol !== 'https:' || endpoint.username !== '' || endpoint.password !== '';
    })) throw new Error('oidc_metadata_invalid');
    if (!metadata.code_challenge_methods_supported?.includes('S256') ||
        !metadata.id_token_signing_alg_values_supported?.includes('RS256') ||
        !metadata.response_types_supported?.includes('code')) {
      throw new Error('oidc_metadata_profile_invalid');
    }
    return new OpenIdClientRelyingParty(configuration, config);
  }

  async start(returnTo: string): Promise<OidcAuthorizationStart> {
    const codeVerifier = oidc.randomPKCECodeVerifier();
    const state = oidc.randomState();
    const nonce = oidc.randomNonce();
    const authorizationUrl = oidc.buildAuthorizationUrl(this.#configuration, {
      response_type: 'code',
      redirect_uri: this.#redirectUri,
      scope: this.#scope,
      code_challenge: await oidc.calculatePKCECodeChallenge(codeVerifier),
      code_challenge_method: 'S256',
      state,
      nonce
    });
    return {
      authorizationUrl,
      transaction: { codeVerifier, state, nonce, returnTo: validateReturnPath(returnTo) }
    };
  }

  async complete(currentUrl: URL, transaction: OidcTransaction): Promise<ExternalIdentity> {
    if (currentUrl.origin + currentUrl.pathname !== this.#redirectUri || currentUrl.hash !== '') {
      throw new AccountLoginError('unauthenticated');
    }
    try {
      const tokens = await oidc.authorizationCodeGrant(this.#configuration, currentUrl, {
        pkceCodeVerifier: transaction.codeVerifier,
        expectedState: transaction.state,
        expectedNonce: transaction.nonce,
        idTokenExpected: true
      }, { redirect_uri: this.#redirectUri });
      const claims = tokens.claims();
      if (claims === undefined || typeof claims.sub !== 'string' || claims.sub.length < 1 || claims.sub.length > 1_024 ||
          claims.iss !== this.#issuer) throw new Error('oidc_claims_invalid');
      return { issuer: this.#issuer, subject: claims.sub };
    } catch (error) {
      if (error instanceof TypeError ||
          (error instanceof oidc.ClientError && ['OAUTH_TIMEOUT', 'OAUTH_ABORT'].includes(error.code ?? '')) ||
          (error instanceof oidc.ResponseBodyError && ['server_error', 'temporarily_unavailable'].includes(error.error))) {
        throw new AccountLoginError('temporarily_unavailable');
      }
      throw new AccountLoginError('unauthenticated');
    }
  }
}

export interface AccountSessionRepository {
  createSession(input: {
    readonly candidateAccountId: string;
    readonly identityIssuer: string;
    readonly identitySubjectHash: string;
    readonly sessionHash: Uint8Array;
    readonly authenticatedAt: Date;
    readonly expiresAt: Date;
  }): Promise<{ readonly accountId: string } | undefined>;
  revoke(sessionHash: Uint8Array): Promise<void>;
}

export type AccountLoginErrorCode = 'invalid_request' | 'unauthenticated' | 'temporarily_unavailable';

export class AccountLoginError extends Error {
  readonly code: AccountLoginErrorCode;

  constructor(code: AccountLoginErrorCode) {
    super(code);
    this.name = 'AccountLoginError';
    this.code = code;
  }
}

export class IdentitySubjectHasher {
  readonly #key: Uint8Array;

  constructor(key: Uint8Array) {
    if (key.byteLength !== 32) throw new Error('identity_hmac_key_invalid');
    this.#key = key;
  }

  hash(issuer: string, subject: string): string {
    if (subject.length < 1 || subject.length > 1_024 || subject.includes('\0')) {
      throw new AccountLoginError('unauthenticated');
    }
    return createHmac('sha256', this.#key).update(issuer, 'utf8').update('\0', 'utf8').update(subject, 'utf8').digest('base64url');
  }
}

export interface AccountLoginStart {
  readonly authorizationUrl: URL;
  readonly transactionCookie: string;
}

export interface AccountLoginCompletion {
  readonly accountId: string;
  readonly sessionToken: string;
  readonly returnTo: string;
  readonly expiresAt: Date;
}

export class AccountLoginService {
  readonly #provider: OidcRelyingParty;
  readonly #codec: OidcTransactionCodec;
  readonly #hasher: IdentitySubjectHasher;
  readonly #sessions: AccountSessionRepository;
  readonly #sessionTtlSeconds: number;
  readonly #now: () => Date;

  constructor(options: {
    readonly provider: OidcRelyingParty;
    readonly codec: OidcTransactionCodec;
    readonly hasher: IdentitySubjectHasher;
    readonly sessions: AccountSessionRepository;
    readonly sessionTtlSeconds?: number;
    readonly now?: () => Date;
  }) {
    this.#provider = options.provider;
    this.#codec = options.codec;
    this.#hasher = options.hasher;
    this.#sessions = options.sessions;
    this.#sessionTtlSeconds = options.sessionTtlSeconds ?? SESSION_TTL_SECONDS;
    this.#now = options.now ?? (() => new Date());
  }

  async start(returnTo?: string): Promise<AccountLoginStart> {
    const start = await this.#provider.start(validateReturnPath(returnTo));
    return {
      authorizationUrl: start.authorizationUrl,
      transactionCookie: await this.#codec.encode(start.transaction)
    };
  }

  async complete(currentUrl: URL, transactionCookie: string): Promise<AccountLoginCompletion> {
    const transaction = await this.#codec.decode(transactionCookie);
    const identity = await this.#provider.complete(currentUrl, transaction);
    const authenticatedAt = this.#now();
    const expiresAt = new Date(authenticatedAt.getTime() + this.#sessionTtlSeconds * 1_000);
    const sessionToken = randomBytes(32).toString('base64url');
    const sessionHash = createHash('sha256').update(sessionToken, 'utf8').digest();
    let account: { readonly accountId: string } | undefined;
    try {
      account = await this.#sessions.createSession({
        candidateAccountId: `account_${randomBytes(18).toString('base64url')}`,
        identityIssuer: identity.issuer,
        identitySubjectHash: this.#hasher.hash(identity.issuer, identity.subject),
        sessionHash,
        authenticatedAt,
        expiresAt
      });
    } catch {
      throw new AccountLoginError('temporarily_unavailable');
    }
    if (account === undefined) throw new AccountLoginError('unauthenticated');
    return { accountId: account.accountId, sessionToken, returnTo: transaction.returnTo, expiresAt };
  }

  async logout(sessionToken: string): Promise<void> {
    if (!/^[A-Za-z0-9_-]{43}$/u.test(sessionToken)) return;
    await this.#sessions.revoke(createHash('sha256').update(sessionToken, 'utf8').digest());
  }
}
