import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,readdir} from 'node:fs/promises';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {verifyBaseline,sha} from '../r30/inputs.mjs';
import {observe} from '../r29/diagnostics.mjs';
import {lintProjection} from '../r31/results.mjs';
import {allPass} from './results.mjs';
import {testsPass} from '../r39/results.mjs';
import {observeDetailed,lockIdentities} from '../r30/dependencies.mjs';
const require=createRequire('/workspace/package.json'), env={PATH:process.env.PATH,TMPDIR:'/tmp',CI:'true',NODE_ENV:'test'};
const targets=['packages/database/src/index.ts','packages/database/test/authorization-consume-mapping.test.ts','packages/database/test/refresh-find-mapping.test.ts'];
const lintTargets=[...targets,'packages/database/test/multi-site-provider.test.ts','packages/database/test/otp-send-budget.test.ts','packages/database/test/tenant-provider-http.test.ts'];
const stages=[];let stage='runtime',expected,baseline,result;
const add=(name,passed,evidence)=>{stages.push({stage:name,passed,evidence});assert(passed,'STAGE_REJECTED');};
async function bounded(args, timeout=60000) {
 try {const r=await promisify(execFile)('pnpm',args,{cwd:'/workspace',env,timeout,maxBuffer:262144});return {normal:true,exitCode:0,stdout:r.stdout,stderrBytes:Buffer.byteLength(r.stderr)};}
 catch(e){return {normal:!e.killed && e.signal == null && Number.isSafeInteger(e.code),exitCode:Number.isSafeInteger(e.code)?e.code:null,
  stdout:typeof e.stdout==='string'?e.stdout:'',stderrBytes:Buffer.byteLength(e.stderr??''),category:e.killed?'TIMEOUT':e.code==='ERR_CHILD_PROCESS_STDIO_MAXBUFFER'?'OUTPUT_LIMIT':'COMMAND_FAILED'};}
}
try {
 assert.equal(process.version,'v24.22.1');assert.equal(process.release.lts,'Krypton');
 const ts=require('typescript');assert.equal(ts.version,'5.9.3');
 const pnpm=await bounded(['--version'],10000);assert(pnpm.normal&&pnpm.exitCode===0&&pnpm.stdout.trim()==='11.19.0');
 add(stage,true,{node:process.version,pnpm:'11.19.0',typescript:ts.version,uid:process.getuid()});
 stage='input_baseline';expected=JSON.parse(await readFile('/inputs.json','utf8'));baseline=await verifyBaseline('/workspace',expected);add(stage,true,baseline);
 // Image and host package/lock metadata have exact hashes, checked by baseline.
 stage='config_parse';const config='/workspace/packages/database/test/tsconfig.refresh-find-mapping.json';
 const read=ts.readConfigFile(config,ts.sys.readFile);assert(!read.error);
 const parsed=ts.parseJsonConfigFileContent(read.config,ts.sys,path.dirname(config),{noEmit:true,pretty:false},config);assert.equal(parsed.errors.length,0);
 assert.deepEqual(parsed.fileNames,targets.slice(1).map(f=>'/workspace/'+f));assert.equal(parsed.projectReferences?.length??0,0);
 const keys=['strict','noUncheckedIndexedAccess','exactOptionalPropertyTypes','noImplicitOverride','noFallthroughCasesInSwitch','noImplicitReturns','noPropertyAccessFromIndexSignature','useUnknownInCatchVariables','verbatimModuleSyntax','isolatedModules','forceConsistentCasingInFileNames'];
 assert(keys.every(k=>parsed.options[k]===true));assert(parsed.options.noEmit===true&&parsed.options.composite===false&&parsed.options.skipLibCheck===false);
 assert.deepEqual(parsed.options.lib,['lib.es2024.d.ts','lib.dom.d.ts','lib.dom.iterable.d.ts']);assert.equal(parsed.options.module,ts.ModuleKind.NodeNext);assert.equal(parsed.options.moduleResolution,ts.ModuleResolutionKind.NodeNext);
 add(stage,true,{rootFiles:targets.slice(1),strictFlags:Object.fromEntries(keys.map(k=>[k,true])),noEmit:true,skipLibCheck:false,lib:parsed.options.lib});
 const allowed=expected.files.map(f=>f.file);
 stage='prerequisite_build';const prep=await observe({executable:'pnpm',args:['build','--pretty','false'],cwd:'/workspace',env,allowed,timeoutMs:120000});add(stage,prep.typecheckPass,prep);
 // Record the complete actual transitive program, including declaration files.
 stage='focused_program';const program=ts.createProgram(parsed.fileNames,parsed.options);
 const files=program.getSourceFiles().map(f=>f.fileName);
 assert(files.every(f=>f.startsWith('/workspace/')&&!f.split('/').includes('..')));
 assert(!files.some(f=>f.endsWith('.ts')&&!f.endsWith('.d.ts')&&!f.endsWith('.d.mts')&&f.includes('/test/')&&!targets.slice(1).some(t=>f==='/workspace/'+t)));
 stages.push({stage,passed:true,evidence:{sourceFiles:files.map(f=>f.slice(11)).sort(),fileCount:files.length}});
 stage='declaration_typecheck';
 const declarations=await observe({executable:'pnpm',args:['exec','tsc','--project','packages/database/test/tsconfig.r43-helper-types.json','--noEmit','--pretty','false'],cwd:'/workspace',env,allowed,timeoutMs:60000});
 stages.push({stage,passed:declarations.typecheckPass,evidence:declarations});
 stage='full_database_test_typecheck';
 const fullConfig='/workspace/packages/database/test/tsconfig.json';
 const fullRead=ts.readConfigFile(fullConfig,ts.sys.readFile);assert(!fullRead.error);
 const fullParsed=ts.parseJsonConfigFileContent(fullRead.config,ts.sys,path.dirname(fullConfig),{noEmit:true,pretty:false},fullConfig);
 assert.equal(fullParsed.errors.length,0);assert.equal(fullParsed.options.skipLibCheck,false);
 const full=await observeDetailed({executable:'pnpm',args:['exec','tsc','--project','packages/database/test/tsconfig.json','--noEmit','--pretty','false'],cwd:'/workspace',env,allowed,locked:lockIdentities(await readFile('/workspace/pnpm-lock.yaml','utf8')),ts,options:fullParsed.options,timeoutMs:60000});
 const modules=[];
 for (const diagnostic of full.dependencyDiagnostics.filter(d=>d.identity==='LOCK_VERIFIED'&&d.code==='TS2307')) {
  const prefix=diagnostic.package.replace('/','+')+'@'+diagnostic.version;
  const dirs=(await readdir('/workspace/node_modules/.pnpm')).filter(n=>n===prefix||n.startsWith(prefix+'(')||n.startsWith(prefix+'_'));
  let root,bytes;
  for (const dir of dirs) {
   const candidate='/workspace/node_modules/.pnpm/'+dir+'/node_modules/'+diagnostic.package;
   const value=await readFile(candidate+'/'+diagnostic.file);
   if(sha(value)===diagnostic.fileSha256 && sha(await readFile(candidate+'/package.json'))===diagnostic.packageJsonSha256) {root=candidate;bytes=value;break;}
  }
  if(!root||!bytes)continue;
  const line=bytes.toString('utf8').split(/\r?\n/u)[diagnostic.line-1];
  const module=line?.match(/["']([@a-zA-Z0-9_./-]+)["']/u)?.[1];
  if(module)modules.push({package:diagnostic.package,module,resolved:ts.resolveModuleName(module,root+'/'+diagnostic.file,fullParsed.options,ts.sys).resolvedModule!==undefined});
 }
 stages.push({stage,passed:full.typecheckPass,evidence:{...full,publicImportModules:modules,command:['pnpm','exec','tsc','--project','packages/database/test/tsconfig.json','--noEmit','--pretty','false'],skipLibCheck:false,lib:fullParsed.options.lib}});
 stage='focused_typecheck';const check=await observe({executable:'pnpm',args:['exec','tsc','--project','packages/database/test/tsconfig.refresh-find-mapping.json','--noEmit','--pretty','false'],cwd:'/workspace',env,allowed,timeoutMs:60000});add(stage,check.typecheckPass,check);
 stage='targeted_lint';const lint=await bounded(['exec','eslint',...lintTargets,'--format','json','--max-warnings','0']);
 let lintSafe;try {lintSafe=lintProjection(JSON.parse(lint.stdout),lintTargets);}catch {lintSafe={passed:false,category:'LINT_RESULT_NOT_CONFIRMED'};}
 add(stage,lint.normal&&lint.exitCode===0&&lint.stderrBytes===0&&lintSafe.passed,{normal:lint.normal,exitCode:lint.exitCode,stderrBytes:lint.stderrBytes,...lintSafe});
 stage='mapping_tests';const test=await bounded(['exec','tsx','--test','--test-concurrency=1','--test-reporter=/harness/r31/reporter.mjs',...targets.slice(1)]);
 let testSafe;try {const r=JSON.parse(test.stdout);testSafe={passed:testsPass(r),counts:r};}catch {testSafe={passed:false,category:'TEST_RESULT_NOT_CONFIRMED'};}
 add(stage,test.normal&&test.exitCode===0&&test.stderrBytes===0&&testSafe.passed,{normal:test.normal,exitCode:test.exitCode,stderrBytes:test.stderrBytes,...testSafe});
 stage='input_postcheck';assert.deepEqual(await verifyBaseline('/workspace',expected),baseline);add(stage,true,{unchanged:true});
 result={passed:allPass(stages),stages};
} catch {result={passed:false,stage,category:'FOCUSED_STAGE_FAILED_OR_NOT_CONFIRMED',stages};}
finally {if(expected&&baseline)try {const same=JSON.stringify(await verifyBaseline('/workspace',expected))===JSON.stringify(baseline);result.inputsUnchanged=same;if(!same)result.passed=false;}catch {result.inputsUnchanged=false;result.passed=false;}}
console.log(JSON.stringify({...result,rawOutputSuppressed:true,servicesStarted:false,databaseAccessed:false,productionAccessed:false,candidateBuilt:false}));
if(!result.passed)process.exitCode=1;
