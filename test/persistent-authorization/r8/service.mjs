import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {collectR5Child} from './collector.mjs';
import {safeEnvelope} from './envelope.mjs';
const tools=resolve('/harness/r8'),node=process.execPath;
export async function startMainR6({context,which,base,children}){
 assert(['A','B'].includes(which)&&!children.some(x=>x.which===which),'SINGLE_MODE_START');
 const u=new URL(base);assert(u.hostname==='127.0.0.1'&&u.protocol==='http:'&&Number(u.port)>1024);
 const env={};for(const k of ['SystemRoot','WINDIR','ComSpec','PATHEXT','Path','PATH','TEMP','TMP','USERPROFILE','APPDATA','LOCALAPPDATA'])if(process.env[k]!==undefined)env[k]=process.env[k];env.WEPUU_TEST_RUN_CONTEXT=context.context;
 const child=spawn(node,['--import',pathToFileURL(resolve(tools,'egress-preload.mjs')).href,resolve(tools,'launch-main.mjs'),which],{env,stdio:['ignore','ignore','ignore','ipc'],windowsHide:true});
 const info={child,which,closed:false,forced:false,readyStatus:null,readinessRequestCount:0,observed:null};children.push(info);child.once('close',()=>{info.closed=true;});
 let settle;const ready=new Promise(r=>{settle=r;});let settled=false;const finish=value=>{if(!settled){settled=true;settle(value);}};
 const timer=setTimeout(()=>finish(false),30000);
 child.on('message',m=>{const safe=safeEnvelope(m);if(!safe){finish(false);return;}if(safe.detail.phase==='MAIN_IMPORT_AND_STARTUP_FAILED'){finish(false);return;}
  if(safe.detail.phase==='MAIN_IMPORT_AND_STARTUP_COMPLETE'&&!settled&&info.readinessRequestCount===0){info.readinessRequestCount++;void(async()=>{try{const r=await fetch(base+'/health/ready',{signal:AbortSignal.timeout(1000),redirect:'error'});info.readyStatus=r.status;await r.body?.cancel();finish(r.status===200);}catch{info.readyStatus='NOT_CONFIRMED';finish(false);}})();}
 });
 child.once('close',()=>finish(false));child.once('error',()=>finish(false));
 info.observation=collectR5Child(child,{deadlineMs:240000,snapshotGraceMs:250}).then(r=>{info.observed=r;return r;});
 const passed=await ready;clearTimeout(timer);assert(passed,'MAIN_START_OR_READY_FAILED');
}
export async function stopAllR6(children){
 for(const info of children){if(!info.closed){try{info.child.send({stop:true},()=>{});}catch{}const until=performance.now()+6000;while(!info.closed&&performance.now()<until)await new Promise(r=>setTimeout(r,50));if(!info.closed){info.forced=true;info.child.kill();const end=performance.now()+2000;while(!info.closed&&performance.now()<end)await new Promise(r=>setTimeout(r,25));}}
  if(info.closed)await info.observation;else {try{info.child.disconnect();}catch{}}
 }
 return {stopped:children.every(x=>x.closed),forced:children.some(x=>x.forced)};
}
