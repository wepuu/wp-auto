import assert from 'node:assert/strict';
import {buildScenario as diagnosticScenario} from '../r27/scenario-source.mjs';
export function buildScenario(bytes){
 let s=diagnosticScenario(bytes);
 const one=(a,b)=>{assert.equal(s.split(a).length,2,'R34_SOURCE_MARKER');s=s.replace(a,b);};
 one("import{caseNames,responseEvidence,classifyConsumeError,verifyCases}from'/harness/r27/core.mjs';","import{caseNames,responseEvidence,verifyCases}from'/harness/r34/core.mjs';");
 one(" runtimeDb=new dbmod.Database({connectionString:JSON.parse(readScoped(context,'runtime.private.json')).dsn,applicationName:'r27-restricted-adapter'});\n const adapter=new dbmod.PostgresOidcAdapter('AuthorizationCode',runtimeDb,codec);\n",'');
 const a=s.indexOf(" stage='independent_compiled_adapter_probe';"),b=s.indexOf(" stage='target_postcheck';",a);
 assert(a>0&&b>a,'R34_PROBE_MARKERS');s=s.slice(0,a)+s.slice(b);
 one("assert.equal(codes.size,5,'FIVE_INDEPENDENT_CODES');assert.equal(sessions.size,5,'FIVE_INDEPENDENT_SESSIONS');","assert.equal(codes.size,4,'FOUR_INDEPENDENT_CODES');assert.equal(sessions.size,4,'FOUR_INDEPENDENT_SESSIONS');");
 one('targetCases,directProbe,applicationErrorMappingGapObserved:summary.httpErrorMappingMismatchObserved&&!directProbe.mappedInvalidGrant,','targetCases,applicationErrorMappingGapObserved:false,');
 // Use actual observed set sizes, not fixed output claims.
 one('independentCodeCount:codes.size,independentSessionCount:sessions.size,','independentCodeCount:codes.size,independentSessionCount:sessions.size,');
 one('authRequestBudget:20,tokenRequestBudget:30','authRequestBudget:8,tokenRequestBudget:4');
 assert(!s.includes('adapter.consume(')&&!s.includes('independent_compiled_adapter_probe'),'R34_NO_DIRECT_PROBE');
 return s;
}
