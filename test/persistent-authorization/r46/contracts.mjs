import assert from 'node:assert/strict';
export const patchHash='33dc3ecb325a9092ae4bab170890a3bab05e7fc9127783dbc334c766dcbe1d3c';
export const oldPatchHash='a9a06eb6031b5308dea5fb5397749d17fc35c86099b2948da68a8f663bd356e2';
export const originalLockHash='cea3bc64773f878a668cabeb9d366086f69ad2c6921e5095ed6d49292bddad87';
export const priorLockHash='f93bfcd02138dcc4dacfdc7f40e2c0affaa2b79e94eb97d5916913caf94ad238';
export const typeLockHash='d33085b902e69bcffcbf840d072ac003d8d243a1f18c1014bd79e642624b12a8';
export function canonical(v){
 if(Array.isArray(v))return v.map(canonical);
 return v!==null&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
}
export function verifyTargetDelta(original,candidate,expectedCount=285){
 assert(!original.patchedDependencies,'BASELINE_ALREADY_PATCHED');
 assert.equal(Object.keys(original.packages).length,expectedCount);
 assert.equal(Object.keys(candidate.packages).length,expectedCount);
 assert.deepEqual(candidate.patchedDependencies,{'better-auth@1.7.7':patchHash},'PATCH_PAIR_MISMATCH');
 const value=structuredClone(candidate);delete value.patchedDependencies;
 const originalRef=original.importers['packages/account-auth'].dependencies['better-auth'].version;
 assert(originalRef.startsWith('1.7.7(')&&!originalRef.includes('patch_hash='),'BASELINE_REF_INVALID');
 const expectedRef='1.7.7(patch_hash='+patchHash+')'+originalRef.slice('1.7.7'.length);
 assert.equal(value.importers['packages/account-auth'].dependencies['better-auth'].version,expectedRef,'TARGET_IMPORTER_DRIFT');
 value.importers['packages/account-auth'].dependencies['better-auth'].version=originalRef;
 const originalKeys=Object.keys(original.snapshots).filter(k=>k.startsWith('better-auth@1.7.7('));assert.equal(originalKeys.length,1);
 const key=originalKeys[0],candidateKey='better-auth@1.7.7(patch_hash='+patchHash+')'+key.slice('better-auth@1.7.7'.length);
 assert(Object.hasOwn(value.snapshots,candidateKey)&&!Object.hasOwn(value.snapshots,key),'TARGET_SNAPSHOT_DRIFT');
 value.snapshots[key]=value.snapshots[candidateKey];delete value.snapshots[candidateKey];
 assert.deepEqual(canonical(value),canonical(original),'UNEXPECTED_CLOSURE_CHANGE');
 return {passed:true,packageCount:expectedCount,normalizedOnly:['patchedDependencies.better-auth@1.7.7','importers.packages/account-auth.dependencies.better-auth.version','snapshots.better-auth@1.7.7 key']};
}
export function verifiedExit(v){
 return v?.completed===true&&v.exitCode===0&&v.timedOut===false&&v.outputLimitExceeded===false;
}
