import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,readdir,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {sha} from './public-inputs.mjs';
import {parser,runResolution} from './resolution.mjs';
export function canonical(value) {
 if(Array.isArray(value))return value.map(canonical);
 if(value!==null&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])]));
 return value;
}
export function verifyPatchPair(patchHash,dependencies){
 assert(/^[a-f0-9]{64}$/u.test(patchHash),'PATCH_HASH_REQUIRED');
 assert.deepEqual(Object.keys(dependencies),['better-auth@1.7.7'],'PATCH_SCOPE_DRIFT');
 assert.equal(dependencies['better-auth@1.7.7'],patchHash,'PATCH_LOCK_HASH_MISMATCH');
 return true;
}
export function removePatchIdentity(value) {
 if(typeof value==='string')return value.replace(/\(patch_hash=[A-Za-z0-9_-]+\)/gu,'');
 if(Array.isArray(value))return value.map(removePatchIdentity);
 if(value!==null&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([k])=>k!=='patchedDependencies').map(([k,v])=>[removePatchIdentity(k),removePatchIdentity(v)]));
 return value;
}
export function unified(before,after,file){
 assert.equal(file,'dist/plugins/organization/routes/crud-members.d.mts','PATCH_PATH_DENIED');
 assert.equal(before.endsWith('\n'),after.endsWith('\n'),'EOF_STYLE_CHANGED');
 const finalLf=before.endsWith('\n');
 const a=before.split('\n'),b=after.split('\n');if(finalLf){a.pop();b.pop();}let prefix=0,suffix=0;
 while(prefix<Math.min(a.length,b.length)&&a[prefix]===b[prefix])prefix++;
 while(suffix<Math.min(a.length-prefix,b.length-prefix)&&a[a.length-1-suffix]===b[b.length-1-suffix])suffix++;
 assert(prefix<a.length&&suffix>0);
 const start=Math.max(0,prefix-3),oldEnd=Math.min(a.length,a.length-suffix+3),newEnd=Math.min(b.length,b.length-suffix+3);
 const lines=[];
 function emit(sign,line,index,array){lines.push(sign+line);if(!finalLf&&index===array.length-1)lines.push('\\ No newline at end of file');}
 for(let i=start;i<prefix;i++)emit(' ',a[i],i,a);
 for(let i=prefix;i<a.length-suffix;i++)emit('-',a[i],i,a);
 for(let i=prefix;i<b.length-suffix;i++)emit('+',b[i],i,b);
 for(let i=a.length-suffix;i<oldEnd;i++)emit(' ',a[i],i,a);
 return 'diff --git a/'+file+' b/'+file+'\n--- a/'+file+'\n+++ b/'+file+'\n@@ -'+(start+1)+','+(oldEnd-start)+' +'+(start+1)+','+(newEnd-start)+' @@\n'+lines.join('\n')+'\n';
}
async function packageHash(root){
 const entries=[];async function walk(dir){for(const e of await readdir(dir,{withFileTypes:true})){
  const file=path.join(dir,e.name);if(e.isDirectory())await walk(file);else if(e.isFile())entries.push([file.slice(root.length+1),sha(await readFile(file))]);else assert(false,'PACKAGE_SYMLINK_REVIEW_REQUIRED');}}
 await walk(root);entries.sort((a,b)=>a[0].localeCompare(b[0]));return {sha256:sha(JSON.stringify(entries)),files:entries.length};
}
export async function patchLock(prior,result){
 const require=createRequire('/workspace/package.json'),ts=require('typescript'),yaml=await parser();
 assert.equal(prior.upstream.commit,'2627237fae3d02c53b3ba68b3812cbc31905a24b');
 const originalUpstream=prior.artifacts.before,patchedUpstream=prior.artifacts.after;
 assert.equal(sha(originalUpstream),prior.upstream.beforeSha256);assert.equal(sha(patchedUpstream),prior.upstream.afterSha256);
 // Compare exact ASTs after erasing only the two documented generic annotations and optional role access.
 function normalized(text){
  const source=ts.createSourceFile('upstream.ts',text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);assert.equal(source.parseDiagnostics.length,0);
  let annotations=0,optional=0;
  const tr=ts.transform(source,[context=>{const visit=node=>{
   if(ts.isCallExpression(node)&&ts.isPropertyAccessExpression(node.expression)&&node.expression.expression.getText(source)==='ctx'&&node.expression.name.text==='json'
      &&node.typeArguments?.length===1&&node.typeArguments[0].getText(source).replace(/\s/gu,'')==='{role:InferOrganizationRolesFromOption<O>}'){
     annotations++;return ts.factory.updateCallExpression(node,node.expression,undefined,node.arguments);
   }
   if(ts.isPropertyAccessExpression(node)&&node.questionDotToken&&node.expression.getText(source)==='member'&&node.name.text==='role'){
     optional++;return ts.factory.createPropertyAccessExpression(node.expression,node.name);
   }
   return ts.visitEachChild(node,visit,context);
  };return root=>ts.visitNode(root,visit);}]);
  const textOut=ts.createPrinter({removeComments:false}).printFile(tr.transformed[0]);tr.dispose();
  return {text:textOut,annotations,optional};
 }
 const beforeNorm=normalized(originalUpstream),afterNorm=normalized(patchedUpstream);
 assert.equal(beforeNorm.text,afterNorm.text,'UPSTREAM_DELTA_SCOPE_MISMATCH');
 assert.equal(beforeNorm.annotations,0);assert.equal(afterNorm.annotations,2);
 assert.equal(beforeNorm.optional-afterNorm.optional,1);
 result.upstreamVerified={commit:prior.upstream.commit,parent:prior.upstream.parent,beforeSha256:prior.upstream.beforeSha256,afterSha256:prior.upstream.afterSha256,
   typeAnnotationsAdded:2,optionalChainChanged:1,fullSourceFixNotApplied:true};
 const entries=await readdir('/workspace/node_modules/.pnpm');
 const dirs=entries.filter(n=>n.startsWith('better-auth@1.7.7'));assert.equal(dirs.length,1);
 const packageRoot='/workspace/node_modules/.pnpm/'+dirs[0]+'/node_modules/better-auth';
 const file='dist/plugins/organization/routes/crud-members.d.mts',bytes=await readFile(packageRoot+'/'+file),before=bytes.toString('utf8');
 assert.equal(sha(bytes),'13aac5f7f97201416ff8126028f99f0b75f9a7af09f505a1e59c99ed3103c51d');
 const packageBefore=await packageHash(packageRoot);
 const source=ts.createSourceFile(file,before,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);assert.equal(source.parseDiagnostics.length,0);
 const pos=source.getPositionOfLineAndCharacter(1011,8);let target;
 function visit(n){if(n.getStart(source)<=pos&&pos<n.end){if(ts.isPropertySignature(n)&&n.name.getText(source)==='role')target=n;ts.forEachChild(n,visit);}}
 visit(source);assert(target&&target.type&&ts.isIndexedAccessTypeNode(target.type));
 let owner=target;while(owner&&!ts.isVariableDeclaration(owner))owner=owner.parent;
 assert(owner&&owner.name.getText(source)==='getActiveMemberRole','DECLARATION_OWNER_MISMATCH');
 assert(target.type.getText(source).endsWith('["role"]'));
 const replacement='InferOrganizationRolesFromOption<O>';
 const after=before.slice(0,target.type.getStart(source))+replacement+before.slice(target.type.end);
 const parsed=ts.createSourceFile(file,after,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);assert.equal(parsed.parseDiagnostics.length,0);
 const patch=unified(before,after,file),shadow='/tmp/wepuu-r45-patch-workspace';await mkdir(shadow,{mode:0o700});
 const inputs=JSON.parse(await readFile('/inputs.json','utf8'));
 const selected=inputs.files.filter(f=>['package.json','pnpm-lock.yaml','pnpm-workspace.yaml'].includes(f.file)||/^(apps|packages)\/[^/]+\/package\.json$/u.test(f.file));
 for(const input of selected){
  const data=await readFile('/workspace/'+input.file);assert.equal(sha(data),input.sha256,'SHADOW_METADATA_DRIFT');
  await mkdir(path.dirname(shadow+'/'+input.file),{recursive:true,mode:0o700});
  await writeFile(shadow+'/'+input.file,data,{flag:'wx',mode:0o600});
 }
 const workspace=await readFile(shadow+'/pnpm-workspace.yaml','utf8');
 assert(!yaml.load(workspace,{schema:yaml.JSON_SCHEMA}).patchedDependencies);
 const candidateWorkspace=workspace+'\npatchedDependencies:\n  better-auth@1.7.7: patches/better-auth@1.7.7-role-types.patch\n';
 await mkdir(shadow+'/patches',{mode:0o700});
 await writeFile(shadow+'/patches/better-auth@1.7.7-role-types.patch',patch,{flag:'wx',mode:0o600});
 await writeFile(shadow+'/pnpm-workspace.yaml',candidateWorkspace,{mode:0o600});
 await writeFile(shadow+'/.npmrc','registry=https://registry.npmjs.org/\nstrict-ssl=true\nignore-scripts=true\n',{flag:'wx',mode:0o600});
 result.patch={file,originalSha256:sha(bytes),candidateSha256:sha(after),oldTypeSha256:sha(target.type.getText(source)),newType:replacement,
  patchSha256:sha(patch),originalBytes:bytes.length,candidateBytes:Buffer.byteLength(after),originalPackage:packageBefore,
  declarationOnly:true,rootRuntimeVersionsChanged:false};
 result.artifacts={'better-auth@1.7.7-role-types.patch':patch,'original-declaration':before,'candidate-declaration':after,'root-pnpm-workspace.yaml':candidateWorkspace};
 result.lockResolutionAttempts=1;result.patch.resolution=await runResolution(shadow);
 if(!result.patch.resolution.normal)throw Object.assign(Error('PATCH_LOCK_NOT_CONFIRMED'),{safeCode:result.patch.resolution.category});
 const lockBytes=await readFile(shadow+'/pnpm-lock.yaml');result.artifacts['root-pnpm-lock.yaml']=lockBytes.toString('utf8');
 const originalLock=yaml.load(await readFile('/workspace/pnpm-lock.yaml','utf8'),{schema:yaml.JSON_SCHEMA});
 const candidateLock=yaml.load(lockBytes.toString('utf8'),{schema:yaml.JSON_SCHEMA});
 result.patch.lock={originalSha256:sha(await readFile('/workspace/pnpm-lock.yaml')),candidateSha256:sha(lockBytes),
  patchedDependencies:candidateLock.patchedDependencies,originalPackageCount:Object.keys(originalLock.packages).length,candidatePackageCount:Object.keys(candidateLock.packages).length};
 assert.deepEqual(canonical(removePatchIdentity(originalLock)),canonical(removePatchIdentity(candidateLock)),'UNEXPECTED_LOCK_CLOSURE_CHANGE');
 assert.deepEqual(await packageHash(packageRoot),packageBefore,'INSTALLED_PACKAGE_CHANGED');
 result.patch.lock.onlyPatchIdentityChanged=true;result.patch.installedPackageUnchanged=true;
 let nodeModules;try {nodeModules=await readdir(shadow+'/node_modules');}catch(e){assert.equal(e.code,'ENOENT');}
 assert(!nodeModules||nodeModules.length===0,'PACKAGES_INSTALLED');
 result.patch.noNodeModules=true;
}
