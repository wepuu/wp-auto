import assert from 'node:assert/strict';
import {patchHash,oldPatchHash,verifyTargetDelta,verifiedExit} from './contracts.mjs';
const original={lockfileVersion:'9.0',settings:{autoInstallPeers:true},importers:{'packages/account-auth':{dependencies:{'better-auth':{specifier:'1.7.7',version:'1.7.7(pg@8.23.0)'}}}},
 packages:{'better-auth@1.7.7':{resolution:{integrity:'sha512-original'}},'pg@8.23.0':{resolution:{integrity:'sha512-pg'}}},
 snapshots:{'better-auth@1.7.7(pg@8.23.0)':{dependencies:{pg:'8.23.0'}},'pg@8.23.0':{}}};
const candidate=structuredClone(original);candidate.patchedDependencies={'better-auth@1.7.7':patchHash};
candidate.importers['packages/account-auth'].dependencies['better-auth'].version='1.7.7(patch_hash='+patchHash+')(pg@8.23.0)';
candidate.snapshots['better-auth@1.7.7(patch_hash='+patchHash+')(pg@8.23.0)']=candidate.snapshots['better-auth@1.7.7(pg@8.23.0)'];delete candidate.snapshots['better-auth@1.7.7(pg@8.23.0)'];
let checks=0;assert(verifyTargetDelta(original,candidate,2).passed);checks++;
for(const mutate of [
 v=>{v.patchedDependencies['better-auth@1.7.7']=oldPatchHash;},
 v=>{v.patchedDependencies['pg@8.23.0']=patchHash;},
 v=>{v.packages['pg@8.23.0'].resolution.integrity='sha512-changed';},
 v=>{v.packages.extra={};},v=>{delete v.packages['pg@8.23.0'];},
 v=>{v.settings.autoInstallPeers=false;},
 v=>{v.importers['packages/account-auth'].dependencies['better-auth'].specifier='1.7.8';},
 v=>{v.importers['packages/account-auth'].dependencies['better-auth'].version='1.7.7(patch_hash='+oldPatchHash+')(pg@8.23.0)';},
 v=>{v.snapshots['pg@8.23.0'].dependencies={other:'1.0.0(patch_hash='+patchHash+')'};},
 v=>{v.snapshots['better-auth@1.7.7(patch_hash='+patchHash+')(pg@8.23.0)'].dependencies.pg='9.0.0';},
 v=>{v.packages['better-auth@1.7.7'].resolution.integrity='changed';}
]){const altered=structuredClone(candidate);mutate(altered);assert.throws(()=>verifyTargetDelta(original,altered,2));checks++;}
assert(verifiedExit({completed:true,exitCode:0,timedOut:false,outputLimitExceeded:false}));checks++;
for(const v of [{completed:true,exitCode:1,timedOut:false,outputLimitExceeded:false},{completed:true,exitCode:0,timedOut:true,outputLimitExceeded:false},{completed:true,exitCode:0,timedOut:false,outputLimitExceeded:true},{completed:false,exitCode:0,timedOut:false,outputLimitExceeded:false},null]){
 assert.equal(verifiedExit(v),false);checks++;
}
console.log(JSON.stringify({passed:true,checks,lockResolutionAttempts:0,compilerInvocations:0}));
