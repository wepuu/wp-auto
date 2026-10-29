// Local synthetic children only. No raw output or exception leaves this boundary.
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
export const reporterSpecifier = file => pathToFileURL(path.resolve(file)).href;
export function safeFailure(e) {
 return {passed:false, category:e.code==='ERR_CHILD_PROCESS_STDIO_MAXBUFFER'?'CHILD_OUTPUT_LIMIT':e.killed?'CHILD_TIMEOUT':
  Number.isSafeInteger(e.code)?'CHILD_NONZERO_EXIT':['ENOENT','EACCES','EPERM'].includes(e.code)?'CHILD_SPAWN_FAILED':'CHILD_NOT_CONFIRMED',
  exitCode:Number.isSafeInteger(e.code)?e.code:null,signal:['SIGTERM','SIGKILL','SIGABRT','SIGSEGV'].includes(e.signal)?e.signal:null,
  timedOut:e.killed===true&&e.code!=='ERR_CHILD_PROCESS_STDIO_MAXBUFFER',outputLimit:e.code==='ERR_CHILD_PROCESS_STDIO_MAXBUFFER'};
}
export async function syntheticReporterChild({reporter, file, timeout=10000, maxBuffer=65536}) {
 try {
  const r=await promisify(execFile)(process.execPath,['--test','--test-reporter='+reporter,file],{env:{},timeout,maxBuffer,windowsHide:true,shell:false});
  if(r.stderr.length!==0)return {passed:false,category:'CHILD_STDERR_NOT_CONFIRMED'};
  let data;try{data=JSON.parse(r.stdout);}catch{return {passed:false,category:'CHILD_RESULT_NOT_JSON'};}
  const keys=['passed','failed','skipped','todo'];
  if(!keys.every(k=>Number.isSafeInteger(data[k])&&data[k]>=0)||typeof data.summaryObserved!=='boolean'||!data.summaryCounts)return {passed:false,category:'CHILD_RESULT_INVALID'};
  const counts=['tests','passed','failed','cancelled','skipped','todo'];
  if(!counts.every(k=>Number.isSafeInteger(data.summaryCounts[k])&&data.summaryCounts[k]>=0))return {passed:false,category:'CHILD_RESULT_INVALID'};
  return {passed:true,exitCode:0,result:{...Object.fromEntries(keys.map(k=>[k,data[k]])),summaryObserved:data.summaryObserved,
   summaryCounts:Object.fromEntries(counts.map(k=>[k,data.summaryCounts[k]]))}};
 }catch(e){return safeFailure(e);}
}
