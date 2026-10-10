import { betterAuth } from 'better-auth';
import { PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import { ACCOUNT_AUTH_CLIENT_IP_HEADER, accountAuthSecurityOptions } from './index.js';
import { emailOTP } from 'better-auth/plugins';

// Pinned Better Auth CLI input. Runtime migrations are deliberately disabled;
// generated SQL is reviewed and committed through wepuu_schema_migrations.
const pool = new Pool({
  connectionString: process.env['WEPUU_SCHEMA_DATABASE_URL']
    ?? 'postgresql://schema:unused@127.0.0.1:5432/schema'
});

export const auth = betterAuth({
  appName: 'WePuu',
  baseURL: 'https://schema.invalid',
  basePath: '/api/auth',
  trustedOrigins: ['https://schema.invalid'],
  secrets: [{ version: 1, value: 'schema-generation-only-secret-value-0000000000000000' }],
  database: {
    dialect: new PostgresDialect({ pool }),
    type: 'postgres',
    casing: 'camel',
    transaction: true,
    schemaName: 'auth'
  },
  ...accountAuthSecurityOptions(),
  advanced: {
    ...accountAuthSecurityOptions().advanced,
    ipAddress: { ipAddressHeaders: [ACCOUNT_AUTH_CLIENT_IP_HEADER] }
  },
  rateLimit: {
    enabled: true,
    storage: 'database',
    customRules: {
      '/email-otp/send-verification-otp': { window: 60, max: 1 },
      '/sign-in/email-otp': { window: 300, max: 5 }
    }
  },
  plugins: [emailOTP({
    otpLength: 6,
    expiresIn: 300,
    allowedAttempts: 5,
    storeOTP: 'hashed',
    resendStrategy: 'rotate',
    disableSignUp: false,
    rateLimit: { window: 300, max: 5 },
    sendVerificationOTP: () => Promise.resolve()
  })],
  telemetry: { enabled: false }
});
