import assert from 'node:assert/strict';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { runReportedProcess } from './reported-process.mjs';
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
  result = await runReportedProcess({ executable: 'pnpm', args: ['exec', 'tsx', '--test', '--test-concurrency=1'],
    config: { files, phase: 'unit' }, reporter: '/harness/r10/reporter.mjs', cwd: '/workspace', timeoutMs: 240000,
    env: { PATH: process.env.PATH, TMPDIR: '/tmp' } });
} catch {
  result = { passed: false, category: 'REPORT_SETUP_FAILED', reportStatus: 'NOT_CONFIRMED', rawOutputSuppressed: true };
}
await writeFile('/evidence/unit-tests.json', JSON.stringify(result) + '\n', { flag: 'wx', mode: 0o600 });
console.log(JSON.stringify(result)); if (!result.passed) process.exitCode = 1;
