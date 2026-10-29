import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,readFile,writeFile,statfs} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {checkWindowsEvidenceAcl} from './local-evidence-acl.mjs';
import {verifyDiskBudget,verifyIntegrationContext,verifyIntegrationImage} from './persistent-image-contract.mjs';
const image='sha256:ecb2b146182ef5ca756c1b5893ecfbf773bd6bd1b43be275670e54eddfda239c',revision='c404ed52228ce5492a85674547998d2f5d31772e';
const run='r28-focused-'+new Date().toISOString().replace(/[^0-9]/gu,''),name='wepuu-'+run,exec=promisify(execFile),root=process.cwd(),env={...process.env};
for(const k of ['DOCKER_HOST','DOCKER_CONTEXT','DOCKER_TLS_VERIFY','BUILDX_BUILDER','BUILDKIT_HOST','NODE_OPTIONS'])delete env[k];
const invoke=(exe,args,timeout=15000)=>exec(exe,args,{cwd:root,env,timeout,windowsHide:true,shell:false,maxBuffer:1048576});
const d=(args,timeout)=>invoke('C:\\Users\\liulo\\AppData\\Local\\Programs\\DockerDesktop\\resources\\bin\\docker.exe',['--context','desktop-linux',...args],timeout);
const json=async args=>JSON.parse((await d(args)).stdout),hash=v=>createHash('sha256').update(v).digest('hex');
const inputs=['packages/database/src/index.ts','packages/database/test/authorization-consume-mapping.test.ts','test/persistent-authorization/r28/focused.mjs','scripts/run-r28-focused.mjs'];
const hashes=async()=>Object.fromEntries(await Promise.all(inputs.map(async f=>[f,hash(await readFile(f))])));
let created=false,directory;const result={run,passed:false,startedUtc:new Date().toISOString(),attempts:0,productionAccessed:false,servicesStarted:false,rawOutputSuppressed:true};
try{
 if((await invoke('git',['status','--porcelain'])).stdout!=='')throw Error();
 result.sourceHead=(await invoke('git',['rev-parse','HEAD'])).stdout.trim();result.inputHashes=await hashes();
 const s=await statfs(root);result.disk=verifyDiskBudget(s.bavail*s.bsize,true);
 verifyIntegrationContext(await json(['context','inspect','desktop-linux']),'desktop-linux');result.image=verifyIntegrationImage(await json(['image','inspect',image]),image,'test',revision);
 directory=await mkdtemp(path.join(tmpdir(),'wepuu-r28-focused-'));const who=(await invoke('whoami',[])).stdout.trim();
 await invoke('icacls.exe',[directory,'/inheritance:r','/grant:r',who+':(OI)(CI)F','*S-1-5-18:(OI)(CI)F','*S-1-5-32-544:(OI)(CI)F']);
 if(!(await checkWindowsEvidenceAcl(directory,[])).verified)throw Error();
 // Only this disposable compiler container has a writable root. It has no
 // credentials, network, host write mounts or capabilities; services stay UID1000.
 await d(['create','--name',name,'--label','wepuu.run='+run,'--label','wepuu.phase=r28-focused','--pull=never','--network','none','--user','0:0',
  '--no-healthcheck','--cap-drop','ALL','--security-opt','no-new-privileges','--log-driver','none',
  '--mount',`type=bind,source=${path.resolve(inputs[0])},target=/workspace/${inputs[0]},readonly`,
  '--mount',`type=bind,source=${path.resolve(inputs[1])},target=/workspace/${inputs[1]},readonly`,
  '--mount',`type=bind,source=${path.resolve('test/persistent-authorization')},target=/harness,readonly`,image,'node','/harness/r28/focused.mjs']);created=true;
 result.attempts=1;let output;try{output=(await d(['start','-a',name],300000)).stdout;}catch(e){output=e.stdout;}
 result.evidence=JSON.parse(output.trim());result.passed=result.evidence.passed===true;
}catch(e){result.passed=false;result.category=e.killed?'TIMEOUT':'FOCUSED_GATE_NOT_CONFIRMED';}
finally{
 if(created){try{let c=(await json(['inspect',name]))[0];if(c.Name!=='/'+name||c.Config.Labels?.['wepuu.run']!==run)throw Error();
  if(c.State.Running){await d(['stop','--time','10',name],20000);c=(await json(['inspect',name]))[0];}
  result.cleanup={stopped:c.State.Running===false,exitCode:c.State.ExitCode,oomKilled:c.State.OOMKilled===true};
  if(!result.cleanup.stopped||result.cleanup.exitCode!==0||result.cleanup.oomKilled)result.passed=false;
 }catch{result.passed=false;result.cleanup={confirmed:false};}}
 result.inputsUnchanged=JSON.stringify(await hashes())===JSON.stringify(result.inputHashes);if(!result.inputsUnchanged)result.passed=false;
 result.finishedUtc=new Date().toISOString();
 if(directory){try{await writeFile(path.join(directory,'result.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});
  if(!(await checkWindowsEvidenceAcl(directory,['result.json'])).verified)throw Error();result.evidenceSaved=true;result.evidenceDirectory=directory;
 }catch{result.evidenceSaved=false;result.passed=false;}}
}
console.log(JSON.stringify(result));if(!result.passed)process.exitCode=1;
