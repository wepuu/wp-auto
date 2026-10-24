// No Docker subprocesses: bounded in-memory lifecycle and safe-projection tests.
import assert from 'node:assert/strict';
import { singleUnit, mountPlan, overlayFiles, unitProjection, saveResult } from './run-r13-unit.mjs';
const files = ['scripts/persistent-nested-report.test.mjs'], run = 'r13-synthetic';
const processResult = { completed: true, exitCode: 0, signal: null, spawnFailed: false,
  timedOut: false, outputLimitExceeded: false, outputBytes: 0 };
const report = { passed: true, phase: 'unit', total: 5, fileCount: 1, missing: [], failures: [], skips: [],
  unexpectedEvent: false, unmappedEventCount: 0, topLevelCountsMatch: true, rawOutputSuppressed: true };
const envelope = () => ({ passed: true, category: 'PASS', reportStatus: 'VALID', process: { ...processResult }, report: structuredClone(report) });
function io(options = {}) {
  const calls = [];
  return { calls,
    async create() { calls.push('create'); if (options.createError) throw Error('SECRET_SENTINEL'); },
    async start() { calls.push('start'); if (options.errorOutput !== undefined) throw Object.assign(Error('SECRET_SENTINEL'), { stdout: options.errorOutput });
      return { output: options.output ?? JSON.stringify(envelope()), failed: false }; },
    async inspect() { calls.push('inspect'); if (options.inspectError) throw Error('SECRET_SENTINEL');
      return { Config: { Labels: { 'wepuu.run': options.foreign ? 'other' : run } }, State: {
        Running: Boolean(options.running && !calls.includes('stop')), ExitCode: options.exitCode ?? 0, OOMKilled: options.oom ?? false } }; },
    async stop() { calls.push('stop'); if (options.stopError) throw Error('SECRET_SENTINEL'); },
    async postcheck() { calls.push('postcheck'); return { passed: options.postcheck !== false }; }
  };
}
const cases = [
  ['exact_overlay_inventory', async () => {
    const mounts = mountPlan('/synthetic'); assert.equal(overlayFiles.length, 16); assert.equal(mounts.length, 25);
    assert(mounts.every(m => m.readonly));
    for (const f of ['scripts/persistent-r10.test.mjs', 'scripts/persistent-nested-report.test.mjs'])
      assert(mounts.some(m => m.target === '/workspace/' + f));
    assert.throws(() => mountPlan('/synthetic', overlayFiles.slice(1)), { code: 'OVERLAY_MANIFEST_DRIFT' });
  }],
  ['single_success_no_retry', async () => {
    const transport = io(), v = await singleUnit(transport, files, run);
    assert(v.passed); assert.equal(v.unitAttempts, 1); assert.equal(transport.calls.filter(v => v === 'start').length, 1);
  }],
  ['create_failure_no_start', async () => {
    const transport = io({ createError: true }), v = await singleUnit(transport, files, run);
    assert(!v.passed); assert.equal(v.unitAttempts, 0); assert(!transport.calls.includes('start'));
    assert(!JSON.stringify(v).includes('SECRET_SENTINEL'));
  }],
  ['failed_child_preserves_valid_report', async () => {
    const v = envelope(); v.passed = false; v.category = 'TEST_FAILURE'; v.process.exitCode = 1;
    v.report.passed = false; v.report.failures = [{ file: files[0], line: 1, category: 'ERR_ASSERTION' }];
    const transport = io({ errorOutput: JSON.stringify(v), exitCode: 1 });
    const actual = await singleUnit(transport, files, run);
    assert(!actual.passed); assert.equal(actual.unit.category, 'TEST_FAILURE');
    assert.equal(actual.unit.reportStatus, 'VALID'); assert.equal(actual.unit.report.failures.length, 1);
    assert.equal(transport.calls.filter(v => v === 'start').length, 1);
  }],
  ['missing_or_malformed_report_rejects', async () => {
    for (const output of ['', 'SECRET_SENTINEL', '{"passed":true}']) {
      const v = await singleUnit(io({ output }), files, run); assert(!v.passed);
      assert(!JSON.stringify(v).includes('SECRET_SENTINEL'));
    }
  }],
  ['nonzero_transport_cannot_use_pass_report', async () => {
    const v = await singleUnit(io({ errorOutput: JSON.stringify(envelope()), exitCode: 1 }), files, run);
    assert(!v.passed); assert(v.unit.passed); assert.equal(v.unitAttempts, 1);
  }],
  ['invalid_report_binding_rejects', async () => {
    const v = envelope(); v.report.phase = 'database';
    assert.throws(() => unitProjection(JSON.stringify(v), files), { code: 'UNIT_ENVELOPE_NOT_CONFIRMED' });
  }],
  ['required_test_skip_rejects', async () => {
    const v = envelope(); v.report.skips = [{ file: files[0], allowed: true }];
    assert.throws(() => unitProjection(JSON.stringify(v), files), { code: 'UNIT_ENVELOPE_NOT_CONFIRMED' });
  }],
  ['stop_only_owned_running_container', async () => {
    const transport = io({ running: true }); const v = await singleUnit(transport, files, run);
    assert(v.container.stopped); assert.equal(transport.calls.filter(v => v === 'stop').length, 1);
    const foreign = io({ running: true, foreign: true }); const denied = await singleUnit(foreign, files, run);
    assert(!denied.passed); assert(!foreign.calls.includes('stop'));
  }],
  ['cleanup_or_oom_cannot_pass', async () => {
    for (const options of [{ running: true, stopError: true }, { inspectError: true }, { oom: true }])
      assert(!(await singleUnit(io(options), files, run)).passed);
  }],
  ['postcheck_failure_cannot_pass', async () => { assert(!(await singleUnit(io({ postcheck: false }), files, run)).passed); }],
  ['save_failure_cannot_pass', async () => {
    const v = await saveResult({ passed: true }, async () => { throw Error('SECRET_SENTINEL'); });
    assert(!v.passed); assert.equal(v.evidenceFailure, 'EVIDENCE_SAVE_FAILED'); assert(!JSON.stringify(v).includes('SECRET_SENTINEL'));
  }],
  ['projection_drops_raw_fields', async () => {
    const v = envelope(); v.stdout = 'SECRET_SENTINEL'; v.stderr = 'SECRET_SENTINEL'; v.reportDirectory = 'SECRET_SENTINEL';
    assert(!JSON.stringify(unitProjection(JSON.stringify(v), files)).includes('SECRET_SENTINEL'));
  }]
];
const result = { phase: 'r13_coordinator_synthetic', passed: true, cases: [], dockerInvoked: false, fullUnitExecuted: false };
for (const [name, check] of cases) {
  try { await check(); result.cases.push({ name, passed: true }); }
  catch { result.cases.push({ name, passed: false, category: 'SYNTHETIC_ASSERTION_FAILED' }); result.passed = false; break; }
}
console.log(JSON.stringify(result)); if (!result.passed) process.exitCode = 1;
