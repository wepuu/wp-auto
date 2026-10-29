import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {observe,safeLocation} from './diagnostics.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex'),require=createRequire('/workspace/package.json');
const env={PATH:process.env.PATH,TMPDIR:'/tmp',CI:'true',NODE_ENV:'test'};
let stage='runtime',result;const stages=[];
try{
 assert.equal(process.version,'v24.22.1');assert.equal(process.release.lts,'Krypton');
 const ts=require('typescript'),compiler=require.resolve('typescript/lib/tsc.js');assert.equal(ts.version,'5.9.3');
 const pnpm=await promisify(execFile)('pnpm',['--version'],{cwd:'/workspace',env,timeout:10000,maxBuffer:1000});
 assert.equal(pnpm.stdout.trim(),'11.19.0','PNPM_VERSION_REQUIRED');
 const pkg=JSON.parse(await readFile('/workspace/package.json','utf8'));assert.equal(pkg.packageManager,'pnpm@11.19.0');
 const loader='/workspace/node_modules/.pnpm/tsx@4.23.13/node_modules/tsx/dist/loader.mjs';
 assert.equal(hash(await readFile(loader)),'7e3dba3b9b862a5fa1c741d54fc921ee8b17fc7a4d0087fa64e42a32142cf03d');
 const fixed=JSON.parse(await readFile('/inputs.json','utf8'));
 for(const [file,expected]of Object.entries(fixed)){assert.equal(hash(await readFile('/workspace/'+file)),expected,'R28_INPUT_MISMATCH');}
 stage='config_parse';
 const config='/workspace/packages/database/test/tsconfig.json',read=ts.readConfigFile(config,ts.sys.readFile);
 if(read.error)throw Error('CONFIG_READ_DIAGNOSTIC');
 const parsed=ts.parseJsonConfigFileContent(read.config,ts.sys,path.dirname(config),{noEmit:true,pretty:false},config);
 const names=parsed.fileNames.map(f=>path.relative('/workspace',f).replaceAll('\\','/')).sort();
 assert(names.every(f=>/^packages\/[a-z0-9-]+\/(src|test)\/[A-Za-z0-9_./-]+\.tsx?$/u.test(f)&&!f.split('/').includes('..')),'PROJECT_PATHS_REQUIRED');
 const allowed=[...names,'packages/database/test/tsconfig.json','tsconfig.base.json'];
 const selectedKeys=['noEmit','composite','strict','noUncheckedIndexedAccess','exactOptionalPropertyTypes','noImplicitOverride','noImplicitReturns','noPropertyAccessFromIndexSignature','useUnknownInCatchVariables','skipLibCheck','declaration','declarationMap','sourceMap'];
 const options=Object.fromEntries(selectedKeys.filter(k=>typeof parsed.options[k]==='boolean').map(k=>[k,parsed.options[k]]));
 options.module=ts.ModuleKind[parsed.options.module];options.moduleResolution=ts.ModuleResolutionKind[parsed.options.moduleResolution];
 const manifest=[];for(const file of names)manifest.push({file,...safeLocation(file,allowed),sha256:hash(await readFile('/workspace/'+file))});
 const configErrors=parsed.errors.map(e=>({code:'TS'+e.code,category:e.category===ts.DiagnosticCategory.Error?'error':'other',
  ...(e.file?{...safeLocation(e.file.fileName,allowed),...(e.start!==undefined?{line:e.file.getLineAndCharacterOfPosition(e.start).line+1}: {})}:{kind:'GLOBAL'})}));
 const summary={rootFileCount:names.length,mappingTestIncluded:names.includes('packages/database/test/authorization-consume-mapping.test.ts'),
  sourceIncluded:names.includes('packages/database/src/index.ts'),options,projectReferenceCount:parsed.projectReferences?.length??0,
  configErrors,manifest};
 assert(summary.mappingTestIncluded&&summary.sourceIncluded,'PROJECT_SCOPE_REQUIRED');
 stages.push({stage,passed:configErrors.length===0,...summary});
 if(configErrors.length)throw Error('CONFIG_PARSE_DIAGNOSTICS');
 stage='prerequisite_build';
 const preparation=await observe({executable:'pnpm',args:['build','--pretty','false'],cwd:'/workspace',env,allowed,timeoutMs:120000});
 stages.push({stage,passed:preparation.typecheckPass,evidence:preparation});if(!preparation.typecheckPass)throw Error('PREREQUISITE_FAILED');
 stage='single_typecheck';
 const check=await observe({executable:'pnpm',args:['exec','tsc','--project','packages/database/test/tsconfig.json','--noEmit','--pretty','false'],cwd:'/workspace',env,allowed,timeoutMs:60000});
 stages.push({stage,passed:check.typecheckPass,evidence:check});
 const codes=check.diagnostics.filter(d=>d.severity==='error').map(d=>d.code);
 result={passed:check.diagnosticComplete,diagnosticComplete:check.diagnosticComplete,typecheckPass:check.typecheckPass,stage,stages,
  failureClass:check.category,compilerErrorCodes:[...new Set(codes)],
  runtime:{node:process.version,pnpm:'11.19.0',typescript:ts.version,compilerKind:'PROJECT_LOCAL_TSC',compilerSha256:hash(await readFile(compiler)),uid:process.getuid()},
  typecheckAttempts:1,sourcePatchUnchanged:true,servicesStarted:false,databaseAccessed:false,rawOutputSuppressed:true};
}catch(error){result={passed:false,stage,stages,category:['R28_INPUT_MISMATCH','PROJECT_SCOPE_REQUIRED','CONFIG_READ_DIAGNOSTIC','CONFIG_PARSE_DIAGNOSTICS','PREREQUISITE_FAILED'].includes(error?.message)?error.message:'DIAGNOSTIC_SETUP_NOT_CONFIRMED',rawOutputSuppressed:true,servicesStarted:false,databaseAccessed:false};}
console.log(JSON.stringify(result));if(!result.passed)process.exitCode=1;
