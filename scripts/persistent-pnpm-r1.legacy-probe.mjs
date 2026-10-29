// Historical positive probe preserved from bfa9364. Its observed R1 result was
// FAIL (MISSING report/EROFS). Opt-in only, never a current Node-launch PASS.
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, writeFile, readdir, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runReportedProcess } from '../test/persistent-authorization/r10/reported-process.mjs';
const actualReporter = fileURLToPath(new URL('../test/persistent-authorization/r10/reporter.mjs', import.meta.url));
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'wepuu-pnpm-r1-'));
  t.after(async () => {
    for (const entry of await readdir(root, { withFileTypes: true })) {
      const path = join(root, entry.name);
      if (entry.isDirectory()) { for (const name of await readdir(path)) await unlink(join(path, name)); await rmdir(path); }
      else await unlink(path);
    }
    await rmdir(root);
  });
  return root;
}
test('R1 fixed-container pnpm exec tsx uses the real transport with only one synthetic fixture',
  { skip: process.env.WEPUU_REPORT_SYNTHETIC_PNPM !== '1' }, async t => {
    assert.equal(process.version, 'v24.22.1'); assert.equal(process.getuid(), 1000);
    const root = await fixture(t), file = join(root, 'fixture.test.mjs');
    await writeFile(file, "import test from 'node:test';test('synthetic',()=>{});");
    const result = await runReportedProcess({ executable: 'pnpm', args: ['exec', 'tsx', '--test'],
      config: { files: [file], phase: 'unit', expectedTopLevel: { 'fixture.test.mjs': 1 } },
      reporter: actualReporter, cwd: '/workspace', root, timeoutMs: 15000,
      env: { PATH: process.env.PATH, TMPDIR: '/tmp' } });
    assert.equal(result.reportStatus, 'VALID'); assert.equal(result.category, 'PASS'); assert(result.passed);
  });
