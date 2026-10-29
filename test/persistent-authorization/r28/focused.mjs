// Offline source overlay test; no service main, sockets or database connection.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {runReportedProcess} from '../r10/reported-process.mjs';
const files=['packages/database/test/authorization-consume-mapping.test.ts','packages/oauth-provider/test/resource-grant.test.ts'];
const stages=[];let stage='runtime',result;
const exec=promisify(execFile),env={PATH:process.env.PATH,TMPDIR:'/tmp',CI:'true',NODE_ENV:'test'};
async function command(args,timeout){try{await exec('pnpm',args,{cwd:'/workspace',env,timeout,maxBuffer:262144});stages.push({stage,passed:true});}
 catch(e){
  const diagnostics=[];for(const line of String(e.stdout??'').split(/\r?\n/u)){
   const m=line.match(/^(packages\/database\/(?:test\/authorization-consume-mapping\.test|src\/index)\.ts)\((\d+),\d+\): error (TS\d+):/u);
   if(m&&diagnostics.length<20)diagnostics.push({file:m[1],line:Number(m[2]),code:m[3]});
  }
  stages.push({stage,passed:false,category:e.killed?'TIMEOUT':'COMMAND_FAILED',diagnostics});throw Error('FOCUSED_STAGE_FAILED');
 }}
try{
 assert.equal(process.version,'v24.22.1');assert.equal(process.release.lts,'Krypton');
 assert.equal((await exec('pnpm',['--version'],{env,timeout:10000})).stdout.trim(),'11.19.0');
 const loader='/workspace/node_modules/.pnpm/tsx@4.23.13/node_modules/tsx/dist/loader.mjs';
 assert.equal(createHash('sha256').update(await readFile(loader)).digest('hex'),'7e3dba3b9b862a5fa1c741d54fc921ee8b17fc7a4d0087fa64e42a32142cf03d');
 stage='source_typecheck_build';await command(['build','--pretty','false'],120000);
 stage='test_typecheck';await command(['exec','tsc','--project','packages/database/test/tsconfig.json','--noEmit','--pretty','false'],60000);
 stage='focused_lint';await command(['exec','eslint','packages/database/src/index.ts',files[0]],60000);
 stage='focused_tests';
 const report=await runReportedProcess({executable:process.execPath,args:['--import='+loader,'--test','--test-concurrency=1'],
  config:{files,phase:'unit',expectedTopLevel:{[files[0]]:19}},reporter:'/harness/r10/reporter.mjs',cwd:'/workspace',env,timeoutMs:90000});
 assert(report.passed&&report.report?.skips.length===0,'FOCUSED_TESTS_REQUIRED');
 result={passed:true,stages,tests:report,version:process.version,pnpm:'11.19.0',uid:process.getuid(),servicesStarted:false,databaseAccessed:false,dependenciesInstalled:false,rawOutputSuppressed:true};
}catch{result={passed:false,stage,stages,category:'FOCUSED_NOT_CONFIRMED',rawOutputSuppressed:true,servicesStarted:false,databaseAccessed:false};}
console.log(JSON.stringify(result));if(!result.passed)process.exitCode=1;
