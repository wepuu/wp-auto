import assert from 'node:assert/strict';
import {projectDriver as originalProject} from '../r27/report.mjs';
import {verifyCases} from './core.mjs';
export function projectDriver(v){
 const o=originalProject(v);
 if(o.matrix&&['EXPIRED_INVALID_GRANT_REQUIRED','ERROR_BODY_INTERNAL_DETAIL','FOUR_INDEPENDENT_CODES','FOUR_INDEPENDENT_SESSIONS','EXPIRED_PROTOCOL_REQUIRED'].includes(v?.matrix?.assertion))o.matrix.assertion=v.matrix.assertion;
 return o;
}
export function verifyDriver(v,ledger){
 const o=projectDriver(v),m=o.matrix;
 assert(o.passed&&o.explicitMigration&&o.runtimePrivilegeSeparationPass,'DRIVER_REQUIRED');
 assert.deepEqual(o.ledgerBefore,ledger,'LEDGER_BEFORE');assert.deepEqual(o.ledgerAfter,ledger,'LEDGER_AFTER');
 assert(/^[a-f0-9]{64}$/u.test(o.schemaBefore??'')&&o.schemaBefore===o.schemaAfter,'SCHEMA_UNCHANGED');
 assert.deepEqual(o.checks?.map(r=>[r.name,r.passed]),[['separate_explicit_migration_identity',true],['runtime_cannot_DDL_write_ledger_or_assume_migrator',true]],'PRIVILEGES_REQUIRED');
 assert(m?.passed&&m.diagnosticComplete&&m.exactHistoricalR24CauseConfirmed===false,'PROTOCOL_RESULT_REQUIRED');
 verifyCases(m.targetCases);assert(m.expiredSessionProtocolPass&&m.protocolAssertionsPass&&m.httpErrorMappingMismatchObserved===false&&m.applicationErrorMappingGapObserved===false,'PROTOCOL_SUMMARY');
 assert(m.independentCodeCount===4&&m.independentSessionCount===4&&m.authRequests>=4&&m.authRequests<=8&&m.tokenRequests===4,'CASE_BUDGET');
 assert(!m.directProbe,'NO_DIRECT_PROBE');
 assert(m.protectedGrantUnchanged&&m.targetGrantUnchanged&&m.childEvidencePass&&m.deadlineExceeded===false&&m.cleanup?.childrenStopped&&m.cleanup.forcedOwnedChildTermination===false,'POSTCHECK_REQUIRED');
 assert(m.startupEvidence?.length===2&&new Set(m.startupEvidence.map(r=>r.mode)).size===2,'CHILDREN_REQUIRED');
 for(const r of m.startupEvidence)assert(['A','B'].includes(r.mode)&&r.readyStatus===200&&r.readinessRequestCount===1&&r.ownedChildStopped&&!r.forcedOwnedChildTermination&&r.observed.passed&&r.observed.evidenceComplete&&r.observed.snapshotReceived&&!r.observed.timedOut&&r.observed.exitCode===0,'CHILD_LIFECYCLE');
 assert(m.serviceLogs?.length===2&&new Set(m.serviceLogs.map(r=>r.mode)).size===2&&m.serviceLogs.every(r=>['A','B'].includes(r.mode)&&!r.stdout.overflow&&!r.stderr.overflow),'LOG_LIMIT');return o;
}
