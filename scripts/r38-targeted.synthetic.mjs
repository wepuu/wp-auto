// Synthetic callbacks and syntax-only children; no Docker, DB or application imports.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {missingCase,projectEvidence,response,validState} from '../test/persistent-authorization/r38/core.mjs';
import {buildScenario,buildDriver,stateSql} from '../test/persistent-authorization/r38/scenario-source.mjs';
import {projectDriver,verifyDriver} from '../test/persistent-authorization/r38/report.mjs';
import {expectedLedger} from '../packages/database/test/r17-migration-evidence.mjs';
let checks=0,stage='helpers';const secret='SENSITIVE_R38_SENTINEL';const check=f=>{f();checks++;};
async function fixture({status=400,error='invalid_grant',deleted=1,link=1,postFail=false,extra={},jsonParsed=true}={}){
 const evidence={},calls={read:0,refresh:0,delete:0};const before={links:link,artifacts:1,classifications:1,accessTokens:0,refreshTokens:1,consumed:0};let removed=false;
 try{await missingCase({authorize:async()=>({code:secret,browser:{}}),exchange:async()=>({status:200,body:{access_token:secret,refresh_token:secret}}),
 readState:async()=>{calls.read++;if(postFail&&calls.read>=3)throw Error(secret);return{...before,links:removed?0:link};},deleteLink:async()=>{calls.delete++;removed=deleted===1;return{rowCount:deleted};},
 refresh:async()=>{calls.refresh++;return{status,body:{error,...extra},jsonParsed};},denied:r=>{assert.equal(r.status,400,'DENIED_STATUS');assert.equal(r.body.error,'invalid_grant','DENIED_ERROR');assert.equal(r.body.access_token,undefined,'NO_DENIED_AT');assert.equal(r.body.refresh_token,undefined,'NO_DENIED_RT');},setStage:()=>{},evidence});return{passed:true,evidence,calls};}
 catch(e){return{passed:false,evidence,calls,assertion:e.message.split('\n')[0]};}
}
try{
 const good=await fixture();check(()=>assert(good.passed));check(()=>assert(good.evidence.postcheckVerified));check(()=>assert.equal(good.calls.refresh,1));
 for(const status of [200,401,403,429,500,502]){const r=await fixture({status,error:status===500?'server_error':'invalid_grant'});check(()=>assert(!r.passed));check(()=>assert.equal(r.assertion,'DENIED_STATUS'));check(()=>assert.equal(r.evidence.failureReadback,'PASS'));check(()=>assert.equal(r.evidence.refresh.status,status));check(()=>assert.equal(r.calls.refresh,1));}
 for(const deleted of [0,2,null]){const r=await fixture({deleted});check(()=>assert(!r.passed));check(()=>assert.equal(r.calls.refresh,0));}
 const broken=await fixture({link:0});check(()=>assert(!broken.passed));check(()=>assert.equal(broken.calls.delete,0));
 const post=await fixture({status:500,postFail:true});check(()=>assert.equal(post.assertion,'DENIED_STATUS'));check(()=>assert.equal(post.evidence.failureReadback,'NOT_CONFIRMED'));
 for(const extra of [{access_token:secret},{refresh_token:secret}]){const r=await fixture({extra});check(()=>assert(!r.passed));check(()=>assert.equal(r.evidence.failureReadback,'PASS'));check(()=>assert(!JSON.stringify(projectEvidence({...r.evidence,raw:secret})).includes(secret)));}
 const nonJson=await response({status:502,json:async()=>{throw Error(secret);}});check(()=>assert.equal(nonJson.status,502));check(()=>assert.equal(nonJson.jsonParsed,false));check(()=>assert(!JSON.stringify(nonJson).includes(secret)));
 for(const v of [null,{}, {links:NaN}, {...good.evidence.before,consumed:null}])check(()=>assert.throws(()=>validState(v)));
 stage='projection';const ledger=await expectedLedger('candidate');
 const sample={passed:true,explicitMigration:true,runtimePrivilegeSeparationPass:true,ledgerBefore:ledger,ledgerAfter:ledger,schemaBefore:'a'.repeat(64),schemaAfter:'a'.repeat(64),
 matrix:{passed:true,normalEvidence:{passed:true,independent:true,bindingVerified:true,rotationVerified:true,stateVerified:true},missingRtEvidence:good.evidence,protectionVerified:true,authRequests:2,tokenRequests:4,childEvidencePass:true,deadlineExceeded:false,cleanup:{childrenStopped:true,forcedOwnedChildTermination:false}}};
 check(()=>assert(verifyDriver(sample,ledger).passed));
 for(const mutate of [s=>s.passed=false,s=>s.schemaAfter='b'.repeat(64),s=>s.matrix.authRequests=3,s=>s.matrix.tokenRequests=5,s=>s.matrix.protectionVerified=false,s=>s.matrix.normalEvidence.rotationVerified=false,s=>s.matrix.missingRtEvidence.refresh.status=500,s=>s.matrix.missingRtEvidence.deletedRows=0,s=>s.matrix.missingRtEvidence.refreshJsonParsed=false,s=>s.matrix.cleanup.childrenStopped=false]){const s=structuredClone(sample);mutate(s);check(()=>assert.throws(()=>verifyDriver(s,ledger)));}
 const poison=structuredClone(sample);poison.raw=secret;poison.matrix.missingRtEvidence.raw=secret;poison.matrix.missingRtEvidence.failureAfter={...good.evidence.before,raw:secret};check(()=>assert(!JSON.stringify(projectDriver(poison)).includes(secret)));check(()=>assert.deepEqual(projectDriver(projectDriver(sample)),projectDriver(sample)));
 const failure={passed:false,matrix:{passed:false,stage:'missing_rt_refresh',assertion:'DENIED_STATUS',missingRtEvidence:(await fixture({status:500})).evidence}};
 const p=JSON.parse(JSON.stringify(projectDriver(failure)));check(()=>assert.equal(p.matrix.assertion,'DENIED_STATUS'));check(()=>assert.equal(p.matrix.missingRtEvidence.refresh.status,500));check(()=>assert.equal(p.matrix.missingRtEvidence.failureAfter.links,0));
 stage='scenario';const base=await readFile('test/persistent-authorization/r8/integration.mjs'),driver=await readFile('test/persistent-authorization/driver.mjs');const s=buildScenario(base),d=buildDriver(driver);
 check(()=>assert.throws(()=>buildScenario(Buffer.concat([base,Buffer.from(' ')]))));
 for(const marker of ['state_sql_preflight','normal_refresh_control','missingCase({','authRequests<2','tokenRequests<4','finally{try{await postProtection()','authRequestBudget:2,tokenRequestBudget:4'])check(()=>assert(s.includes(marker)));
 for(const marker of ['for(const item of','save_failure_injection','stage=\'wrong_account\'','stage=\'refresh_replay\'','stage=\'receipt_withdrawal\'','await verifyPending(primary)','adapter.consume('])check(()=>assert(!s.includes(marker)));
 check(()=>assert.equal(s.split('DELETE FROM').length,2));check(()=>assert(s.includes("refresh:(browser,rt)=>refresh(browser,rt,'A')")));check(()=>assert(s.indexOf('state_sql_preflight')<s.indexOf("stage='normal_refresh_control'")));
 check(()=>assert(d.includes('passed:matrix.passed===true')));check(()=>assert(!d.includes("assert(matrix.passed,'SERVICE_MATRIX_FAILED')")));check(()=>assert(stateSql.includes('consumed_at IS NOT NULL')));
 for(const source of [s,d]){const r=spawnSync(process.execPath,['--check','--input-type=module'],{input:source,encoding:'utf8',timeout:10000,maxBuffer:65536,env:{}});check(()=>assert.equal(r.status,0));}
 stage='runner';const runner=await readFile('scripts/run-r38-targeted.mjs','utf8');
 for(const marker of ['targetedAttempts=1','--internal','--pull=never','buildDriver','/harness/r38/export.mjs','result.driverSha256','readonly','fullMatrixExecuted:false','imageRebuilt:false'])check(()=>assert(runner.includes(marker)));
 for(const marker of ['buildCandidate()','imageRebuilt=true',"'transition'",'docker pull'])check(()=>assert(!runner.includes(marker)));
 for(const file of ['scripts/run-r38-targeted.mjs','test/persistent-authorization/r38/core.mjs','test/persistent-authorization/r38/scenario-source.mjs','test/persistent-authorization/r38/report.mjs','test/persistent-authorization/r38/export.mjs']){const r=spawnSync(process.execPath,['--check',file],{timeout:10000,maxBuffer:65536,env:{}});check(()=>assert.equal(r.status,0));}
 console.log(JSON.stringify({passed:true,checks,protocolRequestsSent:0,databaseAccessed:false,dockerInvoked:false,syntaxOnlyChildren:true}));
}catch{console.log(JSON.stringify({passed:false,stage,checksCompleted:checks,category:'R38_SYNTHETIC_FAILURE',rawOutputSuppressed:true}));process.exitCode=1;}
