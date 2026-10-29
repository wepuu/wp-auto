import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {unified} from './patch-preview.mjs';
import {sha} from './public-inputs.mjs';
import {checkWindowsEvidenceAcl} from '../../../scripts/local-evidence-acl.mjs';
const directory=path.resolve(process.argv[2]);
assert((await checkWindowsEvidenceAcl(directory,['result.json','review.json'])).verified);
const original=JSON.parse(await readFile(path.join(directory,'result.json'),'utf8'));
assert(original.evidence.mode==='patch-lock'&&original.evidence.completed);
const artifacts=original.evidence.artifacts,file=original.evidence.patch.file;
assert.equal(sha(artifacts['original-declaration']),original.evidence.patch.originalSha256);
assert.equal(sha(artifacts['candidate-declaration']),original.evidence.patch.candidateSha256);
const diff=unified(artifacts['original-declaration'],artifacts['candidate-declaration'],file);
assert.equal(diff.split('\\ No newline at end of file').length-1,1);
const target=path.join(directory,'declaration.corrected.patch');
await writeFile(target,diff,{flag:'wx',mode:0o600});
const checkRoot=path.join(directory,'patch-check'),env={...process.env};
for(const name of Object.keys(env))if(name.startsWith('GIT_'))delete env[name];
const empty=path.join(directory,'empty-gitconfig');
env.GIT_CONFIG_NOSYSTEM='1';env.GIT_CONFIG_GLOBAL=empty;env.GIT_CONFIG_SYSTEM=empty;env.GIT_TERMINAL_PROMPT='0';
const result={patchSha256:sha(diff),patch:diff,originalCandidateDeclarationSha256:original.evidence.patch.candidateSha256,
 supersedesPatchSha256:original.evidence.patch.patchSha256,compilerInvocations:0,lockResolutionAttempts:0,patchApplied:false,lockHashRefreshRequired:true};
try{const r=await promisify(execFile)('git',['apply','--check','--verbose',target],{cwd:checkRoot,env,windowsHide:true,timeout:15000,maxBuffer:65536});
 result.patchCheck={passed:true,exitCode:0,stdoutBytes:Buffer.byteLength(r.stdout),stderrBytes:Buffer.byteLength(r.stderr)};}
catch(e){result.patchCheck={passed:false,exitCode:Number.isSafeInteger(e.code)?e.code:null};}
assert.equal(sha(await readFile(path.join(checkRoot,file))),original.evidence.patch.originalSha256);
result.originalUnchanged=true;
await writeFile(path.join(directory,'corrected-review.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});
const display={...result,patch:{sha256:sha(diff),bytes:Buffer.byteLength(diff)}};console.log(JSON.stringify(display));
if(!result.patchCheck.passed)process.exitCode=1;
