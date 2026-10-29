import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {getJson,sha,packageMetadata} from './public-inputs.mjs';
import {typeLock,reviewTypeBytes} from './resolution.mjs';
import {patchLock} from './patch-preview.mjs';
const require=createRequire('/workspace/package.json'),mode=process.argv[2];
const result={mode,completed:false,compilerInvocations:0,lockResolutionAttempts:0,packagesInstalled:false,servicesStarted:false,productionAccessed:false,rawErrorsSuppressed:true};
let stage='fixed_identity';
try{
 assert.equal(process.version,'v24.22.1');assert.equal(require('typescript').version,'5.9.3');
 assert.equal(sha(await readFile('/workspace/pnpm-lock.yaml')),'cea3bc64773f878a668cabeb9d366086f69ad2c6921e5095ed6d49292bddad87');
 result.runtime={node:process.version,typescript:'5.9.3',pnpm:'11.19.0'};
 if(mode==='patch-lock') {
  stage='patch_registration_preview';
  const prior=JSON.parse(await readFile('/prior.json','utf8'));
  assert(prior.evidence.mode==='metadata'&&prior.evidence.completed===true&&prior.inputsUnchanged===true);
  await patchLock(prior.evidence,result);result.completed=true;
 } else if(mode==='type-review') {
  stage='existing_type_lock_review';
  const prior=JSON.parse(await readFile('/prior.json','utf8'));
  assert(prior.evidence.mode==='type-lock'&&prior.evidence.lockResolutionAttempts===1&&prior.evidence.typeSupport.resolution.exitCode===0);
  const bytes=await readFile('/lock-preview.yaml');
  assert.equal(sha(bytes),'d33085b902e69bcffcbf840d072ac003d8d243a1f18c1014bd79e642624b12a8');
  result.typeSupport=structuredClone(prior.evidence.typeSupport);
  result.artifacts=structuredClone(prior.evidence.artifacts);
  const metadataPrior={packages:Object.entries(result.typeSupport.manifest.devDependencies).filter(([n])=>n!=='@types/node').map(([name,version])=>({name,version,
    dist:{integrity:name==='@types/bun'?'sha512-h1hFqFVcvAvD9j9K7ZW7vd82aSA+rTdznZa+5bwvCwqSB1jmmfLcbIWhOLx1/+boy/xmjgCs/OMUL8hRJSmnPw==':'sha512-N0rFCuH9YoxG9/m61l9MfpJKfmLOVU0em7ipIz6TRgSSkvReLB9vL85GB+yr8Bs5leqpvg96JSwF4ZS1s4viQg=='}}))};
  await reviewTypeBytes(bytes,metadataPrior,result);result.completed=true;
 } else if(mode==='type-lock') {
  stage='type_lock_preview';
  const prior=JSON.parse(await readFile('/prior.json','utf8'));
  assert(prior.evidence.mode==='metadata'&&prior.evidence.completed===true&&prior.inputsUnchanged===true);
  assert.equal(prior.evidence.upstream.commit,'2627237fae3d02c53b3ba68b3812cbc31905a24b');
  await typeLock(prior.evidence,result);
  result.completed=true;
 } else {
 stage='public_type_metadata';result.packages=[];
 for(const [name,version]of [['@types/bun','1.3.14'],['@types/react','19.3.0']]){
  const url='https://registry.npmjs.org/'+encodeURIComponent(name)+'/'+version;
  const response=await getJson(url);
  result.packages.push({...packageMetadata(response.value,name,version),metadataSha256:response.sha256});
 }
 stage='immutable_upstream_commit';
 const expected='2627237fae3d02c53b3ba68b3812cbc31905a24b';
 const commit=await getJson('https://api.github.com/repos/better-auth/better-auth/commits/'+expected);
 assert.equal(commit.value.sha,expected);assert.equal(commit.value.parents.length,1);
 const target='packages/better-auth/src/plugins/organization/routes/crud-members.ts';
 const file=commit.value.files.find(f=>f.filename===target);assert(file&&file.status==='modified');
 result.upstream={commit:expected,parent:commit.value.parents[0].sha,metadataSha256:commit.sha256,
   changedFiles:commit.value.files.map(f=>({filename:f.filename,status:f.status})),target,blob:file.sha,patch:file.patch??null};
 const after=await getJson('https://api.github.com/repos/better-auth/better-auth/contents/'+target+'?ref='+expected);
 assert.equal(after.value.sha,file.sha);assert.equal(after.value.encoding,'base64');
 const afterBytes=Buffer.from(after.value.content.replaceAll('\n',''),'base64');
 result.upstream.afterSha256=sha(afterBytes);
 const parent=result.upstream.parent;
 const before=await getJson('https://api.github.com/repos/better-auth/better-auth/contents/'+target+'?ref='+parent);
 assert.equal(before.value.encoding,'base64');
 const beforeBytes=Buffer.from(before.value.content.replaceAll('\n',''),'base64');
 result.upstream.beforeSha256=sha(beforeBytes);result.upstream.beforeBlob=before.value.sha;
 result.artifacts={before:beforeBytes.toString('utf8'),after:afterBytes.toString('utf8')};
 result.completed=true;
 }
}catch(e){result.stage=stage;result.category=e.safeCode??(e.code==='ERR_ASSERTION'?'INPUT_REJECTED':'PREVIEW_NOT_CONFIRMED');
 if(e.httpStatus)result.httpStatus=e.httpStatus;if(e.transportCode)result.transportCode=e.transportCode;
 if(e.url)result.failedUrl=e.url;
}
console.log(JSON.stringify(result));if(!result.completed)process.exitCode=1;
