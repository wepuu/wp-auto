import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {boundedJson} from './e2e-readonly-transport.mjs';
import {createReadOnlyDispatcher,stageNames} from './e2e-readonly-dispatch.mjs';

// Actual transport integration: subprocesses (including HTTP children and SSH)
// are private to the dispatcher callback. Callers cannot run a named stage.
export function createReadOnlyRunner({plan,execute=promisify(execFile),projectGate,
  acceptedRead,...controls}) {
  const frozen=structuredClone(plan);
  controls={...controls,identity:structuredClone(controls.identity)};
  if(stageNames.some(name=>!Array.isArray(frozen[name])||!frozen[name].length))throw Error('PLAN_INVALID');
  return createReadOnlyDispatcher({...controls,executeStage:async(action,{timeoutMs,signal})=>{
    const checks=[];
    const started=performance.now();
    for(const spec of frozen[action]) {
      const remaining=Math.floor(timeoutMs-(performance.now()-started));
      if(remaining<=0) return {passed:false,category:'TIMEOUT',runId:controls.identity.runId,manifestSha256:controls.identity.manifestSha256};
      const invoke=async(command,args,options)=>{
        const p=await execute(command,args,{...options,signal});
        if(spec.kind!=='component')return p;
        const raw=JSON.parse(p.stdout);
        if(!acceptedRead(spec.mode,{exitCode:0,result:raw}))throw Error('COMPONENT_NOT_CONFIRMED');
        return {...p,stdout:JSON.stringify({passed:true,status:'R2_COMPONENT_PASS',runId:controls.identity.runId})};
      };
      const result=await boundedJson(spec.command,spec.args,{execute:invoke,
        timeout:Math.min(170000,remaining),expectedStatus:spec.kind==='component'?'R2_COMPONENT_PASS':'R1_READONLY_PASS',
        runId:controls.identity.runId,project:spec.kind==='component'?undefined:
          value=>projectGate(value,{...controls.identity,action})});
      checks.push(result);
      if(!result.passed)break;
    }
    return {passed:checks.length===frozen[action].length&&checks.every(x=>x.passed),
      ...(checks.length===1?checks[0]:{checks}),runId:controls.identity.runId,manifestSha256:controls.identity.manifestSha256};
  }});
}
