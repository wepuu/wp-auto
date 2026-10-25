// Pure R35 tests: unchanged matrix/transition assertions, no Docker.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { abNextAllowed, scenarioOnce, budgets, ownedState, images } from './run-r35-ab.mjs';
import { verifyIntegrationImage, verifyCompiledIdentity } from './persistent-image-contract.mjs';
import { spawnSync } from 'node:child_process';
import { expectedChecks, verifyScenario, project } from '../test/persistent-authorization/r22/report.mjs';
import { expectedLedger } from '../packages/database/test/r17-migration-evidence.mjs';
let checks=0,stage='order';const check=fn=>{fn();checks++;};const prefix='synthetic';
try {
const passed=[{step:'matrix',passed:true,databaseSha256:'a'.repeat(64)}],stopped=[{name:prefix+'-matrix',stopped:true,exitCode:0,oomKilled:false}];
check(()=>assert(abNextAllowed('matrix',[],[],prefix)));
check(()=>assert(abNextAllowed('transition',passed,stopped,prefix)));
check(()=>assert(!abNextAllowed('transition',[{step:'matrix',passed:true}],stopped,prefix)));
for(const [step,results,cleanup] of [['matrix',passed,stopped],['transition',[],stopped],['transition',[{step:'matrix',passed:false}],stopped],
 ['transition',[{step:'startup',passed:true}],stopped],['transition',passed,[]],['transition',passed,[...stopped,...stopped]],
 ['startup',[],[]],['control',[],[]],['database',[],[]],['legacy',[],[]]])check(()=>assert(!abNextAllowed(step,results,cleanup,prefix)));
for(const mutate of [v=>v.name='unrelated',v=>v.stopped=false,v=>v.exitCode=1,v=>v.exitCode=null,v=>v.oomKilled=true]){
 const bad=structuredClone(stopped);mutate(bad[0]);check(()=>assert(!abNextAllowed('transition',passed,bad,prefix)));
}
const ledger=await expectedLedger('candidate');
function sample(step){return {passed:true,step,root:'/private/'+step+'-'+(step==='matrix'?'a':'b').repeat(12),explicitMigration:true,runtimePrivilegeSeparationPass:true,
 checks:[{name:'separate_explicit_migration_identity',passed:true},{name:'runtime_cannot_DDL_write_ledger_or_assume_migrator',passed:true}],
 ledgerBefore:ledger,ledgerAfter:ledger,schemaBefore:'a'.repeat(64),schemaAfter:'a'.repeat(64),
 matrix:{passed:true,checks:expectedChecks[step].map(name=>({name,passed:true})),protocolAssertionsPass:true,childEvidencePass:true,deadlineExceeded:false,
  authRequests:12,tokenRequests:15,mockDeliveriesObserved:step==='matrix'?2:1,elapsedMonotonicMs:500,
  cleanup:{childrenStopped:true,forcedOwnedChildTermination:false},startupEvidence:['A','B'].map(mode=>({mode,readyStatus:200,readinessRequestCount:1,
  ownedChildStopped:true,forcedOwnedChildTermination:false,observed:{passed:true,evidenceComplete:true,snapshotReceived:true,timedOut:false,exitCode:0}}))}};}
for(const [step,count]of [['matrix',37],['transition',17]]){
 const good=sample(step);check(()=>assert.equal(expectedChecks[step].length,count));check(()=>assert.equal(new Set(expectedChecks[step]).size,count));
 check(()=>assert(verifyScenario(good,step,ledger).passed));
 for(const mutate of [v=>v.passed=false,v=>v.step='control',v=>v.explicitMigration=false,v=>v.runtimePrivilegeSeparationPass=false,
  v=>v.checks.pop(),v=>v.ledgerBefore=[],v=>v.ledgerAfter=[],v=>v.schemaAfter='b'.repeat(64),v=>v.matrix.passed=false,
  v=>v.matrix.checks.pop(),v=>v.matrix.checks.push(v.matrix.checks[0]),v=>v.matrix.checks[0].name='SENSITIVE_SENTINEL',v=>v.matrix.checks[0].passed=false,
  v=>v.matrix.authRequests=21,v=>v.matrix.tokenRequests=31,v=>v.matrix.authRequests=NaN,v=>delete v.matrix.authRequests,
  v=>v.matrix.protocolAssertionsPass=false,v=>v.matrix.childEvidencePass=false,v=>v.matrix.deadlineExceeded=true,v=>v.matrix.cleanup.childrenStopped=false,
  v=>v.matrix.cleanup.forcedOwnedChildTermination=true,v=>v.matrix.startupEvidence.pop(),v=>v.matrix.startupEvidence[0].mode='B',
  v=>v.matrix.startupEvidence[0].readyStatus=401,v=>v.matrix.startupEvidence[0].readinessRequestCount=2,v=>v.matrix.startupEvidence[0].ownedChildStopped=false,
  v=>v.matrix.startupEvidence[0].forcedOwnedChildTermination=true,v=>v.matrix.startupEvidence[0].observed.passed=false,
  v=>v.matrix.startupEvidence[0].observed.snapshotReceived=false,v=>v.matrix.startupEvidence[0].observed.timedOut=true,v=>v.matrix.startupEvidence[0].observed.exitCode=1]){
  const bad=structuredClone(good);mutate(bad);check(()=>assert.throws(()=>verifyScenario(bad,step,ledger)));
 }
 let calls=0;const r=await scenarioOnce(step,async()=>{calls++;return JSON.stringify(good);},ledger);
 check(()=>assert(r.passed&&calls===1&&r.attempts===1));
 check(()=>assert.match(r.databaseSha256,/^[a-f0-9]{64}$/u));
 const nonzero=await scenarioOnce(step,async()=>{throw Object.assign(Error('SENSITIVE_SENTINEL'),{code:1,stdout:JSON.stringify(good)});},ledger);
 check(()=>assert(!nonzero.passed&&nonzero.transport.exitCode===1));
 const timeout=await scenarioOnce(step,async()=>{throw Object.assign(Error('SENSITIVE_SENTINEL'),{killed:true});},ledger);
 check(()=>assert(!timeout.passed&&timeout.category==='TRANSPORT_TIMEOUT'));
 const badReport=await scenarioOnce(step,async()=>'SENSITIVE_SENTINEL',ledger);
 check(()=>assert(!badReport.passed&&!JSON.stringify(badReport).includes('SENSITIVE_SENTINEL')));
 const partial=structuredClone(good);partial.passed=false;partial.matrix.passed=false;partial.matrix.stage='refresh_replay';partial.matrix.category='ASSERTION_FAILED';
 const failure=await scenarioOnce(step,async()=>{throw Object.assign(Error('SENSITIVE_SENTINEL'),{code:1,stdout:JSON.stringify(partial)});},ledger);
 check(()=>assert(!failure.passed&&failure.evidence.matrix.stage==='refresh_replay'&&failure.evidence.matrix.category==='ASSERTION_FAILED'));
 check(()=>assert(!JSON.stringify(project({...good,payload:'SENSITIVE_SENTINEL',stderr:'SENSITIVE_SENTINEL',environment:'SENSITIVE_SENTINEL'})).includes('SENSITIVE_SENTINEL')));
 check(()=>assert.equal(budgets[step],300000));
}
const metadata={Name:'/owned',Config:{Labels:{'wepuu.phase':'r35-ab','wepuu.run':'run'}},State:{Running:false,ExitCode:0,OOMKilled:false}};
check(()=>assert(ownedState(metadata,'run','owned','r35-ab').stopped));
check(()=>assert.throws(()=>ownedState(metadata,'other','owned','r35-ab')));
stage='fixed_candidate';
const source=await readFile('scripts/run-r35-ab.mjs','utf8');
for(const marker of ["const abOnly=true, controlOnly=false","phase = 'r35-ab'","run = 'r35-'",'abNextAllowed(step,result.scenarios,result.cleanup,prefix)',"abOnly ? '1105aa0'",'item.ownedContainerStoppedAt=',"'scripts/run-r35-ab.mjs','scripts/r35-ab.synthetic.mjs'",'--pull=never','--internal','--read-only','no-new-privileges','imageRebuilt: false',"if (changed.length)"])check(()=>assert(source.includes(marker)));
check(()=>assert(!source.includes('buildx')));check(()=>assert(!source.includes('buildCandidate')));
check(()=>assert.equal(images.authorization,'sha256:e4212dd53144d8006a431b027da85266e9f7d0bd7a7431a68701b73367fd14bb'));
check(()=>assert.equal(images.control,'sha256:8c5c30e26f4b005d29a2e23819613ea9ccfeca96c09ad48840d312e61aacb22d'));
check(()=>assert.equal(images.test,'sha256:0fea6c08b7130b17e50adc8f96602b48ae0ee58afbd2039465953eb36eb99ca9'));
const revision='1df4c857e667398ac71487f352fc3daa7ddbac8a';
for(const [role,id]of Object.entries(images)){
 const metadata={Id:id,Os:'linux',Architecture:'amd64',Config:{Labels:{'org.opencontainers.image.revision':revision},User:role==='test'?'root':'node',Cmd:role==='test'?['pnpm','check']:['node','apps/'+(role==='control'?'control-api':'authorization-service')+'/dist/main.js']}};
 check(()=>assert(verifyIntegrationImage([metadata],id,role,revision)));
 for(const mutate of [v=>v.Id='sha256:'+'a'.repeat(64),v=>v.Config.Labels['org.opencontainers.image.revision']='b'.repeat(40),v=>v.Config.Cmd=['node','migrate.js']]){
  const bad=structuredClone(metadata);mutate(bad);check(()=>assert.throws(()=>verifyIntegrationImage([bad],id,role,revision)));
 }
}
const probes=Array.from({length:3},()=>({version:'v24.22.1',lts:'Krypton',uid:1000,files:163,hash:'260d561e07cc1bf4a970f9a05de8759b344e0fbea53d27aa73ab88f3c9d77691'}));
check(()=>assert.equal(verifyCompiledIdentity(probes).fileCount,163));
const mixed=structuredClone(probes);mixed[0].hash='e26eb91d35d7735b97d6ad00a4f0aa87c340e0da221cfef31ee4d2db227d2373';check(()=>assert.throws(()=>verifyCompiledIdentity(mixed)));
const syntax=spawnSync(process.execPath,['--check','scripts/run-r35-ab.mjs'],{env:{},timeout:10000,maxBuffer:65536});check(()=>assert.equal(syntax.status,0));
stage='frozen_protocol';
const git=promisify(execFile);
for(const f of ['test/persistent-authorization/r8','test/persistent-authorization/driver.mjs','test/persistent-authorization/r22/report.mjs','test/persistent-authorization/r22/export.mjs']){
 const diff=await git('git',['diff','--name-only','1105aa0','--',f],{windowsHide:true});check(()=>assert.equal(diff.stdout.trim(),''));
}
console.log(JSON.stringify({passed:true,checks,expectedMatrixChecks:37,expectedTransitionChecks:17,formalAttempts:0,productionAccessed:false,dockerInvoked:false}));
}catch{console.log(JSON.stringify({passed:false,stage,checksCompleted:checks,category:'R35_SYNTHETIC_FAILURE',rawOutputSuppressed:true,dockerInvoked:false}));process.exitCode=1;}
