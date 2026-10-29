import assert from 'node:assert/strict';
import {projectDriver as baseProject} from '../r27/report.mjs';
import {projectEvidence,projectNormal} from './core.mjs';
import {reportingComplete} from '../r37/report.mjs';
const fixed=['CODE_REQUIRED','LINK_REQUIRED','INDEPENDENT_CODE_AND_SESSION','NORMAL_EXCHANGE_REQUIRED','NORMAL_STATE_REQUIRED','NORMAL_REFRESH_REQUIRED','NORMAL_ROTATION_REQUIRED','NORMAL_CLASSIFICATION_REQUIRED','TARGET_REQUEST_BUDGET','PROTECTED_GRANT_UNCHANGED','PROTECTED_OUTBOX_UNCHANGED','DENIED_STATUS','DENIED_ERROR','NO_DENIED_AT','NO_DENIED_RT','MISSING_RT_STATE_NOT_CONFIRMED','MISSING_LINK_FIXTURE','MISSING_RT_TOKENS_REQUIRED','MISSING_RT_DELETE_ONE','MISSING_RT_LINK_ABSENT','MISSING_RT_ARTIFACT_PRESERVED','MISSING_RT_CLASSIFICATION_PRESERVED','MISSING_RT_NO_NEW_TOKENS','MISSING_RT_CONSUMPTION_UNCHANGED'];
export function projectDriver(v){const o=baseProject(v);if(v?.matrix){const m=o.matrix;
 if(['normal_refresh_control','state_sql_preflight','target_binding','missing_rt_authorize','missing_rt_exchange','missing_rt_link_delete','missing_rt_refresh','missing_rt_postcheck'].includes(v.matrix.stage))m.stage=v.matrix.stage;
 if(fixed.includes(v.matrix.assertion))m.assertion=v.matrix.assertion;
 m.normalEvidence=projectNormal(v.matrix.normalEvidence);m.missingRtEvidence=projectEvidence(v.matrix.missingRtEvidence);
 if(typeof v.matrix.protectionVerified==='boolean')m.protectionVerified=v.matrix.protectionVerified;
 }return o;}
export function verifyDriver(v,ledger){const o=projectDriver(v),m=o.matrix;assert(o.passed&&o.explicitMigration&&o.runtimePrivilegeSeparationPass,'DRIVER_REQUIRED');
 assert.deepEqual(o.ledgerBefore,ledger);assert.deepEqual(o.ledgerAfter,ledger);assert(/^[a-f0-9]{64}$/.test(o.schemaBefore)&&o.schemaBefore===o.schemaAfter,'SCHEMA_UNCHANGED');
 assert(m?.passed&&['passed','independent','bindingVerified','rotationVerified','stateVerified'].every(k=>m.normalEvidence?.[k]===true)&&reportingComplete(m)&&m.missingRtEvidence.refreshJsonParsed===true&&m.protectionVerified,'PROTOCOL_REQUIRED');
 assert(m.authRequests===2&&m.tokenRequests===4,'BUDGET_REQUIRED');assert(m.childEvidencePass&&!m.deadlineExceeded&&m.cleanup?.childrenStopped&&!m.cleanup.forcedOwnedChildTermination,'CHILDREN_REQUIRED');return o;}
