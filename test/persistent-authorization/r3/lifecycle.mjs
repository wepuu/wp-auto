import {safeSnapshot} from './snapshot.mjs';
export const phases=['BEFORE_IMPORT','MAIN_IMPORT_AND_STARTUP_COMPLETE','MAIN_IMPORT_AND_STARTUP_FAILED','SNAPSHOT_REQUESTED'];
export const categories=['NONE','TEST_EGRESS_DENIED','ERR_MODULE_NOT_FOUND','EADDRINUSE','ZodError','KeyCustodyUnavailableError','TypeError','MAIN_IMPORT_NOT_CONFIRMED'];
export function safeMessage(m){
  if(!m||typeof m!=='object'||Array.isArray(m)||Object.keys(m).sort().join('|')!==['category','guard','phase','testPhase'].sort().join('|')||m.testPhase!=='guard_diagnostic'||!phases.includes(m.phase)||!categories.includes(m.category))return null;
  const guard=safeSnapshot(m.guard);if(!guard)return null;return {testPhase:'guard_diagnostic',phase:m.phase,category:m.category,guard};
}
function category(e){return ['TEST_EGRESS_DENIED','ERR_MODULE_NOT_FOUND','EADDRINUSE'].includes(e?.code)?e.code:['ZodError','KeyCustodyUnavailableError','TypeError'].includes(e?.name)?e.name:'MAIN_IMPORT_NOT_CONFIRMED';}
export async function observedImport({operation,guard,send,subscribe=()=>()=>{}}){
  let ipcComplete=true,current='NONE';
  const emit=phase=>{const event=safeMessage({testPhase:'guard_diagnostic',phase,category:current,guard:guard.snapshot()});try{if(!event||send(event)!==true)ipcComplete=false;}catch{ipcComplete=false;}};
  // Register before awaiting import, so a parent deadline can request a snapshot.
  const unsubscribe=subscribe(m=>{if(m?.diagnostic==='snapshot')emit('SNAPSHOT_REQUESTED');});
  emit('BEFORE_IMPORT');
  try{await operation();emit('MAIN_IMPORT_AND_STARTUP_COMPLETE');return {passed:ipcComplete,operationSucceeded:true,ipcComplete};}
  catch(e){current=category(e);emit('MAIN_IMPORT_AND_STARTUP_FAILED');return {passed:false,operationSucceeded:false,ipcComplete,category:current};}
  finally{unsubscribe();}
}
