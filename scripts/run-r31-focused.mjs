import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,readFile,writeFile,statfs} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {baseline,verifyBaseline,sha} from '../test/persistent-authorization/r30/inputs.mjs';
import {checkWindowsEvidenceAcl} from './local-evidence-acl.mjs';
import {verifyDiskBudget,verifyIntegrationContext,verifyIntegrationImage} from './persistent-image-contract.mjs';
const image='sha256:ecb2b146182ef5ca756c1b5893ecfbf773bd6bd1b43be275670e54eddfda239c',revision='c404ed52228ce5492a85674547998d2f5d31772e';
const run='r33-'+new Date().toISOString().replace(/[^0-9]/gu,''),name='wepuu-'+run,root=process.cwd(),env={...process.env};
for(const k of ['DOCKER_HOST','DOCKER_CONTEXT','DOCKER_TLS_VERIFY','BUILDX_BUILDER','BUILDKIT_HOST','NODE_OPTIONS','GIT_DIR','GIT_WORK_TREE','GIT_INDEX_FILE'])delete env[k];
const exec=promisify(execFile),invoke=(exe,args,timeout=15000)=>exec(exe,args,{cwd:root,env,timeout,windowsHide:true,shell:false,maxBuffer:2097152});
const d=(args,timeout)=>invoke('C:\\Users\\liulo\\AppData\\Local\\Programs\\DockerDesktop\\resources\\bin\\docker.exe',['--context','desktop-linux',...args],timeout),json=async args=>JSON.parse((await d(args)).stdout);
const tools=['test/persistent-authorization/r30/inputs.mjs','test/persistent-authorization/r29/diagnostics.mjs','test/persistent-authorization/r31/worker.mjs','test/persistent-authorization/r31/results.mjs','test/persistent-authorization/r31/reporter.mjs','test/persistent-authorization/r31/synthetic-child.mjs','scripts/run-r31-focused.mjs','scripts/r31-focused.synthetic.mjs','eslint.config.mjs'];
const toolHashes=async()=>Object.fromEntries(await Promise.all(tools.map(async f=>[f,sha(await readFile(f))])));
let created=false,directory,expected;const result={run,passed:false,startedUtc:new Date().toISOString(),containerAttempts:0,productionAccessed:false,servicesStarted:false,candidateBuilt:false,rawOutputSuppressed:true};
try{
 if((await invoke('git',['status','--porcelain'])).stdout!=='')throw Error('SOURCE_NOT_CLEAN');
 const changed=(await invoke('git',['diff','--name-only','290e6da','--','apps','packages','package.json','pnpm-lock.yaml','pnpm-workspace.yaml','.npmrc','tsconfig.base.json','tsconfig.json'])).stdout.trim().split(/\r?\n/u).filter(Boolean);
 if(JSON.stringify(changed)!==JSON.stringify(['packages/database/test/tsconfig.consume-mapping.json']))throw Error('SOURCE_CHANGED');
 if(sha(await readFile('packages/database/src/index.ts'))!=='f27582998d85485c51124b0c5e501fe30fde2e664399b2f68a1ef5ca7a5f7708'||sha(await readFile('packages/database/test/authorization-consume-mapping.test.ts'))!=='3fadc4c2d42d4a74cd76d6f28f8753951c5815269bf946a34bc4ea043f04fa16')throw Error('SOURCE_CHANGED');
 result.sourceHead=(await invoke('git',['rev-parse','HEAD'])).stdout.trim();result.toolHashes=await toolHashes();
 const tracked=(await invoke('git',['ls-files','-z','--','apps','packages','package.json','pnpm-lock.yaml','pnpm-workspace.yaml','.npmrc','tsconfig.base.json','tsconfig.json'])).stdout.split('\0').filter(Boolean);
 expected=await baseline(root,tracked);result.baseline=await verifyBaseline(root,expected);
 const before=await statfs(root);result.diskBefore=verifyDiskBudget(before.bavail*before.bsize,true);
 verifyIntegrationContext(await json(['context','inspect','desktop-linux']),'desktop-linux');result.image=verifyIntegrationImage(await json(['image','inspect',image]),image,'test',revision);
 directory=await mkdtemp(path.join(tmpdir(),'wepuu-r33-focused-'));const who=(await invoke('whoami',[])).stdout.trim();
 await invoke('icacls.exe',[directory,'/inheritance:r','/grant:r',who+':(OI)(CI)F','*S-1-5-18:(OI)(CI)F','*S-1-5-32-544:(OI)(CI)F']);
 if(!(await checkWindowsEvidenceAcl(directory,[])).verified)throw Error('EVIDENCE_NOT_PRIVATE');
 const inputFile=path.join(directory,'inputs.json');await writeFile(inputFile,JSON.stringify(expected),{flag:'wx',mode:0o600});
 if(!(await checkWindowsEvidenceAcl(directory,['inputs.json'])).verified)throw Error('EVIDENCE_NOT_PRIVATE');
 await d(['create','--name',name,'--label','wepuu.run='+run,'--label','wepuu.phase=r33-focused','--pull=never','--network','none','--user','0:0',
  '--no-healthcheck','--cap-drop','ALL','--security-opt','no-new-privileges','--log-driver','none',
  ...expected.directories.flatMap(dir=>['--mount',`type=bind,source=${path.resolve(dir)},target=/workspace/${dir},readonly`]),
  '--mount',`type=bind,source=${path.resolve('eslint.config.mjs')},target=/workspace/eslint.config.mjs,readonly`,
  '--mount',`type=bind,source=${inputFile},target=/inputs.json,readonly`,
  '--mount',`type=bind,source=${path.resolve('test/persistent-authorization')},target=/harness,readonly`,image,'node','/harness/r31/worker.mjs']);created=true;
 result.containerAttempts=1;let output;try{output=(await d(['start','-a',name],330000)).stdout;}catch(e){output=e.stdout;}
 result.evidence=JSON.parse(output.trim());result.passed=result.evidence.passed===true;
}catch(e){result.passed=false;result.category=['SOURCE_NOT_CLEAN','SOURCE_CHANGED','EVIDENCE_NOT_PRIVATE'].includes(e.message)?e.message:e.killed?'TRANSPORT_TIMEOUT':'FOCUSED_GATE_NOT_CONFIRMED';}
finally{
 if(created){try{let c=(await json(['inspect',name]))[0];if(c.Name!=='/'+name||c.Config.Labels?.['wepuu.run']!==run||c.Config.Labels?.['wepuu.phase']!=='r33-focused')throw Error();
  if(c.State.Running){await d(['stop','--time','10',name],20000);c=(await json(['inspect',name]))[0];}
  result.cleanup={stopped:c.State.Running===false,exitCode:c.State.ExitCode,oomKilled:c.State.OOMKilled===true};if(!result.cleanup.stopped||result.cleanup.oomKilled)result.passed=false;
 }catch{result.passed=false;result.cleanup={confirmed:false};}}
 try{if(expected)result.inputsUnchanged=JSON.stringify(await verifyBaseline(root,expected))===JSON.stringify(result.baseline)&&JSON.stringify(await toolHashes())===JSON.stringify(result.toolHashes)&&(await invoke('git',['status','--porcelain'])).stdout==='';
  if(!result.inputsUnchanged)result.passed=false;const s=await statfs(root);result.diskAfter=verifyDiskBudget(s.bavail*s.bsize);
 }catch{result.passed=false;}
 result.finishedUtc=new Date().toISOString();
 if(directory){try{await writeFile(path.join(directory,'result.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});if(!(await checkWindowsEvidenceAcl(directory,['result.json'])).verified)throw Error();result.evidenceSaved=true;result.evidenceDirectory=directory;}catch{result.evidenceSaved=false;result.passed=false;}}
}
console.log(JSON.stringify(result));if(!result.passed)process.exitCode=1;
