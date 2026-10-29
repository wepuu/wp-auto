// Selected synthetic report tests only, never the complete unit or DB driver.
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { fixedNodeTestCommand } from '../test/persistent-authorization/r10/fixed-node-test.mjs';
import { runReportedProcess } from '../test/persistent-authorization/r10/reported-process.mjs';
import { projectEvidence } from '../test/persistent-authorization/r10/evidence.mjs';
const expectedTopLevel = {
  'fixed-node-test.test.mjs': 5,
  'persistent-nested-report.test.mjs': 5,
  'persistent-r10.test.mjs': 8,
  'persistent-report-channel.test.mjs': 21,
  'persistent-test-result.test.mjs': 5
};
const result = { phase: 'r12_offline_validation', startedAt: new Date().toISOString(), passed: false,
  fullUnitExecuted: false, databaseExecuted: false, abExecuted: false, productionAccessed: false,
  rawOutputSuppressed: true };
try {
  const command = await fixedNodeTestCommand(); result.runtime = command.identity;
  const value = await runReportedProcess({ executable: command.executable, args: command.args,
    reporter: fileURLToPath(new URL('../test/persistent-authorization/r10/reporter.mjs', import.meta.url)),
    config: { files: Object.keys(expectedTopLevel).map(f => 'scripts/' + f), phase: 'unit', expectedTopLevel },
    cwd: '/workspace', env: { PATH: process.env.PATH, TMPDIR: '/tmp' }, timeoutMs: 60000 });
  result.validation = projectEvidence('unit-tests.json', value);
  assert.equal(value.passed, true); assert.equal(value.report.total, 44);
  assert.equal(value.report.fileCount, 5); assert.equal(value.report.skips.length, 0);
  assert.equal(value.report.unmappedEventCount, 0); assert.equal(value.report.missing.length, 0);
  result.passed = true;
} catch { result.category = 'SYNTHETIC_GATE_FAILED'; }
result.finishedAt = new Date().toISOString();
console.log(JSON.stringify(result)); if (!result.passed) process.exitCode = 1;
