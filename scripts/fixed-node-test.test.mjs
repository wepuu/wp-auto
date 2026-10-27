import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, writeFile, readdir, unlink, rmdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fixedNodeTestCommand, verifyTestRuntime, fixedTestRuntime } from '../test/persistent-authorization/r10/fixed-node-test.mjs';
import { runReportedProcess } from '../test/persistent-authorization/r10/reported-process.mjs';
const reporter = fileURLToPath(new URL('../test/persistent-authorization/r10/reporter.mjs', import.meta.url));
const isFixedImageContext = (platform, cwd) => platform === 'linux' && cwd === '/workspace';
const fixedImage = isFixedImageContext(process.platform, process.cwd());
test('R11 fixed runtime rejects wrong version, root, missing or changed loader without repair', () => {
  for (const [platform, cwd, expected] of [
    ['linux', '/workspace', true], ['linux', '/home/runner/work/repo/repo', false],
    ['win32', 'D:/repo', false], ['darwin', '/workspace', false],
    ['linux', '/workspace-other', false], ['linux', '/workspace/subdir', false], ['linux', '/workspace/', false]
  ]) assert.equal(isFixedImageContext(platform, cwd), expected);
  assert.deepEqual(verifyTestRuntime(fixedTestRuntime), fixedTestRuntime);
  for (const patch of [{ version: 'v26.11.1' }, { uid: 0 }, { tsxVersion: '4.23.14' },
    { entrySha256: '0'.repeat(64) }, { entry: '/tmp/loader.mjs' }, { lts: undefined }])
    assert.throws(() => verifyTestRuntime({ ...fixedTestRuntime, ...patch }), { code: 'TEST_RUNTIME_MISMATCH' });
});
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'wepuu-r11-synthetic-'));
  t.after(async () => {
    for (const entry of await readdir(root, { withFileTypes: true })) {
      const path = join(root, entry.name); assert.equal(dirname(path), root);
      if (entry.isDirectory()) { for (const name of await readdir(path)) await unlink(join(path, name)); await rmdir(path); }
      else await unlink(path);
    }
    await rmdir(root);
  });
  return root;
}
async function typedCase(t, source, options = {}) {
  const command = await fixedNodeTestCommand(), root = await fixture(t), file = join(root, 'fixture.test.ts');
  await writeFile(file, source);
  return runReportedProcess({ executable: command.executable, args: command.args,
    reporter: options.reporter ?? reporter, config: { files: [file], phase: 'unit' }, cwd: '/workspace',
    env: { PATH: process.env.PATH, TMPDIR: '/tmp' }, root, timeoutMs: options.timeoutMs ?? 10000 });
}
test('R11 actual readonly Node+tsx runs typed fixture through dedicated reporter', { skip: fixedImage ? false : 'Requires the pinned /workspace image runtime' }, async t => {
  const result = await typedCase(t, "import test from 'node:test';import assert from 'node:assert/strict';const n:number=7;test('synthetic',()=>assert.equal(n,7));");
  assert.equal(result.reportStatus, 'VALID'); assert.equal(result.category, 'PASS');
  assert.equal(result.report.total, 1); assert.equal(result.process.exitCode, 0);
});
test('R11 actual assertion and missing-module typed cases retain failed reports', { skip: fixedImage ? false : 'Requires the pinned /workspace image runtime' }, async t => {
  for (const source of ["import test from 'node:test';import assert from 'node:assert/strict';test('synthetic',()=>assert.fail('SECRET_SENTINEL'));",
    "import 'wepuu-r11-missing-synthetic-module';"]) {
    const result = await typedCase(t, source);
    assert.equal(result.reportStatus, 'VALID'); assert.equal(result.category, 'TEST_FAILURE');
    assert(!JSON.stringify(result).includes('SECRET_SENTINEL'));
  }
});
test('R11 actual invalid reporter and typed timeout fail closed without retry', { skip: fixedImage ? false : 'Requires the pinned /workspace image runtime' }, async t => {
  const invalid = await typedCase(t, "import test from 'node:test';test('synthetic',()=>{});", { reporter: '/tmp/wepuu-r11-absent-reporter.mjs' });
  assert(!invalid.passed); assert.notEqual(invalid.reportStatus, 'VALID');
  const timeout = await typedCase(t, "import test from 'node:test';test('synthetic',()=>new Promise(r=>setTimeout(r,10000)));", { timeoutMs: 500 });
  assert(!timeout.passed); assert.equal(timeout.category, 'PROCESS_TIMEOUT');
});
test('R11 callers use only direct fixed Node; historical pnpm probe retains original assertion', async () => {
  for (const file of ['../test/persistent-authorization/r10/unit.mjs', '../test/persistent-authorization/database-tests.mjs']) {
    const source = await readFile(new URL(file, import.meta.url), 'utf8');
    assert(source.includes('fixedNodeTestCommand')); assert(!source.includes("executable: 'pnpm'"));
  }
  const legacy = await readFile(new URL('./persistent-pnpm-r1.legacy-probe.mjs', import.meta.url), 'utf8');
  assert(legacy.includes("assert.equal(result.reportStatus, 'VALID')"));
  assert(legacy.includes("assert.equal(result.category, 'PASS')"));
});
