/**
 * @typedef {object & { run?: unknown; file?: unknown; profile?: unknown; stage?: unknown; databaseSha256?: unknown; migrations?: unknown; consoleObjects?: unknown; consoleTablesAbsent?: unknown; passed?: unknown; schemaVersion?: unknown; channel?: unknown; status?: unknown; completedStages?: unknown; ledgerStatus?: unknown; elapsedMs?: unknown; evidenceSaveFailed?: unknown; error?: unknown; category?: unknown; sqlstate?: unknown; cause?: unknown }} RawRecord
 * @typedef {import('./r17-migration-evidence.mjs').LedgerEntry} LedgerEntry
 * @typedef {{query(config: string | (import('pg').QueryConfig & {query_timeout: number})): Promise<{rows: unknown[]}>}} QueryClient
 * @typedef {import('./otp-migration-evidence.mjs').OtpObservation} Observation
 */
// Test-only evidence from the actual fixture connection, never its parent DB.
import { readFile, readdir, lstat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
/**
 * @param {string | Uint8Array} b
 */
const digest = b => createHash('sha256').update(b).digest('hex');
/**
 * @returns {never}
 */
const fail = () => { throw Object.assign(Error('otp_ledger_denied'), { code: 'OTP_LEDGER_DENIED' }); };
/**
 * @returns {Promise<LedgerEntry[]>}
 */
export async function expectedOtpLedger() {
  const root = new URL('../migrations/', import.meta.url);
  const names = (await readdir(root)).filter(n => /** @type {RegExp & {test(value: unknown): boolean}} */ (/^(?:00[1-9]|01[0-3]|015)_[a-z0-9_]+\.sql$/u).test(n)).sort();
  if (names.map(n => n.slice(0, 3)).join(',') !== [...Array.from({ length: 13 }, (_, i) => String(i + 1).padStart(3, '0')), '015'].join(',')) fail();
  return Promise.all(names.map(async name => ({ name, sha256: digest(await readFile(new URL(name, root))) })));
}
/**
 * @param {unknown} rows
 * @param {readonly LedgerEntry[]} expected
 * @param {unknown} consoleObjects
 * @returns {true}
 */
export function verifyOtpLedger(rows, expected, consoleObjects) {
  if (!Array.isArray(rows) || expected.length !== 14 || rows.length !== expected.length
    || JSON.stringify(rows) !== JSON.stringify(expected) || consoleObjects !== false) fail();
  return true;
}
/**
 * @param {RawRecord | null | undefined} value
 * @param {readonly LedgerEntry[]} expected
 * @param {string} run
 * @returns {Observation}
 */
export function verifyObservation(value, expected, run) {
  const keys = ['run', 'stage', 'databaseSha256', 'migrations', 'consoleTablesAbsent', 'passed'];
  if (!value || Object.keys(value).some(k => !keys.includes(k)) || Object.keys(value).length !== keys.length
    || value.run !== run || !/** @type {readonly unknown[]} */ (['before', 'after']).includes(value.stage) || !/** @type {RegExp & {test(value: unknown): boolean}} */ (/^[a-f0-9]{64}$/u).test(value.databaseSha256)
    || value.consoleTablesAbsent !== true || value.passed !== true) fail();
  verifyOtpLedger(value.migrations, expected, false);
  return /** @type {Observation} */ ({ run: value.run, stage: value.stage, databaseSha256: value.databaseSha256,
    migrations: value.migrations, consoleTablesAbsent: true, passed: true });
}
/**
 * @param {RawRecord[]} values
 * @param {readonly LedgerEntry[]} expected
 * @param {string} run
 */
export function verifyObservationSet(values, expected, run) {
  if (values.length !== 4) fail();
  const checked = values.map(v => verifyObservation(v, expected, run)), ids = new Set(checked.map(v => v.databaseSha256));
  if (ids.size !== 2) fail();
  for (const id of ids) {
    const stages = checked.filter(v => v.databaseSha256 === id).map(v => v.stage).sort();
    if (JSON.stringify(stages) !== '["after","before"]') fail();
  }
  return checked;
}
/**
 * @param {QueryClient} pool
 * @param {'before' | 'after'} stage
 * @param {NonNullable<Parameters<typeof import('./otp-migration-evidence.mjs').recordOtpLedger>[2]>} options
 */
export async function recordOtpLedger(pool, stage, options = {}) {
  if (!/** @type {readonly unknown[]} */ (['before', 'after']).includes(stage)) fail();
  const meta = /** @type {{name?: unknown; console_objects?: unknown} | undefined} */ ((await pool.query("SELECT current_database() AS name, (to_regclass('platform.console_auth_transactions') IS NOT NULL OR to_regclass('platform.console_sessions') IS NOT NULL) AS console_objects")).rows[0]);
  if (!/** @type {RegExp & {test(value: unknown): boolean}} */ (/^wepuu_p3d_[a-f0-9]{14}$/u).test(meta?.name ?? '')) fail();
  const rows = /** @type {unknown} */ ((await pool.query('SELECT name,sha256 FROM public.wepuu_schema_migrations ORDER BY name')).rows);
  verifyOtpLedger(rows, await (options.expected ?? expectedOtpLedger)(), /** @type {{name: string; console_objects: unknown}} */ (meta).console_objects);
  const env = options.env ?? process.env, root = /** @type {NodeJS.ProcessEnv & {WEPUU_R16_EVIDENCE_ROOT?: string; WEPUU_R16_RUN_ID?: string}} */ (env).WEPUU_R16_EVIDENCE_ROOT, run = /** @type {NodeJS.ProcessEnv & {WEPUU_R16_EVIDENCE_ROOT?: string; WEPUU_R16_RUN_ID?: string}} */ (env).WEPUU_R16_RUN_ID;
  // General test runs retain strict ledger assertions; R16 additionally requires files.
  if (root === undefined && run === undefined) return;
  if (root !== '/evidence/ledger' || !/** @type {RegExp & {test(value: unknown): boolean}} */ (/^r16-[0-9]+$/u).test(run ?? '')) fail();
  const stat = await (options.inspect ?? lstat)(root);
  if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0 || stat.uid !== (options.uid ?? /** @type {() => number} */ (process.getuid)())) fail();
  const databaseSha256 = digest(/** @type {{name: string}} */ (meta).name);
  const value = { run, stage, databaseSha256, migrations: rows, consoleTablesAbsent: true, passed: true };
  await (options.save ?? writeFile)(join(root, stage + '-' + databaseSha256 + '.json'), JSON.stringify(value), { flag: 'wx', mode: 0o600 });
}
