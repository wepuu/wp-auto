// Pure helpers and syntax-only children. No Docker, database or app execution.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {caseNames,responseEvidence,verifyCases} from '../test/persistent-authorization/r34/core.mjs';
import {projectDriver,verifyDriver} from '../test/persistent-authorization/r34/report.mjs';
import {buildScenario} from '../test/persistent-authorization/r34/scenario-source.mjs';
import {expectedLedger} from '../packages/database/test/r17-migration-evidence.mjs';
import {owned} from './run-r34-targeted.mjs';
import {verifyIntegrationImage,verifyCompiledIdentity,verifyDiskBudget} from './persistent-image-contract.mjs';
let checks=0,stage='responses';const check=f=>{f();checks++;};const secret='SENSITIVE_SYNTHETIC_TOKEN_SENTINEL';
try{
 const good={status:200,body:{access_token:secret,refresh_token:secret}},deny={status:400,body:{error:'invalid_grant'}};
 const rows=caseNames.map(name=>({...responseEvidence(name,name.startsWith('valid')?good:deny),identityFresh:true,beforeValid:true,tokenStateVerified:true,
  ...(name.startsWith('expired')?{updatedRows:1,afterExpired:true,codeUnconsumed:true}:{})}));
 check(()=>assert(verifyCases(rows).expiredSessionProtocolPass));check(()=>assert(!JSON.stringify(rows).includes(secret)));
 for(const status of [200,401,403,429,500,502])check(()=>assert.throws(()=>responseEvidence('expired_A',{status,body:{error:status===500?'server_error':'invalid_grant'}})));
 for(const body of [{error:'invalid_grant',access_token:secret},{error:'invalid_grant',refresh_token:secret},{error:'invalid_grant',stack:secret},{error:'invalid_grant',error_description:'persistent_grant_denied'},{error:'invalid_grant',error_description:'P0001'}])check(()=>assert.throws(()=>responseEvidence('expired_B',{status:400,body})));
 for(const mutate of [r=>r.pop(),r=>r.push(r[0]),r=>r[0].name='valid_B',r=>r[0].identityFresh=false,r=>r[2].updatedRows=0,r=>r[2].updatedRows=2,r=>r[2].codeUnconsumed=false,r=>r[2].tokenStateVerified=false,r=>{r[2].status=500;r[2].error='server_error';r[2].protocolPass=false;}]){const bad=structuredClone(rows);mutate(bad);check(()=>assert.throws(()=>verifyCases(bad)));}
 stage='report';const ledger=await expectedLedger('candidate');
 function sample(){return {passed:true,explicitMigration:true,runtimePrivilegeSeparationPass:true,ledgerBefore:ledger,ledgerAfter:ledger,schemaBefore:'a'.repeat(64),schemaAfter:'a'.repeat(64),
  checks:[{name:'separate_explicit_migration_identity',passed:true},{name:'runtime_cannot_DDL_write_ledger_or_assume_migrator',passed:true}],
  matrix:{passed:true,diagnosticComplete:true,targetCases:structuredClone(rows),expiredSessionProtocolPass:true,httpErrorMappingMismatchObserved:false,applicationErrorMappingGapObserved:false,exactHistoricalR24CauseConfirmed:false,
   independentCodeCount:4,independentSessionCount:4,authRequests:4,tokenRequests:4,protectedGrantUnchanged:true,targetGrantUnchanged:true,protocolAssertionsPass:true,childEvidencePass:true,deadlineExceeded:false,
   cleanup:{childrenStopped:true,forcedOwnedChildTermination:false},startupEvidence:['A','B'].map(mode=>({mode,readyStatus:200,readinessRequestCount:1,ownedChildStopped:true,forcedOwnedChildTermination:false,observed:{passed:true,evidenceComplete:true,snapshotReceived:true,timedOut:false,exitCode:0}})),
   serviceLogs:['A','B'].map(mode=>({mode,stdout:{overflow:false,events:[]},stderr:{overflow:false,events:[]}}))}};}
 check(()=>assert(verifyDriver(sample(),ledger).passed));
 for(const mutate of [v=>v.passed=false,v=>v.ledgerBefore=[],v=>v.ledgerAfter=[],v=>v.schemaAfter='b'.repeat(64),v=>v.checks[1].passed=false,v=>v.matrix.directProbe={category:'PERSISTENT_GRANT_DENIED_SQL'},v=>v.matrix.expiredSessionProtocolPass=false,v=>v.matrix.protocolAssertionsPass=false,v=>v.matrix.independentCodeCount=5,v=>v.matrix.independentSessionCount=3,v=>v.matrix.tokenRequests=5,v=>v.matrix.authRequests=9,v=>v.matrix.protectedGrantUnchanged=false,v=>v.matrix.targetGrantUnchanged=false,v=>v.matrix.childEvidencePass=false,v=>v.matrix.deadlineExceeded=true,v=>v.matrix.cleanup.childrenStopped=false,v=>v.matrix.cleanup.forcedOwnedChildTermination=true,v=>v.matrix.startupEvidence.pop(),v=>v.matrix.startupEvidence[0].observed.exitCode=1,v=>v.matrix.serviceLogs[0].stderr.overflow=true]){const s=sample();mutate(s);check(()=>assert.throws(()=>verifyDriver(s,ledger)));}
 const poisoned=sample();poisoned.token=secret;poisoned.matrix.raw=secret;poisoned.matrix.targetCases[0].code=secret;check(()=>assert(!JSON.stringify(projectDriver(poisoned)).includes(secret)));check(()=>assert.deepEqual(projectDriver(projectDriver(poisoned)),projectDriver(poisoned)));
 stage='identity';const image={Id:'sha256:'+'a'.repeat(64),Os:'linux',Architecture:'amd64',Config:{Labels:{'org.opencontainers.image.revision':'b'.repeat(40)},User:'node',Cmd:['node','apps/authorization-service/dist/main.js']}};
 check(()=>assert(verifyIntegrationImage([image],image.Id,'authorization','b'.repeat(40)).directMain));
 for(const mutate of [v=>v.Id='sha256:'+'c'.repeat(64),v=>v.Config.User='root',v=>v.Config.Cmd=['node','migrate.js'],v=>v.Config.Labels['org.opencontainers.image.revision']='d'.repeat(40)]){const bad=structuredClone(image);mutate(bad);check(()=>assert.throws(()=>verifyIntegrationImage([bad],image.Id,'authorization','b'.repeat(40))));}
 const probes=Array.from({length:3},()=>({version:'v24.22.1',lts:'Krypton',uid:1000,hash:'a'.repeat(64),files:163}));check(()=>assert(verifyCompiledIdentity(probes)));
 const mismatch=structuredClone(probes);mismatch[1].hash='b'.repeat(64);check(()=>assert.throws(()=>verifyCompiledIdentity(mismatch)));check(()=>assert.throws(()=>verifyDiskBudget(1,true)));
 const metadata={Name:'/owned',Config:{Labels:{'wepuu.run':'run','wepuu.phase':'r34-targeted'}},State:{Running:false,ExitCode:0,OOMKilled:false}};check(()=>assert(owned(metadata,'owned','run').stopped));check(()=>assert.throws(()=>owned(metadata,'other','run')));
 stage='scenario';const base=await readFile('test/persistent-authorization/r8/integration.mjs'),scenario=buildScenario(base);
 check(()=>assert.throws(()=>buildScenario(Buffer.concat([base,Buffer.from(' ')]))));
 for(const s of ["from'/harness/r34/core.mjs'",'for(const name of caseNames)',"codes.size,4,'FOUR_INDEPENDENT_CODES'","sessions.size,4,'FOUR_INDEPENDENT_SESSIONS'",'tokenRequests===4','authRequestBudget:8,tokenRequestBudget:4'])check(()=>assert(scenario.includes(s)));
 const target=scenario.slice(scenario.indexOf(" stage='target_binding';"),scenario.indexOf('\n const pa=await freePort()'));
 for(const forbidden of ['adapter.consume(','await refresh(','independent_compiled_adapter_probe','DELETE FROM','CREATE FUNCTION','DROP '])check(()=>assert(!target.includes(forbidden)));
 const syntax=spawnSync(process.execPath,['--check','--input-type=module'],{input:scenario,encoding:'utf8',timeout:10000,maxBuffer:65536,env:{}});check(()=>assert.equal(syntax.status,0));
 stage='entry_points';const builder=await readFile('scripts/build-r34-artifacts.mjs','utf8'),runner=await readFile('scripts/run-r34-targeted.mjs','utf8'),recipe=await readFile('deploy/R34.Containerfile','utf8');
 for(const s of ['--network','none','--pull=false','verifyBuilder','verifyBuildProcess','verifyCompiledIdentity','copyFile','inputsUnchanged','discardedOutputBytes'])check(()=>assert(builder.includes(s)));
 for(const s of ['buildCandidate()','verifyDriver(raw,ledger)','targetedAttempts=1','--internal','--pull=never','no-new-privileges','r34/export.mjs','ab29f07'])check(()=>assert(runner.includes(s)));
 check(()=>assert(!recipe.includes('pnpm install')));check(()=>assert(recipe.includes('pnpm clean && pnpm build')));check(()=>assert(!recipe.includes('migrate')));
 for(const file of ['scripts/build-r34-artifacts.mjs','scripts/run-r34-targeted.mjs','test/persistent-authorization/r34/core.mjs','test/persistent-authorization/r34/report.mjs','test/persistent-authorization/r34/scenario-source.mjs','test/persistent-authorization/r34/export.mjs']){const r=spawnSync(process.execPath,['--check',file],{timeout:10000,maxBuffer:65536,env:{}});check(()=>assert.equal(r.status,0));}
 console.log(JSON.stringify({passed:true,checks,dockerInvoked:false,servicesStarted:false,syntaxOnlyChildren:true,productionAccessed:false}));
}catch{console.log(JSON.stringify({passed:false,stage,checksCompleted:checks,category:'R34_SYNTHETIC_FAILURE',rawOutputSuppressed:true,dockerInvoked:false}));process.exitCode=1;}
