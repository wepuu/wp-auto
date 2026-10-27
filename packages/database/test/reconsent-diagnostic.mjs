/**
 * @typedef {object & { run?: unknown; file?: unknown; profile?: unknown; stage?: unknown; databaseSha256?: unknown; migrations?: unknown; consoleObjects?: unknown; consoleTablesAbsent?: unknown; passed?: unknown; schemaVersion?: unknown; channel?: unknown; status?: unknown; completedStages?: unknown; ledgerStatus?: unknown; elapsedMs?: unknown; evidenceSaveFailed?: unknown; error?: unknown; category?: unknown; sqlstate?: unknown; cause?: unknown }} RawRecord
 * @typedef {import('./r17-migration-evidence.mjs').LedgerEntry} LedgerEntry
 * @typedef {{query(config: string | (import('pg').QueryConfig & {query_timeout: number})): Promise<{rows: unknown[]}>}} QueryClient
 * @typedef {import('./reconsent-diagnostic.mjs').SafeError} SafeError
 * @typedef {import('./reconsent-diagnostic.mjs').DiagnosticReport} Report
 * @typedef {import('./reconsent-diagnostic.mjs').DiagnosticStage} Stage
 */
// Opt-in test-only diagnostics. No application imports, DB access, raw errors or logs.
import { lstat, writeFile, readFile, readdir } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
/**
 * @type {typeof import('./reconsent-diagnostic.mjs').stages}
 */
export const stages = Object.freeze(['SETUP', 'MIGRATION', 'FIXTURE_RESET', 'CLIENT_PROVISION', 'IDENTITY_BINDING',
  'FIRST_GRANT_BEGIN', 'FIRST_GRANT_ACTIVATE', 'REFRESH_SETUP', 'R0_ISSUE', 'R0_CONSUME', 'R1_ISSUE',
  'REPLAY_AND_REVOCATION', 'FIRST_GRANT_ASSERTIONS', 'SECOND_GRANT_BEGIN', 'SECOND_GRANT_ACTIVATE',
  'SECOND_GRANT_ASSERTIONS', 'SECOND_REFRESH_ISSUE', 'SECOND_REFRESH_CONSUME', 'EXPLICIT_REVOCATION',
  'SECOND_REVOCATION_ASSERTIONS', 'CLIENT_SUSPEND', 'CLIENT_CONFLICT', 'CLIENT_REPROVISION']);
/**
 * @type {Set<unknown>}
 */
const sqlstates = new Set(['42501', 'P0001', '23502', '23503', '23505', '23514', '42P01', '42883', '55P03', '57014']);
/**
 * @type {Set<unknown>}
 */
const categories = new Set(['ASSERTION_FAILED', 'OAUTH_INVALID_GRANT', 'MODULE_LOAD_FAILED', 'ACCESS_DENIED', 'TIMEOUT', 'POSTGRES_ERROR', 'NOT_CONFIRMED']);
/**
 * @param {string} code
 * @returns {never}
 */
const denied = code => { throw Object.assign(Error(code), { code }); };
/**
 * @param {unknown} value
 * @param {string} key
 * @returns {unknown}
 */
function own(value, key) {
  // Never invoke accessors, enumerate error fields, inspect messages or walk prototypes.
  try { return value && typeof value === 'object' ? Object.getOwnPropertyDescriptor(value, key)?.value : undefined; }
  catch { return undefined; }
}
/**
 * @param {unknown} error
 * @returns {SafeError}
 */
function classify(error) {
  const code = own(error, 'code');
  if (sqlstates.has(code)) return /** @type {SafeError} */ ({ category: 'POSTGRES_ERROR', sqlstate: code });
  if (code === 'ERR_ASSERTION') return { category: 'ASSERTION_FAILED' };
  if (/** @type {readonly unknown[]} */ (['ERR_MODULE_NOT_FOUND', 'ERR_UNKNOWN_FILE_EXTENSION']).includes(code)) return { category: 'MODULE_LOAD_FAILED' };
  if (/** @type {readonly unknown[]} */ (['EACCES', 'EPERM']).includes(code)) return { category: 'ACCESS_DENIED' };
  if (/** @type {readonly unknown[]} */ (['ETIMEDOUT', 'ERR_TEST_TIMEOUT']).includes(code)) return { category: 'TIMEOUT' };
  if (own(error, 'error') === 'invalid_grant') return { category: 'OAUTH_INVALID_GRANT' };
  return { category: 'NOT_CONFIRMED' };
}
/**
 * @param {unknown} error
 * @returns {SafeError}
 */
export function safeError(error) {
  const out = classify(error), cause = own(error, 'cause');
  if (cause !== undefined) out.cause = classify(cause); // One level only; no recursion.
  return out;
}
/**
 * @param {unknown} value
 * @param {readonly string[]} names
 * @returns {boolean}
 */
function keys(value, names) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).every(k => names.includes(k));
}
/**
 * @param {RawRecord} value
 * @returns {Report}
 */
export function validateDiagnostic(value) {
  const required = ['schemaVersion', 'run', 'file', 'channel', 'status', 'stage', 'completedStages', 'ledgerStatus', 'elapsedMs', 'evidenceSaveFailed'];
  if (!keys(value, [...required, 'error']) || required.some(k => !(k in value)) || value.schemaVersion !== 1
    || !/** @type {RegExp & {test(value: unknown): boolean}} */ (/^r18-[0-9]{1,24}$/u).test(value.run) || value.file !== 'packages/database/test/grant-reconsent.test.ts'
    || !/** @type {readonly unknown[]} */ (['main', 'cleanup']).includes(value.channel) || !/** @type {readonly unknown[]} */ (['PASS', 'FAIL']).includes(value.status)
    || value.ledgerStatus !== 'NOT_CONFIRMED' || typeof value.evidenceSaveFailed !== 'boolean'
    || !Number.isSafeInteger(value.elapsedMs) || /** @type {number} */ (value.elapsedMs) < 0 || !Array.isArray(value.completedStages)) denied('R18_DIAGNOSTIC_SCHEMA_DENIED');
  const complete = /** @type {unknown[]} */ (value.completedStages);
  if (value.channel === 'cleanup') {
    if (value.stage !== 'CLEANUP' || complete.length !== 0) denied('R18_DIAGNOSTIC_SCHEMA_DENIED');
  } else if (JSON.stringify(complete) !== JSON.stringify(stages.slice(0, complete.length))
    || (value.status === 'PASS' ? complete.length !== stages.length || value.stage !== stages.at(-1)
      : complete.length >= stages.length || value.stage !== stages[complete.length])) denied('R18_DIAGNOSTIC_SCHEMA_DENIED');
  let error;
  if (value.status === 'FAIL') {
    const project = /** @param {RawRecord} e @returns {SafeError} */ e => {
      if (!keys(e, ['category', 'sqlstate']) || !categories.has(e.category)
        || (e.category === 'POSTGRES_ERROR' ? !sqlstates.has(e.sqlstate) : e.sqlstate !== undefined)) denied('R18_DIAGNOSTIC_SCHEMA_DENIED');
      return /** @type {SafeError} */ ({ category: e.category, ...(e.sqlstate === undefined ? {} : { sqlstate: e.sqlstate }) });
    };
    if (!keys(value.error, ['category', 'sqlstate', 'cause'])) denied('R18_DIAGNOSTIC_SCHEMA_DENIED');
    const { cause, ...primary } = /** @type {RawRecord} */ (value.error);
    error = { ...project(primary), ...(cause === undefined ? {} : { cause: project(/** @type {RawRecord} */ (cause)) }) };
  } else if (value.error !== undefined) denied('R18_DIAGNOSTIC_SCHEMA_DENIED');
  return /** @type {Report} */ ({ schemaVersion: 1, run: value.run, file: value.file, channel: value.channel, status: value.status,
    stage: value.stage, completedStages: [...complete], ledgerStatus: 'NOT_CONFIRMED', elapsedMs: value.elapsedMs,
    evidenceSaveFailed: value.evidenceSaveFailed, ...(error ? { error } : {}) });
}
/**
 * @param {Report} value
 * @param {NonNullable<Parameters<typeof import('./reconsent-diagnostic.mjs').saveDiagnostic>[1]>} io
 */
export async function saveDiagnostic(value, io = {}) {
  const report = validateDiagnostic(value), root = '/evidence/r18';
  const inspect = io.inspect ?? lstat, uid = io.uid ?? /** @type {() => number} */ (process.getuid)();
  for (const path of ['/evidence', root]) {
    const s = await inspect(path);
    if (!s.isDirectory() || s.isSymbolicLink() || s.uid !== uid || (s.mode & 0o077)) denied('R18_DIAGNOSTIC_DIRECTORY_DENIED');
  }
  await (io.write ?? writeFile)(root + '/' + report.channel + '.json', JSON.stringify(report) + '\n', { flag: 'wx', mode: 0o600 });
}
/**
 * @param {RawRecord[]} values
 * @param {string | null | undefined} run
 */
export function reconcileDiagnostics(values, run) {
  if (!/** @type {RegExp & {test(value: unknown): boolean}} */ (/^r18-[0-9]{1,24}$/u).test(run ?? '') || !Array.isArray(values) || values.length > 2) denied('R18_DIAGNOSTIC_SCHEMA_DENIED');
  const records = /** @type {Partial<Record<'main' | 'cleanup', Report>>} */ ({});
  for (const value of values) {
    const checked = validateDiagnostic(value);
    if (checked.run !== run || records[checked.channel]) denied('R18_DIAGNOSTIC_SCHEMA_DENIED');
    records[checked.channel] = checked;
  }
  const main = records.main, cleanup = records.cleanup;
  return { run, diagnosticCoverage: main && cleanup && !main.evidenceSaveFailed && !cleanup.evidenceSaveFailed ? 'COMPLETE' : 'NOT_CONFIRMED',
    mainStatus: main?.status ?? 'NOT_OBSERVED', cleanupStatus: cleanup?.status ?? 'NOT_OBSERVED',
    primaryFailure: main?.status === 'FAIL' ? { stage: main.stage, error: main.error } : null,
    cleanupFailure: cleanup?.status === 'FAIL' ? { stage: 'CLEANUP', error: cleanup.error } : null,
    // This companion evidence never overrides the original test process/report verdict.
    testVerdict: 'NOT_CONFIRMED', ledgerStatus: 'NOT_CONFIRMED' };
}
/**
 * @param {string} run
 * @param {NonNullable<Parameters<typeof import('./reconsent-diagnostic.mjs').readDiagnostics>[1]>} io
 */
export async function readDiagnostics(run, io = {}) {
  const root = '/evidence/r18';
  try {
    const inspect = io.inspect ?? lstat, uid = io.uid ?? /** @type {() => number} */ (process.getuid)();
    for (const path of ['/evidence', root]) {
      const s = await inspect(path);
      if (!s.isDirectory() || s.isSymbolicLink() || s.uid !== uid || (s.mode & 0o077)) denied('R18_DIAGNOSTIC_DIRECTORY_DENIED');
    }
    const names = await (io.list ?? readdir)(root);
    if (!Array.isArray(names) || names.length > 2 || new Set(names).size !== names.length || names.some(n => !/** @type {readonly unknown[]} */ (['main.json', 'cleanup.json']).includes(n))) denied('R18_DIAGNOSTIC_SCHEMA_DENIED');
    const values = /** @type {Report[]} */ ([]);
    for (const name of names) {
      const path = root + '/' + name, s = await inspect(path);
      if (!s.isFile() || s.isSymbolicLink() || s.uid !== uid || (s.mode & 0o077) || s.size > 16384) denied('R18_DIAGNOSTIC_DIRECTORY_DENIED');
      const bytes = await (io.read ?? readFile)(path);
      if (!Buffer.isBuffer(bytes) || bytes.length > 16384) denied('R18_DIAGNOSTIC_SCHEMA_DENIED');
      const value = validateDiagnostic(/** @type {RawRecord} */ (/** @type {(text: string) => unknown} */ (JSON.parse)(bytes.toString('utf8'))));
      if (value.channel + '.json' !== name) denied('R18_DIAGNOSTIC_SCHEMA_DENIED');
      values.push(value);
    }
    return { readStatus: 'VALID', ...reconcileDiagnostics(values, run) };
  } catch (error) {
    return { readStatus: own(error, 'code') === 'ENOENT' ? 'MISSING' : /** @type {readonly unknown[]} */ (['EACCES', 'EPERM']).includes(own(error, 'code')) ? 'ACCESS_DENIED' : 'NOT_CONFIRMED',
      diagnosticCoverage: 'NOT_CONFIRMED', testVerdict: 'NOT_CONFIRMED', ledgerStatus: 'NOT_CONFIRMED' };
  }
}
/**
 * @param {Omit<Parameters<typeof import('./reconsent-diagnostic.mjs').createDiagnostic>[0], 'run'> & {run: string | null | undefined}} options
 */
export function createDiagnostic({ run, save, clock = () => performance.now() }) {
  if (!/** @type {RegExp & {test(value: unknown): boolean}} */ (/^r18-[0-9]{1,24}$/u).test(run ?? '') || typeof save !== 'function') denied('R18_DIAGNOSTIC_CONTEXT_DENIED');
  const records = /** @type {Partial<Record<'main' | 'cleanup', Report>>} */ ({}), claimed = /** @type {Set<'main' | 'cleanup'>} */ (new Set()), started = clock(); let index = 0, active = false, settled = false;
/**
 * @template T
 * @param {'main' | 'cleanup'} channel
 * @param {() => T} fn
 * @returns {Promise<Awaited<T>>}
 */
  async function execute(channel, fn) {
    if (claimed.has(channel) || channel === 'main' && (active || settled) || channel === 'cleanup' && !settled) denied('R18_DIAGNOSTIC_SEQUENCE_DENIED');
    claimed.add(channel);
    if (channel === 'main') active = true;
    let value, error, failed = false;
    try {
      value = await fn();
      if (channel === 'main' && index !== stages.length - 1) denied('R18_DIAGNOSTIC_SEQUENCE_DENIED');
    } catch (e) { error = e; failed = true; }
    if (channel === 'main') { active = false; settled = true; }
    const report = { schemaVersion: 1, run, file: 'packages/database/test/grant-reconsent.test.ts', channel,
      status: failed ? 'FAIL' : 'PASS', stage: channel === 'main' ? stages[index] : 'CLEANUP',
      completedStages: channel === 'cleanup' ? [] : stages.slice(0, failed ? index : stages.length), ledgerStatus: 'NOT_CONFIRMED',
      elapsedMs: Math.max(0, Math.ceil(clock() - started)), evidenceSaveFailed: false, ...(failed ? { error: safeError(error) } : {}) };
    records[channel] = validateDiagnostic(report);
    try { await save(records[channel]); } catch { records[channel].evidenceSaveFailed = true; }
    // A reporting failure must not replace the original test/cleanup error.
    if (failed) throw error;
    if (records[channel].evidenceSaveFailed) denied('R18_DIAGNOSTIC_SAVE_FAILED');
    return /** @type {Awaited<T>} */ (value);
  }
  return Object.freeze({
    /** @param {Stage} stage */
    checkpoint(stage) {
      if (!active || stage !== stages[index + 1]) denied('R18_DIAGNOSTIC_SEQUENCE_DENIED');
      index++;
    },
    main: /** @template T @param {() => T} fn */ fn => execute('main', fn), cleanup: /** @template T @param {() => T} fn */ fn => execute('cleanup', fn),
    snapshot: () => structuredClone(records)
  });
}
/**
 * @param {NodeJS.ProcessEnv & {WEPUU_R18_RUN_ID?: string; WEPUU_R18_DIAGNOSTIC_ROOT?: string}} env
 */
export function reconsentDiagnostic(env = process.env) {
  if (env.WEPUU_R18_RUN_ID === undefined && env.WEPUU_R18_DIAGNOSTIC_ROOT === undefined) {
    return Object.freeze({ checkpoint() {}, main: /** @template T @param {() => T} fn */ fn => fn(), cleanup: /** @template T @param {() => T} fn */ fn => fn() });
  }
  if (env.WEPUU_R18_DIAGNOSTIC_ROOT !== '/evidence/r18') denied('R18_DIAGNOSTIC_CONTEXT_DENIED');
  return createDiagnostic({ run: /** @type {string} */ (env.WEPUU_R18_RUN_ID), save: saveDiagnostic });
}
