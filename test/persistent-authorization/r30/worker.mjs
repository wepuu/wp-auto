import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,realpath} from 'node:fs/promises';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {verifyBaseline,sha} from './inputs.mjs';
import {lockIdentities,packagePath,observeDetailed} from './dependencies.mjs';
import {observe} from '../r29/diagnostics.mjs';
const require=createRequire('/workspace/package.json'),env={PATH:process.env.PATH,TMPDIR:'/tmp',CI:'true',NODE_ENV:'test'};
let stage='runtime',result;const stages=[],directDependencies=[];
try{
 assert.equal(process.version,'v24.22.1');assert.equal(process.release.lts,'Krypton');
 const ts=require('typescript');assert.equal(ts.version,'5.9.3');
 assert.equal((await promisify(execFile)('pnpm',['--version'],{cwd:'/workspace',env,timeout:10000,maxBuffer:1000})).stdout.trim(),'11.19.0');
 const expected=JSON.parse(await readFile('/inputs.json','utf8'));
 stage='complete_input_baseline';const baseline=await verifyBaseline('/workspace',expected);stages.push({stage,...baseline});
 const locked=lockIdentities(await readFile('/workspace/pnpm-lock.yaml','utf8'));assert(locked.size>10,'LOCK_IDENTITIES_REQUIRED');
 stage='dependency_config';
 for(const workspace of ['.',...expected.projects]){
  const file='/workspace/'+(workspace==='.'?'':workspace+'/')+'package.json',pkg=JSON.parse(await readFile(file,'utf8')),req=createRequire(file);
  for(const [name,spec]of Object.entries({...pkg.dependencies,...pkg.devDependencies})){
   if(typeof spec==='string'&&spec.startsWith('workspace:'))continue;
   const row={workspace,package:name,status:'NOT_CONFIRMED'};directDependencies.push(row);
   assert(/^(?:@[a-z0-9_.-]+\/)?[a-z0-9_.-]+$/u.test(name)&&typeof spec==='string'&&/^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$/u.test(spec),'DEPENDENCY_PIN_REQUIRED');
   row.declared=spec;let resolved;
   try{resolved=req.resolve(name+'/package.json');}catch{resolved=req.resolve(name);}
   const real=await realpath(resolved),info=packagePath(real);assert(info&&real.startsWith('/workspace/node_modules/.pnpm/'),'DEPENDENCY_STORE_REQUIRED');
   const actual=JSON.parse(await readFile(info.root+'/package.json','utf8'));
   assert(actual.name===name&&actual.version===spec&&locked.has(name+'@'+spec),'DEPENDENCY_VERSION_MISMATCH');
   row.version=actual.version;row.status='LOCK_VERIFIED';
  }
 }
 stages.push({stage,passed:true,checked:directDependencies.length});
 stage='config_parse';
 const config='/workspace/packages/database/test/tsconfig.json',read=ts.readConfigFile(config,ts.sys.readFile);assert(!read.error,'CONFIG_READ');
 const parsed=ts.parseJsonConfigFileContent(read.config,ts.sys,path.dirname(config),{noEmit:true,pretty:false},config);assert.equal(parsed.errors.length,0,'CONFIG_PARSE');
 const rootFiles=parsed.fileNames.map(f=>path.relative('/workspace',f).replaceAll('\\','/')).sort();
 assert(rootFiles.every(f=>expected.files.some(r=>r.file===f)),'ROOT_FILES_IN_BASELINE');
 const allowed=expected.files.map(f=>f.file),keys=['noEmit','composite','strict','skipLibCheck','noUncheckedIndexedAccess','exactOptionalPropertyTypes','noImplicitOverride','noImplicitReturns','noPropertyAccessFromIndexSignature','useUnknownInCatchVariables','declaration','declarationMap','sourceMap'];
 const options=Object.fromEntries(keys.filter(k=>typeof parsed.options[k]==='boolean').map(k=>[k,parsed.options[k]]));
 options.module=ts.ModuleKind[parsed.options.module];options.moduleResolution=ts.ModuleResolutionKind[parsed.options.moduleResolution];
 assert(options.strict&&options.noEmit&&options.skipLibCheck===false,'STRICT_OPTIONS_UNCHANGED');
 stages.push({stage,passed:true,rootFileCount:rootFiles.length,rootFiles,options,projectReferences:parsed.projectReferences?.length??0});
 stage='prerequisite_build';
 const prep=await observe({executable:'pnpm',args:['build','--pretty','false'],cwd:'/workspace',env,allowed,timeoutMs:120000});
 stages.push({stage,passed:prep.typecheckPass,evidence:prep});assert(prep.typecheckPass,'PREREQUISITE_REQUIRED');
 stage='single_typecheck';
 const check=await observeDetailed({executable:'pnpm',args:['exec','tsc','--project','packages/database/test/tsconfig.json','--noEmit','--pretty','false'],cwd:'/workspace',env,allowed,locked,ts,options:parsed.options,timeoutMs:60000});
 stages.push({stage,passed:check.typecheckPass,evidence:check});
 stage='input_postcheck';const after=await verifyBaseline('/workspace',expected);assert.deepEqual(after,baseline,'BASELINE_UNCHANGED');
 result={passed:check.diagnosticComplete,diagnosticComplete:check.diagnosticComplete,typecheckPass:check.typecheckPass,
  baseline,inputsUnchanged:true,dependencyIdentitiesComplete:check.dependencyIdentitiesComplete,directDependencies,stages,
  runtime:{node:process.version,pnpm:'11.19.0',typescript:ts.version,uid:process.getuid()},typecheckAttempts:1,
  sourcePatchUnchanged:true,servicesStarted:false,databaseAccessed:false,candidateBuilt:false,rawOutputSuppressed:true};
}catch(e){const code=['INVALID_BASELINE','UNSAFE_MANIFEST','MISSING_ROOT_CONFIG','UNSAFE_DIRECTORY','UNSAFE_INPUT','BASELINE_HASH_MISMATCH','EXTRA_OR_MISSING_SOURCE','PROJECT_SET_MISMATCH','UNEXPECTED_SOURCE_DIRECTORY'].includes(e.code)?e.code:undefined;
 const first=String(e.message??'').split('\n')[0],assertion=['LOCK_IDENTITIES_REQUIRED','DEPENDENCY_PIN_REQUIRED','DEPENDENCY_STORE_REQUIRED','DEPENDENCY_VERSION_MISMATCH','CONFIG_READ','CONFIG_PARSE','ROOT_FILES_IN_BASELINE','STRICT_OPTIONS_UNCHANGED','PREREQUISITE_REQUIRED','BASELINE_UNCHANGED'].includes(first)?first:undefined;
 result={passed:false,stage,stages,directDependencies,category:code??'COHERENT_DIAGNOSTIC_NOT_CONFIRMED',...(assertion?{assertion}:{}),
 rawOutputSuppressed:true,servicesStarted:false,databaseAccessed:false,candidateBuilt:false};}
console.log(JSON.stringify(result));if(!result.passed)process.exitCode=1;
