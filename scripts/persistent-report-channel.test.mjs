import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, writeFile, readdir, unlink, rmdir, mkdir, symlink, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runReportedProcess, readReport, decideReportedProcess } from '../test/persistent-authorization/r10/reported-process.mjs';
import { validateStructuredReport, validateReportEnvelope } from '../test/persistent-authorization/r10/report-schema.mjs';
import reporter, { collect } from '../test/persistent-authorization/r10/reporter.mjs';
import { projectEvidence } from '../test/persistent-authorization/r10/evidence.mjs';
import { collectScenarioResult } from './persistent-test-result.mjs';
const file = 'synthetic.test.mjs', cfg = { files: [file], phase: 'unit' }, runId = 'a'.repeat(24);
const safe = (passed = true) => ({ passed, phase: 'unit', total: 1, fileCount: 1, missing: [],
  failures: passed ? [] : [{ file, line: 1, category: 'ERR_ASSERTION' }], skips: [],
  unexpectedEvent: false, unmappedEventCount: 0, topLevelCountsMatch: true, rawOutputSuppressed: true });
const envelope = report => ({ schemaVersion: 1, runId, reporterStatus: 'COMPLETE', report });
const completed = { completed: true, exitCode: 0, signal: null, spawnFailed: false, timedOut: false, outputLimitExceeded: false, outputBytes: 0 };
test('R1 historical report-loss branch is reproducible without replaying R10 tests', () => {
  let old;
  try { old = JSON.parse(JSON.stringify(safe(false))); assert.equal(old.passed, true); }
  catch (error) { let report; try { report = JSON.parse(error.stdout); } catch {} old = { passed: false, ...(report ? { report } : {}) }; }
  assert.equal(old.report, undefined);
  const fixed = decideReportedProcess(completed, { reportStatus: 'VALID', report: safe(false) });
  assert.equal(fixed.category, 'TEST_FAILURE'); assert.equal(fixed.report.failures.length, 1);
});
test('R1 process status and test verdict cannot overwrite each other', () => {
  assert(decideReportedProcess(completed, { reportStatus: 'VALID', report: safe() }).passed);
  const failed = decideReportedProcess({ ...completed, exitCode: 9 }, { reportStatus: 'VALID', report: safe() });
  assert.equal(failed.category, 'PROCESS_EXIT_NONZERO'); assert(failed.report.passed); assert(!failed.passed);
  assert(!decideReportedProcess(completed, { reportStatus: 'VALID', report: safe(false) }).passed);
  assert.equal(decideReportedProcess({ ...completed, timedOut: true }, { reportStatus: 'VALID', report: safe() }).category, 'PROCESS_TIMEOUT');
});
test('R1 envelope binds run, phase, schema and fixed fields; contradictory PASS fails closed', () => {
  assert.equal(validateReportEnvelope(envelope(safe()), cfg, runId).report.passed, true);
  for (const value of [{ ...envelope(safe()), schemaVersion: 2 }, { ...envelope(safe()), runId: 'b'.repeat(24) },
    envelope({ ...safe(), phase: 'database' }), envelope({ ...safe(), total: null }),
    envelope({ ...safe(), failures: [{ file, line: 1, category: 'ERR_ASSERTION' }] }),
    envelope({ ...safe(), raw: 'SECRET_SENTINEL' })]) assert.throws(() => validateReportEnvelope(value, cfg, runId));
  assert.throws(() => validateStructuredReport({ ...safe(), missing: ['SECRET_SENTINEL'] }, cfg));
});
test('R1 reporter exceptions produce a fixed envelope without exception text or stack', async () => {
  const priorExit = process.exitCode, priorConfig = process.env.WEPUU_R10_REPORT_CONFIG, priorRun = process.env.WEPUU_R10_REPORT_RUN_ID;
  try {
    process.env.WEPUU_R10_REPORT_CONFIG = JSON.stringify(cfg); process.env.WEPUU_R10_REPORT_RUN_ID = runId;
    async function* broken() { throw Error('SECRET_SENTINEL'); }
    let output = ''; for await (const s of reporter(broken())) output += s;
    const value = JSON.parse(output); assert.equal(value.reporterStatus, 'REPORTER_EXCEPTION');
    assert.equal(value.report, null); assert(!output.includes('SECRET_SENTINEL'));
  } finally {
    process.exitCode = priorExit;
    if (priorConfig === undefined) delete process.env.WEPUU_R10_REPORT_CONFIG; else process.env.WEPUU_R10_REPORT_CONFIG = priorConfig;
    if (priorRun === undefined) delete process.env.WEPUU_R10_REPORT_RUN_ID; else process.env.WEPUU_R10_REPORT_RUN_ID = priorRun;
  }
});
test('R1 unmapped events are counted, not silently lost or exposed', async () => {
  const v = await collect([{ type: 'test:fail', data: { file: 'SECRET_SENTINEL', details: { error: Error('SECRET_SENTINEL') } } }], cfg);
  assert(!v.passed); assert.equal(v.unmappedEventCount, 1); assert(!JSON.stringify(v).includes('SECRET_SENTINEL'));
  assert.equal(projectEvidence('unit-tests.json', { passed: false, report: v }).report.unmappedEventCount, 1);
});
test('R1 raw output and paths never enter outer evidence projections', async () => {
  const result = { ...decideReportedProcess({ ...completed, exitCode: 1 }, { reportStatus: 'VALID', report: safe(false) }),
    reportDirectory: 'SECRET_SENTINEL', stdout: 'SECRET_SENTINEL', stderr: 'SECRET_SENTINEL', error: 'SECRET_SENTINEL' };
  const projected = projectEvidence('unit-tests.json', result);
  assert.equal(projected.category, 'TEST_FAILURE'); assert.equal(projected.reportStatus, 'VALID');
  assert.equal(projected.process.exitCode, 1); assert(!JSON.stringify(projected).includes('SECRET_SENTINEL'));
  const item = await collectScenarioResult('unit', async () => { throw Object.assign(Error('SECRET_SENTINEL'), { stdout: JSON.stringify(result) }); });
  assert.equal(item.diagnostic.category, 'TEST_FAILURE'); assert.equal(item.diagnostic.reportStatus, 'VALID');
  assert(!JSON.stringify(item).includes('SECRET_SENTINEL'));
});
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'wepuu-report-synthetic-'));
  t.after(async () => {
    // Exact run-owned tree only; no recursive deletion and no variable shell command.
    for (const entry of await readdir(root, { withFileTypes: true })) {
      const path = join(root, entry.name); assert.equal(dirname(path), root);
      if (entry.isDirectory()) { for (const name of await readdir(path)) await unlink(join(path, name)); await rmdir(path); }
      else await unlink(path);
    }
    await rmdir(root);
  });
  return root;
}
const actualReporter = fileURLToPath(new URL('../test/persistent-authorization/r10/reporter.mjs', import.meta.url));
const fakeSource = (mode, exitCode = 0, wait = false) => `
const fs=require('node:fs');const config=JSON.parse(process.env.WEPUU_R10_REPORT_CONFIG);
const path=process.argv.find(x=>x.startsWith('--test-reporter-destination=')).split('=').slice(1).join('=');
const report={passed:${mode !== 'fail'},phase:config.phase,total:1,fileCount:1,missing:[],failures:${mode === 'fail' ? "[{file:config.files[0],line:7,category:'ERR_ASSERTION'}]" : '[]'},skips:[],unexpectedEvent:false,unmappedEventCount:0,topLevelCountsMatch:true,rawOutputSuppressed:true};
${mode === 'missing' ? '' : mode === 'malformed' ? "fs.writeFileSync(path,'SECRET_SENTINEL');" : mode === 'oversized' ? "fs.writeFileSync(path,'x'.repeat(1048577));" : "fs.writeFileSync(path,JSON.stringify({schemaVersion:1,runId:process.env.WEPUU_R10_REPORT_RUN_ID,reporterStatus:'COMPLETE',report}));"}
console.log('SECRET_SENTINEL stdout prefix '+JSON.stringify({passed:true}));console.error('SECRET_SENTINEL stderr');
process.exitCode=${exitCode};${wait ? 'setTimeout(()=>{},10000);' : ''}`;
async function fake(t, mode, exit = 0, options = {}) {
  const root = await fixture(t);
  return runReportedProcess({ executable: process.execPath, args: ['-e', fakeSource(mode, exit, options.wait), '--'],
    config: cfg, reporter: actualReporter, cwd: root, env: { PATH: process.env.PATH }, root, timeoutMs: options.timeoutMs ?? 5000 });
}
test('R1 actual child ignores prefixed/mixed stdout, preserving dedicated-file PASS', async t => {
  const result = await fake(t, 'pass'); assert(result.passed); assert.equal(result.reportStatus, 'VALID');
  assert(result.process.outputBytes > 0); assert(!JSON.stringify(result).includes('SECRET_SENTINEL'));
});
test('R1 actual nonzero child keeps its failing structured report', async t => {
  const result = await fake(t, 'fail', 1); assert.equal(result.category, 'TEST_FAILURE');
  assert.equal(result.process.exitCode, 1); assert.equal(result.report.failures[0].line, 7);
});
test('R1 actual zero-exit failing report and nonzero passing report both reject', async t => {
  assert.equal((await fake(t, 'fail')).category, 'TEST_FAILURE');
  assert.equal((await fake(t, 'pass', 3)).category, 'PROCESS_EXIT_NONZERO');
});
test('R1 actual missing, malformed and oversized reports have separate fixed categories', async t => {
  for (const [mode, status] of [['missing', 'MISSING'], ['malformed', 'INVALID_JSON'], ['oversized', 'TOO_LARGE']]) {
    const result = await fake(t, mode); assert.equal(result.reportStatus, status); assert(!result.passed);
    assert(!JSON.stringify(result).includes('SECRET_SENTINEL'));
  }
});
test('R1 actual timeout retains completed report but cannot pass', async t => {
  const result = await fake(t, 'pass', 0, { wait: true, timeoutMs: 500 });
  assert.equal(result.category, 'PROCESS_TIMEOUT'); assert.equal(result.reportStatus, 'VALID'); assert(result.process.completed);
});
test('R1 actual spawn failure is distinct from absent report', async t => {
  const root = await fixture(t);
  const result = await runReportedProcess({ executable: join(root, 'absent-executable'), args: [], config: cfg,
    reporter: actualReporter, cwd: root, env: {}, root, timeoutMs: 1000 });
  assert.equal(result.category, 'PROCESS_SPAWN_FAILED'); assert.equal(result.process.spawnCategory, 'ENOENT');
  assert.equal(result.reportStatus, 'MISSING');
});
test('R1 real Node reporter transport writes and validates only a single synthetic test', async t => {
  const root = await fixture(t), file = join(root, 'fixture.test.mjs');
  await writeFile(file, "import test from 'node:test';import assert from 'node:assert/strict';test('SECRET_SENTINEL',()=>{console.log('SECRET_SENTINEL');assert.fail('SECRET_SENTINEL')});");
  const result = await runReportedProcess({ executable: process.execPath, args: ['--test'],
    config: { files: [file.replaceAll('\\', '/')], phase: 'unit' }, reporter: actualReporter,
    cwd: root, env: { PATH: process.env.PATH }, root, timeoutMs: 10000 });
  assert.equal(result.category, 'TEST_FAILURE'); assert.equal(result.reportStatus, 'VALID');
  assert.equal(result.report.failures.length, 1); assert(!JSON.stringify(result).includes('SECRET_SENTINEL'));
});
test('R1 real broken reporter yields process failure and non-valid report, not PASS', async t => {
  const root = await fixture(t), file = join(root, 'fixture.test.mjs'), broken = join(root, 'broken.mjs');
  await writeFile(file, "import test from 'node:test';test('synthetic',()=>{});");
  await writeFile(broken, "export default async function*(){throw Error('SECRET_SENTINEL')}");
  const result = await runReportedProcess({ executable: process.execPath, args: ['--test'],
    config: { files: [file.replaceAll('\\', '/')], phase: 'unit' }, reporter: broken,
    cwd: root, env: { PATH: process.env.PATH }, root, timeoutMs: 10000 });
  assert(!result.passed); assert.notEqual(result.reportStatus, 'VALID'); assert(!JSON.stringify(result).includes('SECRET_SENTINEL'));
});
test('R1 report reads reject directories and mismatched run identity', async t => {
  const root = await fixture(t), path = join(root, 'report'); await mkdir(path);
  assert.equal((await readReport(path, cfg, runId)).reportStatus, 'UNSAFE_FILE'); await rmdir(path);
  await writeFile(path, JSON.stringify(envelope(safe())));
  assert.equal((await readReport(path, cfg, 'b'.repeat(24))).reportStatus, 'INVALID_SCHEMA');
});
test('R1 symlink report is rejected on supported local filesystem', { skip: process.platform === 'win32' }, async t => {
  const root = await fixture(t), original = join(root, 'original'), link = join(root, 'link');
  await writeFile(original, JSON.stringify(envelope(safe()))); await symlink(original, link);
  assert.equal((await readReport(link, cfg, runId)).reportStatus, 'UNSAFE_FILE');
});
test('R1 unit and DB callers retain process report without stdout JSON/assertion collapse', async () => {
  for (const path of ['../test/persistent-authorization/r10/unit.mjs', '../test/persistent-authorization/database-tests.mjs']) {
    const source = await import('node:fs/promises').then(fs => fs.readFile(new URL(path, import.meta.url), 'utf8'));
    assert(source.includes('runReportedProcess')); assert(!source.includes('JSON.parse(output.stdout'));
    assert(!source.includes('JSON.parse(error.stdout'));
  }
});
test('R1 child output limit and timeout before report remain separately classified', async t => {
  const root = await fixture(t);
  const output = await runReportedProcess({ executable: process.execPath,
    args: ['-e', "process.stdout.write('SECRET_SENTINEL'.repeat(1000));setTimeout(()=>{},10000)", '--'],
    config: cfg, reporter: actualReporter, cwd: root, env: { PATH: process.env.PATH }, root, timeoutMs: 5000, outputBudget: 64 });
  assert.equal(output.category, 'PROCESS_OUTPUT_LIMIT'); assert(!output.passed);
  assert(!JSON.stringify(output).includes('SECRET_SENTINEL'));
  const missing = await fake(t, 'missing', 0, { wait: true, timeoutMs: 500 });
  assert.equal(missing.category, 'PROCESS_TIMEOUT'); assert.equal(missing.reportStatus, 'MISSING');
});
test('R1 fixed permission/syntax causes survive projections without their original messages', async () => {
  const report = await collect([{ type: 'test:fail', data: { file, nesting: 0, details: { error: {
    code: 'ERR_TEST_FAILURE', message: 'SECRET_SENTINEL', cause: { code: 'ERR_MODULE_NOT_FOUND', message: 'SECRET_SENTINEL' } } } } }], cfg);
  const result = projectEvidence('unit-tests.json', { passed: false, report });
  assert.equal(result.report.failures[0].category, 'ERR_TEST_FAILURE');
  assert.equal(result.report.failures[0].cause, 'ERR_MODULE_NOT_FOUND'); assert(!JSON.stringify(result).includes('SECRET_SENTINEL'));
});
test('R1 permission-denied file reads have explicit ACCESS_DENIED status', { skip: process.platform === 'win32' || process.getuid() === 0 }, async t => {
  const root = await fixture(t), path = join(root, 'blocked.json');
  await writeFile(path, JSON.stringify(envelope(safe()))); await chmod(path, 0);
  try { assert.equal((await readReport(path, cfg, runId)).reportStatus, 'ACCESS_DENIED'); }
  finally { await chmod(path, 0o600); }
});
// Original R1 pnpm positive probe (including its failing assertions) is retained
// in persistent-pnpm-r1.legacy-probe.mjs, not the selected R11 Node launch gate.
test('R1 successful test process cannot replace a later database gate failure', async () => {
  const process = decideReportedProcess(completed, { reportStatus: 'VALID', report: safe() });
  const item = await collectScenarioResult('database', async () => { throw Object.assign(Error('SECRET_SENTINEL'), {
    stdout: JSON.stringify({ passed: false, category: 'DATABASE_REGRESSION_FAILED', reportedProcess: process }) }); });
  assert(!item.passed); assert.equal(item.diagnostic.category, 'DATABASE_REGRESSION_FAILED');
  assert.equal(item.diagnostic.reportedProcess.category, 'PASS');
  assert(!JSON.stringify(item).includes('SECRET_SENTINEL'));
});
