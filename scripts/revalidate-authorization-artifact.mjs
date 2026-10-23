import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir,mkdtemp,chmod,lstat,readFile,writeFile } from 'node:fs/promises';
import { createHash,randomBytes } from 'node:crypto';
import { dirname,resolve,join,isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { localDockerEndpoint,verifyAuthorizationArtifact } from './authorization-build-contract.mjs';
import { R2_ARTIFACT,AUTHORIZATION_BUILD_INPUTS,revalidationDockerArgs,revalidateExistingAuthorization,
  revalidationFailure } from './authorization-revalidation.mjs';

const repo=resolve(dirname(fileURLToPath(import.meta.url)),'..'),exec=promisify(execFile);
const inputRoot=join(repo,'.tmp','authorization-artifacts','r4br2-1jdvKU');
const inputNames=['attempt.json','build-process.json','image.iid','build.metadata.private.json'];
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const deny=code=>{throw Object.assign(new Error('revalidation_denied'),{code});};
const env={...process.env};
for(const name of ['DOCKER_HOST','DOCKER_CONTEXT','BUILDX_BUILDER','BUILDKIT_HOST','BUILDX_CONFIG','DOCKER_TLS_VERIFY',
  'GIT_DIR','GIT_WORK_TREE','GIT_INDEX_FILE'])delete env[name];
const command=async(file,args,timeout=20000,extra={})=>(await exec(file,args,{cwd:repo,env:{...env,...extra},windowsHide:true,timeout,maxBuffer:2000000})).stdout;
function options(){
  const args=process.argv.slice(2),out={};
  if(args.length!==6)deny('R3_ARGUMENT_INVALID');
  for(let i=0;i<args.length;i+=2){const key=args[i].slice(2);
    if(!['docker','context','verifier-revision'].includes(key)||Object.hasOwn(out,key))deny('R3_ARGUMENT_INVALID');out[key]=args[i+1];}
  if(!isAbsolute(out.docker??'')||!/^[a-f0-9]{40}$/u.test(out['verifier-revision']??'')
    ||!/^[A-Za-z0-9_.-]+$/u.test(out.context??''))deny('R3_ARGUMENT_INVALID');return out;
}
async function restrict(directory){
  await chmod(directory,0o700);
  if(process.platform==='win32'){
    const user=(await command('whoami',[],5000)).trim();
    if(!/^[A-Za-z0-9_. -]+\\[A-Za-z0-9_. -]+$/u.test(user))deny('R3_INPUT_PERMISSION_DENIED');
    await command('icacls',[directory,'/inheritance:r','/grant:r',`${user}:(OI)(CI)F`,
      '*S-1-5-18:(OI)(CI)F','*S-1-5-32-544:(OI)(CI)F'],10000);
  }
}
async function inputPermissions(){
  for(const path of [join(repo,'.tmp'),join(repo,'.tmp','authorization-artifacts'),inputRoot]){
    const st=await lstat(path);if(!st.isDirectory()||st.isSymbolicLink())deny('R3_INPUT_NOT_REGULAR');
  }
  for(const name of inputNames){const st=await lstat(join(inputRoot,name));
    if(!st.isFile()||st.isSymbolicLink()||st.size<1||st.size>1048576)deny('R3_INPUT_NOT_REGULAR');}
  if(process.platform==='win32'){
    const code=`$ErrorActionPreference='Stop'; $taskDir=$env:WEPUU_R3_ACL_PATH; $taskSid=[System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value; $taskAllowed=@($taskSid,'S-1-5-18','S-1-5-32-544'); $taskPaths=@($taskDir); foreach($taskName in @('attempt.json','build-process.json','image.iid','build.metadata.private.json')){$taskPaths+=Join-Path $taskDir $taskName}; $taskOk=(Get-Acl -LiteralPath $taskDir).AreAccessRulesProtected; foreach($taskPath in $taskPaths){$taskAcl=Get-Acl -LiteralPath $taskPath; if($taskAcl.GetOwner([System.Security.Principal.SecurityIdentifier]).Value -notin $taskAllowed){$taskOk=$false}; foreach($taskRule in $taskAcl.Access){if($taskRule.IdentityReference.Translate([System.Security.Principal.SecurityIdentifier]).Value -notin $taskAllowed){$taskOk=$false}}}; @{verified=[bool]$taskOk}|ConvertTo-Json -Compress`;
    const check=JSON.parse(await command('powershell.exe',['-NoProfile','-NonInteractive','-Command',code],15000,{WEPUU_R3_ACL_PATH:inputRoot}));
    if(check.verified!==true)deny('R3_INPUT_PERMISSION_DENIED');
  }else{
    for(const path of [inputRoot,...inputNames.map(n=>join(inputRoot,n))]){
      const st=await lstat(path);if(st.uid!==process.getuid()||(st.mode&0o077)!==0)deny('R3_INPUT_PERMISSION_DENIED');}
  }
}
async function readInputs(){
  try{await inputPermissions();}catch(error){if(error.code==='ENOENT')deny('R3_INPUT_MISSING');throw error;}
  const bytes={};for(const name of inputNames)bytes[name]=await readFile(join(inputRoot,name));
  return {receipt:JSON.parse(bytes['attempt.json']),buildProcess:JSON.parse(bytes['build-process.json']),iid:bytes['image.iid'].toString('utf8'),
    metadata:JSON.parse(bytes['build.metadata.private.json']),hashes:Object.fromEntries(inputNames.map(n=>[n,sha(bytes[n])]))};
}
async function main(){
  const opts=options(),nonce=randomBytes(6).toString('hex'),operations=[];
  const outputRoot=join(repo,'.tmp','authorization-revalidation');await mkdir(outputRoot,{recursive:true});
  const rootStat=await lstat(outputRoot);if(!rootStat.isDirectory()||rootStat.isSymbolicLink())deny('R3_INPUT_NOT_REGULAR');
  const directory=await mkdtemp(join(outputRoot,'r4br3-'));await restrict(directory);
  const save=(name,value)=>writeFile(join(directory,name),JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600});
  const docker=async(operation)=>{operations.push(operation);return command(opts.docker,revalidationDockerArgs(operation,{context:opts.context,nonce}),operation==='probe'?15000:20000);};
  const source=async()=>{
    const head=(await command('git',['rev-parse','HEAD'])).trim();if(head!==opts['verifier-revision'])deny('R3_VERIFIER_REVISION_MISMATCH');
    if((await command('git',['status','--porcelain','--untracked-files=normal'])).trim())deny('R3_VERIFIER_NOT_CLEAN');
    if((await command('git',['diff','--name-only',R2_ARTIFACT.buildRevision,head,'--',...AUTHORIZATION_BUILD_INPUTS])).trim())deny('R3_BUILD_INPUT_CHANGED');
    return {verifierRevision:head,imageBuildRevision:R2_ARTIFACT.buildRevision,applicationBuildInputsUnchanged:true};
  };
  const context=async()=>{
    const values=JSON.parse(await docker('context'));
    if(values.length!==1||values[0].Name!==opts.context||!localDockerEndpoint(values[0].Endpoints?.docker?.Host))deny('REMOTE_DOCKER_DENIED');
    return {name:opts.context,endpoint:values[0].Endpoints.docker.Host};
  };
  let stage='preflight',result,probeStarted=false,firstInputs,firstSource,firstContext;
  const startedUtc=new Date().toISOString(),started=performance.now(),stages=[];
  try{
    firstSource=await source();firstContext=await context();
    await save('attempt.json',{startedUtc,attempts:1,...firstSource,context:opts.context,localContext:true,
      imageId:R2_ARTIFACT.imageId,tag:R2_ARTIFACT.tag,orchestratorNode:process.version});
    result=await revalidateExistingAuthorization({
      onStage:value=>{stage=value;stages.push(value);},
      readEvidence:async()=>{
        firstInputs=await readInputs();
        const lockHash=sha(await readFile(join(repo,'pnpm-lock.yaml'))),fileHash=sha(await readFile(join(repo,'deploy/Authorization.Containerfile')));
        if(firstInputs.receipt.source?.lockSha256!==lockHash||firstInputs.receipt.source?.containerfileSha256!==fileHash)deny('R3_BUILD_INPUT_CHANGED');
        await save('input-hashes.json',{hashes:firstInputs.hashes,recordedInThisRun:true,historicalHashAttestation:false});
        return {...firstInputs,images:JSON.parse(await docker('tag')),identityImages:JSON.parse(await docker('identity'))};
      },
      probe:async imageId=>{if(imageId!==R2_ARTIFACT.imageId)deny('R3_RETAINED_IMAGE_MISMATCH');probeStarted=true;return JSON.parse((await docker('probe')).trim());},
      postflight:async()=>{
        if(JSON.stringify(await source())!==JSON.stringify(firstSource))deny('R3_BUILD_INPUT_CHANGED');
        if(JSON.stringify(await context())!==JSON.stringify(firstContext))deny('R3_CONTEXT_CHANGED');
        const current=await readInputs();if(JSON.stringify(current.hashes)!==JSON.stringify(firstInputs.hashes))deny('R3_INPUT_CHANGED');
        for(const op of ['tag','identity']){
          const artifact=verifyAuthorizationArtifact({exitCode:current.buildProcess.code,revision:R2_ARTIFACT.buildRevision,tag:R2_ARTIFACT.tag,
            iid:current.iid,metadata:current.metadata,images:JSON.parse(await docker(op))});
          if(artifact.imageId!==R2_ARTIFACT.imageId)deny('R3_RETAINED_IMAGE_MISMATCH');
        }
      }
    });
    result.verifierRevision=opts['verifier-revision'];result.inputPermissionsVerified=true;
    result.context={name:opts.context,local:true};result.applicationBuildInputsUnchanged=true;
  }catch(error){result={passed:false,failedStage:stage,category:revalidationFailure(error),rawErrorSuppressed:true};}
  finally{
    if(probeStarted){
      try{
        let ids=(await docker('probe-list')).trim();
        if(ids){
          const own=JSON.parse(await docker('probe-inspect'))[0];
          if(own.Config?.Labels?.['wepuu.run']!==nonce)deny('R3_PROBE_CLEANUP_FAILED');
          if(own.State.Running)await docker('probe-stop');
          ids=(await docker('probe-list')).trim();
          if(ids&&(JSON.parse(await docker('probe-inspect'))[0].State.Running!==false))deny('R3_PROBE_CLEANUP_FAILED');
        }
        result.probeStopped=true;
      }catch{result.passed=false;result.cleanup='R3_PROBE_CLEANUP_FAILED';}
    }
    result.stageSequence=stages;result.startedUtc=startedUtc;result.finishedUtc=new Date().toISOString();result.elapsedMs=Math.round(performance.now()-started);
    result.dockerOperations=operations;result.evidenceDirectory=directory;result.imageRebuilt=false;result.registryPulled=false;
    result.databaseStarted=false;result.authorizationServiceStarted=false;result.oauthExecuted=false;result.mcpCalled=false;
    result.hostedCiTriggered=false;result.productionAccessed=false;result.automaticRetryPerformed=false;
    await save('result.json',result);
  }
  console.log(JSON.stringify(result));if(!result.passed)process.exitCode=1;
}
try{await main();}catch(error){console.log(JSON.stringify({passed:false,category:revalidationFailure(error),rawErrorSuppressed:true,productionAccessed:false}));process.exitCode=1;}
