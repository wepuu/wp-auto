// Offline only: imports pure helpers; no Docker, database, fetch or service starts.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { inspectExpiredSession, projectExpiry, expiryAssertions, expiryStages } from '../test/persistent-authorization/r8/expiry-evidence.mjs';
import { project, lastResult, expectedChecks } from '../test/persistent-authorization/r22/report.mjs';
import { scenarioOnce } from './run-r22-services.mjs';
const sentinel = 'SENSITIVE_SENTINEL_CODE_TOKEN_UID_EXCEPTION';
let checks = 0;
function check(fn) { fn(); checks++; }
function denied(r) {
 assert.equal(r.status,400,'DENIED_STATUS');assert.equal(r.body.error,'invalid_grant','DENIED_ERROR');
 assert.equal(r.body.access_token,undefined,'NO_DENIED_AT');assert.equal(r.body.refresh_token,undefined,'NO_DENIED_RT');
}
async function trial({code=sentinel,link={sessionUid:sentinel},rows=1,responses,throwAt}={}) {
 const evidence={},stages=[],calls=[];let failure;
 try {
  await inspectExpiredSession({
   authorize:async()=>{calls.push('authorize');if(throwAt==='authorize')throw Error(sentinel);return {code};},
   link:async()=>{calls.push('link');if(throwAt==='link')throw Error(sentinel);return link;},
   expire:async()=>{calls.push('expire');if(throwAt==='expire')throw Error(sentinel);return {rowCount:rows};},
   exchange:async(_,mode)=>{calls.push(mode);if(throwAt===mode)throw Error(sentinel);return responses?.[mode]??{status:400,body:{error:'invalid_grant'}};},
   denied,setStage:s=>stages.push(s),evidence
  });
 } catch(e) { failure=e; }
 return {evidence,stages,calls,failure};
}
const good=await trial();
check(()=>assert.equal(good.failure,undefined));
check(()=>assert.deepEqual(good.stages,expiryStages));
check(()=>assert.deepEqual(good.calls,['authorize','link','expire','A','B']));
check(()=>assert.equal(good.evidence.sessionRowsUpdated,1));
check(()=>assert(good.evidence.exchanges.every(x=>x.completed&&x.status===400)));
for(const [options,stage,message] of [
 [{code:undefined},expiryStages[0],'EXPIRY_CODE_REQUIRED'],
 [{code:''},expiryStages[0],'EXPIRY_CODE_REQUIRED'],
 [{link:null},expiryStages[1],'EXPIRY_LINK_REQUIRED'],
 ...[0,2,null,NaN,Infinity,'1'].map(rows=>[{rows},expiryStages[2],'EXPIRY_SESSION_UPDATE_ONE']),
 ...[['DENIED_STATUS',{status:200,body:{access_token:sentinel}}],['DENIED_ERROR',{status:400,body:{error:sentinel}}],
 ['NO_DENIED_AT',{status:400,body:{error:'invalid_grant',access_token:sentinel}}],
 ['NO_DENIED_RT',{status:400,body:{error:'invalid_grant',refresh_token:sentinel}}]].flatMap(([message,response])=>
 ['A','B'].map(mode=>[{responses:{[mode]:response}},'expired_code_exchange_'+mode,message]))
]) {
 // undefined means the default fake Code; use null to model absent Code explicitly.
 if(Object.hasOwn(options,'code')&&options.code===undefined)options.code=null;
 const r=await trial(options);
 check(()=>assert.equal(r.failure?.message.split('\n')[0],message));
 check(()=>assert.equal(r.stages.at(-1),stage));
 if(stage!==expiryStages[4])check(()=>assert(!r.calls.includes('B')));
 const p=project({passed:false,stage,assertion:message,expiryEvidence:r.evidence,raw:sentinel});
 check(()=>assert.equal(p.assertion,message));
 check(()=>assert(!JSON.stringify(p).includes(sentinel)));
 check(()=>assert.deepEqual(project(p),p));
}
for(const [throwAt,stage] of [['authorize',0],['link',1],['expire',2],['A',3],['B',4]]) {
 const r=await trial({throwAt});
 check(()=>assert.equal(r.stages.at(-1),expiryStages[stage]));
 check(()=>assert(r.failure));
 if(throwAt==='A')check(()=>assert.deepEqual(r.evidence.exchanges,[{mode:'A',completed:false}]));
 check(()=>assert(!JSON.stringify(projectExpiry(r.evidence)).includes(sentinel)));
}
for(const n of [NaN,Infinity,-1,'1',null])check(()=>assert.equal(projectExpiry({sessionRowsUpdated:n}).sessionRowsUpdated,undefined));
const poisoned={sessionRowsUpdated:1,codePresent:true,linkPresent:true,secret:sentinel,
 exchanges:[{mode:'A',completed:true,status:500,error:'server_error',accessTokenPresent:false,refreshTokenPresent:false,payload:sentinel},
 {mode:sentinel,completed:true,status:999,error:sentinel,access_token:sentinel}, {mode:'A',secret:sentinel}]};
const projection=projectExpiry(poisoned);
check(()=>assert.equal(projection.exchanges.length,2));
check(()=>assert.equal(projection.exchanges[1].mode,'NOT_CONFIRMED'));
check(()=>assert.equal(projection.exchanges[1].status,undefined));
check(()=>assert.equal(projection.exchanges[1].error,undefined));
check(()=>assert(!JSON.stringify(projection).includes(sentinel)));
for(const stage of ['expired_code','setup',sentinel])check(()=>assert.equal(project({passed:false,stage,assertion:'DENIED_STATUS'}).assertion,undefined));
for(const assertion of expiryAssertions)check(()=>assert.equal(project({passed:false,stage:expiryStages[3],assertion}).assertion,assertion));
check(()=>assert.equal(project({passed:false,stage:expiryStages[3],assertion:sentinel}).assertion,undefined));
const inner={passed:false,stage:expiryStages[3],category:'ASSERTION_FAILED',assertion:'DENIED_STATUS',expiryEvidence:poisoned,
 protocolAssertionsPass:false,childEvidencePass:true,cleanup:{childrenStopped:true,forcedOwnedChildTermination:false}};
const driver={passed:false,step:'matrix',stage:'compiled_service_matrix',assertion:'SERVICE_MATRIX_FAILED',matrix:inner};
const r=await scenarioOnce('matrix',async()=>{throw Object.assign(Error(sentinel),{code:1,stdout:JSON.stringify(driver)});},[]);
check(()=>assert.equal(r.passed,false));
check(()=>assert.equal(r.evidence.matrix.assertion,'DENIED_STATUS'));
check(()=>assert.equal(r.evidence.matrix.expiryEvidence.exchanges[0].status,500));
check(()=>assert(!JSON.stringify(r).includes(sentinel)));
check(()=>assert.deepEqual(project(lastResult(JSON.stringify(project(driver)))),project(driver)));
check(()=>assert.equal(expectedChecks.matrix.length,37));
check(()=>assert.equal(expectedChecks.transition.length,17));
const source=await readFile(new URL('../test/persistent-authorization/r8/integration.mjs',import.meta.url),'utf8');
check(()=>assert(source.includes("assert.equal(r.status,400,'DENIED_STATUS');assert.equal(r.body.error,'invalid_grant','DENIED_ERROR')")));
check(()=>assert(source.includes("checks.push({name:'real_A_B_expired_original_ProviderSession_Code_denied',passed:true})")));
check(()=>assert(source.includes('result.expiryEvidence=projectExpiry(expiryEvidence)')));
console.log(JSON.stringify({passed:true,checks,servicesStarted:false,dockerInvoked:false,productionAccessed:false}));
