import { readFile, readdir, lstat, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fixedNodeTestCommand } from '../r10/fixed-node-test.mjs';
import { runReportedProcess } from '../r10/reported-process.mjs';
import { projectEvidence } from '../r10/evidence.mjs';
import { expectedOtpLedger, verifyObservationSet } from '/workspace/packages/database/test/otp-migration-evidence.mjs';
const result = { passed: false, stage: 'credentials', testAttempts: 0, rawOutputSuppressed: true,
  fullDatabaseRegressionExecuted: false, legacyConsoleExecuted: false, abExecuted: false };
let connection;
try {
  const stat = await lstat('/evidence/postgres.private.json');
  if (!stat.isFile() || stat.isSymbolicLink() || stat.uid !== process.getuid() || (stat.mode & 0o077) !== 0 || stat.size > 4096) throw Error('credentials_denied');
  const cfg = JSON.parse(await readFile('/evidence/postgres.private.json', 'utf8'));
  if (cfg.host !== '127.0.0.1' || cfg.port !== 5432 || cfg.user !== 'postgres' || cfg.database !== 'postgres'
    || !/^[a-f0-9]{64}$/u.test(cfg.password) || !/^r16-[0-9]+$/u.test(cfg.run)) throw Error('credentials_denied');
  result.stage = 'connection';
  const { Client } = createRequire('/workspace/packages/database/dist/index.js')('pg');
  connection = new Client({ host: cfg.host, port: cfg.port, user: cfg.user, password: cfg.password, database: cfg.database,
    connectionTimeoutMillis: 5000, statement_timeout: 5000, query_timeout: 6000 }); await connection.connect();
  await connection.query('SELECT 1'); await connection.end(); connection = undefined;
  result.stage = 'runtime'; const command = await fixedNodeTestCommand(); result.runtime = command.identity;
  const url = new URL('postgresql://127.0.0.1:5432/postgres'); url.username = cfg.user; url.password = cfg.password;
  result.stage = 'otp_test'; result.testAttempts = 1;
  const value = await runReportedProcess({ executable: command.executable, args: command.args,
    config: { files: ['packages/database/test/otp-send-budget.test.ts'], phase: 'database', expectedTopLevel: { 'otp-send-budget.test.ts': 2 } },
    reporter: '/harness/r10/reporter.mjs', cwd: '/workspace', timeoutMs: 150000,
    env: { PATH: process.env.PATH, TMPDIR: '/tmp', CI: 'true', WEPUU_TEST_DATABASE_URL: url.href,
      WEPUU_R16_RUN_ID: cfg.run, WEPUU_R16_EVIDENCE_ROOT: '/evidence/ledger' } });
  result.test = projectEvidence('database-tests.json', value);
  result.stage = 'actual_fixture_ledger'; const expected = await expectedOtpLedger(); const observations = [];
  const names = (await readdir('/evidence/ledger')).sort();
  for (const name of names) {
    if (!/^(before|after)-[a-f0-9]{64}\.json$/u.test(name)) throw Error('ledger_evidence_denied');
    const path = '/evidence/ledger/' + name, stat = await lstat(path);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.uid !== process.getuid() || (stat.mode & 0o077) !== 0 || stat.size > 16384) throw Error('ledger_evidence_denied');
    observations.push(JSON.parse(await readFile(path, 'utf8')));
  }
  result.observations = verifyObservationSet(observations, expected, cfg.run);
  result.actualFixtureLedgerVerified = true;
  result.passed = value.passed === true && value.report.skips.length === 0 && value.report.topLevelCountsMatch === true;
  if (!result.passed) result.category = 'OTP_TEST_FAILED';
} catch { result.passed = false; result.category = 'OTP_TARGET_NOT_CONFIRMED'; }
finally {
  if (connection) { try { await connection.end(); } catch { result.passed = false; } }
  try { await writeFile('/evidence/otp-target.json', JSON.stringify(result), { flag: 'wx', mode: 0o600 }); }
  catch { result.passed = false; result.category = 'EVIDENCE_SAVE_FAILED'; }
}
console.log(JSON.stringify(result)); if (!result.passed) process.exitCode = 1;
