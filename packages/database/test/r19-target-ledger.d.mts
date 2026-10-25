import type { lstat, readFile, readdir } from 'node:fs/promises';
import type { QueryClient, LedgerEntry } from './r17-migration-evidence.mjs';
export interface TargetObservation { run: string; stage: 'before' | 'after'; databaseSha256: string; migrations: LedgerEntry[]; consoleObjects: false; passed: true }
export function verifyTargetObservation(value: unknown, expected: readonly LedgerEntry[], run: string, databaseSha256: string): TargetObservation;
export function verifyTargetPair(values: unknown, expected: readonly LedgerEntry[], run: string, databaseSha256: string): TargetObservation[];
export function recordTargetLedger(pool: QueryClient, stage: 'before' | 'after', env?: NodeJS.ProcessEnv): Promise<void>;
export function closeAfterLedger(pool: QueryClient, close: () => Promise<unknown>, observe?: typeof recordTargetLedger): Promise<void>;
export function readTargetLedgers(run: string, db: string, io?: { inspect?: typeof lstat; uid?: number; list?: typeof readdir; read?: typeof readFile }): Promise<{ status: 'COMPLETE' | 'NOT_CONFIRMED'; observations: TargetObservation[] }>;
