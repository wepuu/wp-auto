// Offline callbacks and syntax-only children. No Docker or application import.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {inspectMissingRt} from '../test/persistent-authorization/r37/missing-rt.mjs';
import {projectReport,projectMissingRt,recoverLegacy,reportingComplete,assertions,stages} from '../test/persistent-authorization/r37/report.mjs';
import {project as oldProject} from '../test/persistent-authorization/r22/report.mjs';
import {buildReportingScenario} from '../test/persistent-authorization/r37/scenario-source.mjs';
let checks=0,stage='legacy_projection';const check=f=>{f();checks++;},secret='SENSITIVE_SYNTHETIC_TOKEN_CODE_COOKIE_EXCEPTION';
try{
 const legacy={passed:false,stage:'link_and_version_guards',category:'ASSERTION_FAILED',assertion:'DENIED_STATUS',diagnostics:[{operation:'token',status:200,category:'NOT_OBSERVED',body:secret}],message:secret,stack:secret};
 check(()=>assert.equal(oldProject(legacy).assertion,undefined));check(()=>assert.equal(projectReport(legacy).assertion,'DENIED_STATUS'));
 const recovered=recoverLegacy(legacy);check(()=>assert.equal(recovered.assertion,'DENIED_STATUS'));check(()=>assert.equal(recovered.observedRefreshStatus,null));check(()=>assert.equal(recovered.recentCodeExchangeDiagnostics[0].operation,'code_exchange'));check(()=>assert(!JSON.stringify(recovered).includes(secret)));
 for(const a of assertions){const r=projectReport({...legacy,assertion:a});check(()=>assert.equal(r.assertion,a));}
 const poisoned=projectReport({...legacy,assertion:secret,payload:secret,diagnostics:[{token:secret}]});check(()=>assert(!JSON.stringify(poisoned).includes(secret)));
 check(()=>assert.equal(recoverLegacy({}).assertion,'NOT_OBSERVED'));check(()=>assert.equal(recoverLegacy({actualStatus:500}).observedRefreshStatus,null));
 for(const status of [400,500])check(()=>assert.equal(recoverLegacy({diagnostics:[{operation:'token',status,category:'server_error'}]}).observedRefreshStatus,null));
 stage='callback_fixture';
 async function fake(options={}){
  const evidence={},visited=[],calls=[];let reads=0,error;
  const base={links:1,artifacts:1,classifications:1,accessTokens:2,refreshTokens:1,consumed:0};
  try{await inspectMissingRt({
   authorize:async()=>{calls.push('authorize');if(options.timeoutAt==='authorize')throw Error(secret);return options.noCode?{}:{code:secret,browser:secret};},
   exchange:async()=>{calls.push('exchange');return options.fixture??{status:200,body:{access_token:secret,refresh_token:secret}};},
   readState:async()=>{calls.push('readState');reads++;if(options.missingState&&reads===1)return {};if(options.reads?.[reads])return options.reads[reads];return {...base,links:reads===1?1:0};},
   deleteLink:async()=>{calls.push('delete');return {rowCount:options.deletedRows??1};},
   refresh:async()=>{calls.push('refresh');if(options.timeoutAt==='refresh')throw Error(secret);return options.refresh??{status:400,body:{error:'invalid_grant'}};},
   denied:r=>{assert.equal(r.status,400,'DENIED_STATUS');assert.equal(r.body.error,'invalid_grant','DENIED_ERROR');assert.equal(r.body.access_token,undefined,'NO_DENIED_AT');assert.equal(r.body.refresh_token,undefined,'NO_DENIED_RT');},
   setStage:s=>visited.push(s),evidence
  });}catch(e){error=e;}
  const assertion=assertions.includes(String(error?.message).split('\n')[0])?String(error.message).split('\n')[0]:undefined;
  return {report:projectReport({passed:error===undefined,stage:evidence.stage,category:error?'ASSERTION_FAILED':undefined,assertion,missingRtEvidence:evidence}),visited,calls};
 }
 const normal=await fake();check(()=>assert(normal.report.passed));check(()=>assert(reportingComplete(normal.report)));check(()=>assert.deepEqual(normal.visited,stages));check(()=>assert(!JSON.stringify(normal).includes(secret)));
 for(const [options,assertion,expectedStage]of [
  [{noCode:true},'MISSING_RT_AUTH_CODE_REQUIRED','missing_rt_authorize'],
  [{fixture:{status:500,body:{error:'server_error'}}},'MISSING_LINK_FIXTURE','missing_rt_exchange'],
  [{fixture:{status:200,body:{access_token:secret}}},'MISSING_RT_TOKENS_REQUIRED','missing_rt_exchange'],
  [{deletedRows:0},'MISSING_RT_DELETE_ONE','missing_rt_link_delete'],
  [{deletedRows:2},'MISSING_RT_DELETE_ONE','missing_rt_link_delete'],
  [{missingState:true},'MISSING_RT_STATE_NOT_CONFIRMED','missing_rt_exchange'],
  [{reads:{2:{links:1,artifacts:1,classifications:1,accessTokens:2,refreshTokens:1,consumed:0}}},'MISSING_RT_LINK_ABSENT','missing_rt_link_delete'],
  [{refresh:{status:500,body:{error:'server_error'}}},'DENIED_STATUS','missing_rt_refresh'],
  [{refresh:{status:400,body:{error:secret}}},'DENIED_ERROR','missing_rt_refresh'],
  [{refresh:{status:400,body:{error:'invalid_grant',access_token:secret}}},'NO_DENIED_AT','missing_rt_refresh'],
  [{refresh:{status:400,body:{error:'invalid_grant',refresh_token:secret}}},'NO_DENIED_RT','missing_rt_refresh'],
  [{reads:{3:{links:0,artifacts:1,classifications:1,accessTokens:3,refreshTokens:1,consumed:0}}},'MISSING_RT_NO_NEW_TOKENS','missing_rt_postcheck'],
  [{reads:{3:{links:0,artifacts:1,classifications:1,accessTokens:2,refreshTokens:1,consumed:1}}},'MISSING_RT_CONSUMPTION_UNCHANGED','missing_rt_postcheck']
 ]){
  const r=await fake(options);check(()=>assert(!r.report.passed));check(()=>assert.equal(r.report.assertion,assertion));check(()=>assert.equal(r.report.stage,expectedStage));check(()=>assert(!reportingComplete(r.report)));check(()=>assert(!JSON.stringify(r).includes(secret)));
  if(expectedStage!=='missing_rt_refresh'&&expectedStage!=='missing_rt_postcheck')check(()=>assert(!r.calls.includes('refresh')));
 }
 for(const timeoutAt of ['authorize','refresh']){const r=await fake({timeoutAt});check(()=>assert(!r.report.passed));check(()=>assert(!reportingComplete(r.report)));check(()=>assert(!JSON.stringify(r).includes(secret)));}
 stage='result_aggregation';
 for(const mutate of [v=>v.passed=false,v=>delete v.missingRtEvidence,v=>v.missingRtEvidence.deletedRows=0,v=>delete v.missingRtEvidence.refresh,v=>v.missingRtEvidence.refresh.status=500,v=>v.missingRtEvidence.fixtureReady=false,v=>v.missingRtEvidence.after.accessTokens=null,v=>v.missingRtEvidence.before.consumed=1,v=>v.missingRtEvidence.afterDelete.classifications=0]){const bad=structuredClone(normal.report);mutate(bad);check(()=>assert(!reportingComplete(bad)));}
 const wrapped={passed:false,matrix:normal.report};check(()=>assert(!projectReport(wrapped).passed));check(()=>assert(!reportingComplete(wrapped)));
 const roundTrip=JSON.parse(JSON.stringify(projectReport({passed:false,matrix:(await fake({refresh:{status:500,body:{error:'server_error'}}})).report})));
 check(()=>assert.equal(roundTrip.matrix.assertion,'DENIED_STATUS'));check(()=>assert.equal(roundTrip.matrix.missingRtEvidence.refresh.status,500));check(()=>assert.equal(roundTrip.matrix.missingRtEvidence.refresh.error,'server_error'));
 check(()=>assert.deepEqual(projectReport(roundTrip),roundTrip));check(()=>assert(!JSON.stringify(projectMissingRt({stage:secret,token:secret,before:{links:secret}})).includes(secret)));
 stage='generator_and_syntax';const bytes=await readFile('test/persistent-authorization/r8/integration.mjs'),generated=buildReportingScenario(bytes);
 check(()=>assert.throws(()=>buildReportingScenario(Buffer.concat([bytes,Buffer.from(' ')]))));
 for(const marker of ['inspectMissingRt({','result.missingRtEvidence=projectMissingRt(missingRtEvidence)','readState:async rt','real_missing_RT_link_denied_without_native_fallback'])check(()=>assert(generated.includes(marker)));
 const syntax=spawnSync(process.execPath,['--check','--input-type=module'],{input:generated,env:{},timeout:10000,maxBuffer:65536});check(()=>assert.equal(syntax.status,0));
 for(const f of ['scripts/run-r37-extract.mjs','test/persistent-authorization/r37/report.mjs','test/persistent-authorization/r37/missing-rt.mjs','test/persistent-authorization/r37/scenario-source.mjs','test/persistent-authorization/r37/extract.mjs']){const r=spawnSync(process.execPath,['--check',f],{env:{},timeout:10000,maxBuffer:65536});check(()=>assert.equal(r.status,0));}
 const runner=await readFile('scripts/run-r37-extract.mjs','utf8');for(const marker of ['--network','none','readonly','--pull=never','--read-only','r36-20261025101227538','exporterAttempts=1','inputsUnchanged'])check(()=>assert(runner.includes(marker)));
 for(const forbidden of ['pg_isready','db:migrate',"['buildx'","['restart'",'/harness/driver.mjs'])check(()=>assert(!runner.includes(forbidden)));
 console.log(JSON.stringify({passed:true,checks,protocolRequestsSent:0,databaseAccessed:false,dockerInvoked:false,syntaxOnlyChildren:true,generatedScenarioExecuted:false}));
}catch{console.log(JSON.stringify({passed:false,stage,checksCompleted:checks,category:'R37_SYNTHETIC_FAILURE',rawOutputSuppressed:true,dockerInvoked:false}));process.exitCode=1;}
