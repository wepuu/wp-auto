/**
 * @typedef {object & { run?: unknown; file?: unknown; profile?: unknown; stage?: unknown; databaseSha256?: unknown; migrations?: unknown; consoleObjects?: unknown; consoleTablesAbsent?: unknown; passed?: unknown; schemaVersion?: unknown; channel?: unknown; status?: unknown; completedStages?: unknown; ledgerStatus?: unknown; elapsedMs?: unknown; evidenceSaveFailed?: unknown; error?: unknown; category?: unknown; sqlstate?: unknown; cause?: unknown }} RawRecord
 * @typedef {import('./r17-migration-evidence.mjs').LedgerEntry} LedgerEntry
 * @typedef {{query(config: string | (import('pg').QueryConfig & {query_timeout: number})): Promise<{rows: unknown[]}>}} QueryClient
 * @typedef {import('./r17-migration-evidence.mjs').MigrationProfile} Profile
 * @typedef {import('./r17-migration-evidence.mjs').FixtureObservation} Observation
 */
// Test-only, opt-in observations from actual fixture connections; no migrator hooks.
import { readFile, readdir, lstat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
/**
 * @param {string | Uint8Array} b
 */
const sha = b => createHash('sha256').update(b).digest('hex');
/**
 * @returns {never}
 */
const deny = () => { throw Error('R17_LEDGER_NOT_CONFIRMED'); };
/**
 * @type {Readonly<Partial<Record<string, readonly [Profile | 'none', number, 'paired' | 'post' | 'none']>>>}
 */
export const fixtureScopes = Object.freeze({
  'account-auth-link.test.ts': ['candidate', 1, 'post'],
  'account-login-transaction.test.ts': ['candidate', 1, 'post'],
  'account-workspace.test.ts': ['candidate', 1, 'post'],
  'deletion-lifecycle.test.ts': ['candidate', 1, 'post'],
  'grant-reconsent.test.ts': ['candidate', 1, 'post'],
  'local-signing-lifecycle.test.ts': ['candidate', 1, 'post'],
  'migration-profile.test.ts': ['none', 0, 'none'],
  'multi-site-provider.test.ts': ['candidate', 1, 'paired'],
  'oauth-client-callback.test.ts': ['candidate', 1, 'post'],
  'persistent-readonly.test.ts': ['candidate', 6, 'paired'],
  'secret-artifact.test.ts': ['none', 0, 'none'],
  'tenant-isolation.test.ts': ['candidate', 1, 'post'],
  'tenant-provider-http.test.ts': ['candidate', 1, 'paired'],
  'otp-send-budget.test.ts': ['historical14', 2, 'paired'],
  'pairing-diagnostics.test.ts': ['historical13', 1, 'paired'],
  'console-auth.test.ts': ['legacy', 1, 'post']
});
/**
 * @param {unknown} profile
 * @returns {Promise<LedgerEntry[]>}
 */
export async function expectedLedger(profile) {
  const indices = profile === 'legacy' ? Array.from({ length: 17 }, (_, i) => i + 1)
    : profile === 'candidate' ? [...Array.from({ length: 13 }, (_, i) => i + 1), 15, 16, 17]
    : profile === 'historical14' ? [...Array.from({ length: 13 }, (_, i) => i + 1), 15]
    : profile === 'historical13' ? Array.from({ length: 13 }, (_, i) => i + 1) : null;
  if (!indices) deny();
  const root = new URL('../migrations/', import.meta.url);
  const names = (await readdir(root)).filter(n => /** @type {RegExp & {test(value: unknown): boolean}} */ (/^[0-9]{3}_[a-z0-9_]+\.sql$/u).test(n) && indices.includes(Number(n.slice(0, 3)))).sort();
  if (names.map(n => Number(n.slice(0, 3))).join(',') !== indices.join(',')) deny();
  return Promise.all(names.map(async name => ({ name, sha256: sha(await readFile(new URL(name, root))) })));
}
/**
 * @param {unknown} rows
 * @param {readonly LedgerEntry[]} expected
 * @param {unknown} consoleObjects
 * @param {unknown} profile
 */
export function verifyLedger(rows, expected, consoleObjects, profile) {
  if (JSON.stringify(rows) !== JSON.stringify(expected) || consoleObjects !== (profile === 'legacy')) deny();
}
/**
 * @param {RawRecord | null | undefined} v
 * @param {readonly LedgerEntry[]} expected
 * @param {string} run
 * @param {string} file
 * @returns {Observation}
 */
export function verifyObservation(v, expected, run, file) {
  const keys = ['run', 'file', 'profile', 'stage', 'databaseSha256', 'migrations', 'consoleObjects', 'passed'].sort();
  if (!v || Object.keys(v).sort().join(',') !== keys.join(',') || v.run !== run || v.file !== file
    || v.profile !== fixtureScopes[file]?.[0] || !/** @type {readonly unknown[]} */ (['before', 'after', 'post']).includes(v.stage)
    || !/** @type {RegExp & {test(value: unknown): boolean}} */ (/^[a-f0-9]{64}$/u).test(v.databaseSha256) || v.passed !== true) deny();
  verifyLedger(v.migrations, expected, v.consoleObjects, v.profile);
  return /** @type {Observation} */ (v);
}
/**
 * @param {RawRecord[]} values
 * @param {readonly LedgerEntry[]} expected
 * @param {string} run
 * @param {string} file
 */
export function verifySet(values, expected, run, file) {
  const scope = fixtureScopes[file]; if (!scope) deny();
  const checked = values.map(v => verifyObservation(v, expected, run, file));
  const ids = new Set(checked.map(v => v.databaseSha256));
  if (ids.size !== scope[1]) deny();
  for (const id of ids) {
    const stages = checked.filter(v => v.databaseSha256 === id).map(v => v.stage).sort().join(',');
    if (stages !== (scope[2] === 'paired' ? 'after,before' : 'post')) deny();
  }
  if (scope[0] === 'none' && checked.length) deny();
  return checked;
}
/**
 * @param {QueryClient} pool
 * @param {import('./r17-migration-evidence.mjs').LedgerStage} stage
 * @param {Profile} profile
 * @param {NodeJS.ProcessEnv & {WEPUU_R17_RUN_ID?: string; WEPUU_R17_FILE?: string}} env
 */
export async function recordFixtureLedger(pool, stage, profile, env = process.env) {
  const run = env.WEPUU_R17_RUN_ID, file = env.WEPUU_R17_FILE;
  if (run === undefined && file === undefined) return;
  if (!/** @type {RegExp & {test(value: unknown): boolean}} */ (/^r17-[0-9]+-(candidate|legacy)$/u).test(run ?? '') || fixtureScopes[/** @type {string} */ (file)]?.[0] !== profile
    || !/** @type {readonly unknown[]} */ (['before', 'after', 'post']).includes(stage) || (profile === 'legacy') !== /** @type {string} */ (run).endsWith('-legacy')) deny();
  const root = '/evidence/ledger', s = await lstat(root);
  if (!s.isDirectory() || s.isSymbolicLink() || s.uid !== /** @type {() => number} */ (process.getuid)() || (s.mode & 0o077)) deny();
  const meta = /** @type {{name?: unknown; console_objects?: unknown} | undefined} */ ((await pool.query({ text: "SELECT current_database() AS name, (to_regclass('platform.console_auth_transactions') IS NOT NULL OR to_regclass('platform.console_sessions') IS NOT NULL) AS console_objects", query_timeout: 5000 })).rows[0]);
  if (!/** @type {RegExp & {test(value: unknown): boolean}} */ (/^wepuu_(r17_[a-f0-9]{12}|p3d_[a-f0-9]{14}|multisite_[a-f0-9]{12}|persistent_[a-f0-9]{14}|pairing_[0-9]+_[0-9]+)$/u).test(meta?.name ?? '')) deny();
  const migrations = /** @type {unknown} */ ((await pool.query({ text: 'SELECT name,sha256 FROM public.wepuu_schema_migrations ORDER BY name', query_timeout: 5000 })).rows);
  verifyLedger(migrations, await expectedLedger(profile), /** @type {{console_objects: unknown}} */ (meta).console_objects, profile);
  const value = { run, file, profile, stage, databaseSha256: sha(/** @type {{name: string}} */ (meta).name), migrations, consoleObjects: /** @type {{console_objects: unknown}} */ (meta).console_objects, passed: true };
  await writeFile(root + '/' + sha(/** @type {string} */ (file)) + '-' + value.databaseSha256 + '-' + stage + '.json', JSON.stringify(value), { flag: 'wx', mode: 0o600 });
}
