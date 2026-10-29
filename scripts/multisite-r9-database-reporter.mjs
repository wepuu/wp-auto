import {safeFailure} from './multisite-safe-reporter.mjs';
const target='R9 authoritative classification and restricted writer acceptance';
const stages=new Set(['migration017','runtime_privileges','native_classification','immutable_and_tombstone',
  'custom_atomicity_and_downgrade','native_parent_and_rotation','revocation_and_replay','upgrade_and_old_reader_rejection','complete']);
const sqlstates=new Set(['P0001','42501','42702','42704','23505','23514','23503','42883','42P01','42601','40001','40P01','55P03','57014']);
const functions=new Set(['artifact_assert_binding','artifact_register','artifact_classify','issue_native_code','issue_native_refresh',
  'issue_persistent_artifact','save_other_artifact','consume_classified_artifact','consume_other_artifact',
  'destroy_classified_artifact','destroy_grant_artifacts','artifact_classification_immutable']);
export function sqlEvidence(error){
  const result=[],seen=new Set();
  function visit(e,depth){
    if(!e||typeof e!=='object'||depth>5||seen.has(e))return;seen.add(e);
    if(sqlstates.has(e.code)){
      const context=typeof e.where==='string'?e.where.match(/function (?:oauth\.)?([a-z_]+)\([^\n]*?\) line (\d+)/u):null;
      result.push({sqlstate:e.code,...(context&&functions.has(context[1])?{function:context[1],line:Number(context[2])}:{})});
    }
    visit(e.cause,depth+1);if(Array.isArray(e.errors))for(const nested of e.errors.slice(0,8))visit(nested,depth+1);
  }visit(error,0);return result.slice(0,8);
}
export default async function* reporter(source){
  const outcomes=[],observed=[];let extra=false;
  for await(const e of source){
    if(e.type==='test:diagnostic'&&typeof e.data?.message==='string'){
      try{const v=JSON.parse(e.data.message);if(v.version===9&&stages.has(v.stage))observed.push(v.stage);}catch{}
    }
    if(!['test:pass','test:fail'].includes(e.type))continue;
    if(e.data?.name!==target){if(e.type==='test:fail')extra=true;continue;}
    outcomes.push({state:e.data.skip?'SKIP':e.type==='test:pass'?'PASS':'FAIL',
      ...(e.type==='test:fail'?{failures:safeFailure(e.data.details?.error),sql:sqlEvidence(e.data.details?.error)}:{})});
  }
  const passed=outcomes.length===1&&outcomes[0].state==='PASS'&&observed.at(-1)==='complete'&&!extra;
  if(!passed)process.exitCode=1;
  yield JSON.stringify({passed,targetExecuted:outcomes.length===1&&['PASS','FAIL'].includes(outcomes[0].state),outcomes,stages:observed,
    additionalFailureObserved:extra,rawOutputSuppressed:true})+'\n';
}
