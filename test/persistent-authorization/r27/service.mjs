// R6 lifecycle with bounded, fixed-category diagnostic observation only.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {collectR5Child} from '../r8/collector.mjs';
import {safeEnvelope} from '../r8/envelope.mjs';
import {safeLogCollector} from './core.mjs';
export {stopAllR6} from '../r8/service.mjs';
const tools=resolve('/harness/r8'),node=process.execPath;
export async function startMainR6({context,which,base,children}){
 assert(['A','B'].includes(which)&&!children.some(x=>x.which===which),'SINGLE_MODE_START');
 const u=new URL(base);assert(u.hostname==='127.0.0.1'&&u.protocol==='http:'&&Number(u.port)>1024);
 const env={};for(const k of ['SystemRoot','WINDIR','ComSpec','PATHEXT','Path','PATH','TEMP','TMP','USERPROFILE','APPDATA','LOCALAPPDATA'])if(process.env[k]!==undefined)env[k]=process.env[k];env.WEPUU_TEST_RUN_CONTEXT=context.context;
 const child=spawn(node,['--import',pathToFileURL(resolve(tools,'egress-preload.mjs')).href,resolve(tools,'launch-main.mjs'),which],{env,stdio:['ignore','pipe','pipe','ipc'],windowsHide:true});
 const logs=safeLogCollector();child.stdout.on('data',c=>logs.push(c));
 // Separate buffering avoids combining partial stdout and stderr JSON lines.
 const errors=safeLogCollector();child.stderr.on('data',c=>errors.push(c));
 const info={child,which,closed:false,forced:false,readyStatus:null,readinessRequestCount:0,observed:null,
  safeLogs:()=>({stdout:logs.snapshot(),stderr:errors.snapshot()})};
 children.push(info);child.once('close',()=>{info.closed=true;});
 let settle;const ready=new Promise(r=>{settle=r;});let settled=false;const finish=value=>{if(!settled){settled=true;settle(value);}};
 const timer=setTimeout(()=>finish(false),30000);
 child.on('message',m=>{const safe=safeEnvelope(m);if(!safe){finish(false);return;}if(safe.detail.phase==='MAIN_IMPORT_AND_STARTUP_FAILED'){finish(false);return;}
  if(safe.detail.phase==='MAIN_IMPORT_AND_STARTUP_COMPLETE'&&!settled&&info.readinessRequestCount===0){info.readinessRequestCount++;void(async()=>{try{const r=await fetch(base+'/health/ready',{signal:AbortSignal.timeout(1000),redirect:'error'});info.readyStatus=r.status;await r.body?.cancel();finish(r.status===200);}catch{info.readyStatus='NOT_CONFIRMED';finish(false);}})();}
 });
 child.once('close',()=>finish(false));child.once('error',()=>finish(false));
 info.observation=collectR5Child(child,{deadlineMs:240000,snapshotGraceMs:250}).then(r=>{info.observed=r;return r;});
 const passed=await ready;clearTimeout(timer);assert(passed,'MAIN_START_OR_READY_FAILED');
}
