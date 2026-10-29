import assert from 'node:assert/strict';
import {caseNames,verifyCases} from './core.mjs';
const hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/u.test(v);
const stages=new Set(['setup','explicit_migration','runtime_privileges','compiled_service_matrix','identity','actual_better_auth','local_keys_and_sites','egress_guard','compiled_main_start','target_binding',...caseNames,'independent_compiled_adapter_probe','target_postcheck']);
const flags=['diagnosticComplete','expiredSessionProtocolPass','httpErrorMappingMismatchObserved','applicationErrorMappingGapObserved','exactHistoricalR24CauseConfirmed','protectedGrantUnchanged','targetGrantUnchanged','protocolAssertionsPass','childEvidencePass','deadlineExceeded'];
const assertions=new Set(['CASE_NAME','EXPIRED_NO_TOKENS','UNEXPECTED_EXPIRED_RESPONSE','VALID_CONTROL_FAILED','FOUR_CASES_REQUIRED','CASE_ORDER','CASE_STATE_REQUIRED','EXPIRY_STATE_REQUIRED',
 'STATE_ONE_ROW','CODE_REQUIRED','LINK_REQUIRED','INDEPENDENT_CODE_AND_SESSION','PERSISTENT_CLASSIFICATION','FRESH_STATE_VALID','EXPIRY_ONE_ROW','SESSION_EXPIRED_READBACK',
 'EXPIRY_PRESERVES_OTHER_STATE','SAFE_LOG_LIMIT','CODE_REMAINS_WITHIN_TTL','DENIAL_CODE_NOT_CONSUMED','DENIAL_NO_TOKEN_ARTIFACT','CONTROL_CODE_CONSUMED','EXPIRED_ADAPTER_MUST_REJECT',
 'EXACT_SQL_DENIAL_REQUIRED','PROBE_CODE_NOT_CONSUMED','PROBE_NO_TOKEN_ARTIFACT','PROTECTED_GRANT_UNCHANGED','TARGET_GRANT_UNCHANGED','FIVE_INDEPENDENT_CODES','FIVE_INDEPENDENT_SESSIONS',
 'TARGET_REQUEST_BUDGET','MAIN_START_OR_READY_FAILED','REAL_SERVICE_CSRF','FORM_REQUIRED','AUTH_REDIRECT','CALLBACK_ISSUER','CALLBACK_STATE','SERVICE_MATRIX_FAILED','SERVICE_SCHEMA_UNCHANGED','MIGRATION_LEDGER_UNCHANGED']);
const bools=(v,keys)=>Object.fromEntries(keys.filter(k=>typeof v?.[k]==='boolean').map(k=>[k,v[k]]));
const events=rows=>Array.isArray(rows)?rows.slice(0,16).filter(r=>r?.event==='oauth.grant_failed'&&['interaction','binding','grant_load','consent_plan','grant_save','interaction_finish'].includes(r.stage)&&['unknown','grant.lookup_failed','grant.save_failed','interaction.finish_failed'].includes(r.category)).map(r=>({event:r.event,stage:r.stage,category:r.category})):[];
export function projectMatrix(v){
 const o={passed:v?.passed===true,...bools(v,flags),rawErrorSuppressed:true};
 if(v?.stage!==undefined)o.stage=stages.has(v.stage)?v.stage:'NOT_CONFIRMED';
 if(v?.category!==undefined)o.category=['ASSERTION_FAILED','SQL_FAILURE','NOT_CONFIRMED'].includes(v.category)?v.category:'NOT_CONFIRMED';
 if(v?.assertion!==undefined)o.assertion=assertions.has(v.assertion)?v.assertion:'NOT_CONFIRMED';
 // No arbitrary error message/stack, URL, identifier or payload is exported.
 if(Array.isArray(v?.targetCases))o.targetCases=v.targetCases.slice(0,4).map(r=>({name:caseNames.includes(r?.name)?r.name:'NOT_CONFIRMED',mode:['A','B'].includes(r?.mode)?r.mode:'NOT_CONFIRMED',
  ...bools(r,['expired','accessTokenPresent','refreshTokenPresent','protocolPass','identityFresh','beforeValid','afterExpired','codeUnconsumed','tokenStateVerified']),
  ...(Number.isInteger(r?.status)&&r.status>=100&&r.status<=599?{status:r.status}:{}),
  ...(Number.isSafeInteger(r?.updatedRows)&&r.updatedRows>=0?{updatedRows:r.updatedRows}:{}),
  ...(r?.error!==undefined?{error:['invalid_grant','server_error','NOT_OBSERVED'].includes(r.error)?r.error:'NOT_CONFIRMED'}:{}),safeServiceEvents:events(r?.safeServiceEvents)}));
 if(v?.directProbe)o.directProbe={category:['PERSISTENT_GRANT_DENIED_SQL','SQL_PERMISSION_DENIED','SQL_CONNECTION_FAILED'].includes(v.directProbe.category)?v.directProbe.category:'NOT_CONFIRMED',
  ...bools(v.directProbe,['mappedInvalidGrant','codeUnconsumed','tokenArtifactsUnchanged','independentCode','runtimeRoleRestricted'])};
 for(const k of ['authRequests','tokenRequests','independentCodeCount','independentSessionCount','elapsedMonotonicMs'])if(Number.isFinite(v?.[k])&&v[k]>=0)o[k]=v[k];
 if(v?.cleanup)o.cleanup={childrenStopped:v.cleanup.childrenStopped===true,forcedOwnedChildTermination:v.cleanup.forcedOwnedChildTermination===true};
 if(Array.isArray(v?.startupEvidence))o.startupEvidence=v.startupEvidence.slice(0,2).map(r=>({mode:['A','B'].includes(r.mode)?r.mode:'NOT_CONFIRMED',readyStatus:r.readyStatus===200?200:null,readinessRequestCount:r.readinessRequestCount===1?1:null,
  ownedChildStopped:r.ownedChildStopped===true,forcedOwnedChildTermination:r.forcedOwnedChildTermination===true,
  observed:{...bools(r.observed,['passed','evidenceComplete','snapshotReceived','timedOut']),exitCode:Number.isSafeInteger(r.observed?.exitCode)?r.observed.exitCode:null}}));
 if(Array.isArray(v?.serviceLogs))o.serviceLogs=v.serviceLogs.slice(0,2).map(r=>({mode:['A','B'].includes(r.mode)?r.mode:'NOT_CONFIRMED',
  ...Object.fromEntries(['stdout','stderr'].map(k=>[k,{overflow:r[k]?.overflow===true,events:events(r[k]?.events)}]))}));
 return o;
}
export function projectDriver(v){
 const o={passed:v?.passed===true,...bools(v,['explicitMigration','runtimePrivilegeSeparationPass']),rawErrorSuppressed:true};
 if(stages.has(v?.stage))o.stage=v.stage;
 if(v?.category)o.category=['ASSERTION_FAILED','SQL_FAILURE','LOCAL_FAILURE','TIMEOUT'].includes(v.category)?v.category:'NOT_CONFIRMED';
 if(v?.assertion!==undefined)o.assertion=assertions.has(v.assertion)?v.assertion:'NOT_CONFIRMED';
 for(const k of ['schemaBefore','schemaAfter'])if(hash(v?.[k]))o[k]=v[k];
 for(const k of ['ledgerBefore','ledgerAfter'])if(Array.isArray(v?.[k]))o[k]=v[k].map(r=>({name:/^\d{3}_[a-z0-9_]+\.sql$/u.test(r?.name??'')?r.name:'NOT_CONFIRMED',sha256:hash(r?.sha256)?r.sha256:'NOT_CONFIRMED'}));
 if(Array.isArray(v?.checks))o.checks=v.checks.map(r=>({name:['separate_explicit_migration_identity','runtime_cannot_DDL_write_ledger_or_assume_migrator'].includes(r?.name)?r.name:'NOT_CONFIRMED',passed:r?.passed===true}));
 if(v?.matrix)o.matrix=projectMatrix(v.matrix);
 return o;
}
export function verifyDriver(v,ledger){
 const o=projectDriver(v),m=o.matrix;
 assert(o.passed&&o.explicitMigration&&o.runtimePrivilegeSeparationPass,'DRIVER_REQUIRED');
 assert.deepEqual(o.ledgerBefore,ledger,'LEDGER_BEFORE');assert.deepEqual(o.ledgerAfter,ledger,'LEDGER_AFTER');
 assert(hash(o.schemaBefore)&&o.schemaBefore===o.schemaAfter,'SCHEMA_UNCHANGED');
 assert.deepEqual(o.checks?.map(r=>[r.name,r.passed]),[['separate_explicit_migration_identity',true],['runtime_cannot_DDL_write_ledger_or_assume_migrator',true]],'PRIVILEGES_REQUIRED');
 assert(m?.passed&&m.diagnosticComplete&&m.exactHistoricalR24CauseConfirmed===false,'DIAGNOSTIC_REQUIRED');
 const summary=verifyCases(m.targetCases);assert.equal(m.expiredSessionProtocolPass,summary.expiredSessionProtocolPass,'PROTOCOL_SUMMARY');
 assert.equal(m.httpErrorMappingMismatchObserved,summary.httpErrorMappingMismatchObserved,'MISMATCH_SUMMARY');
 assert.equal(m.applicationErrorMappingGapObserved,summary.httpErrorMappingMismatchObserved&&!m.directProbe?.mappedInvalidGrant,'MAPPING_SUMMARY');
 assert.equal(m.protocolAssertionsPass,m.expiredSessionProtocolPass,'PROTOCOL_NOT_DIAGNOSTIC');
 assert(m.independentCodeCount===5&&m.independentSessionCount===5&&m.authRequests>=5&&m.authRequests<=8&&m.tokenRequests===4,'CASE_BUDGET');
 assert(m.protectedGrantUnchanged&&m.targetGrantUnchanged&&m.childEvidencePass&&m.deadlineExceeded===false&&m.cleanup?.childrenStopped&&m.cleanup.forcedOwnedChildTermination===false,'POSTCHECK_REQUIRED');
 assert(m.directProbe?.category==='PERSISTENT_GRANT_DENIED_SQL'&&m.directProbe.codeUnconsumed&&m.directProbe.tokenArtifactsUnchanged&&m.directProbe.independentCode&&m.directProbe.runtimeRoleRestricted,'PROBE_REQUIRED');
 assert(m.startupEvidence?.length===2&&new Set(m.startupEvidence.map(r=>r.mode)).size===2,'CHILDREN_REQUIRED');
 for(const r of m.startupEvidence)assert(['A','B'].includes(r.mode)&&r.readyStatus===200&&r.readinessRequestCount===1&&r.ownedChildStopped&&!r.forcedOwnedChildTermination&&r.observed.passed&&r.observed.evidenceComplete&&r.observed.snapshotReceived&&!r.observed.timedOut&&r.observed.exitCode===0,'CHILD_LIFECYCLE');
 assert(m.serviceLogs?.length===2&&new Set(m.serviceLogs.map(r=>r.mode)).size===2&&m.serviceLogs.every(r=>['A','B'].includes(r.mode)&&!r.stdout.overflow&&!r.stderr.overflow),'LOG_LIMIT');return o;
}
