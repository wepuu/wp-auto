import assert from 'node:assert/strict';
import {execFile,spawn} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,readFile,writeFile,mkdir,copyFile,statfs} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {baseline,verifyBaseline,sha} from '../test/persistent-authorization/r30/inputs.mjs';
import {checkWindowsEvidenceAcl} from './local-evidence-acl.mjs';
import {verifyBuilder,verifyUnusedTag,verifyBuildProcess,verifyAuthorizationArtifact} from './authorization-build-contract.mjs';
import {verifyDiskBudget,verifyCompiledIdentity,compiledIdentityCode} from './persistent-image-contract.mjs';
export const parents=Object.freeze({test:'sha256:ecb2b146182ef5ca756c1b5893ecfbf773bd6bd1b43be275670e54eddfda239c',authorization:'sha256:186da8a26977741ee8b1a2f1399448216a80986e0af9a87ebd661a0f4779379f',control:'sha256:2743e519b43e0d93e182ea0fb5974df49fe1c0cec4abe8283328ad40f1fbff9c'});
export async function buildCandidate(){
 const root=process.cwd(),exec=promisify(execFile),env={...process.env};
 for(const k of ['DOCKER_HOST','DOCKER_CONTEXT','DOCKER_TLS_VERIFY','BUILDX_BUILDER','BUILDKIT_HOST','NODE_OPTIONS','GIT_DIR','GIT_WORK_TREE','GIT_INDEX_FILE'])delete env[k];
 const docker='C:\\Users\\liulo\\AppData\\Local\\Programs\\DockerDesktop\\resources\\bin\\docker.exe';
 const command=(exe,args,timeout=20000)=>exec(exe,args,{cwd:root,env,timeout,windowsHide:true,shell:false,maxBuffer:1048576});
 const d=(args,t)=>command(docker,['--context','desktop-linux',...args],t),json=async args=>JSON.parse((await d(args)).stdout);
 const run='r34-build-'+new Date().toISOString().replace(/\D/gu,''),result={run,passed:false,stage:'source',artifacts:[],probes:[],diskSamples:[],startedUtc:new Date().toISOString(),automaticRetryPerformed:false,productionAccessed:false,registryPushed:false,databaseStarted:false};
 let directory,manifest,original,revision;
 const disk=async initial=>{const s=await statfs(root);result.diskSamples.push({stage:result.stage,...verifyDiskBudget(s.bavail*s.bsize,initial)});};
 const source=async()=>{assert.equal((await command('git',['rev-parse','HEAD'])).stdout.trim(),revision);assert.equal((await command('git',['status','--porcelain'])).stdout,'');assert.deepEqual(await verifyBaseline(root,manifest),original);};
 try {
  assert.equal((await command('git',['status','--porcelain'])).stdout,'');revision=(await command('git',['rev-parse','HEAD'])).stdout.trim();result.revision=revision;
  assert.equal((await command('git',['diff','--name-only','7f68133','--','apps','packages','package.json','pnpm-lock.yaml','pnpm-workspace.yaml','.npmrc','tsconfig.base.json','tsconfig.json'])).stdout,'');
  manifest=await baseline(root,(await command('git',['ls-files','-z','--','apps','packages','package.json','pnpm-lock.yaml','pnpm-workspace.yaml','.npmrc','tsconfig.base.json','tsconfig.json'])).stdout.split('\0').filter(Boolean));original=await verifyBaseline(root,manifest);result.baseline=original;
  await disk(true);result.stage='builder';verifyBuilder({contextName:'desktop-linux',builderName:'desktop-linux',contexts:await json(['context','inspect','desktop-linux']),builders:(await d(['buildx','ls','--format','json'])).stdout.trim().split(/\r?\n/u).map(JSON.parse)});
  directory=await mkdtemp(path.join(tmpdir(),'wepuu-r34-build-'));const who=(await command('whoami',[])).stdout.trim();
  await command('icacls.exe',[directory,'/inheritance:r','/grant:r',who+':(OI)(CI)F','*S-1-5-18:(OI)(CI)F','*S-1-5-32-544:(OI)(CI)F']);assert((await checkWindowsEvidenceAcl(directory,[])).verified);
  const context=path.join(directory,'context');await mkdir(context);
  for(const f of manifest.files){const target=path.join(context,f.file);await mkdir(path.dirname(target),{recursive:true});await copyFile(path.resolve(f.file),target);assert.equal(sha(await readFile(target)),f.sha256);}
  await copyFile('deploy/R34.Containerfile',path.join(context,'Containerfile'));result.containerfileSha256=sha(await readFile('deploy/R34.Containerfile'));
  const aliases={},inputCode="const fs=require('node:fs'),c=require('node:crypto');console.log(JSON.stringify(['package.json','pnpm-lock.yaml','pnpm-workspace.yaml','.npmrc','tsconfig.base.json','tsconfig.json'].map(n=>[n,c.createHash('sha256').update(fs.readFileSync('/workspace/'+n)).digest('hex')])));";
  const expected=await Promise.all(['package.json','pnpm-lock.yaml','pnpm-workspace.yaml','.npmrc','tsconfig.base.json','tsconfig.json'].map(async n=>[n,sha(await readFile(n))]));
  result.stage='parents';
  for(const [role,id]of Object.entries(parents)){
   const p=(await json(['image','inspect',id]))[0];assert(p.Id===id&&p.Os==='linux'&&p.Architecture==='amd64');
   assert.deepEqual(JSON.parse((await d(['run','--rm','--pull=never','--network','none','--user','1000:1000','--read-only','--no-healthcheck','--cap-drop','ALL','--security-opt','no-new-privileges','--entrypoint','node',id,'-e',inputCode])).stdout),expected);
   const alias='wepuu-'+run+'-parent-'+role+':local';verifyUnusedTag((await d(['image','ls','-q','--filter','reference='+alias])).stdout);await d(['image','tag',id,alias]);aliases[role]=alias;assert.equal((await json(['image','inspect',alias]))[0].Id,id);
  }
  result.parentIds=parents;result.parentAliases=aliases;const probes=[];
  for(const role of ['test','authorization','control']){
   result.stage='build_'+role;await disk(false);await source();
   const tag='wepuu-'+run+'-'+role+':candidate',iid=path.join(directory,role+'.iid'),metadata=path.join(directory,role+'.metadata.json');verifyUnusedTag((await d(['image','ls','-q','--filter','reference='+tag])).stdout);
   const attempt={role,attempts:1,startedUtc:new Date().toISOString()};result.artifacts.push(attempt);
   const args=['--context','desktop-linux','buildx','build','--builder','desktop-linux','--platform','linux/amd64','--network','none','--pull=false','--load','--target',role,'--iidfile',iid,'--metadata-file',metadata,'--build-arg','WEPUU_SOURCE_REVISION='+revision,'--build-arg','TEST_BASE='+aliases.test,'--build-arg','AUTH_BASE='+aliases.authorization,'--build-arg','CONTROL_BASE='+aliases.control,'--file',path.join(context,'Containerfile'),'--tag',tag,'--progress','plain',context];
   const outcome=await new Promise(resolve=>{
    let timedOut=false,spawnFailed=false,lowDisk=false,outputLimit=false,bytes=0,hard;
    const child=spawn(docker,args,{env,windowsHide:true,shell:false,stdio:['ignore','pipe','pipe']});
    const stop=()=>{child.kill('SIGTERM');hard??=setTimeout(()=>child.kill('SIGKILL'),10000);};
    for(const stream of [child.stdout,child.stderr])stream.on('data',b=>{bytes+=b.length;if(bytes>1048576){outputLimit=true;stop();}});
    const deadline=setTimeout(()=>{timedOut=true;stop();},600000),monitor=setInterval(()=>{statfs(root).then(s=>{try{verifyDiskBudget(s.bavail*s.bsize);}catch{lowDisk=true;stop();}}).catch(()=>{lowDisk=true;stop();});},3000);
    child.once('error',()=>{spawnFailed=true;});child.once('close',(code,signal)=>{clearTimeout(deadline);clearInterval(monitor);clearTimeout(hard);resolve({code,signal,timedOut,spawnFailed,lowDisk,outputLimit,discardedOutputBytes:bytes});});
   });attempt.process=outcome;verifyBuildProcess(outcome);assert(!outcome.lowDisk&&!outcome.outputLimit);
   Object.assign(attempt,verifyAuthorizationArtifact({exitCode:outcome.code,revision,tag,artifactRole:role,iid:await readFile(iid,'utf8'),metadata:JSON.parse(await readFile(metadata,'utf8')),images:await json(['image','inspect',tag])}));
   const probe=JSON.parse((await d(['run','--rm','--pull=never','--network','none','--user','1000:1000','--read-only','--no-healthcheck','--cap-drop','ALL','--security-opt','no-new-privileges','--entrypoint','node',attempt.imageId,'-e',compiledIdentityCode])).stdout);probes.push(probe);result.probes.push({role,...probe});
   for(const [r,id]of Object.entries(parents))assert.equal((await json(['image','inspect',aliases[r]]))[0].Id,id);await source();
  }
  result.stage='compiled_identity';result.compiledIdentity=verifyCompiledIdentity(probes);assert.notEqual(result.compiledIdentity.sha256,'e26eb91d35d7735b97d6ad00a4f0aa87c340e0da221cfef31ee4d2db227d2373');
  await disk(false);result.images=Object.fromEntries(result.artifacts.map(a=>[a.role,a.imageId]));result.passed=true;
 }catch(e){result.passed=false;result.category=typeof e?.code==='string'&&/^[A-Z_]+$/u.test(e.code)&&e.code!=='ERR_ASSERTION'?e.code:'BUILD_GATE_NOT_CONFIRMED';}
 finally{
  try{if(manifest){await source();result.inputsUnchanged=true;}await disk(false);}catch{result.inputsUnchanged=false;result.passed=false;}
  result.finishedUtc=new Date().toISOString();result.rawOutputSuppressed=true;
  if(directory){try{await writeFile(path.join(directory,'result.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});assert((await checkWindowsEvidenceAcl(directory,['result.json'])).verified);result.evidenceDirectory=directory;result.evidenceSaved=true;}catch{result.passed=false;result.evidenceSaved=false;}}
 }
 return result;
}
