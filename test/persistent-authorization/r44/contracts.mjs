import assert from 'node:assert/strict';
const expected={'@better-auth/core:TS2307':1,'better-auth:TS2536':1,'resend:TS2307':1,'resend:TS2503':2};
function normalFailure(check) {
 return check?.diagnosticComplete===true && check?.process?.completed===true && check.process.spawnFailed===false
  && check.process.exitCode===2 && check.process.signal===null && check.process.timedOut===false
  && check.process.outputLimitExceeded===false && check.outputLimitExceeded===false && check.diagnosticsTruncated===false;
}
export function verifyMinimal(check) {
 assert(normalFailure(check),'COMPILER_FAILURE_NOT_CONFIRMED');
 assert(check.typecheckPass===false && check.dependencyIdentitiesComplete===true && check.dependencyRowsTruncated===false,'DIAGNOSTIC_INCOMPLETE');
 assert.equal(check.diagnostics.length,5);assert(check.diagnostics.every(r=>r.kind==='DEPENDENCY_DECLARATION'&&r.count===1));
 const counts={};for(const d of check.dependencyDiagnostics) {
  assert.equal(d.identity,'LOCK_VERIFIED');assert(/^[a-f0-9]{64}$/u.test(d.fileSha256));assert(/^[a-f0-9]{64}$/u.test(d.packageJsonSha256));
  const key=d.package+':'+d.code;counts[key]=(counts[key]??0)+1;
 }
 assert.deepEqual(counts,expected);return {observedExpectedFailure:true,typecheckPass:false,diagnostics:5};
}
export function verifyGeneric(check) {
 assert(normalFailure(check),'COMPILER_FAILURE_NOT_CONFIRMED');
 assert.equal(check.typecheckPass,false);assert.equal(check.dependencyDiagnostics.length,0);
 assert.equal(check.diagnostics.length,1);const row=check.diagnostics[0];
 assert.equal(row.file,'.tmp/r44/generic-negative.mts');assert.equal(row.code,'TS2536');assert.equal(row.count,1);
 assert.deepEqual(check.config.compilerOptions.types,[]);
 return {observedExpectedFailure:true,typecheckPass:false,diagnostics:1,positiveControlDiagnostics:0};
}
