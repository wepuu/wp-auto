import {aggregate, readOnlyPrerequisites} from './e2e-readonly-transport.mjs';

export const prerequisiteNames = Object.freeze(['python','transport','sql','phpProjection',
  'finalGeneratedPhpSyntax','desktopParameters','privateAdapter','projection',
  'dispatcher','hostedHelperCi','hostedPlatformCi']);
export const stageNames = Object.freeze(['resource','platform','metadata','desktop','wordpress','ending']);
const hash = x => typeof x === 'string' && /^[a-f0-9]{64}$/.test(x);
const flags = {desktopEnablePerformed:false,oauthAttemptPerformed:false,mcpToolCallPerformed:false};
const need = (ok, code) => { if (!ok) throw Error(code); };

// The only owner of the live-stage callback. No individual-stage entry point exists.
// Offline jobs must resolve actual completion receipts; a launch receipt is insufficient.
export function createReadOnlyDispatcher({identity, jobs, verifyFrozen, claim, persist,
  executeStage, utcNow=Date.now, monoNow=()=>performance.now(), signal}) {
  const frozen = structuredClone(identity);
  const lifetime=new AbortController();
  signal=signal?AbortSignal.any([signal,lifetime.signal]):lifetime.signal;
  let state='PREPARING', preparing=false, running=false, started=false;
  let evidence;
  const cancelled = () => need(!signal?.aborted, 'CANCELLED');
  const receipt = () => ({state,...flags});
  async function stop(category) {
    state='STOPPED';
    lifetime.abort();
    const out={passed:false,status:'R2_STOPPED',category,...receipt()};
    // Do not include raw exceptions or arbitrary callback results in the stop envelope.
    try { await persist('stop',out); } catch { /* Remains terminal in memory. */ }
    return out;
  }
  async function prepare() {
    if (state!=='PREPARING'||preparing) return stop('PREPARATION_NOT_FRESH');
    preparing=true;
    try {
      need(/^[a-f0-9]{40}$/.test(frozen.candidateHead)&&hash(frozen.manifestSha256)&&hash(frozen.finalPhpSha256),'IDENTITY_INVALID');
      need(Array.isArray(jobs)&&jobs.length===prerequisiteNames.length&&
        prerequisiteNames.every(key=>jobs.filter(j=>j.key===key).length===1),'PREREQUISITE_SET_INVALID');
      const definitions=jobs.map(j=>({...j}));
      need(definitions.every(j=>hash(j.sourceSha256)&&hash(j.environmentSha256)&&typeof j.run==='function'),'PREREQUISITE_IDENTITY_INVALID');
      // allSettled also waits for remaining jobs after a rejection. Never open the
      // observation window while a sibling test is still running.
      const completed=await Promise.allSettled(definitions.map(j=>Promise.resolve().then(()=>j.run())));
      cancelled();
      need(state==='PREPARING','PREPARATION_INTERRUPTED');
      const checks={};
      completed.forEach((item,index)=>{
        const d=definitions[index], r=item.status==='fulfilled'?item.value:null;
        need(r?.passed===true&&r.exitCode===0&&r.sourceSha256===d.sourceSha256&&
          r.environmentSha256===d.environmentSha256&&hash(r.receiptSha256),'PREREQUISITE_NOT_COMPLETE');
        const finished=Date.parse(r.completedAtUtc);
        need(Number.isFinite(finished)&&finished<=utcNow(),'PREREQUISITE_TIME_INVALID');
        checks[d.key]=structuredClone(r);
      });
      evidence={candidateHead:frozen.candidateHead,checks};
      need(checks.finalGeneratedPhpSyntax.sourceSha256===frozen.finalPhpSha256,'FINAL_PHP_SOURCE_MISMATCH');
      need(await verifyFrozen()===true,'SOURCE_DRIFT');
      state='LOCAL_VERIFIED'; await persist('prerequisites',{...receipt(),passed:true,evidence});
      cancelled(); need(state==='LOCAL_VERIFIED','PREPARATION_INTERRUPTED');
      state='READY'; await persist('ready',{...receipt(),passed:true});
      return {passed:true,status:'R2_READY',...receipt()};
    } catch { return stop('PREREQUISITES_NOT_CONFIRMED'); }
  }
  async function run(operator) {
    if (state!=='READY'||running||started) return stop('NOT_READY_OR_ALREADY_STARTED');
    running=true;started=true;
    let activeStage='dispatch';
    try {
      cancelled();
      need(operator?.accountsCorrect===true&&operator?.wordpressReady===true,'OPERATOR_NOT_READY');
      const readyAt=Date.parse(operator.confirmedAtUtc),now=utcNow();
      need(Number.isFinite(readyAt)&&readyAt<=now&&now-readyAt<=300000,'OPERATOR_CONFIRMATION_EXPIRED');
      need(await verifyFrozen()===true,'SOURCE_DRIFT');
      need(state==='READY','DISPATCH_INTERRUPTED');
      // Includes the old validator, now on the real path before claim/window/SSH.
      need(readOnlyPrerequisites(evidence,{candidateHead:frozen.candidateHead,
        finalPhpSha256:frozen.finalPhpSha256,startedAtMs:utcNow()}),'PREREQUISITES_NOT_CONFIRMED');
      cancelled(); need(await claim()===true,'RUN_ALREADY_CLAIMED');
      state='OBSERVING';
      const wallStart=utcNow(),monoStart=monoNow(),stages={};
      const remaining=()=>{
        cancelled();need(state==='OBSERVING','DISPATCH_INTERRUPTED');
        const elapsed=monoNow()-monoStart,wall=utcNow()-wallStart;
        need(Number.isFinite(elapsed)&&elapsed>=0&&elapsed<900000&&wall>=0&&wall<900000,'WINDOW_EXCEEDED');
        return Math.max(1,Math.floor(Math.min(900000-elapsed,900000-wall)));
      };
      await persist('window',{runId:frozen.runId,startedAtUtc:new Date(wallStart).toISOString(),startedMonotonicMs:monoStart,...receipt()});
      for (const name of stageNames) {
        activeStage=name;
        const budgetMs=remaining();
        need(await verifyFrozen()===true,'SOURCE_DRIFT');
        // Recheck after async verification, immediately before the only callback.
        const result=await executeStage(name,{timeoutMs:Math.min(budgetMs,remaining()),signal});
        remaining();
        const r={...result,runId:frozen.runId,manifestSha256:frozen.manifestSha256};
        need(result?.runId===frozen.runId&&result?.manifestSha256===frozen.manifestSha256,'RESULT_IDENTITY_INVALID');
        await persist(name,r);
        need(r.passed===true,'STAGE_NOT_CONFIRMED');
        if(name==='ending')need(r.result?.protectedBusinessSha256===stages.platform?.result?.protectedBusinessSha256,'PROTECTED_STATE_CHANGED');
        stages[name]=r;
      }
      const elapsed=monoNow()-monoStart;
      const result=aggregate(stages,{startedMs:0,endedMs:elapsed,runId:frozen.runId,manifestSha256:frozen.manifestSha256});
      need(result.passed,'AGGREGATE_NOT_CONFIRMED');
      state='COMPLETE';
      const out={...result,status:'R2_COMPLETE',...receipt(),runId:frozen.runId,manifestSha256:frozen.manifestSha256,elapsedMonotonicMs:elapsed};
      await persist('aggregate',out); return out;
    } catch (error) {
      const allowed=['OPERATOR_NOT_READY','OPERATOR_CONFIRMATION_EXPIRED','SOURCE_DRIFT','PREREQUISITES_NOT_CONFIRMED',
        'RUN_ALREADY_CLAIMED','WINDOW_EXCEEDED','CANCELLED','DISPATCH_INTERRUPTED','RESULT_IDENTITY_INVALID','STAGE_NOT_CONFIRMED','PROTECTED_STATE_CHANGED'];
      const out=await stop(allowed.includes(error.message)?error.message:'NOT_CONFIRMED');
      return {...out,stage:activeStage};
    } finally {running=false;}
  }
  return Object.freeze({prepare,run,snapshot:receipt});
}
