import assert from 'node:assert/strict';
import {stages,responseSummary} from './report.mjs';
// Callback-only fixture helper. This module imports no app, network or database.
export async function inspectMissingRt({authorize,exchange,deleteLink,readState,refresh,denied,setStage,evidence}){
 const stage=i=>{evidence.stage=stages[i];setStage(stages[i]);};
 const valid=v=>assert(v&&['links','artifacts','classifications','accessTokens','refreshTokens','consumed'].every(k=>Number.isSafeInteger(v[k])&&v[k]>=0),'MISSING_RT_STATE_NOT_CONFIRMED');
 stage(0);const auth=await authorize();evidence.authorizeCompleted=true;evidence.authorizationCodePresent=typeof auth?.code==='string'&&auth.code.length>0;
 assert(evidence.authorizationCodePresent,'MISSING_RT_AUTH_CODE_REQUIRED');
 stage(1);const issued=await exchange(auth);evidence.fixtureExchange=responseSummary(issued);assert.equal(issued.status,200,'MISSING_LINK_FIXTURE');
 assert(typeof issued.body?.access_token==='string'&&issued.body.access_token.length>0&&typeof issued.body?.refresh_token==='string'&&issued.body.refresh_token.length>0,'MISSING_RT_TOKENS_REQUIRED');
 evidence.fixtureReady=true;const rt=issued.body.refresh_token;evidence.before=await readState(rt);valid(evidence.before);
 assert(evidence.before.links===1&&evidence.before.artifacts===1&&evidence.before.classifications===1&&evidence.before.consumed===0,'MISSING_RT_STATE_NOT_CONFIRMED');
 stage(2);const deleted=await deleteLink(rt);evidence.deletedRows=deleted?.rowCount;assert.equal(deleted?.rowCount,1,'MISSING_RT_DELETE_ONE');
 evidence.afterDelete=await readState(rt);valid(evidence.afterDelete);assert.equal(evidence.afterDelete.links,0,'MISSING_RT_LINK_ABSENT');
 assert.equal(evidence.afterDelete.artifacts,1,'MISSING_RT_ARTIFACT_PRESERVED');assert.equal(evidence.afterDelete.classifications,1,'MISSING_RT_CLASSIFICATION_PRESERVED');evidence.linkDeleted=true;
 stage(3);const result=await refresh(auth.browser,rt);evidence.refresh=responseSummary(result);evidence.refreshCompleted=true;denied(result);evidence.denialVerified=true;
 stage(4);evidence.after=await readState(rt);valid(evidence.after);assert.equal(evidence.after.links,0,'MISSING_RT_LINK_ABSENT');
 assert.equal(evidence.after.artifacts,1,'MISSING_RT_ARTIFACT_PRESERVED');assert.equal(evidence.after.classifications,1,'MISSING_RT_CLASSIFICATION_PRESERVED');
 assert.equal(evidence.after.accessTokens,evidence.before.accessTokens,'MISSING_RT_NO_NEW_TOKENS');assert.equal(evidence.after.refreshTokens,evidence.before.refreshTokens,'MISSING_RT_NO_NEW_TOKENS');
 assert.equal(evidence.after.consumed,evidence.before.consumed,'MISSING_RT_CONSUMPTION_UNCHANGED');evidence.postcheckVerified=true;
}
