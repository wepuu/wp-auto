import assert from 'node:assert/strict';
import test from 'node:test';
import {boundedJson,aggregate} from './e2e-readonly-transport.mjs';
const options={expectedStatus:'SYNTHETIC_PASS',runId:'fixture'};
test('bounded real local child, no SSH/network',async()=>{
  const r=await boundedJson(process.execPath,['-e','process.stdout.write(JSON.stringify({passed:true,status:"SYNTHETIC_PASS",runId:"fixture"}))'],options);assert.equal(r.passed,true);
});
for(const [name,execute] of [
  ['denied',async()=>{throw Object.assign(Error('SECRET_SENTINEL'),{code:'EACCES'})}],
  ['timeout',async()=>{throw Object.assign(Error('SECRET_SENTINEL'),{code:'ETIMEDOUT'})}],
  ['nonzero',async()=>{throw Object.assign(Error('SECRET_SENTINEL'),{code:1,stdout:'SECRET_SENTINEL',stderr:'SECRET_SENTINEL'})}],
  ['bad JSON',async()=>({stdout:'SECRET_SENTINEL'})],
  ['oversized',async()=>({stdout:'SECRET_SENTINEL'.repeat(10000)})],
  ['wrong identity',async()=>({stdout:JSON.stringify({passed:true,status:'SYNTHETIC_PASS',runId:'other'})})],
  ['partial success',async()=>({stdout:JSON.stringify({passed:false,status:'SYNTHETIC_PASS',runId:'fixture'})})]
])test(name,async()=>{const r=await boundedJson('not-executed',[],{...options,execute});assert.equal(r.passed,false);assert.equal(JSON.stringify(r).includes('SECRET_SENTINEL'),false)});
test('real timeout and nonzero do not dump child output',async()=>{
  for(const code of ['process.stderr.write("SECRET_SENTINEL");process.exit(7)','setTimeout(()=>{},5000)']){
    const r=await boundedJson(process.execPath,['-e',code],{...options,timeout:100});assert.equal(r.passed,false);assert.equal(JSON.stringify(r).includes('SECRET_SENTINEL'),false);
  }
});
test('success unknown fields are not dumped',async()=>{
  const execute=async()=>({stdout:JSON.stringify({passed:true,status:'SYNTHETIC_PASS',runId:'fixture',unknown:'SECRET_SENTINEL'})});
  const r=await boundedJson('not-executed',[],{...options,execute});assert.equal(r.passed,true);assert.equal(JSON.stringify(r).includes('SECRET_SENTINEL'),false);
});
test('nonzero preserves only correlated fixed failure and gate metrics',async()=>{
  const execute=async()=>{throw Object.assign(Error('SECRET_SENTINEL'),{code:1,stdout:JSON.stringify({passed:false,status:'R1_READONLY_NOT_CONFIRMED',runId:'fixture',stage:'resource',category:'RESOURCE_PRESSURE',resourceAtGate:{memAvailableKiB:500000,memoryFullAvg10:2,raw:'SECRET_SENTINEL'},raw:'SECRET_SENTINEL'})})};
  const r=await boundedJson('not-executed',[],{...options,execute});assert.equal(r.passed,false);assert.equal(r.result.resourceAtGate.memAvailableKiB,500000);assert.equal(JSON.stringify(r).includes('SECRET_SENTINEL'),false);
});
test('all stages, same run/hash and bounded window required',()=>{
  const opts={startedMs:100,endedMs:200,runId:'fixture',manifestSha256:'a'.repeat(64)};
  const stages=Object.fromEntries(['resource','platform','metadata','desktop','wordpress','ending'].map(n=>[n,{passed:true,runId:opts.runId,manifestSha256:opts.manifestSha256}]));
  assert.equal(aggregate(stages,opts).passed,true);
  for(const name of Object.keys(stages)){
    for(const change of [{passed:false},{runId:'old'},{manifestSha256:'old'}])assert.equal(aggregate({...stages,[name]:{...stages[name],...change}},opts).passed,false);
    const missing={...stages};delete missing[name];assert.equal(aggregate(missing,opts).passed,false);
  }
  assert.equal(aggregate(stages,{...opts,endedMs:900101}).passed,false);
});
