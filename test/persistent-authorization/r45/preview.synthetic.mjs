import assert from 'node:assert/strict';
import {publicUrl,packageMetadata,sha} from './public-inputs.mjs';
import {unified,canonical,removePatchIdentity,verifyPatchPair} from './patch-preview.mjs';
let checks=0;
for(const value of ['https://registry.npmjs.org/@types%2Fbun/1.3.14','https://api.github.com/repos/better-auth/better-auth/commits/2627237fae3d02c53b3ba68b3812cbc31905a24b']){
 assert.equal(publicUrl(value).protocol,'https:');checks++;
}
for(const value of ['http://registry.npmjs.org/a','https://user:secret@registry.npmjs.org/a','https://registry.npmjs.org:444/a','https://evil.example/a',
 'https://registry.npmjs.org/a?token=SECRET','https://registry.npmjs.org/a#fragment','https://api.github.com/repos/other/private/commits/a']){
 assert.throws(()=>publicUrl(value));checks++;
}
const meta={name:'@types/bun',version:'1.3.14',dist:{integrity:'sha512-'+Buffer.alloc(64).toString('base64'),tarball:'https://registry.npmjs.org/@types/bun/-/bun-1.3.14.tgz'},
 dependencies:{'bun-types':'1.3.14'},scripts:{build:'SECRET_MUST_NOT_BE_PROJECTED',test:'SECRET_TOO'}};
const projected=packageMetadata(meta,meta.name,meta.version);
assert.deepEqual(projected.installLifecycleScripts,[]);checks++;
assert.deepEqual(projected.scriptNames,['build','test']);checks++;
assert(!JSON.stringify(projected).includes('SECRET'));checks++;
assert.deepEqual(packageMetadata({...meta,scripts:{postinstall:'DO_NOT_RUN'}},meta.name,meta.version).installLifecycleScripts,['postinstall']);checks++;
for(const change of [
 v=>({...v,name:'other'}),v=>({...v,version:'2.0.0'}),v=>({...v,dist:{...v.dist,integrity:'invalid'}}),
 v=>({...v,dist:{...v.dist,tarball:'https://evil.example/pkg.tgz'}}),v=>({...v,dependencies:{'bun-types':'git+https://evil.example/repo'}})
]){assert.throws(()=>packageMetadata(change(meta),meta.name,meta.version));checks++;}
const file='dist/plugins/organization/routes/crud-members.d.mts';
const before='a\nb\nold\nx\ny',after='a\nb\nnew\nx\ny';
const diff=unified(before,after,file);
assert.equal(diff.split('\\ No newline at end of file').length-1,1);checks++;
assert(diff.includes('-old\n+new\n'));checks++;
assert(!unified(before+'\n',after+'\n',file).includes('No newline'));checks++;
assert.throws(()=>unified(before,after+'\n',file));checks++;
assert.throws(()=>unified(before,after,'../../escape'));checks++;
const hash=sha(diff);assert(verifyPatchPair(hash,{'better-auth@1.7.7':hash}));checks++;
assert.throws(()=>verifyPatchPair(hash,{'better-auth@1.7.7':'a'.repeat(64)}));checks++;
assert.throws(()=>verifyPatchPair(hash,{'better-auth@1.7.8':hash}));checks++;
assert.throws(()=>verifyPatchPair(hash,{'better-auth@1.7.7':hash,other:hash}));checks++;
const old={snapshots:{'better-auth@1.7.7(pg@8.23.0)':{dependencies:{pg:'8.23.0'}}}};
const changed={patchedDependencies:{'better-auth@1.7.7':hash},snapshots:{['better-auth@1.7.7(patch_hash='+hash+')(pg@8.23.0)']:{dependencies:{pg:'8.23.0'}}}};
assert.deepEqual(canonical(removePatchIdentity(old)),canonical(removePatchIdentity(changed)));checks++;
assert.notDeepEqual(canonical(removePatchIdentity(old)),canonical(removePatchIdentity({...changed,snapshots:{'better-auth@1.7.7':{dependencies:{pg:'9.0.0'}}}})));checks++;
console.log(JSON.stringify({passed:true,checks,compilerInvocations:0,lockResolutionAttempts:0,packagesInstalled:false}));
