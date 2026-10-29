// No application import, Docker call or database access. Child Node is syntax-only.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {caseNames,responseEvidence,classifyConsumeError,safeLogCollector,verifyCases} from '../test/persistent-authorization/r27/core.mjs';
import {projectMatrix,projectDriver,verifyDriver} from '../test/persistent-authorization/r27/report.mjs';
import {buildScenario} from '../test/persistent-authorization/r27/scenario-source.mjs';
import {expectedLedger} from '../packages/database/test/r17-migration-evidence.mjs';
import {owned} from './run-r27-targeted.mjs';
let checks=0;const check=f=>{f();checks++;},sentinel='SENSITIVE_SENTINEL_TOKEN_CODE_UID_EXCEPTION';
const normal={status:200,body:{access_token:sentinel,refresh_token:sentinel}};
const denied={status:400,body:{error:'invalid_grant'}},server={status:500,body:{error:'server_error'}};
for(const name of caseNames){const r=responseEvidence(name,name.startsWith('valid')?normal:server);check(()=>assert.equal(r.protocolPass,name.startsWith('valid')));check(()=>assert(!JSON.stringify(r).includes(sentinel)));}
for(const status of [401,403,429,502,200])check(()=>assert.throws(()=>responseEvidence('expired_A',{status,body:{error:'invalid_grant'}})));
for(const key of ['access_token','refresh_token'])check(()=>assert.throws(()=>responseEvidence('expired_A',{...server,body:{error:'server_error',[key]:sentinel}}),{message:'EXPIRED_NO_TOKENS'}));
check(()=>assert.throws(()=>responseEvidence('valid_A',server),{message:'VALID_CONTROL_FAILED'}));
check(()=>assert(responseEvidence('expired_B',denied).protocolPass));
check(()=>assert.equal(classifyConsumeError({code:'P0001',message:'persistent_grant_denied'}).category,'PERSISTENT_GRANT_DENIED_SQL'));
for(const e of [{code:'P0001',message:sentinel},{code:'42501',message:'persistent_grant_denied'},{code:'08006',message:sentinel},{code:sentinel,message:sentinel}]){
 const v=classifyConsumeError(e);check(()=>assert.notEqual(v.category,'PERSISTENT_GRANT_DENIED_SQL'));check(()=>assert(!JSON.stringify(v).includes(sentinel)));
}
check(()=>assert(classifyConsumeError({error:'invalid_grant',status:400}).mappedInvalidGrant));
check(()=>assert(!classifyConsumeError({error:'invalid_grant',status:500}).mappedInvalidGrant));
const logs=safeLogCollector();logs.push(sentinel+'\n');logs.push('{"event":"oauth.grant_');logs.push('failed","stage":"interaction","category":"unknown","raw":"'+sentinel+'"}\n');
check(()=>assert.deepEqual(logs.snapshot().events,[{event:'oauth.grant_failed',stage:'interaction',category:'unknown'}]));
check(()=>assert(!JSON.stringify(logs.snapshot()).includes(sentinel)));
logs.push(JSON.stringify({event:'oauth.grant_failed',stage:sentinel,category:sentinel})+'\n');check(()=>assert.equal(logs.snapshot().events.length,1));
const overflow=safeLogCollector(10);overflow.push('x'.repeat(11));check(()=>assert(overflow.snapshot().overflow));
const long=safeLogCollector();long.push('x'.repeat(8193));check(()=>assert(long.snapshot().overflow));
const rows=caseNames.map(name=>({...responseEvidence(name,name.startsWith('valid')?normal:server),identityFresh:true,beforeValid:true,tokenStateVerified:true,
 ...(name.startsWith('expired')?{updatedRows:1,afterExpired:true,codeUnconsumed:true}:{})}));
check(()=>assert(verifyCases(rows).diagnosticComplete));
check(()=>assert(!verifyCases(rows).expiredSessionProtocolPass));
for(const mutate of [r=>r.pop(),r=>r.push(r[0]),r=>r[0].name='valid_B',r=>r[0].identityFresh=false,r=>r[2].updatedRows=0,r=>r[2].updatedRows=2,
 r=>r[2].afterExpired=false,r=>r[2].codeUnconsumed=false,r=>r[2].accessTokenPresent=true,r=>r[2].status=200,r=>r[2].protocolPass=true,r=>r[2].expired=false,r=>r[2].mode='B',r=>r[1].tokenStateVerified=false]){
 const bad=structuredClone(rows);mutate(bad);check(()=>assert.throws(()=>verifyCases(bad)));
}
const ledger=await expectedLedger('candidate');
function sample(){return {passed:true,explicitMigration:true,runtimePrivilegeSeparationPass:true,ledgerBefore:ledger,ledgerAfter:ledger,schemaBefore:'a'.repeat(64),schemaAfter:'a'.repeat(64),
 checks:[{name:'separate_explicit_migration_identity',passed:true},{name:'runtime_cannot_DDL_write_ledger_or_assume_migrator',passed:true}],
 matrix:{passed:true,diagnosticComplete:true,targetCases:structuredClone(rows),directProbe:{category:'PERSISTENT_GRANT_DENIED_SQL',mappedInvalidGrant:false,codeUnconsumed:true,tokenArtifactsUnchanged:true,independentCode:true,runtimeRoleRestricted:true},
 expiredSessionProtocolPass:false,httpErrorMappingMismatchObserved:true,applicationErrorMappingGapObserved:true,exactHistoricalR24CauseConfirmed:false,
 independentCodeCount:5,independentSessionCount:5,authRequests:5,tokenRequests:4,protectedGrantUnchanged:true,targetGrantUnchanged:true,protocolAssertionsPass:false,childEvidencePass:true,deadlineExceeded:false,
 cleanup:{childrenStopped:true,forcedOwnedChildTermination:false},
 startupEvidence:['A','B'].map(mode=>({mode,readyStatus:200,readinessRequestCount:1,ownedChildStopped:true,forcedOwnedChildTermination:false,observed:{passed:true,evidenceComplete:true,snapshotReceived:true,timedOut:false,exitCode:0}})),
 serviceLogs:['A','B'].map(mode=>({mode,stdout:{overflow:false,events:[]},stderr:{overflow:false,events:[]}}))}};}
check(()=>assert(verifyDriver(sample(),ledger).passed));
for(const mutate of [v=>v.passed=false,v=>v.explicitMigration=false,v=>v.ledgerBefore=[],v=>v.ledgerAfter=[],v=>v.schemaAfter='b'.repeat(64),v=>v.checks[1].passed=false,
 v=>v.matrix.diagnosticComplete=false,v=>v.matrix.exactHistoricalR24CauseConfirmed=true,v=>v.matrix.expiredSessionProtocolPass=true,v=>v.matrix.protocolAssertionsPass=true,
 v=>v.matrix.independentCodeCount=4,v=>v.matrix.independentSessionCount=4,v=>v.matrix.tokenRequests=5,v=>v.matrix.authRequests=9,
 v=>v.matrix.targetGrantUnchanged=false,v=>v.matrix.protectedGrantUnchanged=false,v=>v.matrix.childEvidencePass=false,v=>v.matrix.deadlineExceeded=true,
 v=>v.matrix.cleanup.childrenStopped=false,v=>v.matrix.cleanup.forcedOwnedChildTermination=true,v=>v.matrix.directProbe.category='SQL_PERMISSION_DENIED',
 v=>v.matrix.directProbe.runtimeRoleRestricted=false,v=>v.matrix.startupEvidence.pop(),v=>v.matrix.startupEvidence[0].mode='B',v=>v.matrix.startupEvidence[0].observed.exitCode=1,
 v=>v.matrix.serviceLogs[0].stderr.overflow=true,v=>v.matrix.serviceLogs.pop(),v=>v.matrix.httpErrorMappingMismatchObserved=false,v=>v.matrix.applicationErrorMappingGapObserved=false]){
 const bad=sample();mutate(bad);check(()=>assert.throws(()=>verifyDriver(bad,ledger)));
}
const poisoned=sample();poisoned.token=sentinel;poisoned.matrix.payload=sentinel;poisoned.matrix.targetCases[0].code=sentinel;poisoned.matrix.serviceLogs[0].stdout.events=[{event:sentinel,category:sentinel}];
check(()=>assert(!JSON.stringify(projectDriver(poisoned)).includes(sentinel)));
check(()=>assert.deepEqual(projectDriver(projectDriver(poisoned)),projectDriver(poisoned)));
check(()=>assert.equal(projectMatrix({passed:false,stage:'expired_A',assertion:'EXPIRY_ONE_ROW'}).assertion,'EXPIRY_ONE_ROW'));
check(()=>assert(!JSON.stringify(projectMatrix({passed:false,stage:sentinel,assertion:sentinel,exception:sentinel})).includes(sentinel)));
const meta={Name:'/owned',Config:{Labels:{'wepuu.run':'run','wepuu.phase':'r27-targeted'}},State:{Running:false,ExitCode:0,OOMKilled:false}};
check(()=>assert(owned(meta,'owned','run').stopped));check(()=>assert.throws(()=>owned(meta,'other','run')));check(()=>assert.throws(()=>owned(meta,'owned','other')));
const base=await readFile('test/persistent-authorization/r8/integration.mjs'),source=buildScenario(base);
check(()=>assert.throws(()=>buildScenario(Buffer.concat([base,Buffer.from(' ')])),{message:/R27_BASE_INPUT_HASH/u}));
for(const marker of ["authRequests<8","tokenRequests<4",'for(const name of caseNames)','await adapter.consume(probeCode.code)',"const r=await exchange(s,which)","await service.complete(await makeProof(primary))",'runtimeDb?.close()',"from'/harness/r27/service.mjs'",'result.protocolAssertionsPass=result.passed&&result.expiredSessionProtocolPass===true'])check(()=>assert(source.includes(marker)));
const target=source.slice(source.indexOf(" stage='target_binding';"),source.indexOf('\n const pa=await freePort()'));
for(const forbidden of ['verifyPending(primary)','withWriteFailure(','await refresh(','await inspectExpiredSession(','DROP ','CREATE FUNCTION','DELETE FROM'])check(()=>assert(!target.includes(forbidden)));
const tmp=await mkdtemp(path.join(tmpdir(),'wepuu-r27-syntax-')),file=path.join(tmp,'scenario.mjs');await writeFile(file,source,{flag:'wx'});
await promisify(execFile)(process.execPath,['--check',file],{timeout:10000,windowsHide:true,maxBuffer:10000});checks++;
const runner=await readFile('scripts/run-r27-targeted.mjs','utf8');
for(const marker of ['--pull=never','--internal','no-new-privileges','targetedAttempts=1','verifyDriver(raw,ledger)','ab29f07','inputsUnchanged','target=/harness/r8/integration.mjs,readonly'])check(()=>assert(runner.includes(marker)));
console.log(JSON.stringify({passed:true,checks,servicesStarted:false,dockerInvoked:false,productionAccessed:false,syntaxOnlyChild:true}));
