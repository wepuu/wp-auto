import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,realpath} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
export const expectedTests=Object.freeze(['account-auth-link','account-login-transaction','account-workspace','authorization-consume-mapping','console-auth',
 'deletion-lifecycle','grant-reconsent','local-signing-lifecycle','migration-profile','multi-site-provider','oauth-client-callback','otp-send-budget',
 'pairing-diagnostics','persistent-readonly','refresh-find-mapping','secret-artifact','tenant-isolation','tenant-provider-http'].map(n=>n+'.test.ts').sort());
export const declarations=Object.freeze({
 'better-auth/dist/plugins/organization/routes/crud-members.d.mts':'7d630c56ab1dcd4e575772d12e50345ed0b69b3684da5fbc66628a67f2242343',
 'bun-types/globals.d.ts':'c0c045ca0430b373e889575b5990aab3eddc23f5a8f8766cafbb6c8cec567b67',
 'bun-types/overrides.d.ts':'6da206fe98e896b8dbe664a39005d54af7bc468ecf7f4d7ed70008e887b7e5fb'});
export function verifyOptions(ts,o){
 assert.equal(o.noEmit,true);assert.equal(o.skipLibCheck,false);assert.equal(o.composite,false);
 assert.equal(o.module,ts.ModuleKind.NodeNext);assert.equal(o.moduleResolution,ts.ModuleResolutionKind.NodeNext);
 assert.deepEqual(o.types,['node','bun','react']);
 for(const k of ['strict','noUncheckedIndexedAccess','exactOptionalPropertyTypes','noImplicitOverride','noFallthroughCasesInSwitch','noImplicitReturns',
 'noPropertyAccessFromIndexSignature','useUnknownInCatchVariables','verbatimModuleSyntax','isolatedModules','forceConsistentCasingInFileNames'])assert.equal(o[k],true);
}
export function verifyInventory(files){assert.deepEqual(files.map(f=>path.basename(f)).sort(),expectedTests);}
export function verifyProgramRoots(root,files,api=path){
  for(const file of files){const relative=api.relative(api.resolve(root),api.resolve(file));
    assert(relative!=='..'&&!relative.startsWith('..'+api.sep)&&!api.isAbsolute(relative),'FOREIGN_PROGRAM_SOURCE');}
}
export function safeRows(ts,diagnostics,root){return diagnostics.slice(0,100).map(d=>{
 const row={code:d.code,severity:d.category===ts.DiagnosticCategory.Error?'error':'other'};
 if(d.file){const r=path.relative(root,d.file.fileName).replaceAll('\\','/');
  if(!r.startsWith('../')&&!path.isAbsolute(r)&&/^(apps|packages)\/[a-z0-9-]+\/(?:src|test)\/[A-Za-z0-9_./-]+\.(?:ts|mts|json)$/u.test(r))row.file=r;
  else row.kind=d.file.fileName.includes('node_modules')?'DEPENDENCY_DECLARATION':'UNKNOWN';
  if(d.start!=null){const p=d.file.getLineAndCharacterOfPosition(d.start);row.line=p.line+1;row.column=p.character+1;}}
 return row;});}
export async function run(root,load=()=>createRequire(path.join(root,'package.json'))('typescript')){
 const result={passed:false,rawOutputSuppressed:true,noEmit:true};let stage='runtime_and_dependency';
 try{
  assert.equal(process.versions.node.split('.')[0],'24');const ts=load();assert.equal(ts.version,'5.9.3');
  stage='strict_configuration';const config=path.join(root,'packages/database/test/tsconfig.json');
  const input=ts.readConfigFile(config,ts.sys.readFile);assert(!input.error);
  const parsed=ts.parseJsonConfigFileContent(input.config,ts.sys,path.dirname(config),undefined,config);assert.equal(parsed.errors.length,0);verifyOptions(ts,parsed.options);
  stage='complete_test_inventory';const tests=parsed.fileNames.filter(f=>f.endsWith('.test.ts'));verifyInventory(tests);
  assert.deepEqual(tests.map(f=>path.resolve(f)).sort(),expectedTests.map(n=>path.join(root,'packages/database/test',n)).sort());
  stage='actual_declaration_resolution';const program=ts.createProgram(parsed.fileNames,parsed.options);
  const sources=program.getSourceFiles();verifyProgramRoots(root,sources.map(f=>f.fileName));
  result.loadedAmbientTypes=Object.fromEntries(['node','bun','react'].map(n=>[n,sources.some(f=>f.fileName.replaceAll('\\','/').includes('/node_modules/@types/'+n+'/'))]));
  assert(Object.values(result.loadedAmbientTypes).every(Boolean));result.actualDeclarations=[];
  for(const [suffix,hash]of Object.entries(declarations)){
   const selected=sources.filter(f=>f.fileName.replaceAll('\\','/').endsWith('/'+suffix));assert.equal(selected.length,1);
   const actual=await realpath(selected[0].fileName),relative=path.relative(root,actual);assert(!relative.startsWith('..')&&!path.isAbsolute(relative));
   assert.equal(createHash('sha256').update(await readFile(actual)).digest('hex'),hash);result.actualDeclarations.push({file:suffix,sha256:hash,used:true});
  }
  stage='complete_program_diagnostics';const ds=ts.getPreEmitDiagnostics(program);
  result.errorCount=ds.filter(d=>d.category===ts.DiagnosticCategory.Error).length;result.diagnostics=safeRows(ts,ds,root);result.truncated=ds.length>100;
  result.observedTestFiles=tests.length;result.rootFiles=parsed.fileNames.length;result.programFiles=sources.length;
  result.passed=result.errorCount===0&&!result.truncated;result.category=result.passed?'FULL_STRICT_TEST_TYPECHECK_PASS':'TYPESCRIPT_DIAGNOSTICS';
 }catch{result.category='TYPECHECK_INPUT_OR_INTERNAL_FAILURE';result.failureStage=stage;}
 return result;
}
