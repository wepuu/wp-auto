import assert from 'node:assert/strict';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { runReportedProcess } from '../r10/reported-process.mjs';
import { fixedNodeTestCommand } from '../r10/fixed-node-test.mjs';
import {verifyUnits,pureMapping} from './profiles.mjs';
let result, stage = 'manifest';
try {
const files = [];
for (const kind of ['packages', 'apps']) {
  for (const name of await readdir('/workspace/' + kind)) {
    const dir = `${kind}/${name}/${kind === 'packages' ? 'test' : 'src'}`;
    let entries; try { entries = await readdir('/workspace/' + dir); } catch { continue; }
    files.push(...entries.filter(f => f.endsWith('.test.ts')).map(f => dir + '/' + f));
  }
}
files.push(...(await readdir('/workspace/scripts')).filter(f => f.endsWith('.test.mjs')).map(f => 'scripts/' + f));
files.sort(); assert(files.length > 30);
const frozen = JSON.parse(await readFile('/harness/r68/unit-manifest.json', 'utf8'));
verifyUnits(files,frozen,JSON.parse(await readFile('/harness/r43/unit-manifest.json','utf8')));
  stage = 'fixed_runtime';
  const command = await fixedNodeTestCommand();
  stage = 'unit_process';
  result = await runReportedProcess({ executable: command.executable, args: command.args,
    config: { files, phase: 'unit' }, reporter: '/harness/r10/reporter.mjs', cwd: '/workspace', timeoutMs: 240000,
    env: { PATH: process.env.PATH, TMPDIR: '/tmp' } });
  assert(result.passed,'FULL_UNIT_FAILED');
  stage='pure_mapping_counts';
  const mapped=await runReportedProcess({executable:command.executable,args:command.args,
    config:{files:Object.keys(pureMapping).map(f=>'packages/database/test/'+f),phase:'unit',expectedTopLevel:pureMapping},
    reporter:'/harness/r10/reporter.mjs',cwd:'/workspace',timeoutMs:30000,env:{PATH:process.env.PATH,TMPDIR:'/tmp'}});
  result.mappingCounts=mapped;assert(mapped.passed,'MAPPING_COUNTS_FAILED');
} catch (error) {
  const failed=result?.mappingCounts?.passed===false?result.mappingCounts:result?.passed===false?result:undefined;
  result = { ...(result??{}),passed: false, category: failed?.category??'REPORT_SETUP_FAILED', stage,
    ...(error.code === 'TEST_RUNTIME_MISMATCH' ? { runtimeGate: 'MISMATCH' } : {}),
    reportStatus: 'NOT_CONFIRMED', rawOutputSuppressed: true };
}
try { await writeFile('/evidence/unit-tests.json', JSON.stringify(result) + '\n', { flag: 'wx', mode: 0o600 }); }
catch { result.passed = false; result.category = 'RESULT_SAVE_FAILED'; }
console.log(JSON.stringify(result)); if (!result.passed) process.exitCode = 1;
