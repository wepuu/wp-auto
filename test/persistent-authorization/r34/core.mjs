import assert from 'node:assert/strict';
import {responseEvidence as diagnosticResponse,verifyCases as diagnosticCases,caseNames} from '../r27/core.mjs';
export {caseNames};
export function responseEvidence(name,r){
 const e=diagnosticResponse(name,r);
 if(e.expired){assert(e.status===400&&e.error==='invalid_grant','EXPIRED_INVALID_GRANT_REQUIRED');
  const text=JSON.stringify(r.body);assert(!text.includes('persistent_grant_denied')&&!text.includes('P0001')&&Object.keys(r.body).every(k=>['error','error_description','error_uri'].includes(k)),'ERROR_BODY_INTERNAL_DETAIL');}
 return e;
}
export function verifyCases(rows){const summary=diagnosticCases(rows);assert(summary.expiredSessionProtocolPass&&!summary.httpErrorMappingMismatchObserved,'EXPIRED_PROTOCOL_REQUIRED');return summary;}
