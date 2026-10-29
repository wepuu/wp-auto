import {EventEmitter} from 'node:events';import {collectChild} from '../r3/collector.mjs';import {safeEnvelope} from './envelope.mjs';
export async function collectR5Child(child,options){
 const bridge=new EventEmitter(),envelopes=[];bridge.send=(...args)=>child.send(...args);
 const message=m=>{const safe=safeEnvelope(m),prior=envelopes.at(-1)?.normalization;
   if(!safe||envelopes.length>=16||prior&&(safe.normalization.ipv4<prior.ipv4||safe.normalization.ipv6<prior.ipv6)){bridge.emit('message',{});return;}
   envelopes.push(safe);bridge.emit('message',safe.detail);
 };
 const close=code=>bridge.emit('close',code),error=e=>bridge.emit('error',e);
 child.on('message',message);child.once('close',close);child.once('error',error);
 try{const result=await collectChild(bridge,options);return {...result,envelopes,normalizationSnapshot:envelopes.at(-1)?.normalization??null,evidenceComplete:result.evidenceComplete&&envelopes.length===result.events.length};}
 finally{child.off('message',message);child.off('close',close);child.off('error',error);}
}
