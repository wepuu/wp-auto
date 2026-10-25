// Synthetic helpers only; no Docker or application imports.
import assert from 'node:assert/strict';
import {readFile,mkdtemp,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {reporterSpecifier,safeFailure,syntheticReporterChild} from '../test/persistent-authorization/r31/synthetic-child.mjs';
import {lintProjection,testProjection,testsPass,allPass} from '../test/persistent-authorization/r31/results.mjs';
import {observe} from '../test/persistent-authorization/r29/diagnostics.mjs';
let checks=0;const check=f=>{f();checks++;};const secret='SENSITIVE_SYNTHETIC_SENTINEL';
let stage='projection_assertions';
try {
const targets=['packages/database/src/index.ts','packages/database/test/authorization-consume-mapping.test.ts'];
const lint=targets.map(f=>({filePath:'/workspace/'+f,messages:[],errorCount:0,warningCount:0,fatalErrorCount:0}));
check(()=>assert(lintProjection(lint,targets).passed));
for(const rows of [null,[],[lint[0],lint[0]],[lint[0],{...lint[1],filePath:'/secret'}]])check(()=>assert.throws(()=>lintProjection(rows,targets)));
const bad=structuredClone(lint);bad[0].messages=[{severity:2,ruleId:'@typescript-eslint/no-explicit-any',line:3,column:2,message:secret,source:secret}];bad[0].errorCount=1;
check(()=>assert(!lintProjection(bad,targets).passed));check(()=>assert(!JSON.stringify(lintProjection(bad,targets)).includes(secret)));
const counts={tests:19,passed:19,failed:0,cancelled:0,skipped:0,todo:0};
const events=Array.from({length:19},()=>({type:'test:pass',data:{}}));events.push({type:'test:summary',data:{counts}});
check(()=>assert(testsPass(testProjection(events))));
for(const key of ['tests','passed','failed','cancelled','skipped','todo']){
 const value=structuredClone(events);value.at(-1).data.counts[key]=key==='tests'||key==='passed'?18:1;
 check(()=>assert(!testsPass(testProjection(value))));
}
check(()=>assert(!testsPass(testProjection(events.slice(0,-1)))));
for(const field of ['skip','todo']){const e=structuredClone(events);e[0].data[field]=true;check(()=>assert(!testsPass(testProjection(e))));}
const stages=['runtime','input_baseline','config_parse','prerequisite_build','focused_typecheck','targeted_lint','mapping_tests','input_postcheck'].map(stage=>({stage,passed:true}));
check(()=>assert(allPass(stages)));for(let i=0;i<stages.length;i++){const s=structuredClone(stages);s[i].passed=false;check(()=>assert(!allPass(s)));}
const config=JSON.parse(await readFile('packages/database/test/tsconfig.consume-mapping.json','utf8'));
check(()=>assert.deepEqual(config,{extends:'./tsconfig.json',files:['authorization-consume-mapping.test.ts'],include:[]}));
const worker=await readFile('test/persistent-authorization/r31/worker.mjs','utf8');
for(const s of ['skipLibCheck===false',"['lib.es2024.d.ts']",'ts.createProgram(parsed.fileNames,parsed.options)','sourceFiles:files.map',"'--test-concurrency=1'",'add(stage,check.typecheckPass,check)'])check(()=>assert(worker.includes(s)));
for(const s of ['skipLibCheck:true','@ts-ignore','pnpm install','new Database('])check(()=>assert(!worker.includes(s)));
const runner=await readFile('scripts/run-r31-focused.mjs','utf8');
for(const s of ['SOURCE_CHANGED','--pull=never','--network','none','readonly','inputsUnchanged','verifyDiskBudget'])check(()=>assert(runner.includes(s)));
// Real synthetic child for timeout, nonzero, and output cap propagation.
for(const [args,timeout,maxBytes,category] of [
 [['-e','setTimeout(()=>{},1000)'],30,262144,'TIMEOUT'],
 [['-e',`console.log(${JSON.stringify(secret)});process.exitCode=1`],3000,262144,'DIAGNOSTIC_INCOMPLETE'],
 [['-e',"console.log('x'.repeat(20000))"],3000,100,'OUTPUT_LIMIT']]){
 const r=await observe({executable:process.execPath,args,cwd:process.cwd(),env:{},timeoutMs:timeout,maxBytes});
 check(()=>assert(!r.typecheckPass));check(()=>assert.equal(r.category,category));check(()=>assert(!JSON.stringify(r).includes(secret)));
}
// Actual Node reporter wiring with harmless synthetic test, not target tests.
const dir=await mkdtemp(path.join(tmpdir(),'wepuu-r31-reporter-')),file=path.join(dir,'dummy.test.mjs');
await writeFile(file,"import test from 'node:test'; test('dummy',()=>{});\n");
stage='reporter_paths';
for(const filePath of ['D:\\Codex项目\\space dir\\reporter#%.mjs','C:\\tmp\\reporter.mjs']) {
 const url=pathToFileURL(filePath,{windows:true});
 check(()=>assert.equal(url.protocol,'file:'));check(()=>assert.equal(fileURLToPath(url,{windows:true}),filePath));
 check(()=>assert(!url.search&&!url.hash));
}
const posix='/tmp/中文 space/reporter#%.mjs',posixUrl=pathToFileURL(posix,{windows:false});
check(()=>assert.equal(fileURLToPath(posixUrl,{windows:false}),posix));check(()=>assert(!posixUrl.hash&&!posixUrl.search));
check(()=>assert.equal(new URL(reporterSpecifier('test/persistent-authorization/r31/reporter.mjs')).protocol,'file:'));
stage='real_reporter_load';
const child=await syntheticReporterChild({reporter:reporterSpecifier('test/persistent-authorization/r31/reporter.mjs'),file});
check(()=>assert(child.passed));const r=child.result;check(()=>assert.equal(r.passed,1));check(()=>assert.equal(r.summaryCounts.tests,1));check(()=>assert(!testsPass(r)));
stage='intentional_loader_failure';
const denied=await syntheticReporterChild({reporter:'d:/unsupported/'+secret+'.mjs',file});
check(()=>assert(!denied.passed));check(()=>assert.equal(denied.category,'CHILD_NONZERO_EXIT'));check(()=>assert.notEqual(denied.exitCode,0));check(()=>assert(!JSON.stringify(denied).includes(secret)));
stage='failure_projection';
for(const [error,category]of [
 [{code:1,stderr:secret,stdout:secret,message:secret,stack:secret},'CHILD_NONZERO_EXIT'],
 [{code:'ENOENT',message:secret},'CHILD_SPAWN_FAILED'],
 [{killed:true,signal:'SIGTERM',message:secret},'CHILD_TIMEOUT'],
 [{code:'ERR_CHILD_PROCESS_STDIO_MAXBUFFER',killed:true,stdout:secret},'CHILD_OUTPUT_LIMIT'],
 [{message:secret,stack:secret},'CHILD_NOT_CONFIRMED']]){
 const safe=safeFailure(error);check(()=>assert.equal(safe.category,category));check(()=>assert(!JSON.stringify(safe).includes(secret)));
 if(category==='CHILD_OUTPUT_LIMIT'){check(()=>assert.equal(safe.outputLimit,true));check(()=>assert.equal(safe.timedOut,false));check(()=>assert.equal(safe.passed,false));}
}
console.log(JSON.stringify({passed:true,checks,dockerInvoked:false,applicationTestsRun:false,syntheticChildOnly:true,fixturesRetained:true}));
}catch{
 console.log(JSON.stringify({passed:false,stage,checksCompleted:checks,category:'SYNTHETIC_ASSERTION_OR_EXECUTION_FAILED',rawOutputSuppressed:true,dockerInvoked:false,applicationTestsRun:false}));
 process.exitCode=1;
}
