import assert from 'node:assert/strict';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const files = [];
for (const kind of ['packages', 'apps']) {
  for (const name of await readdir('/workspace/' + kind)) {
    const dir = `${kind}/${name}/${kind === 'packages' ? 'test' : 'src'}`;
    let entries; try { entries = await readdir('/workspace/' + dir); } catch { continue; }
    files.push(...entries.filter(f => f.endsWith('.test.ts')).map(f => dir + '/' + f));
  }
}
files.push(...(await readdir('/workspace/scripts')).filter(f => f.endsWith('.test.mjs')).map(f => 'scripts/' + f));
files.sort(); assert(files.length > 30);
const frozen = JSON.parse(await readFile('/harness/r10/unit-manifest.json', 'utf8'));
assert.deepEqual(files, frozen, 'UNIT_MANIFEST_DRIFT');
let result;
try {
  const output = await promisify(execFile)('pnpm', ['exec', 'tsx', '--test', '--test-concurrency=1',
    '--test-reporter=/harness/r10/reporter.mjs', ...files], { cwd: '/workspace', timeout: 240000,
    maxBuffer: 1000000, env: { PATH: process.env.PATH, TMPDIR: '/tmp',
      WEPUU_R10_REPORT_CONFIG: JSON.stringify({ files, phase: 'unit' }) } });
  result = JSON.parse(output.stdout.trim()); assert.equal(result.passed, true);
} catch (error) {
  let report; try { report = JSON.parse(error.stdout.trim()); } catch { /* no raw output */ }
  result = { passed: false, category: error.killed ? 'TIMEOUT' : 'UNIT_FAILED',
    ...(report?.rawOutputSuppressed === true ? { report } : {}), rawOutputSuppressed: true };
}
await writeFile('/evidence/unit-tests.json', JSON.stringify(result) + '\n', { flag: 'wx', mode: 0o600 });
console.log(JSON.stringify(result)); if (!result.passed) process.exitCode = 1;
