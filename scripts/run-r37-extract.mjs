// One network-none read-only export of existing R36 files; no app/DB request.
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {checkWindowsEvidenceAcl} from './local-evidence-acl.mjs';
import {verifyIntegrationContext,verifyIntegrationImage} from './persistent-image-contract.mjs';
const image='sha256:e4212dd53144d8006a431b027da85266e9f7d0bd7a7431a68701b73367fd14bb',revision='1df4c857e667398ac71487f352fc3daa7ddbac8a';
const historicalRun='r36-20261025101227538',volume='wepuu-'+historicalRun+'-evidence',oldMatrix='wepuu-'+historicalRun+'-matrix';
const historicalPath='C:\\Users\\liulo\\AppData\\Local\\Temp\\wepuu-r36-ab-ogAZFb\\result.json';
const hash=b=>createHash('sha256').update(b).digest('hex'),run='r37-'+new Date().toISOString().replace(/\D/gu,''),name='wepuu-'+run+'-extract',root=process.cwd(),env={...process.env};
for(const k of ['DOCKER_HOST','DOCKER_CONTEXT','DOCKER_TLS_VERIFY','BUILDX_BUILDER','BUILDKIT_HOST','GIT_DIR','GIT_WORK_TREE','GIT_INDEX_FILE','NODE_OPTIONS'])delete env[k];
const exec=promisify(execFile),invoke=(exe,args,t=15000)=>exec(exe,args,{cwd:root,env,windowsHide:true,shell:false,timeout:t,maxBuffer:262144});
const d=(args,t)=>invoke('C:\\Users\\liulo\\AppData\\Local\\Programs\\DockerDesktop\\resources\\bin\\docker.exe',['--context','desktop-linux',...args],t),json=async args=>JSON.parse((await d(args)).stdout);
const tools=['scripts/run-r37-extract.mjs','scripts/r37-report.synthetic.mjs','test/persistent-authorization/r37/report.mjs','test/persistent-authorization/r37/missing-rt.mjs','test/persistent-authorization/r37/scenario-source.mjs','test/persistent-authorization/r37/extract.mjs',
 'test/persistent-authorization/r8/integration.mjs','test/persistent-authorization/r22/report.mjs','test/persistent-authorization/driver.mjs','scripts/local-evidence-acl.mjs','scripts/persistent-image-contract.mjs'];
const hashes=async()=>Object.fromEntries(await Promise.all(tools.map(async f=>[f,hash(await readFile(f))])));
const result={run,passed:false,startedUtc:new Date().toISOString(),exporterAttempts:0,databaseStarted:false,databaseAccessed:false,protocolRequestsSent:0,productionAccessed:false,rawOutputSuppressed:true};let directory,created=false;
try{
 if((await invoke('git',['status','--porcelain'])).stdout!=='')throw Error();result.sourceHead=(await invoke('git',['rev-parse','HEAD'])).stdout.trim();result.inputHashes=await hashes();
 if((await invoke('git',['diff','--name-only','5b05f47','--','apps','packages','deploy','package.json','pnpm-lock.yaml','pnpm-workspace.yaml','.npmrc','tsconfig.base.json','tsconfig.json','test/persistent-authorization/r8','test/persistent-authorization/r22','test/persistent-authorization/driver.mjs'])).stdout.trim())throw Error();
 const historical=await readFile(historicalPath);if(hash(historical)!=='71673530ba5b7b3edbfc9c99fc79c845c77dae6d0ce24551ae46bb7518649ede'||JSON.parse(historical).run!==historicalRun)throw Error();result.historicalReceiptVerified=true;
 verifyIntegrationContext(await json(['context','inspect','desktop-linux']),'desktop-linux');verifyIntegrationImage(await json(['image','inspect',image]),image,'authorization',revision);
 const v=(await json(['volume','inspect',volume]))[0],old=(await json(['inspect',oldMatrix]))[0];
 if(v.Name!==volume||v.Driver!=='local'||v.Labels?.['wepuu.run']!==historicalRun||v.Labels?.['wepuu.phase']!=='r36-ab'||old.Name!=='/'+oldMatrix||old.Config.Labels?.['wepuu.run']!==historicalRun||old.State.Running!==false)throw Error();
 directory=await mkdtemp(path.join(tmpdir(),'wepuu-r37-extract-'));const who=(await invoke('whoami',[])).stdout.trim();await invoke('icacls.exe',[directory,'/inheritance:r','/grant:r',who+':(OI)(CI)F','*S-1-5-18:(OI)(CI)F','*S-1-5-32-544:(OI)(CI)F']);if(!(await checkWindowsEvidenceAcl(directory,[])).verified)throw Error();
 await d(['create','--name',name,'--label','wepuu.run='+run,'--label','wepuu.phase=r37-extract','--pull=never','--network','none','--read-only','--user','1000:1000','--no-healthcheck','--cap-drop','ALL','--security-opt','no-new-privileges','--log-driver','none','--pids-limit','64','--memory','128m',
  '--mount',`type=volume,source=${volume},target=/evidence,readonly`,'--mount',`type=bind,source=${path.resolve('test/persistent-authorization')},target=/harness,readonly`,image,'node','/harness/r37/extract.mjs']);created=true;result.exporterAttempts=1;
 const meta=(await json(['inspect',name]))[0];if(meta.HostConfig.NetworkMode!=='none'||!meta.HostConfig.ReadonlyRootfs||meta.Config.User!=='1000:1000'||meta.Mounts.length!==2||meta.Mounts.some(m=>m.RW!==false))throw Error();
 result.readonlyNetworkNoneVerified=true;let output;try{output=(await d(['start','-a',name],30000)).stdout;}catch(e){output=e.stdout;}
 result.evidence=JSON.parse(output.trim());result.passed=result.evidence.passed===true;
}catch(e){result.passed=false;result.category=e.killed?'EXTRACTION_TIMEOUT':'R37_EXTRACTION_GATE_NOT_CONFIRMED';}
finally{
 if(created){try{let c=(await json(['inspect',name]))[0];if(c.Name!=='/'+name||c.Config.Labels?.['wepuu.run']!==run||c.Config.Labels?.['wepuu.phase']!=='r37-extract')throw Error();if(c.State.Running){await d(['stop','--time','10',name]);c=(await json(['inspect',name]))[0];}
  result.cleanup={stopped:c.State.Running===false,exitCode:c.State.ExitCode,oomKilled:c.State.OOMKilled===true};if(!result.cleanup.stopped||result.cleanup.exitCode!==0||result.cleanup.oomKilled)result.passed=false;
 }catch{result.cleanup={confirmed:false};result.passed=false;}}
 try{result.inputsUnchanged=JSON.stringify(await hashes())===JSON.stringify(result.inputHashes)&&hash(await readFile(historicalPath))==='71673530ba5b7b3edbfc9c99fc79c845c77dae6d0ce24551ae46bb7518649ede'&&(await invoke('git',['status','--porcelain'])).stdout==='';if(!result.inputsUnchanged)result.passed=false;}catch{result.inputsUnchanged=false;result.passed=false;}
 result.finishedUtc=new Date().toISOString();if(directory){try{await writeFile(path.join(directory,'result.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});if(!(await checkWindowsEvidenceAcl(directory,['result.json'])).verified)throw Error();result.evidenceSaved=true;result.evidenceDirectory=directory;}catch{result.passed=false;result.evidenceSaved=false;}}
}
console.log(JSON.stringify(result));if(!result.passed)process.exitCode=1;
