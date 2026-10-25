// Test-only whitelist projection. No arbitrary strings, identifiers or payloads.
import {project as legacyProject} from '../r22/report.mjs';
export const stages=Object.freeze(['missing_rt_authorize','missing_rt_exchange','missing_rt_link_delete','missing_rt_refresh','missing_rt_postcheck']);
export const assertions=Object.freeze(['MISSING_LINK_FIXTURE','DENIED_STATUS','DENIED_ERROR','NO_DENIED_AT','NO_DENIED_RT',
 'MISSING_RT_AUTH_CODE_REQUIRED','MISSING_RT_TOKENS_REQUIRED','MISSING_RT_DELETE_ONE','MISSING_RT_LINK_ABSENT','MISSING_RT_ARTIFACT_PRESERVED','MISSING_RT_CLASSIFICATION_PRESERVED','MISSING_RT_NO_NEW_TOKENS','MISSING_RT_CONSUMPTION_UNCHANGED','MISSING_RT_STATE_NOT_CONFIRMED']);
const categories=new Set(['invalid_grant','invalid_request','invalid_target','invalid_scope','server_error','NOT_OBSERVED']);
const count=v=>Number.isSafeInteger(v)&&v>=0?v:null;
export function responseSummary(r){return {status:Number.isInteger(r?.status)&&r.status>=100&&r.status<=599?r.status:null,
 error:categories.has(r?.body?.error)?r.body.error:'NOT_OBSERVED',accessTokenPresent:r?.body?.access_token!==undefined,refreshTokenPresent:r?.body?.refresh_token!==undefined};}
function summary(v){return {status:Number.isInteger(v?.status)&&v.status>=100&&v.status<=599?v.status:null,error:categories.has(v?.error)?v.error:'NOT_OBSERVED',
 ...Object.fromEntries(['accessTokenPresent','refreshTokenPresent'].filter(k=>typeof v?.[k]==='boolean').map(k=>[k,v[k]]))};}
function snapshot(v){return Object.fromEntries(['links','artifacts','classifications','accessTokens','refreshTokens','consumed'].map(k=>[k,count(v?.[k])]));}
export function projectMissingRt(v){const out={};
 if(stages.includes(v?.stage))out.stage=v.stage;
 for(const k of ['authorizeCompleted','authorizationCodePresent','fixtureReady','linkDeleted','refreshCompleted','denialVerified','postcheckVerified'])if(typeof v?.[k]==='boolean')out[k]=v[k];
 if(Object.hasOwn(v??{},'deletedRows'))out.deletedRows=count(v.deletedRows);
 for(const k of ['fixtureExchange','refresh'])if(v?.[k]!==undefined)out[k]=summary(v[k]);
 for(const k of ['before','afterDelete','after'])if(v?.[k]!==undefined)out[k]=snapshot(v[k]);
 return out;
}
export function projectReport(v){const out=legacyProject(v);
 if(stages.includes(v?.stage))out.stage=v.stage;
 if((stages.includes(v?.stage)||v?.stage==='link_and_version_guards')&&assertions.includes(v?.assertion))out.assertion=v.assertion;
 if(v?.missingRtEvidence!==undefined)out.missingRtEvidence=projectMissingRt(v.missingRtEvidence);
 if(v?.matrix)out.matrix=projectReport(v.matrix);
 return out;
}
export function reportingComplete(v){const e=projectMissingRt(v?.missingRtEvidence);
 return v?.passed===true&&e.stage==='missing_rt_postcheck'&&['authorizeCompleted','authorizationCodePresent','fixtureReady','linkDeleted','refreshCompleted','denialVerified','postcheckVerified'].every(k=>e[k]===true)&&e.deletedRows===1&&
  e.fixtureExchange?.status===200&&e.fixtureExchange.accessTokenPresent===true&&e.fixtureExchange.refreshTokenPresent===true&&e.refresh?.status===400&&e.refresh.error==='invalid_grant'&&e.refresh.accessTokenPresent===false&&e.refresh.refreshTokenPresent===false&&
  ['before','afterDelete','after'].every(k=>['links','artifacts','classifications','accessTokens','refreshTokens','consumed'].every(n=>Number.isSafeInteger(e[k]?.[n])&&e[k][n]>=0))&&
  e.before.links===1&&e.before.artifacts===1&&e.before.classifications===1&&e.before.consumed===0&&e.afterDelete.links===0&&e.afterDelete.artifacts===1&&e.afterDelete.classifications===1&&e.after.links===0&&e.after.artifacts===1&&e.after.classifications===1&&
  e.after.accessTokens===e.before.accessTokens&&e.after.refreshTokens===e.before.refreshTokens&&e.after.consumed===e.before.consumed;
}
export function recoverLegacy(v){
 return {passed:v?.passed===true,stage:[...stages,'link_and_version_guards','compiled_service_matrix'].includes(v?.stage)?v.stage:'NOT_OBSERVED',
  category:['ASSERTION_FAILED','SQL_FAILURE','NOT_CONFIRMED'].includes(v?.category)?v.category:'NOT_OBSERVED',
  assertion:assertions.includes(v?.assertion)?v.assertion:'NOT_OBSERVED',
  // These historical diagnostics come from exchange(), not refresh().
  recentCodeExchangeDiagnostics:Array.isArray(v?.diagnostics)?v.diagnostics.slice(-5).filter(r=>r?.operation==='token').map(r=>({operation:'code_exchange',status:summary(r).status,category:categories.has(r?.category)?r.category:'NOT_OBSERVED'})):[],
  observedRefreshStatus:null,observedRefreshError:'NOT_OBSERVED',
  ...(v?.missingRtEvidence!==undefined?{missingRtEvidence:projectMissingRt(v.missingRtEvidence)}:{})};
}
