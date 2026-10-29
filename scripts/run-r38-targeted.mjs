// R38 only: fixed candidate, normal refresh then one missing-link diagnostic.
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFile,readdir,lstat,mkdtemp,writeFile,statfs} from 'node:fs/promises';
import {createHash,randomBytes} from 'node:crypto';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {images} from './run-r35-ab.mjs';
import {fixtures} from './run-r21-database.mjs';
import {checkWindowsEvidenceAcl} from './local-evidence-acl.mjs';
import {compiledIdentityCode,verifyCompiledIdentity,verifyIntegrationImage,verifyIntegrationContext,verifyDiskBudget} from './persistent-image-contract.mjs';
import {expectedLedger} from '../packages/database/test/r17-migration-evidence.mjs';
import {lastResult} from '../test/persistent-authorization/r22/report.mjs';
import {projectDriver,verifyDriver} from '../test/persistent-authorization/r38/report.mjs';
import {buildScenario,buildDriver} from '../test/persistent-authorization/r38/scenario-source.mjs';
const PG='postgres@sha256:721873c34ceb9f8d8fc265984940dc982404c105f19ad51be9fdc5970a6080ea';
const sha=v=>createHash('sha256').update(v).digest('hex');
const deny=code=>{throw Object.assign(Error('R38_STOP'),{code});};
async function tree(dir){const out=[];for(const e of await readdir(dir,{withFileTypes:true})){const p=dir+'/'+e.name;if(e.isSymbolicLink())deny('INPUT_UNSAFE');if(e.isDirectory())out.push(...await tree(p));else if(e.isFile())out.push(p);}return out.sort();}
export function owned(c,name,run){if(c?.Name!=='/'+name||c.Config?.Labels?.['wepuu.run']!==run||c.Config?.Labels?.['wepuu.phase']!=='r38-targeted')deny('OWNERSHIP_NOT_CONFIRMED');return{name,stopped:c.State.Running===false,exitCode:c.State.ExitCode,oomKilled:c.State.OOMKilled===true};}
export async function main(){
 const root=process.cwd(),run='r38-'+new Date().toISOString().replace(/[^0-9]/gu,''),prefix='wepuu-'+run;
 const env={...process.env};for(const k of ['DOCKER_HOST','DOCKER_CONTEXT','DOCKER_TLS_VERIFY','BUILDX_BUILDER','BUILDKIT_HOST','GIT_DIR','GIT_WORK_TREE','GIT_INDEX_FILE','NODE_OPTIONS'])delete env[k];
 const exec=promisify(execFile),invoke=(exe,args,timeout=15000)=>exec(exe,args,{cwd:root,env,windowsHide:true,shell:false,timeout,maxBuffer:2*1024**2});
 const d=(args,timeout)=>invoke('C:\\Users\\liulo\\AppData\\Local\\Programs\\DockerDesktop\\resources\\bin\\docker.exe',['--context','desktop-linux',...args],timeout);
 const json=async args=>JSON.parse((await d(args)).stdout);
 const result={run,passed:false,startedUtc:new Date().toISOString(),stage:'source',targetedAttempts:0,productionAccessed:false,realEmailSent:false,desktopOAuthPerformed:false,mcpCalled:false,
  fullMatrixExecuted:false,transitionExecuted:false,applicationChanged:false,imageRebuilt:false,automaticRetryPerformed:false,cleanup:[],resources:[],rawOutputSuppressed:true};
 const created=[];let directory,files,ledger;const REV='1df4c857e667398ac71487f352fc3daa7ddbac8a';
 const began=performance.now(),labels=['--label','wepuu.run='+run,'--label','wepuu.phase=r38-targeted'];
 const base=['--pull=never','--read-only','--no-healthcheck','--cap-drop','ALL','--security-opt','no-new-privileges','--log-driver','none','--tmpfs','/tmp:rw,noexec,nosuid,size=64m'];
 const create=async(name,args)=>{await d(['create','--name',name,...labels,...args]);created.push(name);};
 const stop=async name=>{let c=(await json(['inspect',name]))[0];owned(c,name,run);if(c.State.Running){await d(['stop','--time','10',name],20000);c=(await json(['inspect',name]))[0];}
  const r=owned(c,name,run),i=result.cleanup.findIndex(x=>x.name===name);if(i<0)result.cleanup.push(r);else result.cleanup[i]=r;if(!r.stopped||r.oomKilled||r.exitCode!==0)deny('OWNED_PROCESS_FAILED');};
 const hashes=async()=>{const o={};for(const f of files){const s=await lstat(f);if(!s.isFile()||s.isSymbolicLink())deny('INPUT_UNSAFE');o[f]=sha(await readFile(f));}return o;};
 const disk=async initial=>{const s=await statfs(root);(result.diskSamples??=[]).push({stage:result.stage,...verifyDiskBudget(s.bavail*s.bsize,initial)});};
 try{
  if((await invoke('git',['status','--porcelain'])).stdout!=='')deny('SOURCE_NOT_CLEAN');
  result.sourceHead=(await invoke('git',['rev-parse','HEAD'])).stdout.trim();
  const changed=(await invoke('git',['diff','--name-only','7f68133','--','apps','packages','package.json','pnpm-lock.yaml','pnpm-workspace.yaml','.npmrc','tsconfig.base.json','tsconfig.json'])).stdout.trim().split(/\r?\n/u).filter(Boolean);
  if(changed.length)deny('APP_SOURCE_CHANGED');
  if((await invoke('git',['diff','--name-only','ab29f07','--','test/persistent-authorization/r8','test/persistent-authorization/driver.mjs','test/persistent-authorization/r22','scripts/run-r22-services.mjs'])).stdout.trim())deny('BASE_HELPERS_CHANGED');
  files=[...await tree('test/persistent-authorization'),...fixtures,...await tree('packages/database/migrations'),'scripts/run-r38-targeted.mjs','scripts/r38-targeted.synthetic.mjs','test/persistent-authorization/driver.mjs','scripts/local-evidence-acl.mjs','scripts/persistent-image-contract.mjs'];
  result.inputHashes=await hashes();await disk(true);
  const scenario=buildScenario(await readFile('test/persistent-authorization/r8/integration.mjs'));result.scenarioSha256=sha(scenario);
  result.stage='identities';verifyIntegrationContext(await json(['context','inspect','desktop-linux']),'desktop-linux');
  result.images=[];for(const role of Object.keys(images))result.images.push(verifyIntegrationImage(await json(['image','inspect',images[role]]),images[role],role,REV));
  const pg=(await json(['image','inspect',PG]))[0];if(pg.Id!==PG.slice(9)||pg.Os!=='linux'||pg.Architecture!=='amd64'||!pg.Config.Env.includes('PG_MAJOR=16'))deny('POSTGRES_IDENTITY_MISMATCH');
  directory=await mkdtemp(path.join(tmpdir(),'wepuu-r38-targeted-'));const who=(await invoke('whoami',[])).stdout.trim();
  await invoke('icacls.exe',[directory,'/inheritance:r','/grant:r',who+':(OI)(CI)F','*S-1-5-18:(OI)(CI)F','*S-1-5-32-544:(OI)(CI)F']);
  if(!(await checkWindowsEvidenceAcl(directory,[])).verified)deny('EVIDENCE_NOT_PRIVATE');
  const scenarioFile=path.join(directory,'scenario.mjs'),driverFile=path.join(directory,'driver.mjs');await writeFile(scenarioFile,scenario,{flag:'wx',mode:0o600});const driver=buildDriver(await readFile('test/persistent-authorization/driver.mjs'));result.driverSha256=sha(driver);await writeFile(driverFile,driver,{flag:'wx',mode:0o600});
  result.stage='compiled_identity';const probes=[];
  for(const role of Object.keys(images)){const name=prefix+'-probe-'+role;await create(name,[...base,'--network','none','--user','1000:1000',images[role],'node','-e',compiledIdentityCode]);probes.push(JSON.parse((await d(['start','-a',name],30000)).stdout));await stop(name);}
  result.compiled=verifyCompiledIdentity(probes);if(result.compiled.sha256!=='260d561e07cc1bf4a970f9a05de8759b344e0fbea53d27aa73ab88f3c9d77691'||result.compiled.fileCount!==163)deny('COMPILED_INPUT_MISMATCH');
  result.stage='isolation';await disk(false);
  const cfg={host:'127.0.0.1',port:5432,database:'postgres',user:'postgres',password:randomBytes(32).toString('hex')};
  const seed=path.join(directory,'postgres.private.json'),pgEnv=path.join(directory,'postgres.private.env');
  await writeFile(seed,JSON.stringify(cfg),{flag:'wx',mode:0o600});await writeFile(pgEnv,'POSTGRES_USER=postgres\nPOSTGRES_DB=postgres\nPOSTGRES_PASSWORD='+cfg.password+'\n',{flag:'wx',mode:0o600});
  if(!(await checkWindowsEvidenceAcl(directory,['scenario.mjs','driver.mjs','postgres.private.json','postgres.private.env'])).verified)deny('EVIDENCE_NOT_PRIVATE');
  const network=prefix+'-net',data=prefix+'-data',evidence=prefix+'-evidence',pgName=prefix+'-pg';
  await d(['network','create','--internal',...labels,network]);result.resources.push({type:'network',name:network});
  for(const name of [data,evidence]){await d(['volume','create',...labels,name]);result.resources.push({type:'volume',name});}
  const seedName=prefix+'-seed';
  await create(seedName,[...base,'--network','none','--user','0:0','--cap-add','CHOWN','--mount',`type=volume,source=${evidence},target=/evidence`,'--mount',`type=bind,source=${seed},target=/seed.json,readonly`,images.test,'node','-e',"const fs=require('node:fs');fs.chmodSync('/evidence',0o700);fs.writeFileSync('/evidence/postgres.private.json',fs.readFileSync('/seed.json'),{flag:'wx',mode:0o600});for(const p of ['/evidence/postgres.private.json','/evidence'])fs.chownSync(p,1000,1000);"]);
  await d(['start','-a',seedName]);await stop(seedName);
  await create(pgName,['--pull=never','--network',network,'--env-file',pgEnv,'--mount',`type=volume,source=${data},target=/var/lib/postgresql/data`,'--log-driver','none','--security-opt','no-new-privileges',PG]);await d(['start',pgName]);
  let ready=false;for(let i=0;i<30;i++){try{await d(['exec',pgName,'pg_isready','-U','postgres'],3000);ready=true;break;}catch{await new Promise(r=>setTimeout(r,500));}}
  if(!ready)deny('POSTGRES_NOT_READY');
  const net=(await json(['network','inspect',network]))[0],p=(await json(['inspect',pgName]))[0];if(!net.Internal||net.Labels?.['wepuu.run']!==run||Object.keys(p.HostConfig.PortBindings??{}).length||p.HostConfig.NetworkMode!==network)deny('NETWORK_BOUNDARY_MISMATCH');
  result.internalNetwork=true;result.hostPortsPublished=false;ledger=await expectedLedger('candidate');
  result.stage='targeted';await disk(false);if(JSON.stringify(await hashes())!==JSON.stringify(result.inputHashes))deny('FROZEN_INPUT_CHANGED');
  const name=prefix+'-targeted';await create(name,[...base,'--user','1000:1000','--network','container:'+pgName,'--tmpfs','/private:rw,noexec,nosuid,size=64m,uid=1000,gid=1000,mode=0700',
   '--mount',`type=volume,source=${evidence},target=/evidence`,'--mount',`type=bind,source=${path.resolve('test/persistent-authorization')},target=/harness,readonly`,
   '--mount',`type=bind,source=${driverFile},target=/harness/driver.mjs,readonly`,'--mount',`type=bind,source=${scenarioFile},target=/harness/r8/integration.mjs,readonly`,images.authorization,'node','/harness/driver.mjs','matrix']);
  result.targetedAttempts=1;let output;try{output=(await d(['start','-a',name],300000)).stdout;}catch(e){output=e.stdout;}
  const raw=lastResult(output);result.evidence=projectDriver(raw);verifyDriver(raw,ledger);await stop(name);
  result.stage='postcheck';if(sha(await readFile(scenarioFile))!==result.scenarioSha256||sha(await readFile(driverFile))!==result.driverSha256)deny('GENERATED_FIXTURE_CHANGED');
  result.passed=true;
 }catch(error){result.passed=false;const safe=['SOURCE_NOT_CLEAN','APP_SOURCE_CHANGED','BASE_HELPERS_CHANGED','INPUT_UNSAFE','EVIDENCE_NOT_PRIVATE','POSTGRES_IDENTITY_MISMATCH','POSTGRES_NOT_READY','NETWORK_BOUNDARY_MISMATCH','COMPILED_INPUT_MISMATCH','OWNERSHIP_NOT_CONFIRMED','OWNED_PROCESS_FAILED','DISK_BUDGET_NOT_MET','FROZEN_INPUT_CHANGED','GENERATED_FIXTURE_CHANGED','CANDIDATE_BUILD_FAILED'];result.failure=safe.includes(error?.code)?error.code:error?.killed?'TRANSPORT_TIMEOUT':'TARGET_NOT_CONFIRMED';}
 finally{
  for(const name of created.toReversed()){try{await stop(name);}catch{result.passed=false;}}
  const evidence=result.resources.find(r=>r.name===prefix+'-evidence');
  if(evidence){try{const name=prefix+'-export';await create(name,[...base,'--user','1000:1000','--network','none','--mount',`type=volume,source=${evidence.name},target=/evidence,readonly`,'--mount',`type=bind,source=${path.resolve('test/persistent-authorization')},target=/harness,readonly`,images.authorization,'node','/harness/r38/export.mjs']);
   let out;try{out=JSON.parse((await d(['start','-a',name],30000)).stdout);}finally{await stop(name);}if(!out.passed)deny('SAFE_EXPORT_FAILED');result.exportedEvidence=projectDriver(out.evidence);result.safeEvidenceExported=true;
  }catch{result.safeEvidenceExported=false;result.passed=false;}}
  try{result.inputsUnchanged=files&&JSON.stringify(await hashes())===JSON.stringify(result.inputHashes)&&(await invoke('git',['status','--porcelain'])).stdout==='';if(!result.inputsUnchanged)result.passed=false;await disk(false);}catch{result.passed=false;}
  result.cleanupPass=result.cleanup.length>0&&result.cleanup.every(r=>r.stopped&&!r.oomKilled&&(r.exitCode===0||(r.name===prefix+'-targeted'&&r.exitCode===1)));
  const safe=result.exportedEvidence??result.evidence,m=safe?.matrix,e=m?.missingRtEvidence;
  result.normalRefreshControlPass=m?.normalEvidence?.passed===true;result.missingRtDenialPass=m?.passed===true&&e?.postcheckVerified===true;
  result.diagnosticComplete=result.targetedAttempts===1&&result.safeEvidenceExported===true&&result.inputsUnchanged===true&&result.cleanupPass===true&&safe?.explicitMigration===true&&safe?.runtimePrivilegeSeparationPass===true&&safe?.schemaBefore===safe?.schemaAfter&&Array.isArray(safe?.ledgerAfter)&&JSON.stringify(safe.ledgerBefore)===JSON.stringify(safe.ledgerAfter)&&m?.childEvidencePass===true&&m?.protectionVerified===true&&result.normalRefreshControlPass&&e?.deletedRows===1&&Number.isInteger(e?.refresh?.status)&&e?.refreshJsonParsed===true&&(e?.postcheckVerified===true||e?.failureReadback==='PASS');
  result.exactFailureCauseConfirmed=false;
  result.finishedUtc=new Date().toISOString();result.elapsedMonotonicMs=Math.round(performance.now()-began);
  if(directory){try{await writeFile(path.join(directory,'result.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});if(!(await checkWindowsEvidenceAcl(directory,['result.json'])).verified)deny('EVIDENCE_NOT_PRIVATE');result.evidenceSaved=true;result.evidenceDirectory=directory;}catch{result.evidenceSaved=false;result.passed=false;}}
 }
 console.log(JSON.stringify(result));if(!result.passed)process.exitCode=1;return result;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)await main();
