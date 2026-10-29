// Pure R41 tests: frozen checks, fixed R40 candidate, safe reports and ordering.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { abNextAllowed, scenarioOnce, budgets, ownedState, images } from './run-r41-ab.mjs';
import { verifyIntegrationImage, verifyCompiledIdentity } from './persistent-image-contract.mjs';
import { spawnSync } from 'node:child_process';
import {expectedChecks,verifyScenario,project} from '../test/persistent-authorization/r41/report.mjs';
import {buildMatrix,buildTransition,buildDriver} from '../test/persistent-authorization/r41/scenario-source.mjs';
import {createHash} from 'node:crypto';
import {verifyCandidate,compiledSha} from '../test/persistent-authorization/r41/contract.mjs';
import {sourceManifest,recipeSha,databaseSourceSha} from '../test/persistent-authorization/r40/contract.mjs';
const hash=v=>createHash('sha256').update(v).digest('hex');
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
function sample(step){const state={links:1,artifacts:1,classifications:1,accessTokens:0,refreshTokens:1,consumed:0};const e={stage:'missing_rt_postcheck',authorizeCompleted:true,authorizationCodePresent:true,fixtureReady:true,linkDeleted:true,refreshCompleted:true,denialVerified:true,postcheckVerified:true,deletedRows:1,fixtureExchange:{status:200,error:'NOT_OBSERVED',accessTokenPresent:true,refreshTokenPresent:true},refresh:{status:400,error:'invalid_grant',accessTokenPresent:false,refreshTokenPresent:false},refreshJsonParsed:true,before:state,afterDelete:{...state,links:0},after:{...state,links:0}};return {passed:true,step,root:'/private/'+step+'-'+(step==='matrix'?'a':'b').repeat(12),explicitMigration:true,runtimePrivilegeSeparationPass:true,
 checks:[{name:'separate_explicit_migration_identity',passed:true},{name:'runtime_cannot_DDL_write_ledger_or_assume_migrator',passed:true}],
 ledgerBefore:ledger,ledgerAfter:ledger,schemaBefore:'a'.repeat(64),schemaAfter:'a'.repeat(64),
 matrix:{passed:true,...(step==='matrix'?{missingRtEvidence:e}:{}),serviceLogs:['A','B'].map(mode=>({mode,stdout:{overflow:false,events:[]},stderr:{overflow:false,events:[]}})),checks:expectedChecks[step].map(name=>({name,passed:true})),protocolAssertionsPass:true,childEvidencePass:true,deadlineExceeded:false,
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
const metadata={Name:'/owned',Config:{Labels:{'wepuu.phase':'r41-ab','wepuu.run':'run'}},State:{Running:false,ExitCode:0,OOMKilled:false}};
check(()=>assert(ownedState(metadata,'run','owned','r41-ab').stopped));
check(()=>assert.throws(()=>ownedState(metadata,'other','owned','r41-ab')));
stage='fixed_candidate';
const source=await readFile('scripts/run-r41-ab.mjs','utf8');
for(const marker of ["const abOnly=true, controlOnly=false","phase = 'r41-ab'","run = 'r41-'",'abNextAllowed(step,result.scenarios,result.cleanup,prefix)',"abOnly ? 'ab29f07'",'item.ownedContainerStoppedAt=',"'scripts/run-r41-ab.mjs','scripts/r41-ab.synthetic.mjs'",'--pull=never','--internal','--read-only','no-new-privileges','imageRebuilt: false',"if (changed.length)"])check(()=>assert(source.includes(marker)));
check(()=>assert(!source.includes('buildx')));check(()=>assert(!source.includes('buildCandidate')));
check(()=>assert.equal(images.authorization,'sha256:a5062dbc9f3fb52b9eeecd6ba5d8273cc5ac223a09fa3c07d632f48356a7eaaa'));
check(()=>assert.equal(images.control,'sha256:93577d94ba77b0f1f6c5350ef29b8f8809e67c5dabb1b5589b16bd104d0ed937'));
check(()=>assert.equal(images.test,'sha256:f22b9a507d6d713f678fe5d35a6c83b9324572503c1dbba28cd0433f5348d7c9'));
const revision='2ab57076511732fb2b2fbb1c50a03ee6c59ece4d';
for(const [role,id]of Object.entries(images)){
 const metadata={Id:id,Os:'linux',Architecture:'amd64',Config:{Labels:{'org.opencontainers.image.revision':revision},User:role==='test'?'root':'node',Cmd:role==='test'?['pnpm','check']:['node','apps/'+(role==='control'?'control-api':'authorization-service')+'/dist/main.js']}};
 check(()=>assert(verifyIntegrationImage([metadata],id,role,revision)));
 for(const mutate of [v=>v.Id='sha256:'+'a'.repeat(64),v=>v.Config.Labels['org.opencontainers.image.revision']='b'.repeat(40),v=>v.Config.Cmd=['node','migrate.js']]){
  const bad=structuredClone(metadata);mutate(bad);check(()=>assert.throws(()=>verifyIntegrationImage([bad],id,role,revision)));
 }
}
const probes=Array.from({length:3},()=>({version:'v24.22.1',lts:'Krypton',uid:1000,files:163,hash:'6179918471d90689ce8693ee1423488bfcb1fcd48b357ac01a8c7963cb86b35d'}));
check(()=>assert.equal(verifyCompiledIdentity(probes).fileCount,163));
const mixed=structuredClone(probes);mixed[0].hash='e26eb91d35d7735b97d6ad00a4f0aa87c340e0da221cfef31ee4d2db227d2373';check(()=>assert.throws(()=>verifyCompiledIdentity(mixed)));
const syntax=spawnSync(process.execPath,['--check','scripts/run-r41-ab.mjs'],{env:{},timeout:10000,maxBuffer:65536});check(()=>assert.equal(syntax.status,0));
stage='frozen_protocol';
const git=promisify(execFile);
for(const f of ['test/persistent-authorization/r8','test/persistent-authorization/driver.mjs','test/persistent-authorization/r22/report.mjs','test/persistent-authorization/r22/export.mjs']){
 const diff=await git('git',['diff','--name-only','ab29f07','--',f],{windowsHide:true});check(()=>assert.equal(diff.stdout.trim(),''));
}
const oldDiff=(await git('git',['diff','--name-only','1105aa0','ab29f07','--','test/persistent-authorization/r8','test/persistent-authorization/r22/report.mjs'],{windowsHide:true})).stdout.trim().split(/\r?\n/u).sort();
check(()=>assert.deepEqual(oldDiff,['test/persistent-authorization/r22/report.mjs','test/persistent-authorization/r8/expiry-evidence.mjs','test/persistent-authorization/r8/integration.mjs']));
// Pin the full expected-name definitions, not just counts, across the review.
const reportSlice=text=>{const normalized=text.replaceAll('\r\n','\n');return normalized.slice(normalized.indexOf('export const steps'),normalized.indexOf('const driverNames'));};
const before=(await git('git',['show','1105aa0:test/persistent-authorization/r22/report.mjs'],{windowsHide:true})).stdout;
const reviewed=(await git('git',['show','ab29f07:test/persistent-authorization/r22/report.mjs'],{windowsHide:true})).stdout;
check(()=>assert(reportSlice(before).length>500));check(()=>assert.equal(reportSlice(before),reportSlice(reviewed)));
const currentReport=await readFile('test/persistent-authorization/r22/report.mjs','utf8');
check(()=>assert.equal(reportSlice(reviewed),reportSlice(currentReport)));
stage='new_reporting';
const ok=sample('matrix');
for(const mutate of [v=>delete v.matrix.missingRtEvidence,v=>v.matrix.missingRtEvidence.deletedRows=0,v=>v.matrix.missingRtEvidence.deletedRows=2,v=>v.matrix.missingRtEvidence.refresh.status=500,v=>v.matrix.missingRtEvidence.refresh.accessTokenPresent=true,v=>v.matrix.missingRtEvidence.after.refreshTokens=2,v=>v.matrix.missingRtEvidence.after.consumed=1,v=>v.matrix.missingRtEvidence.refreshJsonParsed=false,v=>v.matrix.serviceLogs.pop(),v=>v.matrix.serviceLogs[0].stderr.overflow=true]){
 const bad=structuredClone(ok);mutate(bad);check(()=>assert.throws(()=>verifyScenario(bad,'matrix',ledger)));
}
const failed=sample('matrix');failed.passed=false;failed.matrix.passed=false;failed.matrix.stage='missing_rt_refresh';failed.matrix.assertion='DENIED_STATUS';failed.matrix.missingRtEvidence.refresh.status=500;failed.matrix.missingRtEvidence.refresh.error='server_error';failed.matrix.diagnostics=[{operation:'refresh',status:500,error:'server_error',accessTokenPresent:false,refreshTokenPresent:false,jsonParsed:true,raw:'SENSITIVE_SENTINEL'}];
const safe=project(failed);check(()=>assert.equal(safe.matrix.assertion,'DENIED_STATUS'));check(()=>assert.equal(safe.matrix.missingRtEvidence.refresh.status,500));check(()=>assert.equal(safe.matrix.responseDiagnostics[0].operation,'refresh'));check(()=>assert(!JSON.stringify(safe).includes('SENSITIVE_SENTINEL')));check(()=>assert.deepEqual(project(safe),safe));
stage='receipt_contract';const roles=['authorization','control','test'];
const receipt={passed:true,inputsUnchanged:true,evidenceSaved:true,revision,baseline:{manifestSha256:sourceManifest},containerfileSha256:recipeSha,images,
 compiledIdentity:{node:'v24.22.1',lts:'Krypton',uid:1000,fileCount:163,sha256:compiledSha},
 artifacts:roles.map(role=>({role,attempts:1,process:{code:0,signal:null,timedOut:false,spawnFailed:false,lowDisk:false,outputLimit:false},artifactLinked:true,revision,imageId:images[role]})),
 probes:roles.map(role=>({role,hash:compiledSha,files:163,version:'v24.22.1',lts:'Krypton',uid:1000})),patchProbes:roles.map(role=>({role,sourceSha256:databaseSourceSha,compiledExactRtMapping:true})),automaticRetryPerformed:false,productionAccessed:false,registryPushed:false,databaseStarted:false};
check(()=>assert(verifyCandidate(receipt)));
for(const mutate of [r=>r.passed=false,r=>r.inputsUnchanged=false,r=>r.revision='a'.repeat(40),r=>r.compiledIdentity.sha256='a'.repeat(64),r=>r.patchProbes[0].compiledExactRtMapping=false,r=>r.artifacts[0].attempts=2,r=>r.baseline.manifestSha256='a'.repeat(64)]){const r=structuredClone(receipt);mutate(r);check(()=>assert.throws(()=>verifyCandidate(r)));}
const wrong=structuredClone(receipt);wrong.images.authorization='sha256:'+'1'.repeat(64);wrong.artifacts[0].imageId=wrong.images.authorization;check(()=>assert.throws(()=>verifyCandidate(wrong)));
stage='generated_fixtures';const base=await readFile('test/persistent-authorization/r8/integration.mjs'),transition=await readFile('test/persistent-authorization/r8/transition.mjs'),driver=await readFile('test/persistent-authorization/driver.mjs');
const generated=[buildMatrix(base),buildTransition(transition),buildDriver(driver)];
for(const fn of [()=>buildMatrix(Buffer.concat([base,Buffer.from(' ')])),()=>buildTransition(Buffer.concat([transition,Buffer.from(' ')])),()=>buildDriver(Buffer.concat([driver,Buffer.from(' ')]))])check(()=>assert.throws(fn));
for(let i=0;i<2;i++){const original=(i===0?base:transition).toString('utf8').replaceAll('\r\n','\n');
 const names=text=>[...text.matchAll(/checks\.push\(\{name:'([^']+)'/gu)].map(m=>m[1]);check(()=>assert.deepEqual(names(generated[i]),names(original)));
 const ds=spawnSync(process.execPath,['--check','--input-type=module'],{input:generated[i],encoding:'utf8',env:{},timeout:10000,maxBuffer:65536});check(()=>assert.equal(ds.status,0));
}
check(()=>assert(generated[0].includes('missingCase as inspectMissingRt')));check(()=>assert(generated[0].includes("stage='wrong_account'")));check(()=>assert(generated[0].includes("stage='refresh_replay'")));check(()=>assert(generated[1].indexOf("stage='B_stop_before_A'")<generated[1].indexOf("stage='A_accepts_guarded_preissued_code'")));check(()=>assert(generated[2].includes('passed:matrix.passed===true')));
for(const f of ['scripts/run-r41-ab.mjs','scripts/r41-ab.synthetic.mjs','test/persistent-authorization/r41/contract.mjs','test/persistent-authorization/r41/report.mjs','test/persistent-authorization/r41/export.mjs','test/persistent-authorization/r41/scenario-source.mjs']){
 const v=spawnSync(process.execPath,['--check',f],{env:{},timeout:10000,maxBuffer:65536});check(()=>assert.equal(v.status,0));
}
console.log(JSON.stringify({passed:true,checks,expectedMatrixChecks:37,expectedTransitionChecks:17,formalAttempts:0,productionAccessed:false,dockerInvoked:false}));
}catch{console.log(JSON.stringify({passed:false,stage,checksCompleted:checks,category:'R41_SYNTHETIC_FAILURE',rawOutputSuppressed:true,dockerInvoked:false}));process.exitCode=1;}
