import assert from 'node:assert/strict';
import {inspectMissingRt} from '../r37/missing-rt.mjs';
import {responseSummary,projectMissingRt} from '../r37/report.mjs';
export const stateKeys=['links','artifacts','classifications','accessTokens','refreshTokens','consumed'];
export function validState(v){assert(v&&stateKeys.every(k=>Number.isSafeInteger(v[k])&&v[k]>=0),'MISSING_RT_STATE_NOT_CONFIRMED');return v;}
export async function response(r){let body;try{body=await r.json();}catch{return{status:r.status,body:{},jsonParsed:false};}return{status:r.status,body,jsonParsed:true};}
// One diagnostic readback even when a response assertion fails; original failure wins.
export async function missingCase(options){
 let rt,original;const e=options.evidence;
 try{await inspectMissingRt({...options,exchange:async a=>{const r=await options.exchange(a);rt=r.body?.refresh_token;return r;},
 refresh:async(...args)=>{const r=await options.refresh(...args);e.refreshJsonParsed=r.jsonParsed===true;return r;}});}catch(error){original=error;}
 finally{if(original&&typeof rt==='string'&&e.linkDeleted===true){try{e.failureAfter=validState(await options.readState(rt));e.failureReadback='PASS';}catch{e.failureReadback='NOT_CONFIRMED';}}}
 if(original)throw original;
}
export function projectEvidence(v){const o=projectMissingRt(v);if(typeof v?.refreshJsonParsed==='boolean')o.refreshJsonParsed=v.refreshJsonParsed;
 if(['PASS','NOT_CONFIRMED'].includes(v?.failureReadback))o.failureReadback=v.failureReadback;
 if(v?.failureAfter){o.failureAfter=Object.fromEntries(stateKeys.map(k=>[k,Number.isSafeInteger(v.failureAfter[k])&&v.failureAfter[k]>=0?v.failureAfter[k]:null]));}return o;}
export function projectNormal(v){const o={};for(const k of ['passed','independent','bindingVerified','rotationVerified','stateVerified'])if(typeof v?.[k]==='boolean')o[k]=v[k];
 for(const k of ['exchange','refresh'])if(v?.[k])o[k]=responseSummary({status:v[k].status,body:{error:v[k].error,...(v[k].accessTokenPresent?{access_token:true}:{}),...(v[k].refreshTokenPresent?{refresh_token:true}:{})}});
 return o;}
