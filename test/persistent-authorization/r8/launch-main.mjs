import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {loadContext,readScoped} from './context.mjs';
import {guard} from './egress-preload.mjs';
import {observedImport} from '../r3/lifecycle.mjs';
import {envelope} from './envelope.mjs';
const c=loadContext(),mode=process.argv[2];assert(['A','B'].includes(mode));
const env=JSON.parse(readScoped(c,`environment-${mode}.private.json`));assert(!Object.hasOwn(env,'NODE_OPTIONS')&&!Object.hasOwn(env,'WEPUU_TEST_RUN_CONTEXT'));
if(mode==='A')assert(!Object.hasOwn(env,'WEPUU_PERSISTENT_AUTHORIZATION_MODE'));else assert.equal(env.WEPUU_PERSISTENT_AUTHORIZATION_MODE,'explicit-consent');
assert.equal(env.WEPUU_AUTH_HOST,'127.0.0.1');assert.equal(new URL(env.WEPUU_DATABASE_URL).hostname,'127.0.0.1');assert.equal(new URL(env.WEPUU_ISSUER).hostname,'auth.r3r1.example.test');
Object.assign(process.env,env);let complete=false,stopRequested=false,stopping=false;const pending=[];
function stop(){stopRequested=true;if(!complete||stopping)return;stopping=true;const m=envelope({testPhase:'guard_diagnostic',phase:'SNAPSHOT_REQUESTED',category:'NONE',guard:guard.snapshot()},guard);let sent=false;const signal=()=>{if(!sent){sent=true;process.emit('SIGTERM');}};if(m&&process.connected){process.send(m,signal);setTimeout(signal,250).unref();}else signal();}
process.on('message',m=>{if(m?.stop===true)stop();});
process.once('disconnect',()=>stop());
const result=await observedImport({guard,send:detail=>{const m=envelope(detail,guard);if(!m||!process.connected)return false;pending.push(new Promise(r=>process.send(m,e=>r(!e))));return true;},subscribe:fn=>{process.on('message',fn);return()=>process.off('message',fn);},operation:async()=>{await import(pathToFileURL(resolve(c.build,'apps/authorization-service/dist/main.js')).href);complete=true;}});
await Promise.race([Promise.all(pending),new Promise(r=>setTimeout(r,250).unref())]);
if(!result.operationSucceeded||!result.ipcComplete){process.exitCode=1;process.disconnect?.();}else if(stopRequested)stop();
