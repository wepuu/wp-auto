// Fixed diagnostic projection only. Never retain message bodies or source lines.
import {StringDecoder} from 'node:string_decoder';
import {spawn} from 'node:child_process';
const wrapperCodes=new Set(['ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL','ERR_PNPM_EXEC_FIRST_FAIL','ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL','ERR_PNPM_NO_IMPORTER_MANIFEST_FOUND','ERR_PNPM_NO_PROJECT_MANIFEST']);
export function safeLocation(raw,allowed=[]){
 if(typeof raw!=='string'||raw.includes('\0')||raw.split(/[\\/]/u).includes('..'))return {kind:'UNKNOWN'};
 let name=raw.trim().replaceAll('\\','/');if(name.startsWith('/workspace/'))name=name.slice(11);else if(name.startsWith('./'))name=name.slice(2);
 if(allowed.includes(name))return {kind:name==='packages/database/test/authorization-consume-mapping.test.ts'?'NEW_MAPPING_TEST':
  name==='packages/database/src/index.ts'?'DATABASE_SOURCE':name.endsWith('.json')?'CONFIGURATION':name.startsWith('packages/database/test/')?'OTHER_DATABASE_TEST':'WORKSPACE_SOURCE',file:name};
 if(name.startsWith('node_modules/')||name.includes('/node_modules/'))return {kind:'DEPENDENCY_DECLARATION'};
 return {kind:'UNKNOWN'};
}
export function diagnosticCollector({allowed=[],maxBytes=262144,maxRows=100,maxLine=8192}={}){
 const decoders={stdout:new StringDecoder('utf8'),stderr:new StringDecoder('utf8')};
 const streams={stdout:{bytes:0,parsedLines:0,unparsedLines:0},stderr:{bytes:0,parsedLines:0,unparsedLines:0}};
 const pending={stdout:'',stderr:''},rows=[],wrappers=[];let outputLimit=false,truncated=false;
 function line(channel,input){
  const s=input.replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/gu,'').replace(/\x1b\[[0-?]*[ -/]*[@-~]/gu,'').trim();
  if(!s)return;
  if(s.length>maxLine){truncated=true;streams[channel].unparsedLines++;return;}
  // Wrappers/prefixes may precede a real diagnostic. Only the numeric code,
  // severity and an approved source location survive projection.
  const m=s.match(/^(.*?)\s*\((\d+),(\d+)\):\s*(error|warning)\s+TS(\d+):/u);
  const global=!m?s.match(/(?:^|\s)(error|warning)\s+TS(\d+):/u):null;
  if(m||global){
   const code=Number(m?m[5]:global[2]),severity=m?m[4]:global[1];
   if(!Number.isSafeInteger(code)||code<1||code>99999){streams[channel].unparsedLines++;return;}
   let location={kind:'GLOBAL'};
   if(m){const raw=m[1].trim();location=safeLocation(raw,allowed);
    if(location.kind==='UNKNOWN'){
     const prefix=raw.lastIndexOf('/workspace/');if(prefix>=0)location=safeLocation(raw.slice(prefix),allowed);
     else for(const name of allowed)if(raw.endsWith(name)){location=safeLocation(name,allowed);break;}
    }
   }
   const row={channel,code:'TS'+code,severity,...location,...(m?{line:Number(m[2]),column:Number(m[3])}:{})};
   if(m&&(!Number.isSafeInteger(row.line)||row.line<1||!Number.isSafeInteger(row.column)||row.column<1)){streams[channel].unparsedLines++;return;}
   streams[channel].parsedLines++;
   const existing=rows.find(r=>JSON.stringify({...r,count:undefined})===JSON.stringify({...row,count:undefined}));
   if(existing)existing.count++;else if(rows.length<maxRows)rows.push({...row,count:1});else truncated=true;
   return;
  }
  const wrap=s.match(/\b(ERR_PNPM_[A-Z0-9_]+)\b/u);
  if(wrap){const code=wrapperCodes.has(wrap[1])?wrap[1]:'OTHER_PNPM_ERROR';if(!wrappers.some(r=>r.channel===channel&&r.code===code))wrappers.push({channel,code});}
  streams[channel].unparsedLines++;
 }
 function consume(channel,text){pending[channel]+=text;const lines=pending[channel].split(/\r\n|\n|\r/u);pending[channel]=lines.pop();for(const row of lines)line(channel,row);
  if(pending[channel].length>maxLine){truncated=true;pending[channel]='';streams[channel].unparsedLines++;}}
 return {push(channel,chunk){if(!Object.hasOwn(streams,channel))throw Error('INVALID_CHANNEL');
  streams[channel].bytes+=Buffer.byteLength(chunk);if(streams[channel].bytes>maxBytes){outputLimit=true;pending[channel]='';return;}
  consume(channel,decoders[channel].write(Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk)));
 },finish(){for(const channel of ['stdout','stderr']){consume(channel,decoders[channel].end());if(pending[channel])line(channel,pending[channel]);pending[channel]='';}
  return {diagnostics:rows.map(r=>({...r})),wrappers:wrappers.map(r=>({...r})),streams:structuredClone(streams),outputLimitExceeded:outputLimit,diagnosticsTruncated:truncated,rawOutputSuppressed:true};
 },overLimit:()=>outputLimit};
}
export function decide(processResult,diagnostics){
 const errors=diagnostics.diagnostics.filter(d=>d.severity==='error');
 const normal=processResult.completed&&!processResult.spawnFailed&&!processResult.timedOut&&!processResult.outputLimitExceeded
  &&processResult.signal===null&&!diagnostics.outputLimitExceeded&&!diagnostics.diagnosticsTruncated;
 const typecheckPass=normal&&processResult.exitCode===0&&errors.length===0;
 const diagnosticComplete=normal&&(typecheckPass||errors.length>0||diagnostics.wrappers.length>0);
 return {diagnosticComplete,typecheckPass,category:processResult.spawnFailed?'SPAWN_FAILED':processResult.timedOut?'TIMEOUT':
  processResult.outputLimitExceeded||diagnostics.outputLimitExceeded?'OUTPUT_LIMIT':diagnostics.diagnosticsTruncated?'DIAGNOSTICS_TRUNCATED':
  processResult.signal!==null?'SIGNAL_EXIT':typecheckPass?'TYPECHECK_PASS':errors.length?'TYPESCRIPT_DIAGNOSTICS':diagnostics.wrappers.length?'PNPM_WRAPPER_FAILURE':'DIAGNOSTIC_INCOMPLETE'};
}
export async function observe({executable,args,cwd,env,allowed=[],timeoutMs=60000,maxBytes=262144}){
 const collector=diagnosticCollector({allowed,maxBytes});
 const result=await new Promise(resolve=>{
  let spawnFailed=false,spawnCategory,completed=false,timedOut=false,outputLimitExceeded=false,hardStop;
  const child=spawn(executable,args,{cwd,env,windowsHide:true,shell:false,stdio:['ignore','pipe','pipe']});
  const stop=()=>{child.kill('SIGTERM');hardStop??=setTimeout(()=>child.kill('SIGKILL'),1000);};
  const timer=setTimeout(()=>{timedOut=true;stop();},timeoutMs);
  for(const channel of ['stdout','stderr'])child[channel].on('data',data=>{collector.push(channel,data);if(collector.overLimit()&&!outputLimitExceeded){outputLimitExceeded=true;stop();}});
  child.once('error',e=>{spawnFailed=true;spawnCategory=['ENOENT','EACCES','EPERM'].includes(e.code)?e.code:'OTHER_SPAWN_ERROR';});
  child.once('close',(exitCode,signal)=>{completed=true;clearTimeout(timer);clearTimeout(hardStop);
   resolve({completed,spawnFailed,...(spawnCategory?{spawnCategory}:{}),exitCode:Number.isSafeInteger(exitCode)?exitCode:null,
    signal:signal===null?null:['SIGTERM','SIGKILL','SIGABRT','SIGSEGV'].includes(signal)?signal:'OTHER',timedOut,outputLimitExceeded});});
 });
 const diagnostic=collector.finish();return {process:result,...diagnostic,...decide(result,diagnostic)};
}
