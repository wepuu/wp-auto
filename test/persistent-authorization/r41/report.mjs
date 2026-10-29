import assert from 'node:assert/strict';
import {project as legacyProject,verifyScenario as legacyVerify,expectedChecks} from '../r22/report.mjs';
import {projectEvidence} from '../r38/core.mjs';
import {reportingComplete,assertions,stages} from '../r37/report.mjs';
import {projectDriver as diagnosticProject} from '../r27/report.mjs';
export {expectedChecks};
const fixed=new Set([...assertions,'B_RT_FIXTURE','B_RT_PRESENT','B_PREISSUED_CODE','TRANSITION_LINK','TRANSITION_CUSTOM_CLASSIFICATION','B_NORMAL_STOP','A_PREISSUED_CODE','A_VALID_RT','NO_LIFETIME_EXTENSION','A_CHECKBOX_HIDDEN','A_NO_NEW_PERSISTENT_CODE','A_NO_NEW_RECEIPT','RT_AFTER_SESSION','RT_A_TO_B','REPLAY_FIXTURE','REPLAY_ROTATE','EXPIRED_BETTER_AUTH_REDIRECT','FOREIGN_ACCOUNT_NO_EXISTING_BINDING','SECOND_LOCAL_LOGIN','SECOND_LOCAL_MOCK_SEND','SECRET_FREE_LINKS','PROTECTED_GRANT_UNCHANGED','EXISTING_RATE_BUDGET']);
export function project(v){const o=legacyProject(v);
 if(stages.includes(v?.stage))o.stage=v.stage;
 if(fixed.has(v?.assertion))o.assertion=v.assertion;
 if(v?.missingRtEvidence)o.missingRtEvidence=projectEvidence(v.missingRtEvidence);
 const diagnostics=v?.diagnostics??v?.responseDiagnostics;
 if(Array.isArray(diagnostics))o.responseDiagnostics=diagnostics.slice(-5).filter(r=>['token','code_exchange','refresh'].includes(r?.operation)).map(r=>({operation:r.operation==='refresh'?'refresh':'code_exchange',status:Number.isInteger(r.status)&&r.status>=100&&r.status<=599?r.status:null,error:['invalid_grant','invalid_request','invalid_target','invalid_scope','server_error','NOT_OBSERVED'].includes(r.error??r.category)?r.error??r.category:'NOT_OBSERVED',...Object.fromEntries(['accessTokenPresent','refreshTokenPresent','jsonParsed'].filter(k=>typeof r[k]==='boolean').map(k=>[k,r[k]]))}));
 if(Array.isArray(v?.serviceLogs))o.serviceLogs=diagnosticProject({matrix:v}).matrix.serviceLogs;
 if(v?.matrix)o.matrix=project(v.matrix);return o;
}
export function verifyScenario(v,step,ledger){legacyVerify(v,step,ledger);const o=project(v),m=o.matrix;
 assert(['matrix','transition'].includes(step),'R41_STEPS_ONLY');
 assert(m.serviceLogs?.length===2&&new Set(m.serviceLogs.map(r=>r.mode)).size===2&&m.serviceLogs.every(r=>['A','B'].includes(r.mode)&&!r.stdout.overflow&&!r.stderr.overflow),'R41_LOGS_REQUIRED');
 if(step==='matrix')assert(reportingComplete(m)&&m.missingRtEvidence.refreshJsonParsed===true,'R41_MISSING_RT_EVIDENCE_REQUIRED');
 return o;
}
