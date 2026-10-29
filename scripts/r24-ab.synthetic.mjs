// Pure R24 tests: no service processes or Docker invocation.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { abNextAllowed, scenarioOnce, budgets, ownedState, main } from './run-r22-services.mjs';
import { expectedChecks, verifyScenario, project } from '../test/persistent-authorization/r22/report.mjs';
import { expectedLedger } from '../packages/database/test/r17-migration-evidence.mjs';
let checks=0;const check=fn=>{fn();checks++;};const prefix='synthetic';
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
await assert.rejects(()=>main({abOnly:true,controlOnly:true}),{code:'SCENARIO_ORDER_DENIED'});checks++;
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
const metadata={Name:'/owned',Config:{Labels:{'wepuu.phase':'r24-ab','wepuu.run':'run'}},State:{Running:false,ExitCode:0,OOMKilled:false}};
check(()=>assert(ownedState(metadata,'run','owned','r24-ab').stopped));
check(()=>assert.throws(()=>ownedState(metadata,'other','owned','r24-ab')));
const source=await readFile('scripts/run-r22-services.mjs','utf8'),entry=await readFile('scripts/run-r24-ab.mjs','utf8');
check(()=>assert(entry.includes('main({ abOnly: true })')));
for(const s of ["abOnly ? ['matrix', 'transition']",'abNextAllowed(step,result.scenarios,result.cleanup,prefix)',"abOnly ? '1105aa0'",'item.ownedContainerStoppedAt=',
 "'scripts/run-r24-ab.mjs','scripts/r24-ab.synthetic.mjs'",'--pull=never','--internal','--read-only','no-new-privileges'])check(()=>assert(source.includes(s)));
const git=promisify(execFile);
for(const f of ['test/persistent-authorization/r8','test/persistent-authorization/driver.mjs','test/persistent-authorization/r22/report.mjs','test/persistent-authorization/r22/export.mjs']){
 const diff=await git('git',['diff','--name-only','1105aa0','--',f],{windowsHide:true});check(()=>assert.equal(diff.stdout.trim(),''));
}
console.log(JSON.stringify({passed:true,checks,expectedMatrixChecks:37,expectedTransitionChecks:17,formalAttempts:0,productionAccessed:false}));
