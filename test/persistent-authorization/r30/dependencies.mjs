import path from 'node:path';
import {readFile,realpath,lstat} from 'node:fs/promises';
import {StringDecoder} from 'node:string_decoder';
import {spawn} from 'node:child_process';
import {diagnosticCollector,decide} from '../r29/diagnostics.mjs';
import {sha} from './inputs.mjs';
// Recognition only: no YAML rewrite, resolution, version coercion or installation.
export function lockIdentities(text){
 const keys=new Set();for(const line of text.split(/\r?\n/u)){
  const m=line.match(/^  (?:'([^']+)'|([^\s:]+)):\s*$/u);if(!m)continue;
  const key=m[1]??m[2],p=key.match(/^((?:@[a-z0-9_.-]+\/)?[a-z0-9_.-]+)@(\d+\.\d+\.\d+(?:[-+][a-zA-Z0-9.-]+)?)(?:\([^\r\n]*\))?$/u);
  if(p)keys.add(p[1]+'@'+p[2]);
 }return keys;
}
export function packagePath(real){
 const marker='/node_modules/',index=real.lastIndexOf(marker);if(index<0)return null;
 const tail=real.slice(index+marker.length),match=tail.match(/^((?:@[a-z0-9_.-]+\/)?[a-z0-9_.-]+)\/(.+)$/u);
 if(!match||match[2].split('/').includes('..'))return null;
 return {root:real.slice(0,index+marker.length)+match[1],name:match[1],file:match[2]};
}
export function metadataMatches(info,meta,locked){
 return meta?.name===info?.name&&typeof meta?.version==='string'&&locked.has(meta.name+'@'+meta.version);
}
export function tokenAt(ts,text,line,column){
 const source=ts.createSourceFile('public-declaration.d.ts',text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
 let position;try{position=source.getPositionOfLineAndCharacter(line-1,column-1);}catch{return {};}
 let found;
 function visit(n){if(n.getStart(source)<=position&&position<n.end){found=n;ts.forEachChild(n,visit);}}
 visit(source);
 if(found&&ts.isIdentifier(found)&&/^[A-Za-z_$][A-Za-z0-9_$]{0,79}$/u.test(found.text))return {publicToken:found.text};
 if(found&&ts.isStringLiteral(found)&&/^(?:node:[a-z0-9_/-]+|(?:@[a-z0-9_.-]+\/)?[a-z0-9_.-]+(?:\/[a-zA-Z0-9_./-]+)?)$/u.test(found.text))return {publicModule:found.text};
 return {};
}
async function identify(ref,locked,ts,options){
 const unknown={channel:ref.channel,code:ref.code,line:ref.line,column:ref.column,identity:'NOT_CONFIRMED'};
 try{
  let raw=ref.path.replaceAll('\\','/');if(raw.startsWith('node_modules/'))raw='/workspace/'+raw;
  if(!raw.startsWith('/workspace/node_modules/')||raw.split('/').includes('..'))return unknown;
  const file=await realpath(raw);if(!file.startsWith('/workspace/node_modules/.pnpm/'))return unknown;
  const info=packagePath(file);if(!info)return unknown;
  const metaFile=info.root+'/package.json',stat=await lstat(metaFile),s=await lstat(file);
  if(!stat.isFile()||stat.isSymbolicLink()||stat.size>262144||!s.isFile()||s.isSymbolicLink()||s.size>1024*1024)return unknown;
  const metaBytes=await readFile(metaFile),meta=JSON.parse(metaBytes.toString('utf8'));
  if(!metadataMatches(info,meta,locked)||!/^[A-Za-z0-9_./-]+$/u.test(info.file))return unknown;
  const bytes=await readFile(file),text=bytes.toString('utf8'),token=tokenAt(ts,text,ref.line,ref.column);
  const out={channel:ref.channel,code:ref.code,line:ref.line,column:ref.column,identity:'LOCK_VERIFIED',package:meta.name,version:meta.version,
   file:info.file,packageJsonSha256:sha(metaBytes),fileSha256:sha(bytes),...token};
  if(token.publicModule){const resolved=ts.resolveModuleName(token.publicModule,file,options,ts.sys);out.moduleResolved=resolved.resolvedModule!==undefined;}
  return out;
 }catch{return unknown;}
}
export async function observeDetailed({executable,args,cwd,env,allowed,locked,ts,options,timeoutMs=60000}){
 const base=diagnosticCollector({allowed,maxRows:100}),decoders={stdout:new StringDecoder('utf8'),stderr:new StringDecoder('utf8')},pending={stdout:'',stderr:''},refs=[];
 let refLimit=false;
 function acceptLine(channel,line){if(line.length>8192)return;
   const clean=line.replace(/\x1b\[[0-?]*[ -/]*[@-~]/gu,'').trim(),m=clean.match(/^(.*?)\s*\((\d+),(\d+)\):\s*error\s+TS(\d+):/u);
   if(!m||!m[1].includes('node_modules/')||![Number(m[2]),Number(m[3]),Number(m[4])].every(n=>Number.isSafeInteger(n)&&n>0)||Number(m[4])>99999)return;
   if(refs.length>=100){refLimit=true;return;}refs.push({channel,path:m[1],line:Number(m[2]),column:Number(m[3]),code:'TS'+m[4]});
 }
 function push(channel,chunk){base.push(channel,chunk);pending[channel]+=decoders[channel].write(chunk);
  const lines=pending[channel].split(/\r\n|\n|\r/u);pending[channel]=lines.pop();for(const line of lines)acceptLine(channel,line);
  if(pending[channel].length>8192)pending[channel]='';
 }
 const processResult=await new Promise(resolve=>{
  let spawnFailed=false,spawnCategory,timedOut=false,outputLimitExceeded=false,hardStop;
  const child=spawn(executable,args,{cwd,env,windowsHide:true,shell:false,stdio:['ignore','pipe','pipe']});
  const stop=()=>{child.kill('SIGTERM');hardStop??=setTimeout(()=>child.kill('SIGKILL'),1000);};
  const timer=setTimeout(()=>{timedOut=true;stop();},timeoutMs);
  for(const c of ['stdout','stderr'])child[c].on('data',data=>{push(c,data);if(base.overLimit()&&!outputLimitExceeded){outputLimitExceeded=true;stop();}});
  child.once('error',e=>{spawnFailed=true;spawnCategory=['ENOENT','EACCES','EPERM'].includes(e.code)?e.code:'OTHER_SPAWN_ERROR';});
  child.once('close',(exitCode,signal)=>{clearTimeout(timer);clearTimeout(hardStop);resolve({completed:true,spawnFailed,...(spawnCategory?{spawnCategory}:{}),
   exitCode:Number.isSafeInteger(exitCode)?exitCode:null,signal:signal===null?null:['SIGTERM','SIGKILL'].includes(signal)?signal:'OTHER',timedOut,outputLimitExceeded});});
 });
 for(const channel of ['stdout','stderr']){pending[channel]+=decoders[channel].end();if(pending[channel])acceptLine(channel,pending[channel]);pending[channel]='';}
 const diagnostic=base.finish(),dependencyDiagnostics=[];
 for(const ref of refs)dependencyDiagnostics.push(await identify(ref,locked,ts,options));
 return {process:processResult,...diagnostic,...decide(processResult,diagnostic),dependencyDiagnostics,
  dependencyIdentitiesComplete:!refLimit&&dependencyDiagnostics.every(d=>d.identity==='LOCK_VERIFIED'),dependencyRowsTruncated:refLimit};
}
