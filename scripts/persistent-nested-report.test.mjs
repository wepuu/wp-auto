import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, writeFile, readFile, readdir, unlink, rmdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { runReportedProcess, readReport, decideReportedProcess } from '../test/persistent-authorization/r10/reported-process.mjs';
import { validateReportEnvelope } from '../test/persistent-authorization/r10/report-schema.mjs';
const reporter = fileURLToPath(new URL('../test/persistent-authorization/r10/reporter.mjs', import.meta.url));
const transportUrl = new URL('../test/persistent-authorization/r10/reported-process.mjs', import.meta.url).href;
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'wepuu-r12-nested-'));
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
async function execute(t, source, options = {}) {
  const root = await fixture(t), file = join(root, 'fixture.mjs');
  await writeFile(file, source);
  const config = { files: [file], phase: 'unit' };
  const result = await runReportedProcess({ executable: process.execPath, args: ['--test'], config, reporter,
    cwd: root, root, env: { PATH: process.env.PATH, TMPDIR: tmpdir() }, timeoutMs: options.timeoutMs ?? 10000 });
  return { root, file, config, result };
}

test('R12 standalone and inherited outer envelope both retain dedicated-file PASS', async t => {
  const prior = { run: process.env.WEPUU_R10_REPORT_RUN_ID, config: process.env.WEPUU_R10_REPORT_CONFIG,
    secret: process.env.SYNTHETIC_SECRET };
  try {
    for (const inherited of [false, true]) {
      if (inherited) {
        process.env.WEPUU_R10_REPORT_RUN_ID = 'b'.repeat(24);
        process.env.WEPUU_R10_REPORT_CONFIG = 'SECRET_SENTINEL'; process.env.SYNTHETIC_SECRET = 'SECRET_SENTINEL';
      } else { delete process.env.WEPUU_R10_REPORT_RUN_ID; delete process.env.WEPUU_R10_REPORT_CONFIG; }
      const { result, config } = await execute(t, `import test from 'node:test';import assert from 'node:assert/strict';
        test('SECRET_SENTINEL',()=>{assert.equal(process.env.SYNTHETIC_SECRET,undefined);console.log('SECRET_SENTINEL')});`);
      assert.equal(result.category, 'PASS'); assert.equal(result.reportStatus, 'VALID');
      const value = JSON.parse(await readFile(join(result.reportDirectory, 'result.json'), 'utf8'));
      assert.notEqual(value.runId, 'b'.repeat(24));
      assert.equal(validateReportEnvelope(value, config, value.runId).report.passed, true);
      assert(!JSON.stringify(result).includes('SECRET_SENTINEL'));
    }
  } finally {
    for (const [key, value] of [['WEPUU_R10_REPORT_RUN_ID', prior.run], ['WEPUU_R10_REPORT_CONFIG', prior.config], ['SYNTHETIC_SECRET', prior.secret]])
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
});

test('R12 actual outer-middle-leaf execution isolates both run IDs and private report directories', async t => {
  const root = await fixture(t), leaf = join(root, 'leaf.mjs'), middle = join(root, 'middle.mjs');
  await writeFile(leaf, "import test from 'node:test';test('synthetic',()=>{});");
  await writeFile(middle, `import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
    import {runReportedProcess} from ${JSON.stringify(transportUrl)};
    test('synthetic',async()=>{
      const outerId=process.env.WEPUU_R10_REPORT_RUN_ID;assert.match(outerId,/^[a-f0-9]{24}$/);
      const v=await runReportedProcess({executable:process.execPath,args:['--test'],
        config:{files:[${JSON.stringify(leaf)}],phase:'unit'},reporter:${JSON.stringify(reporter)},
        cwd:${JSON.stringify(root)},root:${JSON.stringify(root)},env:{PATH:process.env.PATH,TMPDIR:'/tmp'},timeoutMs:10000});
      assert.equal(v.category,'PASS');assert.equal(v.reportStatus,'VALID');
      const e=JSON.parse(await readFile(v.reportDirectory+'/result.json','utf8'));assert.notEqual(e.runId,outerId);
    });`);
  const config = { files: [middle], phase: 'unit' };
  const result = await runReportedProcess({ executable: process.execPath, args: ['--test'], config, reporter,
    cwd: root, root, env: { PATH: process.env.PATH, TMPDIR: tmpdir() }, timeoutMs: 20000 });
  assert.equal(result.category, 'PASS');
  const reports = [];
  for (const e of await readdir(root, { withFileTypes: true })) if (e.isDirectory()) {
    reports.push(JSON.parse(await readFile(join(root, e.name, 'result.json'), 'utf8')));
  }
  assert.equal(reports.length, 2); assert.equal(new Set(reports.map(v => v.runId)).size, 2);
  assert.deepEqual(reports.map(v => v.report.fileCount), [1, 1]);
  assert.deepEqual(reports.map(v => v.report.phase), ['unit', 'unit']);
});

test('R12 nested assertion and missing-module failures remain VALID and fail closed', async t => {
  for (const source of ["import test from 'node:test';import assert from 'node:assert/strict';test('synthetic',()=>assert.fail('SECRET_SENTINEL'));",
    "import 'wepuu-r12-synthetic-missing-module';"]) {
    const { result } = await execute(t, source);
    assert.equal(result.category, 'TEST_FAILURE'); assert.equal(result.reportStatus, 'VALID');
    assert.equal(result.process.exitCode, 1); assert(!JSON.stringify(result).includes('SECRET_SENTINEL'));
  }
});

test('R12 nested report rejects wrong run, phase, file and damaged data without stdout fallback', async t => {
  const { result, config, file } = await execute(t, "import test from 'node:test';test('synthetic',()=>{});");
  const path = join(result.reportDirectory, 'result.json'), original = JSON.parse(await readFile(path, 'utf8'));
  for (const v of [{ ...original, runId: 'c'.repeat(24) },
    { ...original, report: { ...original.report, phase: 'database' } },
    { ...original, report: { ...original.report, missing: [file + '.unknown'] } }]) {
    await writeFile(path, JSON.stringify(v));
    assert.equal((await readReport(path, config, original.runId)).reportStatus, 'INVALID_SCHEMA');
  }
  await writeFile(path, 'SECRET_SENTINEL');
  assert.equal((await readReport(path, config, original.runId)).reportStatus, 'INVALID_JSON');
  await unlink(path);
  assert.equal((await readReport(path, config, original.runId)).reportStatus, 'MISSING');
  // Keep cleanup exact and idempotent after this deliberately missing-report case.
  await writeFile(path, JSON.stringify(original));
});

test('R12 a passing report cannot cover nonzero exit, signal or timeout', async t => {
  const { result } = await execute(t, "import test from 'node:test';test('synthetic',()=>{});");
  for (const [patch, category] of [[{ exitCode: 9 }, 'PROCESS_EXIT_NONZERO'],
    [{ signal: 'SIGTERM' }, 'PROCESS_SIGNAL'], [{ timedOut: true }, 'PROCESS_TIMEOUT']]) {
    const v = decideReportedProcess({ ...result.process, ...patch }, { reportStatus: 'VALID', report: result.report });
    assert.equal(v.category, category); assert.equal(v.passed, false);
  }
  const { result: timeout } = await execute(t,
    "import test from 'node:test';test('synthetic',()=>new Promise(r=>setTimeout(r,10000)));", { timeoutMs: 500 });
  assert.equal(timeout.category, 'PROCESS_TIMEOUT'); assert.equal(timeout.passed, false);
});
