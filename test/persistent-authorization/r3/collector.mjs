import {safeMessage} from './lifecycle.mjs';
// No retries. A timeout requests one snapshot and remains a failure even if received.
export function collectChild(child,{deadlineMs=30000,snapshotGraceMs=250}={}){
  return new Promise(resolve=>{const events=[];let malformed=false,timedOut=false,done=false,grace;
    const finish=(exitCode,closed=false)=>{if(done)return;done=true;clearTimeout(deadline);clearTimeout(grace);child.off('message',message);child.off('close',close);child.off('error',error);
      const failure=events.find(e=>e.phase==='MAIN_IMPORT_AND_STARTUP_FAILED');const success=events.some(e=>e.phase==='MAIN_IMPORT_AND_STARTUP_COMPLETE');
      resolve({passed:closed&&exitCode===0&&success&&!failure&&!malformed&&!timedOut,timedOut,exitCode,events,evidenceComplete:(success||Boolean(failure))&&!malformed&&!timedOut,category:timedOut?'TIMEOUT':failure?.category??(malformed?'DIAGNOSTIC_INVALID':success?'NONE':'NOT_CONFIRMED'),snapshotRequested:timedOut,snapshotReceived:events.some(e=>e.phase==='SNAPSHOT_REQUESTED')});};
    const message=m=>{const safe=safeMessage(m);if(!safe||events.length>=16){malformed=true;return;}events.push(safe);};
    const close=code=>finish(code,true),error=()=>{malformed=true;finish(null);};
    child.on('message',message);child.once('close',close);child.once('error',error);
    const deadline=setTimeout(()=>{timedOut=true;try{child.send({diagnostic:'snapshot'},()=>{});}catch{}grace=setTimeout(()=>finish(null),snapshotGraceMs);},deadlineMs);
  });
}
