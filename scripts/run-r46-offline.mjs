import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,readFile,writeFile,statfs,lstat,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {baseline,verifyBaseline,sha} from '../test/persistent-authorization/r30/inputs.mjs';
import {checkWindowsEvidenceAcl} from './local-evidence-acl.mjs';
import {verifyDiskBudget,verifyIntegrationContext,verifyIntegrationImage} from './persistent-image-contract.mjs';
const image='sha256:ecb2b146182ef5ca756c1b5893ecfbf773bd6bd1b43be275670e54eddfda239c',revision='c404ed52228ce5492a85674547998d2f5d31772e';
const phase='offline';
const run='r46-'+phase+'-'+new Date().toISOString().replace(/[^0-9]/gu,''),name='wepuu-'+run,root=process.cwd(),env={...process.env};
for(const k of ['DOCKER_HOST','DOCKER_CONTEXT','DOCKER_TLS_VERIFY','BUILDX_BUILDER','BUILDKIT_HOST','NODE_OPTIONS','GIT_DIR','GIT_WORK_TREE','GIT_INDEX_FILE'])delete env[k];
const exec=promisify(execFile),invoke=(exe,args,timeout=15000)=>exec(exe,args,{cwd:root,env,timeout,windowsHide:true,shell:false,maxBuffer:2097152});
const d=(args,timeout)=>invoke('C:\\Users\\liulo\\AppData\\Local\\Programs\\DockerDesktop\\resources\\bin\\docker.exe',['--context','desktop-linux',...args],timeout),json=async args=>JSON.parse((await d(args)).stdout);
const tools=['scripts/run-r46-offline.mjs','test/persistent-authorization/r46/worker.mjs','test/persistent-authorization/r46/contracts.mjs','test/persistent-authorization/r46/contracts.synthetic.mjs','test/persistent-authorization/r45/preview/better-auth@1.7.7-role-types.patch.preview','test/persistent-authorization/r45/preview/type-support-pnpm-lock.yaml.preview','test/persistent-authorization/r30/inputs.mjs'];
const toolHashes=async()=>Object.fromEntries(await Promise.all(tools.map(async f=>[f,sha(await readFile(f))])));
let created=false,directory,expected;const protectedInputs=[];const result={run,passed:false,startedUtc:new Date().toISOString(),containerAttempts:0,productionAccessed:false,servicesStarted:false,candidateBuilt:false,rawOutputSuppressed:true};
try{
 result.initialStatus=(await invoke('git',['status','--porcelain'])).stdout;
 const changed=(await invoke('git',['diff','--name-only','61a73ac','--','apps','packages','deploy','package.json','pnpm-lock.yaml','pnpm-workspace.yaml','.npmrc','tsconfig.base.json','tsconfig.json'])).stdout.trim().split(/\r?\n/u).filter(Boolean);
 const allowed=[];
 if(JSON.stringify(changed.sort())!==JSON.stringify(allowed))throw Error('SOURCE_CHANGED');
 if((await invoke('git',['ls-files','--others','--exclude-standard','--','apps','packages','deploy','package.json','pnpm-lock.yaml','pnpm-workspace.yaml','.npmrc','tsconfig.base.json','tsconfig.json'])).stdout.trim())throw Error('SOURCE_CHANGED');
 const preSource=sha(await readFile('packages/database/src/index.ts'));if(phase==='baseline'&&preSource!=='f27582998d85485c51124b0c5e501fe30fde2e664399b2f68a1ef5ca7a5f7708')throw Error('SOURCE_CHANGED');
 if(sha(await readFile('packages/database/test/authorization-consume-mapping.test.ts'))!=='3fadc4c2d42d4a74cd76d6f28f8753951c5815269bf946a34bc4ea043f04fa16')throw Error('SOURCE_CHANGED');
 if(preSource!=='8d59679bdc93517480e3fe634d13798bb7dfa5d896568e894b6f5279dcd08f35')throw Error('SOURCE_CHANGED');result.phase=phase;result.sourceSha256=preSource;result.sourceHead=(await invoke('git',['rev-parse','HEAD'])).stdout.trim();result.toolHashes=await toolHashes();
 const tracked=(await invoke('git',['ls-files','--cached','--others','--exclude-standard','-z','--','apps','packages','package.json','pnpm-lock.yaml','pnpm-workspace.yaml','.npmrc','tsconfig.base.json','tsconfig.json'])).stdout.split('\0').filter(Boolean);
 expected=await baseline(root,tracked);result.baseline=await verifyBaseline(root,expected);
 const before=await statfs(root);result.diskBefore=verifyDiskBudget(before.bavail*before.bsize,true);
 verifyIntegrationContext(await json(['context','inspect','desktop-linux']),'desktop-linux');result.image=verifyIntegrationImage(await json(['image','inspect',image]),image,'test',revision);
 directory=await mkdtemp(path.join(tmpdir(),'wepuu-r46-focused-'));const who=(await invoke('whoami',[])).stdout.trim();
 await invoke('icacls.exe',[directory,'/inheritance:r','/grant:r',who+':(OI)(CI)F','*S-1-5-18:(OI)(CI)F','*S-1-5-32-544:(OI)(CI)F']);
 if(!(await checkWindowsEvidenceAcl(directory,[])).verified)throw Error('EVIDENCE_NOT_PRIVATE');
 const inputFile=path.join(directory,'inputs.json');await writeFile(inputFile,JSON.stringify(expected),{flag:'wx',mode:0o600});
 if(!(await checkWindowsEvidenceAcl(directory,['inputs.json'])).verified)throw Error('EVIDENCE_NOT_PRIVATE');
 const priorDir=path.join(tmpdir(),'wepuu-r45-focused-l5SuJi');
 if(!(await checkWindowsEvidenceAcl(priorDir,['result.json'])).verified)throw Error('PRIOR_EVIDENCE_INVALID');
 const priorFile=path.join(priorDir,'result.json'),priorStat=await lstat(priorFile);
 if(!priorStat.isFile()||priorStat.isSymbolicLink())throw Error('PRIOR_EVIDENCE_INVALID');
 const priorBytes=await readFile(priorFile);result.priorEvidenceSha256=sha(priorBytes);protectedInputs.push({file:priorFile,sha256:sha(priorBytes)});
 const priorContainer='wepuu-r45-patch-lock-20261025131610383',prior=(await json(['inspect',priorContainer]))[0];
 if(prior.Config.Labels?.['wepuu.run']!=='r45-patch-lock-20261025131610383'||prior.State.Running||prior.Image!==image)throw Error('PRIOR_CONTAINER_INVALID');
 const cacheDir=path.join(directory,'registry.npmjs.org');
 await d(['cp',priorContainer+':/tmp/wepuu-r45-home/.cache/pnpm/v11/metadata/registry.npmjs.org',cacheDir],30000);
 const cacheFiles=[];let cacheBytes=0;
 async function scanCache(dir,relative=''){
  for(const entry of await readdir(dir,{withFileTypes:true})){
   if(entry.isSymbolicLink())throw Error('CACHE_LINK_DENIED');
   const file=relative?relative+'/'+entry.name:entry.name,target=path.join(dir,entry.name);
   if(entry.isDirectory()){if(!/^@[a-z0-9_.-]+$/u.test(file))throw Error('CACHE_DIRECTORY_DENIED');await scanCache(target,file);}
   else if(entry.isFile()){
    if(!new RegExp('^(?:@[a-z0-9_.-]+/)?[a-z0-9_.-]+[.]jsonl$','u').test(file))throw Error('CACHE_PATH_DENIED');
    const bytes=await readFile(target);if(bytes.length>16777216)throw Error('CACHE_SIZE_DENIED');
    cacheBytes+=bytes.length;result.cacheObservation={bytesScanned:cacheBytes,filesScanned:cacheFiles.length+1,totalBudgetBytes:134217728,perFileBudgetBytes:16777216};
    if(cacheBytes>134217728)throw Error('CACHE_SIZE_DENIED');
    for(const line of bytes.toString('utf8').split(/\r?\n/u))if(line.trim())JSON.parse(line);
    cacheFiles.push({file,sha256:sha(bytes),bytes:bytes.length});protectedInputs.push({file:target,sha256:sha(bytes)});
   }else throw Error('CACHE_FILE_DENIED');
  }
 }
 await scanCache(cacheDir);cacheFiles.sort((a,b)=>a.file.localeCompare(b.file));if(!cacheFiles.length||cacheFiles.length>400)throw Error('CACHE_COUNT_DENIED');
 const cacheManifest={version:1,files:cacheFiles},cacheManifestFile=path.join(directory,'cache-manifest.json');
 await writeFile(cacheManifestFile,JSON.stringify(cacheManifest),{flag:'wx',mode:0o600});
 protectedInputs.push({file:cacheManifestFile,sha256:sha(JSON.stringify(cacheManifest))});
 result.cache={files:cacheFiles.length,bytes:cacheBytes,manifestSha256:sha(JSON.stringify(cacheManifest)),sourceContainer:priorContainer};
 const priorMount=['--mount',`type=bind,source=${priorFile},target=/prior.json,readonly`,'--mount',`type=bind,source=${cacheDir},target=/cache/registry.npmjs.org,readonly`,
 '--mount',`type=bind,source=${cacheManifestFile},target=/cache-manifest.json,readonly`];
 await d(['create','--name',name,'--label','wepuu.run='+run,'--label','wepuu.phase=r46-focused','--pull=never','--network','none','--user','0:0',
  '--no-healthcheck','--cap-drop','ALL','--security-opt','no-new-privileges','--log-driver','none',
  '--mount',`type=bind,source=${inputFile},target=/inputs.json,readonly`,
  ...priorMount,
  '--mount',`type=bind,source=${path.resolve('test/persistent-authorization')},target=/harness,readonly`,image,'node','/harness/r46/worker.mjs',phase]);created=true;
 result.containerAttempts=1;let output;try{output=(await d(['start','-a',name],330000)).stdout;}catch(e){output=e.stdout;}
 result.evidence=JSON.parse(output.trim());result.passed=result.evidence.completed===true;
}catch(e){result.passed=false;result.category=['SOURCE_NOT_CLEAN','SOURCE_CHANGED','EVIDENCE_NOT_PRIVATE','PRIOR_EVIDENCE_INVALID','PRIOR_CONTAINER_INVALID','CACHE_LINK_DENIED','CACHE_DIRECTORY_DENIED','CACHE_PATH_DENIED','CACHE_SIZE_DENIED','CACHE_FILE_DENIED','CACHE_COUNT_DENIED'].includes(e.message)?e.message:e.killed?'TRANSPORT_TIMEOUT':'FOCUSED_GATE_NOT_CONFIRMED';}
finally{
 if(created){try{let c=(await json(['inspect',name]))[0];if(c.Name!=='/'+name||c.Config.Labels?.['wepuu.run']!==run||c.Config.Labels?.['wepuu.phase']!=='r46-focused')throw Error();
  if(c.State.Running){await d(['stop','--time','10',name],20000);c=(await json(['inspect',name]))[0];}
  result.cleanup={stopped:c.State.Running===false,exitCode:c.State.ExitCode,oomKilled:c.State.OOMKilled===true};if(!result.cleanup.stopped||result.cleanup.oomKilled||result.cleanup.exitCode!==0)result.passed=false;
 }catch{result.passed=false;result.cleanup={confirmed:false};}}
 try{if(expected)result.inputsUnchanged=JSON.stringify(await verifyBaseline(root,expected))===JSON.stringify(result.baseline)&&JSON.stringify(await toolHashes())===JSON.stringify(result.toolHashes)&&(await invoke('git',['status','--porcelain'])).stdout===result.initialStatus;
  if(!result.inputsUnchanged)result.passed=false;const s=await statfs(root);result.diskAfter=verifyDiskBudget(s.bavail*s.bsize);
 }catch{result.passed=false;}
 try{for(const input of protectedInputs)if(sha(await readFile(input.file))!==input.sha256)throw Error();result.privateInputsUnchanged=true;}
 catch{result.privateInputsUnchanged=false;result.passed=false;}
 delete result.initialStatus;result.finishedUtc=new Date().toISOString();
 if(directory){try{await writeFile(path.join(directory,'result.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});if(!(await checkWindowsEvidenceAcl(directory,['result.json'])).verified)throw Error();result.evidenceSaved=true;result.evidenceDirectory=directory;}catch{result.evidenceSaved=false;result.passed=false;}}
}
const display=structuredClone(result);if(display.evidence?.artifacts)display.evidence.artifacts=Object.fromEntries(Object.entries(display.evidence.artifacts).map(([name,value])=>[name,{sha256:sha(value),bytes:Buffer.byteLength(value)}]));console.log(JSON.stringify(display));if(!result.passed)process.exitCode=1;
