import assert from 'node:assert/strict';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';
import { candidateDatabase, retainedDatabase, legacyDatabase, verifyDatabaseManifest } from './r10/profiles.mjs';

const cfg = JSON.parse(await readFile('/evidence/postgres.private.json', 'utf8'));
assert.equal(cfg.host, '127.0.0.1');
const legacy = process.argv[2] === 'legacy';
if (legacy) assert.equal(process.env.WEPUU_TEST_LEGACY_CONSOLE, 'allow-isolated');
verifyDatabaseManifest((await readdir('/workspace/packages/database/test')).filter(f => f.endsWith('.test.ts')));
const require = createRequire('/workspace/packages/database/dist/index.js'), { Client } = require('pg');
const cluster = new Client(cfg); await cluster.connect();
const profiles = legacy ? [legacyDatabase] : [candidateDatabase, retainedDatabase], reports = [];
let result, current;
try {
  for (const profile of profiles) for (const [file, count] of Object.entries(profile)) {
    current = file;
    const name = 'wepuu_r10_' + (legacy ? 'legacy_' : 'candidate_') + randomBytes(6).toString('hex');
    await cluster.query(`CREATE DATABASE ${name}`);
    const url = new URL('postgresql://127.0.0.1:5432/' + name); url.username = cfg.user; url.password = cfg.password;
    const path = 'packages/database/test/' + file;
    const output = await promisify(execFile)('pnpm', ['exec', 'tsx', '--test', '--test-concurrency=1',
      '--test-reporter=/harness/r10/reporter.mjs', path], { cwd: '/workspace', timeout: 150000, maxBuffer: 1000000,
      env: { PATH: process.env.PATH, TMPDIR: '/tmp', CI: 'true', WEPUU_TEST_DATABASE_URL: url.href,
        WEPUU_R10_REPORT_CONFIG: JSON.stringify({ files: [path], phase: legacy ? 'legacy' : 'database',
          expectedTopLevel: { [file]: count } }) } });
    const report = JSON.parse(output.stdout.trim()); assert.equal(report.passed, true);
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
  let report; try { report = JSON.parse(error.stdout.trim()); } catch { /* output is private */ }
  result = { passed: false, category: error.killed ? 'TIMEOUT' : 'DATABASE_REGRESSION_FAILED',
    file: current, reports, ...(report?.rawOutputSuppressed === true ? { report } : {}),
    legacyConsoleRegression: 'NOT_CONFIRMED', rawOutputSuppressed: true, productionAccessed: false };
} finally { await cluster.end(); }
await writeFile('/evidence/' + (legacy ? 'legacy' : 'database') + '-tests.json', JSON.stringify(result, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
console.log(JSON.stringify(result));
if (!result.passed) process.exitCode = 1;
