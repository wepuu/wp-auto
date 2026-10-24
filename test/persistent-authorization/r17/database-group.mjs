import { readFile, readdir, lstat, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';
import { fixedNodeTestCommand } from '../r10/fixed-node-test.mjs';
import { runReportedProcess } from '../r10/reported-process.mjs';
import { projectEvidence } from '../r10/evidence.mjs';
import { candidateDatabase, retainedDatabase, legacyDatabase, verifyDatabaseManifest } from '../r10/profiles.mjs';
import { fixtureScopes, expectedLedger, recordFixtureLedger, verifyObservation, verifySet } from '../../../packages/database/test/r17-migration-evidence.mjs';
export function validateCredential(cfg, legacy) {
  if (cfg.host !== '127.0.0.1' || cfg.port !== 5432 || cfg.database !== 'postgres' || cfg.user !== 'postgres'
    || !/^[a-f0-9]{64}$/u.test(cfg.password) || !new RegExp('^r17-[0-9]+-' + (legacy ? 'legacy' : 'candidate') + '$', 'u').test(cfg.run)) throw Error('CREDENTIALS_DENIED');
  return cfg;
}
export async function executeGroup(legacy, io = {}) {
  const result = { passed: false, stage: 'credentials', reports: [], observations: [],
    rawOutputSuppressed: true, productionAccessed: false, serviceStartupExecuted: false, abExecuted: false,
    candidatePass: false, retainedPass: false, legacyResult: legacy ? 'NOT_CONFIRMED' : 'NOT_RUN' };
  let connection, cfg;
  const start = performance.now();
  const remaining = () => { const value = 300000 - (performance.now() - start); if (value <= 0) { result.groupTimedOut = true; throw Error('GROUP_TIMEOUT'); } return Math.min(150000, Math.floor(value)); };
  const collect = async () => {
    for (const name of (await readdir('/evidence/ledger')).sort()) {
      if (!/^[a-f0-9]{64}-[a-f0-9]{64}-(before|after|post)\.json$/u.test(name)) throw Error('LEDGER_NOT_CONFIRMED');
      const path = '/evidence/ledger/' + name, s = await lstat(path);
      if (!s.isFile() || s.isSymbolicLink() || s.uid !== process.getuid() || (s.mode & 0o077) || s.size > 16384) throw Error('LEDGER_NOT_CONFIRMED');
      const v = JSON.parse(await readFile(path, 'utf8'));
      if (!(v.file in fixtureScopes)) throw Error('LEDGER_NOT_CONFIRMED');
      result.observations.push(verifyObservation(v, await expectedLedger(v.profile), cfg.run, v.file));
    }
  };
  try {
    // All credential/setup failures are inside this bounded report-producing envelope.
    if (io.load) cfg = validateCredential(await io.load(), legacy);
    else {
      const s = await lstat('/evidence/postgres.private.json');
      if (!s.isFile() || s.isSymbolicLink() || s.uid !== process.getuid() || (s.mode & 0o077) || s.size > 4096) throw Error('CREDENTIALS_DENIED');
      cfg = validateCredential(JSON.parse(await readFile('/evidence/postgres.private.json', 'utf8')), legacy);
    }
    result.run = cfg.run;
    result.stage = 'connection';
    const Client = io.Client ?? createRequire('/workspace/packages/database/dist/index.js')('pg').Client;
    connection = new Client({ ...cfg, run: undefined, connectionTimeoutMillis: 5000, statement_timeout: 5000, query_timeout: 6000 });
    await connection.connect(); await connection.query('SELECT 1');
    result.stage = 'runtime'; const command = await fixedNodeTestCommand();
    verifyDatabaseManifest((await readdir('/workspace/packages/database/test')).filter(f => f.endsWith('.test.ts')));
    const groups = legacy ? [['legacy', legacyDatabase]] : [['candidate', candidateDatabase], ['retained', retainedDatabase]];
    for (const [group, profile] of groups) {
      for (const [file, count] of Object.entries(profile)) {
        remaining(); result.stage = 'database_test'; result.file = file;
        const name = 'wepuu_r17_' + randomBytes(6).toString('hex');
        await connection.query('CREATE DATABASE ' + name);
        const url = new URL('postgresql://127.0.0.1:5432/' + name); url.username = cfg.user; url.password = cfg.password;
        const raw = await runReportedProcess({ executable: command.executable, args: command.args,
          config: { files: ['packages/database/test/' + file], phase: legacy ? 'legacy' : 'database', expectedTopLevel: { [file]: count } },
          reporter: '/workspace/test/persistent-authorization/r10/reporter.mjs', cwd: '/workspace', timeoutMs: remaining(),
          env: { PATH: process.env.PATH, TMPDIR: '/tmp', CI: 'true', WEPUU_TEST_DATABASE_URL: url.href, WEPUU_R17_RUN_ID: cfg.run, WEPUU_R17_FILE: file } });
        const projected = projectEvidence(legacy ? 'legacy-tests.json' : 'database-tests.json', raw);
        const row = { group, file, ...projected, migrationScope: fixtureScopes[file][0] === 'none' ? 'NO_MIGRATION' : fixtureScopes[file][0], migrationVerified: false };
        result.reports.push(row);
        if (!raw.passed || raw.report?.skips?.length !== 0 || raw.report?.topLevelCountsMatch !== true) throw Error('DATABASE_TEST_FAILED');
        result.stage = 'actual_fixture_ledger';
        const inspect = new Client({ ...cfg, database: name, connectionTimeoutMillis: 5000, statement_timeout: 5000, query_timeout: 6000 });
        try {
          await inspect.connect();
          const exists = (await inspect.query("SELECT to_regclass('public.wepuu_schema_migrations') AS v")).rows[0].v;
          if (fixtureScopes[file][2] === 'post') {
            if (!exists) throw Error('LEDGER_NOT_CONFIRMED');
            await recordFixtureLedger(inspect, 'post', fixtureScopes[file][0], { WEPUU_R17_RUN_ID: cfg.run, WEPUU_R17_FILE: file });
          } else if (exists) throw Error('UNEXPECTED_PARENT_LEDGER');
        } finally { await inspect.end(); }
        // Check each file now; partial fixture evidence cannot be hidden by a later file.
        result.observations = []; await collect();
        const expected = fixtureScopes[file][0] === 'none' ? [] : await expectedLedger(fixtureScopes[file][0]);
        verifySet(result.observations.filter(v => v.file === file), expected, cfg.run, file);
        row.migrationVerified = true;
      }
      if (group === 'candidate') result.candidatePass = true;
      if (group === 'retained') result.retainedPass = true;
      if (group === 'legacy') result.legacyResult = 'PASS';
    }
    remaining(); result.passed = true; result.stage = 'complete';
  } catch {
    result.passed = false;
    result.category = ({ credentials: 'CREDENTIALS_NOT_CONFIRMED', connection: 'CONNECTION_NOT_CONFIRMED', runtime: 'RUNTIME_NOT_CONFIRMED', database_test: 'DATABASE_TEST_FAILED', actual_fixture_ledger: 'LEDGER_NOT_CONFIRMED' })[result.stage] ?? 'GROUP_NOT_CONFIRMED';
    if (result.groupTimedOut) result.category = 'GROUP_TIMEOUT';
    // Retain safe partial observations without substituting them for the failed gate.
    if (cfg && !io.load) { try { result.observations = []; await collect(); } catch { result.partialEvidenceNotConfirmed = true; } }
  } finally {
    if (connection) { try { await connection.end(); } catch { result.passed = false; result.closeFailed = true; } }
    result.durationMs = Math.ceil(performance.now() - start);
    try { await (io.save ?? (value => writeFile('/evidence/' + (legacy ? 'legacy' : 'database') + '-tests.json', JSON.stringify(value), { flag: 'wx', mode: 0o600 })))(result); }
    catch { result.passed = false; result.category = 'EVIDENCE_SAVE_FAILED'; }
  }
  return result;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const legacy = process.argv[2] === 'legacy';
  const result = await executeGroup(legacy); console.log(JSON.stringify(result)); if (!result.passed) process.exitCode = 1;
}
