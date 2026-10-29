// One bounded synthetic characterization, before changing the historical caller.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, unlink, rmdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { validateStructuredReport, validateReportEnvelope } from '../test/persistent-authorization/r10/report-schema.mjs';
import { fixedNodeTestCommand } from '../test/persistent-authorization/r10/fixed-node-test.mjs';
let directory;
const result = { phase: 'r12_characterization', passed: false, rawOutputSuppressed: true };
try {
  await fixedNodeTestCommand();
  directory = await mkdtemp(join(tmpdir(), 'wepuu-r12-reproduce-'));
  const file = join(directory, 'fixture.mjs'), config = { files: [file], phase: 'unit' };
  await writeFile(file, "import test from 'node:test';test('SECRET_SENTINEL',()=>{console.log('SECRET_SENTINEL')});");
  const reporter = new URL('../test/persistent-authorization/r10/reporter.mjs', import.meta.url).href;
  const values = [];
  for (const runId of [undefined, 'a'.repeat(24)]) {
    const env = { PATH: process.env.PATH, TMPDIR: '/tmp', SYNTHETIC_SECRET: 'SECRET_SENTINEL',
      WEPUU_R10_REPORT_CONFIG: JSON.stringify(config), ...(runId ? { WEPUU_R10_REPORT_RUN_ID: runId } : {}) };
    const output = await promisify(execFile)(process.execPath, ['--test', '--test-reporter=' + reporter, file],
      { cwd: '/workspace', env, timeout: 10000, maxBuffer: 65536, windowsHide: true });
    assert(!output.stdout.includes('SECRET_SENTINEL')); assert(!output.stderr.includes('SECRET_SENTINEL'));
    const value = JSON.parse(output.stdout);
    if (!runId) {
      assert.equal(validateStructuredReport(value, config).passed, true);
      assert.equal(value.passed, true); values.push({ outerRunIdPresent: false, legacyTopLevelPass: true });
    } else {
      assert.equal(validateReportEnvelope(value, config, runId).report.passed, true);
      assert.throws(() => assert.equal(value.passed, true), { code: 'ERR_ASSERTION' });
      values.push({ outerRunIdPresent: true, envelopeValid: true, nestedReportPass: true, legacyAssertionRejected: true });
    }
  }
  result.cases = values; result.passed = true;
} catch { result.category = 'CHARACTERIZATION_NOT_CONFIRMED'; }
finally {
  if (directory) { await unlink(join(directory, 'fixture.mjs')); await rmdir(directory); }
}
console.log(JSON.stringify(result)); if (!result.passed) process.exitCode = 1;
