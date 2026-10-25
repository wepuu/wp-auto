// Single diagnostic-only continuation of the exact R28 command.
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,readFile,writeFile,lstat,statfs} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {checkWindowsEvidenceAcl} from './local-evidence-acl.mjs';
import {verifyDiskBudget,verifyIntegrationContext,verifyIntegrationImage} from './persistent-image-contract.mjs';
const image='sha256:ecb2b146182ef5ca756c1b5893ecfbf773bd6bd1b43be275670e54eddfda239c',revision='c404ed52228ce5492a85674547998d2f5d31772e';
const run='r29-'+new Date().toISOString().replace(/[^0-9]/gu,''),name='wepuu-'+run,root=process.cwd(),env={...process.env};
for(const k of ['DOCKER_HOST','DOCKER_CONTEXT','DOCKER_TLS_VERIFY','BUILDX_BUILDER','BUILDKIT_HOST','NODE_OPTIONS','GIT_DIR','GIT_WORK_TREE','GIT_INDEX_FILE'])delete env[k];
const exec=promisify(execFile),invoke=(exe,args,timeout=15000)=>exec(exe,args,{cwd:root,env,timeout,windowsHide:true,shell:false,maxBuffer:1048576});
const d=(args,timeout)=>invoke('C:\\Users\\liulo\\AppData\\Local\\Programs\\DockerDesktop\\resources\\bin\\docker.exe',['--context','desktop-linux',...args],timeout);
const json=async args=>JSON.parse((await d(args)).stdout),hash=v=>createHash('sha256').update(v).digest('hex');
const locked={
 'packages/database/src/index.ts':'f27582998d85485c51124b0c5e501fe30fde2e664399b2f68a1ef5ca7a5f7708',
 'packages/database/test/authorization-consume-mapping.test.ts':'3fadc4c2d42d4a74cd76d6f28f8753951c5815269bf946a34bc4ea043f04fa16'
};
const fixed=[...Object.keys(locked),'packages/database/test/tsconfig.json','tsconfig.base.json'];
const inputs=[...fixed,'test/persistent-authorization/r29/diagnostics.mjs','test/persistent-authorization/r29/worker.mjs','scripts/r29-diagnostics.synthetic.mjs','scripts/run-r29-typecheck.mjs'];
const hashes=async()=>{const rows=[];for(const f of inputs){const s=await lstat(f);if(!s.isFile()||s.isSymbolicLink())throw Error('UNSAFE_INPUT');rows.push([f,hash(await readFile(f))]);}return Object.fromEntries(rows);};
let created=false,directory;const result={run,passed:false,startedUtc:new Date().toISOString(),containerAttempts:0,productionAccessed:false,servicesStarted:false,candidateBuilt:false,rawOutputSuppressed:true};
try{
 if((await invoke('git',['status','--porcelain'])).stdout!=='')throw Error('SOURCE_NOT_CLEAN');
 result.sourceHead=(await invoke('git',['rev-parse','HEAD'])).stdout.trim();result.inputHashes=await hashes();
 for(const [f,expected]of Object.entries(locked))if(result.inputHashes[f]!==expected)throw Error('R28_INPUT_CHANGED');
 if((await invoke('git',['diff','--name-only','c83accd','--',...fixed])).stdout.trim())throw Error('R28_INPUT_CHANGED');
 const s=await statfs(root);result.diskBefore=verifyDiskBudget(s.bavail*s.bsize,true);
 verifyIntegrationContext(await json(['context','inspect','desktop-linux']),'desktop-linux');result.image=verifyIntegrationImage(await json(['image','inspect',image]),image,'test',revision);
 directory=await mkdtemp(path.join(tmpdir(),'wepuu-r29-typecheck-'));const who=(await invoke('whoami',[])).stdout.trim();
 await invoke('icacls.exe',[directory,'/inheritance:r','/grant:r',who+':(OI)(CI)F','*S-1-5-18:(OI)(CI)F','*S-1-5-32-544:(OI)(CI)F']);
 if(!(await checkWindowsEvidenceAcl(directory,[])).verified)throw Error('EVIDENCE_NOT_PRIVATE');
 const expected=path.join(directory,'inputs.json');await writeFile(expected,JSON.stringify(Object.fromEntries(fixed.map(f=>[f,result.inputHashes[f]]))),{flag:'wx',mode:0o600});
 if(!(await checkWindowsEvidenceAcl(directory,['inputs.json'])).verified)throw Error('EVIDENCE_NOT_PRIVATE');
 await d(['create','--name',name,'--label','wepuu.run='+run,'--label','wepuu.phase=r29-typecheck','--pull=never','--network','none','--user','0:0',
  '--no-healthcheck','--cap-drop','ALL','--security-opt','no-new-privileges','--log-driver','none',
  ...Object.keys(locked).flatMap(f=>['--mount',`type=bind,source=${path.resolve(f)},target=/workspace/${f},readonly`]),
  '--mount',`type=bind,source=${expected},target=/inputs.json,readonly`,
  '--mount',`type=bind,source=${path.resolve('test/persistent-authorization/r29')},target=/harness,readonly`,image,'node','/harness/worker.mjs']);created=true;
 result.containerAttempts=1;let output;try{output=(await d(['start','-a',name],240000)).stdout;}catch(e){output=e.stdout;}
 result.evidence=JSON.parse(output.trim());result.passed=result.evidence.passed===true;
}catch(e){result.passed=false;result.category=['SOURCE_NOT_CLEAN','R28_INPUT_CHANGED','UNSAFE_INPUT','EVIDENCE_NOT_PRIVATE'].includes(e.message)?e.message:e.killed?'TRANSPORT_TIMEOUT':'DIAGNOSTIC_GATE_NOT_CONFIRMED';}
finally{
 if(created){try{let c=(await json(['inspect',name]))[0];if(c.Name!=='/'+name||c.Config.Labels?.['wepuu.run']!==run||c.Config.Labels?.['wepuu.phase']!=='r29-typecheck')throw Error();
  if(c.State.Running){await d(['stop','--time','10',name],20000);c=(await json(['inspect',name]))[0];}
  result.cleanup={stopped:c.State.Running===false,exitCode:c.State.ExitCode,oomKilled:c.State.OOMKilled===true};
  if(!result.cleanup.stopped||result.cleanup.exitCode!==0||result.cleanup.oomKilled)result.passed=false;
 }catch{result.passed=false;result.cleanup={confirmed:false};}}
 try{result.inputsUnchanged=JSON.stringify(await hashes())===JSON.stringify(result.inputHashes)&&(await invoke('git',['status','--porcelain'])).stdout==='';if(!result.inputsUnchanged)result.passed=false;
  const s=await statfs(root);result.diskAfter=verifyDiskBudget(s.bavail*s.bsize);
 }catch{result.passed=false;}
 result.finishedUtc=new Date().toISOString();
 if(directory){try{await writeFile(path.join(directory,'result.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});
  if(!(await checkWindowsEvidenceAcl(directory,['result.json'])).verified)throw Error();result.evidenceSaved=true;result.evidenceDirectory=directory;
 }catch{result.evidenceSaved=false;result.passed=false;}}
}
console.log(JSON.stringify(result));if(!result.passed)process.exitCode=1;
