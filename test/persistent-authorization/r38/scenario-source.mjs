import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
export const stateSql="SELECT (SELECT count(*)::int FROM oauth.persistent_links WHERE model='RefreshToken' AND artifact_lookup=ANY($1::text[])) AS links,(SELECT count(*)::int FROM oauth.secret_artifacts WHERE model='RefreshToken' AND lookup_version::text||':'||encode(artifact_hash,'hex')=ANY($1::text[])) AS artifacts,(SELECT count(*)::int FROM oauth.artifact_classifications WHERE model='RefreshToken' AND artifact_lookup=ANY($1::text[])) AS classifications,(SELECT count(*)::int FROM oauth.secret_artifacts WHERE model='AccessToken') AS \"accessTokens\",(SELECT count(*)::int FROM oauth.secret_artifacts WHERE model='RefreshToken') AS \"refreshTokens\",(SELECT count(*)::int FROM oauth.secret_artifacts WHERE model='RefreshToken' AND lookup_version::text||':'||encode(artifact_hash,'hex')=ANY($1::text[]) AND consumed_at IS NOT NULL) AS consumed";
const target=String.raw`
 stage='target_binding';const primary=await newPending(siteId,resource);grantId=primary.gid;await service.complete(await makeProof(primary));
 const protectedGrant=await newPending('site_FAKE_R3R1_PROTECTED',otherResource);await service.complete(await makeProof(protectedGrant));
 const grantSnapshot=async()=>JSON.stringify((await admin.query('SELECT row_to_json(g) AS v FROM platform.grants g ORDER BY id')).rows);
 const grantsBefore=await grantSnapshot();const outboxBefore=JSON.stringify((await admin.query('SELECT row_to_json(o) AS v FROM oauth.revocation_outbox o ORDER BY row_to_json(o)::text')).rows);
 const codec=new dbmod.SecretArtifactCodec([Buffer.from(artifact,'base64url')]),store=new dbmod.PostgresPersistentReceiptStore(db,codec);
 const readState=async rt=>(await admin.query(STATE_SQL,[store.lookups().candidates(rt)])).rows[0];
 stage='state_sql_preflight';validState(await readState('synthetic-unissued-r38'));
 const codes=new Set(),sessions=new Set();
 async function fresh(){const a=await authorize(true,'B');assert(a.code,'CODE_REQUIRED');const l=await store.link('AuthorizationCode',store.lookups().candidates(a.code));assert(l,'LINK_REQUIRED');
 assert(!codes.has(a.code)&&!sessions.has(l.sessionUid),'INDEPENDENT_CODE_AND_SESSION');codes.add(a.code);sessions.add(l.sessionUid);return a;}
 async function verifyAccess(r){const v=await jose.jwtVerify(r.body.access_token,descriptor.publicKey,{issuer,audience:resource,algorithms:['RS256']});assert.equal(v.payload.scope,'mcp:read');assert.equal(v.payload.site_id,siteId);assert.equal(v.payload.tenant_id,tenant);assert.equal(v.payload.grant_id,grantId);}
 async function postProtection(){assert.equal(await grantSnapshot(),grantsBefore,'PROTECTED_GRANT_UNCHANGED');assert.equal(JSON.stringify((await admin.query('SELECT row_to_json(o) AS v FROM oauth.revocation_outbox o ORDER BY row_to_json(o)::text')).rows),outboxBefore,'PROTECTED_OUTBOX_UNCHANGED');}
 let scenarioError;
 try{
 stage='normal_refresh_control';const a=await fresh(),issued=await exchange(a,'B');normalEvidence.exchange=responseSummary(issued);assert.equal(issued.status,200,'NORMAL_EXCHANGE_REQUIRED');await verifyAccess(issued);
 const before=validState(await readState(issued.body.refresh_token));assert(before.links===1&&before.artifacts===1&&before.classifications===1&&before.consumed===0,'NORMAL_STATE_REQUIRED');
 const r=await refresh(a.browser,issued.body.refresh_token,'A');normalEvidence.refresh=responseSummary(r);assert(r.jsonParsed&&r.status===200&&typeof r.body.access_token==='string'&&typeof r.body.refresh_token==='string','NORMAL_REFRESH_REQUIRED');
 assert.notEqual(r.body.refresh_token,issued.body.refresh_token,'NORMAL_ROTATION_REQUIRED');await verifyAccess(r);
 const old=validState(await readState(issued.body.refresh_token)),next=validState(await readState(r.body.refresh_token));
 assert(old.consumed===1&&next.links===1&&next.artifacts===1&&next.classifications===1&&next.consumed===0&&next.refreshTokens===before.refreshTokens+1,'NORMAL_STATE_REQUIRED');
 assert.equal((await store.classification('RefreshToken',store.lookups().candidates(r.body.refresh_token))).mode,'PERSISTENT_READONLY','NORMAL_CLASSIFICATION_REQUIRED');
 Object.assign(normalEvidence,{passed:true,independent:true,bindingVerified:true,rotationVerified:true,stateVerified:true});
 await missingCase({authorize:fresh,exchange:a=>exchange(a,'B'),readState,
 deleteLink:rt=>admin.query("DELETE FROM oauth.persistent_links WHERE model='RefreshToken' AND artifact_lookup=$1",[store.lookups().current(rt)]),
 refresh:(browser,rt)=>refresh(browser,rt,'A'),denied,setStage:s=>{stage=s;},evidence:missingRtEvidence});
 assert(codes.size===2&&sessions.size===2&&authRequests===2&&tokenRequests===4,'TARGET_REQUEST_BUDGET');
 }catch(e){scenarioError=e;}finally{try{await postProtection();protectionVerified=true;}catch{protectionVerified=false;if(!scenarioError)scenarioError=Error('PROTECTION_NOT_CONFIRMED');}}
 if(scenarioError)throw scenarioError;
 return{passed:true,normalControlPass:true,missingRtDenialPass:true,productionAccessed:false};
}
`;
export function buildScenario(bytes){
 assert.equal(createHash('sha256').update(bytes).digest('hex'),'9ae4dc84533c8d619bb117f158eb68029bbe1324767c8fdd08e2076ef1abbd4f','R38_BASE_HASH');
 let s=String(bytes).replaceAll('\r\n','\n'),a=s.indexOf(" stage='no_grant_bootstrap';"),b=s.indexOf('\n const pa=await freePort()');assert(a>0&&b>a,'R38_MARKERS');s=s.slice(0,a)+target+s.slice(b);
 s=s.replace("import{inspectDenial,assertDenial}from'./consent-check.mjs';","import{missingCase,validState,response}from'/harness/r38/core.mjs';\nimport{responseSummary}from'/harness/r37/report.mjs';\nimport{stateSql as STATE_SQL}from'/harness/r38/scenario-source.mjs';");
 s=s.replace("from'./service.mjs'","from'/harness/r27/service.mjs'").replace('let cookie;','const normalEvidence={},missingRtEvidence={};let protectionVerified=false;let cookie;');
 s=s.replace('authRequests<20','authRequests<2').replace('tokenRequests<30','tokenRequests<4');
 s=s.replace('const body=await r.json();diagnostics.push','const parsed=await response(r),body=parsed.body;diagnostics.push').replace('return{status:r.status,body};','return parsed;');
 s=s.replace('return{status:r.status,body:await r.json()};','return response(r);');
 s=s.replace('result.expiryEvidence=projectExpiry(expiryEvidence);','result.normalEvidence=normalEvidence;result.missingRtEvidence=missingRtEvidence;result.protectionVerified=protectionVerified;result.serviceLogs=children.map(c=>({mode:c.which,...c.safeLogs()}));');
 s=s.replace('authRequestBudget:20,tokenRequestBudget:30','authRequestBudget:2,tokenRequestBudget:4');
 return s;
}
export function buildDriver(bytes){let s=String(bytes).replaceAll('\r\n','\n');
 const old="assert(matrix.passed,'SERVICE_MATRIX_FAILED');const ledgerAfter=";assert.equal(s.split(old).length,2,'R38_DRIVER_MARKER');
 // Read schema/ledger even on protocol failure. A failed matrix remains failed.
 s=s.replace(old,'const ledgerAfter=');s=s.replace("result={passed:true,status:'PERSISTENT_IMAGE_DRIVER_PASS'","result={passed:matrix.passed===true,status:'PERSISTENT_IMAGE_DRIVER_PASS'");
 return s;
}
