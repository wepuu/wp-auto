import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,readdir,realpath,lstat,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {sha} from '../r30/inputs.mjs';
import {lockIdentities,observeDetailed} from '../r30/dependencies.mjs';
import {declarationContext,expectedDiagnostics} from './diagnostics.mjs';
import {verifyMinimal,verifyGeneric} from './contracts.mjs';
const mode=process.argv[2],require=createRequire('/workspace/package.json');
const output={mode,completed:false,compilerInvocations:0,servicesStarted:false,databaseAccessed:false,productionAccessed:false,dependenciesInstalled:false,rawErrorsSuppressed:true};
let stage='identity';
try {
 assert.equal(process.version,'v24.22.1');assert.equal(process.release.lts,'Krypton');
 const ts=require('typescript');assert.equal(ts.version,'5.9.3');
 const lock=await readFile('/workspace/pnpm-lock.yaml');
 assert.equal(sha(lock),'cea3bc64773f878a668cabeb9d366086f69ad2c6921e5095ed6d49292bddad87');
 const locked=lockIdentities(lock.toString('utf8'));
 output.runtime={node:process.version,typescript:ts.version,lockSha256:sha(lock)};
 stage='declaration_metadata';
 const requests=[
 {name:'@better-auth/core',version:'1.7.7',file:'dist/types/init-options.d.mts',line:16,column:26,hash:'d4f9d2f16a86638724a5c84698ca32262dc461ac39d70422f582aadd28119863'},
 {name:'better-auth',version:'1.7.7',file:'dist/plugins/organization/routes/crud-members.d.mts',line:1012,column:9,hash:'13aac5f7f97201416ff8126028f99f0b75f9a7af09f505a1e59c99ed3103c51d'},
 {name:'resend',version:'6.32.1',file:'dist/index.d.mts',line:1,column:26,hash:'fa1e12dbd8a5aba9905ffdfcb597682882fb15244b3956276c91299e75bb2355'}
 ];
 const entries=await readdir('/workspace/node_modules/.pnpm');
 output.declarations=[];
 for(const r of requests){
   output.currentPackage=r.name;stage='lock_identity';
   assert(locked.has(r.name+'@'+r.version));
   const prefix=r.name.replaceAll('/','+')+'@'+r.version;
   const candidates=entries.filter(n=>n.startsWith(prefix));
   output.discovery={prefix,candidateCount:candidates.length};
   const variants=[];
   for(const name of candidates){
     const root='/workspace/node_modules/.pnpm/'+name+'/node_modules/'+r.name;
     let stat;try {stat=await lstat(root+'/package.json');}catch{continue;}
     stage='metadata_file_gate';assert(stat.isFile()&&!stat.isSymbolicLink()&&stat.size<262144);
     const metaBytes=await readFile(root+'/package.json'),meta=JSON.parse(metaBytes);
     if(meta.name!==r.name||meta.version!==r.version)continue;
     const bytes=await readFile(root+'/'+r.file);
     if(sha(bytes)!==r.hash)continue;
     const file=await realpath(root+'/'+r.file);
     stage='declaration_file_gate';assert(file.startsWith('/workspace/node_modules/.pnpm/'));
     stage='declaration_ast';
     const context=declarationContext(ts,bytes.toString('utf8'),file,r.line,r.column);
     const options={module:ts.ModuleKind.NodeNext,moduleResolution:ts.ModuleResolutionKind.NodeNext,target:ts.ScriptTarget.ES2024,strict:true,skipLibCheck:false};
     const resolved=context.module?ts.resolveModuleName(context.module,file,options,ts.sys).resolvedModule:undefined;
     variants.push({root:root.slice(11),packageJsonSha256:sha(metaBytes),fileSha256:sha(bytes),...context,
       ...(context.module?{moduleResolved:resolved!==undefined,resolvedFile:resolved?.resolvedFileName?.replace('/workspace/','')??null}:{}),
       dependencies:meta.dependencies??{},peerDependencies:meta.peerDependencies??{},peerDependenciesMeta:meta.peerDependenciesMeta??{},
       devTypeDependencies:Object.fromEntries(Object.entries(meta.devDependencies??{}).filter(([k])=>['@types/bun','bun-types','@types/react','@types/node','typescript'].includes(k)))});
   }
   output.declarations.push({...r,candidateCount:candidates.length,variants});
   stage='variant_coverage';assert(variants.length>0);
 }
 if(mode==='minimal'){
  stage='minimal_fixture';
  const root='/workspace/.tmp/r44';
  await mkdir(root,{recursive:true,mode:0o700});
  const fixtures=[];
  for(const r of output.declarations){
    const name=r.name==='@better-auth/core'?'core':r.name==='better-auth'?'organization':'resend';
    const module='/workspace/'+r.variants[0].root+'/'+r.file.replace(/\.d\.mts$/u,'.mjs');
    const text='import '+JSON.stringify(module)+';\nexport {};\n',file=root+'/'+name+'.mts';
    await writeFile(file,text,{flag:'wx',mode:0o600});
    fixtures.push({file:file.slice(11),sha256:sha(text)});
  }
  const config={extends:'/workspace/tsconfig.base.json',compilerOptions:{noEmit:true,composite:false,lib:['ES2024','DOM','DOM.Iterable']},files:fixtures.map(f=>'/workspace/'+f.file)};
  await writeFile(root+'/tsconfig.json',JSON.stringify(config),{flag:'wx',mode:0o600});
  const parsed=ts.parseJsonConfigFileContent(config,ts.sys,root,{},root+'/tsconfig.json');assert.equal(parsed.errors.length,0);
  assert.equal(parsed.options.strict,true);assert.equal(parsed.options.skipLibCheck,false);
  stage='minimal_compiler';output.compilerInvocations=1;
  const checked=await observeDetailed({executable:'pnpm',args:['exec','tsc','--project','.tmp/r44/tsconfig.json','--noEmit','--pretty','false'],cwd:'/workspace',
    env:{PATH:process.env.PATH,TMPDIR:'/tmp',CI:'true'},allowed:fixtures.map(f=>f.file),locked,ts,options:parsed.options,timeoutMs:60000});
  output.minimal={fixtures,config,configSha256:sha(JSON.stringify(config)),...checked,counts:expectedDiagnostics(checked.dependencyDiagnostics)};
  assert(checked.diagnosticComplete&&checked.dependencyIdentitiesComplete&&!checked.process.timedOut&&!checked.process.outputLimitExceeded);
  output.minimal.verification=verifyMinimal(output.minimal);
 }
 if(mode==='generic'){
   stage='generic_fixture';const root='/workspace/.tmp/r44';
   await mkdir(root,{recursive:true,mode:0o700});
   const files=[];
   for(const name of ['generic-negative.mts','generic-positive.mts']){
     const bytes=await readFile('/harness/r44/'+name),file=root+'/'+name;
     await writeFile(file,bytes,{flag:'wx',mode:0o600});files.push({file:file.slice(11),sha256:sha(bytes)});
   }
   const config={extends:'/workspace/tsconfig.base.json',compilerOptions:{noEmit:true,composite:false,types:[]},files:files.map(f=>'/workspace/'+f.file)};
   await writeFile(root+'/generic.json',JSON.stringify(config),{flag:'wx',mode:0o600});
   const parsed=ts.parseJsonConfigFileContent(config,ts.sys,root,{},root+'/generic.json');assert.equal(parsed.errors.length,0);
   assert.equal(parsed.options.strict,true);assert.equal(parsed.options.skipLibCheck,false);
   stage='generic_compiler';output.compilerInvocations=1;
   const checked=await observeDetailed({executable:'pnpm',args:['exec','tsc','--project','.tmp/r44/generic.json','--noEmit','--pretty','false'],cwd:'/workspace',
     env:{PATH:process.env.PATH,TMPDIR:'/tmp',CI:'true'},allowed:files.map(f=>f.file),locked,ts,options:parsed.options,timeoutMs:60000});
   output.generic={files,config,configSha256:sha(JSON.stringify(config)),...checked};
   assert(checked.diagnosticComplete&&!checked.process.timedOut&&!checked.process.outputLimitExceeded);
   output.generic.expectedSingleTS2536=checked.process.exitCode===2 && checked.diagnostics.length===1
     && checked.diagnostics[0].code==='TS2536' && checked.diagnostics[0].count===1
     && checked.diagnostics[0].file==='.tmp/r44/generic-negative.mts';
   assert(output.generic.expectedSingleTS2536);
   output.generic.verification=verifyGeneric(output.generic);
 }
 output.completed=true;
}catch(e){output.stage=stage;output.category=['LINE_RANGE','PUBLIC_MODULE_SYNTAX'].includes(e.message)?e.message:e.code==='ERR_ASSERTION'?'INPUT_OR_SCHEMA_REJECTED':'METADATA_NOT_CONFIRMED';}
console.log(JSON.stringify(output));if(!output.completed)process.exitCode=1;
