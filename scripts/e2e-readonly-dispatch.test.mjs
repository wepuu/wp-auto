import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createReadOnlyRunner} from './e2e-readonly-runner.mjs';
import {prerequisiteNames,stageNames} from './e2e-readonly-dispatch.mjs';

const sha=v=>createHash('sha256').update(v).digest('hex');
function fixture() {
  const identity={candidateHead:'a'.repeat(40),manifestSha256:'b'.repeat(64),finalPhpSha256:'c'.repeat(64),runId:'synthetic-r2'};
  let utc=Date.parse('2026-10-20T00:00:00Z'),mono=0;
  const calls=[],records=[],jobs=prerequisiteNames.map(key=>{
    const sourceSha256=key==='finalGeneratedPhpSyntax'?identity.finalPhpSha256:sha(key);
    const environmentSha256=sha('environment');
    return {key,sourceSha256,environmentSha256,run:async()=>({passed:true,exitCode:0,sourceSha256,environmentSha256,
      receiptSha256:sha(key+'receipt'),completedAtUtc:new Date(utc).toISOString()})};
  });
  const plan=Object.fromEntries(stageNames.map(name=>[name,[{kind:name==='metadata'||name==='desktop'?'component':'ssh',
    mode:name,command:'synthetic-executable',args:[name]}]]));
  const controls={identity,jobs,plan,utcNow:()=>utc,monoNow:()=>mono,
    verifyFrozen:async()=>true,claim:async()=>true,persist:async(name,data)=>records.push({name,data}),
    execute:async(command,args,options)=>{
      calls.push({command,args,timeout:options.timeout,signal:options.signal});
      return {stdout:JSON.stringify({passed:true,status:'R1_READONLY_PASS',runId:identity.runId,manifestSha256:identity.manifestSha256,protectedBusinessSha256:'d'.repeat(64)})};
    },acceptedRead:()=>true,projectGate:v=>({passed:true,status:v.status,runId:v.runId,protectedBusinessSha256:v.protectedBusinessSha256})};
  return {controls,jobs,calls,records,identity,operator:()=>({accountsCorrect:true,wordpressReady:true,confirmedAtUtc:new Date(utc).toISOString()}),
    advance:ms=>{utc+=ms;mono+=ms;},make:()=>createReadOnlyRunner(controls)};
}
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};

test('actual runner has no individual-stage or force interface; run-before-ready executes zero processes',async()=>{
  const f=fixture(),r=f.make();assert.deepEqual(Object.keys(r).sort(),['prepare','run','snapshot']);
  assert.equal((await r.run(f.operator())).passed,false);assert.equal(f.calls.length,0);
  assert.equal((await r.prepare()).passed,false);assert.equal(r.snapshot().state,'STOPPED');
});
test('actual execution stays zero while any prerequisite is pending, even if all others passed',async()=>{
  const f=fixture(),d=deferred(),original=f.jobs[0].run;f.jobs[0].run=()=>d.promise;
  const r=f.make(),p=r.prepare();await new Promise(setImmediate);
  assert.equal(r.snapshot().state,'PREPARING');assert.equal(f.calls.length,0);
  const early=await r.run(f.operator());assert.equal(early.passed,false);assert.equal(f.calls.length,0);
  d.resolve(await original());assert.equal((await p).passed,false);assert.equal(f.calls.length,0);
});
test('allSettled waits for pending siblings after a rejected test; zero production calls',async()=>{
  const f=fixture(),d=deferred(),original=f.jobs[1].run;f.jobs[0].run=async()=>{throw Error('SECRET_SENTINEL');};f.jobs[1].run=()=>d.promise;
  let completed=false;const r=f.make(),p=r.prepare().then(x=>{completed=true;return x;});
  await new Promise(setImmediate);assert.equal(completed,false);assert.equal(f.calls.length,0);
  d.resolve(await original());assert.equal((await p).passed,false);assert.equal(f.calls.length,0);
  assert(!JSON.stringify(f.records).includes('SECRET_SENTINEL'));
});
for(const kind of ['passedFalse','nonzeroExit','wrongSource','wrongEnvironment','missingReceipt','lateCompletion','launchedOnly']) {
  test(`actual runner blocks ${kind} receipt before subprocess/network execution`,async()=>{
    const f=fixture(),original=f.jobs[0].run;f.jobs[0].run=async()=>{
      const r=await original();
      if(kind==='passedFalse')r.passed=false;
      if(kind==='nonzeroExit')r.exitCode=1;
      if(kind==='wrongSource')r.sourceSha256='e'.repeat(64);
      if(kind==='wrongEnvironment')r.environmentSha256='e'.repeat(64);
      if(kind==='missingReceipt')delete r.receiptSha256;
      if(kind==='lateCompletion')r.completedAtUtc='2099-01-01T00:00:00Z';
      if(kind==='launchedOnly')return {started:true};return r;
    };
    const r=f.make();assert.equal((await r.prepare()).passed,false);assert.equal((await r.run(f.operator())).passed,false);assert.equal(f.calls.length,0);
  });
}
test('missing/duplicate check, missing final PHP source cannot open actual transport',async()=>{
  for(const mutate of [f=>f.jobs.pop(),f=>f.jobs.push(f.jobs[0]),f=>{f.identity.finalPhpSha256='e'.repeat(64);}]) {
    const f=fixture();mutate(f);const r=f.make();assert.equal((await r.prepare()).passed,false);await r.run(f.operator());assert.equal(f.calls.length,0);
  }
});
test('frozen-source drift in READY and failed persistent claim execute zero processes',async()=>{
  for(const gate of ['verifyFrozen','claim']) {
    const f=fixture();let value=true;f.controls[gate]=async()=>value;
    const r=f.make();assert.equal((await r.prepare()).passed,true);value=false;
    assert.equal((await r.run(f.operator())).passed,false);assert.equal(f.calls.length,0);
  }
});
test('operator missing/expired/cancelled cannot start actual transport',async()=>{
  for(const mode of ['missing','expired','cancelled']) {
    const f=fixture(),cancel=new AbortController();f.controls.signal=cancel.signal;
    const r=f.make();await r.prepare();const operator=f.operator();
    if(mode==='missing')operator.accountsCorrect=false;
    if(mode==='expired')f.advance(300001);
    if(mode==='cancelled')cancel.abort();
    assert.equal((await r.run(operator)).passed,false);assert.equal(f.calls.length,0);
  }
});
test('actual callback executes sequentially only after completed receipts and stops terminally on phase failure',async()=>{
  const f=fixture(),execute=f.controls.execute;f.controls.execute=async(c,a,o)=>{
    const r=await execute(c,a,o);if(a[0]==='platform')throw Object.assign(Error('SECRET_SENTINEL'),{code:1,stdout:'SECRET_SENTINEL'});return r;
  };
  const r=f.make();assert.equal((await r.prepare()).passed,true);assert.equal(f.calls.length,0);
  assert.equal((await r.run(f.operator())).passed,false);assert.deepEqual(f.calls.map(x=>x.args[0]),['resource','platform']);
  await r.run(f.operator());assert.equal(f.calls.length,2);assert(!JSON.stringify(f.records).includes('SECRET_SENTINEL'));
});
test('one continuous run covers all six stages, underlying subprocess budget and no automatic rerun',async()=>{
  const f=fixture(),r=f.make();await r.prepare();assert.equal(f.calls.length,0);
  const out=await r.run(f.operator());assert.equal(out.passed,true);assert.equal(out.state,'COMPLETE');
  assert.deepEqual(f.calls.map(x=>x.args[0]),stageNames);assert(f.calls.every(x=>x.timeout>0&&x.timeout<=170000));
  await r.run(f.operator());assert.equal(f.calls.length,6);
});
test('monotonic deadline caps child timeout; a stage completing outside window cannot pass',async()=>{
  const f=fixture(),original=f.controls.execute;f.controls.execute=async(c,a,o)=>{const r=await original(c,a,o);f.advance(a[0]==='resource'?850000:50001);return r;};
  const r=f.make();await r.prepare();const out=await r.run(f.operator());assert.equal(out.passed,false);
  assert.equal(f.calls.length,2);assert(f.calls[1].timeout<=50000);
});
test('concurrent run fails closed, aborts owned child signal and never starts next stage',async()=>{
  const f=fixture(),d=deferred(),original=f.controls.execute;
  f.controls.execute=async(c,a,o)=>{const value=await original(c,a,o);await d.promise;return value;};
  const r=f.make();await r.prepare();const first=r.run(f.operator());await new Promise(setImmediate);
  assert.equal(f.calls.length,1);assert.equal((await r.run(f.operator())).passed,false);assert.equal(f.calls[0].signal.aborted,true);
  d.resolve();assert.equal((await first).passed,false);assert.equal(f.calls.length,1);
});
test('real local child nonzero exit/semantic failure cannot create READY, not merely a mocked receipt',async()=>{
  for(const mode of ['exit','semantic']) {
    const f=fixture();f.jobs[0].run=async()=>{
      const r=await promisify(execFile)(process.execPath,['-e',mode==='exit'?'process.exit(7)':'process.stdout.write(JSON.stringify({passed:false}))']);
      return JSON.parse(r.stdout);
    };
    const r=f.make();assert.equal((await r.prepare()).passed,false);assert.equal(f.calls.length,0);
  }
});
test('protected-state mismatch or changed source between phases stops with no later callback',async()=>{
  for(const mode of ['state','source']) {
    const f=fixture(),execute=f.controls.execute;
    f.controls.verifyFrozen=async()=>mode==='state'||f.calls.length<2;
    f.controls.execute=async(c,a,o)=>{const r=await execute(c,a,o);if(mode==='state'&&a[0]==='ending')r.stdout=r.stdout.replace('d'.repeat(64),'e'.repeat(64));return r;};
    const r=f.make();await r.prepare();assert.equal((await r.run(f.operator())).passed,false);assert.equal(f.calls.length,mode==='state'?6:2);
  }
});
