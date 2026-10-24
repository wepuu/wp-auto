// Actual target connection only; no migration/prototype interception.
import { createHash } from 'node:crypto';
import { readFile, readdir, lstat, writeFile } from 'node:fs/promises';
import { expectedLedger, verifyLedger } from './r17-migration-evidence.mjs';
const sha = value => createHash('sha256').update(value).digest('hex');
const deny = () => { throw Object.assign(Error('R19_LEDGER_NOT_CONFIRMED'), { code: 'R19_LEDGER_NOT_CONFIRMED' }); };
export function verifyTargetObservation(value, expected, run, databaseSha256) {
  const keys = ['run', 'stage', 'databaseSha256', 'migrations', 'consoleObjects', 'passed'].sort();
  if (!value || Object.keys(value).sort().join(',') !== keys.join(',') || !/^r19-[0-9]+-target$/u.test(run ?? '')
    || value.run !== run || !['before', 'after'].includes(value.stage) || value.databaseSha256 !== databaseSha256
    || !/^[a-f0-9]{64}$/u.test(databaseSha256 ?? '') || value.passed !== true) deny();
  verifyLedger(value.migrations, expected, value.consoleObjects, 'candidate');
  return { run, stage: value.stage, databaseSha256, migrations: value.migrations, consoleObjects: false, passed: true };
}
export function verifyTargetPair(values, expected, run, databaseSha256) {
  if (!Array.isArray(values) || values.length !== 2) deny();
  const checked = values.map(v => verifyTargetObservation(v, expected, run, databaseSha256));
  if (checked.map(v => v.stage).sort().join(',') !== 'after,before') deny();
  return checked;
}
export async function recordTargetLedger(pool, stage, env = process.env) {
  if (env.WEPUU_R19_RUN_ID === undefined && env.WEPUU_R19_DB_SHA256 === undefined) return;
  const run = env.WEPUU_R19_RUN_ID, db = env.WEPUU_R19_DB_SHA256;
  if (!/^r19-[0-9]+-target$/u.test(run ?? '') || !/^[a-f0-9]{64}$/u.test(db ?? '') || !['before', 'after'].includes(stage)) deny();
  const root = '/evidence/ledger', stat = await lstat(root);
  if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== process.getuid() || (stat.mode & 0o077)) deny();
  const meta = (await pool.query({ text: "SELECT current_database() AS name, (to_regclass('platform.console_auth_transactions') IS NOT NULL OR to_regclass('platform.console_sessions') IS NOT NULL) AS console_objects", query_timeout: 5000 })).rows[0];
  if (!/^wepuu_r19_[a-f0-9]{12}$/u.test(meta?.name ?? '') || sha(meta.name) !== db) deny();
  const migrations = (await pool.query({ text: 'SELECT name,sha256 FROM public.wepuu_schema_migrations ORDER BY name', query_timeout: 5000 })).rows;
  const checked = verifyTargetObservation({ run, stage, databaseSha256: db, migrations, consoleObjects: meta.console_objects, passed: true }, await expectedLedger('candidate'), run, db);
  await writeFile(root + '/' + stage + '.json', JSON.stringify(checked), { flag: 'wx', mode: 0o600 });
}
export async function closeAfterLedger(pool, close, observe = recordTargetLedger) {
  let first, failed = false;
  try { await observe(pool, 'after'); } catch (e) { first = e; failed = true; }
  try { await close(); } catch (e) { if (!failed) { first = e; failed = true; } }
  if (failed) throw first;
}
export async function readTargetLedgers(run, db, io = {}) {
  const root = '/evidence/ledger', out = [];
  try {
    const inspect = io.inspect ?? lstat, uid = io.uid ?? process.getuid(), s = await inspect(root);
    if (!s.isDirectory() || s.isSymbolicLink() || s.uid !== uid || (s.mode & 0o077)) deny();
    const names = await (io.list ?? readdir)(root), expected = await expectedLedger('candidate');
    if (names.length > 2 || new Set(names).size !== names.length || names.some(n => !['before.json', 'after.json'].includes(n))) deny();
    for (const name of names) {
      const path = root + '/' + name, st = await inspect(path);
      if (!st.isFile() || st.isSymbolicLink() || st.uid !== uid || (st.mode & 0o077) || st.size > 16384) deny();
      const bytes = await (io.read ?? readFile)(path);
      if (!Buffer.isBuffer(bytes) || bytes.length > 16384) deny();
      const v = verifyTargetObservation(JSON.parse(bytes.toString('utf8')), expected, run, db);
      if (v.stage + '.json' !== name) deny(); out.push(v);
    }
    verifyTargetPair(out, expected, run, db);
    return { status: 'COMPLETE', observations: out };
  } catch { return { status: 'NOT_CONFIRMED', observations: out }; }
}
