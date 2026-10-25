// Prepare a future explicitly authorized fixture; this generator never runs it.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const baseHash='9ae4dc84533c8d619bb117f158eb68029bbe1324767c8fdd08e2076ef1abbd4f';
export function buildReportingScenario(bytes){
 assert.equal(createHash('sha256').update(bytes).digest('hex'),baseHash,'R37_BASE_HASH');let s=String(bytes).replaceAll('\r\n','\n');
 const one=(a,b)=>{assert.equal(s.split(a).length,2,'R37_SOURCE_MARKER');s=s.replace(a,b);};
 one("import{inspectDenial,assertDenial}from'./consent-check.mjs';","import{inspectDenial,assertDenial}from'./consent-check.mjs';\nimport{inspectMissingRt}from'/harness/r37/missing-rt.mjs';\nimport{projectMissingRt}from'/harness/r37/report.mjs';");
 one('expiryEvidence={};','expiryEvidence={},missingRtEvidence={};');
 const old=" const unlinkedAuth=await authorize(true,'B'),unlinkedTokens=await exchange(unlinkedAuth,'B');assert.equal(unlinkedTokens.status,200,'MISSING_LINK_FIXTURE');await admin.query(\"DELETE FROM oauth.persistent_links WHERE model='RefreshToken' AND artifact_lookup=$1\",[store.lookups().current(unlinkedTokens.body.refresh_token)]);denied(await refresh(unlinkedAuth.browser,unlinkedTokens.body.refresh_token,'A'));checks.push({name:'real_missing_RT_link_denied_without_native_fallback',passed:true});";
 const replacement=String.raw` await inspectMissingRt({authorize:()=>authorize(true,'B'),exchange:s=>exchange(s,'B'),
 deleteLink:rt=>admin.query("DELETE FROM oauth.persistent_links WHERE model='RefreshToken' AND artifact_lookup=$1",[store.lookups().current(rt)]),
 readState:async rt=>{const ks=store.lookups().candidates(rt);return(await admin.query("SELECT (SELECT count(*)::int FROM oauth.persistent_links WHERE model='RefreshToken' AND artifact_lookup=ANY($1::text[])) AS links,(SELECT count(*)::int FROM oauth.secret_artifacts WHERE model='RefreshToken' AND lookup_version::text||':'||encode(artifact_hash,'hex')=ANY($1::text[])) AS artifacts,(SELECT count(*)::int FROM oauth.artifact_classifications WHERE model='RefreshToken' AND artifact_lookup=ANY($1::text[])) AS classifications,(SELECT count(*)::int FROM oauth.secret_artifacts WHERE model='AccessToken') AS \"accessTokens\",(SELECT count(*)::int FROM oauth.secret_artifacts WHERE model='RefreshToken') AS \"refreshTokens\",(SELECT count(*)::int FROM oauth.secret_artifacts WHERE model='RefreshToken' AND lookup_version::text||':'||encode(artifact_hash,'hex')=ANY($1::text[]) AND consumed_at IS NOT NULL) AS consumed",[ks])).rows[0];},
 refresh:(browser,rt)=>refresh(browser,rt,'A'),denied,setStage:s=>{stage=s;},evidence:missingRtEvidence});checks.push({name:'real_missing_RT_link_denied_without_native_fallback',passed:true});`;
 one(old,replacement);one('result.expiryEvidence=projectExpiry(expiryEvidence);','result.expiryEvidence=projectExpiry(expiryEvidence);\nresult.missingRtEvidence=projectMissingRt(missingRtEvidence);');
 return s;
}
