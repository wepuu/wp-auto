import assert from 'node:assert/strict';
export const caseNames=Object.freeze(['valid_A','valid_B','expired_A','expired_B']);
export function responseEvidence(name,r) {
 assert(caseNames.includes(name),'CASE_NAME');
 const e={name,mode:name.endsWith('_A')?'A':'B',expired:name.startsWith('expired'),status:r.status,
  error:['invalid_grant','server_error'].includes(r.body?.error)?r.body.error:'NOT_OBSERVED',
  accessTokenPresent:r.body?.access_token!==undefined,refreshTokenPresent:r.body?.refresh_token!==undefined};
 if(e.expired) {
  assert(!e.accessTokenPresent&&!e.refreshTokenPresent,'EXPIRED_NO_TOKENS');
  assert((e.status===400&&e.error==='invalid_grant')||(e.status===500&&e.error==='server_error'),'UNEXPECTED_EXPIRED_RESPONSE');
  e.protocolPass=e.status===400;
 } else {
  assert(e.status===200&&typeof r.body?.access_token==='string'&&r.body.access_token.length>0
   &&typeof r.body?.refresh_token==='string'&&r.body.refresh_token.length>0,'VALID_CONTROL_FAILED');
  e.protocolPass=true;
 }
 return e;
}
export function classifyConsumeError(error) {
 return {category:error?.code==='P0001'&&error?.message==='persistent_grant_denied'?'PERSISTENT_GRANT_DENIED_SQL':
  error?.code==='42501'?'SQL_PERMISSION_DENIED':error?.code==='08006'?'SQL_CONNECTION_FAILED':'NOT_CONFIRMED',
  mappedInvalidGrant:error?.error==='invalid_grant'&&(error?.status===400||error?.statusCode===400)};
}
export function safeLogCollector(limit=131072) {
 let pending='',bytes=0,overflow=false;const events=[];
 return {push(chunk){bytes+=Buffer.byteLength(chunk);if(bytes>limit){overflow=true;pending='';return;}
  pending+=String(chunk);if(pending.length>8192&&!pending.includes('\n')){overflow=true;pending='';return;}
  const rows=pending.split(/\r?\n/u);pending=rows.pop();
  for(const line of rows) {if(line.length>8192){overflow=true;continue;}let v;try{v=JSON.parse(line);}catch{continue;}
   if(v?.event==='oauth.grant_failed'&&['interaction','binding','grant_load','consent_plan','grant_save','interaction_finish'].includes(v.stage)
    &&['unknown','grant.lookup_failed','grant.save_failed','interaction.finish_failed'].includes(v.category)) {
    if(events.length>=16){overflow=true;continue;}events.push({event:v.event,stage:v.stage,category:v.category});
   }
  }
 },snapshot(){return {bytes,overflow,events:events.map(x=>({...x}))};}};
}
export function verifyCases(rows) {
 assert(Array.isArray(rows)&&rows.length===4,'FOUR_CASES_REQUIRED');
 assert.deepEqual(rows.map(r=>r.name),caseNames,'CASE_ORDER');
 for(const row of rows) {
  const expired=row.name.startsWith('expired');assert.equal(row.expired,expired,'CASE_EXPIRY_KIND');
  assert.equal(row.mode,row.name.endsWith('_A')?'A':'B','CASE_MODE');
  if(expired){assert(!row.accessTokenPresent&&!row.refreshTokenPresent,'EXPIRED_NO_TOKENS');
   assert((row.status===400&&row.error==='invalid_grant')||(row.status===500&&row.error==='server_error'),'UNEXPECTED_EXPIRED_RESPONSE');
   assert.equal(row.protocolPass,row.status===400,'CASE_PROTOCOL_RESULT');
  }else assert(row.status===200&&row.accessTokenPresent&&row.refreshTokenPresent&&row.protocolPass,'VALID_CONTROL_FAILED');
  assert(row.identityFresh===true&&row.beforeValid===true&&row.tokenStateVerified===true,'CASE_STATE_REQUIRED');
  if(row.expired)assert(row.updatedRows===1&&row.afterExpired===true&&row.codeUnconsumed===true,'EXPIRY_STATE_REQUIRED');
 }
 return {diagnosticComplete:true,expiredSessionProtocolPass:rows.filter(r=>r.expired).every(r=>r.protocolPass),
  httpErrorMappingMismatchObserved:rows.filter(r=>r.expired).every(r=>r.status===500&&r.error==='server_error')};
}
