import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, mkdtemp, chmod, lstat, readFile, writeFile, open } from 'node:fs/promises';
import { createHash, randomBytes } from 'node:crypto';
import { dirname, resolve, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { authorizationBuildArgs, verifyBuilder, verifyAuthorizationArtifact, verifyRuntimeProbe,
  publicBuildFailure, verifyBuildProcess, verifyUnusedTag } from './authorization-build-contract.mjs';

const exec = promisify(execFile), repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const reject = code => { throw Object.assign(new Error('build_gate_denied'), { code }); };
const environment = { ...process.env };
for (const key of ['DOCKER_HOST','DOCKER_CONTEXT','BUILDX_BUILDER','BUILDKIT_HOST','BUILDX_CONFIG','DOCKER_TLS_VERIFY',
  'GIT_DIR','GIT_WORK_TREE','GIT_INDEX_FILE']) delete environment[key];

function options() {
  const args = process.argv.slice(2), out = {};
  if (args.length !== 8) reject('REVISION_INVALID');
  for (let i=0;i<args.length;i+=2) {
    const key = args[i].slice(2);
    if (!['docker','context','builder','revision'].includes(key) || Object.hasOwn(out,key)) reject('BUILDER_NAME_INVALID');
    out[key] = args[i+1];
  }
  if (!isAbsolute(out.docker ?? '') || !/^[a-f0-9]{40}$/u.test(out.revision ?? '')
    || ![out.context,out.builder].every(v=>typeof v==='string'&&/^[A-Za-z0-9_.-]+$/u.test(v))) reject('REVISION_INVALID');
  return out;
}

async function main() {
  const opts = options(), nonce = randomBytes(6).toString('hex'), tag = `wepuu-r4br2-authorization:${opts.revision.slice(0,12)}-${nonce}`;
  const evidenceRoot = resolve(repo,'.tmp','authorization-artifacts');
  await mkdir(evidenceRoot,{recursive:true});
  for (const path of [resolve(repo,'.tmp'),evidenceRoot]) {
    const st=await lstat(path); if (!st.isDirectory() || st.isSymbolicLink()) reject('EVIDENCE_PATH_INVALID');
  }
  const directory = await mkdtemp(join(evidenceRoot,'r4br2-'));
  await chmod(directory,0o700);
  if (process.platform==='win32') {
    const user=(await exec('whoami',[],{windowsHide:true,timeout:5000})).stdout.trim();
    if (!/^[A-Za-z0-9_. -]+\\[A-Za-z0-9_. -]+$/u.test(user)) reject('EVIDENCE_PATH_INVALID');
    await exec('icacls',[directory,'/inheritance:r','/grant:r',`${user}:(OI)(CI)F`,
      '*S-1-5-18:(OI)(CI)F','*S-1-5-32-544:(OI)(CI)F'],{windowsHide:true,timeout:10000});
  }
  const save=(name,value)=>writeFile(join(directory,name),JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600});
  const command=async (file,args,timeout=20000)=>(await exec(file,args,{cwd:repo,env:environment,windowsHide:true,timeout,maxBuffer:2000000})).stdout;
  const docker=(args,timeout)=>command(opts.docker,['--context',opts.context,...args],timeout);
  const source=async()=>{
    const head=(await command('git',['rev-parse','HEAD'])).trim();
    if(head!==opts.revision)reject('SOURCE_REVISION_MISMATCH');
    if((await command('git',['status','--porcelain','--untracked-files=normal'])).trim())reject('SOURCE_NOT_CLEAN');
    return {head,lockSha256:hash(await readFile(join(repo,'pnpm-lock.yaml'))),
      containerfileSha256:hash(await readFile(join(repo,'deploy/Authorization.Containerfile')))};
  };
  const builder=async()=>verifyBuilder({contextName:opts.context,builderName:opts.builder,
    contexts:JSON.parse(await docker(['context','inspect',opts.context])),
    builders:(await docker(['buildx','ls','--format','json'])).trim().split(/\r?\n/u).filter(Boolean).map(x=>JSON.parse(x))});
  let stage='preflight', result, probeStarted=false;
  const startedUtc=new Date().toISOString(), started=performance.now(), probeName='wepuu-r4br2-probe-'+nonce;
  const steps=[];
  try {
    const before=await source(), beforeBuilder=await builder();
    const binary=await lstat(opts.docker); if(!binary.isFile()||binary.isSymbolicLink())reject('BUILDER_RESULT_INVALID');
    const version=JSON.parse(await docker(['version','--format','{{json .}}']));
    await save('attempt.json',{startedUtc,revision:opts.revision,tag,attempts:1,builder:beforeBuilder,
      dockerBinarySha256:hash(await readFile(opts.docker)),dockerClientVersion:version.Client?.Version,
      dockerServerVersion:version.Server?.Version,orchestratorNode:process.version,source:before});
    steps.push({stage,passed:true});
    stage='tag_absence';
    const old=(await docker(['image','ls','--filter','reference='+tag,'--format','{{.ID}}'])).trim();
    verifyUnusedTag(old);
    steps.push({stage,passed:true});
    const iidFile=join(directory,'image.iid'),metadataFile=join(directory,'build.metadata.private.json');
    const args=authorizationBuildArgs({context:opts.context,builder:opts.builder,revision:opts.revision,tag,iidFile,metadataFile});
    await save('invocation.json',{args,timeoutMs:900000,globalDockerSettingsChanged:false});
    stage='build_and_load';
    const stdout=await open(join(directory,'build.stdout.private.log'),'wx',0o600);
    const stderr=await open(join(directory,'build.stderr.private.log'),'wx',0o600);
    let built;
    try {
      built=await new Promise(resolveBuild=>{
        let timedOut=false,spawnFailed=false,hardStop;
        const child=spawn(opts.docker,args,{cwd:repo,env:environment,windowsHide:true,stdio:['ignore',stdout.fd,stderr.fd]});
        const timer=setTimeout(()=>{timedOut=true;child.kill('SIGTERM');hardStop=setTimeout(()=>child.kill('SIGKILL'),10000);},900000);
        child.once('error',()=>{spawnFailed=true;});
        child.once('close',(code,signal)=>{clearTimeout(timer);clearTimeout(hardStop);resolveBuild({code,signal,timedOut,spawnFailed});});
      });
    } finally { await stdout.close(); await stderr.close(); }
    await save('build-process.json',{...built,finishedUtc:new Date().toISOString(),rawLogsPrivate:true});
    verifyBuildProcess(built);
    await chmod(iidFile,0o600); await chmod(metadataFile,0o600);
    steps.push({stage,passed:true,subprocessOnly:true});
    stage='artifact_linkage';
    const artifact=verifyAuthorizationArtifact({exitCode:built.code,revision:opts.revision,tag,
      iid:await readFile(iidFile,'utf8'),metadata:JSON.parse(await readFile(metadataFile,'utf8')),
      images:JSON.parse(await docker(['image','inspect',tag]))});
    steps.push({stage,passed:true}); await save('artifact.json',artifact);
    stage='runtime_probe'; probeStarted=true;
    const code='console.log(JSON.stringify({version:process.version,lts:process.release.lts,uid:process.getuid()}))';
    const runtime=verifyRuntimeProbe(JSON.parse((await docker(['run','--rm','--pull=never','--name',probeName,
      '--label','wepuu.phase=p3e2sr4br2','--label','wepuu.run='+nonce,'--network','none','--read-only','--no-healthcheck',
      '--cap-drop','ALL','--security-opt','no-new-privileges','--entrypoint','node',artifact.imageId,'-e',code],15000)).trim()));
    steps.push({stage,passed:true}); await save('runtime.json',runtime);
    stage='postflight';
    if(JSON.stringify(await source())!==JSON.stringify(before))reject('SOURCE_CHANGED');
    if(JSON.stringify(await builder())!==JSON.stringify(beforeBuilder))reject('BUILDER_CHANGED');
    const final=JSON.parse(await docker(['image','inspect',tag]));
    verifyAuthorizationArtifact({exitCode:0,revision:opts.revision,tag,iid:await readFile(iidFile,'utf8'),
      metadata:JSON.parse(await readFile(metadataFile,'utf8')),images:final});
    steps.push({stage,passed:true});
    result={passed:true,revision:opts.revision,tag,builder:{name:opts.builder,context:opts.context,driver:beforeBuilder.driver,local:true},artifact,runtime};
  } catch(error) {
    steps.push({stage,passed:false});
    result={passed:false,revision:opts.revision,tag,failedStage:stage,category:publicBuildFailure(error),rawErrorSuppressed:true};
  } finally {
    if(probeStarted) {
      try {
        const ids=(await docker(['container','ls','--all','--filter','name=^/'+probeName+'$','--format','{{.ID}}'])).trim();
        if(ids) {
          const info=JSON.parse(await docker(['container','inspect',probeName]))[0];
          if(info.Config.Labels['wepuu.run']!==nonce)reject('PROBE_CLEANUP_NOT_CONFIRMED');
          if(info.State.Running)await docker(['stop','--time','5',probeName],15000);
          const remaining=(await docker(['container','ls','--filter','name=^/'+probeName+'$','--format','{{.ID}}'])).trim();
          if(remaining)reject('PROBE_CLEANUP_NOT_CONFIRMED');
        }
        result.probeStopped=true;
      } catch { result.passed=false;result.cleanup='PROBE_CLEANUP_NOT_CONFIRMED'; }
    }
    result.steps=steps;result.startedUtc=startedUtc;result.finishedUtc=new Date().toISOString();
    result.elapsedMs=Math.round(performance.now()-started);result.evidenceDirectory=directory;
    result.databaseStarted=false;result.oauthExecuted=false;result.mcpCalled=false;result.productionAccessed=false;
    result.registryPushed=false;result.automaticRetryPerformed=false;
    await save('result.json',result);
  }
  console.log(JSON.stringify(result));if(!result.passed)process.exitCode=1;
}

try { await main(); } catch(error) {
  console.log(JSON.stringify({passed:false,category:publicBuildFailure(error),rawErrorSuppressed:true,productionAccessed:false}));process.exitCode=1;
}
