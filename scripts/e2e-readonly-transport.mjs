import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

const safeStages=new Set(['custody','resource','state','identity','runtime','closed_ingress_guards','grant_projection','complete_runtime','ending','local_projection','time_sync','clock','dispatch']);
const safeCodes=new Set(['RESOURCE_PRESSURE','RESOURCE_OBSERVATION_INVALID','HOST_OOM_BASELINE_DRIFT','SESSION_NOT_VALID','CONTAINERS_CHANGED','SITE_A_CONNECTOR_CHANGED','SENDING_NOT_PAUSED','GUARD_CHANGED','VISIBILITY_NOT_CONFIRMED','TARGET_GRANT_EXISTS','FULL_GATE_FAILED','PROTECTED_ROWS_CHANGED','GRANT_DELTA_NOT_ONE','LOCAL_GRANT_EXISTS','LOCAL_GRANT_BINDING_FAILED','ACCESS_DENIED','TIMEOUT','NOT_CONFIRMED']);
export function safeFailureEnvelope(value,runId){
  if(value?.runId!==runId||value?.passed!==false||value?.status!=='R1_READONLY_NOT_CONFIRMED')return null;
  const out={passed:false,status:value.status,runId,stage:safeStages.has(value.stage)?value.stage:'dispatch',category:safeCodes.has(value.category)?value.category:'NOT_CONFIRMED',rawErrorSuppressed:true};
  const resource=value.resourceAtGate;
  if(resource&&Number.isInteger(resource.memAvailableKiB)&&resource.memAvailableKiB>=0&&Number.isFinite(resource.memoryFullAvg10)&&resource.memoryFullAvg10>=0)
    out.resourceAtGate={memAvailableKiB:resource.memAvailableKiB,memoryFullAvg10:resource.memoryFullAvg10,minimumMemoryKiB:524288,exclusiveMaximumPsi:1};
  return out;
}

export async function boundedJson(command,args,{execute=promisify(execFile),timeout=15000,limit=100000,expectedStatus,runId,project=value=>({passed:value.passed,status:value.status,runId:value.runId})}={}) {
  let result,exitCode=0;
  try {
    const p=await execute(command,args,{timeout,maxBuffer:limit,windowsHide:true});
    if(Buffer.byteLength(p.stdout)>limit)throw Object.assign(Error(),{code:'OUTPUT_LIMIT'});
    result=JSON.parse(p.stdout);
  }catch(error){
    if(Number.isInteger(error.code)&&typeof error.stdout==='string'&&Buffer.byteLength(error.stdout)<=limit){
      try{const fixed=safeFailureEnvelope(JSON.parse(error.stdout),runId);if(fixed)return{passed:false,exitCode:error.code,result:fixed};}catch{}
    }
    const category=error.code==='EACCES'?'ACCESS_DENIED':error.code==='ETIMEDOUT'||error.killed===true?'TIMEOUT':error.code==='OUTPUT_LIMIT'||error.code==='ERR_CHILD_PROCESS_STDIO_MAXBUFFER'?'OUTPUT_LIMIT':'TRANSPORT_NOT_CONFIRMED';
    return {passed:false,exitCode:Number.isInteger(error.code)?error.code:null,category,rawErrorSuppressed:true};
  }
  if(!result||result.passed!==true||result.status!==expectedStatus||result.runId!==runId)
    return {passed:false,exitCode,category:'RESULT_CONTRACT_MISMATCH',rawErrorSuppressed:true};
  try{return {passed:true,exitCode,result:project(result)}}
  catch{return {passed:false,exitCode,category:'RESULT_PROJECTION_INVALID',rawErrorSuppressed:true}}
}

export function aggregate(stages,{startedMs,endedMs,runId,manifestSha256}){
  const names=['resource','platform','metadata','desktop','wordpress','ending'];
  const valid=Number.isFinite(startedMs)&&Number.isFinite(endedMs)&&endedMs>=startedMs&&endedMs-startedMs<=900000;
  const pass=valid&&names.every(name=>stages[name]?.passed===true&&stages[name].runId===runId&&stages[name].manifestSha256===manifestSha256);
  return {passed:pass,stageResults:Object.fromEntries(names.map(n=>[n,stages[n]?.passed===true?'PASS':stages[n]?'FAIL':'NOT_RUN'])),withinWindow:valid,
    desktopEnablePerformed:false,oauthAttemptPerformed:false,mcpToolCallPerformed:false};
}
