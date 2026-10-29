import {safeFailure,targetName} from './multisite-safe-reporter.mjs';
import {safeDiagnostic} from './multisite-r7-diagnostics.mjs';
export async function collect(source){
  const outcomes=[],diagnostics=[];let extra=false,truncated=false;
  for await(const event of source){
    if(event.type==='test:diagnostic' && typeof event.data?.message==='string' && event.data.message.length<2048){
      try { const safe=safeDiagnostic(JSON.parse(event.data.message));if(safe){if(diagnostics.length<256)diagnostics.push(safe);else truncated=true;} }catch{}
    }
    if(!['test:pass','test:fail'].includes(event.type))continue;
    const d=event.data;if(d?.name!==targetName){if(event.type==='test:fail')extra=true;continue;}
    const state=d.skip?'SKIP':d.todo?'TODO':event.type==='test:pass'?'PASS':'FAIL';
    outcomes.push({state,durationMs:Number.isFinite(d.details?.duration_ms)?d.details.duration_ms:null,
      ...(state==='FAIL'?{failures:safeFailure(d.details?.error)}:{})});
  }
  return {passed:outcomes.length===1&&outcomes[0].state==='PASS'&&!extra&&!truncated,
    targetExecuted:outcomes.length===1&&['PASS','FAIL'].includes(outcomes[0].state),outcomes,diagnostics,
    additionalFailureObserved:extra,diagnosticsTruncated:truncated,rawOutputSuppressed:true};
}
export default async function* reporter(source){const result=await collect(source);if(!result.passed)process.exitCode=1;yield JSON.stringify(result)+'\n';}
