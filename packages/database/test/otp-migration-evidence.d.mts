import type { lstat, writeFile } from 'node:fs/promises';
import type { QueryClient, LedgerEntry } from './r17-migration-evidence.mjs';
export interface OtpObservation { run: string; stage: 'before' | 'after'; databaseSha256: string; migrations: LedgerEntry[]; consoleTablesAbsent: true; passed: true }
export function expectedOtpLedger(): Promise<LedgerEntry[]>;
export function verifyOtpLedger(rows: unknown, expected: readonly LedgerEntry[], consoleObjects: unknown): true;
export function verifyObservation(value: unknown, expected: readonly LedgerEntry[], run: string): OtpObservation;
export function verifyObservationSet(values: unknown, expected: readonly LedgerEntry[], run: string): OtpObservation[];
export function recordOtpLedger(pool: QueryClient, stage: 'before' | 'after', options?: { expected?: () => Promise<LedgerEntry[]>; env?: NodeJS.ProcessEnv; inspect?: typeof lstat; uid?: number; save?: typeof writeFile }): Promise<void>;
