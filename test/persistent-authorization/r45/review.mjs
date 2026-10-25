import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile,lstat} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {sha} from './public-inputs.mjs';
import {checkWindowsEvidenceAcl} from '../../../scripts/local-evidence-acl.mjs';
export function verifyClosure(record) {
 const value=record.evidence.typeSupport,packages=value.lock.packages;
 assert.equal(value.lock.sha256,'d33085b902e69bcffcbf840d072ac003d8d243a1f18c1014bd79e642624b12a8');
 assert.equal(packages.length,6);
 const expected={'@types/bun':'1.3.14','@types/react':'19.3.0','@types/node':'24.13.5','bun-types':'1.3.14',csstype:'3.2.3','undici-types':'7.18.2'};
 assert.deepEqual(Object.fromEntries(packages.map(p=>[p.name,p.version])),expected);
 assert(packages.every(p=>p.installLifecycleScripts.length===0&&/^sha512-[A-Za-z0-9+/]+=*$/u.test(p.dist.integrity)));
 assert.equal(value.packageScriptsNotExecuted,true);return {passed:true,packages:6,nodeTypeVersions:['24.13.5'],installed:false};
}
export function verifyPatch(record) {
 const value=record.evidence.patch,artifacts=record.evidence.artifacts;
 assert.equal(value.originalSha256,'13aac5f7f97201416ff8126028f99f0b75f9a7af09f505a1e59c99ed3103c51d');
 assert.equal(sha(artifacts['original-declaration']),value.originalSha256);
 assert.equal(sha(artifacts['candidate-declaration']),value.candidateSha256);
 assert.equal(sha(artifacts['better-auth@1.7.7-role-types.patch']),value.patchSha256);
 assert.deepEqual(Object.keys(value.lock.patchedDependencies),['better-auth@1.7.7']);
 assert.equal(value.lock.patchedDependencies['better-auth@1.7.7'],value.patchSha256);
 assert.equal(value.lock.originalPackageCount,285);assert.equal(value.lock.candidatePackageCount,285);
 assert(value.lock.onlyPatchIdentityChanged&&value.installedPackageUnchanged&&value.noNodeModules&&value.declarationOnly);
 assert(record.evidence.upstreamVerified.typeAnnotationsAdded===2&&record.evidence.upstreamVerified.optionalChainChanged===1);
 return {passed:true,declarationOnly:true,upstreamFullSourceFixApplied:false};
}
async function owned(directory) {
 assert(path.dirname(directory)===path.resolve(tmpdir())&&/^wepuu-r45-focused-[A-Za-z0-9]+$/u.test(path.basename(directory)));
 const stat=await lstat(directory);assert(stat.isDirectory()&&!stat.isSymbolicLink());
 assert((await checkWindowsEvidenceAcl(directory,['result.json'])).verified);
 const record=JSON.parse(await readFile(path.join(directory,'result.json'),'utf8'));assert(record.inputsUnchanged&&record.cleanup.stopped&&!record.cleanup.oomKilled);
 return record;
}
if(process.argv.length===4){
 const typeDir=path.resolve(process.argv[2]),patchDir=path.resolve(process.argv[3]);
 const types=await owned(typeDir),patch=await owned(patchDir);
 const result={typeClosure:verifyClosure(types),patch:verifyPatch(patch),compilerInvocations:0,packagesInstalled:false,patchApplied:false};
 const checkRoot=path.join(patchDir,'patch-check');
 await mkdir(path.join(checkRoot,'dist/plugins/organization/routes'),{recursive:true});
 const target=path.join(checkRoot,'dist/plugins/organization/routes/crud-members.d.mts');
 await writeFile(target,patch.evidence.artifacts['original-declaration'],{flag:'wx',mode:0o600});
 const diff=path.join(patchDir,'declaration.patch'),empty=path.join(patchDir,'empty-gitconfig');
 await writeFile(diff,patch.evidence.artifacts['better-auth@1.7.7-role-types.patch'],{flag:'wx',mode:0o600});
 await writeFile(empty,'',{flag:'wx',mode:0o600});
 const env={...process.env};
 for(const name of Object.keys(env))if(name.startsWith('GIT_'))delete env[name];
 env.GIT_CONFIG_NOSYSTEM='1';env.GIT_CONFIG_GLOBAL=empty;env.GIT_CONFIG_SYSTEM=empty;env.GIT_TERMINAL_PROMPT='0';
 let response;
 try{const r=await promisify(execFile)('git',['apply','--check','--verbose',diff],{cwd:checkRoot,env,windowsHide:true,timeout:15000,maxBuffer:65536});
  response={passed:true,exitCode:0,stdoutBytes:Buffer.byteLength(r.stdout),stderrBytes:Buffer.byteLength(r.stderr)};}
 catch(e){response={passed:false,exitCode:Number.isSafeInteger(e.code)?e.code:null,category:e.killed?'TIMEOUT':'PATCH_APPLICABILITY_NOT_CONFIRMED'};}
 assert.equal(sha(await readFile(target)),patch.evidence.patch.originalSha256);
 result.patchCheck=response;result.originalDeclarationUnchanged=true;result.passed=response.passed;
 await writeFile(path.join(patchDir,'review.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});
 console.log(JSON.stringify(result));if(!result.passed)process.exitCode=1;
}
