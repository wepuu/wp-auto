import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, readFile, statfs } from 'node:fs/promises';
import { createHash, randomBytes } from 'node:crypto';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { verifyDiskBudget, verifyIntegrationContext, verifyIntegrationImage, verifyOwnedStopped } from './persistent-image-contract.mjs';
const exec = promisify(execFile), docker = process.env.DOCKER_BIN, context = 'desktop-linux';
const image = 'sha256:1d62d1e7f6646ddbd117505c77fd54f872d1fec20e73ab8c7ece9f2df8c544e2';
const postgres = 'sha256:721873c34ceb9f8d8fc265984940dc982404c105f19ad51be9fdc5970a6080ea';
const buildRevision = '248f9cc6616c3f8a2a143201eb3ac4d3310a3fa6';
const nonce = randomBytes(6).toString('hex'), labels = ['--label','wepuu.phase=p3e2sr4br6','--label',`wepuu.run=${nonce}`];
const names = { network: `wepuu-r6-net-${nonce}`, data: `wepuu-r6-data-${nonce}`, postgres: `wepuu-r6-pg-${nonce}`, test: `wepuu-r6-test-${nonce}` };
const directory = await mkdtemp(join(tmpdir(), 'wepuu-r6-'));
const env = { ...process.env };
for (const key of ['DOCKER_HOST','DOCKER_CONTEXT','DOCKER_TLS_VERIFY','GIT_DIR','GIT_WORK_TREE','GIT_INDEX_FILE']) delete env[key];
const command = async (file,args,timeout=20000) => (await exec(file,args,{env,cwd:process.cwd(),windowsHide:true,timeout,maxBuffer:1000000})).stdout;
const call = args => command(docker,['--context',context,...args]);
const save = (name,value) => writeFile(join(directory,name),JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600});
const startedUtc=new Date().toISOString(), started=performance.now();
let stage='preflight', pgAttempted=false, testAttempted=false, networkCreated=false, dataCreated=false, outcome;
let result={passed:false,productionAccessed:false};
const source=async()=>{
  const head=(await command('git',['rev-parse','HEAD'])).trim();
  assert.equal(head,process.env.WEPUU_R6_REVISION,'SOURCE_REVISION');
  assert.equal((await command('git',['status','--porcelain','--untracked-files=normal'])).trim(),'','SOURCE_CLEAN');
  assert.equal((await command('git',['diff','--name-only',buildRevision,head,'--','apps','packages','package.json','pnpm-lock.yaml',
    'pnpm-workspace.yaml','.npmrc','tsconfig.base.json','tsconfig.json','deploy/Authorization.Containerfile'])).trim(),'','APPLICATION_INPUTS_UNCHANGED');
  return head;
};
async function space(initial=false){const fs=await statfs(process.cwd());return verifyDiskBudget(fs.bavail*fs.bsize,initial);}
try {
  assert(typeof docker==='string'&&/^(?:[A-Z]:[\\/]|\/)/iu.test(docker),'ABSOLUTE_DOCKER');
  if(process.platform==='win32'){
    const user=(await command('whoami',[])).trim();assert(/^[A-Za-z0-9_. -]+\\[A-Za-z0-9_. -]+$/u.test(user));
    await command('icacls',[directory,'/inheritance:r','/grant:r',`${user}:(OI)(CI)F`,'*S-1-5-18:(OI)(CI)F','*S-1-5-32-544:(OI)(CI)F']);
  }
  result.sourceRevision=await source(); result.initialDisk=await space(true);
  verifyIntegrationContext(JSON.parse(await call(['context','inspect',context])),context);
  result.image=verifyIntegrationImage(JSON.parse(await call(['image','inspect',image])),image,'test',buildRevision);
  const pgImage=JSON.parse(await call(['image','inspect',postgres]));assert.equal(pgImage[0].Id,postgres);
  const testPath='packages/database/test/multi-site-provider.test.ts';
  result.testSha256=createHash('sha256').update(await readFile(testPath)).digest('hex');
  const password=randomBytes(32).toString('hex');
  const privateEnv=join(directory,'connection.private.env');
  await writeFile(privateEnv,`POSTGRES_USER=postgres\nPOSTGRES_PASSWORD=${password}\nPOSTGRES_DB=postgres\nWEPUU_TEST_DATABASE_URL=postgresql://postgres:${password}@127.0.0.1:5432/postgres\n`,{flag:'wx',mode:0o600});
  await save('attempt.json',{startedUtc,attempts:1,sourceRevision:result.sourceRevision,image,postgres,names,productionAccessed:false});
  stage='database_setup'; await space();
  await call(['network','create','--internal',...labels,names.network]);networkCreated=true;
  await call(['volume','create',...labels,names.data]);dataCreated=true;
  pgAttempted=true;
  await call(['run','-d','--pull=never','--name',names.postgres,...labels,'--network',names.network,'--env-file',privateEnv,
    '--mount',`type=volume,source=${names.data},target=/var/lib/postgresql/data`,'--log-driver','none',postgres]);
  let ready=false;
  for(let i=0;i<30;i++){try{await call(['exec',names.postgres,'pg_isready','-U','postgres']);ready=true;break;}catch{await new Promise(r=>setTimeout(r,500));}}
  assert(ready,'POSTGRES_READINESS');
  assert(JSON.parse(await call(['network','inspect',names.network]))[0].Internal);
  assert.equal(Object.keys(JSON.parse(await call(['container','inspect',names.postgres]))[0].HostConfig.PortBindings??{}).length,0);
  stage='focused_test';await space();testAttempted=true;
  const args=['--context',context,'run','--pull=never','--name',names.test,...labels,'--network',`container:${names.postgres}`,
    '--read-only','--no-healthcheck','--user','1000:1000','--cap-drop','ALL','--security-opt','no-new-privileges',
    '--tmpfs','/tmp:rw,noexec,nosuid,size=64m','--env-file',privateEnv,'--log-driver','none',
    '--mount',`type=bind,source=${resolve('scripts')},target=/diagnostics,readonly`,'--entrypoint','node',image,
    '--import','tsx','--test','--test-concurrency=1','--test-reporter','/diagnostics/multisite-safe-reporter.mjs',testPath];
  let stdout, failed=false, timedOut=false;
  try{stdout=await command(docker,args,150000);}catch(error){failed=true;timedOut=error.killed===true;stdout=error.stdout;}
  try{outcome=JSON.parse(String(stdout??'').trim());}catch{outcome={passed:false,targetExecuted:false,category:'REPORT_NOT_CONFIRMED'};}
  // Reconstruct only approved fixed schema; no arbitrary fields or child output are exported.
  assert(Array.isArray(outcome.outcomes)||outcome.category==='REPORT_NOT_CONFIRMED');
  result.focused={passed:!failed&&outcome.passed===true,targetExecuted:outcome.targetExecuted===true,
    category:timedOut?'TIMEOUT':failed?'COMMAND_FAILED':outcome.passed===true?'PASS':'NOT_CONFIRMED',
    outcomes:outcome.outcomes??[],additionalFailureObserved:outcome.additionalFailureObserved===true};
  await save('focused-result.json',result.focused);
  result.passed=result.focused.passed;
  if(!result.passed)result.failedStage=stage;
  stage='postflight';result.finalDisk=await space();await source();
  verifyIntegrationImage(JSON.parse(await call(['image','inspect',image])),image,'test',buildRevision);
  assert.equal(createHash('sha256').update(await readFile(testPath)).digest('hex'),result.testSha256);
}catch(error){result.passed=false;result.failedStage=stage;result.category=error.killed?'TIMEOUT':'R6_GATE_STOPPED';}
finally{
  const cleanup=[];
  for(const name of [...(testAttempted?[names.test]:[]),...(pgAttempted?[names.postgres]:[])]){
    try{const m=JSON.parse(await call(['container','inspect',name]))[0];assert.equal(m.Config.Labels['wepuu.run'],nonce);
      if(m.State.Running)await call(['stop','--time','10',name]);verifyOwnedStopped(JSON.parse(await call(['container','inspect',name]))[0],nonce);
      cleanup.push({name,stopped:true});}catch{cleanup.push({name,stopped:false});result.passed=false;}
  }
  result.cleanup=cleanup;result.resourcesRetained={...names,networkCreated,dataCreated};result.evidenceDirectory=directory;
  result.startedUtc=startedUtc;result.finishedUtc=new Date().toISOString();result.elapsedMs=Math.round(performance.now()-started);
  result.automaticRetryPerformed=false;result.imageRebuilt=false;result.productionAccessed=false;result.realEmailSent=false;result.mcpCalled=false;
  await save('result.json',result);
}
console.log(JSON.stringify(result));if(!result.passed)process.exitCode=1;
