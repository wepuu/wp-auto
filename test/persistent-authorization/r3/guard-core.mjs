import {safeSnapshot,callerCategory} from './snapshot.mjs';
// The R2 accept/reject expressions and argument normalization are unchanged.
export function installGuard({net,tls,dns,dnsPromises,syncBuiltinESMExports=()=>{},allowedPorts,captureStack=()=>new Error().stack}) {
  const ports=new Set(allowedPorts);if(!allowedPorts.every(p=>Number.isInteger(p)&&p>1024&&p<65536))throw Error('INVALID_EGRESS_ALLOWLIST');
  const counts={tcpDenied:0,tlsDenied:0,dnsDenied:0};let firstDenial=null;
  function record(api,form,reason,target,portAllowlisted){if(firstDenial!==null)return;let caller='UNKNOWN';try{caller=callerCategory(captureStack());}catch{}firstDenial=Object.freeze({api,form,reason,target,caller,portAllowlisted});}
  const deny=()=>Object.assign(Error('TEST_EGRESS_DENIED'),{code:'TEST_EGRESS_DENIED'});
  const original=net.Socket.prototype.connect;
  net.Socket.prototype.connect=function(...args){let first=args[0];const normalized=Array.isArray(first);if(normalized)first=first[0];let host,port;
    if(typeof first==='object'&&first!==null){host=first.host??'localhost';port=Number(first.port);}else{port=Number(first);host=typeof args[1]==='string'?args[1]:'localhost';}
    if(!['127.0.0.1','::1','localhost'].includes(host)||!ports.has(port)){
      counts.tcpDenied++;
      // Metadata classification happens only after the original denial decision.
      const pipe=typeof first==='string'&&(first.startsWith('/')||first.startsWith('\\'));
      const form=normalized?'NORMALIZED_ARRAY':pipe?'PIPE':typeof first==='object'&&first!==null?'OPTIONS':['number','string'].includes(typeof first)?'POSITIONAL':'UNKNOWN';
      const target=pipe?'PIPE':['127.0.0.1','::1'].includes(host)?'NUMERIC_LOOPBACK':host==='localhost'?'LOCALHOST_NAME':typeof host==='string'?'NON_LOOPBACK':'UNKNOWN';
      record('TCP_CONNECT',form,!['127.0.0.1','::1','localhost'].includes(host)?'HOST_NOT_ALLOWED':'PORT_NOT_ALLOWED',target,ports.has(port));throw deny();
    }return original.apply(this,args);
  };
  tls.connect=function(){counts.tlsDenied++;record('TLS_CONNECT','UNKNOWN','TLS_FORBIDDEN','UNKNOWN',false);throw deny();};
  for(const k of ['lookup','resolve','resolve4','resolve6','resolveAny','reverse']){
    const recordDns=()=>record(k==='lookup'?'DNS_LOOKUP':k==='reverse'?'DNS_REVERSE':'DNS_RESOLVE','UNKNOWN','DNS_FORBIDDEN','UNKNOWN',false);
    dns[k]=function(...args){counts.dnsDenied++;recordDns();const callback=args.at(-1);if(typeof callback==='function'){queueMicrotask(()=>callback(deny()));return;}throw deny();};
    dnsPromises[k]=async function(){counts.dnsDenied++;recordDns();throw deny();};
  }
  syncBuiltinESMExports();return Object.freeze({snapshot:()=>safeSnapshot({version:1,counts,firstDenial})});
}
