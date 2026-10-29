import { readFile, lstat, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createHash, randomBytes } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';
import { fixedNodeTestCommand } from '../r10/fixed-node-test.mjs';
import { runReportedProcess } from '../r10/reported-process.mjs';
import { projectEvidence } from '../r10/evidence.mjs';
import { readDiagnostics } from '../../../packages/database/test/reconsent-diagnostic.mjs';
import { readTargetLedgers } from '../../../packages/database/test/r19-target-ledger.mjs';
import { validateCredential, targetFile, projectTarget } from './target-schema.mjs';
export async function executeTarget(io = {}) {
  const expectedRun = process.env.WEPUU_R19_EXPECTED_RUN;
  const result = { passed: false, stage: 'credentials', testAttempts: 0, observations: [], ledgerStatus: 'NOT_CONFIRMED',
    ...(/^r19-[0-9]+-target$/u.test(expectedRun ?? '') ? { run: expectedRun } : {}) };
  const clock = io.clock ?? (() => performance.now());
  let cluster, cfg; const started = clock();
  const remaining = () => { const value = 300000 - (clock() - started); if (value <= 0) { result.groupTimedOut = true; throw Error('GROUP_TIMEOUT'); } return Math.min(150000, Math.floor(value)); };
  try {
    if (io.load) cfg = validateCredential(await io.load());
    else {
      const s = await lstat('/evidence/postgres.private.json');
      if (!s.isFile() || s.isSymbolicLink() || s.uid !== process.getuid() || (s.mode & 0o077) || s.size > 4096) throw Error('CREDENTIALS_DENIED');
      cfg = validateCredential(JSON.parse(await readFile('/evidence/postgres.private.json', 'utf8')));
    }
    if (expectedRun !== undefined && cfg.run !== expectedRun) throw Error('RUN_CONTEXT_DENIED');
    result.run = cfg.run; result.stage = 'connection';
    const Client = io.Client ?? createRequire('/workspace/packages/database/dist/index.js')('pg').Client;
    cluster = new Client({ host: cfg.host, port: cfg.port, user: cfg.user, password: cfg.password, database: cfg.database, connectionTimeoutMillis: 5000, statement_timeout: 5000, query_timeout: 6000 });
    await cluster.connect(); await cluster.query('SELECT 1');
    const name = 'wepuu_r19_' + randomBytes(6).toString('hex'); await cluster.query('CREATE DATABASE ' + name);
    result.databaseSha256 = createHash('sha256').update(name).digest('hex');
    const url = new URL('postgresql://127.0.0.1:5432/' + name); url.username = cfg.user; url.password = cfg.password;
    result.stage = 'runtime'; const command = await (io.runtime ?? fixedNodeTestCommand)(); remaining();
    result.stage = 'target_test'; result.testAttempts = 1;
    const raw = await (io.test ?? runReportedProcess)({ executable: command.executable, args: command.args,
      config: { files: [targetFile], phase: 'database', expectedTopLevel: { 'grant-reconsent.test.ts': 1 } },
      reporter: '/workspace/test/persistent-authorization/r10/reporter.mjs', cwd: '/workspace', timeoutMs: remaining(),
      env: { PATH: process.env.PATH, TMPDIR: '/tmp', CI: 'true', WEPUU_TEST_DATABASE_URL: url.href,
        WEPUU_R19_RUN_ID: cfg.run, WEPUU_R19_DB_SHA256: result.databaseSha256,
        WEPUU_R18_RUN_ID: cfg.diagnosticRun, WEPUU_R18_DIAGNOSTIC_ROOT: '/evidence/r18' } });
    result.test = projectEvidence('database-tests.json', raw);
    result.stage = 'evidence';
    result.diagnostics = await (io.diagnostics ?? readDiagnostics)(cfg.diagnosticRun);
    const ledger = await (io.ledgers ?? readTargetLedgers)(cfg.run, result.databaseSha256);
    result.ledgerStatus = ledger.status; result.observations = ledger.observations;
    remaining(); result.stage = 'complete';
    result.passed = raw.passed === true && raw.report?.skips.length === 0 && raw.report?.topLevelCountsMatch === true
      && result.diagnostics.diagnosticCoverage === 'COMPLETE' && result.diagnostics.mainStatus === 'PASS'
      && result.diagnostics.cleanupStatus === 'PASS' && result.ledgerStatus === 'COMPLETE';
    if (!result.passed) result.category = raw.passed === false ? 'TEST_FAILED' : 'EVIDENCE_NOT_CONFIRMED';
  } catch {
    result.passed = false;
    result.category = ({ credentials: 'CREDENTIALS_NOT_CONFIRMED', connection: 'CONNECTION_NOT_CONFIRMED', runtime: 'RUNTIME_NOT_CONFIRMED', target_test: 'TEST_FAILED' })[result.stage] ?? 'EVIDENCE_NOT_CONFIRMED';
    if (result.groupTimedOut) result.category = 'GROUP_TIMEOUT';
  } finally {
    if (cluster) { try { await cluster.end(); } catch { result.passed = false; result.category = 'CONNECTION_NOT_CONFIRMED'; } }
    if (cfg) {
      // Also preserve safe partial artifacts if a reporting/transport step failed.
      if (!result.diagnostics) result.diagnostics = await (io.diagnostics ?? readDiagnostics)(cfg.diagnosticRun);
      if (result.databaseSha256 && result.observations.length === 0) {
        const ledger = await (io.ledgers ?? readTargetLedgers)(cfg.run, result.databaseSha256); result.ledgerStatus = ledger.status; result.observations = ledger.observations;
      }
    }
    try { await (io.save ?? (value => writeFile('/evidence/target.json', JSON.stringify(value), { flag: 'wx', mode: 0o600 })))(result); }
    catch { result.passed = false; result.category = 'EVIDENCE_SAVE_FAILED'; }
  }
  return result;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const value = await executeTarget();
  const safe = await projectTarget(value, value.run); console.log(JSON.stringify(safe)); if (!safe.passed) process.exitCode = 1;
}
