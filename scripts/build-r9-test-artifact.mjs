import assert from 'node:assert/strict';
import {execFile,spawn} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,writeFile,readFile,open,statfs} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomBytes,createHash} from 'node:crypto';
import {verifyBuilder,verifyTestArtifact,verifyRuntimeProbe,verifyBuildProcess,verifyUnusedTag,publicBuildFailure} from './authorization-build-contract.mjs';
import {verifyDiskBudget} from './persistent-image-contract.mjs';
const docker=process.env.DOCKER_BIN,revision=process.env.WEPUU_R9_REVISION,context='desktop-linux';
const base='sha256:1d62d1e7f6646ddbd117505c77fd54f872d1fec20e73ab8c7ece9f2df8c544e2',baseTag='wepuu-r4br1-test:248f9cc6616c';
const nonce=randomBytes(6).toString('hex'),tag=`wepuu-r9-test:${revision?.slice(0,12)}-${nonce}`;
const directory=await mkdtemp(join(tmpdir(),'wepuu-r9-build-'));
const env={...process.env};for(const k of ['DOCKER_HOST','DOCKER_CONTEXT','DOCKER_TLS_VERIFY','BUILDX_BUILDER','BUILDKIT_HOST','GIT_DIR','GIT_WORK_TREE','GIT_INDEX_FILE'])delete env[k];
const command=async(file,args,timeout=20000)=>(await promisify(execFile)(file,args,{env,cwd:process.cwd(),windowsHide:true,timeout,maxBuffer:1000000})).stdout;
const call=args=>command(docker,['--context',context,...args]);
const save=(name,value)=>writeFile(join(directory,name),JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600});
const startedUtc=new Date().toISOString();let stage='preflight',result={passed:false},built=false,probeAttempted=false;
const probeName=`wepuu-r9-build-probe-${nonce}`;
const source=async()=>{assert.equal((await command('git',['rev-parse','HEAD'])).trim(),revision);assert.equal((await command('git',['status','--porcelain'])).trim(),'');};
try{
  assert(/^[a-f0-9]{40}$/u.test(revision??''));assert(/^[A-Z]:[\\/]/iu.test(docker??''));
  if(process.platform==='win32'){
    const user=(await command('whoami',[])).trim();assert(/^[A-Za-z0-9_. -]+\\[A-Za-z0-9_. -]+$/u.test(user));
    await command('icacls',[directory,'/inheritance:r','/grant:r',`${user}:(OI)(CI)F`,'*S-1-5-18:(OI)(CI)F','*S-1-5-32-544:(OI)(CI)F']);
  }
  await source();const disk=await statfs(process.cwd());result.initialDisk=verifyDiskBudget(disk.bavail*disk.bsize,true);
  const prerequisite=JSON.parse(await readFile(process.env.WEPUU_R9_CONSTRAINT_RESULT,'utf8'));
  assert(prerequisite.passed===true&&prerequisite.phase==='constraints');
  assert(/^[a-f0-9]{40}$/u.test(prerequisite.sourceRevision));
  assert.equal((await command('git',['diff','--name-only',prerequisite.sourceRevision,revision,'--','apps','packages','package.json','pnpm-lock.yaml'])).trim(),'');
  result.constraintRevision=prerequisite.sourceRevision;
  verifyBuilder({contextName:context,builderName:context,contexts:JSON.parse(await call(['context','inspect',context])),
    builders:(await call(['buildx','ls','--format','json'])).trim().split(/\r?\n/u).map(JSON.parse)});
  assert.equal(JSON.parse(await call(['image','inspect',baseTag]))[0].Id,base);
  verifyUnusedTag(await call(['image','ls','--quiet','--filter',`reference=${tag}`]));
  const iid=join(directory,'image.iid'),metadata=join(directory,'metadata.json');
  await save('attempt.json',{revision,tag,base,attempts:1,startedUtc,productionAccessed:false});
  const out=await open(join(directory,'build.stdout.private.log'),'wx',0o600),err=await open(join(directory,'build.stderr.private.log'),'wx',0o600);
  stage='build_once';
  let processResult;
  try{
    processResult=await new Promise(resolve=>{
      let timedOut=false,spawnFailed=false,lowDisk=false,hardStop;
      const child=spawn(docker,['--context',context,'buildx','build','--builder',context,'--platform','linux/amd64','--network','none',
        '--pull=false','--load','--iidfile',iid,'--metadata-file',metadata,'--build-arg',`WEPUU_SOURCE_REVISION=${revision}`,
        '--file','deploy/R9Test.Containerfile','--tag',tag,'--progress','plain','.'],{env,windowsHide:true,stdio:['ignore',out.fd,err.fd]});
      const stop=()=>{child.kill('SIGTERM');hardStop??=setTimeout(()=>child.kill('SIGKILL'),10000);};
      const timer=setTimeout(()=>{timedOut=true;stop();},600000);
      const diskTimer=setInterval(()=>{statfs(process.cwd()).then(d=>{try{verifyDiskBudget(d.bavail*d.bsize);}catch{lowDisk=true;stop();}}).catch(()=>{lowDisk=true;stop();});},3000);
      child.once('error',()=>{spawnFailed=true;});
      child.once('close',(code,signal)=>{clearTimeout(timer);clearInterval(diskTimer);clearTimeout(hardStop);resolve({code,signal,timedOut,spawnFailed,lowDisk});});
    });
  }finally{await out.close();await err.close();}
  await save('build-process.json',processResult);verifyBuildProcess(processResult);assert(!processResult.lowDisk);built=true;
  stage='artifact_identity';
  const artifact=verifyTestArtifact({exitCode:processResult.code,revision,tag,iid:await readFile(iid,'utf8'),
    metadata:JSON.parse(await readFile(metadata,'utf8')),images:JSON.parse(await call(['image','inspect',tag]))});
  stage='offline_runtime_probe';
  const probeCode=`(async()=>{const fs=await import('node:fs/promises');const m=await import('/workspace/packages/database/dist/index.js');const names=m.authorizationMigrationNames(await fs.readdir('/workspace/packages/database/migrations'));console.log(JSON.stringify({version:process.version,lts:process.release.lts,uid:process.getuid(),names,classificationReader:typeof m.PostgresPersistentReceiptStore.prototype.classification==='function',nativeWriter:typeof m.PostgresOidcAdapter.prototype.upsertNativeRefresh==='function'}));})().catch(()=>{process.exitCode=1;console.log('{"probeFailed":true}');});`;
  probeAttempted=true;
  const probe=JSON.parse(await call(['run','--rm','--pull=never','--name',probeName,'--label',`wepuu.run=${nonce}`,'--network','none','--read-only','--no-healthcheck','--user','1000:1000',
    '--cap-drop','ALL','--security-opt','no-new-privileges','--entrypoint','node',artifact.imageId,'-e',probeCode]));
  verifyRuntimeProbe(probe);assert(probe.classificationReader&&probe.nativeWriter&&probe.names.length===16&&probe.names.at(-1).startsWith('017_'));
  assert(!probe.names.some(x=>x.startsWith('014')));
  await source();assert.equal(JSON.parse(await call(['image','inspect',baseTag]))[0].Id,base);
  const finalDisk=await statfs(process.cwd());verifyDiskBudget(finalDisk.bavail*finalDisk.bsize);
  result={...result,passed:true,artifact,probe,finalFreeBytes:finalDisk.bavail*finalDisk.bsize,
    migration017Sha256:createHash('sha256').update(await readFile('packages/database/migrations/017_authorization_artifact_classification.sql')).digest('hex')};
}catch(error){result={...result,passed:false,failedStage:stage,category:publicBuildFailure(error),rawOutputSuppressed:true};}
if(probeAttempted){
  try{
    const remaining=(await call(['container','ls','--all','--filter',`name=^/${probeName}$`,'--format','{{.ID}}'])).trim();
    if(remaining){const info=JSON.parse(await call(['container','inspect',probeName]))[0];assert.equal(info.Config.Labels['wepuu.run'],nonce);
      if(info.State.Running)await call(['stop','--time','5',probeName]);
      assert.equal((await call(['container','ls','--filter',`name=^/${probeName}$`,'--format','{{.ID}}'])).trim(),'');
    }result.probeStopped=true;
  }catch{result.passed=false;result.cleanup='PROBE_CLEANUP_NOT_CONFIRMED';}
}
result={...result,revision,tag,imageBuilt:built,evidenceDirectory:directory,startedUtc,finishedUtc:new Date().toISOString(),
  productionAccessed:false,databaseStarted:false,automaticRetryPerformed:false,registryPushed:false};
await save('result.json',result);console.log(JSON.stringify(result));if(!result.passed)process.exitCode=1;
