import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,readdir,lstat,cp} from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {sha} from '../r30/inputs.mjs';
import {patchHash,oldPatchHash,originalLockHash,priorLockHash,typeLockHash,verifyTargetDelta,verifiedExit} from './contracts.mjs';
const require=createRequire('/workspace/package.json');
const result={completed:false,lockResolutionAttempts:0,compilerInvocations:0,packagesInstalled:false,patchApplied:false,servicesStarted:false,productionAccessed:false,networkFallback:false,rawOutputSuppressed:true};
let stage='identity';
try{
 assert.equal(process.version,'v24.22.1');
 const envBase={PATH:process.env.PATH,HOME:'/tmp/wepuu-r46-home',TMPDIR:'/tmp',CI:'true',COREPACK_ENABLE_NETWORK:'0'};
 const version=await promisify(execFile)('pnpm',['--version'],{env:envBase,timeout:10000,maxBuffer:4096});
 assert.equal(version.stdout.trim(),'11.19.0');
 assert.equal(sha(await readFile('/workspace/pnpm-lock.yaml')),originalLockHash);
 result.identity={node:process.version,pnpm:'11.19.0',typescript:createRequire('/workspace/package.json')('typescript').version};assert.equal(result.identity.typescript,'5.9.3');
 const yaml=require('/workspace/node_modules/.pnpm/js-yaml@4.3.2/node_modules/js-yaml');
 stage='fixed_preview_inputs';
 const prior=JSON.parse(await readFile('/prior.json','utf8'));
 assert(prior.inputsUnchanged&&prior.evidence.mode==='patch-lock'&&prior.evidence.completed&&prior.cleanup.stopped&&!prior.cleanup.oomKilled);
 assert.equal(prior.image.id,'sha256:ecb2b146182ef5ca756c1b5893ecfbf773bd6bd1b43be275670e54eddfda239c');
 const priorLock=prior.evidence.artifacts['root-pnpm-lock.yaml'];assert.equal(sha(priorLock),priorLockHash);
 const oldParsed=yaml.load(priorLock,{schema:yaml.JSON_SCHEMA});assert.deepEqual(oldParsed.patchedDependencies,{'better-auth@1.7.7':oldPatchHash});
 const patch=await readFile('/harness/r45/preview/better-auth@1.7.7-role-types.patch.preview','utf8');assert.equal(sha(patch),patchHash);
 assert(patch.includes('\\ No newline at end of file'));
 const typeBytes=await readFile('/harness/r45/preview/type-support-pnpm-lock.yaml.preview');assert.equal(sha(typeBytes),typeLockHash);
 const typeParsed=yaml.load(typeBytes.toString('utf8'),{schema:yaml.JSON_SCHEMA});assert.equal(Object.keys(typeParsed.packages).length,6);
 result.inputs={originalLockHash,priorLockHash,patchHash,typeLockHash,typePackageCount:6};
 stage='public_metadata_cache';
 const cache=JSON.parse(await readFile('/cache-manifest.json','utf8'));assert.equal(cache.version,1);assert(cache.files.length>0&&cache.files.length<=400);
 for(const entry of cache.files){
  assert(/^(?:@[a-z0-9_.-]+\/)?[a-z0-9_.-]+\.jsonl$/u.test(entry.file));
  const file='/cache/registry.npmjs.org/'+entry.file,stat=await lstat(file);assert(stat.isFile()&&!stat.isSymbolicLink()&&stat.size<=16777216);
  assert.equal(sha(await readFile(file)),entry.sha256);
 }
 const home='/tmp/wepuu-r46-home',cacheParent=home+'/.cache/pnpm/v11/metadata';
 await mkdir(cacheParent,{recursive:true,mode:0o700});
 await cp('/cache/registry.npmjs.org',cacheParent+'/registry.npmjs.org',{recursive:true,errorOnExist:true,force:false});
 result.cache={files:cache.files.length,manifestSha256:sha(JSON.stringify(cache)),registry:'registry.npmjs.org',source:'OWNED_R45_PUBLIC_METADATA_ONLY'};
 stage='shadow_metadata';
 const root='/tmp/wepuu-r46-shadow';await mkdir(root,{mode:0o700});
 const inputs=JSON.parse(await readFile('/inputs.json','utf8'));
 const selected=inputs.files.filter(f=>f.file==='package.json'||/^(apps|packages)\/[^/]+\/package\.json$/u.test(f.file));
 for(const entry of selected){
  const bytes=await readFile('/workspace/'+entry.file);assert.equal(sha(bytes),entry.sha256);
  await mkdir(path.dirname(root+'/'+entry.file),{recursive:true,mode:0o700});
  await writeFile(root+'/'+entry.file,bytes,{flag:'wx',mode:0o600});
 }
 const workspace=prior.evidence.artifacts['root-pnpm-workspace.yaml'];assert.equal(sha(workspace),'a1c207a09fddb9c5a639e4e3f9757e46a72147b49ad920621e9949534289787c');
 await writeFile(root+'/pnpm-workspace.yaml',workspace,{flag:'wx',mode:0o600});
 await writeFile(root+'/pnpm-lock.yaml',priorLock,{flag:'wx',mode:0o600});
 await mkdir(root+'/patches',{mode:0o700});
 await writeFile(root+'/patches/better-auth@1.7.7-role-types.patch',patch,{flag:'wx',mode:0o600});
 await writeFile(root+'/.npmrc','offline=true\nignore-scripts=true\nstrict-ssl=true\nregistry=https://registry.npmjs.org/\n',{flag:'wx',mode:0o600});
 await writeFile(home+'/empty.npmrc','',{flag:'wx',mode:0o600});
 const env={...envBase,XDG_CACHE_HOME:home+'/.cache',XDG_CONFIG_HOME:home+'/config',PNPM_HOME:home+'/pnpm',
  npm_config_userconfig:home+'/empty.npmrc',npm_config_globalconfig:home+'/empty.npmrc'};
 const args=['install','--lockfile-only','--offline','--ignore-scripts','--ignore-pnpmfile','--no-frozen-lockfile','--fetch-retries=0','--reporter=ndjson','--config.store-dir=/tmp/wepuu-r46-store'];
 stage='single_offline_lock_refresh';result.lockResolutionAttempts=1;
 result.refresh={command:['pnpm',...args],completed:false,exitCode:null,timedOut:false,outputLimitExceeded:false};
 try{
  const r=await promisify(execFile)('pnpm',args,{cwd:root,env,timeout:120000,maxBuffer:1048576});
  Object.assign(result.refresh,{completed:true,exitCode:0,stdoutBytes:Buffer.byteLength(r.stdout),stderrBytes:Buffer.byteLength(r.stderr)});
 }catch(e){
  const text=(typeof e.stdout==='string'?e.stdout:'')+'\n'+(typeof e.stderr==='string'?e.stderr:'');
  Object.assign(result.refresh,{completed:true,exitCode:Number.isSafeInteger(e.code)?e.code:null,timedOut:e.killed===true,outputLimitExceeded:e.code==='ERR_CHILD_PROCESS_STDIO_MAXBUFFER',
    category:text.match(/ERR_PNPM_[A-Z0-9_]+/u)?.[0]??'OFFLINE_REFRESH_FAILED',stdoutBytes:Buffer.byteLength(e.stdout??''),stderrBytes:Buffer.byteLength(e.stderr??'')});
 }
 const lockBytes=await readFile(root+'/pnpm-lock.yaml');result.artifacts={'root-pnpm-lock.yaml':lockBytes.toString('utf8')};
 assert(verifiedExit(result.refresh),'OFFLINE_REFRESH_NOT_CONFIRMED');
 stage='target_only_lock_comparison';
 const original=yaml.load(await readFile('/workspace/pnpm-lock.yaml','utf8'),{schema:yaml.JSON_SCHEMA}),candidate=yaml.load(lockBytes.toString('utf8'),{schema:yaml.JSON_SCHEMA});
 result.comparison=verifyTargetDelta(original,candidate);
 result.lock={sha256:sha(lockBytes),bytes:lockBytes.length,patchedDependencies:candidate.patchedDependencies};
 const entries=await readdir('/workspace/node_modules/.pnpm'),packages=entries.filter(n=>n.startsWith('better-auth@1.7.7'));assert.equal(packages.length,1);
 const declaration=await readFile('/workspace/node_modules/.pnpm/'+packages[0]+'/node_modules/better-auth/dist/plugins/organization/routes/crud-members.d.mts');
 assert.equal(sha(declaration),'13aac5f7f97201416ff8126028f99f0b75f9a7af09f505a1e59c99ed3103c51d');
 result.artifacts['original-declaration']=declaration.toString('utf8');
 let nodeModules=[];try{nodeModules=await readdir(root+'/node_modules');}catch(e){assert.equal(e.code,'ENOENT');}
 assert.equal(nodeModules.length,0);result.noNodeModules=true;result.installedDeclarationUnchanged=true;
 assert.equal(sha(await readFile('/harness/r45/preview/type-support-pnpm-lock.yaml.preview')),typeLockHash);
 result.completed=true;
}catch(e){result.stage=stage;result.category=e.code==='ERR_ASSERTION'?'GATE_NOT_CONFIRMED':e.code==='ENOENT'?'INPUT_NOT_AVAILABLE':'OFFLINE_PREVIEW_NOT_CONFIRMED';}
console.log(JSON.stringify(result));if(!result.completed)process.exitCode=1;
