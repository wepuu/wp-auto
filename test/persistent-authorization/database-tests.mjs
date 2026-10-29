import assert from 'node:assert/strict';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { runReportedProcess } from './r10/reported-process.mjs';
import { fixedNodeTestCommand } from './r10/fixed-node-test.mjs';
import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';
import { basename } from 'node:path';
import { candidateDatabase, retainedDatabase, legacyDatabase, nativeDatabase, legacyCompatibility, verifyDatabaseManifest } from './r68/profiles.mjs';

const cfg = JSON.parse(await readFile('/evidence/postgres.private.json', 'utf8'));
assert.equal(cfg.host, '127.0.0.1');
const legacy = process.argv[2] === 'legacy';
if (legacy) assert.equal(process.env.WEPUU_TEST_LEGACY_CONSOLE, 'allow-isolated');
verifyDatabaseManifest((await readdir('/workspace/packages/database/test')).filter(f => f.endsWith('.test.ts')));
const require = createRequire('/workspace/packages/database/dist/index.js'), { Client } = require('pg');
const cluster = new Client(cfg); await cluster.connect();
const profiles = legacy ? [legacyDatabase,legacyCompatibility] : [candidateDatabase,retainedDatabase,nativeDatabase], reports = [];
let result, current, currentReport;
try {
  const command = await fixedNodeTestCommand();
  for (const profile of profiles) for (const [file, count] of Object.entries(profile)) {
    current = file;
    currentReport = undefined;
    const name = 'wepuu_r10_' + (legacy ? 'legacy_' : 'candidate_') + randomBytes(6).toString('hex');
    await cluster.query(`CREATE DATABASE ${name}`);
    const url = new URL('postgresql://127.0.0.1:5432/' + name); url.username = cfg.user; url.password = cfg.password;
    const path = file.includes('/') ? file : 'packages/database/test/' + file;
    currentReport = await runReportedProcess({ executable: command.executable, args: command.args,
      config: { files: [path], phase: legacy ? 'legacy' : 'database', expectedTopLevel: { [basename(file)]: count } },
      reporter: '/harness/r10/reporter.mjs', cwd: '/workspace', timeoutMs: 150000,
      env: { PATH: process.env.PATH, TMPDIR: '/tmp', CI: 'true', WEPUU_TEST_DATABASE_URL: url.href } });
    if (!currentReport.passed) throw Error('REPORTED_DATABASE_TEST_FAILED');
    const report = currentReport.report;
    const inspect = new Client({ ...cfg, database: name }); await inspect.connect();
    try {
      const exists = (await inspect.query("SELECT to_regclass('public.wepuu_schema_migrations') AS v")).rows[0].v;
      if (exists) {
        const names = (await inspect.query('SELECT name FROM public.wepuu_schema_migrations ORDER BY name')).rows.map(r => r.name);
        if (!legacy) assert(!names.some(n => n.startsWith('014_')), 'CANDIDATE_014_FORBIDDEN');
        if (legacy) assert(names.some(n => n.startsWith('014_')), 'LEGACY_014_REQUIRED');
        report.baseDatabaseMigrationCount = names.length;
      }
    } finally { await inspect.end(); }
    reports.push({ file, database: name, passed: true, report });
  }
  result = { passed: true, reports, legacyConsoleRegression: legacy ? 'PASS' : 'NOT_RUN',
    migration014Scope: legacy ? 'ISOLATED_LEGACY_CONSOLE_ONLY' : 'FORBIDDEN', productionAccessed: false };
} catch (error) {
  result = { passed: false, category: error.killed ? 'TIMEOUT' : 'DATABASE_REGRESSION_FAILED',
    file: current, reports, ...(currentReport ? { reportedProcess: currentReport, ...(currentReport.report ? { report: currentReport.report } : {}) } : {}),
    legacyConsoleRegression: 'NOT_CONFIRMED', rawOutputSuppressed: true, productionAccessed: false };
} finally { await cluster.end(); }
await writeFile('/evidence/' + (legacy ? 'legacy' : 'database') + '-tests.json', JSON.stringify(result, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
console.log(JSON.stringify(result));
if (!result.passed) process.exitCode = 1;
