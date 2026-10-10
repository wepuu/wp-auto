import { lstat, readFile } from 'node:fs/promises';
import type { IncomingHttpHeaders } from 'node:http';
import { resolve } from 'node:path';
import { betterAuth } from 'better-auth';
import { fromNodeHeaders } from 'better-auth/node';
import { auth0, genericOAuth } from 'better-auth/plugins/generic-oauth';
import { PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import { z } from 'zod';

export const ACCOUNT_AUTH_SESSION_COOKIE = '__Host-wepuu_session';
export const ACCOUNT_AUTH_BASE_PATH = '/api/auth';
export const ACCOUNT_AUTH_SESSION_TTL_SECONDS = 43_200;

const SecretKeyringSchema = z.object({
  secrets: z.array(z.object({
    version: z.number().int().positive(),
    value: z.string().min(32)
  }).strict()).min(1)
}).strict();

export type AccountAuthSecret = Readonly<{ version: number; value: string }>;

export interface TemporaryAuth0ProviderConfig {
  readonly domain: string;
  readonly clientId: string;
  readonly clientSecret: string;
}

export interface CreateAccountAuthOptions {
  readonly databaseUrl: string;
  readonly applicationName: string;
  readonly publicOrigin: string;
  readonly secrets: readonly AccountAuthSecret[];
  readonly temporaryAuth0?: TemporaryAuth0ProviderConfig;
  readonly databaseRole?: 'wepuu_account_auth_writer' | 'wepuu_account_auth_reader';
}

export interface AccountAuthSession {
  readonly userId: string;
  readonly createdAt: Date;
  readonly expiresAt: Date;
}

export interface AccountAuth {
  handle(request: Request): Promise<Response>;
  getSession(headers: Headers): Promise<AccountAuthSession | undefined>;
  startTemporaryAuth0(headers: Headers, callbackURL: string): Promise<Response>;
  signOut(headers: Headers): Promise<Response>;
  close(): Promise<void>;
}

function protectedProviderAccount<T extends Record<string, unknown>>(account: T): T {
  for (const field of ['accessToken', 'refreshToken'] as const) {
    const token = account[field];
    if (typeof token === 'string' && token.length > 0 && !token.startsWith('$ba$')) {
      throw new Error('account_auth_unencrypted_provider_token');
    }
  }
  return { ...account, idToken: null };
}

export function accountAuthSecurityOptions() {
  return {
    session: {
      expiresIn: ACCOUNT_AUTH_SESSION_TTL_SECONDS,
      disableSessionRefresh: true,
      deferSessionRefresh: true,
      cookieCache: { enabled: false }
    },
    account: {
      encryptOAuthTokens: true,
      accountLinking: {
        enabled: true,
        disableImplicitLinking: true,
        allowDifferentEmails: false,
        allowUnlinkingAll: false,
        trustedProviders: []
      }
    },
    verification: { storeIdentifier: 'hashed' as const },
    user: { deleteUser: { enabled: false } },
    databaseHooks: {
      account: {
        create: {
          before(account: Record<string, unknown>) {
            return Promise.resolve({ data: protectedProviderAccount(account) });
          }
        },
        update: {
          before(account: Record<string, unknown>) {
            return Promise.resolve({ data: protectedProviderAccount(account) });
          }
        }
      }
    },
    advanced: {
      useSecureCookies: false,
      defaultCookieAttributes: {
        secure: true,
        httpOnly: true,
        sameSite: 'lax' as const,
        path: '/'
      },
      cookies: {
        session_token: {
          name: ACCOUNT_AUTH_SESSION_COOKIE,
          attributes: {
            secure: true,
            httpOnly: true,
            sameSite: 'lax' as const,
            path: '/'
          }
        }
      }
    }
  };
}

function exactHttpsOrigin(input: string): string {
  const url = new URL(input);
  if (url.protocol !== 'https:' || url.username !== '' || url.password !== ''
    || url.pathname !== '/' || url.search !== '' || url.hash !== '') {
    throw new Error('account_auth_public_origin_invalid');
  }
  return url.origin;
}

function validateSecrets(input: readonly AccountAuthSecret[]): Array<{ version: number; value: string }> {
  const parsed = SecretKeyringSchema.parse({ secrets: input }).secrets;
  const versions = new Set<number>();
  for (const secret of parsed) {
    if (versions.has(secret.version)) throw new Error('account_auth_secret_version_duplicate');
    versions.add(secret.version);
  }
  return parsed.toSorted((left, right) => right.version - left.version);
}

export async function loadAccountAuthSecrets(
  filePath: string,
  options: Readonly<{ production?: boolean; expectedUid?: number }> = {}
): Promise<readonly AccountAuthSecret[]> {
  const absolutePath = resolve(filePath);
  const metadata = await lstat(absolutePath);
  if (!metadata.isFile() || metadata.isSymbolicLink()) throw new Error('account_auth_secret_file_invalid');
  if (options.production === true && process.platform !== 'win32') {
    if ((metadata.mode & 0o077) !== 0) throw new Error('account_auth_secret_file_permissions_invalid');
    if (options.expectedUid !== undefined && metadata.uid !== options.expectedUid) {
      throw new Error('account_auth_secret_file_owner_invalid');
    }
  }
  return validateSecrets(SecretKeyringSchema.parse(JSON.parse(await readFile(absolutePath, 'utf8'))).secrets);
}

function databaseOptions(options: CreateAccountAuthOptions): {
  pool: Pool;
  database: {
    dialect: PostgresDialect;
    type: 'postgres';
    casing: 'camel';
    transaction: true;
    schemaName: 'auth';
  };
} {
  const connectionString = new URL(options.databaseUrl);
  if (options.databaseRole !== undefined) {
    connectionString.searchParams.set('options', `-c role=${options.databaseRole}`);
  }
  const pool = new Pool({
    connectionString: connectionString.href,
    application_name: options.applicationName,
    max: 6,
    statement_timeout: 5_000,
    query_timeout: 6_000,
    idle_in_transaction_session_timeout: 5_000
  });
  return {
    pool,
    database: {
      dialect: new PostgresDialect({ pool }),
      type: 'postgres',
      casing: 'camel',
      transaction: true,
      schemaName: 'auth'
    }
  };
}

export function createAccountAuth(options: CreateAccountAuthOptions): AccountAuth {
  const publicOrigin = exactHttpsOrigin(options.publicOrigin);
  const secrets = validateSecrets(options.secrets);
  const { pool, database } = databaseOptions(options);
  const plugins = options.temporaryAuth0 === undefined ? [] : [genericOAuth({
    config: [{ ...auth0({
      domain: options.temporaryAuth0.domain,
      clientId: options.temporaryAuth0.clientId,
      clientSecret: options.temporaryAuth0.clientSecret,
      tokenEndpointAuth: { method: 'client_secret_basic' },
      scopes: ['openid', 'email', 'profile'],
      pkce: true,
      disableProviderLogout: true
    }), requireIdTokenVerification: true, requireEmailVerification: true }]
  })];
  const auth = betterAuth({
    appName: 'WePuu',
    baseURL: publicOrigin,
    basePath: ACCOUNT_AUTH_BASE_PATH,
    trustedOrigins: [publicOrigin],
    secrets,
    database,
    ...accountAuthSecurityOptions(),
    plugins,
    telemetry: { enabled: false }
  });

  return {
    handle: (request) => auth.handler(request),
    async getSession(headers) {
      const value = await auth.api.getSession({
        headers,
        query: { disableCookieCache: true, disableRefresh: true }
      });
      if (value === null) return undefined;
      return {
        userId: value.user.id,
        createdAt: value.session.createdAt,
        expiresAt: value.session.expiresAt
      };
    },
    async startTemporaryAuth0(headers, callbackURL) {
      if (options.temporaryAuth0 === undefined) throw new Error('account_auth_provider_unavailable');
      return auth.api.signInSocial({
        headers,
        body: { provider: 'auth0', callbackURL },
        asResponse: true
      });
    },
    signOut: (headers) => auth.api.signOut({ headers, asResponse: true }),
    close: () => pool.end()
  };
}

export function accountAuthHeaders(headers: IncomingHttpHeaders): Headers {
  return fromNodeHeaders(headers);
}

export async function accountAuthFromEnvironment(
  environment: NodeJS.ProcessEnv,
  options: Readonly<{
    applicationName: string;
    databaseRole: 'wepuu_account_auth_writer' | 'wepuu_account_auth_reader';
    includeTemporaryAuth0: boolean;
  }>
): Promise<AccountAuth> {
  const databaseUrl = environment['WEPUU_DATABASE_URL'];
  const publicOrigin = environment['WEPUU_CONTROL_PUBLIC_ORIGIN'];
  const secretFile = environment['WEPUU_ACCOUNT_AUTH_SECRETS_FILE'];
  if (databaseUrl === undefined || publicOrigin === undefined || secretFile === undefined) {
    throw new Error('account_auth_environment_incomplete');
  }
  const temporaryAuth0 = options.includeTemporaryAuth0
    ? temporaryAuth0FromEnvironment(environment)
    : undefined;
  return createAccountAuth({
    databaseUrl,
    applicationName: options.applicationName,
    publicOrigin,
    secrets: await loadAccountAuthSecrets(secretFile, {
      production: environment['NODE_ENV'] === 'production',
      ...(process.platform === 'win32' || process.getuid === undefined ? {} : { expectedUid: process.getuid() })
    }),
    databaseRole: options.databaseRole,
    ...(temporaryAuth0 === undefined ? {} : { temporaryAuth0 })
  });
}

function temporaryAuth0FromEnvironment(environment: NodeJS.ProcessEnv): TemporaryAuth0ProviderConfig {
  const issuer = environment['WEPUU_ACCOUNT_OIDC_ISSUER'];
  const clientId = environment['WEPUU_ACCOUNT_OIDC_CLIENT_ID'];
  const clientSecret = environment['WEPUU_ACCOUNT_OIDC_CLIENT_SECRET'];
  if (issuer === undefined || clientId === undefined || clientSecret === undefined) {
    throw new Error('temporary_auth0_environment_incomplete');
  }
  const url = new URL(issuer);
  if (url.protocol !== 'https:' || url.username !== '' || url.password !== '') {
    throw new Error('temporary_auth0_issuer_invalid');
  }
  return { domain: url.host, clientId, clientSecret };
}

// Exported only for the pinned CLI schema-generation entry point.
export function createAccountAuthSchemaDefinition(databaseUrl: string) {
  return createAccountAuth({
    databaseUrl,
    applicationName: 'wepuu-account-auth-schema',
    publicOrigin: 'https://schema.invalid',
    secrets: [{ version: 1, value: 'schema-generation-only-secret-value-0000000000000000' }]
  });
}
