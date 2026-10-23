import assert from 'node:assert/strict';import {writeFile} from 'node:fs/promises';import {resolve} from 'node:path';import {spawn} from 'node:child_process';import {EventEmitter,once} from 'node:events';import {safeEnvelope,envelope} from './envelope.mjs';import {collectR5Child} from './collector.mjs';import {fakeApis} from '../r3/fakes.mjs';import {installGuard} from '../r5/guard-core.mjs';
const checks=[],fixtureResults=[],NODE=process.execPath;
const guard=installGuard({...fakeApis(),allowedPorts:[39991]}),detail={testPhase:'guard_diagnostic',phase:'MAIN_IMPORT_AND_STARTUP_COMPLETE',category:'NONE',guard:guard.snapshot()},valid=envelope(detail,guard);assert(safeEnvelope(valid));checks.push({name:'separate_R5_envelope_valid',passed:true});
for(const[name,m]of [['old_message',detail],['missing_count',{testPhase:'r5_guard_diagnostic',detail}],['extra_field',{...valid,secret:'SECRET_SENTINEL'}],['invalid_count',{...valid,normalization:{...valid.normalization,ipv4:NaN}}],['unknown_mode',{...valid,normalization:{...valid.normalization,mode:'SECRET_SENTINEL'}}],['extra_inner_field',{...valid,normalization:{...valid.normalization,secret:'SECRET_SENTINEL'}}]]){assert.equal(safeEnvelope(m),null);checks.push({name:'reject_'+name,passed:true});}
const env={};for(const k of ['SystemRoot','WINDIR','ComSpec','PATHEXT','Path','PATH','TEMP','TMP'])if(process.env[k]!==undefined)env[k]=process.env[k];
for(const mode of ['success','deny','hang','invalid','silent']){
 const child=spawn(NODE,[resolve('/harness/r8/wiring-fixture.mjs'),mode],{env,stdio:['ignore','ignore','ignore','ipc'],windowsHide:true});
 const r=await collectR5Child(child,{deadlineMs:1200,snapshotGraceMs:250});
 if(child.exitCode===null){const closed=once(child,'close');child.kill();await Promise.race([closed,new Promise((_,reject)=>setTimeout(()=>reject(Error('FIXTURE_STOP_TIMEOUT')),1500).unref())]);}
 assert.equal(r.passed,mode==='success');if(['success','deny','hang'].includes(mode))assert.equal(r.normalizationSnapshot.ipv4,1);
 if(mode==='deny')assert.equal(r.category,'TEST_EGRESS_DENIED');if(['hang','silent'].includes(mode)){assert.equal(r.category,'TIMEOUT');assert.equal(r.snapshotReceived,mode==='hang');assert.equal(r.evidenceComplete,false);}
 if(mode==='invalid')assert.equal(r.evidenceComplete,false);assert(!JSON.stringify(r).includes('SECRET_SENTINEL'));fixtureResults.push({mode,...r,ownedSyntheticChildStopped:true});checks.push({name:'actual_IPC_'+mode,passed:true});
}
for(const mode of ['decreasing','overflow','prior_failure']){
 const child=new EventEmitter();child.send=()=>{};const task=collectR5Child(child,{deadlineMs:100});const m=count=>({...valid,normalization:{...valid.normalization,ipv4:count}});
 if(mode==='decreasing'){child.emit('message',m(2));child.emit('message',m(1));}
 if(mode==='overflow')for(let i=0;i<17;i++)child.emit('message',m(i));
 if(mode==='prior_failure'){child.emit('message',{...m(0),detail:{...detail,phase:'MAIN_IMPORT_AND_STARTUP_FAILED',category:'TEST_EGRESS_DENIED'}});child.emit('message',m(1));}
 child.emit('close',0);const r=await task;assert.equal(r.passed,false);assert(r.envelopes.length<=16);checks.push({name:'reject_'+mode,passed:true});
}
const result={passed:true,checks,fixtureResults,realMainExecuted:false,dockerAccessed:false,databaseConnected:false,nativeNetworkExecuted:false,allSyntheticChildrenStopped:true};assert(!JSON.stringify(result).includes('SECRET_SENTINEL'));await writeFile(resolve(process.argv[2],'wiring-tests.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({...result,checks:undefined,fixtureResults:undefined,checkCount:checks.length}));
