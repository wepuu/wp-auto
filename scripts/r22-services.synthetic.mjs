import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { steps, expectedChecks, proofChecks, project, lastResult, boundaryFailure, verifyScenario } from '../test/persistent-authorization/r22/report.mjs';
import { scenarioOnce, nextAllowed, ownedState, budgets, images } from './run-r22-services.mjs';
import { expectedLedger } from '../packages/database/test/r17-migration-evidence.mjs';
let checks = 0; const check = fn => { fn(); checks++; };
const ledger = await expectedLedger('candidate');
function sample(step) {
 const driver = [{ name: 'missing_schema_denied_without_auto_migration', passed: true, sqlstate: '42P01' },
  { name: 'separate_explicit_migration_identity', passed: true }, { name: 'runtime_cannot_DDL_write_ledger_or_assume_migrator', passed: true },
  { name: 'missing_ledger_permission_denied_without_repair', passed: true, sqlstate: '42501' }];
 const matrix = { passed: true, checks: expectedChecks[step].map(name => ({ name, passed: true })) };
 if (['startup', 'control'].includes(step)) Object.assign(matrix, { runtimeDsnRestricted: true, schemaAndLedgerUnchanged: true,
  runs: [1, 2].map(attempt => ({ attempt, ready: true, exitCode: 0 })) });
 else Object.assign(matrix, { protocolAssertionsPass: true, childEvidencePass: true, deadlineExceeded: false,
  cleanup: { childrenStopped: true, forcedOwnedChildTermination: false }, authRequests: 10, tokenRequests: 12,
  startupEvidence: ['A', 'B'].map(mode => ({ mode, readyStatus: 200, readinessRequestCount: 1, ownedChildStopped: true, forcedOwnedChildTermination: false,
   observed: { passed: true, evidenceComplete: true, snapshotReceived: true, timedOut: false, exitCode: 0 } })) });
 return { step, passed: true, explicitMigration: true, runtimePrivilegeSeparationPass: true,
  checks: ['startup', 'control'].includes(step) ? driver : driver.slice(1, 3), matrix, ledgerBefore: ledger, ledgerAfter: ledger, schemaBefore: 'a'.repeat(64), schemaAfter: 'a'.repeat(64) };
}
const done = [];
for (const step of steps) {
 const good = sample(step);
 check(() => assert(nextAllowed(step, done)));
 check(() => assert(verifyScenario(good, step, ledger).passed));
 check(() => assert.equal(new Set(expectedChecks[step]).size, expectedChecks[step].length));
 for (const mutate of [v => v.passed = false, v => v.step = 'INVALID', v => v.ledgerBefore = [], v => v.ledgerAfter = [],
  v => v.schemaAfter = 'b'.repeat(64), v => delete v.schemaBefore, v => v.checks.pop(), v => v.checks[0].passed = false,
  v => v.explicitMigration = false, v => v.runtimePrivilegeSeparationPass = false, v => v.matrix.passed = false,
  v => v.matrix.checks.pop(), v => v.matrix.checks.push(v.matrix.checks[0]), v => v.matrix.checks[0].name = 'SENSITIVE_SENTINEL',
  v => v.matrix.checks[0].passed = false]) {
  const bad = structuredClone(good); mutate(bad); check(() => assert.throws(() => verifyScenario(bad, step, ledger)));
 }
 const mutations = ['startup', 'control'].includes(step)
  ? [v => v.matrix.runs[0].ready = false, v => v.matrix.runs[1].exitCode = 1, v => v.matrix.runs.pop(), v => v.matrix.runs[0].attempt = 2,
   v => v.checks[0].sqlstate = '42501', v => v.checks[3].sqlstate = '42P01', v => v.matrix.runtimeDsnRestricted = false]
  : [v => v.matrix.authRequests = 21, v => v.matrix.tokenRequests = 31, v => delete v.matrix.authRequests, v => v.matrix.authRequests = NaN,
   v => v.matrix.startupEvidence.pop(), v => v.matrix.startupEvidence[0].mode = 'B', v => v.matrix.startupEvidence[0].readyStatus = 401,
   v => v.matrix.startupEvidence[0].readinessRequestCount = 2, v => v.matrix.startupEvidence[0].observed.timedOut = true,
   v => v.matrix.startupEvidence[0].observed.evidenceComplete = false, v => v.matrix.startupEvidence[0].observed.snapshotReceived = false,
   v => v.matrix.startupEvidence[0].observed.exitCode = 1, v => v.matrix.startupEvidence[0].ownedChildStopped = false,
   v => v.matrix.cleanup.forcedOwnedChildTermination = true, v => v.matrix.cleanup.childrenStopped = false,
   v => v.matrix.protocolAssertionsPass = false, v => v.matrix.childEvidencePass = false, v => v.matrix.deadlineExceeded = true];
 for (const mutate of mutations) { const bad = structuredClone(good); mutate(bad); check(() => assert.throws(() => verifyScenario(bad, step, ledger))); }
 const safe = project({ ...good, stdout: 'SENSITIVE_SENTINEL', stderr: 'SENSITIVE_SENTINEL', message: 'SENSITIVE_SENTINEL', payload: 'SENSITIVE_SENTINEL', assertion: 'SENSITIVE_SENTINEL' });
 check(() => assert(!JSON.stringify(safe).includes('SENSITIVE_SENTINEL')));
 let calls = 0; const pass = await scenarioOnce(step, async () => { calls++; return JSON.stringify(good); }, ledger);
 check(() => assert(pass.passed && calls === 1));
 const fail = await scenarioOnce(step, async () => { throw Object.assign(Error('SENSITIVE_SENTINEL'), { code: 1, stdout: JSON.stringify(good) }); }, ledger);
 check(() => assert(!fail.passed && fail.transport.exitCode === 1));
 const partial = structuredClone(good); partial.matrix.passed = false;
 check(() => assert(!(nextAllowed(step, [...done, { step, passed: false }]))));
 done.push({ step, passed: true });
}
for (const value of ['', 'null', '{', '{"passed":"true"}', '[1]']) check(() => assert.equal(lastResult(value), null));
check(() => assert.deepEqual(lastResult('ignored\n{"passed":false}'), { passed: false }));
check(() => assert.equal(nextAllowed('database', []), false));
check(() => assert.equal(nextAllowed('control', [{ step: 'startup', passed: false }]), false));
check(() => assert.equal(nextAllowed('startup', done), false));
check(() => assert.equal(proofChecks.length, 8));
check(() => assert.deepEqual(steps, ['startup', 'control', 'matrix', 'transition']));
check(() => assert.deepEqual(budgets, { startup: 120000, control: 300000, matrix: 300000, transition: 300000 }));
check(() => assert.equal(Object.keys(images).length, 3));
const timeout = await scenarioOnce('startup', async () => { throw Object.assign(Error('SENSITIVE_SENTINEL'), { killed: true }); }, ledger);
check(() => assert(!timeout.passed && timeout.category === 'TRANSPORT_TIMEOUT' && timeout.transport.timedOut));
const missing = await scenarioOnce('startup', async () => 'SENSITIVE_SENTINEL', ledger);
check(() => assert(!missing.passed && missing.category === 'REPORT_MISSING_OR_INVALID' && !JSON.stringify(missing).includes('SENSITIVE_SENTINEL')));
for (const code of ['ENOENT', 'EACCES', 'EPERM']) {
 const failure = boundaryFailure('startup', Object.assign(Error('SENSITIVE_SENTINEL'), { code }));
 check(() => assert(!failure.passed && failure.stage === 'driver_initialization_or_report' && !JSON.stringify(failure).includes('SENSITIVE_SENTINEL')));
}
const meta = { Name: '/owned', Config: { Labels: { 'wepuu.run': 'run', 'wepuu.phase': 'r22-services' } }, State: { Running: false, ExitCode: 0, OOMKilled: false } };
check(() => assert(ownedState(meta, 'run', 'owned').stopped));
for (const mutate of [v => v.Name = '/other', v => v.Config.Labels['wepuu.run'] = 'other', v => v.Config.Labels['wepuu.phase'] = 'other']) {
 const bad = structuredClone(meta); mutate(bad); check(() => assert.throws(() => ownedState(bad, 'run', 'owned')));
}
const driver = await readFile('test/persistent-authorization/driver.mjs', 'utf8'), runner = await readFile('scripts/run-r22-services.mjs', 'utf8');
check(() => assert(driver.includes('async function driver(){') && driver.includes('try { await driver(); } catch (error)')));
check(() => assert(driver.includes("'startup-service.json'") && !driver.includes("'startup.json'")));
check(() => assert(driver.includes("assert.equal(schemaAfter,schemaBefore,'SERVICE_SCHEMA_UNCHANGED')")));
check(() => assert(driver.includes('childMatrix||lastResult(e.stdout)')));
for (const text of ['--pull=never', '--internal', '--read-only', '--cap-drop', 'ALL', 'no-new-privileges', 'container:', "for (const step of steps)"])
 check(() => assert(runner.includes(text)));
check(() => assert(!runner.includes("scenario('database')") && !runner.includes("scenario('legacy')")));
// The R8 protocol scripts have not changed. This is a local read-only Git check, not an app invocation.
const diff = await promisify(execFile)('git', ['diff', '--name-only', 'e165096', '--', 'test/persistent-authorization/r8'], { windowsHide: true });
check(() => assert.equal(diff.stdout.trim(), ''));
console.log(JSON.stringify({ passed: true, checks, expectedChecks: Object.fromEntries(Object.entries(expectedChecks).map(([k, v]) => [k, v.length])), formalAttempts: 0, productionAccessed: false }));
