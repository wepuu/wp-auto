import { lstat, readFile } from 'node:fs/promises';
import type { IncomingHttpHeaders } from 'node:http';
import { resolve } from 'node:path';
import { betterAuth } from 'better-auth';
import { fromNodeHeaders } from 'better-auth/node';
import { emailOTP } from 'better-auth/plugins';
import { PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import { Resend } from 'resend';
import { z } from 'zod';

export const ACCOUNT_AUTH_SESSION_COOKIE = '__Host-wepuu_session';
export const ACCOUNT_AUTH_BASE_PATH = '/api/auth';
export const ACCOUNT_AUTH_SESSION_TTL_SECONDS = 43_200;
export const ACCOUNT_AUTH_CLIENT_IP_HEADER = 'x-wepuu-client-ip';
export const ACCOUNT_AUTH_DELIVERY_ID_HEADER = 'x-wepuu-delivery-id';

const SecretKeyringSchema = z.object({
  secrets: z.array(z.object({
    version: z.number().int().positive(),
    value: z.string().min(32)
  }).strict()).min(1)
}).strict();
const EmailSchema = z.email().max(254);
const DeliveryIdSchema = z.string().regex(/^[A-Za-z0-9_-]{16,128}$/u);
const DeliveryModeSchema = z.enum(['mock', 'resend']);

export type AccountAuthSecret = Readonly<{ version: number; value: string }>;
export type OtpDeliveryOutcome = 'accepted' | 'rejected' | 'unknown';

function validatedSender(input: string): string {
  if (input.length > 320 || /[\r\n]/u.test(input)) throw new Error('resend_sender_invalid');
  const bracketed = /^(?:[^<>]+\s)?<([^<>]+)>$/u.exec(input.trim());
  EmailSchema.parse(bracketed?.[1] ?? input.trim());
  return input.trim();
}

export interface OtpEmailSender {
  send(input: Readonly<{ email: string; otp: string }>): Promise<OtpDeliveryOutcome>;
}

export class MockOtpEmailSender implements OtpEmailSender {
  readonly #send: (input: Readonly<{ email: string; otp: string }>) => Promise<OtpDeliveryOutcome>;

  constructor(send: (input: Readonly<{ email: string; otp: string }>) => Promise<OtpDeliveryOutcome>
    = () => Promise.resolve('accepted')) {
    this.#send = send;
  }

  send(input: Readonly<{ email: string; otp: string }>): Promise<OtpDeliveryOutcome> {
    return this.#send(input);
  }
}

export class ResendOtpEmailSender implements OtpEmailSender {
  readonly #resend: Resend;
  readonly #from: string;
  readonly #replyTo: string | undefined;

  constructor(options: Readonly<{ apiKey: string; from: string; replyTo?: string }>) {
    if (options.apiKey.length < 16) throw new Error('resend_api_key_invalid');
    this.#resend = new Resend(options.apiKey);
    this.#from = validatedSender(options.from);
    this.#replyTo = options.replyTo === undefined ? undefined : EmailSchema.parse(options.replyTo);
  }

  async send(input: Readonly<{ email: string; otp: string }>): Promise<OtpDeliveryOutcome> {
    try {
      const result = await this.#resend.emails.send({
        from: this.#from,
        to: [EmailSchema.parse(input.email)],
        subject: 'Your WePuu verification code',
        text: `Your WePuu verification code is ${input.otp}. It expires in 5 minutes. If you did not request this code, you can ignore this email.`,
        html: `<div style="font-family:system-ui,sans-serif;color:#17242e"><h1>Verify your email</h1><p>Use this code to sign in to WePuu:</p><p style="font-size:32px;font-weight:700;letter-spacing:8px">${input.otp}</p><p>This code expires in 5 minutes. If you did not request it, you can ignore this email.</p></div>`,
        ...(this.#replyTo === undefined ? {} : { replyTo: this.#replyTo })
      }, { signal: AbortSignal.timeout(5_000) });
      if (result.error !== null) return 'rejected';
      return result.data.id === '' ? 'unknown' : 'accepted';
    } catch {
      // A timeout or transport failure cannot establish whether Resend accepted the request.
      return 'unknown';
    }
  }
}

export interface AccountAuthRateLimitConfig {
  readonly sendWindowSeconds: number;
  readonly sendMax: number;
  readonly verifyWindowSeconds: number;
  readonly verifyMax: number;
}

export interface CreateAccountAuthOptions {
  readonly databaseUrl: string;
  readonly applicationName: string;
  readonly publicOrigin: string;
  readonly secrets: readonly AccountAuthSecret[];
  readonly emailSender: OtpEmailSender;
  readonly rateLimit?: AccountAuthRateLimitConfig;
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
  takeDeliveryOutcome(deliveryId: string): OtpDeliveryOutcome | undefined;
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

export function normalizeAccountEmail(input: string): string {
  return EmailSchema.parse(input.trim().normalize('NFC').toLowerCase());
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

async function loadProtectedFile(
  filePath: string,
  options: Readonly<{ production?: boolean; expectedUid?: number }> = {}
): Promise<string> {
  const absolutePath = resolve(filePath);
  const metadata = await lstat(absolutePath);
  if (!metadata.isFile() || metadata.isSymbolicLink()) throw new Error('account_auth_secret_file_invalid');
  if (options.production === true && process.platform !== 'win32') {
    if ((metadata.mode & 0o077) !== 0) throw new Error('account_auth_secret_file_permissions_invalid');
    if (options.expectedUid !== undefined && metadata.uid !== options.expectedUid) {
      throw new Error('account_auth_secret_file_owner_invalid');
    }
  }
  return readFile(absolutePath, 'utf8');
}

export async function loadAccountAuthSecrets(
  filePath: string,
  options: Readonly<{ production?: boolean; expectedUid?: number }> = {}
): Promise<readonly AccountAuthSecret[]> {
  return validateSecrets(SecretKeyringSchema.parse(JSON.parse(await loadProtectedFile(filePath, options))).secrets);
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

const defaultRateLimit: AccountAuthRateLimitConfig = {
  sendWindowSeconds: 60,
  sendMax: 1,
  verifyWindowSeconds: 300,
  verifyMax: 5
};

export function createAccountAuth(options: CreateAccountAuthOptions): AccountAuth {
  const publicOrigin = exactHttpsOrigin(options.publicOrigin);
  const secrets = validateSecrets(options.secrets);
  const limits = options.rateLimit ?? defaultRateLimit;
  const { pool, database } = databaseOptions(options);
  const deliveryOutcomes = new Map<string, { outcome: OtpDeliveryOutcome; expiresAt: number }>();
  const security = accountAuthSecurityOptions();
  const auth = betterAuth({
    appName: 'WePuu',
    baseURL: publicOrigin,
    basePath: ACCOUNT_AUTH_BASE_PATH,
    trustedOrigins: [publicOrigin],
    secrets,
    database,
    ...security,
    advanced: {
      ...security.advanced,
      ipAddress: { ipAddressHeaders: [ACCOUNT_AUTH_CLIENT_IP_HEADER] }
    },
    rateLimit: {
      enabled: true,
      storage: 'database',
      customRules: {
        '/email-otp/send-verification-otp': { window: limits.sendWindowSeconds, max: limits.sendMax },
        '/sign-in/email-otp': { window: limits.verifyWindowSeconds, max: limits.verifyMax }
      }
    },
    plugins: [emailOTP({
      otpLength: 6,
      expiresIn: 300,
      allowedAttempts: 5,
      storeOTP: 'hashed',
      resendStrategy: 'rotate',
      disableSignUp: false,
      rateLimit: { window: limits.verifyWindowSeconds, max: limits.verifyMax },
      async sendVerificationOTP({ email, otp, type }, context) {
        if (type !== 'sign-in') throw new Error('otp_delivery_type_invalid');
        const deliveryId = context?.request?.headers.get(ACCOUNT_AUTH_DELIVERY_ID_HEADER);
        if (deliveryId === null || deliveryId === undefined || !DeliveryIdSchema.safeParse(deliveryId).success) {
          throw new Error('otp_delivery_context_missing');
        }
        const outcome = await options.emailSender.send({ email, otp });
        const now = Date.now();
        for (const [key, value] of deliveryOutcomes) {
          if (value.expiresAt <= now) deliveryOutcomes.delete(key);
        }
        deliveryOutcomes.set(deliveryId, { outcome, expiresAt: now + 60_000 });
        if (outcome === 'rejected') throw new Error('otp_delivery_rejected');
      }
    })],
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
    takeDeliveryOutcome(deliveryId) {
      const value = deliveryOutcomes.get(deliveryId);
      deliveryOutcomes.delete(deliveryId);
      return value?.outcome;
    },
    signOut: (headers) => auth.api.signOut({ headers, asResponse: true }),
    close: () => pool.end()
  };
}

export function accountAuthHeaders(headers: IncomingHttpHeaders): Headers {
  return fromNodeHeaders(headers);
}

function boundedInteger(environment: NodeJS.ProcessEnv, name: string, fallback: number, minimum: number, maximum: number): number {
  const value = environment[name];
  if (value === undefined || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) throw new Error(`${name}_invalid`);
  return parsed;
}

export async function accountAuthFromEnvironment(
  environment: NodeJS.ProcessEnv,
  options: Readonly<{
    applicationName: string;
    databaseRole: 'wepuu_account_auth_writer' | 'wepuu_account_auth_reader';
  }>
): Promise<AccountAuth> {
  const databaseUrl = environment['WEPUU_DATABASE_URL'];
  const publicOrigin = environment['WEPUU_CONTROL_PUBLIC_ORIGIN'];
  const secretFile = environment['WEPUU_ACCOUNT_AUTH_SECRETS_FILE'];
  if (databaseUrl === undefined || publicOrigin === undefined || secretFile === undefined) {
    throw new Error('account_auth_environment_incomplete');
  }
  const production = environment['NODE_ENV'] === 'production';
  const fileOptions = {
    production,
    ...(process.platform === 'win32' || process.getuid === undefined ? {} : { expectedUid: process.getuid() })
  };
  const deliveryMode = DeliveryModeSchema.parse(environment['WEPUU_EMAIL_DELIVERY'] ?? 'mock');
  if (production && options.databaseRole === 'wepuu_account_auth_writer' && deliveryMode !== 'resend') {
    throw new Error('production_email_delivery_required');
  }
  let emailSender: OtpEmailSender;
  if (deliveryMode === 'resend' && options.databaseRole === 'wepuu_account_auth_writer') {
    const apiKeyFile = environment['WEPUU_RESEND_API_KEY_FILE'];
    const from = environment['WEPUU_RESEND_FROM'];
    if (apiKeyFile === undefined || from === undefined) throw new Error('resend_environment_incomplete');
    const apiKey = (await loadProtectedFile(apiKeyFile, fileOptions)).trim();
    emailSender = new ResendOtpEmailSender({
      apiKey,
      from,
      ...(environment['WEPUU_RESEND_REPLY_TO'] === undefined || environment['WEPUU_RESEND_REPLY_TO'] === ''
        ? {} : { replyTo: environment['WEPUU_RESEND_REPLY_TO'] })
    });
  } else {
    emailSender = new MockOtpEmailSender();
  }
  return createAccountAuth({
    databaseUrl,
    applicationName: options.applicationName,
    publicOrigin,
    secrets: await loadAccountAuthSecrets(secretFile, fileOptions),
    databaseRole: options.databaseRole,
    emailSender,
    rateLimit: {
      sendWindowSeconds: boundedInteger(environment, 'WEPUU_EMAIL_OTP_SEND_WINDOW_SECONDS', 60, 10, 3_600),
      sendMax: boundedInteger(environment, 'WEPUU_EMAIL_OTP_SEND_MAX', 1, 1, 10),
      verifyWindowSeconds: boundedInteger(environment, 'WEPUU_EMAIL_OTP_VERIFY_WINDOW_SECONDS', 300, 10, 3_600),
      verifyMax: boundedInteger(environment, 'WEPUU_EMAIL_OTP_VERIFY_MAX', 5, 1, 20)
    }
  });
}

// Exported only for the pinned CLI schema-generation entry point.
export function createAccountAuthSchemaDefinition(databaseUrl: string) {
  return createAccountAuth({
    databaseUrl,
    applicationName: 'wepuu-account-auth-schema',
    publicOrigin: 'https://schema.invalid',
    secrets: [{ version: 1, value: 'schema-generation-only-secret-value-0000000000000000' }],
    emailSender: new MockOtpEmailSender()
  });
}
