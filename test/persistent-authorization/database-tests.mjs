import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const cfg = JSON.parse(await readFile('/evidence/postgres.private.json', 'utf8'));
assert.equal(cfg.host, '127.0.0.1');
const url = new URL('postgresql://127.0.0.1:5432/postgres');
url.username = cfg.user; url.password = cfg.password;
const legacy = process.env.WEPUU_TEST_LEGACY_CONSOLE === 'allow-isolated';
const args = legacy ? ['exec', 'tsx', '--test', '--test-reporter=tap', '--test-concurrency=1', 'packages/database/test/*.test.ts'] : ['exec', 'tsx', '--test', '--test-reporter=tap', '--test-concurrency=1',
  'packages/database/test/persistent-readonly.test.ts', 'packages/database/test/migration-profile.test.ts'];
let result;
try {
  const r = await promisify(execFile)('pnpm', args, { cwd: '/workspace', timeout: 240000,
    env: { PATH: process.env.PATH, TMPDIR: '/tmp', CI: 'true', WEPUU_TEST_DATABASE_URL: url.href }, maxBuffer: 2000000 });
  const output = r.stdout + '\n' + r.stderr;
  const pass = Number(output.match(/# pass (\d+)/u)?.[1]), fail = Number(output.match(/# fail (\d+)/u)?.[1]);
  assert(Number.isSafeInteger(pass) && pass > 0 && fail === 0);
  result = { passed: true, pass, fail, legacyConsoleRegression: legacy ? 'PASS' : 'NOT_RUN',
    migration014Scope: legacy ? 'ISOLATED_LEGACY_REGRESSION_ONLY' : 'NOT_EXECUTED', productionAccessed: false };
} catch (error) {
  const output = String(error.stdout ?? '') + '\n' + String(error.stderr ?? '');
  result = { passed: false, category: error.killed ? 'TIMEOUT' : 'DATABASE_REGRESSION_FAILED',
    failedTests: output.split(/\r?\n/u).filter(line => /^not ok /u.test(line)).map(line => line.slice(0, 180)),
    rawOutputSuppressed: true, productionAccessed: false };
}
await writeFile('/evidence/database-tests.json', JSON.stringify(result, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
console.log(JSON.stringify(result));
if (!result.passed) process.exitCode = 1;
