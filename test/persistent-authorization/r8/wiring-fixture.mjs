import {fakeApis} from '../r3/fakes.mjs';import {installGuard} from '../r5/guard-core.mjs';import {observedImport} from '../r3/lifecycle.mjs';import {envelope} from './envelope.mjs';
const mode=process.argv[2],apis=fakeApis(),guard=installGuard({...apis,allowedPorts:[39991]});
if(mode==='silent')setTimeout(()=>process.exit(0),10000);
else{
 const result=await observedImport({guard,send:detail=>{if(!process.connected)return false;process.send(envelope(detail,guard));return true;},subscribe:fn=>{process.on('message',fn);return()=>process.off('message',fn);},operation:async()=>{
   await new Promise((res,rej)=>apis.dns.lookup('127.0.0.1',{all:true},e=>e?rej(e):res()));
   if(mode==='deny')apis.tls.connect({host:'SECRET_SENTINEL'});
   else if(mode==='hang')await new Promise(()=>{});
   else if(mode==='invalid')process.send({testPhase:'r5_guard_diagnostic',detail:{},normalization:{secret:'SECRET_SENTINEL'}});
 }});
 process.exitCode=result.passed?0:1;process.disconnect?.();
}
