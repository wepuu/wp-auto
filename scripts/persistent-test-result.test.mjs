import assert from 'node:assert/strict';
import test from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { collectScenarioResult } from './persistent-test-result.mjs';

const exec = promisify(execFile);
const child = source => async () => (await exec(process.execPath, ['-e', source], { timeout: 1000, maxBuffer: 10000 })).stdout;
test('scenario collector records a successful bounded child without copying extra fields', async () => {
  const result = await collectScenarioResult('offline', child('console.log(JSON.stringify({passed:true,secret:"SECRET_SENTINEL"}))'));
  assert.equal(result.passed, true); assert.equal(result.category, 'PASS');
  assert(result.startedUtc && result.finishedUtc && Number.isFinite(result.elapsedMs));
  assert(!JSON.stringify(result).includes('SECRET_SENTINEL'));
});
test('nonzero exit preserves only fixed failure fields and remains failed', async () => {
  const result = await collectScenarioResult('startup', child('console.log(JSON.stringify({passed:false,stage:"missing_schema_default_main",category:"SQL_FAILURE",sqlstate:"42501",secret:"SECRET_SENTINEL"}));console.error("SECRET_SENTINEL");process.exitCode=1'));
  assert.equal(result.passed, false); assert.equal(result.category, 'COMMAND_FAILED');
  assert.deepEqual(result.diagnostic, { stage: 'missing_schema_default_main', category: 'SQL_FAILURE', sqlstate: '42501' });
  assert(!JSON.stringify(result).includes('SECRET_SENTINEL'));
});
test('timeout is failed and cannot be overwritten by successful cleanup', async () => {
  const result = await collectScenarioResult('matrix', child('setTimeout(()=>{},10000)'));
  assert.equal(result.passed, false); assert.equal(result.category, 'TIMEOUT');
});
test('invalid JSON is not accepted as success', async () => {
  const result = await collectScenarioResult('control', child('console.log("SECRET_SENTINEL")'));
  assert.equal(result.passed, false); assert.equal(result.category, 'INVALID_RESULT');
  assert(!JSON.stringify(result).includes('SECRET_SENTINEL'));
});
test('unknown diagnostics and exception contents are suppressed', async () => {
  const result = await collectScenarioResult('transition', async () => { throw Object.assign(Error('SECRET_SENTINEL'), {
    stdout: JSON.stringify({ passed: false, category: 'SECRET_SENTINEL', stage: 'SECRET_SENTINEL', sqlstate: 'SECRET_SENTINEL' }) }); });
  assert.equal(result.passed, false); assert(!JSON.stringify(result).includes('SECRET_SENTINEL'));
  await assert.rejects(() => collectScenarioResult('SECRET_SENTINEL', async () => ''), /INVALID_SCENARIO_STEP/u);
});
