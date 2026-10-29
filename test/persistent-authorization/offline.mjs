import assert from 'node:assert/strict';
import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile), root = '/evidence/offline', checks = [];
let stage = 'identity', result;
try {
  assert.equal(process.version, 'v24.22.1'); assert.equal(process.release.lts, 'Krypton'); assert.notEqual(process.getuid(), 0);
  await mkdir(root);
  stage = 'syntax';
  for (const dir of ['r3', 'r5', 'r8']) for (const f of await readdir('/harness/' + dir)) {
    if (f.endsWith('.mjs')) await run(process.execPath, ['--check', '/harness/' + dir + '/' + f], { timeout: 5000 });
  }
  for (const f of ['wiring-tests.mjs', 'fixture-tests.mjs', 'offline-tests.mjs']) {
    stage = f;
    const r = await run(process.execPath, ['/harness/r8/' + f, root], { timeout: 20000, maxBuffer: 30000, env: { PATH: process.env.PATH, TMPDIR: '/tmp' } });
    const value = JSON.parse(r.stdout.trim().split(/\r?\n/u).at(-1)); assert.equal(value.passed, true);
    checks.push({ name: f, passed: true, checkCount: value.checkCount ?? value.checks?.length });
  }
  stage = 'transition_order';
  const s = await readFile('/harness/r8/integration.mjs', 'utf8'), transition = await readFile('/harness/r8/transition.mjs', 'utf8');
  assert(s.includes('runtime.private.json')); assert(!s.includes('WEPUU_DATABASE_URL:dsn.href'));
  assert(transition.indexOf('await stopAllR6(children)') < transition.indexOf("await startMain('A'"));
  assert(!transition.includes("await startMain('A',{...common,WEPUU_AUTH_PORT:String(pa)});await startMain('B'"));
  result = { passed: true, version: process.version, lts: process.release.lts, uid: process.getuid(), checks,
    adapterSyntaxPass: true, sequentialTransitionOrderPass: true, actualMainExecuted: false, databaseConnected: false, externalNetworkAvailable: false };
} catch (error) {
  result = { passed: false, stage, checks, category: error.killed ? 'TIMEOUT' : 'OFFLINE_CHECK_FAILED', rawOutputSuppressed: true };
}
await writeFile(root + '/result.json', JSON.stringify(result, null, 2) + '\n', { flag: 'wx', mode: 0o600 }).catch(() => { result.passed = false; });
console.log(JSON.stringify(result));
if (!result.passed) process.exitCode = 1;
