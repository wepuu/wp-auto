import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { controlRun, controlRunPass, controlEnvironment, stderrClassifier } from '../test/persistent-authorization/r23/control-lifecycle.mjs';
import { project, verifyScenario, expectedChecks } from '../test/persistent-authorization/r22/report.mjs';
import { expectedLedger } from '../packages/database/test/r17-migration-evidence.mjs';
let checks=0;const check=fn=>{fn();checks++;};
function fake(mode){
 let time=0,child;const emitClose=(code,signal)=>{child.emit('exit',code,signal);child.emit('close',code,signal);};
 const io={now:()=>time,wait:async ms=>{time+=ms;},spawn:()=>{
  child=new EventEmitter();child.stdout=new EventEmitter();child.stderr=new EventEmitter();
  child.kill=signal=>{if(mode==='stop-timeout'){if(signal==='SIGKILL')emitClose(null,signal);return true;}
   if(mode==='signal-failure')return false;
   emitClose(mode==='unclean-exit'?1:mode==='signal-exit'?null:0,mode==='signal-exit'?'SIGTERM':null);return true;};return child;},
 fetch:async()=>{
  if(mode==='spawn-error'){child.emit('error',{code:'EACCES',message:'SECRET_SENTINEL'});child.emit('close',null,null);throw Error('SECRET_SENTINEL');}
  if(mode==='production-mock'){child.stderr.emit('data',Buffer.from('Error: production_email_'));child.stderr.emit('data',Buffer.from('delivery_required\nSECRET_SENTINEL\n'));emitClose(1,null);throw Error('SECRET_SENTINEL');}
  if(mode==='unknown-error'){child.stderr.emit('data',Buffer.from('Error: SECRET_SENTINEL\n'));emitClose(1,null);throw Error('SECRET_SENTINEL');}
  if(mode==='output-limit'){child.stdout.emit('data',Buffer.alloc(65537));throw Error('SECRET_SENTINEL');}
  if(mode==='not-ready')return {status:503,body:{cancel:async()=>{}}};
  return {status:200,body:{cancel:async()=>{}}};
 }};return io;
}
const good=await controlRun({executable:'synthetic',args:[],cwd:'.',env:{},base:'http://127.0.0.1:1',attempt:1,io:fake('good')});
check(()=>assert(controlRunPass(good)));check(()=>assert.equal(good.signal,null));
for(const [mode,primary,secondary] of [['production-mock','production_email_delivery_required','UNCLEAN_EXIT'],['unknown-error','EXIT_BEFORE_READY','UNCLEAN_EXIT'],
 ['spawn-error','SPAWN_FAILED','NONE'],['output-limit','OUTPUT_LIMIT','NONE'],['not-ready','READINESS_TIMEOUT','NONE'],['unclean-exit','NONE','UNCLEAN_EXIT'],
 ['signal-exit','NONE','UNCLEAN_EXIT'],['stop-timeout','NONE','STOP_TIMEOUT'],['signal-failure','NONE','STOP_TIMEOUT']]){
 const row=await controlRun({executable:'synthetic',args:[],cwd:'.',env:{},base:'http://127.0.0.1:1',attempt:1,io:fake(mode)});
 check(()=>assert(!row.passed));check(()=>assert.equal(row.startupFailureCategory,primary));check(()=>assert.equal(row.cleanupFailureCategory,secondary));
 check(()=>assert(!JSON.stringify(project({runs:[row]})).includes('SECRET_SENTINEL')));
 if(mode==='signal-exit'){check(()=>assert.equal(row.exitCode,null));check(()=>assert.equal(row.signal,'SIGTERM'));}
 if(mode==='stop-timeout')check(()=>assert(row.closeObserved&&row.signal==='SIGKILL'));
}
const env=controlEnvironment({WEPUU_EMAIL_DELIVERY:'mock'},{port:3100,quotaFile:'/private/quota',apiKeyFile:'/private/fake',grantKey:'synthetic'});
for(const [k,v]of Object.entries({NODE_ENV:'production',WEPUU_EMAIL_DELIVERY:'resend',WEPUU_EMAIL_OTP_SEND_ENABLED:'false',WEPUU_CONTROL_PORT:'3100',WEPUU_EMAIL_OTP_LIMIT_HMAC_KEY_FILE:'/private/quota',WEPUU_RESEND_API_KEY_FILE:'/private/fake'}))check(()=>assert.equal(env[k],v));
const classifier=stderrClassifier();classifier.add('Error: production_email_');classifier.add('delivery_required\n');check(()=>assert.equal(classifier.value(),'production_email_delivery_required'));
classifier.add('SECRET_SENTINEL');check(()=>assert(!classifier.value().includes('SECRET_SENTINEL')));
const ledger=await expectedLedger('candidate'),sample={passed:true,step:'control',explicitMigration:true,runtimePrivilegeSeparationPass:true,
 schemaBefore:'a'.repeat(64),schemaAfter:'a'.repeat(64),ledgerBefore:ledger,ledgerAfter:ledger,
 checks:[{name:'missing_schema_denied_without_auto_migration',passed:true,sqlstate:'42P01'}, {name:'separate_explicit_migration_identity',passed:true},
 {name:'runtime_cannot_DDL_write_ledger_or_assume_migrator',passed:true},{name:'missing_ledger_permission_denied_without_repair',passed:true,sqlstate:'42501'}],
 matrix:{passed:true,runtimeDsnRestricted:true,schemaAndLedgerUnchanged:true,checks:expectedChecks.control.map(name=>({name,passed:true})),runs:[good,{...good,attempt:2}]}};
check(()=>assert(verifyScenario(sample,'control',ledger,{controlEvidence:true}).passed));
for(const mutate of [v=>delete v.matrix.runs[0].signal,v=>v.matrix.runs[0].signal='SIGTERM',v=>v.matrix.runs[0].closeObserved=false,
 v=>v.matrix.runs[0].exitObserved=false,v=>v.matrix.runs[0].stopSignalDelivered=false,v=>v.matrix.runs[0].spawnErrorCategory='EACCES',
 v=>v.matrix.runs[0].startupFailureCategory='READINESS_TIMEOUT',v=>v.matrix.runs[0].cleanupFailureCategory='STOP_TIMEOUT',v=>v.matrix.runs[0].outputLimitExceeded=true,
 v=>v.ledgerAfter=[],v=>v.schemaAfter='b'.repeat(64),v=>v.matrix.runs.pop()]){
 const bad=structuredClone(sample);mutate(bad);check(()=>assert.throws(()=>verifyScenario(bad,'control',ledger,{controlEvidence:true})));
}
const fixture=await readFile('test/persistent-authorization/r8/control-service.mjs','utf8'),runner=await readFile('scripts/run-r22-services.mjs','utf8');
for(const s of ['runs.push(observed);assert(observed.passed',"'--import','/harness/r8/egress-preload.mjs'",'controlEnvironment(',"'control-quota.private.txt'",'checks,runs'])check(()=>assert(fixture.includes(s)));
check(()=>assert(!fixture.includes("assert.equal(exitCode,0,'CONTROL_MAIN_EXIT')")));
check(()=>assert(runner.includes("controlOnly ? ['control'] : steps")&&runner.includes('{controlEvidence:controlOnly}')));
check(()=>assert(runner.includes("'--network','none'")&&runner.includes("images.control,'node','/harness/r23/contract-probe.mjs'")));
const git=promisify(execFile),diff=await git('git',['diff','--name-only','117b062','--','apps','packages','deploy','pnpm-lock.yaml'],{windowsHide:true});
check(()=>assert.equal(diff.stdout.trim(),''));
for(const f of ['integration.mjs','transition.mjs','startup-service.mjs']){
 const d=await git('git',['diff','--name-only','117b062','--','test/persistent-authorization/r8/'+f],{windowsHide:true});check(()=>assert.equal(d.stdout.trim(),''));
}
console.log(JSON.stringify({passed:true,checks,actualServiceAttempts:0,productionAccessed:false}));
