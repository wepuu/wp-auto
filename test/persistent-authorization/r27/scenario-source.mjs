// Generate a separate fixture from the reviewed R25 setup; never edit R8 input.
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
export const baseHash='9ae4dc84533c8d619bb117f158eb68029bbe1324767c8fdd08e2076ef1abbd4f';
const target=String.raw`
 stage='target_binding';
 const primary=await newPending(siteId,resource);grantId=primary.gid;await service.complete(await makeProof(primary));
 const protectedGrant=await newPending('site_FAKE_R3R1_PROTECTED',otherResource);await service.complete(await makeProof(protectedGrant));
 const protectedBefore=JSON.stringify((await admin.query('SELECT row_to_json(g) AS v FROM platform.grants g WHERE id=$1',[protectedGrant.gid])).rows);
 const primaryBefore=JSON.stringify((await admin.query('SELECT row_to_json(g) AS v FROM platform.grants g WHERE id=$1',[grantId])).rows);
 const codec=new dbmod.SecretArtifactCodec([Buffer.from(artifact,'base64url')]),store=new dbmod.PostgresPersistentReceiptStore(db,codec);
 runtimeDb=new dbmod.Database({connectionString:JSON.parse(readScoped(context,'runtime.private.json')).dsn,applicationName:'r27-restricted-adapter'});
 const adapter=new dbmod.PostgresOidcAdapter('AuthorizationCode',runtimeDb,codec);
 const codes=new Set(),sessions=new Set();
 async function snapshot(s,l){
  const keys=store.lookups().candidates(s.code);
  const rows=await admin.query("SELECT (s.expires_at>clock_timestamp()) AS session_valid,(a.expires_at>clock_timestamp()) AS code_valid,(a.consumed_at IS NULL) AS unconsumed,(s.payload->>'accountId'=$2) AS account_matches,(s.payload->'authorizations'->$3->>'grantId'=$4) AS grant_matches,(a.payload->>'sessionUid'=s.payload->>'uid') AS link_matches FROM oauth.secret_artifacts a JOIN oauth.persistent_links l ON l.model=a.model AND l.artifact_lookup=a.lookup_version::text||':'||encode(a.artifact_hash,'hex') JOIN oauth.provider_artifacts s ON s.model='Session' AND s.payload->>'uid'=l.session_uid WHERE a.model='AuthorizationCode' AND l.artifact_lookup=ANY($1::text[])",[keys,account,clientId,grantId]);
  assert.equal(rows.rowCount,1,'STATE_ONE_ROW');return rows.rows[0];
 }
 async function counts(){return(await admin.query("SELECT model,count(*)::int AS n FROM oauth.secret_artifacts WHERE model IN ('AccessToken','RefreshToken') GROUP BY model ORDER BY model")).rows;}
 async function fresh(){
  const s=await authorize(true,'B');assert(s.code,'CODE_REQUIRED');const l=await store.link('AuthorizationCode',store.lookups().candidates(s.code));assert(l,'LINK_REQUIRED');
  assert(!codes.has(s.code)&&!sessions.has(l.sessionUid),'INDEPENDENT_CODE_AND_SESSION');codes.add(s.code);sessions.add(l.sessionUid);
  const c=await store.classification('AuthorizationCode',store.lookups().candidates(s.code));assert.equal(c.mode,'PERSISTENT_READONLY','PERSISTENT_CLASSIFICATION');
  const before=await snapshot(s,l);assert(Object.values(before).every(v=>v===true),'FRESH_STATE_VALID');return {s,l,before};
 }
 async function expire(s,l){
  const update=await admin.query("UPDATE oauth.provider_artifacts SET expires_at=clock_timestamp()-interval '1 second' WHERE model='Session' AND payload->>'uid'=$1",[l.sessionUid]);assert.equal(update.rowCount,1,'EXPIRY_ONE_ROW');
  const after=await snapshot(s,l);assert.equal(after.session_valid,false,'SESSION_EXPIRED_READBACK');
  for(const key of ['code_valid','unconsumed','account_matches','grant_matches','link_matches'])assert.equal(after[key],true,'EXPIRY_PRESERVES_OTHER_STATE');
  return update.rowCount;
 }
 function serviceEvents(which){const log=children.find(c=>c.which===which).safeLogs();assert(!log.stdout.overflow&&!log.stderr.overflow,'SAFE_LOG_LIMIT');return [...log.stdout.events,...log.stderr.events];}
 for(const name of caseNames){
  stage=name;const {s,l}=await fresh();const expired=name.startsWith('expired'),which=name.endsWith('_A')?'A':'B';
  const row={name,identityFresh:true,beforeValid:true};targetCases.push(row);
  const beforeCounts=await counts();if(expired){row.updatedRows=await expire(s,l);row.afterExpired=true;}
  const logBefore=serviceEvents(which).length;
  const r=await exchange(s,which);Object.assign(row,responseEvidence(name,r));
  const after=await snapshot(s,l);assert.equal(after.code_valid,true,'CODE_REMAINS_WITHIN_TTL');
  if(expired){assert.equal(after.unconsumed,true,'DENIAL_CODE_NOT_CONSUMED');assert.deepEqual(await counts(),beforeCounts,'DENIAL_NO_TOKEN_ARTIFACT');row.codeUnconsumed=true;}
  else {
   assert.equal(after.unconsumed,false,'CONTROL_CODE_CONSUMED');
   const verified=await jose.jwtVerify(r.body.access_token,descriptor.publicKey,{issuer,audience:resource,algorithms:['RS256']});
   assert.equal(verified.payload.scope,'mcp:read');assert.equal(verified.payload.site_id,siteId);assert.equal(verified.payload.tenant_id,tenant);assert.equal(verified.payload.grant_id,grantId);
  }
  // The service's existing event intentionally contains no SQL error details.
  await delay(50);row.safeServiceEvents=serviceEvents(which).slice(logBefore);row.tokenStateVerified=true;
 }
 stage='independent_compiled_adapter_probe';
 const {s:probeCode,l:probeLink}=await fresh();await expire(probeCode,probeLink);const beforeProbeCounts=await counts();
 let probeError;try{await adapter.consume(probeCode.code);}catch(e){probeError=e;}
 assert(probeError,'EXPIRED_ADAPTER_MUST_REJECT');directProbe=classifyConsumeError(probeError);
 assert.equal(directProbe.category,'PERSISTENT_GRANT_DENIED_SQL','EXACT_SQL_DENIAL_REQUIRED');
 assert.equal((await snapshot(probeCode,probeLink)).unconsumed,true,'PROBE_CODE_NOT_CONSUMED');
 assert.deepEqual(await counts(),beforeProbeCounts,'PROBE_NO_TOKEN_ARTIFACT');
 directProbe.codeUnconsumed=true;directProbe.tokenArtifactsUnchanged=true;directProbe.independentCode=true;directProbe.runtimeRoleRestricted=true;
 stage='target_postcheck';
 assert.equal(JSON.stringify((await admin.query('SELECT row_to_json(g) AS v FROM platform.grants g WHERE id=$1',[protectedGrant.gid])).rows),protectedBefore,'PROTECTED_GRANT_UNCHANGED');
 assert.equal(JSON.stringify((await admin.query('SELECT row_to_json(g) AS v FROM platform.grants g WHERE id=$1',[grantId])).rows),primaryBefore,'TARGET_GRANT_UNCHANGED');
 assert.equal(codes.size,5,'FIVE_INDEPENDENT_CODES');assert.equal(sessions.size,5,'FIVE_INDEPENDENT_SESSIONS');
 assert(authRequests<=8&&tokenRequests===4,'TARGET_REQUEST_BUDGET');
 const summary=verifyCases(targetCases);
 return {passed:true,...summary,targetCases,directProbe,applicationErrorMappingGapObserved:summary.httpErrorMappingMismatchObserved&&!directProbe.mappedInvalidGrant,
  exactHistoricalR24CauseConfirmed:false,independentCodeCount:codes.size,independentSessionCount:sessions.size,
  protectedGrantUnchanged:true,targetGrantUnchanged:true,productionAccessed:false};
}
`;
export function buildScenario(bytes){
 assert.equal(createHash('sha256').update(bytes).digest('hex'),baseHash,'R27_BASE_INPUT_HASH');
 let source=String(bytes).replace(/\r\n/gu,'\n');
 const a=source.indexOf(" stage='no_grant_bootstrap';"),b=source.indexOf('\n const pa=await freePort()');
 assert(a>0&&b>a,'R27_SOURCE_MARKERS');
 let head=source.slice(0,a),foot=source.slice(b);
 head=head.replace("import{inspectDenial,assertDenial}from'./consent-check.mjs';","import{caseNames,responseEvidence,classifyConsumeError,verifyCases}from'/harness/r27/core.mjs';");
 head=head.replace("from'./service.mjs'","from'/harness/r27/service.mjs'");
 head=head.replace("let cookie;","const targetCases=[];let directProbe,runtimeDb;let cookie;");
 head=head.replace("authRequests<20","authRequests<8").replace("tokenRequests<30","tokenRequests<4");
 foot=foot.replace('()=>db.close())','()=>db.close()),Promise.resolve().then(()=>runtimeDb?.close())');
 foot=foot.replace('result.protocolAssertionsPass=result.passed;','result.protocolAssertionsPass=result.passed&&result.expiredSessionProtocolPass===true;');
 // Explicitly attach partial safe case observations on every failed exit.
 foot=foot.replace('result.expiryEvidence=projectExpiry(expiryEvidence);','result.targetCases=targetCases;result.directProbe=directProbe;result.serviceLogs=children.map(c=>({mode:c.which,...c.safeLogs()}));');
 return head+target+foot;
}
