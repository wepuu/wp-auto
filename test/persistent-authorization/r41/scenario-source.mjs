import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {buildReportingScenario} from '../r37/scenario-source.mjs';
import {buildDriver as priorDriver} from '../r38/scenario-source.mjs';
function one(s,a,b){assert.equal(s.split(a).length,2,'R41_SOURCE_MARKER');return s.replace(a,b);}
function diagnostics(s){
 s=one(s,"from'./service.mjs'","from'/harness/r27/service.mjs'");
 s=one(s,"import assert from'node:assert/strict';","import{response,responseSummary}from'/harness/r41/response.mjs';\nimport assert from'node:assert/strict';");
 s=one(s,'const body=await r.json();diagnostics.push','const parsed=await response(r),body=parsed.body;diagnostics.push');
 s=one(s,'return{status:r.status,body};','return parsed;');
 s=one(s,'return{status:r.status,body:await r.json()};',"const parsed=await response(r);diagnostics.push({operation:'refresh',...responseSummary(parsed),jsonParsed:parsed.jsonParsed});return parsed;");
 s=one(s,'result.mockDeliveriesObserved=sendCount;',"result.diagnostics=diagnostics.slice(-5);result.serviceLogs=children.map(c=>({mode:c.which,...c.safeLogs()}));result.mockDeliveriesObserved=sendCount;");
 return s;
}
export function buildMatrix(bytes){let s=buildReportingScenario(bytes);
 s=one(s,"import{inspectMissingRt}from'/harness/r37/missing-rt.mjs';","import{missingCase as inspectMissingRt}from'/harness/r38/core.mjs';");
 s=one(s,"import{projectMissingRt}from'/harness/r37/report.mjs';","import{projectEvidence as projectMissingRt}from'/harness/r38/core.mjs';");
 return diagnostics(s);
}
export function buildTransition(bytes){assert.equal(createHash('sha256').update(bytes).digest('hex'),'64ca6de75cfbf31c71657cd21a77c61b3f6bfdedeb4852120aacbf9b0c2828db','R41_TRANSITION_HASH');return diagnostics(String(bytes).replaceAll('\r\n','\n'));}
export function buildDriver(bytes){assert.equal(createHash('sha256').update(bytes).digest('hex'),'71b4c76dafffcf2f57045a8abbcdaee141fad312b42bd6b3f8e3cf4de87f525d','R41_DRIVER_HASH');return priorDriver(bytes);}
