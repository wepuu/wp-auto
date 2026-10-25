import type { lstat, readFile, readdir, writeFile } from 'node:fs/promises';
export const stages: readonly ['SETUP', 'MIGRATION', 'FIXTURE_RESET', 'CLIENT_PROVISION', 'IDENTITY_BINDING', 'FIRST_GRANT_BEGIN', 'FIRST_GRANT_ACTIVATE', 'REFRESH_SETUP', 'R0_ISSUE', 'R0_CONSUME', 'R1_ISSUE', 'REPLAY_AND_REVOCATION', 'FIRST_GRANT_ASSERTIONS', 'SECOND_GRANT_BEGIN', 'SECOND_GRANT_ACTIVATE', 'SECOND_GRANT_ASSERTIONS', 'SECOND_REFRESH_ISSUE', 'SECOND_REFRESH_CONSUME', 'EXPLICIT_REVOCATION', 'SECOND_REVOCATION_ASSERTIONS', 'CLIENT_SUSPEND', 'CLIENT_CONFLICT', 'CLIENT_REPROVISION'];
export type DiagnosticStage = typeof stages[number];
export type ErrorCategory = 'ASSERTION_FAILED' | 'OAUTH_INVALID_GRANT' | 'MODULE_LOAD_FAILED' | 'ACCESS_DENIED' | 'TIMEOUT' | 'POSTGRES_ERROR' | 'NOT_CONFIRMED';
export interface SafeError { category: ErrorCategory; sqlstate?: string; cause?: { category: ErrorCategory; sqlstate?: string } }
export interface DiagnosticReport { schemaVersion: 1; run: string; file: 'packages/database/test/grant-reconsent.test.ts'; channel: 'main' | 'cleanup'; status: 'PASS' | 'FAIL'; stage: DiagnosticStage | 'CLEANUP'; completedStages: DiagnosticStage[]; ledgerStatus: 'NOT_CONFIRMED'; elapsedMs: number; evidenceSaveFailed: boolean; error?: SafeError }
export interface DiagnosticControl { checkpoint(stage: DiagnosticStage): void; main<T>(fn: () => T): T | Promise<Awaited<T>>; cleanup<T>(fn: () => T): T | Promise<Awaited<T>> }
export function safeError(error: unknown): SafeError;
export function validateDiagnostic(value: unknown): DiagnosticReport;
export function saveDiagnostic(value: DiagnosticReport, io?: { inspect?: typeof lstat; uid?: number; write?: typeof writeFile }): Promise<void>;
export function reconcileDiagnostics(values: unknown[], run: string): { run: string; diagnosticCoverage: 'COMPLETE' | 'NOT_CONFIRMED'; mainStatus: 'PASS' | 'FAIL' | 'NOT_OBSERVED'; cleanupStatus: 'PASS' | 'FAIL' | 'NOT_OBSERVED'; primaryFailure: { stage: DiagnosticStage | 'CLEANUP'; error: SafeError | undefined } | null; cleanupFailure: { stage: 'CLEANUP'; error: SafeError | undefined } | null; testVerdict: 'NOT_CONFIRMED'; ledgerStatus: 'NOT_CONFIRMED' };
export function readDiagnostics(run: string, io?: { inspect?: typeof lstat; uid?: number; list?: typeof readdir; read?: typeof readFile }): Promise<
  | ({ readStatus: 'VALID' } & ReturnType<typeof reconcileDiagnostics>)
  | { readStatus: 'MISSING' | 'ACCESS_DENIED' | 'NOT_CONFIRMED'; diagnosticCoverage: 'NOT_CONFIRMED'; testVerdict: 'NOT_CONFIRMED'; ledgerStatus: 'NOT_CONFIRMED' }
>;
export function createDiagnostic(options: { run: string; save: (value: DiagnosticReport) => Promise<void>; clock?: () => number }): DiagnosticControl & { snapshot(): Partial<Record<'main' | 'cleanup', DiagnosticReport>> };
export function reconsentDiagnostic(env?: NodeJS.ProcessEnv): DiagnosticControl;
