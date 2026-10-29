// Harmless local reporter and safety helpers only; no Docker or app imports.
import assert from 'node:assert/strict';
import {readFile,mkdtemp,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {testsPass} from '../test/persistent-authorization/r39/results.mjs';
import {testProjection,lintProjection,allPass} from '../test/persistent-authorization/r31/results.mjs';
import {safeFailure,syntheticReporterChild} from '../test/persistent-authorization/r31/synthetic-child.mjs';
let checks=0;const check=f=>{f();checks++;};let stage='counts';const sentinel='SENSITIVE_R39_SENTINEL';
try{
 const events=Array.from({length:43},()=>({type:'test:pass',data:{}}));events.push({type:'test:summary',data:{counts:{tests:43,passed:43,failed:0,cancelled:0,skipped:0,todo:0}}});
 check(()=>assert(testsPass(testProjection(events))));
 for(const key of ['tests','passed','failed','cancelled','skipped','todo']){const v=structuredClone(events);v.at(-1).data.counts[key]=key==='tests'||key==='passed'?42:1;check(()=>assert(!testsPass(testProjection(v))));}
 check(()=>assert(!testsPass(testProjection(events.slice(0,-1)))));
 for(const flag of ['skip','todo']){const v=structuredClone(events);v[0].data[flag]=true;check(()=>assert(!testsPass(testProjection(v))));}
 const failure=safeFailure({code:'ERR_CHILD_PROCESS_STDIO_MAXBUFFER',killed:true,stdout:sentinel});check(()=>assert.equal(failure.category,'CHILD_OUTPUT_LIMIT'));check(()=>assert(!JSON.stringify(failure).includes(sentinel)));
 const targets=['packages/database/src/index.ts','packages/database/test/authorization-consume-mapping.test.ts','packages/database/test/refresh-find-mapping.test.ts'];
 const lint=targets.map(file=>({filePath:'/workspace/'+file,messages:[],errorCount:0,warningCount:0,fatalErrorCount:0}));check(()=>assert(lintProjection(lint,targets).passed));
 check(()=>assert.throws(()=>lintProjection(lint.slice(1),targets)));
 const stages=['runtime','input_baseline','config_parse','prerequisite_build','focused_typecheck','targeted_lint','mapping_tests','input_postcheck'].map(stage=>({stage,passed:true}));check(()=>assert(allPass(stages)));for(let i=0;i<stages.length;i++){const v=structuredClone(stages);v[i].passed=false;check(()=>assert(!allPass(v)));}
 stage='wiring';const worker=await readFile('test/persistent-authorization/r39/worker.mjs','utf8'),runner=await readFile('scripts/run-r39-focused.mjs','utf8');
 const cfg=JSON.parse(await readFile('packages/database/test/tsconfig.refresh-find-mapping.json','utf8'));check(()=>assert.deepEqual(cfg,{extends:'./tsconfig.json',files:targets.slice(1).map(f=>path.basename(f)),include:[]}));
 for(const s of ['skipLibCheck===false',"['lib.es2024.d.ts']",'ts.createProgram(parsed.fileNames,parsed.options)','targets.slice(1)','testsPass(r)',"'--test-concurrency=1'",'verifyBaseline'])check(()=>assert(worker.includes(s)));
 for(const s of ['skipLibCheck:true','@ts-ignore','pnpm install','new Database('])check(()=>assert(!worker.includes(s)));
 for(const s of ['--network','none','--pull=never','readonly','inputsUnchanged',"['baseline','fixed']",'7a242df','test/persistent-authorization/r39/worker.mjs','r39/results.mjs'])check(()=>assert(runner.includes(s)));
 for(const s of ['docker pull','pnpm install','network create'])check(()=>assert(!runner.includes(s)));
 for(const f of ['scripts/run-r39-focused.mjs','scripts/r39-focused.synthetic.mjs','test/persistent-authorization/r39/worker.mjs','test/persistent-authorization/r39/results.mjs']){const r=spawnSync(process.execPath,['--check',f],{env:{},timeout:10000,maxBuffer:65536});check(()=>assert.equal(r.status,0));}
 stage='reporter';const dir=await mkdtemp(path.join(tmpdir(),'wepuu-r39-reporter-')),file=path.join(dir,'synthetic.test.mjs');
 await writeFile(file,"import test from 'node:test';for(let i=0;i<43;i++)test('synthetic',()=>{});\n",{flag:'wx'});
 const r=await syntheticReporterChild({reporter:pathToFileURL(path.resolve('test/persistent-authorization/r31/reporter.mjs')).href,file});
 check(()=>assert(r.passed));check(()=>assert(testsPass(r.result)));
 console.log(JSON.stringify({passed:true,checks,servicesStarted:false,databaseAccessed:false,dockerInvoked:false,applicationTestsExecuted:false}));
}catch{console.log(JSON.stringify({passed:false,stage,checksCompleted:checks,category:'R39_SYNTHETIC_FAILURE',rawOutputSuppressed:true}));process.exitCode=1;}
