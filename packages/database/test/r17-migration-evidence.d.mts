import type { Pool } from 'pg';
export type QueryClient = Pick<Pool, 'query'>;
export type MigrationProfile = 'candidate' | 'historical14' | 'historical13' | 'legacy';
export interface LedgerEntry { name: string; sha256: string }
export type LedgerStage = 'before' | 'after' | 'post';
export type FixtureFile = 'account-auth-link.test.ts' | 'account-login-transaction.test.ts' | 'account-workspace.test.ts'
  | 'deletion-lifecycle.test.ts' | 'grant-reconsent.test.ts' | 'local-signing-lifecycle.test.ts' | 'migration-profile.test.ts'
  | 'multi-site-provider.test.ts' | 'oauth-client-callback.test.ts' | 'persistent-readonly.test.ts' | 'secret-artifact.test.ts'
  | 'tenant-isolation.test.ts' | 'tenant-provider-http.test.ts' | 'otp-send-budget.test.ts' | 'pairing-diagnostics.test.ts' | 'console-auth.test.ts';
export const fixtureScopes: Readonly<Record<FixtureFile, readonly [MigrationProfile | 'none', number, 'paired' | 'post' | 'none']>>;
export interface FixtureObservation { run: string; file: FixtureFile; profile: MigrationProfile; stage: LedgerStage; databaseSha256: string; migrations: LedgerEntry[]; consoleObjects: boolean; passed: true }
export function expectedLedger(profile: MigrationProfile): Promise<LedgerEntry[]>;
export function verifyLedger(rows: unknown, expected: readonly LedgerEntry[], consoleObjects: unknown, profile: MigrationProfile): void;
export function verifyObservation(value: unknown, expected: readonly LedgerEntry[], run: string, file: FixtureFile): FixtureObservation;
export function verifySet(values: unknown, expected: readonly LedgerEntry[], run: string, file: FixtureFile): FixtureObservation[];
export function recordFixtureLedger(pool: QueryClient, stage: LedgerStage, profile: MigrationProfile, env?: NodeJS.ProcessEnv): Promise<void>;
